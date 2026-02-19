pub mod aria2_manager;
pub mod browser_bridge;
pub mod commands;
pub mod db;
pub mod download_service;
pub mod error;
pub mod events;
pub mod models;

use std::{path::Path, sync::Arc};

use anyhow::Result;
use aria2_manager::{Aria2Manager, Aria2RuntimeConfig};
use browser_bridge::{BrowserBridgeConfig, start_browser_bridge};
use db::Database;
use download_service::DownloadService;
use events::SharedEmitter;

pub struct BackendHandles {
    pub service: Arc<DownloadService>,
    pub aria2: Arc<Aria2Manager>,
    pub config: Aria2RuntimeConfig,
}

pub async fn init_backend(
    base_dir: &Path,
    db_path: &Path,
    emitter: SharedEmitter,
) -> Result<BackendHandles> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let db = Arc::new(Database::new(db_path)?);
    let aria2_cfg = Aria2RuntimeConfig::with_defaults(base_dir);
    db.set_setting_if_absent(
        "download_dir",
        &aria2_cfg.default_download_dir.to_string_lossy(),
    )?;
    db.set_setting_if_absent("aria2_bin_path", &aria2_cfg.aria2_bin.to_string_lossy())?;
    if db
        .get_setting("aria2_bin_path")?
        .map(|v| !v.trim().is_empty() && Path::new(v.trim()).exists())
        != Some(true)
    {
        db.set_setting("aria2_bin_path", &aria2_cfg.aria2_bin.to_string_lossy())?;
    }
    db.set_setting_if_absent(
        "max_concurrent_downloads",
        &aria2_cfg.max_concurrent_downloads.to_string(),
    )?;
    db.set_setting_if_absent(
        "max_connection_per_server",
        &aria2_cfg.max_connection_per_server.to_string(),
    )?;
    db.set_setting_if_absent("split", &aria2_cfg.split.to_string())?;
    db.set_setting_if_absent(
        "enable_upnp",
        if aria2_cfg.enable_upnp {
            "true"
        } else {
            "false"
        },
    )?;
    if let Some(trackers) = &aria2_cfg.bt_tracker {
        db.set_setting_if_absent("bt_tracker", trackers)?;
    }
    db.set_setting_if_absent("github_cdn", "")?;
    db.set_setting_if_absent("github_token", "")?;
    db.set_setting_if_absent("download_dir_rules", "[]")?;
    db.set_setting_if_absent("browser_bridge_enabled", "true")?;
    db.set_setting_if_absent("browser_bridge_port", "16789")?;
    db.set_setting_if_absent("clipboard_watch_enabled", "false")?;
    db.set_setting_if_absent("ui_theme", "system")?;
    db.set_setting_if_absent("retry_max_attempts", "2")?;
    db.set_setting_if_absent("retry_backoff_secs", "15")?;
    db.set_setting_if_absent("retry_fallback_mirrors", "")?;
    db.set_setting_if_absent("metadata_timeout_secs", "180")?;
    db.set_setting_if_absent("speed_plan", "[]")?;
    db.set_setting_if_absent("task_option_presets", "[]")?;
    db.set_setting_if_absent("first_run_done", "false")?;
    db.set_setting_if_absent("start_minimized", "false")?;
    db.set_setting_if_absent("minimize_to_tray", "false")?;
    db.set_setting_if_absent("notify_on_complete", "true")?;
    db.set_setting_if_absent("startup_notice_level", "")?;
    db.set_setting_if_absent("startup_notice_message", "")?;
    let bridge_token = match db.get_setting("browser_bridge_token")? {
        Some(v) if !v.trim().is_empty() => v,
        _ => {
            let generated = uuid::Uuid::new_v4().to_string();
            db.set_setting("browser_bridge_token", &generated)?;
            generated
        }
    };
    db.validate_runtime_settings()?;
    let aria2 = Arc::new(Aria2Manager::new(aria2_cfg.clone()));
    let service = Arc::new(DownloadService::new(db.clone(), aria2.clone(), emitter));

    service.clone().start_sync_loop();
    service.clone().start_log_flush_loop();
    if aria2_cfg.aria2_bin.exists() {
        let aria2_bg = aria2.clone();
        let service_bg = service.clone();
        tokio::spawn(async move {
            let _ = service_bg.set_startup_notice(
                "info",
                "Starting aria2 in background...",
            );
            match aria2_bg.start().await {
                Ok(ep) => {
                    let _ = service_bg.apply_saved_runtime_global_options().await;
                    let recovered = service_bg.reconcile_with_aria2().await.unwrap_or(0);
                    let compat_hint = if ep.compat_mode {
                        " (compatibility mode: skipped unsupported aria2 flags)"
                    } else {
                        ""
                    };
                    let message = if recovered > 0 {
                        format!(
                            "Startup recovery complete: recovered {recovered} task(s), aria2 ready at {}{}",
                            ep.endpoint, compat_hint
                        )
                    } else {
                        format!(
                            "Startup check complete: aria2 ready at {}{}",
                            ep.endpoint, compat_hint
                        )
                    };
                    let _ = service_bg.set_startup_notice("info", &message);
                    aria2_bg.start_health_guard().await;
                }
                Err(e) => {
                    let _ = service_bg.set_startup_notice(
                        "warning",
                        &format!("Startup check failed: {e}. Please verify aria2 path in Settings."),
                    );
                }
            }
        });
    } else {
        let _ = service.set_startup_notice(
            "warning",
            "aria2 binary not found on startup. Please set a valid aria2 path in Settings.",
        );
    }

    let bridge_enabled = db
        .get_setting("browser_bridge_enabled")?
        .map(|v| v == "true")
        .unwrap_or(true);
    let bridge_port = db
        .get_setting("browser_bridge_port")?
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(16789);
    start_browser_bridge(
        service.clone(),
        BrowserBridgeConfig {
            enabled: bridge_enabled,
            port: bridge_port,
            token: bridge_token,
        },
    );

    Ok(BackendHandles {
        service,
        aria2,
        config: aria2_cfg,
    })
}
