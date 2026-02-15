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
    pub global_stat: serde_json::Value,
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
