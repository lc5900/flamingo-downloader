use std::sync::Arc;

use anyhow::Result;

use crate::{
    download_service::DownloadService,
    models::{
        AddTaskOptions, GlobalSettings, ImportTaskListResult, OperationLog, Task, TaskFile,
        TaskStatus,
    },
};

#[allow(dead_code)]
pub async fn add_url(
    service: Arc<DownloadService>,
    url: String,
    options: AddTaskOptions,
) -> Result<String> {
    service.add_url(&url, options).await
}

#[allow(dead_code)]
pub async fn add_magnet(
    service: Arc<DownloadService>,
    magnet: String,
    options: AddTaskOptions,
) -> Result<String> {
    service.add_magnet(&magnet, options).await
}

#[allow(dead_code)]
pub async fn add_torrent(
    service: Arc<DownloadService>,
    torrent_file_path: Option<String>,
    torrent_base64: Option<String>,
    options: AddTaskOptions,
) -> Result<String> {
    if let Some(path) = torrent_file_path {
        return service.add_torrent_from_file(&path, options).await;
    }
    if let Some(base64) = torrent_base64 {
        return service.add_torrent_base64(base64, options, None).await;
    }
    anyhow::bail!("missing torrent input")
}

#[allow(dead_code)]
pub async fn pause_task(service: Arc<DownloadService>, task_id: String) -> Result<()> {
    service.pause_task(&task_id).await
}

#[allow(dead_code)]
pub async fn pause_all_tasks(service: Arc<DownloadService>) -> Result<()> {
    service.pause_all().await
}

#[allow(dead_code)]
pub async fn resume_task(service: Arc<DownloadService>, task_id: String) -> Result<()> {
    service.resume_task(&task_id).await
}

#[allow(dead_code)]
pub async fn resume_all_tasks(service: Arc<DownloadService>) -> Result<()> {
    service.resume_all().await
}

#[allow(dead_code)]
pub async fn remove_task(
    service: Arc<DownloadService>,
    task_id: String,
    delete_files: bool,
) -> Result<()> {
    service.remove_task(&task_id, delete_files).await
}

#[allow(dead_code)]
pub fn list_tasks(
    service: Arc<DownloadService>,
    status: Option<TaskStatus>,
    limit: u32,
    offset: u32,
) -> Result<Vec<Task>> {
    service.list_tasks(status, limit, offset)
}

#[allow(dead_code)]
pub async fn get_task_detail(
    service: Arc<DownloadService>,
    task_id: String,
) -> Result<(Task, Vec<TaskFile>)> {
    service.get_task_detail(&task_id).await
}

#[allow(dead_code)]
pub async fn set_task_file_selection(
    service: Arc<DownloadService>,
    task_id: String,
    selected_indexes: Vec<usize>,
) -> Result<()> {
    service
        .set_task_file_selection(&task_id, &selected_indexes)
        .await
}

#[allow(dead_code)]
pub async fn set_global_settings(
    service: Arc<DownloadService>,
    settings: GlobalSettings,
) -> Result<()> {
    service.set_global_settings(settings).await
}

#[allow(dead_code)]
pub fn get_global_settings(service: Arc<DownloadService>) -> Result<GlobalSettings> {
    service.get_global_settings()
}

#[allow(dead_code)]
pub fn suggest_save_dir(
    service: Arc<DownloadService>,
    task_type: crate::models::TaskType,
    source: Option<String>,
) -> Result<String> {
    service.suggest_save_dir(task_type, source.as_deref())
}

#[allow(dead_code)]
pub async fn rpc_ping(service: Arc<DownloadService>) -> Result<String> {
    service.rpc_ping().await
}

#[allow(dead_code)]
pub async fn restart_aria2(service: Arc<DownloadService>) -> Result<String> {
    service.restart_aria2().await
}

#[allow(dead_code)]
pub async fn startup_check_aria2(service: Arc<DownloadService>) -> Result<String> {
    service.startup_check_aria2().await
}

#[allow(dead_code)]
pub async fn save_session(service: Arc<DownloadService>) -> Result<String> {
    service.save_session().await
}

#[allow(dead_code)]
pub fn list_operation_logs(
    service: Arc<DownloadService>,
    limit: usize,
) -> Result<Vec<OperationLog>> {
    service.list_operation_logs(limit)
}

#[allow(dead_code)]
pub fn clear_operation_logs(service: Arc<DownloadService>) -> Result<()> {
    service.clear_operation_logs()
}

#[allow(dead_code)]
pub fn export_task_list_json(service: Arc<DownloadService>) -> Result<String> {
    service.export_task_list_json()
}

#[allow(dead_code)]
pub fn import_task_list_json(
    service: Arc<DownloadService>,
    payload: String,
) -> Result<ImportTaskListResult> {
    service.import_task_list_json(&payload)
}

#[allow(dead_code)]
pub async fn get_diagnostics(service: Arc<DownloadService>) -> Result<crate::models::Diagnostics> {
    service.get_diagnostics().await
}

#[allow(dead_code)]
pub async fn export_debug_bundle(service: Arc<DownloadService>) -> Result<String> {
    service.export_debug_bundle().await
}
