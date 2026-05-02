use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};

use anyhow::{Result, anyhow};
use serde::Deserialize;
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

use crate::download_service::DownloadService;

static BRIDGE_RATE_BUCKETS: LazyLock<Mutex<HashMap<String, VecDeque<Instant>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(10);
const RATE_LIMIT_ADD: usize = 40;
const RATE_LIMIT_HEALTH: usize = 80;
const MAX_BODY_ADD: usize = 256 * 1024;
const MAX_BODY_HEALTH: usize = 8 * 1024;

#[derive(Debug, Clone)]
pub struct BrowserBridgeConfig {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Deserialize)]
struct BridgeAddRequest {
    url: String,
    save_dir: Option<String>,
    referer: Option<String>,
    user_agent: Option<String>,
    headers: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
struct LocalApiAddRequest {
    url: Option<String>,
    magnet: Option<String>,
    save_dir: Option<String>,
    category: Option<String>,
    referer: Option<String>,
    user_agent: Option<String>,
    headers: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
struct LocalApiTaskActionRequest {
    action: String,
    delete_files: Option<bool>,
    category: Option<String>,
}

pub fn start_browser_bridge(service: Arc<DownloadService>, cfg: BrowserBridgeConfig) {
    if !cfg.enabled {
        return;
    }
    tokio::spawn(async move {
        if let Err(err) = run_browser_bridge(service, cfg).await {
            eprintln!("[browser-bridge] failed: {err}");
        }
    });
}

async fn run_browser_bridge(service: Arc<DownloadService>, cfg: BrowserBridgeConfig) -> Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", cfg.port)).await?;
    loop {
        let (stream, _) = listener.accept().await?;
        let service = service.clone();
        let token = cfg.token.clone();
        tokio::spawn(async move {
            let _ = handle_connection(stream, service, &token).await;
        });
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    service: Arc<DownloadService>,
    default_token: &str,
) -> Result<()> {
    let mut raw = Vec::with_capacity(4096);
    let mut tmp = [0_u8; 2048];
    let mut header_end = None;
    loop {
        let n = stream.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&tmp[..n]);
        header_end = find_bytes(&raw, b"\r\n\r\n").or_else(|| find_bytes(&raw, b"\n\n"));
        if header_end.is_some() || raw.len() > 256 * 1024 {
            break;
        }
    }
    let Some(header_end_idx) = header_end else {
        return Err(anyhow!("invalid http request"));
    };
    let (headers_raw, body_offset) = if raw
        .get(header_end_idx..header_end_idx + 4)
        .map(|v| v == b"\r\n\r\n")
        .unwrap_or(false)
    {
        (
            String::from_utf8_lossy(&raw[..header_end_idx]).to_string(),
            header_end_idx + 4,
        )
    } else {
        (
            String::from_utf8_lossy(&raw[..header_end_idx]).to_string(),
            header_end_idx + 2,
        )
    };

    let mut lines = headers_raw.lines();
    let request_line = lines.next().unwrap_or_default().trim().to_string();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or_default();
    let (path, query) = split_path_query(raw_path);

    let mut req_token = String::new();
    let mut origin = String::new();
    let mut user_agent = String::new();
    let mut content_length = 0usize;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("x-token") {
                req_token = v.trim().to_string();
            }
            if k.trim().eq_ignore_ascii_case("content-length")
                && let Ok(v) = v.trim().parse::<usize>()
            {
                content_length = v;
            }
            if k.trim().eq_ignore_ascii_case("origin") {
                origin = v.trim().to_string();
            }
            if k.trim().eq_ignore_ascii_case("user-agent") {
                user_agent = v.trim().to_string();
            }
        }
    }
    let settings = service.get_global_settings().ok();
    if !allow_request_for_path(path) {
        service.append_operation_log("bridge_activity", format!("rate_limited path={path}"));
        return write_json(
            &mut stream,
            429,
            &json!({"ok": false, "error": "rate_limited"}),
        )
        .await;
    }
    let allowed_origins = settings
        .as_ref()
        .and_then(|s| s.browser_bridge_allowed_origins.clone())
        .unwrap_or_default();
    let ext_origin = is_extension_origin(&origin);
    let relax_origin_check = origin.is_empty() && (path == "/add" || path == "/health");
    if !relax_origin_check && !origin_allowed(&origin, &allowed_origins) {
        service.append_operation_log(
            "bridge_activity",
            format!("forbidden_origin path={path} origin={origin} ua={user_agent}"),
        );
        return write_json(
            &mut stream,
            401,
            &json!({"ok": false, "error": "forbidden origin"}),
        )
        .await;
    }
    let effective_token = settings
        .as_ref()
        .and_then(|s| s.browser_bridge_token.clone())
        .unwrap_or_else(|| default_token.to_string());
    let token_ok =
        req_token == effective_token || (req_token.is_empty() && ext_origin && path == "/add");
    if !token_ok {
        service.append_operation_log(
            "bridge_activity",
            format!("unauthorized path={path} origin={origin} ua={user_agent}"),
        );
        return write_json(
            &mut stream,
            401,
            &json!({"ok": false, "error": "unauthorized"}),
        )
        .await;
    }

    let body_limit = if path == "/health" {
        MAX_BODY_HEALTH
    } else {
        MAX_BODY_ADD
    };
    if content_length > body_limit {
        service.append_operation_log(
            "bridge_activity",
            format!("payload_too_large path={path} content_length={content_length}"),
        );
        return write_json(
            &mut stream,
            413,
            &json!({"ok": false, "error": "payload_too_large"}),
        )
        .await;
    }

    while raw.len().saturating_sub(body_offset) < content_length {
        let n = stream.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&tmp[..n]);
    }
    let body_bytes = raw.get(body_offset..).unwrap_or_default();
    let body_raw = String::from_utf8_lossy(body_bytes);

    if method == "GET" && path == "/health" {
        service.append_operation_log(
            "bridge_activity",
            format!("health_ok origin={origin} ua={user_agent}"),
        );
        return write_json(&mut stream, 200, &json!({"ok": true})).await;
    }

    if path.starts_with("/api/") {
        return handle_local_api(
            &mut stream,
            service,
            method,
            path,
            query,
            body_raw.trim(),
            &origin,
            &user_agent,
            req_token,
            effective_token,
        )
        .await;
    }

    if method == "POST" && path == "/add" {
        let payload: BridgeAddRequest = serde_json::from_str(body_raw.trim())?;
        let url = payload.url.trim();
        if url.is_empty() {
            return write_json(
                &mut stream,
                400,
                &json!({"ok": false, "error": "empty url"}),
            )
            .await;
        }
        let save_dir = payload
            .save_dir
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let referer = payload
            .referer
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let ua = payload
            .user_agent
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let headers = payload.headers.unwrap_or_default();
        match service
            .add_via_bridge(url, save_dir, referer, ua, headers)
            .await
        {
            Ok(result) => {
                service.append_operation_log(
                    "bridge_activity",
                    format!("add_ok result={} origin={origin} ua={user_agent}", result),
                );
                return write_json(&mut stream, 200, &result).await;
            }
            Err(e) => {
                let reason = classify_bridge_error(&e.to_string());
                service.append_operation_log(
                    "bridge_activity",
                    format!("add_failed reason={reason} err={e} origin={origin} ua={user_agent}"),
                );
                return write_json(
                    &mut stream,
                    400,
                    &json!({"ok": false, "error": reason, "detail": e.to_string()}),
                )
                .await;
            }
        }
    }

    service.append_operation_log(
        "bridge_activity",
        format!("not_found method={method} path={path} origin={origin} ua={user_agent}"),
    );
    write_json(
        &mut stream,
        404,
        &json!({"ok": false, "error": "not found"}),
    )
    .await
}

fn origin_allowed(origin: &str, allowlist_raw: &str) -> bool {
    let rules = allowlist_raw
        .split([',', '\n'])
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();
    if rules.is_empty() {
        return true;
    }
    if origin.is_empty() {
        return false;
    }
    if rules.contains(&"*") {
        return true;
    }
    rules.iter().any(|rule| origin.starts_with(rule))
}

fn is_extension_origin(origin: &str) -> bool {
    origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://")
}

fn classify_bridge_error(detail: &str) -> &'static str {
    let lower = detail.to_lowercase();
    if lower.contains("invalid url") || lower.contains("unsupported scheme") {
        return "invalid_url";
    }
    if lower.contains("ffmpeg") {
        return "ffmpeg_unavailable";
    }
    if lower.contains("unauthorized") {
        return "unauthorized";
    }
    if lower.contains("forbidden origin") {
        return "forbidden_origin";
    }
    "bridge_add_failed"
}

async fn handle_local_api(
    stream: &mut TcpStream,
    service: Arc<DownloadService>,
    method: &str,
    path: &str,
    query: &str,
    body_raw: &str,
    origin: &str,
    user_agent: &str,
    req_token: String,
    effective_token: String,
) -> Result<()> {
    if req_token != effective_token {
        service.append_operation_log(
            "local_api_activity",
            format!("unauthorized method={method} path={path} origin={origin} ua={user_agent}"),
        );
        return write_json(stream, 401, &json!({"ok": false, "error": "unauthorized"})).await;
    }

    let settings = service.get_global_settings()?;
    let scopes = parse_scopes(settings.local_api_scopes.as_deref());
    let required_scope = match (method, path) {
        ("GET", "/api/health") | ("GET", "/api/stats") => "read",
        ("GET", p) if p == "/api/tasks" || p.starts_with("/api/tasks/") => "read",
        ("POST", "/api/tasks") => "add",
        ("POST", p) if p.starts_with("/api/tasks/") && p.ends_with("/actions") => "control",
        _ => "",
    };
    if !required_scope.is_empty() && !scopes.iter().any(|scope| scope == required_scope) {
        service.append_operation_log(
            "local_api_activity",
            format!(
                "forbidden_scope method={method} path={path} required={required_scope} origin={origin} ua={user_agent}"
            ),
        );
        return write_json(
            stream,
            401,
            &json!({"ok": false, "error": "forbidden_scope"}),
        )
        .await;
    }

    match (method, path) {
        ("GET", "/api/health") => {
            let stats = service.get_task_stats()?;
            service.append_operation_log(
                "local_api_activity",
                format!("health_ok method={method} path={path}"),
            );
            return write_json(stream, 200, &json!({"ok": true, "stats": stats})).await;
        }
        ("GET", "/api/stats") => {
            let stats = service.get_task_stats()?;
            service.append_operation_log("local_api_activity", "stats_ok".to_string());
            return write_json(stream, 200, &json!({"ok": true, "data": stats})).await;
        }
        ("GET", "/api/tasks") => {
            let params = parse_query_params(query);
            let status = params.get("status").and_then(|value| match value.as_str() {
                "queued" => Some(crate::models::TaskStatus::Queued),
                "active" => Some(crate::models::TaskStatus::Active),
                "paused" => Some(crate::models::TaskStatus::Paused),
                "completed" => Some(crate::models::TaskStatus::Completed),
                "error" => Some(crate::models::TaskStatus::Error),
                "removed" => Some(crate::models::TaskStatus::Removed),
                "metadata" => Some(crate::models::TaskStatus::Metadata),
                _ => None,
            });
            let limit = params
                .get("limit")
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or(200);
            let offset = params
                .get("offset")
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or(0);
            let tasks = service.list_tasks(status, limit, offset)?;
            service.append_operation_log(
                "local_api_activity",
                format!("list_tasks_ok limit={limit} offset={offset}"),
            );
            return write_json(stream, 200, &json!({"ok": true, "data": tasks})).await;
        }
        ("POST", "/api/tasks") => {
            let payload: LocalApiAddRequest = serde_json::from_str(body_raw)?;
            let options = crate::models::AddTaskOptions {
                save_dir: payload.save_dir,
                category: payload.category,
                referer: payload.referer,
                user_agent: payload.user_agent,
                headers: payload.headers.unwrap_or_default(),
                ..Default::default()
            };
            let task_id = if let Some(magnet) = payload
                .magnet
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                service.add_magnet(magnet, options).await?
            } else if let Some(url) = payload
                .url
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                service.add_url(url, options).await?
            } else {
                return write_json(
                    stream,
                    400,
                    &json!({"ok": false, "error": "missing url or magnet"}),
                )
                .await;
            };
            service.append_operation_log(
                "local_api_activity",
                format!("add_task_ok task_id={task_id}"),
            );
            return write_json(stream, 200, &json!({"ok": true, "task_id": task_id})).await;
        }
        _ => {}
    }

    if method == "GET" && path.starts_with("/api/tasks/") {
        let task_id = path.trim_start_matches("/api/tasks/");
        if task_id.is_empty() {
            return write_json(stream, 404, &json!({"ok": false, "error": "not found"})).await;
        }
        let (task, files) = service.get_task_detail(task_id).await?;
        service.append_operation_log(
            "local_api_activity",
            format!("get_task_ok task_id={task_id}"),
        );
        return write_json(
            stream,
            200,
            &json!({"ok": true, "task": task, "files": files}),
        )
        .await;
    }

    if method == "POST" && path.starts_with("/api/tasks/") && path.ends_with("/actions") {
        let task_id = path
            .trim_start_matches("/api/tasks/")
            .trim_end_matches("/actions")
            .trim_end_matches('/');
        if task_id.is_empty() {
            return write_json(stream, 404, &json!({"ok": false, "error": "not found"})).await;
        }
        let payload: LocalApiTaskActionRequest = serde_json::from_str(body_raw)?;
        let action = payload.action.trim().to_ascii_lowercase();
        match action.as_str() {
            "pause" => service.pause_task(task_id).await?,
            "resume" => service.resume_task(task_id).await?,
            "retry" => service.retry_task(task_id).await?,
            "remove" => {
                service
                    .remove_task(task_id, payload.delete_files.unwrap_or(false))
                    .await?
            }
            "open_dir" => service.open_task_dir(task_id).await?,
            "open_file" => service.open_task_file(task_id).await?,
            "set_category" => service.set_task_category(task_id, payload.category.as_deref())?,
            _ => {
                return write_json(
                    stream,
                    400,
                    &json!({"ok": false, "error": "unsupported action"}),
                )
                .await;
            }
        }
        service.append_operation_log(
            "local_api_activity",
            format!("task_action_ok task_id={task_id} action={action}"),
        );
        return write_json(stream, 200, &json!({"ok": true})).await;
    }

    service.append_operation_log(
        "local_api_activity",
        format!("not_found method={method} path={path} origin={origin} ua={user_agent}"),
    );
    write_json(stream, 404, &json!({"ok": false, "error": "not found"})).await
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn split_path_query(raw_path: &str) -> (&str, &str) {
    match raw_path.split_once('?') {
        Some((path, query)) => (path, query),
        None => (raw_path, ""),
    }
}

fn parse_query_params(query: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for pair in query.split('&').filter(|v| !v.trim().is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        out.insert(key.trim().to_string(), value.trim().replace("%20", " "));
    }
    out
}

fn parse_scopes(raw: Option<&str>) -> Vec<String> {
    let scopes = raw
        .unwrap_or("read,add,control")
        .split([',', '\n'])
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();
    if scopes.is_empty() {
        vec!["read".to_string(), "add".to_string(), "control".to_string()]
    } else {
        scopes
    }
}

fn allow_request_for_path(path: &str) -> bool {
    let limit = match path {
        "/add" => RATE_LIMIT_ADD,
        "/health" => RATE_LIMIT_HEALTH,
        _ => 20,
    };
    let now = Instant::now();
    let mut buckets = BRIDGE_RATE_BUCKETS
        .lock()
        .expect("bridge rate limiter mutex poisoned");
    let queue = buckets.entry(path.to_string()).or_default();
    while let Some(ts) = queue.front().cloned() {
        if now.duration_since(ts) > RATE_LIMIT_WINDOW {
            queue.pop_front();
        } else {
            break;
        }
    }
    if queue.len() >= limit {
        return false;
    }
    queue.push_back(now);
    true
}

async fn write_json(stream: &mut TcpStream, status: u16, body: &serde_json::Value) -> Result<()> {
    let body_s = serde_json::to_string(body)?;
    let status_text = match status {
        200 => "OK",
        413 => "Payload Too Large",
        429 => "Too Many Requests",
        401 => "Unauthorized",
        404 => "Not Found",
        _ => "Bad Request",
    };
    let resp = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body_s.len(),
        body_s
    );
    stream.write_all(resp.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}
