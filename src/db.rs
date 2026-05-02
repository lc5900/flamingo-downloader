use std::{
    path::Path,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, OptionalExtension, params};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::models::{
    Aria2TaskSnapshot, CategoryRule, DownloadDirRule, GlobalSettings, MediaMergeJob, Task,
    TaskFile, TaskHealth, TaskStatus, TaskType,
};

pub struct Database {
    conn: Arc<Mutex<Connection>>,
    db_path: PathBuf,
}

const SCHEMA_VERSION: i64 = 8;

#[derive(Debug, serde::Deserialize)]
struct StoredSpeedPlanRule {
    days: Option<String>,
    start: Option<String>,
    end: Option<String>,
    limit: String,
}

#[derive(Debug, serde::Deserialize)]
struct StoredTaskOptionPreset {
    name: String,
    task_type: String,
    options: Value,
}

impl Database {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path_ref = path.as_ref();
        let conn = Connection::open(path_ref)
            .with_context(|| format!("open sqlite db: {}", path_ref.display()))?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: path_ref.to_path_buf(),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT PRIMARY KEY,
              aria2_gid TEXT,
              type TEXT NOT NULL,
              source TEXT NOT NULL,
              status TEXT NOT NULL,
              name TEXT,
              category TEXT,
              save_dir TEXT NOT NULL,
              total_length INTEGER DEFAULT 0,
              completed_length INTEGER DEFAULT 0,
              download_speed INTEGER DEFAULT 0,
              upload_speed INTEGER DEFAULT 0,
              connections INTEGER DEFAULT 0,
              health TEXT,
              error_code TEXT,
              error_message TEXT,
              remediation TEXT,
              retry_count INTEGER DEFAULT 0,
              last_retry_at INTEGER,
              checksum_algorithm TEXT,
              checksum_expected TEXT,
              checksum_actual TEXT,
              checksum_status TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_files (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              task_id TEXT NOT NULL,
              path TEXT NOT NULL,
              length INTEGER DEFAULT 0,
              completed_length INTEGER DEFAULT 0,
              selected INTEGER DEFAULT 1,
              FOREIGN KEY(task_id) REFERENCES tasks(id)
            );

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS media_merge_jobs (
              task_id TEXT PRIMARY KEY,
              input_url TEXT NOT NULL,
              output_path TEXT NOT NULL,
              ffmpeg_bin TEXT NOT NULL,
              ffmpeg_args TEXT NOT NULL,
              status TEXT NOT NULL,
              error_message TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_media_merge_jobs_updated_at ON media_merge_jobs(updated_at);
            "#,
        )?;
        run_schema_migrations(&conn)?;
        Ok(())
    }
    pub fn upsert_task(&self, task: &Task) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            r#"
            INSERT INTO tasks (
                id, aria2_gid, type, source, status, name, save_dir,
                category,
                total_length, completed_length, download_speed, upload_speed,
                connections, health, error_code, error_message, remediation,
                retry_count, last_retry_at, checksum_algorithm, checksum_expected,
                checksum_actual, checksum_status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)
            ON CONFLICT(id) DO UPDATE SET
              aria2_gid=excluded.aria2_gid,
              type=excluded.type,
              source=excluded.source,
              status=excluded.status,
              name=excluded.name,
              category=excluded.category,
              save_dir=excluded.save_dir,
              total_length=excluded.total_length,
              completed_length=excluded.completed_length,
              download_speed=excluded.download_speed,
              upload_speed=excluded.upload_speed,
              connections=excluded.connections,
              health=excluded.health,
              error_code=excluded.error_code,
              error_message=excluded.error_message,
              remediation=excluded.remediation,
              retry_count=excluded.retry_count,
              last_retry_at=excluded.last_retry_at,
              checksum_algorithm=excluded.checksum_algorithm,
              checksum_expected=excluded.checksum_expected,
              checksum_actual=excluded.checksum_actual,
              checksum_status=excluded.checksum_status,
              updated_at=excluded.updated_at
            "#,
            params![
                task.id,
                task.aria2_gid,
                to_type_str(&task.task_type),
                task.source,
                task.status.as_str(),
                task.name,
                task.save_dir,
                task.category,
                task.total_length,
                task.completed_length,
                task.download_speed,
                task.upload_speed,
                task.connections,
                task.health,
                task.error_code,
                task.error_message,
                task.remediation,
                task.retry_count,
                task.last_retry_at,
                task.checksum_algorithm,
                task.checksum_expected,
                task.checksum_actual,
                task.checksum_status,
                task.created_at,
                task.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_tasks(
        &self,
        status: Option<TaskStatus>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<Task>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut rows = if let Some(status) = status {
            let mut stmt = conn.prepare(
                r#"SELECT id, aria2_gid, type, source, status, name, save_dir, category, total_length,
                   completed_length, download_speed, upload_speed, connections, health, error_code,
                   error_message, remediation, retry_count, last_retry_at, checksum_algorithm,
                   checksum_expected, checksum_actual, checksum_status, created_at, updated_at
                   FROM tasks WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"#,
            )?;
            stmt.query_map(params![status.as_str(), limit, offset], row_to_task)?
                .collect::<rusqlite::Result<Vec<_>>>()?
        } else {
            let mut stmt = conn.prepare(
                r#"SELECT id, aria2_gid, type, source, status, name, save_dir, category, total_length,
                   completed_length, download_speed, upload_speed, connections, health, error_code,
                   error_message, remediation, retry_count, last_retry_at, checksum_algorithm,
                   checksum_expected, checksum_actual, checksum_status, created_at, updated_at
                   FROM tasks ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"#,
            )?;
            stmt.query_map(params![limit, offset], row_to_task)?
                .collect::<rusqlite::Result<Vec<_>>>()?
        };
        rows.shrink_to_fit();
        Ok(rows)
    }

    pub fn get_task(&self, task_id: &str) -> Result<Option<Task>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.query_row(
            r#"SELECT id, aria2_gid, type, source, status, name, save_dir, category, total_length,
               completed_length, download_speed, upload_speed, connections, health, error_code,
               error_message, remediation, retry_count, last_retry_at, checksum_algorithm,
               checksum_expected, checksum_actual, checksum_status, created_at, updated_at
               FROM tasks WHERE id = ?1"#,
            params![task_id],
            row_to_task,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn get_task_by_gid(&self, gid: &str) -> Result<Option<Task>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.query_row(
            r#"SELECT id, aria2_gid, type, source, status, name, save_dir, category, total_length,
               completed_length, download_speed, upload_speed, connections, health, error_code,
               error_message, remediation, retry_count, last_retry_at, checksum_algorithm,
               checksum_expected, checksum_actual, checksum_status, created_at, updated_at
               FROM tasks WHERE aria2_gid = ?1"#,
            params![gid],
            row_to_task,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn update_from_snapshots(
        &self,
        snapshots: &[Aria2TaskSnapshot],
        now_ts: i64,
    ) -> Result<Vec<Task>> {
        let mut changed = Vec::new();
        for snapshot in snapshots {
            if let Some(mut task) = self.get_task_by_gid(&snapshot.gid)? {
                task.status = TaskStatus::from_aria2_status(
                    &snapshot.status,
                    snapshot.has_metadata,
                    snapshot.total_length,
                );
                if task.checksum_status.as_deref() == Some("mismatch") {
                    task.status = TaskStatus::Error;
                }
                task.total_length = snapshot.total_length;
                task.completed_length = snapshot.completed_length;
                task.download_speed = snapshot.download_speed;
                task.upload_speed = snapshot.upload_speed;
                task.connections = snapshot.connections;
                apply_snapshot_failure(&mut task, snapshot);
                if task.name.is_none() {
                    task.name = snapshot.name.clone();
                }
                task.updated_at = now_ts;
                self.upsert_task(&task)?;
                changed.push(task);
            }
        }
        Ok(changed)
    }

    pub fn replace_task_files(&self, task_id: &str, files: &[TaskFile]) -> Result<()> {
        let mut conn = self.conn.lock().expect("db mutex poisoned");
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM task_files WHERE task_id = ?1",
            params![task_id],
        )?;
        for f in files {
            tx.execute(
                "INSERT INTO task_files (task_id, path, length, completed_length, selected) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![f.task_id, f.path, f.length, f.completed_length, if f.selected { 1 } else { 0 }],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_task_files(&self, task_id: &str) -> Result<Vec<TaskFile>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT task_id, path, length, completed_length, selected FROM task_files WHERE task_id = ?1 ORDER BY id ASC",
        )?;
        let files = stmt
            .query_map(params![task_id], |row| {
                Ok(TaskFile {
                    task_id: row.get(0)?,
                    path: row.get(1)?,
                    length: row.get(2)?,
                    completed_length: row.get(3)?,
                    selected: row.get::<_, i64>(4)? == 1,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(files)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn set_setting_if_absent(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn validate_runtime_settings(&self) -> Result<()> {
        let must_exist = [
            "download_dir",
            "max_concurrent_downloads",
            "max_connection_per_server",
        ];
        let conn = self.conn.lock().expect("db mutex poisoned");
        validate_runtime_settings_with_conn(&conn, &must_exist)?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn save_global_settings(&self, settings: &GlobalSettings) -> Result<()> {
        let mut conn = self.conn.lock().expect("db mutex poisoned");
        let tx = conn.transaction()?;
        let set = |key: &str, value: &str| -> Result<()> {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
            Ok(())
        };
        if let Some(v) = &settings.aria2_bin_path {
            set("manual_aria2_bin_path", v)?;
        }
        if let Some(v) = &settings.download_dir {
            set("download_dir", v)?;
        }
        if let Some(v) = settings.max_concurrent_downloads {
            set("max_concurrent_downloads", &v.to_string())?;
        }
        if let Some(v) = settings.max_connection_per_server {
            set("max_connection_per_server", &v.to_string())?;
        }
        if let Some(v) = &settings.max_overall_download_limit {
            set("max_overall_download_limit", v)?;
        }
        if let Some(v) = &settings.bt_tracker {
            set("bt_tracker", v)?;
        }
        if let Some(v) = settings.enable_upnp {
            set("enable_upnp", if v { "true" } else { "false" })?;
        }
        if let Some(v) = &settings.github_cdn {
            set("github_cdn", v)?;
        }
        if let Some(v) = &settings.github_token {
            set("github_token", v)?;
        }
        if let Some(v) = settings.browser_bridge_enabled {
            set("browser_bridge_enabled", if v { "true" } else { "false" })?;
        }
        if let Some(v) = settings.browser_bridge_port {
            set("browser_bridge_port", &v.to_string())?;
        }
        if let Some(v) = &settings.browser_bridge_token {
            set("browser_bridge_token", v)?;
        }
        if let Some(v) = &settings.browser_bridge_allowed_origins {
            set("browser_bridge_allowed_origins", v)?;
        }
        if let Some(v) = &settings.local_api_scopes {
            set("local_api_scopes", v)?;
        }
        if let Some(v) = &settings.ffmpeg_bin_path {
            set("ffmpeg_bin_path", v)?;
        }
        if let Some(v) = settings.media_merge_enabled {
            set("media_merge_enabled", if v { "true" } else { "false" })?;
        }
        if let Some(v) = settings.clipboard_watch_enabled {
            set("clipboard_watch_enabled", if v { "true" } else { "false" })?;
        }
        if let Some(v) = &settings.ui_theme {
            set("ui_theme", v)?;
        }
        if let Some(v) = settings.retry_max_attempts {
            set("retry_max_attempts", &v.to_string())?;
        }
        if let Some(v) = settings.retry_backoff_secs {
            set("retry_backoff_secs", &v.to_string())?;
        }
        if let Some(v) = &settings.retry_fallback_mirrors {
            set("retry_fallback_mirrors", v)?;
        }
        if let Some(v) = settings.metadata_timeout_secs {
            set("metadata_timeout_secs", &v.to_string())?;
        }
        if let Some(v) = &settings.speed_plan {
            set("speed_plan", v)?;
        }
        if let Some(v) = &settings.task_option_presets {
            set("task_option_presets", v)?;
        }
        if let Some(v) = &settings.post_complete_action {
            set("post_complete_action", v)?;
        }
        if let Some(v) = &settings.completion_webhook_url {
            set("completion_webhook_url", v)?;
        }
        if let Some(v) = &settings.completion_command {
            set("completion_command", v)?;
        }
        if let Some(v) = settings.completion_hook_on_error {
            set("completion_hook_on_error", if v { "true" } else { "false" })?;
        }
        if let Some(v) = settings.auto_delete_control_files {
            set(
                "auto_delete_control_files",
                if v { "true" } else { "false" },
            )?;
        }
        if let Some(v) = settings.auto_clear_completed_days {
            set("auto_clear_completed_days", &v.to_string())?;
        }
        if let Some(v) = settings.first_run_done {
            set("first_run_done", if v { "true" } else { "false" })?;
        }
        if let Some(v) = settings.start_minimized {
            set("start_minimized", if v { "true" } else { "false" })?;
        }
        if let Some(v) = settings.minimize_to_tray {
            set("minimize_to_tray", if v { "true" } else { "false" })?;
        }
        if let Some(v) = settings.notify_on_complete {
            set("notify_on_complete", if v { "true" } else { "false" })?;
        }
        let rules_json = serde_json::to_string(&settings.download_dir_rules)
            .context("serialize download_dir_rules")?;
        set("download_dir_rules", &rules_json)?;
        let category_rules_json =
            serde_json::to_string(&settings.category_rules).context("serialize category_rules")?;
        set("category_rules", &category_rules_json)?;
        validate_runtime_settings_with_conn(
            &tx,
            &[
                "download_dir",
                "max_concurrent_downloads",
                "max_connection_per_server",
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn load_global_settings(&self) -> Result<GlobalSettings> {
        let rules = self
            .get_setting("download_dir_rules")?
            .and_then(|v| serde_json::from_str::<Vec<DownloadDirRule>>(&v).ok())
            .unwrap_or_default();
        let category_rules = self
            .get_setting("category_rules")?
            .and_then(|v| serde_json::from_str::<Vec<CategoryRule>>(&v).ok())
            .unwrap_or_default();
        Ok(GlobalSettings {
            aria2_bin_path: self.get_setting("manual_aria2_bin_path")?,
            download_dir: self.get_setting("download_dir")?,
            max_concurrent_downloads: self
                .get_setting("max_concurrent_downloads")?
                .and_then(|v| v.parse::<u32>().ok()),
            max_connection_per_server: self
                .get_setting("max_connection_per_server")?
                .and_then(|v| v.parse::<u32>().ok()),
            max_overall_download_limit: self.get_setting("max_overall_download_limit")?,
            bt_tracker: self.get_setting("bt_tracker")?,
            enable_upnp: self
                .get_setting("enable_upnp")?
                .and_then(|v| match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }),
            github_cdn: self.get_setting("github_cdn")?,
            github_token: self.get_setting("github_token")?,
            download_dir_rules: rules,
            category_rules,
            browser_bridge_enabled: self.get_setting("browser_bridge_enabled")?.and_then(
                |v| match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                },
            ),
            browser_bridge_port: self
                .get_setting("browser_bridge_port")?
                .and_then(|v| v.parse::<u16>().ok()),
            browser_bridge_token: self.get_setting("browser_bridge_token")?,
            browser_bridge_allowed_origins: self.get_setting("browser_bridge_allowed_origins")?,
            local_api_scopes: self.get_setting("local_api_scopes")?,
            ffmpeg_bin_path: self.get_setting("ffmpeg_bin_path")?,
            media_merge_enabled: self.get_setting("media_merge_enabled")?.and_then(|v| {
                match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }
            }),
            clipboard_watch_enabled: self.get_setting("clipboard_watch_enabled")?.and_then(|v| {
                match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }
            }),
            ui_theme: self.get_setting("ui_theme")?,
            retry_max_attempts: self
                .get_setting("retry_max_attempts")?
                .and_then(|v| v.parse::<u32>().ok()),
            retry_backoff_secs: self
                .get_setting("retry_backoff_secs")?
                .and_then(|v| v.parse::<u32>().ok()),
            retry_fallback_mirrors: self.get_setting("retry_fallback_mirrors")?,
            metadata_timeout_secs: self
                .get_setting("metadata_timeout_secs")?
                .and_then(|v| v.parse::<u32>().ok()),
            speed_plan: self.get_setting("speed_plan")?,
            task_option_presets: self.get_setting("task_option_presets")?,
            post_complete_action: self.get_setting("post_complete_action")?,
            completion_webhook_url: self.get_setting("completion_webhook_url")?,
            completion_command: self.get_setting("completion_command")?,
            completion_hook_on_error: self.get_setting("completion_hook_on_error")?.and_then(|v| {
                match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }
            }),
            auto_delete_control_files: self.get_setting("auto_delete_control_files")?.and_then(
                |v| match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                },
            ),
            auto_clear_completed_days: self
                .get_setting("auto_clear_completed_days")?
                .and_then(|v| v.parse::<u32>().ok()),
            first_run_done: self
                .get_setting("first_run_done")?
                .and_then(|v| match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }),
            start_minimized: self
                .get_setting("start_minimized")?
                .and_then(|v| match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }),
            minimize_to_tray: self.get_setting("minimize_to_tray")?.and_then(|v| {
                match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }
            }),
            notify_on_complete: self.get_setting("notify_on_complete")?.and_then(|v| {
                match v.as_str() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                }
            }),
        })
    }

    pub fn remove_task(&self, task_id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "DELETE FROM task_files WHERE task_id = ?1",
            params![task_id],
        )?;
        conn.execute(
            "DELETE FROM media_merge_jobs WHERE task_id = ?1",
            params![task_id],
        )?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])?;
        Ok(())
    }

    pub fn mark_deleted_gid(&self, gid: &str, deleted_at: i64) -> Result<()> {
        if gid.trim().is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO deleted_aria2_gids (gid, deleted_at) VALUES (?1, ?2)
             ON CONFLICT(gid) DO UPDATE SET deleted_at=excluded.deleted_at",
            params![gid, deleted_at],
        )?;
        Ok(())
    }

    pub fn is_gid_deleted(&self, gid: &str) -> Result<bool> {
        if gid.trim().is_empty() {
            return Ok(false);
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        let count: i64 = conn.query_row(
            "SELECT COUNT(1) FROM deleted_aria2_gids WHERE gid = ?1",
            params![gid],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn prune_deleted_gids_before(&self, cutoff_ts: i64) -> Result<usize> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let deleted = conn.execute(
            "DELETE FROM deleted_aria2_gids WHERE deleted_at < ?1",
            params![cutoff_ts],
        )?;
        Ok(deleted)
    }

    pub fn remove_completed_tasks_before(&self, cutoff_ts: i64) -> Result<usize> {
        let mut conn = self.conn.lock().expect("db mutex poisoned");
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO deleted_aria2_gids (gid, deleted_at)
             SELECT aria2_gid, strftime('%s','now')
             FROM tasks
             WHERE status='completed' AND updated_at < ?1 AND aria2_gid IS NOT NULL AND aria2_gid != ''
             ON CONFLICT(gid) DO UPDATE SET deleted_at=excluded.deleted_at",
            params![cutoff_ts],
        )?;
        tx.execute(
            "DELETE FROM task_files WHERE task_id IN (SELECT id FROM tasks WHERE status='completed' AND updated_at < ?1)",
            params![cutoff_ts],
        )?;
        let deleted = tx.execute(
            "DELETE FROM tasks WHERE status='completed' AND updated_at < ?1",
            params![cutoff_ts],
        )?;
        tx.commit()?;
        Ok(deleted)
    }

    pub fn append_operation_logs(&self, logs: &[crate::models::OperationLog]) -> Result<()> {
        if logs.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().expect("db mutex poisoned");
        let tx = conn.transaction()?;
        for log in logs {
            tx.execute(
                "INSERT INTO operation_logs (ts, action, message) VALUES (?1, ?2, ?3)",
                params![log.ts, log.action, log.message],
            )?;
        }
        tx.execute(
            "DELETE FROM operation_logs
             WHERE id NOT IN (
               SELECT id FROM operation_logs ORDER BY id DESC LIMIT ?1
             )",
            params![5000_i64],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn list_operation_logs(&self, limit: usize) -> Result<Vec<crate::models::OperationLog>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn
            .prepare("SELECT ts, action, message FROM operation_logs ORDER BY id DESC LIMIT ?1")?;
        let mut rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(crate::models::OperationLog {
                    ts: row.get(0)?,
                    action: row.get(1)?,
                    message: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows.reverse();
        Ok(rows)
    }

    pub fn clear_operation_logs(&self) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM operation_logs", [])?;
        Ok(())
    }

    pub fn upsert_media_merge_job(&self, job: &MediaMergeJob) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            r#"
            INSERT INTO media_merge_jobs (
              task_id, input_url, output_path, ffmpeg_bin, ffmpeg_args, status, error_message, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(task_id) DO UPDATE SET
              input_url=excluded.input_url,
              output_path=excluded.output_path,
              ffmpeg_bin=excluded.ffmpeg_bin,
              ffmpeg_args=excluded.ffmpeg_args,
              status=excluded.status,
              error_message=excluded.error_message,
              updated_at=excluded.updated_at
            "#,
            params![
                job.task_id,
                job.input_url,
                job.output_path,
                job.ffmpeg_bin,
                job.ffmpeg_args,
                job.status,
                job.error_message,
                job.created_at,
                job.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_media_merge_jobs(&self, limit: usize) -> Result<Vec<MediaMergeJob>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            r#"
            SELECT task_id, input_url, output_path, ffmpeg_bin, ffmpeg_args, status, error_message, created_at, updated_at
            FROM media_merge_jobs
            ORDER BY updated_at DESC
            LIMIT ?1
            "#,
        )?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(MediaMergeJob {
                    task_id: row.get(0)?,
                    input_url: row.get(1)?,
                    output_path: row.get(2)?,
                    ffmpeg_bin: row.get(3)?,
                    ffmpeg_args: row.get(4)?,
                    status: row.get(5)?,
                    error_message: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn run_integrity_check(&self) -> Result<String> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let result = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        Ok(result)
    }

    pub fn copy_db_snapshot(&self, target: &Path) -> Result<u64> {
        let parent = target
            .parent()
            .ok_or_else(|| anyhow!("invalid snapshot target path"))?;
        std::fs::create_dir_all(parent)?;
        let conn = self.conn.lock().expect("db mutex poisoned");
        let _ = conn.execute("PRAGMA wal_checkpoint(FULL)", []);
        let copied = std::fs::copy(&self.db_path, target)?;
        Ok(copied)
    }

    pub fn set_task_category(&self, task_id: &str, category: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE tasks SET category = ?2, updated_at = strftime('%s','now') WHERE id = ?1",
            params![task_id, category],
        )?;
        Ok(())
    }
}

fn validate_runtime_settings_with_conn(conn: &Connection, must_exist: &[&str]) -> Result<()> {
    for key in must_exist {
        require_non_empty_setting(conn, key)?;
    }

    parse_required_u32_setting(conn, "max_concurrent_downloads")?;
    parse_required_u32_setting(conn, "max_connection_per_server")?;
    parse_optional_u32_setting(conn, "split")?;
    parse_optional_u32_setting(conn, "retry_max_attempts")?;
    parse_optional_u32_setting(conn, "retry_backoff_secs")?;
    parse_optional_u32_setting(conn, "metadata_timeout_secs")?;
    parse_optional_u32_setting(conn, "auto_clear_completed_days")?;

    for key in [
        "enable_upnp",
        "browser_bridge_enabled",
        "media_merge_enabled",
        "clipboard_watch_enabled",
        "completion_hook_on_error",
        "auto_delete_control_files",
        "first_run_done",
        "start_minimized",
        "minimize_to_tray",
        "notify_on_complete",
    ] {
        parse_optional_bool_setting(conn, key)?;
    }

    if let Some(port_text) = get_optional_setting_from_conn(conn, "browser_bridge_port")? {
        let port = port_text.parse::<u16>().map_err(|_| {
            anyhow!("invalid setting browser_bridge_port={port_text}, expected 1-65535")
        })?;
        if port == 0 {
            return Err(anyhow!(
                "invalid setting browser_bridge_port={port_text}, expected 1-65535"
            ));
        }
    }

    if let Some(theme) = get_optional_setting_from_conn(conn, "ui_theme")? {
        match theme.trim() {
            "system" | "light" | "dark" => {}
            _ => {
                return Err(anyhow!(
                    "invalid setting ui_theme={theme}, expected system|light|dark"
                ));
            }
        }
    }

    if let Some(action) = get_optional_setting_from_conn(conn, "post_complete_action")? {
        match action.trim() {
            "none" | "open_dir" | "open_file" => {}
            _ => {
                return Err(anyhow!(
                    "invalid setting post_complete_action={action}, expected none|open_dir|open_file"
                ));
            }
        }
    }
    if let Some(scopes) = get_optional_setting_from_conn(conn, "local_api_scopes")? {
        for scope in scopes
            .split([',', '\n'])
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
        {
            match scope {
                "read" | "add" | "control" => {}
                _ => {
                    return Err(anyhow!(
                        "invalid local_api_scopes entry={scope}, expected read|add|control"
                    ));
                }
            }
        }
    }

    parse_optional_json_setting::<Vec<DownloadDirRule>>(conn, "download_dir_rules")?;
    parse_optional_json_setting::<Vec<CategoryRule>>(conn, "category_rules")?;
    if let Some(rules) =
        parse_optional_json_setting::<Vec<StoredSpeedPlanRule>>(conn, "speed_plan")?
    {
        for (index, rule) in rules.iter().enumerate() {
            if rule.limit.trim().is_empty() {
                return Err(anyhow!(
                    "invalid speed_plan[{index}].limit, expected non-empty value"
                ));
            }
            if let Some(days) = rule.days.as_deref() {
                validate_speed_plan_days(days, index)?;
            }
            if let Some(start) = rule.start.as_deref() {
                validate_speed_plan_time(start, "start", index)?;
            }
            if let Some(end) = rule.end.as_deref() {
                validate_speed_plan_time(end, "end", index)?;
            }
        }
    }
    if let Some(presets) =
        parse_optional_json_setting::<Vec<StoredTaskOptionPreset>>(conn, "task_option_presets")?
    {
        for (index, preset) in presets.iter().enumerate() {
            if preset.name.trim().is_empty() {
                return Err(anyhow!(
                    "invalid task_option_presets[{index}].name, expected non-empty value"
                ));
            }
            match preset.task_type.trim() {
                "http" | "torrent" | "magnet" | "metalink" => {}
                other => {
                    return Err(anyhow!(
                        "invalid task_option_presets[{index}].task_type={other}, expected http|torrent|magnet|metalink"
                    ));
                }
            }
            if !preset.options.is_object() {
                return Err(anyhow!(
                    "invalid task_option_presets[{index}].options, expected JSON object"
                ));
            }
        }
    }

    Ok(())
}

fn get_optional_setting_from_conn(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn require_non_empty_setting(conn: &Connection, key: &str) -> Result<String> {
    let value = get_optional_setting_from_conn(conn, key)?
        .ok_or_else(|| anyhow!("missing required setting: {key}"))?;
    if value.trim().is_empty() {
        return Err(anyhow!("required setting is empty: {key}"));
    }
    Ok(value)
}

fn parse_required_u32_setting(conn: &Connection, key: &str) -> Result<u32> {
    let value = require_non_empty_setting(conn, key)?;
    value
        .parse::<u32>()
        .map_err(|_| anyhow!("invalid setting {key}={value}, expected positive integer"))
}

fn parse_optional_u32_setting(conn: &Connection, key: &str) -> Result<Option<u32>> {
    let Some(value) = get_optional_setting_from_conn(conn, key)? else {
        return Ok(None);
    };
    value
        .parse::<u32>()
        .map(Some)
        .map_err(|_| anyhow!("invalid setting {key}={value}, expected positive integer"))
}

fn parse_optional_bool_setting(conn: &Connection, key: &str) -> Result<Option<bool>> {
    let Some(value) = get_optional_setting_from_conn(conn, key)? else {
        return Ok(None);
    };
    match value.as_str() {
        "true" => Ok(Some(true)),
        "false" => Ok(Some(false)),
        _ => Err(anyhow!(
            "invalid setting {key}={value}, expected true|false"
        )),
    }
}

fn parse_optional_json_setting<T>(conn: &Connection, key: &str) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    let Some(value) = get_optional_setting_from_conn(conn, key)? else {
        return Ok(None);
    };
    serde_json::from_str::<T>(&value)
        .map(Some)
        .map_err(|e| anyhow!("invalid setting {key}: {e}"))
}

fn validate_speed_plan_days(days: &str, index: usize) -> Result<()> {
    for day in days.split(',').map(str::trim).filter(|v| !v.is_empty()) {
        let parsed = day.parse::<u8>().map_err(|_| {
            anyhow!("invalid speed_plan[{index}].days={days}, expected comma-separated 1-7")
        })?;
        if !(1..=7).contains(&parsed) {
            return Err(anyhow!(
                "invalid speed_plan[{index}].days={days}, expected comma-separated 1-7"
            ));
        }
    }
    Ok(())
}

fn validate_speed_plan_time(value: &str, field: &str, index: usize) -> Result<()> {
    let parts = value.split(':').collect::<Vec<_>>();
    if parts.len() != 2 {
        return Err(anyhow!(
            "invalid speed_plan[{index}].{field}={value}, expected HH:MM"
        ));
    }
    let hour = parts[0]
        .parse::<u8>()
        .map_err(|_| anyhow!("invalid speed_plan[{index}].{field}={value}, expected HH:MM"))?;
    let minute = parts[1]
        .parse::<u8>()
        .map_err(|_| anyhow!("invalid speed_plan[{index}].{field}={value}, expected HH:MM"))?;
    if hour > 23 || minute > 59 {
        return Err(anyhow!(
            "invalid speed_plan[{index}].{field}={value}, expected HH:MM"
        ));
    }
    Ok(())
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    let task_type_raw: String = row.get(2)?;
    let status_raw: String = row.get(4)?;
    Ok(Task {
        id: row.get(0)?,
        aria2_gid: row.get(1)?,
        task_type: parse_task_type(task_type_raw.as_str())?,
        source: row.get(3)?,
        status: parse_task_status(status_raw.as_str())?,
        name: row.get(5)?,
        save_dir: row.get(6)?,
        category: row.get(7)?,
        total_length: row.get(8)?,
        completed_length: row.get(9)?,
        download_speed: row.get(10)?,
        upload_speed: row.get(11)?,
        connections: row.get(12)?,
        health: row.get(13)?,
        error_code: row.get(14)?,
        error_message: row.get(15)?,
        remediation: row.get(16)?,
        retry_count: row.get(17)?,
        last_retry_at: row.get(18)?,
        checksum_algorithm: row.get(19)?,
        checksum_expected: row.get(20)?,
        checksum_actual: row.get(21)?,
        checksum_status: row.get(22)?,
        created_at: row.get(23)?,
        updated_at: row.get(24)?,
    })
}

fn apply_snapshot_failure(task: &mut Task, snapshot: &Aria2TaskSnapshot) {
    if task.checksum_status.as_deref() == Some("mismatch") {
        task.health = Some(TaskHealth::UnknownError.as_str().to_string());
        task.error_code = Some("CHECKSUM_MISMATCH".to_string());
        task.error_message = Some("downloaded file failed checksum verification".to_string());
        task.remediation = Some(
            "Delete the file, refresh the source, or retry from a trusted mirror.".to_string(),
        );
        return;
    }
    task.error_code = snapshot.error_code.clone();
    task.error_message = snapshot.error_message.clone();
    match task.status {
        TaskStatus::Completed | TaskStatus::Active | TaskStatus::Paused | TaskStatus::Queued => {
            task.health = Some(TaskHealth::Normal.as_str().to_string());
            task.remediation = None;
            if matches!(task.status, TaskStatus::Completed) {
                task.error_code = None;
                task.error_message = None;
            }
        }
        TaskStatus::Metadata => {
            task.health = Some(TaskHealth::MetadataPending.as_str().to_string());
            task.remediation = Some(
                "Wait for metadata, add trackers, or retry the magnet link if it times out."
                    .to_string(),
            );
        }
        TaskStatus::Error => {
            let (health, remediation) = classify_aria2_failure(
                snapshot.error_code.as_deref(),
                snapshot.error_message.as_deref(),
            );
            task.health = Some(health.as_str().to_string());
            task.remediation = Some(remediation.to_string());
        }
        TaskStatus::Removed => {}
    }
}

fn classify_aria2_failure(code: Option<&str>, message: Option<&str>) -> (TaskHealth, &'static str) {
    let haystack = format!(
        "{} {}",
        code.unwrap_or_default(),
        message.unwrap_or_default()
    )
    .to_ascii_lowercase();
    if haystack.contains("401") || haystack.contains("unauthorized") {
        return (
            TaskHealth::AuthRequired,
            "Refresh the source page or add valid cookies/authorization headers.",
        );
    }
    if haystack.contains("403") || haystack.contains("forbidden") {
        return (
            TaskHealth::AuthRequired,
            "Add referer/cookies, use browser capture, or refresh the source URL.",
        );
    }
    if haystack.contains("404")
        || haystack.contains("not found")
        || haystack.contains("expired")
        || haystack.contains("gone")
    {
        return (
            TaskHealth::UrlExpired,
            "Refresh or replace the URL, then retry the task.",
        );
    }
    if haystack.contains("disk")
        || haystack.contains("no space")
        || haystack.contains("quota")
        || haystack.contains("permission denied")
    {
        return (
            TaskHealth::DiskFull,
            "Free disk space or choose a writable save directory before retrying.",
        );
    }
    if haystack.contains("timeout")
        || haystack.contains("connection")
        || haystack.contains("network")
        || haystack.contains("resolve")
    {
        return (
            TaskHealth::NetworkUnstable,
            "Check the network connection, proxy, DNS, or retry later.",
        );
    }
    (
        TaskHealth::UnknownError,
        "Open task details or export a debug bundle for diagnosis.",
    )
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for name in rows {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn run_schema_migrations(conn: &Connection) -> Result<()> {
    let mut current = get_schema_user_version(conn)?;
    while current < SCHEMA_VERSION {
        let next = current + 1;
        apply_migration(conn, next)?;
        set_schema_user_version(conn, next)?;
        current = next;
    }
    Ok(())
}

fn apply_migration(conn: &Connection, version: i64) -> Result<()> {
    match version {
        1 => {
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS tasks (
                  id TEXT PRIMARY KEY,
                  aria2_gid TEXT,
                  type TEXT NOT NULL,
                  source TEXT NOT NULL,
                  status TEXT NOT NULL,
                  name TEXT,
                  save_dir TEXT NOT NULL,
                  total_length INTEGER DEFAULT 0,
                  completed_length INTEGER DEFAULT 0,
                  download_speed INTEGER DEFAULT 0,
                  upload_speed INTEGER DEFAULT 0,
                  connections INTEGER DEFAULT 0,
                  error_code TEXT,
                  error_message TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS task_files (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  task_id TEXT NOT NULL,
                  path TEXT NOT NULL,
                  length INTEGER DEFAULT 0,
                  completed_length INTEGER DEFAULT 0,
                  selected INTEGER DEFAULT 1,
                  FOREIGN KEY(task_id) REFERENCES tasks(id)
                );
                CREATE TABLE IF NOT EXISTS settings (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );
                "#,
            )?;
        }
        2 => {
            conn.execute_batch(
                r#"
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
                CREATE INDEX IF NOT EXISTS idx_tasks_gid ON tasks(aria2_gid);
                CREATE TABLE IF NOT EXISTS operation_logs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts INTEGER NOT NULL,
                  action TEXT NOT NULL,
                  message TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_operation_logs_ts ON operation_logs(ts);
                "#,
            )?;
        }
        3 => {
            if !table_has_column(conn, "tasks", "category")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN category TEXT", [])?;
            }
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)",
                [],
            )?;
        }
        4 => {
            // Idempotent guard migration for schema/index consistency.
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_tasks_gid ON tasks(aria2_gid)",
                [],
            )?;
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_operation_logs_ts ON operation_logs(ts)",
                [],
            )?;
        }
        5 => {
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS deleted_aria2_gids (
                  gid TEXT PRIMARY KEY,
                  deleted_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_deleted_aria2_gids_deleted_at
                ON deleted_aria2_gids(deleted_at);
                "#,
            )?;
        }
        6 => {
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS media_merge_jobs (
                  task_id TEXT PRIMARY KEY,
                  input_url TEXT NOT NULL,
                  output_path TEXT NOT NULL,
                  ffmpeg_bin TEXT NOT NULL,
                  ffmpeg_args TEXT NOT NULL,
                  status TEXT NOT NULL,
                  error_message TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_media_merge_jobs_updated_at
                ON media_merge_jobs(updated_at);
                "#,
            )?;
        }
        7 => {
            if !table_has_column(conn, "tasks", "health")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN health TEXT", [])?;
            }
            if !table_has_column(conn, "tasks", "remediation")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN remediation TEXT", [])?;
            }
            if !table_has_column(conn, "tasks", "retry_count")? {
                conn.execute(
                    "ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0",
                    [],
                )?;
            }
            if !table_has_column(conn, "tasks", "last_retry_at")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN last_retry_at INTEGER", [])?;
            }
            conn.execute(
                "UPDATE tasks SET health = CASE WHEN status = 'error' THEN 'unknown_error' WHEN status = 'metadata' THEN 'metadata_pending' ELSE 'normal' END WHERE health IS NULL",
                [],
            )?;
            conn.execute(
                "UPDATE tasks SET retry_count = 0 WHERE retry_count IS NULL",
                [],
            )?;
        }
        8 => {
            if !table_has_column(conn, "tasks", "checksum_algorithm")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN checksum_algorithm TEXT", [])?;
            }
            if !table_has_column(conn, "tasks", "checksum_expected")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN checksum_expected TEXT", [])?;
            }
            if !table_has_column(conn, "tasks", "checksum_actual")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN checksum_actual TEXT", [])?;
            }
            if !table_has_column(conn, "tasks", "checksum_status")? {
                conn.execute("ALTER TABLE tasks ADD COLUMN checksum_status TEXT", [])?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn get_schema_user_version(conn: &Connection) -> Result<i64> {
    let version = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    Ok(version)
}

fn set_schema_user_version(conn: &Connection, version: i64) -> Result<()> {
    conn.execute(&format!("PRAGMA user_version = {version}"), [])?;
    Ok(())
}

fn parse_task_type(value: &str) -> rusqlite::Result<TaskType> {
    match value {
        "http" => Ok(TaskType::Http),
        "torrent" => Ok(TaskType::Torrent),
        "magnet" => Ok(TaskType::Magnet),
        "metalink" => Ok(TaskType::Metalink),
        _ => Err(rusqlite::Error::FromSqlConversionFailure(
            2,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("unknown task type: {value}"),
            )),
        )),
    }
}

fn parse_task_status(value: &str) -> rusqlite::Result<TaskStatus> {
    match value {
        "queued" => Ok(TaskStatus::Queued),
        "active" => Ok(TaskStatus::Active),
        "paused" => Ok(TaskStatus::Paused),
        "completed" => Ok(TaskStatus::Completed),
        "error" => Ok(TaskStatus::Error),
        "removed" => Ok(TaskStatus::Removed),
        "metadata" => Ok(TaskStatus::Metadata),
        _ => Err(rusqlite::Error::FromSqlConversionFailure(
            4,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("unknown task status: {value}"),
            )),
        )),
    }
}

fn to_type_str(value: &TaskType) -> &'static str {
    match value {
        TaskType::Http => "http",
        TaskType::Torrent => "torrent",
        TaskType::Magnet => "magnet",
        TaskType::Metalink => "metalink",
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    fn seed_runtime_settings(db: &Database) {
        db.set_setting("download_dir", "/tmp/tarui")
            .expect("set download_dir");
        db.set_setting("max_concurrent_downloads", "5")
            .expect("set max_concurrent_downloads");
        db.set_setting("max_connection_per_server", "8")
            .expect("set max_connection_per_server");
        db.set_setting("speed_plan", "[]").expect("set speed_plan");
        db.set_setting("task_option_presets", "[]")
            .expect("set task_option_presets");
    }

    #[test]
    fn global_settings_roundtrip() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");
        let settings = GlobalSettings {
            aria2_bin_path: Some("/tmp/aria2c".to_string()),
            download_dir: Some("/tmp/dl".to_string()),
            max_concurrent_downloads: Some(7),
            max_connection_per_server: Some(12),
            max_overall_download_limit: Some("10M".to_string()),
            bt_tracker: Some("udp://tracker.example/announce".to_string()),
            enable_upnp: Some(false),
            github_cdn: Some("https://ghfast.top/".to_string()),
            github_token: Some("ghp_test_token".to_string()),
            download_dir_rules: vec![DownloadDirRule {
                enabled: true,
                matcher: "ext".to_string(),
                pattern: "mp4,mkv".to_string(),
                save_dir: "/tmp/video".to_string(),
                subdir_by_date: false,
                subdir_by_domain: false,
            }],
            category_rules: vec![CategoryRule {
                enabled: true,
                matcher: "domain".to_string(),
                pattern: "example.com".to_string(),
                category: "work".to_string(),
            }],
            browser_bridge_enabled: Some(true),
            browser_bridge_port: Some(16789),
            browser_bridge_token: Some("bridge-token-1".to_string()),
            browser_bridge_allowed_origins: Some(
                "chrome-extension://,moz-extension://".to_string(),
            ),
            local_api_scopes: Some("read,add,control".to_string()),
            ffmpeg_bin_path: Some("ffmpeg".to_string()),
            media_merge_enabled: Some(true),
            clipboard_watch_enabled: Some(false),
            ui_theme: Some("dark".to_string()),
            retry_max_attempts: None,
            retry_backoff_secs: None,
            retry_fallback_mirrors: None,
            metadata_timeout_secs: None,
            speed_plan: None,
            task_option_presets: Some(
                r#"[{"name":"Video Standard","task_type":"http","options":{"max_connection_per_server":8,"split":16}}]"#
                    .to_string(),
            ),
            post_complete_action: Some("open_dir".to_string()),
            completion_webhook_url: Some("http://127.0.0.1:9000/flamingo".to_string()),
            completion_command: Some("echo {task_id}".to_string()),
            completion_hook_on_error: Some(true),
            auto_delete_control_files: Some(true),
            auto_clear_completed_days: Some(14),
            first_run_done: None,
            start_minimized: None,
            minimize_to_tray: None,
            notify_on_complete: None,
        };

        db.save_global_settings(&settings).expect("save settings");
        let loaded = db.load_global_settings().expect("load settings");

        assert_eq!(loaded.aria2_bin_path.as_deref(), Some("/tmp/aria2c"));
        assert_eq!(loaded.download_dir.as_deref(), Some("/tmp/dl"));
        assert_eq!(loaded.max_concurrent_downloads, Some(7));
        assert_eq!(loaded.max_connection_per_server, Some(12));
        assert_eq!(loaded.max_overall_download_limit.as_deref(), Some("10M"));
        assert_eq!(
            loaded.bt_tracker.as_deref(),
            Some("udp://tracker.example/announce")
        );
        assert_eq!(loaded.enable_upnp, Some(false));
        assert_eq!(loaded.github_cdn.as_deref(), Some("https://ghfast.top/"));
        assert_eq!(loaded.github_token.as_deref(), Some("ghp_test_token"));
        assert_eq!(loaded.download_dir_rules.len(), 1);
        assert_eq!(loaded.download_dir_rules[0].matcher, "ext");
        assert_eq!(loaded.category_rules.len(), 1);
        assert_eq!(loaded.category_rules[0].category, "work");
        assert!(
            loaded
                .task_option_presets
                .as_deref()
                .unwrap_or_default()
                .contains("Video Standard")
        );
        assert_eq!(loaded.post_complete_action.as_deref(), Some("open_dir"));
        assert_eq!(loaded.auto_delete_control_files, Some(true));
        assert_eq!(loaded.auto_clear_completed_days, Some(14));
        assert_eq!(loaded.browser_bridge_enabled, Some(true));
        assert_eq!(loaded.browser_bridge_port, Some(16789));
        assert_eq!(
            loaded.browser_bridge_token.as_deref(),
            Some("bridge-token-1")
        );
        assert_eq!(
            loaded.browser_bridge_allowed_origins.as_deref(),
            Some("chrome-extension://,moz-extension://")
        );
        assert_eq!(loaded.ffmpeg_bin_path.as_deref(), Some("ffmpeg"));
        assert_eq!(loaded.media_merge_enabled, Some(true));
        assert_eq!(loaded.ui_theme.as_deref(), Some("dark"));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn operation_logs_retention_and_clear() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");

        let logs = (0..5105)
            .map(|i| crate::models::OperationLog {
                ts: i,
                action: "test".to_string(),
                message: format!("log-{i}"),
            })
            .collect::<Vec<_>>();
        db.append_operation_logs(&logs).expect("append logs");

        let latest = db.list_operation_logs(6000).expect("list logs");
        assert_eq!(latest.len(), 5000);
        assert_eq!(latest.first().map(|v| v.ts), Some(105));
        assert_eq!(latest.last().map(|v| v.ts), Some(5104));

        db.clear_operation_logs().expect("clear logs");
        let after_clear = db.list_operation_logs(100).expect("list after clear");
        assert!(after_clear.is_empty());

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn schema_user_version_is_set() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let _db = Database::new(&db_path).expect("create db");
        let conn = Connection::open(&db_path).expect("open sqlite file");
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version");
        assert_eq!(version, super::SCHEMA_VERSION);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn validate_runtime_settings_passes_for_valid_values() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");
        seed_runtime_settings(&db);
        db.set_setting("split", "16").expect("set split");
        db.set_setting("enable_upnp", "true")
            .expect("set enable_upnp");
        db.validate_runtime_settings()
            .expect("runtime settings should be valid");
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn validate_runtime_settings_fails_for_invalid_values() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");
        seed_runtime_settings(&db);
        db.set_setting("max_concurrent_downloads", "oops")
            .expect("set max_concurrent_downloads");
        let err = db
            .validate_runtime_settings()
            .expect_err("runtime settings should be invalid");
        assert!(
            err.to_string()
                .contains("invalid setting max_concurrent_downloads")
        );
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn save_global_settings_rejects_invalid_speed_plan_and_rolls_back() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");
        seed_runtime_settings(&db);

        let mut patch = db.load_global_settings().expect("load settings");
        patch.download_dir = Some("/tmp/should-not-stick".to_string());
        patch.speed_plan =
            Some(r#"[{"days":"1,8","start":"09:00","end":"18:00","limit":"2M"}]"#.to_string());

        let err = db
            .save_global_settings(&patch)
            .expect_err("invalid speed plan should be rejected");
        assert!(err.to_string().contains("speed_plan[0].days"));
        assert_eq!(
            db.get_setting("download_dir").expect("get download_dir"),
            Some("/tmp/tarui".to_string())
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn save_global_settings_rejects_invalid_bridge_port_and_rolls_back() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");
        seed_runtime_settings(&db);
        db.set_setting("browser_bridge_port", "16789")
            .expect("set browser_bridge_port");

        let mut patch = db.load_global_settings().expect("load settings");
        patch.download_dir = Some("/tmp/also-should-not-stick".to_string());
        patch.browser_bridge_port = Some(0);

        let err = db
            .save_global_settings(&patch)
            .expect_err("invalid bridge port should be rejected");
        assert!(err.to_string().contains("browser_bridge_port"));
        assert_eq!(
            db.get_setting("download_dir").expect("get download_dir"),
            Some("/tmp/tarui".to_string())
        );
        assert_eq!(
            db.get_setting("browser_bridge_port")
                .expect("get browser_bridge_port"),
            Some("16789".to_string())
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn deleted_gid_tombstone_roundtrip() {
        let db_path = std::env::temp_dir().join(format!("tarui-db-{}.sqlite", Uuid::new_v4()));
        let db = Database::new(&db_path).expect("create db");
        db.mark_deleted_gid("gid-test", 100)
            .expect("mark deleted gid");
        assert!(db.is_gid_deleted("gid-test").expect("check deleted gid"));
        let pruned = db
            .prune_deleted_gids_before(200)
            .expect("prune deleted gids");
        assert_eq!(pruned, 1);
        assert!(!db.is_gid_deleted("gid-test").expect("check deleted gid"));
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn classify_aria2_failure_maps_common_reasons() {
        let (health, remediation) = classify_aria2_failure(
            Some("3"),
            Some("HTTP response header was bad or unexpected: 403 Forbidden"),
        );
        assert_eq!(health, TaskHealth::AuthRequired);
        assert!(remediation.contains("referer"));

        let (health, remediation) = classify_aria2_failure(None, Some("No space left on device"));
        assert_eq!(health, TaskHealth::DiskFull);
        assert!(remediation.contains("disk"));
    }
}
