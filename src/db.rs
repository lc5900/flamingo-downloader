use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use anyhow::{Context, Result};
use rusqlite::{Connection, OptionalExtension, params};

use crate::models::{Aria2TaskSnapshot, GlobalSettings, Task, TaskFile, TaskStatus, TaskType};

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

const SCHEMA_VERSION: i64 = 2;

impl Database {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let path_ref = path.as_ref();
        let conn = Connection::open(path_ref)
            .with_context(|| format!("open sqlite db: {}", path_ref.display()))?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
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

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_gid ON tasks(aria2_gid);

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

            CREATE TABLE IF NOT EXISTS operation_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts INTEGER NOT NULL,
              action TEXT NOT NULL,
              message TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_operation_logs_ts ON operation_logs(ts);
            "#,
        )?;
        conn.execute(&format!("PRAGMA user_version = {SCHEMA_VERSION}"), [])?;
        Ok(())
    }

    pub fn upsert_task(&self, task: &Task) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            r#"
            INSERT INTO tasks (
                id, aria2_gid, type, source, status, name, save_dir,
                total_length, completed_length, download_speed, upload_speed,
                connections, error_code, error_message, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            ON CONFLICT(id) DO UPDATE SET
              aria2_gid=excluded.aria2_gid,
              type=excluded.type,
              source=excluded.source,
              status=excluded.status,
              name=excluded.name,
              save_dir=excluded.save_dir,
              total_length=excluded.total_length,
              completed_length=excluded.completed_length,
              download_speed=excluded.download_speed,
              upload_speed=excluded.upload_speed,
              connections=excluded.connections,
              error_code=excluded.error_code,
              error_message=excluded.error_message,
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
                task.total_length,
                task.completed_length,
                task.download_speed,
                task.upload_speed,
                task.connections,
                task.error_code,
                task.error_message,
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
                r#"SELECT id, aria2_gid, type, source, status, name, save_dir, total_length,
                   completed_length, download_speed, upload_speed, connections, error_code,
                   error_message, created_at, updated_at
                   FROM tasks WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"#,
            )?;
            stmt.query_map(params![status.as_str(), limit, offset], row_to_task)?
                .collect::<rusqlite::Result<Vec<_>>>()?
        } else {
            let mut stmt = conn.prepare(
                r#"SELECT id, aria2_gid, type, source, status, name, save_dir, total_length,
                   completed_length, download_speed, upload_speed, connections, error_code,
                   error_message, created_at, updated_at
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
            r#"SELECT id, aria2_gid, type, source, status, name, save_dir, total_length,
               completed_length, download_speed, upload_speed, connections, error_code,
               error_message, created_at, updated_at
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
            r#"SELECT id, aria2_gid, type, source, status, name, save_dir, total_length,
               completed_length, download_speed, upload_speed, connections, error_code,
               error_message, created_at, updated_at
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
                task.total_length = snapshot.total_length;
                task.completed_length = snapshot.completed_length;
                task.download_speed = snapshot.download_speed;
                task.upload_speed = snapshot.upload_speed;
                task.connections = snapshot.connections;
                task.error_code = snapshot.error_code.clone();
                task.error_message = snapshot.error_message.clone();
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
        for key in must_exist {
            let value = self
                .get_setting(key)?
                .ok_or_else(|| anyhow::anyhow!("missing required setting: {key}"))?;
            if value.trim().is_empty() {
                return Err(anyhow::anyhow!("required setting is empty: {key}"));
            }
        }

        let mc = self
            .get_setting("max_concurrent_downloads")?
            .ok_or_else(|| anyhow::anyhow!("missing required setting: max_concurrent_downloads"))?;
        mc.parse::<u32>().map_err(|_| {
            anyhow::anyhow!(
                "invalid setting max_concurrent_downloads={mc}, expected positive integer"
            )
        })?;

        let mcs = self
            .get_setting("max_connection_per_server")?
            .ok_or_else(|| {
                anyhow::anyhow!("missing required setting: max_connection_per_server")
            })?;
        mcs.parse::<u32>().map_err(|_| {
            anyhow::anyhow!(
                "invalid setting max_connection_per_server={mcs}, expected positive integer"
            )
        })?;

        if let Some(split) = self.get_setting("split")? {
            split.parse::<u32>().map_err(|_| {
                anyhow::anyhow!("invalid setting split={split}, expected positive integer")
            })?;
        }

        if let Some(upnp) = self.get_setting("enable_upnp")? {
            if upnp != "true" && upnp != "false" {
                return Err(anyhow::anyhow!(
                    "invalid setting enable_upnp={upnp}, expected true|false"
                ));
            }
        }
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
        if let Some(v) = &settings.aria2_bin_path {
            self.set_setting("manual_aria2_bin_path", v)?;
        }
        if let Some(v) = &settings.download_dir {
            self.set_setting("download_dir", v)?;
        }
        if let Some(v) = settings.max_concurrent_downloads {
            self.set_setting("max_concurrent_downloads", &v.to_string())?;
        }
        if let Some(v) = settings.max_connection_per_server {
            self.set_setting("max_connection_per_server", &v.to_string())?;
        }
        if let Some(v) = &settings.max_overall_download_limit {
            self.set_setting("max_overall_download_limit", v)?;
        }
        if let Some(v) = &settings.bt_tracker {
            self.set_setting("bt_tracker", v)?;
        }
        if let Some(v) = settings.enable_upnp {
            self.set_setting("enable_upnp", if v { "true" } else { "false" })?;
        }
        if let Some(v) = &settings.github_cdn {
            self.set_setting("github_cdn", v)?;
        }
        if let Some(v) = &settings.github_token {
            self.set_setting("github_token", v)?;
        }
        Ok(())
    }

    pub fn load_global_settings(&self) -> Result<GlobalSettings> {
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
        })
    }

    pub fn remove_task(&self, task_id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "DELETE FROM task_files WHERE task_id = ?1",
            params![task_id],
        )?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])?;
        Ok(())
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
        total_length: row.get(7)?,
        completed_length: row.get(8)?,
        download_speed: row.get(9)?,
        upload_speed: row.get(10)?,
        connections: row.get(11)?,
        error_code: row.get(12)?,
        error_message: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
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
        db.set_setting("download_dir", "/tmp/tarui")
            .expect("set download_dir");
        db.set_setting("max_concurrent_downloads", "5")
            .expect("set max_concurrent_downloads");
        db.set_setting("max_connection_per_server", "8")
            .expect("set max_connection_per_server");
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
        db.set_setting("download_dir", "/tmp/tarui")
            .expect("set download_dir");
        db.set_setting("max_concurrent_downloads", "oops")
            .expect("set max_concurrent_downloads");
        db.set_setting("max_connection_per_server", "8")
            .expect("set max_connection_per_server");
        let err = db
            .validate_runtime_settings()
            .expect_err("runtime settings should be invalid");
        assert!(
            err.to_string()
                .contains("invalid setting max_concurrent_downloads")
        );
        let _ = std::fs::remove_file(db_path);
    }
}
