pub mod aria2_manager;
pub mod commands;
pub mod db;
pub mod download_service;
pub mod error;
pub mod events;
pub mod models;

use std::{path::Path, sync::Arc};

use anyhow::Result;
use aria2_manager::{Aria2Manager, Aria2RuntimeConfig};
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
    db.validate_runtime_settings()?;
    let aria2 = Arc::new(Aria2Manager::new(aria2_cfg.clone()));
    let service = Arc::new(DownloadService::new(db, aria2.clone(), emitter));

    if aria2_cfg.aria2_bin.exists() {
        if let Ok(_ep) = aria2.start().await {
            let _ = service.reconcile_with_aria2().await;
            aria2.clone().start_health_guard().await;
            service.clone().start_sync_loop();
            service.clone().start_log_flush_loop();
        }
    }

    Ok(BackendHandles {
        service,
        aria2,
        config: aria2_cfg,
    })
}
