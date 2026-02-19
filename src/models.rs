use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskType {
    Http,
    Torrent,
    Magnet,
    Metalink,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Queued,
    Active,
    Paused,
    Completed,
    Error,
    Removed,
    Metadata,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Error => "error",
            Self::Removed => "removed",
            Self::Metadata => "metadata",
        }
    }

    pub fn from_aria2_status(status: &str, has_metadata: bool, total_length: i64) -> Self {
        if !has_metadata && total_length == 0 {
            return Self::Metadata;
        }

        match status {
            "active" => Self::Active,
            "waiting" => Self::Queued,
            "paused" => Self::Paused,
            "complete" => Self::Completed,
            "removed" => Self::Removed,
            "error" => Self::Error,
            _ => Self::Queued,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub aria2_gid: Option<String>,
    pub task_type: TaskType,
    pub source: String,
    pub status: TaskStatus,
    pub name: Option<String>,
    pub category: Option<String>,
    pub save_dir: String,
    pub total_length: i64,
    pub completed_length: i64,
    pub download_speed: i64,
    pub upload_speed: i64,
    pub connections: i64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFile {
    pub task_id: String,
    pub path: String,
    pub length: i64,
    pub completed_length: i64,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AddTaskOptions {
    pub save_dir: Option<String>,
    pub out: Option<String>,
    pub max_connection_per_server: Option<u32>,
    pub split: Option<u32>,
    pub max_download_limit: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    #[serde(default)]
    pub headers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DownloadDirRule {
    pub enabled: bool,
    pub matcher: String, // ext | domain | type
    pub pattern: String,
    pub save_dir: String,
    #[serde(default)]
    pub subdir_by_date: bool,
    #[serde(default)]
    pub subdir_by_domain: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GlobalSettings {
    pub aria2_bin_path: Option<String>,
    pub download_dir: Option<String>,
    pub max_concurrent_downloads: Option<u32>,
    pub max_connection_per_server: Option<u32>,
    pub max_overall_download_limit: Option<String>,
    pub bt_tracker: Option<String>,
    pub enable_upnp: Option<bool>,
    pub github_cdn: Option<String>,
    pub github_token: Option<String>,
    #[serde(default)]
    pub download_dir_rules: Vec<DownloadDirRule>,
    pub browser_bridge_enabled: Option<bool>,
    pub browser_bridge_port: Option<u16>,
    pub browser_bridge_token: Option<String>,
    pub clipboard_watch_enabled: Option<bool>,
    pub ui_theme: Option<String>, // system | light | dark
    pub retry_max_attempts: Option<u32>,
    pub retry_backoff_secs: Option<u32>,
    pub retry_fallback_mirrors: Option<String>, // newline/comma separated URL prefixes
    pub metadata_timeout_secs: Option<u32>,
    pub speed_plan: Option<String>, // JSON array: [{"days":"1,2,3","start":"09:00","end":"18:00","limit":"2M"}]
    pub task_option_presets: Option<String>, // JSON array: [{name, task_type, options}]
    pub post_complete_action: Option<String>, // none | open_dir | open_file
    pub auto_delete_control_files: Option<bool>,
    pub auto_clear_completed_days: Option<u32>,
    pub first_run_done: Option<bool>,
    pub start_minimized: Option<bool>,
    pub minimize_to_tray: Option<bool>,
    pub notify_on_complete: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aria2TaskSnapshot {
    pub gid: String,
    pub status: String,
    pub total_length: i64,
    pub completed_length: i64,
    pub download_speed: i64,
    pub upload_speed: i64,
    pub connections: i64,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub name: Option<String>,
    pub has_metadata: bool,
    pub files: Vec<Aria2FileSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aria2FileSnapshot {
    pub path: String,
    pub length: i64,
    pub completed_length: i64,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostics {
    pub rpc_endpoint: String,
    pub rpc_port: Option<u16>,
    pub rpc_secret_set: bool,
    pub aria2_running: bool,
    pub aria2_bin_path: String,
    pub aria2_bin_exists: bool,
    pub version: Option<String>,
    pub stderr_tail: Option<String>,
    pub global_stat: serde_json::Value,
    pub global_option: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aria2UpdateInfo {
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub selected_asset_name: Option<String>,
    pub selected_asset_url: Option<String>,
    pub latest_url: Option<String>,
    pub check_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aria2UpdateApplyResult {
    pub updated: bool,
    pub from_version: Option<String>,
    pub to_version: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationLog {
    pub ts: i64,
    pub action: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupNotice {
    pub level: String, // info | warning | error
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupSelfCheck {
    pub aria2_bin_path: String,
    pub aria2_bin_exists: bool,
    pub aria2_bin_executable: bool,
    pub download_dir: String,
    pub download_dir_exists: bool,
    pub download_dir_writable: bool,
    pub rpc_ready: bool,
    pub rpc_endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskListSnapshot {
    pub version: u32,
    pub exported_at: i64,
    pub tasks: Vec<Task>,
    pub task_files: Vec<TaskFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportTaskListResult {
    pub imported_tasks: usize,
    pub imported_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateStrategy {
    pub mode: String, // manual_release | tauri_updater_future
    pub current_version: String,
    pub channel: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveDirSuggestion {
    pub save_dir: String,
    pub matched_rule: Option<DownloadDirRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserBridgeStatus {
    pub enabled: bool,
    pub endpoint: String,
    pub token_set: bool,
    pub connected: bool,
    pub message: String,
}
