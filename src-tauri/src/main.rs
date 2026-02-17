use std::sync::{Arc, RwLock};

use serde::Serialize;
use flamingo_downloader::{
    events::EventEmitter,
    init_backend,
    models::{
        AddTaskOptions, AppUpdateStrategy, Aria2UpdateApplyResult, Aria2UpdateInfo,
        GlobalSettings, ImportTaskListResult, OperationLog, StartupNotice, Task, TaskFile,
        TaskStatus, TaskType,
    },
};
use tauri::{Emitter, Manager, State, include_image};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

#[derive(Default)]
struct TauriEventEmitter {
    app: RwLock<Option<tauri::AppHandle>>,
}

impl TauriEventEmitter {
    fn bind(&self, app: tauri::AppHandle) {
        if let Ok(mut guard) = self.app.write() {
            *guard = Some(app);
        }
    }
}

impl EventEmitter for TauriEventEmitter {
    fn emit_task_update(&self, tasks: &[Task]) -> anyhow::Result<()> {
        if tasks.is_empty() {
            return Ok(());
        }
        let app = self
            .app
            .read()
            .ok()
            .and_then(|g| g.as_ref().cloned());
        if let Some(app) = app {
            app.emit("task_update", tasks)?;
        }
        Ok(())
    }
}

#[derive(Clone)]
struct AppState {
    service: Arc<flamingo_downloader::download_service::DownloadService>,
}

#[derive(Serialize)]
struct TaskDetailResponse {
    task: Task,
    files: Vec<TaskFile>,
}

#[tauri::command]
async fn add_url(state: State<'_, AppState>, url: String, options: AddTaskOptions) -> Result<String, String> {
    state
        .service
        .add_url(&url, options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_magnet(state: State<'_, AppState>, magnet: String, options: AddTaskOptions) -> Result<String, String> {
    state
        .service
        .add_magnet(&magnet, options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_torrent(
    state: State<'_, AppState>,
    torrent_file_path: Option<String>,
    torrent_base64: Option<String>,
    options: AddTaskOptions,
) -> Result<String, String> {
    if let Some(path) = torrent_file_path {
        return state
            .service
            .add_torrent_from_file(&path, options)
            .await
            .map_err(|e| e.to_string());
    }
    if let Some(base64) = torrent_base64 {
        return state
            .service
            .add_torrent_base64(base64, options, None)
            .await
            .map_err(|e| e.to_string());
    }
    Err("missing torrent input".to_string())
}

#[tauri::command]
async fn pause_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .service
        .pause_task(&task_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn resume_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .service
        .resume_task(&task_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn pause_all(state: State<'_, AppState>) -> Result<(), String> {
    state.service.pause_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn resume_all(state: State<'_, AppState>) -> Result<(), String> {
    state.service.resume_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_task(state: State<'_, AppState>, task_id: String, delete_files: bool) -> Result<(), String> {
    state
        .service
        .remove_task(&task_id, delete_files)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_task_file(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .service
        .open_task_file(&task_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_task_dir(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .service
        .open_task_dir(&task_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_tasks(
    state: State<'_, AppState>,
    status: Option<TaskStatus>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Task>, String> {
    state
        .service
        .list_tasks(status, limit.unwrap_or(200), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_task_category(
    state: State<'_, AppState>,
    task_id: String,
    category: Option<String>,
) -> Result<(), String> {
    state
        .service
        .set_task_category(&task_id, category.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_task_detail(state: State<'_, AppState>, task_id: String) -> Result<TaskDetailResponse, String> {
    let (task, files) = state
        .service
        .get_task_detail(&task_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(TaskDetailResponse { task, files })
}

#[tauri::command]
async fn get_task_runtime_status(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<serde_json::Value, String> {
    state
        .service
        .get_task_runtime_status(&task_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_task_file_selection(
    state: State<'_, AppState>,
    task_id: String,
    selected_indexes: Vec<usize>,
) -> Result<(), String> {
    state
        .service
        .set_task_file_selection(&task_id, &selected_indexes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_global_settings(state: State<'_, AppState>, settings: GlobalSettings) -> Result<(), String> {
    state
        .service
        .set_global_settings(settings)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_global_settings(state: State<'_, AppState>) -> Result<GlobalSettings, String> {
    state
        .service
        .get_global_settings()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reset_global_settings_to_defaults(state: State<'_, AppState>) -> Result<(), String> {
    state
        .service
        .reset_global_settings_to_defaults()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn suggest_save_dir(
    state: State<'_, AppState>,
    task_type: TaskType,
    source: Option<String>,
) -> Result<String, String> {
    state
        .service
        .suggest_save_dir(task_type, source.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn suggest_save_dir_detail(
    state: State<'_, AppState>,
    task_type: TaskType,
    source: Option<String>,
) -> Result<flamingo_downloader::models::SaveDirSuggestion, String> {
    state
        .service
        .suggest_save_dir_detail(task_type, source.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn detect_aria2_bin_paths(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state
        .service
        .detect_aria2_bin_paths()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_diagnostics(state: State<'_, AppState>) -> Result<flamingo_downloader::models::Diagnostics, String> {
    state
        .service
        .get_diagnostics()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_debug_bundle(state: State<'_, AppState>) -> Result<String, String> {
    state
        .service
        .export_debug_bundle()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn rpc_ping(state: State<'_, AppState>) -> Result<String, String> {
    state.service.rpc_ping().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn restart_aria2(state: State<'_, AppState>) -> Result<String, String> {
    state
        .service
        .restart_aria2()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn startup_check_aria2(state: State<'_, AppState>) -> Result<String, String> {
    state
        .service
        .startup_check_aria2()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn startup_self_check_summary(
    state: State<'_, AppState>,
) -> Result<flamingo_downloader::models::StartupSelfCheck, String> {
    state
        .service
        .startup_self_check_summary()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_session(state: State<'_, AppState>) -> Result<String, String> {
    state
        .service
        .save_session()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_operation_logs(state: State<'_, AppState>, limit: Option<usize>) -> Result<Vec<OperationLog>, String> {
    state
        .service
        .list_operation_logs(limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_operation_logs(state: State<'_, AppState>) -> Result<(), String> {
    state
        .service
        .clear_operation_logs()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_task_list_json(state: State<'_, AppState>) -> Result<String, String> {
    state
        .service
        .export_task_list_json()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_task_list_json(
    state: State<'_, AppState>,
    payload: String,
) -> Result<ImportTaskListResult, String> {
    state
        .service
        .import_task_list_json(&payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn consume_startup_notice(state: State<'_, AppState>) -> Result<Option<StartupNotice>, String> {
    state
        .service
        .consume_startup_notice()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_aria2_update(state: State<'_, AppState>) -> Result<Aria2UpdateInfo, String> {
    state
        .service
        .check_aria2_update()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_aria2_now(state: State<'_, AppState>) -> Result<Aria2UpdateApplyResult, String> {
    state
        .service
        .update_aria2_now()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_app_update_strategy(state: State<'_, AppState>) -> Result<AppUpdateStrategy, String> {
    state
        .service
        .get_app_update_strategy()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_logs_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = "logs-window-external";
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("logs.html".into()),
    )
    .title("Operation Logs")
    .inner_size(780.0, 560.0)
    .resizable(true)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn close_logs_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = "logs-window-external";
    if let Some(win) = app.get_webview_window(label) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    let emitter = Arc::new(TauriEventEmitter::default());
    let emitter_for_setup = emitter.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let minimize_to_tray = window
                    .state::<AppState>()
                    .service
                    .get_global_settings()
                    .ok()
                    .and_then(|s| s.minimize_to_tray)
                    .unwrap_or(false);
                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            emitter_for_setup.bind(app.handle().clone());

            let cwd = std::env::current_dir()?;
            if let Ok(resource_dir) = app.path().resource_dir() {
                // Rust 2024 marks environment mutation as unsafe.
                unsafe { std::env::set_var("FLAMINGO_RESOURCE_DIR", resource_dir) };
            }
            let runtime_dir = cwd.join("runtime");
            std::fs::create_dir_all(&runtime_dir)?;

            let handles = tauri::async_runtime::block_on(init_backend(
                &cwd,
                &runtime_dir.join("app.db"),
                emitter_for_setup.clone(),
            ))
            .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

            app.manage(AppState {
                service: handles.service,
            });

            if let Some(main_win) = app.get_webview_window("main")
                && let Ok(settings) = app.state::<AppState>().service.get_global_settings()
                && settings.start_minimized.unwrap_or(false)
            {
                if settings.minimize_to_tray.unwrap_or(false) {
                    let _ = main_win.hide();
                } else {
                    let _ = main_win.minimize();
                }
            }

            let show_item = MenuItemBuilder::with_id("tray_show", "Show").build(app)?;
            let quit_item = MenuItemBuilder::with_id("tray_quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;
            let tray_icon = if cfg!(target_os = "windows") {
                Some(include_image!("icons/icon.ico"))
            } else {
                Some(include_image!("icons/icon.png"))
            };
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Flamingo Downloader");
            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            } else if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let tray = tray_builder
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray_show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "tray_quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event
                        && let Some(win) = tray.app_handle().get_webview_window("main")
                    {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                })
                .build(app)?;
            // Keep tray icon alive for app lifetime.
            std::mem::forget(tray);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_url,
            add_magnet,
            add_torrent,
            pause_task,
            resume_task,
            pause_all,
            resume_all,
            remove_task,
            open_task_file,
            open_task_dir,
            list_tasks,
            set_task_category,
            get_task_detail,
            get_task_runtime_status,
            set_task_file_selection,
            set_global_settings,
            get_global_settings,
            reset_global_settings_to_defaults,
            suggest_save_dir,
            suggest_save_dir_detail,
            detect_aria2_bin_paths,
            get_diagnostics,
            export_debug_bundle,
            rpc_ping,
            restart_aria2,
            startup_check_aria2,
            startup_self_check_summary,
            save_session,
            list_operation_logs,
            clear_operation_logs,
            export_task_list_json,
            import_task_list_json,
            consume_startup_notice,
            check_aria2_update,
            update_aria2_now,
            get_app_update_strategy,
            open_logs_window,
            close_logs_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
