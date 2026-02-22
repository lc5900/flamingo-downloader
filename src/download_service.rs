use std::{
    collections::HashMap,
    collections::HashSet,
    collections::VecDeque,
    fs,
    fs::File,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{Result, anyhow};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{Datelike, Local, Timelike};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::{sync::Mutex as AsyncMutex, time};
use uuid::Uuid;
use zip::write::SimpleFileOptions;

use crate::{
    aria2_manager::Aria2Api,
    db::Database,
    error::AppError,
    events::SharedEmitter,
    models::{
        AddTaskOptions, AppUpdateStrategy, Aria2UpdateApplyResult, Aria2UpdateInfo,
        BrowserBridgeStatus, CategoryRule, Diagnostics, DownloadDirRule, GlobalSettings,
        ImportTaskListResult, MediaMergeJob, OperationLog, SaveDirSuggestion, StartupSelfCheck,
        StorageSummary, Task, TaskFile, TaskListSnapshot, TaskStatus, TaskType,
    },
};

pub struct DownloadService {
    db: Arc<Database>,
    aria2: Arc<dyn Aria2Api>,
    emitter: SharedEmitter,
    logs: Mutex<Vec<OperationLog>>,
    pending_logs: Mutex<Vec<OperationLog>>,
    lifecycle_guard: AsyncMutex<()>,
    retry_state: Mutex<HashMap<String, RetryState>>,
    last_speed_limit: Mutex<Option<String>>,
}

#[derive(Debug, Clone)]
struct RetryState {
    attempts: u32,
    next_retry_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct SpeedPlanRule {
    days: Option<String>,  // "1,2,3" (Mon=1..Sun=7)
    start: Option<String>, // "HH:MM"
    end: Option<String>,   // "HH:MM"
    limit: String,         // "0" / "2M"
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
            retry_state: Mutex::new(HashMap::new()),
            last_speed_limit: Mutex::new(None),
        }
    }

    pub async fn add_url(&self, url: &str, options: AddTaskOptions) -> Result<String> {
        validate_url(url)?;
        self.ensure_aria2_ready().await?;

        let http_type = detect_http_content_type(url).await;
        let save_dir = self.resolve_save_dir_for_new_task(
            TaskType::Http,
            url,
            &options,
            http_type.as_deref(),
        )?;
        let category =
            self.resolve_category_for_new_task(TaskType::Http, url, http_type.as_deref())?;
        let options = with_resolved_save_dir(options, save_dir.clone());
        let task_id = Uuid::new_v4().to_string();
        let gid = self
            .aria2
            .add_uri(vec![url.to_string()], Some(to_aria2_options(options)))
            .await?;

        let now = now_ts();
        self.db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some(gid),
            task_type: TaskType::Http,
            source: url.to_string(),
            status: TaskStatus::Queued,
            name: None,
            category,
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

    pub async fn add_via_bridge(
        &self,
        url: &str,
        save_dir: Option<String>,
        referer: Option<String>,
        user_agent: Option<String>,
        headers: Vec<String>,
    ) -> Result<Value> {
        let clean_url = url.trim();
        validate_url(clean_url)?;
        if clean_url.starts_with("magnet:?") {
            let task_id = self
                .add_magnet(
                    clean_url,
                    AddTaskOptions {
                        save_dir,
                        ..AddTaskOptions::default()
                    },
                )
                .await?;
            return Ok(json!({ "ok": true, "mode": "aria2", "task_id": task_id }));
        }
        if !clean_url.starts_with("http://") && !clean_url.starts_with("https://") {
            return Err(anyhow!("unsupported url scheme for bridge add"));
        }
        let normalized_referer = normalize_bridge_referer(referer)?;
        let normalized_headers = normalize_bridge_headers(headers)?;

        let merge_enabled = self
            .db
            .get_setting("media_merge_enabled")?
            .map(|v| v == "true")
            .unwrap_or(false);
        if merge_enabled && is_stream_manifest_url(clean_url) {
            let output = self
                .spawn_ffmpeg_merge(
                    clean_url,
                    save_dir,
                    normalized_referer.clone(),
                    user_agent.clone(),
                    normalized_headers.clone(),
                )
                .await?;
            return Ok(json!({
                "ok": true,
                "mode": "ffmpeg_merge",
                "task_id": output.0,
                "output_path": output.1
            }));
        }

        let task_id = self
            .add_url(
                clean_url,
                AddTaskOptions {
                    save_dir,
                    referer: normalized_referer,
                    user_agent,
                    headers: normalized_headers,
                    ..AddTaskOptions::default()
                },
            )
            .await?;
        Ok(json!({ "ok": true, "mode": "aria2", "task_id": task_id }))
    }

    async fn spawn_ffmpeg_merge(
        &self,
        url: &str,
        save_dir: Option<String>,
        referer: Option<String>,
        user_agent: Option<String>,
        headers: Vec<String>,
    ) -> Result<(String, String)> {
        let ffmpeg_bin = self
            .db
            .get_setting("ffmpeg_bin_path")?
            .unwrap_or_else(|| "ffmpeg".to_string());
        let target_dir = match save_dir
            .as_deref()
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
        {
            Some(v) => v.to_string(),
            None => self.configured_download_dir()?,
        };
        fs::create_dir_all(&target_dir)?;
        let output_name = stream_output_filename(url);
        let output_path = Path::new(&target_dir).join(output_name);
        let task_id = Uuid::new_v4().to_string();
        let now = now_ts();
        let mut ffmpeg_args = vec![
            "-y".to_string(),
            "-nostdin".to_string(),
            "-loglevel".to_string(),
            "warning".to_string(),
            "-progress".to_string(),
            "pipe:2".to_string(),
            "-nostats".to_string(),
            "-i".to_string(),
            url.to_string(),
            "-c".to_string(),
            "copy".to_string(),
            output_path.to_string_lossy().to_string(),
        ];
        let task = Task {
            id: task_id.clone(),
            aria2_gid: None,
            task_type: TaskType::Http,
            source: url.to_string(),
            status: TaskStatus::Active,
            name: output_path
                .file_name()
                .map(|v| v.to_string_lossy().to_string()),
            category: self.resolve_category_for_new_task(TaskType::Http, url, None)?,
            save_dir: target_dir.clone(),
            total_length: 1,
            completed_length: 0,
            download_speed: 0,
            upload_speed: 0,
            connections: 0,
            error_code: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        };
        self.db.upsert_task(&task)?;
        let initial_files = vec![TaskFile {
            task_id: task_id.clone(),
            path: output_path.to_string_lossy().to_string(),
            length: 0,
            completed_length: 0,
            selected: true,
        }];
        let _ = self.db.replace_task_files(&task_id, &initial_files);
        let merge_job = MediaMergeJob {
            task_id: task_id.clone(),
            input_url: url.to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            ffmpeg_bin: ffmpeg_bin.clone(),
            ffmpeg_args: ffmpeg_args.join(" "),
            status: "active".to_string(),
            error_message: None,
            created_at: now,
            updated_at: now,
        };
        let _ = self.db.upsert_media_merge_job(&merge_job);

        let mut cmd = tokio::process::Command::new(&ffmpeg_bin);
        cmd.arg("-y")
            .arg("-nostdin")
            .arg("-loglevel")
            .arg("warning")
            .arg("-progress")
            .arg("pipe:2")
            .arg("-nostats")
            .arg("-i")
            .arg(url)
            .arg("-c")
            .arg("copy")
            .arg(&output_path)
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        if let Some(v) = user_agent
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            cmd.arg("-user_agent").arg(v);
            ffmpeg_args.push("-user_agent".to_string());
            ffmpeg_args.push(v.to_string());
        }
        if let Some(v) = referer.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            cmd.arg("-referer").arg(v);
            ffmpeg_args.push("-referer".to_string());
            ffmpeg_args.push(v.to_string());
        }
        let cleaned_headers = headers
            .into_iter()
            .map(|h| h.trim().to_string())
            .filter(|h| !h.is_empty())
            .collect::<Vec<_>>();
        if !cleaned_headers.is_empty() {
            let mut merged = cleaned_headers.join("\r\n");
            merged.push_str("\r\n");
            cmd.arg("-headers").arg(merged);
            ffmpeg_args.push("-headers".to_string());
            ffmpeg_args.push("<custom headers>".to_string());
        }
        let mut child = cmd.spawn().map_err(|e| {
            anyhow!("ffmpeg merge start failed: {e}. check ffmpeg_bin_path setting")
        })?;

        self.push_log(
            "ffmpeg_merge_spawned",
            format!("task_id={} output={}", task_id, output_path.display()),
        );

        let db = self.db.clone();
        let emitter = self.emitter.clone();
        let task_id_bg = task_id.clone();
        let output_path_bg = output_path.clone();
        let input_url_bg = url.to_string();
        let ffmpeg_bin_bg = ffmpeg_bin.clone();
        let ffmpeg_args_bg = ffmpeg_args.join(" ");
        tokio::spawn(async move {
            let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(24);
            let mut progress_tick: i64 = 0;
            if let Some(stderr) = child.stderr.take() {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let line = line.trim().to_string();
                    if line.is_empty() {
                        continue;
                    }
                    if line == "progress=continue" {
                        progress_tick += 1;
                        if let Ok(Some(mut t)) = db.get_task(&task_id_bg) {
                            t.updated_at = now_ts();
                            t.completed_length = progress_tick.max(t.completed_length);
                            let _ = db.upsert_task(&t);
                            let _ = emitter.emit_task_update(&[t]);
                        }
                        continue;
                    }
                    if stderr_tail.len() >= 20 {
                        stderr_tail.pop_front();
                    }
                    stderr_tail.push_back(line);
                }
            }

            let final_status = child.wait().await;
            match final_status {
                Ok(exit) if exit.success() => {
                    if let Ok(Some(mut t)) = db.get_task(&task_id_bg) {
                        t.status = TaskStatus::Completed;
                        t.completed_length = t.total_length.max(1);
                        t.error_code = None;
                        t.error_message = None;
                        t.updated_at = now_ts();
                        let _ = db.upsert_task(&t);
                        let final_files = vec![TaskFile {
                            task_id: task_id_bg.clone(),
                            path: output_path_bg.to_string_lossy().to_string(),
                            length: 1,
                            completed_length: 1,
                            selected: true,
                        }];
                        let _ = db.replace_task_files(&task_id_bg, &final_files);
                        let _ = db.append_operation_logs(&[OperationLog {
                            ts: now_ts(),
                            action: "ffmpeg_merge_done".to_string(),
                            message: format!(
                                "task={} output={}",
                                task_id_bg,
                                output_path_bg.display()
                            ),
                        }]);
                        let _ = db.upsert_media_merge_job(&MediaMergeJob {
                            task_id: task_id_bg.clone(),
                            input_url: input_url_bg.clone(),
                            output_path: output_path_bg.to_string_lossy().to_string(),
                            ffmpeg_bin: ffmpeg_bin_bg.clone(),
                            ffmpeg_args: ffmpeg_args_bg.clone(),
                            status: "completed".to_string(),
                            error_message: None,
                            created_at: t.created_at,
                            updated_at: now_ts(),
                        });
                        let _ = emitter.emit_task_update(&[t]);
                    }
                }
                Ok(exit) => {
                    if let Ok(Some(mut t)) = db.get_task(&task_id_bg) {
                        let detail = stderr_tail
                            .iter()
                            .rev()
                            .take(4)
                            .cloned()
                            .collect::<Vec<_>>()
                            .into_iter()
                            .rev()
                            .collect::<Vec<_>>()
                            .join(" | ");
                        t.status = TaskStatus::Error;
                        t.error_code = Some(format!("FFMPEG_EXIT_{}", exit.code().unwrap_or(-1)));
                        t.error_message = Some(if detail.is_empty() {
                            "ffmpeg merge failed with unknown error".to_string()
                        } else {
                            detail
                        });
                        t.updated_at = now_ts();
                        let _ = db.upsert_task(&t);
                        let _ = db.append_operation_logs(&[OperationLog {
                            ts: now_ts(),
                            action: "ffmpeg_merge_failed".to_string(),
                            message: format!(
                                "task={} exit={:?} err={}",
                                task_id_bg,
                                exit.code(),
                                t.error_message.clone().unwrap_or_default()
                            ),
                        }]);
                        let _ = db.upsert_media_merge_job(&MediaMergeJob {
                            task_id: task_id_bg.clone(),
                            input_url: input_url_bg.clone(),
                            output_path: output_path_bg.to_string_lossy().to_string(),
                            ffmpeg_bin: ffmpeg_bin_bg.clone(),
                            ffmpeg_args: ffmpeg_args_bg.clone(),
                            status: "error".to_string(),
                            error_message: t.error_message.clone(),
                            created_at: t.created_at,
                            updated_at: now_ts(),
                        });
                        let _ = emitter.emit_task_update(&[t]);
                    }
                }
                Err(e) => {
                    if let Ok(Some(mut t)) = db.get_task(&task_id_bg) {
                        t.status = TaskStatus::Error;
                        t.error_code = Some("FFMPEG_WAIT_ERROR".to_string());
                        t.error_message = Some(format!("ffmpeg wait failed: {e}"));
                        t.updated_at = now_ts();
                        let _ = db.upsert_task(&t);
                        let _ = db.append_operation_logs(&[OperationLog {
                            ts: now_ts(),
                            action: "ffmpeg_merge_wait_failed".to_string(),
                            message: format!("task={} error={e}", task_id_bg),
                        }]);
                        let _ = db.upsert_media_merge_job(&MediaMergeJob {
                            task_id: task_id_bg.clone(),
                            input_url: input_url_bg.clone(),
                            output_path: output_path_bg.to_string_lossy().to_string(),
                            ffmpeg_bin: ffmpeg_bin_bg.clone(),
                            ffmpeg_args: ffmpeg_args_bg.clone(),
                            status: "error".to_string(),
                            error_message: t.error_message.clone(),
                            created_at: t.created_at,
                            updated_at: now_ts(),
                        });
                        let _ = emitter.emit_task_update(&[t]);
                    }
                }
            }
        });

        Ok((task_id, output_path.to_string_lossy().to_string()))
    }

    pub async fn add_magnet(&self, magnet: &str, options: AddTaskOptions) -> Result<String> {
        if !magnet.starts_with("magnet:?") {
            return Err(AppError::InvalidInput("invalid magnet link".to_string()).into());
        }
        self.ensure_aria2_ready().await?;

        let save_dir =
            self.resolve_save_dir_for_new_task(TaskType::Magnet, magnet, &options, None)?;
        let category = self.resolve_category_for_new_task(TaskType::Magnet, magnet, None)?;
        let options = with_resolved_save_dir(options, save_dir.clone());
        let task_id = Uuid::new_v4().to_string();
        let gid = self
            .aria2
            .add_uri(vec![magnet.to_string()], Some(to_aria2_options(options)))
            .await?;

        let now = now_ts();
        self.db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some(gid),
            task_type: TaskType::Magnet,
            source: magnet.to_string(),
            status: TaskStatus::Metadata,
            name: None,
            category,
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
        let source = source_label
            .clone()
            .unwrap_or_else(|| "torrent:base64".to_string());
        let save_dir =
            self.resolve_save_dir_for_new_task(TaskType::Torrent, &source, &options, None)?;
        let category = self.resolve_category_for_new_task(TaskType::Torrent, &source, None)?;
        let options = with_resolved_save_dir(options, save_dir.clone());

        let task_id = Uuid::new_v4().to_string();
        let gid = self
            .aria2
            .add_torrent(torrent_base64, vec![], Some(to_aria2_options(options)))
            .await?;

        let now = now_ts();

        self.db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some(gid),
            task_type: TaskType::Torrent,
            source,
            status: TaskStatus::Queued,
            name: None,
            category,
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

    pub fn suggest_save_dir(&self, task_type: TaskType, source: Option<&str>) -> Result<String> {
        self.suggest_save_dir_detail(task_type, source)
            .map(|v| v.save_dir)
    }

    pub fn suggest_save_dir_detail(
        &self,
        task_type: TaskType,
        source: Option<&str>,
    ) -> Result<SaveDirSuggestion> {
        let (save_dir, matched_rule) = self.resolve_save_dir_for_new_task_detail(
            task_type,
            source.unwrap_or_default(),
            &AddTaskOptions::default(),
            None,
        )?;
        Ok(SaveDirSuggestion {
            save_dir,
            matched_rule,
        })
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

    pub async fn move_task_position(&self, task_id: &str, action: &str) -> Result<()> {
        self.ensure_aria2_ready().await?;
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        if task.status == TaskStatus::Completed {
            return Err(
                AppError::InvalidInput("completed task cannot be reordered".to_string()).into(),
            );
        }
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;
        let (pos, how) = match action {
            "top" => (0_i64, "POS_SET"),
            "up" => (-1_i64, "POS_CUR"),
            "down" => (1_i64, "POS_CUR"),
            "bottom" => (0_i64, "POS_END"),
            _ => {
                return Err(AppError::InvalidInput(format!(
                    "unsupported task move action: {action}"
                ))
                .into());
            }
        };
        let new_pos = self.aria2.change_position(&gid, pos, how).await?;
        self.push_log(
            "move_task_position",
            format!("task={task_id}, action={action}, new_pos={new_pos}"),
        );
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

    pub async fn stop_seeding(&self, task_id: &str) -> Result<()> {
        self.ensure_aria2_ready().await?;
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        if task.task_type != TaskType::Torrent && task.task_type != TaskType::Magnet {
            return Err(
                AppError::InvalidInput("stop seeding only supports bt tasks".to_string()).into(),
            );
        }
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;
        self.aria2.remove(&gid, true).await?;
        self.push_log("stop_seeding", format!("stopped seeding task {task_id}"));
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

        if delete_files {
            self.delete_task_files_safely(&task)?;
        }

        if let Some(gid) = task.aria2_gid.as_ref() {
            // Mark gid first so even if aria2 rpc times out/crashes, reconcile won't
            // recreate this user-deleted task after restart.
            let _ = self.db.mark_deleted_gid(gid, now_ts());
            // Best effort: remove running/waiting task, then purge stopped result.
            let _ = time::timeout(Duration::from_millis(1200), self.aria2.remove(gid, true)).await;
            let _ = time::timeout(
                Duration::from_millis(1200),
                self.aria2.remove_download_result(gid),
            )
            .await;
            // Persist aria2 session immediately so a quick app restart doesn't reload
            // stale tasks from the previous save-session interval.
            let _ = time::timeout(Duration::from_millis(1200), self.aria2.save_session()).await;
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

    pub fn get_task_primary_path(&self, task_id: &str) -> Result<String> {
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let files = self.db.list_task_files(task_id)?;
        let path = self
            .resolve_primary_task_path(&task, &files)
            .ok_or_else(|| anyhow!("cannot resolve task path"))?;
        Ok(path.to_string_lossy().to_string())
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
            if open_dir {
                "open_task_dir"
            } else {
                "open_task_file"
            },
            format!("opened {}", path.display()),
        );
        Ok(())
    }

    fn apply_completion_rules(&self, changed_tasks: &[Task], tick: u64) -> Result<()> {
        let settings = self.db.load_global_settings()?;

        if settings.auto_delete_control_files.unwrap_or(true) {
            for task in changed_tasks {
                if task.status != TaskStatus::Completed {
                    continue;
                }
                let _ = self.remove_task_control_file(task);
            }
        }

        let days = settings.auto_clear_completed_days.unwrap_or(0);
        if days > 0 && tick.is_multiple_of(300) {
            let cutoff_ts = now_ts() - (days as i64 * 86_400);
            let removed = self.db.remove_completed_tasks_before(cutoff_ts)?;
            if removed > 0 {
                self.push_log(
                    "auto_clear_completed",
                    format!("removed {removed} completed record(s) older than {days} day(s)"),
                );
            }
        }

        Ok(())
    }

    fn remove_task_control_file(&self, task: &Task) -> Result<()> {
        let files = self.db.list_task_files(&task.id)?;
        let Some(path) = self.resolve_primary_task_path(task, &files) else {
            return Ok(());
        };
        let control_path = PathBuf::from(format!("{}.aria2", path.to_string_lossy()));
        if !control_path.exists() {
            return Ok(());
        }
        fs::remove_file(&control_path)?;
        self.push_log(
            "auto_delete_control_file",
            format!("removed {}", control_path.display()),
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

    pub fn set_task_category(&self, task_id: &str, category: Option<&str>) -> Result<()> {
        let clean = category
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(ToString::to_string);
        self.db.set_task_category(task_id, clean.as_deref())?;
        self.push_log(
            "set_task_category",
            format!(
                "task {task_id} category set to {}",
                clean.as_deref().unwrap_or("<none>")
            ),
        );
        Ok(())
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

    pub async fn get_task_runtime_status(&self, task_id: &str) -> Result<Value> {
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;
        self.ensure_aria2_ready().await?;
        let status = self.aria2.tell_status(&gid).await?;

        let trackers = status
            .get("bittorrent")
            .and_then(|v| v.get("announceList"))
            .and_then(Value::as_array)
            .map(|tiers| {
                tiers
                    .iter()
                    .filter_map(Value::as_array)
                    .flat_map(|tier| tier.iter())
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let peers = if task.task_type == TaskType::Torrent || task.task_type == TaskType::Magnet {
            self.aria2.get_peers(&gid).await.unwrap_or_default()
        } else {
            Vec::new()
        };
        let num_seeders = status
            .get("numSeeders")
            .and_then(Value::as_str)
            .and_then(|v| v.parse::<i64>().ok())
            .or_else(|| status.get("numSeeders").and_then(Value::as_i64))
            .unwrap_or_default();

        Ok(json!({
            "raw": status,
            "summary": {
                "peers_count": peers.len(),
                "seeders_count": num_seeders,
                "trackers_count": trackers.len(),
                "trackers": trackers
            },
            "peers": peers
        }))
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

    pub async fn set_task_runtime_options(&self, task_id: &str, options: Value) -> Result<()> {
        self.ensure_aria2_ready().await?;
        let task = self
            .db
            .get_task(task_id)?
            .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
        let gid = task
            .aria2_gid
            .ok_or_else(|| AppError::InvalidInput("task has no aria2 gid".to_string()))?;

        let allowed = [
            "max-download-limit",
            "max-upload-limit",
            "max-connection-per-server",
            "split",
            "seed-ratio",
            "seed-time",
        ];
        let mut sanitized = serde_json::Map::new();
        if let Some(map) = options.as_object() {
            for (key, value) in map {
                if !allowed.contains(&key.as_str()) {
                    continue;
                }
                if value.is_null() {
                    continue;
                }
                let normalized = match value {
                    Value::String(s) => Value::String(s.trim().to_string()),
                    Value::Number(n) => Value::String(n.to_string()),
                    Value::Bool(b) => Value::String(if *b { "true" } else { "false" }.to_string()),
                    _ => continue,
                };
                sanitized.insert(key.clone(), normalized);
            }
        }
        if sanitized.is_empty() {
            return Err(anyhow!("no valid runtime options provided"));
        }

        self.aria2
            .change_option(&gid, Value::Object(sanitized))
            .await?;
        self.push_log(
            "set_task_runtime_options",
            format!("updated task {task_id} runtime options"),
        );
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
            if !is_executable(p) {
                return Err(anyhow!("aria2_bin_path is not executable: {path}"));
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
                    self.push_log(
                        "set_global_settings",
                        format!("applied manual aria2 binary from {path}"),
                    );
                }
            }
        }

        self.apply_saved_runtime_global_options().await?;
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
            return Err(anyhow!(
                "aria2 restart failed after applying manual binary: {e}"
            ));
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

    pub fn rotate_browser_bridge_token(&self) -> Result<String> {
        let new_token = Uuid::new_v4().to_string();
        self.db.set_setting("browser_bridge_token", &new_token)?;
        self.push_log(
            "rotate_browser_bridge_token",
            "browser bridge token rotated".to_string(),
        );
        Ok(new_token)
    }

    pub async fn check_browser_bridge_status(&self) -> Result<BrowserBridgeStatus> {
        let settings = self.get_global_settings()?;
        let enabled = settings.browser_bridge_enabled.unwrap_or(true);
        let port = settings.browser_bridge_port.unwrap_or(16789);
        let token = settings
            .browser_bridge_token
            .unwrap_or_default()
            .trim()
            .to_string();
        let endpoint = format!("http://127.0.0.1:{port}/health");

        if !enabled {
            return Ok(BrowserBridgeStatus {
                enabled,
                endpoint,
                token_set: !token.is_empty(),
                connected: false,
                message: "browser bridge is disabled".to_string(),
            });
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()?;
        let mut req = client.get(&endpoint);
        if !token.is_empty() {
            req = req.header("X-Token", token.clone());
        }
        let result = req.send().await;
        match result {
            Ok(resp) if resp.status().is_success() => {
                let body = resp.text().await.unwrap_or_default();
                if body.contains("\"ok\":true") || body.contains("\"ok\": true") {
                    Ok(BrowserBridgeStatus {
                        enabled,
                        endpoint,
                        token_set: !token.is_empty(),
                        connected: true,
                        message: "bridge is healthy".to_string(),
                    })
                } else {
                    Ok(BrowserBridgeStatus {
                        enabled,
                        endpoint,
                        token_set: !token.is_empty(),
                        connected: false,
                        message: "bridge responded but payload is unexpected".to_string(),
                    })
                }
            }
            Ok(resp) => Ok(BrowserBridgeStatus {
                enabled,
                endpoint,
                token_set: !token.is_empty(),
                connected: false,
                message: format!("bridge unhealthy: HTTP {}", resp.status()),
            }),
            Err(e) => Ok(BrowserBridgeStatus {
                enabled,
                endpoint,
                token_set: !token.is_empty(),
                connected: false,
                message: format!("bridge request failed: {e}"),
            }),
        }
    }

    pub async fn reset_global_settings_to_defaults(&self) -> Result<()> {
        let current = self.db.load_global_settings()?;
        let default_download_dir = dirs::download_dir()
            .map(|p| p.to_string_lossy().to_string())
            .or(current.download_dir.clone())
            .unwrap_or_else(|| ".".to_string());

        let defaults = GlobalSettings {
            aria2_bin_path: current.aria2_bin_path,
            download_dir: Some(default_download_dir),
            max_concurrent_downloads: Some(5),
            max_connection_per_server: Some(8),
            max_overall_download_limit: Some("0".to_string()),
            bt_tracker: Some(String::new()),
            enable_upnp: Some(true),
            github_cdn: Some(String::new()),
            github_token: Some(String::new()),
            download_dir_rules: Vec::new(),
            category_rules: Vec::new(),
            browser_bridge_enabled: Some(true),
            browser_bridge_port: Some(16789),
            browser_bridge_token: current.browser_bridge_token,
            browser_bridge_allowed_origins: Some(
                "chrome-extension://,moz-extension://".to_string(),
            ),
            ffmpeg_bin_path: Some(
                current
                    .ffmpeg_bin_path
                    .unwrap_or_else(|| "ffmpeg".to_string()),
            ),
            media_merge_enabled: Some(false),
            clipboard_watch_enabled: Some(false),
            ui_theme: Some("system".to_string()),
            retry_max_attempts: Some(2),
            retry_backoff_secs: Some(15),
            retry_fallback_mirrors: Some(String::new()),
            metadata_timeout_secs: Some(180),
            speed_plan: Some("[]".to_string()),
            task_option_presets: Some("[]".to_string()),
            post_complete_action: Some("none".to_string()),
            auto_delete_control_files: Some(true),
            auto_clear_completed_days: Some(0),
            first_run_done: Some(true),
            start_minimized: Some(false),
            minimize_to_tray: Some(false),
            notify_on_complete: Some(true),
        };
        self.db.save_global_settings(&defaults)?;
        let _ = self.apply_saved_runtime_global_options().await;
        self.push_log(
            "reset_global_settings_to_defaults",
            "settings reset to defaults".to_string(),
        );
        Ok(())
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

        let configured = self.aria2_bin_path();
        if !configured.trim().is_empty() {
            push_unique(PathBuf::from(configured.trim()));
        }

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
            let global_option = self
                .aria2
                .get_global_option()
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
                stderr_tail: self.aria2.stderr_tail(),
                global_stat,
                global_option,
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
            stderr_tail: self.aria2.stderr_tail(),
            global_stat: json!({}),
            global_option: json!({}),
        })
    }

    pub async fn startup_check_aria2(&self) -> Result<String> {
        let _guard = self.lifecycle_guard.lock().await;
        let mut attempts = Vec::new();
        let _ = self.aria2.stop().await;
        for attempt in 1..=2 {
            match self.aria2.start().await {
                Ok(ep) => {
                    let version = self
                        .aria2
                        .get_version()
                        .await
                        .ok()
                        .and_then(|v| {
                            v.get("version")
                                .and_then(Value::as_str)
                                .map(ToString::to_string)
                        })
                        .unwrap_or_else(|| "unknown".to_string());
                    let stderr = self.aria2.stderr_tail().unwrap_or_default();
                    let message = if stderr.is_empty() {
                        format!(
                            "startup check passed on attempt {attempt}: aria2 {version} at {}",
                            ep.endpoint
                        )
                    } else {
                        format!(
                            "startup check passed on attempt {attempt}: aria2 {version} at {}. stderr: {stderr}",
                            ep.endpoint
                        )
                    };
                    self.push_log("startup_check_aria2", message.clone());
                    return Ok(message);
                }
                Err(e) => {
                    attempts.push(format!("attempt {attempt} failed: {e}"));
                    let _ = self.aria2.stop().await;
                    time::sleep(Duration::from_millis(350)).await;
                }
            }
        }
        let stderr = self.aria2.stderr_tail().unwrap_or_default();
        let message = if stderr.is_empty() {
            format!("startup check failed: {}", attempts.join(" | "))
        } else {
            format!(
                "startup check failed: {}. stderr: {}",
                attempts.join(" | "),
                stderr
            )
        };
        self.push_log("startup_check_aria2", message.clone());
        Err(anyhow!(message))
    }

    pub async fn startup_self_check_summary(&self) -> Result<StartupSelfCheck> {
        let aria2_bin_path = self.aria2_bin_path();
        let aria2_path = PathBuf::from(&aria2_bin_path);
        let aria2_path_source = self.aria2_path_source(&aria2_path);
        let aria2_bin_exists = aria2_path.exists();
        let aria2_bin_executable = is_executable(&aria2_path);

        let download_dir = self.configured_download_dir()?;
        let download_path = PathBuf::from(&download_dir);
        let download_dir_exists = download_path.exists();
        if !download_dir_exists {
            let _ = fs::create_dir_all(&download_path);
        }
        let download_dir_writable = is_dir_writable(&download_path);

        let endpoint = self.aria2.endpoint().await;
        let rpc_ready = endpoint.is_some();
        let rpc_endpoint = endpoint.map(|ep| ep.endpoint);

        Ok(StartupSelfCheck {
            aria2_bin_path,
            aria2_path_source,
            aria2_bin_exists,
            aria2_bin_executable,
            download_dir,
            download_dir_exists: download_path.exists(),
            download_dir_writable,
            rpc_ready,
            rpc_endpoint,
        })
    }

    pub fn get_storage_summary(&self) -> Result<StorageSummary> {
        let download_dir = self.configured_download_dir()?;
        let free_bytes = fs2::available_space(Path::new(&download_dir)).unwrap_or(0);
        Ok(StorageSummary {
            download_dir,
            free_bytes,
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

        let archive = download_asset_archive(
            asset_url,
            asset_name,
            github_cdn.as_deref(),
            github_token.as_deref(),
        )
        .await?;
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
        let _ = self.db.prune_deleted_gids_before(now - 30 * 24 * 3600);
        let _ = self.purge_recovered_error_placeholders(now);

        let _ = self.db.update_from_snapshots(&snapshots, now)?;

        let mut created = 0usize;
        let mut skipped_deleted = 0usize;
        let mut skipped_terminal_orphans = 0usize;
        let mut skipped_empty_orphans = 0usize;
        let default_dir = self.configured_download_dir()?;
        for snapshot in snapshots {
            if let Some(existing) = self.db.get_task_by_gid(&snapshot.gid)? {
                if is_terminal_aria2_status(&snapshot.status)
                    && is_recovered_source(&existing.source)
                    && existing.total_length == 0
                    && existing.completed_length == 0
                {
                    let _ = self.db.mark_deleted_gid(&snapshot.gid, now);
                    let _ = self.db.remove_task(&existing.id);
                    let _ = self.aria2.remove_download_result(&snapshot.gid).await;
                    skipped_terminal_orphans += 1;
                }
                continue;
            }
            if self.db.is_gid_deleted(&snapshot.gid)? {
                skipped_deleted += 1;
                let _ = self.aria2.remove(&snapshot.gid, true).await;
                let _ = self.aria2.remove_download_result(&snapshot.gid).await;
                continue;
            }
            if is_terminal_aria2_status(&snapshot.status) {
                skipped_terminal_orphans += 1;
                let _ = self.db.mark_deleted_gid(&snapshot.gid, now);
                let _ = self.aria2.remove(&snapshot.gid, true).await;
                let _ = self.aria2.remove_download_result(&snapshot.gid).await;
                continue;
            }
            if snapshot.total_length == 0 && snapshot.completed_length == 0 {
                skipped_empty_orphans += 1;
                let _ = self.db.mark_deleted_gid(&snapshot.gid, now);
                let _ = self.aria2.remove(&snapshot.gid, true).await;
                let _ = self.aria2.remove_download_result(&snapshot.gid).await;
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
                category: None,
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
            format!(
                "reconciled, recovered {created} orphan task(s), skipped {skipped_deleted} deleted gid(s), skipped {skipped_terminal_orphans} terminal orphan(s), skipped {skipped_empty_orphans} empty orphan(s)"
            ),
        );
        Ok(created)
    }

    fn purge_recovered_error_placeholders(&self, now: i64) -> Result<usize> {
        let mut purged = 0usize;
        let tasks = self.db.list_tasks(None, 5000, 0)?;
        for task in tasks {
            if !is_recovered_source(&task.source) {
                continue;
            }
            if task.status != TaskStatus::Error {
                continue;
            }
            if task.total_length != 0 || task.completed_length != 0 {
                continue;
            }
            if let Some(gid) = task.aria2_gid.as_ref() {
                let _ = self.db.mark_deleted_gid(gid, now);
            }
            let _ = self.db.remove_task(&task.id);
            purged += 1;
        }
        if purged > 0 {
            self.push_log(
                "reconcile_cleanup",
                format!("purged {purged} recovered error placeholder task(s)"),
            );
        }
        Ok(purged)
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
        let _ = self.apply_saved_runtime_global_options().await;
        let _ = self.reconcile_with_aria2_inner().await;
        let compat_hint = if endpoint.compat_mode {
            " (compatibility mode)"
        } else {
            ""
        };
        let message = format!("restarted at {}{}", endpoint.endpoint, compat_hint);
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

    pub async fn export_debug_bundle(&self) -> Result<String> {
        let diagnostics = self.get_diagnostics().await?;
        let logs = self.list_operation_logs(1000)?;
        let redacted_logs = redact_operation_logs(&logs);
        let tasks = self.db.list_tasks(None, u32::MAX, 0)?;
        let mut files = Vec::<TaskFile>::new();
        for task in &tasks {
            let mut task_files = self.db.list_task_files(&task.id)?;
            files.append(&mut task_files);
        }
        let integrity = self.db.run_integrity_check()?;
        let media_merge_jobs = redact_media_merge_jobs(&self.db.list_media_merge_jobs(2000)?);

        let ts = now_ts();
        let base_dir = std::env::temp_dir().join(format!("flamingo-debug-{ts}"));
        fs::create_dir_all(&base_dir)?;

        let diagnostics_path = base_dir.join("diagnostics.json");
        let logs_path = base_dir.join("operation_logs.redacted.json");
        let tasks_path = base_dir.join("tasks.json");
        let files_path = base_dir.join("task_files.json");
        let integrity_path = base_dir.join("db_integrity_check.txt");
        let db_snapshot_path = base_dir.join("app.db.snapshot");
        let media_merge_jobs_path = base_dir.join("media_merge_jobs.redacted.json");

        fs::write(&diagnostics_path, serde_json::to_vec_pretty(&diagnostics)?)?;
        fs::write(&logs_path, serde_json::to_vec_pretty(&redacted_logs)?)?;
        fs::write(&tasks_path, serde_json::to_vec_pretty(&tasks)?)?;
        fs::write(&files_path, serde_json::to_vec_pretty(&files)?)?;
        fs::write(&integrity_path, format!("{integrity}\n"))?;
        fs::write(
            &media_merge_jobs_path,
            serde_json::to_vec_pretty(&media_merge_jobs)?,
        )?;
        let _ = self.db.copy_db_snapshot(&db_snapshot_path)?;

        let zip_path = std::env::temp_dir().join(format!("flamingo-debug-{ts}.zip"));
        let zip_file = File::create(&zip_path)?;
        let mut zip = zip::ZipWriter::new(zip_file);
        let opts =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for (name, path) in [
            ("diagnostics.json", diagnostics_path),
            ("operation_logs.redacted.json", logs_path),
            ("tasks.json", tasks_path),
            ("task_files.json", files_path),
            ("db_integrity_check.txt", integrity_path),
            ("media_merge_jobs.redacted.json", media_merge_jobs_path),
            ("app.db.snapshot", db_snapshot_path),
        ] {
            let content = fs::read(path)?;
            zip.start_file(name, opts)?;
            use std::io::Write as _;
            zip.write_all(&content)?;
        }
        zip.finish()?;
        self.push_log(
            "export_debug_bundle",
            format!("debug bundle exported to {}", zip_path.display()),
        );
        Ok(zip_path.to_string_lossy().to_string())
    }

    pub fn export_task_list_json(&self) -> Result<String> {
        let tasks = self.db.list_tasks(None, u32::MAX, 0)?;
        let mut task_files = Vec::new();
        for task in &tasks {
            let mut files = self.db.list_task_files(&task.id)?;
            task_files.append(&mut files);
        }
        let snapshot = TaskListSnapshot {
            version: 1,
            exported_at: now_ts(),
            tasks,
            task_files,
        };
        serde_json::to_string_pretty(&snapshot).map_err(Into::into)
    }

    pub fn import_task_list_json(&self, payload: &str) -> Result<ImportTaskListResult> {
        let snapshot: TaskListSnapshot =
            serde_json::from_str(payload).map_err(|e| anyhow!("invalid snapshot json: {e}"))?;
        let mut imported_tasks = 0usize;
        let mut imported_files = 0usize;

        for mut task in snapshot.tasks {
            task.aria2_gid = None;
            self.db.upsert_task(&task)?;
            imported_tasks += 1;
        }

        let mut by_task: std::collections::HashMap<String, Vec<TaskFile>> =
            std::collections::HashMap::new();
        for file in snapshot.task_files {
            by_task.entry(file.task_id.clone()).or_default().push(file);
        }
        for (task_id, files) in by_task {
            self.db.replace_task_files(&task_id, &files)?;
            imported_files += files.len();
        }

        self.push_log(
            "import_task_list_json",
            format!("imported tasks={imported_tasks}, files={imported_files}"),
        );
        Ok(ImportTaskListResult {
            imported_tasks,
            imported_files,
        })
    }

    pub fn get_app_update_strategy(&self) -> Result<AppUpdateStrategy> {
        Ok(AppUpdateStrategy {
            mode: "manual_release".to_string(),
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            channel: "stable".to_string(),
            notes: "Current build uses GitHub release artifacts for manual updates. Future migration target: Tauri updater with signed metadata feed.".to_string(),
        })
    }

    pub fn set_startup_notice(&self, level: &str, message: &str) -> Result<()> {
        self.db.set_setting("startup_notice_level", level)?;
        self.db.set_setting("startup_notice_message", message)?;
        Ok(())
    }

    pub fn consume_startup_notice(&self) -> Result<Option<crate::models::StartupNotice>> {
        let message = self
            .db
            .get_setting("startup_notice_message")?
            .unwrap_or_default()
            .trim()
            .to_string();
        if message.is_empty() {
            return Ok(None);
        }
        let level = self
            .db
            .get_setting("startup_notice_level")?
            .unwrap_or_else(|| "info".to_string());
        self.db.set_setting("startup_notice_message", "")?;
        self.db.set_setting("startup_notice_level", "")?;
        Ok(Some(crate::models::StartupNotice { level, message }))
    }

    pub async fn apply_saved_runtime_global_options(&self) -> Result<()> {
        let settings = self.db.load_global_settings()?;
        let mut aria2_options = serde_json::Map::new();
        if let Some(v) = settings.download_dir.filter(|v| !v.trim().is_empty()) {
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
        if let Some(v) = settings
            .max_overall_download_limit
            .filter(|v| !v.trim().is_empty())
        {
            aria2_options.insert("max-overall-download-limit".to_string(), json!(v));
        }
        if let Some(v) = settings.bt_tracker.filter(|v| !v.trim().is_empty()) {
            aria2_options.insert("bt-tracker".to_string(), json!(v));
        }

        if aria2_options.is_empty() {
            return Ok(());
        }
        if self.aria2.endpoint().await.is_some() {
            self.aria2
                .change_global_option(Value::Object(aria2_options))
                .await?;
            return Ok(());
        }
        self.push_log(
            "apply_runtime_options",
            "aria2 not running, options saved and will apply on next restart".to_string(),
        );
        Ok(())
    }

    async fn apply_speed_plan_if_needed(&self) -> Result<()> {
        let settings = self.get_global_settings()?;
        let plan_json = settings.speed_plan.unwrap_or_default();
        if plan_json.trim().is_empty() {
            return Ok(());
        }
        let rules: Vec<SpeedPlanRule> = serde_json::from_str(&plan_json).unwrap_or_default();
        if rules.is_empty() {
            return Ok(());
        }
        let desired = select_speed_limit(&rules).unwrap_or_else(|| "0".to_string());
        let prev = self
            .last_speed_limit
            .lock()
            .expect("last_speed_limit mutex poisoned")
            .clone();
        if prev.as_deref() == Some(desired.as_str()) {
            return Ok(());
        }
        if self.aria2.endpoint().await.is_some() {
            let _ = self
                .aria2
                .change_global_option(json!({ "max-overall-download-limit": desired }))
                .await;
        }
        *self
            .last_speed_limit
            .lock()
            .expect("last_speed_limit mutex poisoned") = Some(desired.clone());
        self.push_log(
            "speed_plan",
            format!("applied max-overall-download-limit={desired}"),
        );
        Ok(())
    }

    async fn process_retry_and_metadata_policies(&self) -> Result<()> {
        let settings = self.get_global_settings()?;
        let retry_max_attempts = settings.retry_max_attempts.unwrap_or(2);
        let retry_backoff_secs = settings.retry_backoff_secs.unwrap_or(15) as i64;
        let metadata_timeout_secs = settings.metadata_timeout_secs.unwrap_or(180) as i64;
        let mirrors = settings
            .retry_fallback_mirrors
            .unwrap_or_default()
            .split([',', '\n'])
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();

        let tasks = self.db.list_tasks(None, 2000, 0)?;
        let now = now_ts();
        for mut task in tasks {
            match task.status {
                TaskStatus::Metadata => {
                    if now - task.created_at > metadata_timeout_secs && task.total_length == 0 {
                        task.status = TaskStatus::Error;
                        task.error_code = Some("METADATA_TIMEOUT".to_string());
                        task.error_message = Some(format!(
                            "magnet metadata timed out after {}s",
                            metadata_timeout_secs
                        ));
                        task.updated_at = now;
                        self.db.upsert_task(&task)?;
                        self.push_log(
                            "metadata_timeout",
                            format!("task {} metadata timed out", task.id),
                        );
                    }
                }
                TaskStatus::Error => {
                    if retry_max_attempts == 0 {
                        continue;
                    }
                    let current_state = {
                        let mut lock = self.retry_state.lock().expect("retry_state mutex poisoned");
                        lock.entry(task.id.clone())
                            .or_insert(RetryState {
                                attempts: 0,
                                next_retry_at: now,
                            })
                            .clone()
                    };
                    if current_state.attempts >= retry_max_attempts
                        || now < current_state.next_retry_at
                    {
                        continue;
                    }
                    if let Ok(new_gid) = self
                        .retry_task_with_fallback(&task, current_state.attempts as usize, &mirrors)
                        .await
                    {
                        task.aria2_gid = Some(new_gid);
                        task.status = TaskStatus::Queued;
                        task.error_code = None;
                        task.error_message = None;
                        task.updated_at = now;
                        self.db.upsert_task(&task)?;
                        let mut lock = self.retry_state.lock().expect("retry_state mutex poisoned");
                        let state = lock.entry(task.id.clone()).or_insert(RetryState {
                            attempts: 0,
                            next_retry_at: now,
                        });
                        state.attempts += 1;
                        state.next_retry_at =
                            compute_next_retry_at(now, retry_backoff_secs, state.attempts);
                        self.push_log(
                            "auto_retry",
                            format!("retried task {} attempt {}", task.id, state.attempts),
                        );
                    } else {
                        let mut lock = self.retry_state.lock().expect("retry_state mutex poisoned");
                        let state = lock.entry(task.id.clone()).or_insert(RetryState {
                            attempts: 0,
                            next_retry_at: now,
                        });
                        state.attempts += 1;
                        state.next_retry_at =
                            compute_next_retry_at(now, retry_backoff_secs, state.attempts);
                    }
                }
                _ => {
                    self.retry_state
                        .lock()
                        .expect("retry_state mutex poisoned")
                        .remove(&task.id);
                }
            }
        }

        Ok(())
    }

    async fn retry_task_with_fallback(
        &self,
        task: &Task,
        attempt: usize,
        mirrors: &[String],
    ) -> Result<String> {
        self.ensure_aria2_ready().await?;
        match task.task_type {
            TaskType::Http => {
                let source = apply_fallback_source(&task.source, attempt, mirrors);
                self.aria2
                    .add_uri(
                        vec![source],
                        Some(to_aria2_options(AddTaskOptions {
                            save_dir: Some(task.save_dir.clone()),
                            out: task.name.clone(),
                            ..AddTaskOptions::default()
                        })),
                    )
                    .await
            }
            TaskType::Magnet => {
                self.aria2
                    .add_uri(
                        vec![task.source.clone()],
                        Some(to_aria2_options(AddTaskOptions {
                            save_dir: Some(task.save_dir.clone()),
                            ..AddTaskOptions::default()
                        })),
                    )
                    .await
            }
            _ => Err(anyhow!("auto retry currently supports http/magnet tasks")),
        }
    }

    pub fn start_sync_loop(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_millis(1000));
            let mut tick: u64 = 0;
            loop {
                interval.tick().await;
                tick = tick.wrapping_add(1);
                let _ = self.flush_pending_logs();
                if tick.is_multiple_of(30) {
                    let _ = self.apply_speed_plan_if_needed().await;
                }
                if tick.is_multiple_of(5) {
                    let _ = self.process_retry_and_metadata_policies().await;
                }
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

                let _ = self.apply_completion_rules(&changed_tasks, tick);

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

fn is_stream_manifest_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains(".m3u8") || lower.contains(".mpd")
}

fn normalize_bridge_referer(referer: Option<String>) -> Result<Option<String>> {
    let Some(v) = referer
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };
    let parsed = reqwest::Url::parse(&v).map_err(|e| anyhow!("invalid referer: {e}"))?;
    let scheme = parsed.scheme();
    if !matches!(scheme, "http" | "https") {
        return Err(anyhow!("unsupported referer scheme: {scheme}"));
    }
    Ok(Some(v))
}

fn normalize_bridge_headers(headers: Vec<String>) -> Result<Vec<String>> {
    let allowed = [
        "accept",
        "accept-language",
        "cookie",
        "origin",
        "referer",
        "user-agent",
    ];
    let mut out = Vec::new();
    for line in headers {
        let clean = line.trim();
        if clean.is_empty() {
            continue;
        }
        let Some((name, value)) = clean.split_once(':') else {
            return Err(anyhow!("invalid header format: {clean}"));
        };
        let key = name.trim().to_ascii_lowercase();
        if !allowed.contains(&key.as_str()) {
            continue;
        }
        let val = value.trim();
        if val.is_empty() {
            continue;
        }
        out.push(format!("{}: {}", name.trim(), val));
    }
    Ok(out)
}

fn stream_output_filename(url: &str) -> String {
    let candidate = reqwest::Url::parse(url)
        .ok()
        .and_then(|u| {
            Path::new(u.path())
                .file_stem()
                .map(|v| v.to_string_lossy().to_string())
        })
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| format!("stream-{}", now_ts()));
    format!("{candidate}.mp4")
}

fn is_dir_writable(path: &Path) -> bool {
    if !path.exists() || !path.is_dir() {
        return false;
    }
    let probe = path.join(format!(".flamingo-write-check-{}", Uuid::new_v4()));
    match fs::write(&probe, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn is_executable(path: &Path) -> bool {
    if !path.exists() || !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return fs::metadata(path)
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[cfg(windows)]
    {
        return path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| matches!(e.to_ascii_lowercase().as_str(), "exe" | "bat" | "cmd"))
            .unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
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
    if let Some(v) = options.max_download_limit {
        let limit = v.trim();
        if !limit.is_empty() {
            m.insert("max-download-limit".to_string(), json!(limit));
        }
    }
    if let Some(v) = options.max_upload_limit {
        let limit = v.trim();
        if !limit.is_empty() {
            m.insert("max-upload-limit".to_string(), json!(limit));
        }
    }
    if let Some(v) = options.seed_ratio {
        if v > 0.0 {
            m.insert("seed-ratio".to_string(), json!(v.to_string()));
        }
    }
    if let Some(v) = options.seed_time {
        if v > 0 {
            m.insert("seed-time".to_string(), json!(v.to_string()));
        }
    }
    if let Some(v) = options.user_agent {
        let ua = v.trim();
        if !ua.is_empty() {
            m.insert("user-agent".to_string(), json!(ua));
        }
    }
    if let Some(v) = options.referer {
        let referer = v.trim();
        if !referer.is_empty() {
            m.insert("referer".to_string(), json!(referer));
        }
    }
    if !options.headers.is_empty() {
        let headers = options
            .headers
            .into_iter()
            .map(|h| h.trim().to_string())
            .filter(|h| !h.is_empty())
            .collect::<Vec<_>>();
        if !headers.is_empty() {
            m.insert("header".to_string(), json!(headers));
        }
    }
    Value::Object(m)
}

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn select_speed_limit(rules: &[SpeedPlanRule]) -> Option<String> {
    let now = Local::now();
    let weekday = now.weekday().number_from_monday();
    let current_minute = now.hour() as i32 * 60 + now.minute() as i32;
    for rule in rules {
        let limit = rule.limit.trim();
        if limit.is_empty() {
            continue;
        }
        if let Some(days) = &rule.days {
            let allowed = days
                .split(',')
                .filter_map(|d| d.trim().parse::<u32>().ok())
                .any(|d| d == weekday);
            if !allowed {
                continue;
            }
        }
        let start = rule
            .start
            .as_deref()
            .and_then(parse_hhmm_minutes)
            .unwrap_or(0);
        let end = rule
            .end
            .as_deref()
            .and_then(parse_hhmm_minutes)
            .unwrap_or(24 * 60);
        let in_range = if start <= end {
            current_minute >= start && current_minute < end
        } else {
            current_minute >= start || current_minute < end
        };
        if in_range {
            return Some(limit.to_string());
        }
    }
    None
}

fn parse_hhmm_minutes(v: &str) -> Option<i32> {
    let (h, m) = v.split_once(':')?;
    let hh = h.parse::<i32>().ok()?;
    let mm = m.parse::<i32>().ok()?;
    if !(0..=23).contains(&hh) || !(0..=59).contains(&mm) {
        return None;
    }
    Some(hh * 60 + mm)
}

fn compute_next_retry_at(now_ts: i64, backoff_secs: i64, attempts: u32) -> i64 {
    now_ts + backoff_secs * (attempts as i64 + 1)
}

fn apply_fallback_source(source: &str, attempt: usize, mirrors: &[String]) -> String {
    if mirrors.is_empty() || attempt == 0 {
        return source.to_string();
    }
    let idx = (attempt - 1) % mirrors.len();
    let prefix = mirrors[idx].trim_end_matches('/');
    if source.starts_with("http://") || source.starts_with("https://") {
        format!("{prefix}/{}", source.trim_start_matches('/'))
    } else {
        source.to_string()
    }
}

fn absolute_path(base: &Path, value: &str) -> PathBuf {
    let p = Path::new(value);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        base.join(p)
    }
}

fn normalize_lexical_path(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
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
        let mut last_err = None;
        for attempt in 1..=2 {
            match self.aria2.ensure_started().await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    self.push_log(
                        "ensure_aria2_ready",
                        format!("attempt {attempt} failed: {e}"),
                    );
                    last_err = Some(e.to_string());
                    let _ = self.aria2.stop().await;
                    time::sleep(Duration::from_millis(300)).await;
                }
            }
        }
        let err = last_err.unwrap_or_else(|| "unknown startup error".to_string());
        let stderr = self.aria2.stderr_tail().unwrap_or_default();
        if stderr.is_empty() {
            Err(anyhow!(
                "aria2 is unavailable. Please check aria2 path in Settings and restart aria2. details: {err}"
            ))
        } else {
            Err(anyhow!(
                "aria2 is unavailable. Please check aria2 path in Settings and restart aria2. details: {err}. stderr: {stderr}"
            ))
        }
    }

    fn configured_download_dir(&self) -> Result<String> {
        self.db.get_setting("download_dir")?.ok_or_else(|| {
            AppError::InvalidInput("missing required setting: download_dir".to_string()).into()
        })
    }

    fn configured_download_dir_rules(&self) -> Vec<DownloadDirRule> {
        self.db
            .load_global_settings()
            .map(|s| s.download_dir_rules)
            .unwrap_or_default()
    }

    fn resolve_save_dir_for_new_task(
        &self,
        task_type: TaskType,
        source: &str,
        options: &AddTaskOptions,
        http_content_type: Option<&str>,
    ) -> Result<String> {
        self.resolve_save_dir_for_new_task_detail(task_type, source, options, http_content_type)
            .map(|v| v.0)
    }

    fn resolve_category_for_new_task(
        &self,
        task_type: TaskType,
        source: &str,
        http_content_type: Option<&str>,
    ) -> Result<Option<String>> {
        let settings = self.db.load_global_settings()?;
        for rule in settings.category_rules {
            if !rule.enabled {
                continue;
            }
            if category_rule_matches(&rule, &task_type, source, http_content_type) {
                let category = rule.category.trim();
                if !category.is_empty() {
                    return Ok(Some(category.to_string()));
                }
            }
        }
        Ok(None)
    }

    fn resolve_save_dir_for_new_task_detail(
        &self,
        task_type: TaskType,
        source: &str,
        options: &AddTaskOptions,
        http_content_type: Option<&str>,
    ) -> Result<(String, Option<DownloadDirRule>)> {
        if let Some(v) = options
            .save_dir
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            return Ok((v.to_string(), None));
        }
        let default_dir = self.configured_download_dir()?;
        for rule in self.configured_download_dir_rules() {
            if !rule.enabled {
                continue;
            }
            let candidate = rule.save_dir.trim();
            if candidate.is_empty() {
                continue;
            }
            if rule_matches(&rule, &task_type, source, http_content_type) {
                let resolved = apply_rule_subdir(candidate, &rule, source);
                return Ok((resolved, Some(rule)));
            }
        }
        Ok((default_dir, None))
    }

    fn aria2_bin_path(&self) -> String {
        self.db
            .get_setting("aria2_bin_path")
            .ok()
            .flatten()
            .unwrap_or_default()
    }

    fn aria2_path_source(&self, path: &Path) -> String {
        let manual = self
            .db
            .get_setting("manual_aria2_bin_path")
            .ok()
            .flatten()
            .unwrap_or_default();
        if !manual.trim().is_empty() && Path::new(manual.trim()) == path {
            return "manual".to_string();
        }

        if let Some(resource_dir) = std::env::var_os("FLAMINGO_RESOURCE_DIR").map(PathBuf::from) {
            let bundled_root = resource_dir.join("aria2").join("bin");
            if path.starts_with(&bundled_root) {
                return "bundled".to_string();
            }
        }

        let path_text = path.to_string_lossy();
        if path_text.contains("/aria2/bin/") || path_text.contains("\\aria2\\bin\\") {
            return "bundled".to_string();
        }

        "system".to_string()
    }

    fn aria2_bin_exists(&self) -> bool {
        let path = self.aria2_bin_path();
        !path.is_empty() && Path::new(&path).exists()
    }

    fn delete_task_files_safely(&self, task: &Task) -> Result<()> {
        let configured_root = self.configured_download_dir()?;
        let root_raw = absolute_path(&std::env::current_dir()?, &configured_root);
        if !root_raw.exists() {
            self.push_log(
                "delete_task_files",
                format!("skip cleanup for task {}: download root missing", task.id),
            );
            return Ok(());
        }
        let root = root_raw.canonicalize()?;
        let task_save_dir = absolute_path(&std::env::current_dir()?, &task.save_dir);
        let task_save_dir_canonical = task_save_dir
            .canonicalize()
            .map_err(|e| anyhow!("resolve task save_dir failed ({}): {e}", task.save_dir))?;
        if !is_subpath(&task_save_dir_canonical, &root) {
            return Err(anyhow!(
                "refused to delete files outside download root: {}",
                task_save_dir_canonical.display()
            ));
        }

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

        let mut blocked = Vec::new();
        let mut failed = Vec::new();
        let mut removed = 0usize;

        for candidate in &candidates {
            let normalized = normalize_lexical_path(candidate);
            if !is_subpath(&normalized, &root) {
                blocked.push(normalized.display().to_string());
                continue;
            }
            if !candidate.exists() {
                continue;
            }
            let canonical = match candidate.canonicalize() {
                Ok(v) => v,
                Err(e) => {
                    failed.push(format!("resolve {} failed: {e}", candidate.display()));
                    continue;
                }
            };
            if !is_subpath(&canonical, &root) {
                blocked.push(canonical.display().to_string());
                continue;
            }
            let remove_result = if canonical.is_dir() {
                fs::remove_dir_all(&canonical)
            } else {
                fs::remove_file(&canonical)
            };
            if let Err(e) = remove_result {
                failed.push(format!("remove {} failed: {e}", canonical.display()));
            } else {
                removed += 1;
            }
        }

        if !blocked.is_empty() {
            return Err(anyhow!(
                "refused to delete {} path(s) outside download root: {}",
                blocked.len(),
                blocked.join(" | ")
            ));
        }
        if !failed.is_empty() {
            return Err(anyhow!(
                "failed to delete {} path(s): {}",
                failed.len(),
                failed.join(" | ")
            ));
        }

        for candidate in &candidates {
            if let Some(parent) = candidate.parent() {
                cleanup_empty_dirs_upwards(parent, &root);
            }
        }
        self.push_log(
            "delete_task_files",
            format!("cleanup finished for task {}: removed {}", task.id, removed),
        );
        Ok(())
    }

    pub fn append_operation_log(&self, action: &str, message: impl Into<String>) {
        self.push_log(action, message.into());
        let _ = self.flush_pending_logs();
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

fn with_resolved_save_dir(mut options: AddTaskOptions, save_dir: String) -> AddTaskOptions {
    options.save_dir = Some(save_dir);
    options
}

fn redact_operation_logs(logs: &[OperationLog]) -> Vec<OperationLog> {
    logs.iter()
        .map(|log| OperationLog {
            ts: log.ts,
            action: log.action.clone(),
            message: redact_sensitive_text(&log.message),
        })
        .collect()
}

fn redact_media_merge_jobs(items: &[MediaMergeJob]) -> Vec<MediaMergeJob> {
    items
        .iter()
        .map(|job| MediaMergeJob {
            task_id: job.task_id.clone(),
            input_url: redact_sensitive_text(&job.input_url),
            output_path: redact_sensitive_text(&job.output_path),
            ffmpeg_bin: redact_sensitive_text(&job.ffmpeg_bin),
            ffmpeg_args: redact_sensitive_text(&job.ffmpeg_args),
            status: job.status.clone(),
            error_message: job.error_message.as_deref().map(redact_sensitive_text),
            created_at: job.created_at,
            updated_at: job.updated_at,
        })
        .collect()
}

fn redact_sensitive_text(input: &str) -> String {
    let mut value = input.to_string();
    let markers = [
        "token:",
        "token=",
        "rpc-secret",
        "github_token",
        "authorization:",
        "Authorization:",
        "browser_bridge_token",
    ];
    for marker in markers {
        value = redact_marker_value(&value, marker);
    }
    value
}

fn redact_marker_value(input: &str, marker: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut remaining = input;
    while let Some(pos) = remaining.find(marker) {
        let (head, tail) = remaining.split_at(pos + marker.len());
        output.push_str(head);
        let token_len = tail
            .chars()
            .take_while(|c| !c.is_whitespace() && *c != '&' && *c != '|' && *c != ',' && *c != ';')
            .count();
        if token_len == 0 {
            remaining = tail;
            continue;
        }
        output.push_str("***");
        remaining = &tail[token_len..];
    }
    output.push_str(remaining);
    output
}

fn rule_matches(
    rule: &DownloadDirRule,
    task_type: &TaskType,
    source: &str,
    http_content_type: Option<&str>,
) -> bool {
    let matcher = rule.matcher.trim().to_lowercase();
    let patterns = rule
        .pattern
        .split(',')
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();
    if patterns.is_empty() {
        return false;
    }

    match matcher.as_str() {
        "type" => {
            let t = task_type_str(task_type);
            if patterns.iter().any(|p| p == t) {
                return true;
            }
            if !matches!(task_type, TaskType::Http) {
                return false;
            }
            let inferred = infer_http_type_candidates(source, http_content_type);
            patterns.iter().any(|p| inferred.iter().any(|v| v == p))
        }
        "domain" => {
            let host = reqwest::Url::parse(source)
                .ok()
                .and_then(|u| u.host_str().map(|v| v.to_lowercase()));
            let Some(host) = host else {
                return false;
            };
            patterns
                .iter()
                .any(|p| host == *p || host.ends_with(&format!(".{p}")))
        }
        "ext" => {
            let ext = reqwest::Url::parse(source).ok().and_then(|u| {
                Path::new(u.path())
                    .extension()
                    .map(|v| v.to_string_lossy().to_lowercase())
            });
            let Some(ext) = ext else {
                return false;
            };
            patterns.iter().any(|p| {
                let p = p.strip_prefix('.').unwrap_or(p.as_str());
                p == ext
            })
        }
        _ => false,
    }
}

fn category_rule_matches(
    rule: &CategoryRule,
    task_type: &TaskType,
    source: &str,
    http_content_type: Option<&str>,
) -> bool {
    let as_dir_rule = DownloadDirRule {
        enabled: rule.enabled,
        matcher: rule.matcher.clone(),
        pattern: rule.pattern.clone(),
        save_dir: String::new(),
        subdir_by_date: false,
        subdir_by_domain: false,
    };
    rule_matches(&as_dir_rule, task_type, source, http_content_type)
}

fn infer_http_type_candidates(source: &str, http_content_type: Option<&str>) -> Vec<String> {
    let mut out = Vec::<String>::new();
    if let Some(ct) = http_content_type {
        let ct = ct.trim().to_lowercase();
        if !ct.is_empty() {
            out.push(ct.clone());
            if let Some(group) = ct.split('/').next()
                && !group.is_empty()
            {
                out.push(group.to_string());
            }
        }
    }
    if let Some(ext) = reqwest::Url::parse(source).ok().and_then(|u| {
        Path::new(u.path())
            .extension()
            .map(|v| v.to_string_lossy().to_lowercase())
    }) {
        out.push(ext_to_type_group(&ext).to_string());
    }
    out.sort();
    out.dedup();
    out
}

fn ext_to_type_group(ext: &str) -> &'static str {
    match ext {
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" => "video",
        "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" => "audio",
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "svg" => "image",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => "archive",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" => "document",
        "txt" | "md" | "csv" | "json" | "xml" | "html" | "htm" => "text",
        _ => "binary",
    }
}

fn is_terminal_aria2_status(status: &str) -> bool {
    matches!(status, "complete" | "error" | "removed")
}

fn is_recovered_source(source: &str) -> bool {
    source.starts_with("aria2:recovered:")
}

async fn detect_http_content_type(url: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()?;
    let response = client.head(url).send().await.ok()?;
    response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or(v).trim().to_lowercase())
}

fn task_type_str(task_type: &TaskType) -> &'static str {
    match task_type {
        TaskType::Http => "http",
        TaskType::Torrent => "torrent",
        TaskType::Magnet => "magnet",
        TaskType::Metalink => "metalink",
    }
}

fn apply_rule_subdir(base: &str, rule: &DownloadDirRule, source: &str) -> String {
    let mut path = PathBuf::from(base);
    if rule.subdir_by_domain
        && let Some(host) = reqwest::Url::parse(source)
            .ok()
            .and_then(|u| u.host_str().map(ToString::to_string))
            .map(|v| v.trim().to_lowercase())
            .filter(|v| !v.is_empty())
    {
        path = path.join(host);
    }
    if rule.subdir_by_date {
        let date = Local::now().format("%Y-%m-%d").to_string();
        path = path.join(date);
    }
    path.to_string_lossy().to_string()
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
    let repos = ["aria2/aria2", "abcfy2/aria2-static-build"];
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
        Err(last_error.unwrap_or_else(|| {
            anyhow!("no compatible binary asset found for current platform ({platform})")
        }))
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

async fn fetch_json(
    client: &reqwest::Client,
    url: &str,
    github_token: Option<&str>,
) -> Result<Value> {
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
        let snippet = String::from_utf8_lossy(&body)
            .chars()
            .take(200)
            .collect::<String>();
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

fn parse_release_info(
    payload: &Value,
    github_cdn: Option<&str>,
    repo: &str,
) -> Option<ReleaseInfo> {
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
            let url = if github_cdn.is_some() {
                raw_url.clone()
            } else {
                raw_url
            };
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
        vec![
            "macos", "darwin", "osx", "apple", "mac", "mac12", "mac13", "mac14",
        ]
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
            if !is_supported_asset_name(&name) {
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
            if os_score {
                score += 8;
            }
            if arch_score {
                score += 5;
            }
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
        "windows", "win-", "mingw", "linux", "android", "darwin", "osx", "mac", "apple", "x86_64",
        "amd64", "x64", "aarch64", "arm64", "armv8", "32bit", "64bit",
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
        if name.ends_with("/aria2c")
            || name.ends_with("/aria2c.exe")
            || name == "aria2c"
            || name == "aria2c.exe"
        {
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
        if path.ends_with("/aria2c")
            || path.ends_with("/aria2c.exe")
            || path == "aria2c"
            || path == "aria2c.exe"
        {
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
    let mut command = std::process::Command::new(path);
    command.arg("--version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command.output()?;
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
        models::{Aria2TaskSnapshot, DownloadDirRule, Task, TaskStatus, TaskType},
    };

    use super::{
        DownloadService, SpeedPlanRule, absolute_path, compute_next_retry_at, is_subpath,
        rule_matches, select_speed_limit,
    };

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

    #[test]
    fn download_rule_matches_extension() {
        let rule = DownloadDirRule {
            enabled: true,
            matcher: "ext".to_string(),
            pattern: "zip,mp4".to_string(),
            save_dir: "/tmp/media".to_string(),
            subdir_by_date: false,
            subdir_by_domain: false,
        };
        assert!(rule_matches(
            &rule,
            &TaskType::Http,
            "https://example.com/archive/file.zip",
            None
        ));
        assert!(!rule_matches(
            &rule,
            &TaskType::Http,
            "https://example.com/archive/file.txt",
            None
        ));
    }

    #[test]
    fn download_rule_matches_domain_and_type() {
        let domain_rule = DownloadDirRule {
            enabled: true,
            matcher: "domain".to_string(),
            pattern: "github.com,example.org".to_string(),
            save_dir: "/tmp/code".to_string(),
            subdir_by_date: false,
            subdir_by_domain: false,
        };
        assert!(rule_matches(
            &domain_rule,
            &TaskType::Http,
            "https://github.com/owner/repo/archive/main.zip",
            None
        ));
        assert!(rule_matches(
            &domain_rule,
            &TaskType::Http,
            "https://a.github.com/file.bin",
            None
        ));

        let type_rule = DownloadDirRule {
            enabled: true,
            matcher: "type".to_string(),
            pattern: "magnet,torrent".to_string(),
            save_dir: "/tmp/bt".to_string(),
            subdir_by_date: false,
            subdir_by_domain: false,
        };
        assert!(rule_matches(
            &type_rule,
            &TaskType::Magnet,
            "magnet:?xt=urn:btih:abc",
            None
        ));
        assert!(!rule_matches(
            &type_rule,
            &TaskType::Http,
            "https://example.com/a.bin",
            None
        ));
    }

    #[test]
    fn speed_plan_selects_non_empty_limit_rule() {
        let rules = vec![
            SpeedPlanRule {
                days: None,
                start: None,
                end: None,
                limit: "".to_string(),
            },
            SpeedPlanRule {
                days: None,
                start: None,
                end: None,
                limit: "2M".to_string(),
            },
        ];
        let selected = select_speed_limit(&rules);
        assert_eq!(selected.as_deref(), Some("2M"));
    }

    #[test]
    fn retry_next_time_uses_backoff_and_attempt() {
        let now = 1_700_000_000_i64;
        let backoff = 15_i64;
        assert_eq!(compute_next_retry_at(now, backoff, 1), now + 30);
        assert_eq!(compute_next_retry_at(now, backoff, 2), now + 45);
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
                compat_mode: false,
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
                compat_mode: false,
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

        async fn remove_download_result(&self, _gid: &str) -> Result<String> {
            self.call("remove_download_result");
            Ok("ok".to_string())
        }

        async fn tell_status(&self, _gid: &str) -> Result<Value> {
            self.call("tell_status");
            Ok(json!({ "files": [] }))
        }

        async fn get_peers(&self, _gid: &str) -> Result<Vec<Value>> {
            self.call("get_peers");
            Ok(Vec::new())
        }

        async fn tell_all(&self) -> Result<Vec<Aria2TaskSnapshot>> {
            self.call("tell_all");
            Ok(self.snapshots.lock().expect("snapshots mutex").clone())
        }

        async fn change_position(&self, _gid: &str, _pos: i64, _how: &str) -> Result<i64> {
            self.call("change_position");
            Ok(0)
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

        async fn get_global_option(&self) -> Result<Value> {
            self.call("get_global_option");
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

        fn stderr_tail(&self) -> Option<String> {
            None
        }
    }

    fn build_service(
        mock: Arc<MockAria2>,
    ) -> (Arc<DownloadService>, Arc<Database>, Arc<MockAria2>) {
        let db_path = std::env::temp_dir().join(format!("tarui-svc-{}.sqlite", Uuid::new_v4()));
        let db = Arc::new(Database::new(&db_path).expect("create db"));
        std::fs::create_dir_all("/tmp/tarui-tests").expect("create test download root");
        db.set_setting("download_dir", "/tmp/tarui-tests")
            .expect("set download_dir");
        #[cfg(unix)]
        db.set_setting("aria2_bin_path", "/bin/sh")
            .expect("set aria2_bin_path");
        #[cfg(windows)]
        db.set_setting("aria2_bin_path", "C:\\Windows\\System32\\cmd.exe")
            .expect("set aria2_bin_path");
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
        assert!(calls.iter().any(|c| c == "remove_download_result"));
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

    #[tokio::test]
    async fn reconcile_skips_deleted_gid_tombstone() {
        let mock = Arc::new(MockAria2::default());
        mock.push_snapshot(Aria2TaskSnapshot {
            gid: "gid-deleted".to_string(),
            status: "active".to_string(),
            total_length: 1024,
            completed_length: 64,
            download_speed: 10,
            upload_speed: 0,
            connections: 1,
            error_code: None,
            error_message: None,
            name: Some("should-not-restore.bin".to_string()),
            has_metadata: true,
            files: vec![],
        });

        let (service, db, _mock) = build_service(mock);
        db.mark_deleted_gid("gid-deleted", super::now_ts())
            .expect("mark deleted gid");

        let created = service
            .reconcile_with_aria2()
            .await
            .expect("reconcile with aria2");
        assert_eq!(created, 0);

        let tasks = service
            .list_tasks(None, 20, 0)
            .expect("list tasks after reconcile");
        assert!(tasks.is_empty());
    }

    #[tokio::test]
    async fn remove_with_delete_files_rejects_outside_download_root() {
        let mock = Arc::new(MockAria2::default());
        let (service, db, _mock) = build_service(mock);
        let task_id = Uuid::new_v4().to_string();
        let now = super::now_ts();
        db.upsert_task(&Task {
            id: task_id.clone(),
            aria2_gid: Some("gid-outside".to_string()),
            task_type: TaskType::Http,
            source: "https://example.com/a.bin".to_string(),
            status: TaskStatus::Completed,
            name: Some("a.bin".to_string()),
            category: None,
            save_dir: "/tmp/tarui-tests".to_string(),
            total_length: 10,
            completed_length: 10,
            download_speed: 0,
            upload_speed: 0,
            connections: 0,
            error_code: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        })
        .expect("upsert task");
        db.replace_task_files(
            &task_id,
            &[crate::models::TaskFile {
                task_id: task_id.clone(),
                path: "/tmp/outside-danger.bin".to_string(),
                length: 10,
                completed_length: 10,
                selected: true,
            }],
        )
        .expect("replace files");

        let err = service
            .remove_task(&task_id, true)
            .await
            .expect_err("remove should reject outside path");
        let msg = err.to_string();
        assert!(msg.contains("outside download root"));
        assert!(
            db.get_task(&task_id).expect("get task").is_some(),
            "task record should remain when file delete is rejected"
        );
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
