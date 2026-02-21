use std::sync::Arc;

use anyhow::{Result, anyhow};
use serde::Deserialize;
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

use crate::download_service::DownloadService;

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
    let path = parts.next().unwrap_or_default();

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
    if rules.iter().any(|r| *r == "*") {
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

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

async fn write_json(stream: &mut TcpStream, status: u16, body: &serde_json::Value) -> Result<()> {
    let body_s = serde_json::to_string(body)?;
    let status_text = match status {
        200 => "OK",
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
