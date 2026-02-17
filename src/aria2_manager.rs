use std::{
    fs,
    io::Read,
    net::TcpListener,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::{
    process::{Child, Command},
    sync::{Mutex, RwLock},
    time,
};
use uuid::Uuid;

use crate::models::{Aria2FileSnapshot, Aria2TaskSnapshot};

#[async_trait]
pub trait Aria2Api: Send + Sync {
    async fn start(&self) -> Result<Aria2Endpoint>;
    async fn stop(&self) -> Result<()>;
    async fn endpoint(&self) -> Option<Aria2Endpoint>;
    async fn ensure_started(&self) -> Result<Aria2Endpoint>;
    async fn add_uri(&self, uris: Vec<String>, options: Option<Value>) -> Result<String>;
    async fn add_torrent(
        &self,
        torrent_base64: String,
        uris: Vec<String>,
        options: Option<Value>,
    ) -> Result<String>;
    async fn pause(&self, gid: &str) -> Result<String>;
    async fn unpause(&self, gid: &str) -> Result<String>;
    async fn pause_all(&self) -> Result<String>;
    async fn unpause_all(&self) -> Result<String>;
    async fn remove(&self, gid: &str, force: bool) -> Result<String>;
    async fn tell_status(&self, gid: &str) -> Result<Value>;
    async fn tell_all(&self) -> Result<Vec<Aria2TaskSnapshot>>;
    async fn change_option(&self, gid: &str, options: Value) -> Result<String>;
    async fn change_global_option(&self, options: Value) -> Result<String>;
    async fn get_global_stat(&self) -> Result<Value>;
    async fn get_global_option(&self) -> Result<Value>;
    async fn get_version(&self) -> Result<Value>;
    async fn save_session(&self) -> Result<String>;
    fn stderr_tail(&self) -> Option<String>;
}

#[derive(Debug, Clone)]
pub struct Aria2RuntimeConfig {
    pub aria2_bin: PathBuf,
    pub work_dir: PathBuf,
    pub default_download_dir: PathBuf,
    pub session_file: PathBuf,
    pub max_concurrent_downloads: u32,
    pub split: u32,
    pub max_connection_per_server: u32,
    pub bt_tracker: Option<String>,
    pub enable_upnp: bool,
}

impl Aria2RuntimeConfig {
    pub fn with_defaults(base_dir: &Path) -> Self {
        let work_dir = base_dir.join("runtime");
        let download_dir = resolve_default_download_dir(base_dir);
        let aria2_bin = resolve_aria2_bin(base_dir);
        Self {
            aria2_bin,
            work_dir: work_dir.clone(),
            default_download_dir: download_dir,
            session_file: work_dir.join("aria2.session"),
            max_concurrent_downloads: 5,
            split: 16,
            max_connection_per_server: 8,
            bt_tracker: None,
            enable_upnp: true,
        }
    }
}

fn resolve_default_download_dir(base_dir: &Path) -> PathBuf {
    dirs::download_dir().unwrap_or_else(|| base_dir.join("downloads"))
}

fn resolve_aria2_bin(base_dir: &Path) -> PathBuf {
    let bin_dir = base_dir.join("aria2").join("bin");
    let mut candidates = bundled_aria2_candidates();
    let base_candidates = if cfg!(target_os = "windows") {
        vec![
            bin_dir.join("windows").join("aria2c.exe"),
            bin_dir.join("aria2c.exe"),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            bin_dir.join("macos").join("aria2c"),
            bin_dir.join("darwin").join("aria2c"),
            bin_dir.join("aria2c"),
        ]
    } else {
        vec![
            bin_dir.join("linux").join("aria2c"),
            bin_dir.join("aria2c"),
        ]
    };
    candidates.extend(base_candidates);

    candidates.extend(system_aria2_candidates());

    candidates
        .into_iter()
        .find(|p| p.exists())
        .unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                bin_dir.join("aria2c.exe")
            } else {
                bin_dir.join("aria2c")
            }
        })
}

fn bundled_aria2_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Some(resource_dir) = std::env::var_os("FLAMINGO_RESOURCE_DIR").map(PathBuf::from) else {
        return out;
    };
    let bin_dir = resource_dir.join("aria2").join("bin");
    if cfg!(target_os = "windows") {
        out.push(bin_dir.join("windows").join("aria2c.exe"));
        out.push(bin_dir.join("aria2c.exe"));
    } else if cfg!(target_os = "macos") {
        out.push(bin_dir.join("macos").join("aria2c"));
        out.push(bin_dir.join("darwin").join("aria2c"));
        out.push(bin_dir.join("aria2c"));
    } else {
        out.push(bin_dir.join("linux").join("aria2c"));
        out.push(bin_dir.join("aria2c"));
    }
    out
}

fn system_aria2_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from("/opt/homebrew/bin/aria2c"));
        candidates.push(PathBuf::from("/usr/local/bin/aria2c"));
    }
    if cfg!(target_os = "linux") {
        candidates.push(PathBuf::from("/usr/bin/aria2c"));
        candidates.push(PathBuf::from("/usr/local/bin/aria2c"));
    }
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = if cfg!(target_os = "windows") {
                dir.join("aria2c.exe")
            } else {
                dir.join("aria2c")
            };
            candidates.push(candidate);
        }
    }
    candidates
}

#[derive(Debug, Clone)]
pub struct Aria2Endpoint {
    pub endpoint: String,
    pub secret: String,
    pub port: u16,
    pub compat_mode: bool,
}

#[derive(Clone)]
pub struct Aria2Client {
    endpoint: String,
    secret: String,
    http: Client,
}

impl Aria2Client {
    pub fn new(endpoint: String, secret: String) -> Self {
        Self {
            endpoint,
            secret,
            http: Client::new(),
        }
    }

    pub async fn call<T: DeserializeOwned>(
        &self,
        method: &str,
        mut params: Vec<Value>,
    ) -> Result<T> {
        params.insert(0, json!(format!("token:{}", self.secret)));
        let body = json!({
            "jsonrpc": "2.0",
            "id": Uuid::new_v4().to_string(),
            "method": method,
            "params": params
        });

        let response = self.http.post(&self.endpoint).json(&body).send().await?;
        let payload: Value = response.json().await?;

        if let Some(err) = payload.get("error") {
            return Err(anyhow!("aria2 rpc error: {err}"));
        }

        let result = payload
            .get("result")
            .cloned()
            .ok_or_else(|| anyhow!("aria2 rpc invalid response: missing result"))?;

        serde_json::from_value(result).map_err(Into::into)
    }
}

pub struct Aria2Manager {
    cfg: Aria2RuntimeConfig,
    child: Mutex<Option<Child>>,
    endpoint: RwLock<Option<Aria2Endpoint>>,
    client: RwLock<Option<Aria2Client>>,
    lifecycle_lock: Mutex<()>,
}

impl Aria2Manager {
    pub fn new(cfg: Aria2RuntimeConfig) -> Self {
        Self {
            cfg,
            child: Mutex::new(None),
            endpoint: RwLock::new(None),
            client: RwLock::new(None),
            lifecycle_lock: Mutex::new(()),
        }
    }

    pub async fn start(&self) -> Result<Aria2Endpoint> {
        let _lifecycle_guard = self.lifecycle_lock.lock().await;
        if let Some(ep) = self.endpoint().await {
            return Ok(ep);
        }

        tokio::fs::create_dir_all(&self.cfg.work_dir).await?;
        tokio::fs::create_dir_all(&self.cfg.default_download_dir).await?;
        let _ = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.cfg.session_file)
            .await?;

        let port = find_free_port()?;
        let secret = Uuid::new_v4().to_string().replace('-', "");
        let endpoint = format!("http://127.0.0.1:{port}/jsonrpc");
        let stderr_log_path = self.cfg.work_dir.join("aria2.stderr.log");
        let spawn_with_profile = |compat_mode: bool| -> Result<Child> {
            let stderr_file = fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&stderr_log_path)
                .with_context(|| format!("open stderr log file: {}", stderr_log_path.display()))?;
            let mut command = Command::new(&self.cfg.aria2_bin);
            command
                .arg("--enable-rpc=true")
                .arg("--rpc-listen-all=false")
                .arg(format!("--rpc-listen-port={port}"))
                .arg(format!("--rpc-secret={secret}"))
                .arg("--rpc-allow-origin-all=false")
                .arg(format!("--dir={}", self.cfg.default_download_dir.display()))
                .arg(format!("--input-file={}", self.cfg.session_file.display()))
                .arg(format!(
                    "--save-session={}",
                    self.cfg.session_file.display()
                ))
                .arg("--save-session-interval=30")
                .arg("--check-certificate=true")
                .arg("--continue=true")
                .arg(format!(
                    "--max-concurrent-downloads={}",
                    self.cfg.max_concurrent_downloads
                ))
                .arg(format!("--split={}", self.cfg.split))
                .arg(format!(
                    "--max-connection-per-server={}",
                    self.cfg.max_connection_per_server
                ));

            if !compat_mode {
                command
                    .arg("--enable-dht=true")
                    .arg("--enable-peer-exchange=true")
                    .arg("--bt-enable-lpd=true")
                    .arg("--follow-torrent=true")
                    .arg("--listen-port=46800-46850")
                    .arg("--bt-save-metadata=true")
                    .arg("--bt-metadata-only=false");
                if let Some(trackers) = &self.cfg.bt_tracker {
                    command.arg(format!("--bt-tracker={trackers}"));
                }
            }

            command
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::from(stderr_file));
            command.spawn().with_context(|| {
                format!(
                    "failed to spawn aria2c at {}",
                    self.cfg.aria2_bin.to_string_lossy()
                )
            })
        };

        let mut compat_mode = false;
        {
            let child = spawn_with_profile(false)?;
            let mut child_guard = self.child.lock().await;
            *child_guard = Some(child);
        }

        let client = Aria2Client::new(endpoint.clone(), secret.clone());
        if let Err(e) = wait_for_rpc_ready(self, &client).await {
            let detail = read_aria2_stderr_tail(&self.cfg.work_dir).unwrap_or_default();
            let unsupported_option = detail.to_lowercase().contains("unrecognized option");
            if unsupported_option {
                {
                    let mut child_guard = self.child.lock().await;
                    if let Some(mut child) = child_guard.take() {
                        let _ = child.kill().await;
                    }
                }
                let child = spawn_with_profile(true)?;
                {
                    let mut child_guard = self.child.lock().await;
                    *child_guard = Some(child);
                }
                compat_mode = true;
                if let Err(e2) = wait_for_rpc_ready(self, &client).await {
                    let mut child_guard = self.child.lock().await;
                    if let Some(mut child) = child_guard.take() {
                        let _ = child.kill().await;
                    }
                    *self.client.write().await = None;
                    *self.endpoint.write().await = None;
                    return Err(anyhow!(
                        "aria2 start failed after compatibility fallback: {e2}"
                    ));
                }
            } else {
                let mut child_guard = self.child.lock().await;
                if let Some(mut child) = child_guard.take() {
                    let _ = child.kill().await;
                }
                *self.client.write().await = None;
                *self.endpoint.write().await = None;
                return Err(e);
            }
        }

        {
            let mut endpoint_guard = self.endpoint.write().await;
            *endpoint_guard = Some(Aria2Endpoint {
                endpoint: endpoint.clone(),
                secret: secret.clone(),
                port,
                compat_mode,
            });
            let mut client_guard = self.client.write().await;
            *client_guard = Some(client);
        }

        Ok(Aria2Endpoint {
            endpoint,
            secret,
            port,
            compat_mode,
        })
    }

    pub async fn stop(&self) -> Result<()> {
        let _lifecycle_guard = self.lifecycle_lock.lock().await;
        if let Ok(client) = self.client().await {
            let _: Result<String> = client.call("aria2.shutdown", vec![]).await;
        }

        let mut child_guard = self.child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
        }
        *self.client.write().await = None;
        *self.endpoint.write().await = None;
        Ok(())
    }

    pub async fn endpoint(&self) -> Option<Aria2Endpoint> {
        self.endpoint.read().await.clone()
    }

    pub async fn ensure_started(&self) -> Result<Aria2Endpoint> {
        if let Some(ep) = self.endpoint().await {
            return Ok(ep);
        }
        self.start().await
    }

    pub fn stderr_tail(&self) -> Option<String> {
        read_aria2_stderr_tail(&self.cfg.work_dir)
    }

    pub async fn start_health_guard(self: Arc<Self>) {
        tokio::spawn(async move {
            loop {
                time::sleep(Duration::from_secs(2)).await;

                let exited = {
                    let mut child_guard = self.child.lock().await;
                    match child_guard.as_mut() {
                        Some(c) => match c.try_wait() {
                            Ok(Some(_)) => {
                                *child_guard = None;
                                true
                            }
                            Ok(None) => false,
                            Err(_) => true,
                        },
                        None => true,
                    }
                };

                if exited {
                    let _ = self.stop().await;
                    let _ = self.start().await;
                    continue;
                }

                let healthy = match self.client().await {
                    Ok(c) => c.call::<Value>("aria2.getGlobalStat", vec![]).await.is_ok(),
                    Err(_) => false,
                };

                if !healthy {
                    let _ = self.stop().await;
                    let _ = self.start().await;
                }
            }
        });
    }

    async fn client(&self) -> Result<Aria2Client> {
        self.client
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow!("aria2 client not initialized"))
    }

    pub async fn add_uri(&self, uris: Vec<String>, options: Option<Value>) -> Result<String> {
        let client = self.client().await?;
        let mut params = vec![json!(uris)];
        if let Some(o) = options {
            params.push(o);
        }
        client.call("aria2.addUri", params).await
    }

    pub async fn add_torrent(
        &self,
        torrent_base64: String,
        uris: Vec<String>,
        options: Option<Value>,
    ) -> Result<String> {
        let client = self.client().await?;
        let mut params = vec![json!(torrent_base64), json!(uris)];
        if let Some(o) = options {
            params.push(o);
        }
        client.call("aria2.addTorrent", params).await
    }

    pub async fn pause(&self, gid: &str) -> Result<String> {
        self.client()
            .await?
            .call("aria2.pause", vec![json!(gid)])
            .await
    }

    pub async fn unpause(&self, gid: &str) -> Result<String> {
        self.client()
            .await?
            .call("aria2.unpause", vec![json!(gid)])
            .await
    }

    pub async fn pause_all(&self) -> Result<String> {
        self.client().await?.call("aria2.pauseAll", vec![]).await
    }

    pub async fn unpause_all(&self) -> Result<String> {
        self.client().await?.call("aria2.unpauseAll", vec![]).await
    }

    pub async fn remove(&self, gid: &str, force: bool) -> Result<String> {
        let method = if force {
            "aria2.forceRemove"
        } else {
            "aria2.remove"
        };
        self.client().await?.call(method, vec![json!(gid)]).await
    }

    pub async fn tell_status(&self, gid: &str) -> Result<Value> {
        self.client()
            .await?
            .call(
                "aria2.tellStatus",
                vec![
                    json!(gid),
                    json!([
                        "gid",
                        "status",
                        "totalLength",
                        "completedLength",
                        "downloadSpeed",
                        "uploadSpeed",
                        "connections",
                        "errorCode",
                        "errorMessage",
                        "files",
                        "bittorrent"
                    ]),
                ],
            )
            .await
    }

    pub async fn tell_all(&self) -> Result<Vec<Aria2TaskSnapshot>> {
        let active: Vec<Value> = self
            .client()
            .await?
            .call(
                "aria2.tellActive",
                vec![json!([
                    "gid",
                    "status",
                    "totalLength",
                    "completedLength",
                    "downloadSpeed",
                    "uploadSpeed",
                    "connections",
                    "errorCode",
                    "errorMessage",
                    "files",
                    "bittorrent"
                ])],
            )
            .await?;

        let waiting: Vec<Value> = self
            .client()
            .await?
            .call(
                "aria2.tellWaiting",
                vec![
                    json!(0),
                    json!(1000),
                    json!([
                        "gid",
                        "status",
                        "totalLength",
                        "completedLength",
                        "downloadSpeed",
                        "uploadSpeed",
                        "connections",
                        "errorCode",
                        "errorMessage",
                        "files",
                        "bittorrent"
                    ]),
                ],
            )
            .await?;

        let stopped: Vec<Value> = self
            .client()
            .await?
            .call(
                "aria2.tellStopped",
                vec![
                    json!(0),
                    json!(1000),
                    json!([
                        "gid",
                        "status",
                        "totalLength",
                        "completedLength",
                        "downloadSpeed",
                        "uploadSpeed",
                        "connections",
                        "errorCode",
                        "errorMessage",
                        "files",
                        "bittorrent"
                    ]),
                ],
            )
            .await?;

        let mut merged = Vec::with_capacity(active.len() + waiting.len() + stopped.len());
        for item in active.into_iter().chain(waiting).chain(stopped) {
            if let Some(snapshot) = parse_snapshot(item) {
                merged.push(snapshot);
            }
        }
        Ok(merged)
    }

    pub async fn change_option(&self, gid: &str, options: Value) -> Result<String> {
        self.client()
            .await?
            .call("aria2.changeOption", vec![json!(gid), options])
            .await
    }

    pub async fn change_global_option(&self, options: Value) -> Result<String> {
        self.client()
            .await?
            .call("aria2.changeGlobalOption", vec![options])
            .await
    }

    pub async fn get_global_stat(&self) -> Result<Value> {
        self.client()
            .await?
            .call("aria2.getGlobalStat", vec![])
            .await
    }

    pub async fn get_global_option(&self) -> Result<Value> {
        self.client()
            .await?
            .call("aria2.getGlobalOption", vec![])
            .await
    }

    pub async fn get_version(&self) -> Result<Value> {
        self.client().await?.call("aria2.getVersion", vec![]).await
    }

    pub async fn save_session(&self) -> Result<String> {
        self.client().await?.call("aria2.saveSession", vec![]).await
    }
}

#[async_trait]
impl Aria2Api for Aria2Manager {
    async fn start(&self) -> Result<Aria2Endpoint> {
        Aria2Manager::start(self).await
    }

    async fn stop(&self) -> Result<()> {
        Aria2Manager::stop(self).await
    }

    async fn endpoint(&self) -> Option<Aria2Endpoint> {
        Aria2Manager::endpoint(self).await
    }

    async fn ensure_started(&self) -> Result<Aria2Endpoint> {
        Aria2Manager::ensure_started(self).await
    }

    async fn add_uri(&self, uris: Vec<String>, options: Option<Value>) -> Result<String> {
        Aria2Manager::add_uri(self, uris, options).await
    }

    async fn add_torrent(
        &self,
        torrent_base64: String,
        uris: Vec<String>,
        options: Option<Value>,
    ) -> Result<String> {
        Aria2Manager::add_torrent(self, torrent_base64, uris, options).await
    }

    async fn pause(&self, gid: &str) -> Result<String> {
        Aria2Manager::pause(self, gid).await
    }

    async fn unpause(&self, gid: &str) -> Result<String> {
        Aria2Manager::unpause(self, gid).await
    }

    async fn pause_all(&self) -> Result<String> {
        Aria2Manager::pause_all(self).await
    }

    async fn unpause_all(&self) -> Result<String> {
        Aria2Manager::unpause_all(self).await
    }

    async fn remove(&self, gid: &str, force: bool) -> Result<String> {
        Aria2Manager::remove(self, gid, force).await
    }

    async fn tell_status(&self, gid: &str) -> Result<Value> {
        Aria2Manager::tell_status(self, gid).await
    }

    async fn tell_all(&self) -> Result<Vec<Aria2TaskSnapshot>> {
        Aria2Manager::tell_all(self).await
    }

    async fn change_option(&self, gid: &str, options: Value) -> Result<String> {
        Aria2Manager::change_option(self, gid, options).await
    }

    async fn change_global_option(&self, options: Value) -> Result<String> {
        Aria2Manager::change_global_option(self, options).await
    }

    async fn get_global_stat(&self) -> Result<Value> {
        Aria2Manager::get_global_stat(self).await
    }

    async fn get_global_option(&self) -> Result<Value> {
        Aria2Manager::get_global_option(self).await
    }

    async fn get_version(&self) -> Result<Value> {
        Aria2Manager::get_version(self).await
    }

    async fn save_session(&self) -> Result<String> {
        Aria2Manager::save_session(self).await
    }

    fn stderr_tail(&self) -> Option<String> {
        Aria2Manager::stderr_tail(self)
    }
}

fn parse_snapshot(value: Value) -> Option<Aria2TaskSnapshot> {
    let gid = value.get("gid")?.as_str()?.to_string();
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("waiting")
        .to_string();
    let files_value = value
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let first_name = files_value
        .first()
        .and_then(|f| f.get("path"))
        .and_then(Value::as_str)
        .and_then(|path| {
            Path::new(path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
        });
    let has_metadata = !files_value.is_empty() || value.get("bittorrent").is_some();
    let files = files_value
        .into_iter()
        .map(|f| Aria2FileSnapshot {
            path: f
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            length: f
                .get("length")
                .and_then(Value::as_str)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or_default(),
            completed_length: f
                .get("completedLength")
                .and_then(Value::as_str)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or_default(),
            selected: f
                .get("selected")
                .and_then(Value::as_str)
                .map(|v| v.eq_ignore_ascii_case("true"))
                .unwrap_or(true),
        })
        .collect::<Vec<_>>();

    Some(Aria2TaskSnapshot {
        gid,
        status,
        total_length: parse_i64(&value, "totalLength"),
        completed_length: parse_i64(&value, "completedLength"),
        download_speed: parse_i64(&value, "downloadSpeed"),
        upload_speed: parse_i64(&value, "uploadSpeed"),
        connections: parse_i64(&value, "connections"),
        error_code: value
            .get("errorCode")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        error_message: value
            .get("errorMessage")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        name: first_name,
        has_metadata,
        files,
    })
}

fn parse_i64(value: &Value, key: &str) -> i64 {
    value
        .get(key)
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_default()
}

fn find_free_port() -> Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

async fn wait_for_rpc_ready(manager: &Aria2Manager, client: &Aria2Client) -> Result<()> {
    for _ in 0..60 {
        if client
            .call::<Value>("aria2.getVersion", vec![])
            .await
            .is_ok()
        {
            return Ok(());
        }
        {
            let mut child_guard = manager.child.lock().await;
            if let Some(child) = child_guard.as_mut() {
                if let Some(status) = child.try_wait()? {
                    *child_guard = None;
                    let detail = read_aria2_stderr_tail(&manager.cfg.work_dir).unwrap_or_default();
                    if detail.is_empty() {
                        return Err(anyhow!("aria2 exited before rpc became ready: {status}"));
                    }
                    return Err(anyhow!(
                        "aria2 exited before rpc became ready: {status}. stderr: {detail}"
                    ));
                }
            }
        }
        time::sleep(Duration::from_millis(200)).await;
    }
    let detail = read_aria2_stderr_tail(&manager.cfg.work_dir).unwrap_or_default();
    if detail.is_empty() {
        Err(anyhow!("aria2 rpc not ready in time (12s timeout)"))
    } else {
        Err(anyhow!(
            "aria2 rpc not ready in time (12s timeout). stderr: {detail}"
        ))
    }
}

fn read_aria2_stderr_tail(work_dir: &Path) -> Option<String> {
    let path = work_dir.join("aria2.stderr.log");
    let mut f = fs::File::open(path).ok()?;
    let mut s = String::new();
    f.read_to_string(&mut s).ok()?;
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    let max_chars = 400usize;
    let tail = if trimmed.chars().count() > max_chars {
        trimmed
            .chars()
            .rev()
            .take(max_chars)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<String>()
    } else {
        trimmed.to_string()
    };
    Some(tail.replace('\n', " | "))
}
