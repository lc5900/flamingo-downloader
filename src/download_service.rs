use std::{
    collections::HashSet,
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{Result, anyhow};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use tokio::{sync::Mutex as AsyncMutex, time};
use uuid::Uuid;

use crate::{
    aria2_manager::Aria2Api,
    db::Database,
    error::AppError,
    events::SharedEmitter,
    models::{
        AddTaskOptions, Aria2UpdateApplyResult, Aria2UpdateInfo, Diagnostics, GlobalSettings,
        OperationLog, Task, TaskFile, TaskStatus, TaskType,
    },
};

pub struct DownloadService {
    db: Arc<Database>,
    aria2: Arc<dyn Aria2Api>,
    emitter: SharedEmitter,
    logs: Mutex<Vec<OperationLog>>,
    pending_logs: Mutex<Vec<OperationLog>>,
    lifecycle_guard: AsyncMutex<()>,
}

impl DownloadService {
    pub fn new(db: Arc<Database>, aria2: Arc<dyn Aria2Api>, emitter: SharedEmitter) -> Self {
        Self {
            db,
            aria2,
            emitter,
            logs: Mutex::new(Vec::new()),
            pending_logs: Mutex::new(Vec::new()),
            lifecycle_guard: AsyncMutex::new(()),
        }
    }

    pub async fn add_url(&self, url: &str, options: AddTaskOptions) -> Result<String> {
        validate_url(url)?;
        self.ensure_aria2_ready().await?;

        let task_id = Uuid::new_v4().to_string();
        let gid = self
            .aria2
            .add_uri(vec![url.to_string()], Some(to_aria2_options(options)))
            .await?;

        let now = now_ts();
        let save_dir = self.configured_download_dir()?;
        self.db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some(gid),
            task_type: TaskType::Http,
            source: url.to_string(),
            status: TaskStatus::Queued,
            name: None,
            save_dir,
            total_length: 0,
            completed_length: 0,
            download_speed: 0,
            upload_speed: 0,
            connections: 0,
            error_code: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        })?;
        self.push_log("add_url", format!("task created for {url}"));

        Ok(task_id)
    }

    pub async fn add_magnet(&self, magnet: &str, options: AddTaskOptions) -> Result<String> {
        if !magnet.starts_with("magnet:?") {
            return Err(AppError::InvalidInput("invalid magnet link".to_string()).into());
        }
        self.ensure_aria2_ready().await?;

        let task_id = Uuid::new_v4().to_string();
        let gid = self
            .aria2
            .add_uri(vec![magnet.to_string()], Some(to_aria2_options(options)))
            .await?;

        let now = now_ts();
        let save_dir = self.configured_download_dir()?;
        self.db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some(gid),
            task_type: TaskType::Magnet,
            source: magnet.to_string(),
            status: TaskStatus::Metadata,
            name: None,
            save_dir,
            total_length: 0,
            completed_length: 0,
            download_speed: 0,
            upload_speed: 0,
            connections: 0,
            error_code: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        })?;
        self.push_log("add_magnet", "magnet task created".to_string());

        Ok(task_id)
    }

    pub async fn add_torrent_from_file(
        &self,
        torrent_path: &str,
        options: AddTaskOptions,
    ) -> Result<String> {
        let bytes = tokio::fs::read(torrent_path)
            .await
            .map_err(|e| anyhow!("read torrent file failed: {e}"))?;
        self.add_torrent_base64(
            STANDARD.encode(bytes),
            options,
            Some(torrent_path.to_string()),
        )
        .await
    }

    pub async fn add_torrent_base64(
        &self,
        torrent_base64: String,
        options: AddTaskOptions,
        source_label: Option<String>,
    ) -> Result<String> {
        self.ensure_aria2_ready().await?;

        let task_id = Uuid::new_v4().to_string();
        let gid = self
            .aria2
            .add_torrent(torrent_base64, vec![], Some(to_aria2_options(options)))
            .await?;

        let now = now_ts();
        let save_dir = self.configured_download_dir()?;

        self.db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some(gid),
            task_type: TaskType::Torrent,
            source: source_label.unwrap_or_else(|| "torrent:base64".to_string()),
            status: TaskStatus::Queued,
            name: None,
            save_dir,
            total_length: 0,
            completed_length: 0,
            download_speed: 0,
            upload_speed: 0,
            connections: 0,
            error_code: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        })?;
        self.push_log("add_torrent", "torrent task created".to_string());

        Ok(task_id)
    }

    pub async fn pause_task(&self, task_id: &str) -> Result<()> {
        self.ensure_aria2_ready().await?;
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;
        self.aria2.pause(&gid).await?;
        self.push_log("pause_task", format!("paused task {task_id}"));
        Ok(())
    }

    pub async fn pause_all(&self) -> Result<()> {
        self.ensure_aria2_ready().await?;
        self.aria2.pause_all().await?;
        self.push_log("pause_all", "paused all tasks".to_string());
        Ok(())
    }

    pub async fn resume_task(&self, task_id: &str) -> Result<()> {
        self.ensure_aria2_ready().await?;
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;
        self.aria2.unpause(&gid).await?;
        self.push_log("resume_task", format!("resumed task {task_id}"));
        Ok(())
    }

    pub async fn resume_all(&self) -> Result<()> {
        self.ensure_aria2_ready().await?;
        self.aria2.unpause_all().await?;
        self.push_log("resume_all", "resumed all tasks".to_string());
        Ok(())
    }

    pub async fn remove_task(&self, task_id: &str, delete_files: bool) -> Result<()> {
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        if let Some(gid) = task.aria2_gid.as_ref() {
            // Never block record deletion on aria2 rpc responsiveness.
            let _ = time::timeout(Duration::from_millis(1200), self.aria2.remove(gid, true)).await;
        }

        if delete_files {
            let _ = self.delete_task_files_safely(&task);
        }

        self.db.remove_task(task_id)?;
        self.push_log(
            "remove_task",
            format!("removed task {task_id}, delete_files={delete_files}"),
        );
        Ok(())
    }

    pub async fn open_task_file(&self, task_id: &str) -> Result<()> {
        self.open_task_path(task_id, false)
    }

    pub async fn open_task_dir(&self, task_id: &str) -> Result<()> {
        self.open_task_path(task_id, true)
    }

    fn open_task_path(&self, task_id: &str, open_dir: bool) -> Result<()> {
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let files = self.db.list_task_files(task_id)?;
        let mut path = self
            .resolve_primary_task_path(&task, &files)
            .ok_or_else(|| anyhow!("cannot resolve task path"))?;
        if open_dir {
            if path.is_file() {
                if let Some(parent) = path.parent() {
                    path = parent.to_path_buf();
                }
            } else if !path.is_dir()
                && let Some(parent) = path.parent()
            {
                path = parent.to_path_buf();
            }
        }
        if !path.exists() {
            return Err(anyhow!("path does not exist: {}", path.display()));
        }
        open_path_in_os(&path)?;
        self.push_log(
            if open_dir { "open_task_dir" } else { "open_task_file" },
            format!("opened {}", path.display()),
        );
        Ok(())
    }

    fn resolve_primary_task_path(&self, task: &Task, files: &[TaskFile]) -> Option<PathBuf> {
        if let Some(file) = files.iter().find(|f| f.selected).or_else(|| files.first()) {
            let p = PathBuf::from(&file.path);
            if p.is_absolute() {
                return Some(p);
            }
            let save_dir = absolute_path(
                &std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
                &task.save_dir,
            );
            return Some(save_dir.join(p));
        }
        task.name.as_ref().map(|name| {
            let save_dir = absolute_path(
                &std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
                &task.save_dir,
            );
            save_dir.join(name)
        })
    }

    pub fn list_tasks(
        &self,
        status: Option<TaskStatus>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<Task>> {
        self.db.list_tasks(status, limit, offset)
    }

    pub async fn get_task_detail(&self, task_id: &str) -> Result<(Task, Vec<TaskFile>)> {
        let mut task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;

        if let Some(gid) = task.aria2_gid.clone()
            && let Ok(status_value) = self.aria2.tell_status(&gid).await
        {
            let files = extract_task_files(task_id, &status_value);
            if !files.is_empty() {
                self.db.replace_task_files(task_id, &files)?;
            }
            if task.name.is_none() {
                task.name = extract_task_name(&status_value);
                self.db.upsert_task(&task)?;
            }
        }

        let files = self.db.list_task_files(task_id)?;
        Ok((task, files))
    }

    pub async fn set_task_file_selection(
        &self,
        task_id: &str,
        selected_indexes: &[usize],
    ) -> Result<()> {
        self.ensure_aria2_ready().await?;
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;

        let select_file = selected_indexes
            .iter()
            .map(|i| (i + 1).to_string())
            .collect::<Vec<_>>()
            .join(",");
        self.aria2
            .change_option(&gid, json!({ "select-file": select_file }))
            .await?;
        Ok(())
    }

    pub async fn set_global_settings(&self, settings: GlobalSettings) -> Result<()> {
        let manual_path = settings
            .aria2_bin_path
            .as_ref()
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(ToString::to_string);

        if let Some(path) = manual_path.as_deref() {
            let p = Path::new(path);
            if !p.exists() {
                return Err(anyhow!("aria2_bin_path does not exist: {path}"));
            }
            if !p.is_file() {
                return Err(anyhow!("aria2_bin_path is not a file: {path}"));
            }
        }

        self.db.save_global_settings(&settings)?;

        if let Some(path) = manual_path.as_deref() {
            let managed_path = self.aria2_bin_path();
            if !managed_path.is_empty() && managed_path != path {
                if let Err(e) = self.apply_manual_aria2_binary(path).await {
                    self.push_log(
                        "set_global_settings",
                        format!("manual aria2 binary saved but apply failed: {e}"),
                    );
                } else {
                    self.push_log("set_global_settings", format!("applied manual aria2 binary from {path}"));
                }
            }
        }

        let mut aria2_options = serde_json::Map::new();
        if let Some(v) = settings.download_dir {
            aria2_options.insert("dir".to_string(), json!(v));
        }
        if let Some(v) = settings.max_concurrent_downloads {
            aria2_options.insert("max-concurrent-downloads".to_string(), json!(v.to_string()));
        }
        if let Some(v) = settings.max_connection_per_server {
            aria2_options.insert(
                "max-connection-per-server".to_string(),
                json!(v.to_string()),
            );
        }
        if let Some(v) = settings.max_overall_download_limit {
            aria2_options.insert("max-overall-download-limit".to_string(), json!(v));
        }
        if let Some(v) = settings.bt_tracker {
            aria2_options.insert("bt-tracker".to_string(), json!(v));
        }

        if !aria2_options.is_empty() {
            if self.aria2.endpoint().await.is_some() {
                self.aria2
                    .change_global_option(Value::Object(aria2_options))
                    .await?;
            } else {
                self.push_log(
                    "set_global_settings",
                    "aria2 not running, options saved and will apply on next restart".to_string(),
                );
            }
        }
        self.push_log("set_global_settings", "global settings updated".to_string());
        Ok(())
    }

    async fn apply_manual_aria2_binary(&self, path: &str) -> Result<()> {
        let p = Path::new(path);
        let bytes = fs::read(p).map_err(|e| anyhow!("read aria2 binary failed: {e}"))?;
        let managed_path = self.aria2_bin_path();
        if managed_path.is_empty() {
            return Err(anyhow!("managed aria2 binary path is empty"));
        }
        let target_path = Path::new(&managed_path);
        let _guard = self.lifecycle_guard.lock().await;
        let _ = self.aria2.stop().await;
        let backup = install_aria2_binary_with_backup(target_path, &bytes)?;
        if let Err(e) = self.aria2.start().await {
            rollback_aria2_binary(target_path, backup.clone());
            let _ = self.aria2.start().await;
            return Err(anyhow!("aria2 restart failed after applying manual binary: {e}"));
        }
        if let Some(backup_path) = backup
            && backup_path.exists()
        {
            let _ = fs::remove_file(backup_path);
        }
        Ok(())
    }

    pub fn get_global_settings(&self) -> Result<GlobalSettings> {
        self.db.load_global_settings()
    }

    pub fn detect_aria2_bin_paths(&self) -> Result<Vec<String>> {
        let mut candidates = Vec::new();
        let mut seen = HashSet::new();
        let mut push_unique = |p: PathBuf| {
            if !p.exists() || !p.is_file() {
                return;
            }
            let s = p.to_string_lossy().to_string();
            if seen.insert(s.clone()) {
                candidates.push(s);
            }
        };

        if let Ok(current) = self.db.get_setting("manual_aria2_bin_path")
            && let Some(v) = current
            && !v.trim().is_empty()
        {
            push_unique(PathBuf::from(v));
        }

        if cfg!(target_os = "macos") {
            push_unique(PathBuf::from("/opt/homebrew/bin/aria2c"));
            push_unique(PathBuf::from("/usr/local/bin/aria2c"));
        }
        if cfg!(target_os = "linux") {
            push_unique(PathBuf::from("/usr/bin/aria2c"));
            push_unique(PathBuf::from("/usr/local/bin/aria2c"));
        }

        if let Some(path_var) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&path_var) {
                let c = if cfg!(target_os = "windows") {
                    dir.join("aria2c.exe")
                } else {
                    dir.join("aria2c")
                };
                push_unique(c);
            }
        }

        Ok(candidates)
    }

    fn configured_github_cdn(&self) -> Option<String> {
        self.db
            .get_setting("github_cdn")
            .ok()
            .flatten()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    }

    fn configured_github_token(&self) -> Option<String> {
        self.db
            .get_setting("github_token")
            .ok()
            .flatten()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    }

    pub async fn get_diagnostics(&self) -> Result<Diagnostics> {
        let endpoint = self.aria2.endpoint().await;
        if let Some(ep) = endpoint {
            let global_stat = self
                .aria2
                .get_global_stat()
                .await
                .unwrap_or_else(|_| json!({}));
            let version = self.aria2.get_version().await.ok().and_then(|v| {
                v.get("version")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            });
            return Ok(Diagnostics {
                rpc_endpoint: ep.endpoint,
                rpc_port: Some(ep.port),
                rpc_secret_set: !ep.secret.is_empty(),
                aria2_running: true,
                aria2_bin_path: self.aria2_bin_path(),
                aria2_bin_exists: self.aria2_bin_exists(),
                version,
                global_stat,
            });
        }

        Ok(Diagnostics {
            rpc_endpoint: String::new(),
            rpc_port: None,
            rpc_secret_set: false,
            aria2_running: false,
            aria2_bin_path: self.aria2_bin_path(),
            aria2_bin_exists: self.aria2_bin_exists(),
            version: None,
            global_stat: json!({}),
        })
    }

    pub async fn check_aria2_update(&self) -> Result<Aria2UpdateInfo> {
        let current_version = self.current_aria2_version().await.ok();
        let latest = fetch_latest_aria2_release(
            self.configured_github_cdn().as_deref(),
            self.configured_github_token().as_deref(),
        )
        .await;

        match latest {
            Ok(release) => {
                let update_available = match (&current_version, &release.latest_version) {
                    (Some(cur), Some(latest)) => is_version_newer(latest, cur),
                    _ => false,
                };
                Ok(Aria2UpdateInfo {
                    current_version,
                    latest_version: release.latest_version,
                    update_available,
                    selected_asset_name: release.selected_asset_name,
                    selected_asset_url: release.selected_asset_url,
                    latest_url: release.latest_url,
                    check_error: None,
                })
            }
            Err(e) => Ok(Aria2UpdateInfo {
                current_version,
                latest_version: None,
                update_available: false,
                selected_asset_name: None,
                selected_asset_url: None,
                latest_url: None,
                check_error: Some(e.to_string()),
            }),
        }
    }

    pub async fn update_aria2_now(&self) -> Result<Aria2UpdateApplyResult> {
        let current = self.current_aria2_version().await.ok();
        let github_cdn = self.configured_github_cdn();
        let github_token = self.configured_github_token();
        let release =
            fetch_latest_aria2_release(github_cdn.as_deref(), github_token.as_deref()).await?;
        let latest = release.latest_version.clone();
        let needs_update = match (&current, &latest) {
            (Some(cur), Some(newv)) => is_version_newer(newv, cur),
            (None, Some(_)) => true,
            _ => false,
        };
        if !needs_update {
            return Ok(Aria2UpdateApplyResult {
                updated: false,
                from_version: current,
                to_version: latest,
                message: "aria2 is already up to date".to_string(),
            });
        }

        let asset_url = release
            .selected_asset_url
            .as_ref()
            .ok_or_else(|| anyhow!("no compatible binary asset found for current platform"))?;
        let asset_name = release
            .selected_asset_name
            .as_deref()
            .unwrap_or("aria2-package");

        let archive =
            download_asset_archive(asset_url, asset_name, github_cdn.as_deref(), github_token.as_deref()).await?;
        let binary = extract_aria2_binary(asset_name, &archive)?;
        let target = self.aria2_bin_path();
        if target.is_empty() {
            return Err(anyhow!("aria2 binary path is not configured"));
        }
        let target_path = Path::new(&target);

        let _guard = self.lifecycle_guard.lock().await;
        self.aria2.stop().await?;
        let backup = match install_aria2_binary_with_backup(target_path, &binary) {
            Ok(v) => v,
            Err(e) => {
                let _ = self.aria2.start().await;
                return Err(anyhow!(
                    "install aria2 binary failed for asset `{asset_name}`: {e}"
                ));
            }
        };
        if let Err(e) = self.aria2.start().await {
            rollback_aria2_binary(target_path, backup.clone());
            let _ = self.aria2.start().await;
            return Err(anyhow!("aria2 restart failed after update: {e}"));
        }
        if let Some(backup_path) = backup
            && backup_path.exists()
        {
            let _ = fs::remove_file(backup_path);
        }
        let _ = self.reconcile_with_aria2_inner().await;

        let result = Aria2UpdateApplyResult {
            updated: true,
            from_version: current,
            to_version: latest,
            message: format!("updated aria2 binary from {}", asset_name),
        };
        self.push_log("update_aria2_now", result.message.clone());
        Ok(result)
    }

    async fn current_aria2_version(&self) -> Result<String> {
        self.ensure_aria2_ready().await?;
        let version = self.aria2.get_version().await?;
        let v = version
            .get("version")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("missing aria2 version in rpc response"))?;
        Ok(v.to_string())
    }

    pub async fn reconcile_with_aria2(&self) -> Result<usize> {
        let _guard = self.lifecycle_guard.lock().await;
        self.reconcile_with_aria2_inner().await
    }

    async fn reconcile_with_aria2_inner(&self) -> Result<usize> {
        self.ensure_aria2_ready().await?;
        let snapshots = self.aria2.tell_all().await?;
        let now = now_ts();

        let _ = self.db.update_from_snapshots(&snapshots, now)?;

        let mut created = 0usize;
        let default_dir = self.configured_download_dir()?;
        for snapshot in snapshots {
            if self.db.get_task_by_gid(&snapshot.gid)?.is_some() {
                continue;
            }
            let task_id = Uuid::new_v4().to_string();
            let status = TaskStatus::from_aria2_status(
                &snapshot.status,
                snapshot.has_metadata,
                snapshot.total_length,
            );
            self.db.upsert_task(&Task {
                id: task_id.clone(),
                aria2_gid: Some(snapshot.gid.clone()),
                task_type: TaskType::Http,
                source: format!("aria2:recovered:{}", snapshot.gid),
                status,
                name: snapshot.name.clone(),
                save_dir: default_dir.clone(),
                total_length: snapshot.total_length,
                completed_length: snapshot.completed_length,
                download_speed: snapshot.download_speed,
                upload_speed: snapshot.upload_speed,
                connections: snapshot.connections,
                error_code: snapshot.error_code.clone(),
                error_message: snapshot.error_message.clone(),
                created_at: now,
                updated_at: now,
            })?;
            if !snapshot.files.is_empty() {
                let files = snapshot
                    .files
                    .iter()
                    .map(|f| TaskFile {
                        task_id: task_id.clone(),
                        path: f.path.clone(),
                        length: f.length,
                        completed_length: f.completed_length,
                        selected: f.selected,
                    })
                    .collect::<Vec<_>>();
                let _ = self.db.replace_task_files(&task_id, &files);
            }
            created += 1;
        }

        self.push_log(
            "reconcile_with_aria2",
            format!("reconciled, recovered {created} orphan task(s)"),
        );
        Ok(created)
    }

    pub async fn rpc_ping(&self) -> Result<String> {
        self.ensure_aria2_ready().await?;
        let version = self.aria2.get_version().await?;
        let message = version
            .get("version")
            .and_then(Value::as_str)
            .map(|v| format!("ok (aria2 {v})"))
            .unwrap_or_else(|| "ok".to_string());
        self.push_log("rpc_ping", message.clone());
        Ok(message)
    }

    pub async fn restart_aria2(&self) -> Result<String> {
        let _guard = self.lifecycle_guard.lock().await;
        self.aria2.stop().await?;
        let endpoint = self.aria2.start().await?;
        let _ = self.reconcile_with_aria2_inner().await;
        let message = format!("restarted at {}", endpoint.endpoint);
        self.push_log("restart_aria2", message.clone());
        Ok(message)
    }

    pub async fn save_session(&self) -> Result<String> {
        self.ensure_aria2_ready().await?;
        let r = self.aria2.save_session().await?;
        self.push_log("save_session", format!("saveSession -> {r}"));
        Ok(r)
    }

    pub fn list_operation_logs(&self, limit: usize) -> Result<Vec<OperationLog>> {
        self.flush_pending_logs()?;
        self.db.list_operation_logs(limit)
    }

    pub fn clear_operation_logs(&self) -> Result<()> {
        {
            let mut logs = self.logs.lock().expect("operation logs mutex poisoned");
            logs.clear();
        }
        {
            let mut pending = self
                .pending_logs
                .lock()
                .expect("pending logs mutex poisoned");
            pending.clear();
        }
        self.db.clear_operation_logs()?;
        Ok(())
    }

    pub fn start_sync_loop(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_millis(1000));
            loop {
                interval.tick().await;
                let _ = self.flush_pending_logs();
                let snapshots = match self.aria2.tell_all().await {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let now = now_ts();
                let changed_tasks = match self.db.update_from_snapshots(&snapshots, now) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                for task in &changed_tasks {
                    let Some(gid) = task.aria2_gid.as_ref() else {
                        continue;
                    };
                    let Some(snapshot) = snapshots.iter().find(|s| &s.gid == gid) else {
                        continue;
                    };
                    if snapshot.files.is_empty() {
                        continue;
                    }
                    let files = snapshot
                        .files
                        .iter()
                        .map(|f| TaskFile {
                            task_id: task.id.clone(),
                            path: f.path.clone(),
                            length: f.length,
                            completed_length: f.completed_length,
                            selected: f.selected,
                        })
                        .collect::<Vec<_>>();
                    let _ = self.db.replace_task_files(&task.id, &files);
                }

                if self.emitter.emit_task_update(&changed_tasks).is_err() {
                    continue;
                }
            }
        });
    }

    pub fn start_log_flush_loop(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(2));
            loop {
                interval.tick().await;
                let _ = self.flush_pending_logs();
            }
        });
    }
}

fn validate_url(url: &str) -> Result<()> {
    let parsed = reqwest::Url::parse(url).map_err(|e| anyhow!("invalid url: {e}"))?;
    let scheme = parsed.scheme();
    if !matches!(scheme, "http" | "https" | "ftp") {
        return Err(AppError::InvalidInput(format!("unsupported scheme: {scheme}")).into());
    }
    Ok(())
}

fn to_aria2_options(options: AddTaskOptions) -> Value {
    let mut m = serde_json::Map::new();
    if let Some(dir) = options.save_dir {
        m.insert("dir".to_string(), json!(dir));
    }
    if let Some(out) = options.out {
        let filename = Path::new(&out)
            .file_name()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or(out);
        m.insert("out".to_string(), json!(filename));
    }
    if let Some(v) = options.max_connection_per_server {
        m.insert(
            "max-connection-per-server".to_string(),
            json!(v.to_string()),
        );
    }
    if let Some(v) = options.split {
        m.insert("split".to_string(), json!(v.to_string()));
    }
    Value::Object(m)
}

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn absolute_path(base: &Path, value: &str) -> PathBuf {
    let p = Path::new(value);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        base.join(p)
    }
}

fn is_subpath(path: &Path, root: &Path) -> bool {
    path.starts_with(root)
}

fn cleanup_empty_dirs_upwards(from: &Path, root: &Path) {
    let mut cursor = from.to_path_buf();
    while let Ok(canonical) = cursor.canonicalize() {
        if canonical == root || !is_subpath(&canonical, root) {
            break;
        }
        let is_empty = fs::read_dir(&canonical)
            .ok()
            .map(|mut it| it.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            break;
        }
        if fs::remove_dir(&canonical).is_err() {
            break;
        }
        let Some(parent) = canonical.parent() else {
            break;
        };
        cursor = parent.to_path_buf();
    }
}

fn open_path_in_os(path: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| anyhow!("open failed: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| anyhow!("xdg-open failed: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| anyhow!("explorer failed: {e}"))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err(anyhow!("open path is not supported on this platform"))
}

impl DownloadService {
    async fn ensure_aria2_ready(&self) -> Result<()> {
        if !self.aria2_bin_exists() {
            return Err(anyhow!(
                "aria2 is unavailable. Please set a valid aria2 binary path in Settings and restart aria2."
            ));
        }
        self.aria2.ensure_started().await.map(|_| ()).map_err(|e| {
            anyhow!(
                "aria2 is unavailable. Please check aria2 path in Settings and restart aria2. details: {e}"
            )
        })
    }

    fn configured_download_dir(&self) -> Result<String> {
        self.db.get_setting("download_dir")?.ok_or_else(|| {
            AppError::InvalidInput("missing required setting: download_dir".to_string()).into()
        })
    }

    fn aria2_bin_path(&self) -> String {
        self.db
            .get_setting("aria2_bin_path")
            .ok()
            .flatten()
            .unwrap_or_default()
    }

    fn aria2_bin_exists(&self) -> bool {
        let path = self.aria2_bin_path();
        !path.is_empty() && Path::new(&path).exists()
    }

    fn delete_task_files_safely(&self, task: &Task) -> Result<()> {
        let configured_root = self.configured_download_dir()?;
        let root_raw = absolute_path(&std::env::current_dir()?, &configured_root);
        if !root_raw.exists() {
            return Ok(());
        }
        let root = root_raw.canonicalize()?;

        let files = self.db.list_task_files(&task.id)?;
        let mut candidate_set: HashSet<PathBuf> = HashSet::new();
        for f in &files {
            if f.path.is_empty() {
                continue;
            }
            candidate_set.insert(absolute_path(Path::new(&task.save_dir), &f.path));
        }

        if candidate_set.is_empty()
            && let Some(name) = &task.name
        {
            candidate_set.insert(Path::new(&task.save_dir).join(name));
        }

        let mut candidates = candidate_set.into_iter().collect::<Vec<_>>();
        candidates.sort_by_key(|p| std::cmp::Reverse(p.components().count()));

        for candidate in &candidates {
            if !candidate.exists() {
                continue;
            }
            let canonical = match candidate.canonicalize() {
                Ok(v) => v,
                Err(_) => continue,
            };
            if !is_subpath(&canonical, &root) {
                continue;
            }
            if canonical.is_dir() {
                let _ = fs::remove_dir_all(&canonical);
            } else {
                let _ = fs::remove_file(&canonical);
            }
        }

        for candidate in &candidates {
            if let Some(parent) = candidate.parent() {
                cleanup_empty_dirs_upwards(parent, &root);
            }
        }
        self.push_log(
            "delete_task_files",
            format!("cleanup finished for task {}", task.id),
        );
        Ok(())
    }

    fn push_log(&self, action: &str, message: String) {
        let entry = OperationLog {
            ts: now_ts(),
            action: action.to_string(),
            message,
        };

        let mut guard = self.logs.lock().expect("operation logs mutex poisoned");
        guard.push(entry.clone());
        if guard.len() > 300 {
            let drain = guard.len() - 300;
            guard.drain(0..drain);
        }
        drop(guard);

        let mut pending = self
            .pending_logs
            .lock()
            .expect("pending logs mutex poisoned");
        pending.push(entry);
    }

    fn flush_pending_logs(&self) -> Result<()> {
        let drained = {
            let mut pending = self
                .pending_logs
                .lock()
                .expect("pending logs mutex poisoned");
            if pending.is_empty() {
                Vec::new()
            } else {
                pending.drain(..).collect::<Vec<_>>()
            }
        };
        if drained.is_empty() {
            return Ok(());
        }
        self.db.append_operation_logs(&drained)
    }
}

#[derive(Debug, Clone)]
struct ReleaseInfo {
    latest_version: Option<String>,
    latest_url: Option<String>,
    selected_asset_name: Option<String>,
    selected_asset_url: Option<String>,
}

#[derive(Debug, Clone)]
struct ReleaseAsset {
    name: String,
    url: String,
}

async fn fetch_latest_aria2_release(
    github_cdn: Option<&str>,
    github_token: Option<&str>,
) -> Result<ReleaseInfo> {
    let repos = [
        "aria2/aria2",
        "abcfy2/aria2-static-build",
    ];
    let mut last_error: Option<anyhow::Error> = None;
    let mut saw_non_error_repo = false;
    for repo in repos {
        match fetch_release_from_repo(repo, github_cdn, github_token).await {
            Ok(info) if info.selected_asset_url.is_some() => return Ok(info),
            Ok(_) => {
                saw_non_error_repo = true;
                continue;
            }
            Err(e) => last_error = Some(e),
        }
    }
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    if saw_non_error_repo {
        Err(anyhow!(
            "no compatible binary asset found for current platform ({platform})"
        ))
    } else {
        Err(last_error.unwrap_or_else(|| anyhow!(
            "no compatible binary asset found for current platform ({platform})"
        )))
    }
}

async fn fetch_release_from_repo(
    repo: &str,
    github_cdn: Option<&str>,
    github_token: Option<&str>,
) -> Result<ReleaseInfo> {
    let client = reqwest::Client::new();
    // GitHub API should stay direct. Many download CDNs return HTML for API endpoints.
    let latest_url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let latest_payload = fetch_json(&client, &latest_url, github_token).await?;

    if let Some(msg) = latest_payload.get("message").and_then(Value::as_str) {
        if msg.to_ascii_lowercase().contains("rate limit") {
            return Err(anyhow!("repo {repo} api error: {msg}"));
        }
        return Err(anyhow!("repo {repo} api error: {msg}"));
    }

    let latest_release = parse_release_info(&latest_payload, github_cdn, repo);
    if let Some(info) = latest_release.as_ref()
        && info.selected_asset_url.is_some()
    {
        return Ok(info.clone());
    }

    // If latest release has no compatible asset, fallback to release history.
    let releases_url = format!("https://api.github.com/repos/{repo}/releases?per_page=30");
    let releases_payload = fetch_json(&client, &releases_url, github_token).await?;

    if let Some(msg) = releases_payload.get("message").and_then(Value::as_str) {
        if msg.to_ascii_lowercase().contains("rate limit") {
            return Err(anyhow!("repo {repo} api error: {msg}"));
        }
        return Err(anyhow!("repo {repo} api error: {msg}"));
    }

    if let Some(items) = releases_payload.as_array() {
        for item in items {
            let is_draft = item.get("draft").and_then(Value::as_bool).unwrap_or(false);
            if is_draft {
                continue;
            }
            if let Some(info) = parse_release_info(item, github_cdn, repo)
                && info.selected_asset_url.is_some()
            {
                return Ok(info);
            }
        }
    }

    Ok(latest_release.unwrap_or(ReleaseInfo {
        latest_version: None,
        latest_url: None,
        selected_asset_name: None,
        selected_asset_url: None,
    }))
}

async fn fetch_json(client: &reqwest::Client, url: &str, github_token: Option<&str>) -> Result<Value> {
    let mut req = client.get(url).header("User-Agent", "flamingo-downloader");
    if let Some(token) = github_token {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let resp = req.send().await?;
    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        let snippet = body.chars().take(220).collect::<String>();
        return Err(anyhow!(
            "request failed ({status}) for {url}: {}",
            snippet.trim()
        ));
    }
    serde_json::from_str::<Value>(&body).map_err(|e| {
        let snippet = body.chars().take(220).collect::<String>();
        anyhow!(
            "invalid json response from {url}: {e}; body starts with: {}",
            snippet.trim()
        )
    })
}

async fn download_asset_archive(
    asset_url: &str,
    asset_name: &str,
    github_cdn: Option<&str>,
    github_token: Option<&str>,
) -> Result<Vec<u8>> {
    let mut candidates = Vec::new();
    if let Some(cdn) = github_cdn {
        let wrapped = apply_github_cdn(asset_url, Some(cdn));
        if wrapped != asset_url {
            candidates.push(wrapped);
        }
    }
    candidates.push(asset_url.to_string());

    let client = reqwest::Client::new();
    let mut last_err: Option<anyhow::Error> = None;
    for url in candidates {
        match download_asset_bytes_once(&client, &url, github_token).await {
            Ok(bytes) => {
                // Quick sanity check: if decoder says bad header, caller may retry direct URL.
                if extract_aria2_binary(asset_name, &bytes).is_ok() {
                    return Ok(bytes);
                }
                last_err = Some(anyhow!(
                    "downloaded content from {url} is not a valid `{asset_name}` archive/binary"
                ));
            }
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("failed to download asset archive")))
}

async fn download_asset_bytes_once(
    client: &reqwest::Client,
    url: &str,
    github_token: Option<&str>,
) -> Result<Vec<u8>> {
    let mut req = client.get(url).header("User-Agent", "flamingo-downloader");
    if let Some(token) = github_token {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let resp = req.send().await?;
    let status = resp.status();
    let body = resp.bytes().await?.to_vec();
    if !status.is_success() {
        let snippet = String::from_utf8_lossy(&body).chars().take(200).collect::<String>();
        return Err(anyhow!(
            "asset download failed ({status}) for {url}: {}",
            snippet.trim()
        ));
    }
    if body.is_empty() {
        return Err(anyhow!("asset download returned empty body for {url}"));
    }
    Ok(body)
}

fn parse_release_info(payload: &Value, github_cdn: Option<&str>, repo: &str) -> Option<ReleaseInfo> {
    let tag = payload
        .get("tag_name")
        .and_then(Value::as_str)
        .map(|s| s.trim_start_matches('v').to_string());
    let url = payload
        .get("html_url")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let assets = payload
        .get("assets")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(|item| {
            let name = item.get("name").and_then(Value::as_str)?.to_string();
            let raw_url = item
                .get("browser_download_url")
                .and_then(Value::as_str)?
                .to_string();
            let url = if github_cdn.is_some() { raw_url.clone() } else { raw_url };
            Some(ReleaseAsset { name, url })
        })
        .collect::<Vec<_>>();

    let selected = select_release_asset(&assets, repo);
    Some(ReleaseInfo {
        latest_version: tag,
        latest_url: url,
        selected_asset_name: selected.as_ref().map(|a| a.name.clone()),
        selected_asset_url: selected.map(|a| a.url),
    })
}

fn apply_github_cdn(url: &str, github_cdn: Option<&str>) -> String {
    let Some(prefix) = github_cdn.map(str::trim).filter(|v| !v.is_empty()) else {
        return url.to_string();
    };
    if prefix.contains("{url}") {
        return prefix.replace("{url}", url);
    }
    format!("{prefix}{url}")
}

fn parse_version_parts(input: &str) -> Vec<u64> {
    input
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect::<Vec<_>>()
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let a = parse_version_parts(latest);
    let b = parse_version_parts(current);
    let max_len = a.len().max(b.len());
    for idx in 0..max_len {
        let av = *a.get(idx).unwrap_or(&0);
        let bv = *b.get(idx).unwrap_or(&0);
        if av > bv {
            return true;
        }
        if av < bv {
            return false;
        }
    }
    false
}

fn select_release_asset(assets: &[ReleaseAsset], repo: &str) -> Option<ReleaseAsset> {
    let os_keys: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["windows", "win", "mingw"]
    } else if cfg!(target_os = "macos") {
        vec!["macos", "darwin", "osx", "apple", "mac", "mac12", "mac13", "mac14"]
    } else {
        vec!["linux", "gnu", "musl"]
    };
    let arch_keys: Vec<&str> = if cfg!(target_arch = "x86_64") {
        vec!["x86_64", "amd64", "x64", "64bit"]
    } else if cfg!(target_arch = "aarch64") {
        vec!["aarch64", "arm64", "armv8", "64bit"]
    } else {
        vec![std::env::consts::ARCH]
    };

    let preferred_ext: &[&str] = if cfg!(target_os = "windows") {
        &[".zip", ".exe"]
    } else if cfg!(target_os = "macos") {
        &[".tar.xz", ".tar.gz", ".tgz", ".zip"]
    } else {
        &[".tar.xz", ".tar.gz", ".tgz", ".zip"]
    };

    let mut scored = assets
        .iter()
        .filter_map(|asset| {
            let name = asset.name.to_lowercase();
            if !is_supported_asset_name(&name)
            {
                return None;
            }
            // Filter out likely source archives like aria2-1.37.0.tar.xz.
            if is_source_archive_name(&name) {
                return None;
            }
            let os_score = os_keys.iter().any(|k| name.contains(k));
            let arch_score = arch_keys.iter().any(|k| name.contains(k));
            let universal = name.contains("universal") || name.contains("all");

            // Must match current OS and either architecture or universal package.
            if !os_score || (!arch_score && !universal) {
                return None;
            }
            let mut score = 10;
            if os_score { score += 8; }
            if arch_score { score += 5; }
            if name.contains("static") {
                score += 2;
            }
            if universal {
                score += 1;
            }
            if let Some(pos) = preferred_ext.iter().position(|ext| name.ends_with(ext)) {
                score += (preferred_ext.len().saturating_sub(pos)) as i32;
            }
            Some((score, asset.clone()))
        })
        .collect::<Vec<_>>();

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    if let Some((_, asset)) = scored.first() {
        return Some(asset.clone());
    }

    if repo == "aria2/aria2" {
        let fallback = assets
            .iter()
            .filter_map(|asset| {
                let name = asset.name.to_lowercase();
                if !is_supported_asset_name(&name) || is_source_archive_name(&name) {
                    return None;
                }
                let os_score = os_keys.iter().any(|k| name.contains(k));
                if !os_score {
                    return None;
                }
                let arch_score = arch_keys.iter().any(|k| name.contains(k));
                let universal = name.contains("universal") || name.contains("all");
                if arch_score || universal {
                    return None;
                }
                let mut score: i32 = 20;
                if let Some(pos) = preferred_ext.iter().position(|ext| name.ends_with(ext)) {
                    score += (preferred_ext.len().saturating_sub(pos)) as i32;
                }
                Some((score, asset.clone()))
            })
            .max_by_key(|(score, _)| *score);
        if let Some((_, asset)) = fallback {
            return Some(asset);
        }
    }

    None
}

fn is_supported_asset_name(name: &str) -> bool {
    name.ends_with(".zip")
        || name.ends_with(".tar.gz")
        || name.ends_with(".tgz")
        || name.ends_with(".tar.xz")
        || name.ends_with(".tar.bz2")
        || name.ends_with(".tbz2")
        || name.ends_with(".exe")
        || name.ends_with("aria2c")
}

fn is_source_archive_name(name: &str) -> bool {
    // Source packages are usually aria2-<version>.tar.* without platform markers.
    if !name.starts_with("aria2-")
        || !(name.ends_with(".tar.gz")
            || name.ends_with(".tgz")
            || name.ends_with(".tar.xz")
            || name.ends_with(".tar.bz2")
            || name.ends_with(".tbz2"))
    {
        return false;
    }

    let platform_markers = [
        "windows", "win-", "mingw", "linux", "android", "darwin", "osx", "mac", "apple",
        "x86_64", "amd64", "x64", "aarch64", "arm64", "armv8", "32bit", "64bit",
    ];
    !platform_markers.iter().any(|k| name.contains(k))
}

fn extract_aria2_binary(asset_name: &str, archive: &[u8]) -> Result<Vec<u8>> {
    let lower = asset_name.to_lowercase();
    if lower.ends_with(".zip") {
        return extract_from_zip(archive);
    }
    if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        return extract_from_tar_gz(archive);
    }
    if lower.ends_with(".tar.xz") {
        return extract_from_tar_xz(archive);
    }
    if lower.ends_with(".tar.bz2") || lower.ends_with(".tbz2") {
        return extract_from_tar_bz2(archive);
    }
    Ok(archive.to_vec())
}

fn extract_from_zip(bytes: &[u8]) -> Result<Vec<u8>> {
    let reader = Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(reader)?;
    for idx in 0..zip.len() {
        let mut file = zip.by_index(idx)?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().to_ascii_lowercase();
        if name.ends_with("/aria2c") || name.ends_with("/aria2c.exe") || name == "aria2c" || name == "aria2c.exe" {
            let mut out = Vec::new();
            file.read_to_end(&mut out)?;
            return Ok(out);
        }
    }
    Err(anyhow!("aria2c binary not found in zip archive"))
}

fn extract_from_tar_gz(bytes: &[u8]) -> Result<Vec<u8>> {
    let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
    extract_from_tar_reader(decoder)
}

fn extract_from_tar_xz(bytes: &[u8]) -> Result<Vec<u8>> {
    let decoder = xz2::read::XzDecoder::new(Cursor::new(bytes));
    extract_from_tar_reader(decoder)
}

fn extract_from_tar_bz2(bytes: &[u8]) -> Result<Vec<u8>> {
    let decoder = bzip2::read::BzDecoder::new(Cursor::new(bytes));
    extract_from_tar_reader(decoder)
}

fn extract_from_tar_reader<R: Read>(reader: R) -> Result<Vec<u8>> {
    let mut archive = tar::Archive::new(reader);
    for entry in archive.entries()? {
        let mut entry = entry?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry.path()?.to_string_lossy().to_ascii_lowercase();
        if path.ends_with("/aria2c") || path.ends_with("/aria2c.exe") || path == "aria2c" || path == "aria2c.exe" {
            let mut out = Vec::new();
            entry.read_to_end(&mut out)?;
            return Ok(out);
        }
    }
    Err(anyhow!("aria2c binary not found in tar archive"))
}

fn install_aria2_binary_with_backup(target: &Path, bytes: &[u8]) -> Result<Option<PathBuf>> {
    let parent = target
        .parent()
        .ok_or_else(|| anyhow!("invalid aria2 binary path"))?;
    fs::create_dir_all(parent)?;

    if bytes.is_empty() {
        return Err(anyhow!("downloaded aria2 binary is empty"));
    }

    let tmp_path = target.with_extension("new");
    fs::write(&tmp_path, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perm = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&tmp_path, perm)?;
    }
    verify_aria2_binary(&tmp_path)?;

    let mut backup = None;
    if target.exists() {
        let backup_path = target.with_extension("bak");
        if backup_path.exists() {
            let _ = fs::remove_file(&backup_path);
        }
        fs::rename(target, &backup_path)?;
        backup = Some(backup_path);
    }

    if let Err(e) = fs::rename(&tmp_path, target) {
        let _ = fs::remove_file(&tmp_path);
        if let Some(ref b) = backup
            && b.exists()
        {
            let _ = fs::rename(b, target);
        }
        return Err(e.into());
    }
    Ok(backup)
}

fn rollback_aria2_binary(target: &Path, backup: Option<PathBuf>) {
    if target.exists() {
        let _ = fs::remove_file(target);
    }
    if let Some(backup_path) = backup
        && backup_path.exists()
    {
        let _ = fs::rename(backup_path, target);
    }
}

fn verify_aria2_binary(path: &Path) -> Result<()> {
    let output = std::process::Command::new(path).arg("--version").output()?;
    if !output.status.success() {
        return Err(anyhow!("downloaded aria2 binary failed self-check"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        path::Path,
        sync::{Arc, Mutex},
    };

    use anyhow::Result;
    use async_trait::async_trait;
    use serde_json::{Value, json};
    use uuid::Uuid;

    use crate::{
        aria2_manager::{Aria2Api, Aria2Endpoint},
        db::Database,
        events::EventEmitter,
        models::{Aria2TaskSnapshot, TaskStatus},
    };

    use super::{DownloadService, absolute_path, is_subpath};

    #[test]
    fn absolute_path_resolves_relative_to_base() {
        let base = Path::new("/tmp/base");
        let abs = absolute_path(base, "a/b/c");
        assert_eq!(abs, base.join("a/b/c"));
    }

    #[test]
    fn absolute_path_keeps_absolute_input() {
        let base = Path::new("/tmp/base");
        let abs = absolute_path(base, "/tmp/other/path");
        assert_eq!(abs, Path::new("/tmp/other/path"));
    }

    #[test]
    fn subpath_check_works() {
        let root = Path::new("/tmp/root");
        let child = Path::new("/tmp/root/a/b");
        let outside = Path::new("/tmp/other");
        assert!(is_subpath(child, root));
        assert!(!is_subpath(outside, root));
    }

    #[derive(Default)]
    struct NoopEmitter;

    impl EventEmitter for NoopEmitter {
        fn emit_task_update(&self, _tasks: &[crate::models::Task]) -> Result<()> {
            Ok(())
        }
    }

    #[derive(Default)]
    struct MockAria2 {
        calls: Mutex<Vec<String>>,
        snapshots: Mutex<Vec<Aria2TaskSnapshot>>,
    }

    impl MockAria2 {
        fn push_snapshot(&self, snapshot: Aria2TaskSnapshot) {
            self.snapshots
                .lock()
                .expect("snapshots mutex")
                .push(snapshot);
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().expect("calls mutex").clone()
        }

        fn call(&self, name: &str) {
            self.calls
                .lock()
                .expect("calls mutex")
                .push(name.to_string());
        }
    }

    #[async_trait]
    impl Aria2Api for MockAria2 {
        async fn start(&self) -> Result<Aria2Endpoint> {
            self.call("start");
            Ok(Aria2Endpoint {
                endpoint: "http://127.0.0.1:6800/jsonrpc".to_string(),
                secret: "mock".to_string(),
                port: 6800,
            })
        }

        async fn stop(&self) -> Result<()> {
            self.call("stop");
            Ok(())
        }

        async fn endpoint(&self) -> Option<Aria2Endpoint> {
            Some(Aria2Endpoint {
                endpoint: "http://127.0.0.1:6800/jsonrpc".to_string(),
                secret: "mock".to_string(),
                port: 6800,
            })
        }

        async fn ensure_started(&self) -> Result<Aria2Endpoint> {
            self.start().await
        }

        async fn add_uri(&self, _uris: Vec<String>, _options: Option<Value>) -> Result<String> {
            self.call("add_uri");
            Ok("gid-add-uri".to_string())
        }

        async fn add_torrent(
            &self,
            _torrent_base64: String,
            _uris: Vec<String>,
            _options: Option<Value>,
        ) -> Result<String> {
            self.call("add_torrent");
            Ok("gid-add-torrent".to_string())
        }

        async fn pause(&self, _gid: &str) -> Result<String> {
            self.call("pause");
            Ok("ok".to_string())
        }

        async fn unpause(&self, _gid: &str) -> Result<String> {
            self.call("unpause");
            Ok("ok".to_string())
        }

        async fn pause_all(&self) -> Result<String> {
            self.call("pause_all");
            Ok("ok".to_string())
        }

        async fn unpause_all(&self) -> Result<String> {
            self.call("unpause_all");
            Ok("ok".to_string())
        }

        async fn remove(&self, _gid: &str, _force: bool) -> Result<String> {
            self.call("remove");
            Ok("ok".to_string())
        }

        async fn tell_status(&self, _gid: &str) -> Result<Value> {
            self.call("tell_status");
            Ok(json!({ "files": [] }))
        }

        async fn tell_all(&self) -> Result<Vec<Aria2TaskSnapshot>> {
            self.call("tell_all");
            Ok(self.snapshots.lock().expect("snapshots mutex").clone())
        }

        async fn change_option(&self, _gid: &str, _options: Value) -> Result<String> {
            self.call("change_option");
            Ok("ok".to_string())
        }

        async fn change_global_option(&self, _options: Value) -> Result<String> {
            self.call("change_global_option");
            Ok("ok".to_string())
        }

        async fn get_global_stat(&self) -> Result<Value> {
            self.call("get_global_stat");
            Ok(json!({}))
        }

        async fn get_version(&self) -> Result<Value> {
            self.call("get_version");
            Ok(json!({ "version": "mock" }))
        }

        async fn save_session(&self) -> Result<String> {
            self.call("save_session");
            Ok("ok".to_string())
        }
    }

    fn build_service(
        mock: Arc<MockAria2>,
    ) -> (Arc<DownloadService>, Arc<Database>, Arc<MockAria2>) {
        let db_path = std::env::temp_dir().join(format!("tarui-svc-{}.sqlite", Uuid::new_v4()));
        let db = Arc::new(Database::new(&db_path).expect("create db"));
        db.set_setting("download_dir", "/tmp/tarui-tests")
            .expect("set download_dir");
        let emitter = Arc::new(NoopEmitter) as crate::events::SharedEmitter;
        let service = Arc::new(DownloadService::new(db.clone(), mock.clone(), emitter));
        (service, db, mock)
    }

    #[tokio::test]
    async fn add_pause_remove_flow_with_mock() {
        let mock = Arc::new(MockAria2::default());
        let (service, _db, mock) = build_service(mock);

        let task_id = service
            .add_url(
                "https://example.com/file.bin",
                crate::models::AddTaskOptions::default(),
            )
            .await
            .expect("add url");
        service.pause_task(&task_id).await.expect("pause task");
        service
            .remove_task(&task_id, false)
            .await
            .expect("remove task");

        let calls = mock.calls();
        assert!(calls.iter().any(|c| c == "add_uri"));
        assert!(calls.iter().any(|c| c == "pause"));
        assert!(calls.iter().any(|c| c == "remove"));
    }

    #[tokio::test]
    async fn reconcile_recovers_orphan_snapshot() {
        let mock = Arc::new(MockAria2::default());
        mock.push_snapshot(Aria2TaskSnapshot {
            gid: "gid-orphan".to_string(),
            status: "active".to_string(),
            total_length: 1024,
            completed_length: 128,
            download_speed: 32,
            upload_speed: 0,
            connections: 2,
            error_code: None,
            error_message: None,
            name: Some("orphan.bin".to_string()),
            has_metadata: true,
            files: vec![],
        });

        let (service, _db, _mock) = build_service(mock);
        let created = service
            .reconcile_with_aria2()
            .await
            .expect("reconcile with aria2");
        assert_eq!(created, 1);

        let tasks = service
            .list_tasks(None, 20, 0)
            .expect("list tasks after reconcile");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].status, TaskStatus::Active);
        assert!(tasks[0].source.contains("aria2:recovered:gid-orphan"));
    }
}

fn extract_task_files(task_id: &str, status: &Value) -> Vec<TaskFile> {
    status
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|f| TaskFile {
            task_id: task_id.to_string(),
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
        .collect()
}

fn extract_task_name(status: &Value) -> Option<String> {
    status
        .get("files")
        .and_then(Value::as_array)
        .and_then(|files| files.first())
        .and_then(|f| f.get("path"))
        .and_then(Value::as_str)
        .and_then(|path| {
            Path::new(path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
        })
}
