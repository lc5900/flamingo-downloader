pub mod aria2_manager;
pub mod browser_bridge;
pub mod commands;
pub mod db;
pub mod download_service;
pub mod error;
pub mod events;
pub mod link_parser;
pub mod models;

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

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
    let resolved_aria2_default = detect_existing_aria2_bin(base_dir)
        .unwrap_or_else(|| aria2_cfg.aria2_bin.to_string_lossy().to_string());
    db.set_setting_if_absent(
        "download_dir",
        &aria2_cfg.default_download_dir.to_string_lossy(),
    )?;
    db.set_setting_if_absent("aria2_bin_path", &resolved_aria2_default)?;
    let current_aria2_bin = db.get_setting("aria2_bin_path")?.unwrap_or_default();
    let should_reset_aria2_path = current_aria2_bin.trim().is_empty()
        || !Path::new(current_aria2_bin.trim()).exists()
        || is_bundled_resource_aria2_path(current_aria2_bin.trim())
        || is_runtime_managed_aria2_path(base_dir, current_aria2_bin.trim());
    if should_reset_aria2_path {
        db.set_setting("aria2_bin_path", &resolved_aria2_default)?;
    }
    // Keep diagnostics/runtime path in sync with the effective resolved binary path.
    db.set_setting("aria2_bin_path", &resolved_aria2_default)?;
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
    db.set_setting_if_absent(
        "browser_bridge_allowed_origins",
        "chrome-extension://,moz-extension://",
    )?;
    db.set_setting_if_absent("ffmpeg_bin_path", &detect_default_ffmpeg_bin())?;
    db.set_setting_if_absent("media_merge_enabled", "false")?;
    db.set_setting_if_absent("clipboard_watch_enabled", "false")?;
    db.set_setting_if_absent("ui_theme", "system")?;
    db.set_setting_if_absent("retry_max_attempts", "2")?;
    db.set_setting_if_absent("retry_backoff_secs", "15")?;
    db.set_setting_if_absent("retry_fallback_mirrors", "")?;
    db.set_setting_if_absent("metadata_timeout_secs", "180")?;
    db.set_setting_if_absent("speed_plan", "[]")?;
    db.set_setting_if_absent("task_option_presets", "[]")?;
    db.set_setting_if_absent("post_complete_action", "none")?;
    db.set_setting_if_absent("auto_delete_control_files", "true")?;
    db.set_setting_if_absent("auto_clear_completed_days", "0")?;
    db.set_setting_if_absent("first_run_done", "false")?;
    db.set_setting_if_absent("start_minimized", "false")?;
    db.set_setting_if_absent(
        "minimize_to_tray",
        if cfg!(target_os = "windows") {
            "true"
        } else {
            "false"
        },
    )?;
    if cfg!(target_os = "windows") {
        let migrated = db
            .get_setting("windows_minimize_to_tray_migrated")?
            .unwrap_or_default();
        if migrated != "true" {
            db.set_setting("minimize_to_tray", "true")?;
            db.set_setting("windows_minimize_to_tray_migrated", "true")?;
        }
    }
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
    service.append_operation_log(
        "aria2_path_resolved",
        format!("aria2_bin_path={}", aria2_cfg.aria2_bin.to_string_lossy()),
    );

    service.clone().start_sync_loop();
    service.clone().start_log_flush_loop();
    if aria2_cfg.aria2_bin.exists() {
        let aria2_bg = aria2.clone();
        let service_bg = service.clone();
        tokio::spawn(async move {
            let _ = service_bg.set_startup_notice("info", "Starting aria2 in background...");
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
                        &format!(
                            "Startup check failed: {e}. Please verify aria2 path in Settings."
                        ),
                    );
                }
            }
        });
    } else {
        let _ = service.set_startup_notice(
            "warning",
            "aria2 binary not found (bundled/system PATH). Please set a valid aria2 path in Settings.",
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

fn is_bundled_resource_aria2_path(value: &str) -> bool {
    if value.trim().is_empty() {
        return false;
    }
    let path = Path::new(value.trim());
    if let Some(resource_dir) = std::env::var_os("FLAMINGO_RESOURCE_DIR") {
        let bundled_root = Path::new(&resource_dir).join("aria2").join("bin");
        if path.starts_with(&bundled_root) {
            return true;
        }
    }
    let text = value.replace('\\', "/");
    text.contains("/resources/aria2/bin/")
}

fn is_runtime_managed_aria2_path(base_dir: &Path, value: &str) -> bool {
    let v = value.trim();
    if v.is_empty() {
        return false;
    }
    let p = Path::new(v);
    let managed_root = base_dir.join("aria2").join("bin");
    if p.starts_with(&managed_root) {
        return true;
    }
    let managed_text = managed_root
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let value_text = v.replace('\\', "/").to_ascii_lowercase();
    value_text.starts_with(&managed_text)
}

fn detect_existing_aria2_bin(base_dir: &Path) -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut resource_roots = Vec::new();
    if let Some(resource_dir) = std::env::var_os("FLAMINGO_RESOURCE_DIR").map(PathBuf::from) {
        resource_roots.push(resource_dir);
    }
    if let Some(resource_dir) = infer_resource_dir_from_current_exe() {
        resource_roots.push(resource_dir);
    }
    for resource_dir in resource_roots {
        let resource_bin = resource_dir.join("aria2").join("bin");
        if cfg!(target_os = "windows") {
            candidates.push(resource_bin.join("aria2c.exe"));
            candidates.push(resource_bin.join("windows").join("aria2c.exe"));
        } else if cfg!(target_os = "macos") {
            candidates.push(resource_bin.join("aria2c"));
            candidates.push(resource_bin.join("macos").join("aria2c"));
            candidates.push(resource_bin.join("darwin").join("aria2c"));
        } else {
            candidates.push(resource_bin.join("aria2c"));
            candidates.push(resource_bin.join("linux").join("aria2c"));
        }
    }

    let local_bin = base_dir.join("aria2").join("bin");
    if cfg!(target_os = "windows") {
        candidates.push(local_bin.join("aria2c.exe"));
        candidates.push(local_bin.join("windows").join("aria2c.exe"));
    } else if cfg!(target_os = "macos") {
        candidates.push(local_bin.join("aria2c"));
        candidates.push(local_bin.join("macos").join("aria2c"));
        candidates.push(local_bin.join("darwin").join("aria2c"));
    } else {
        candidates.push(local_bin.join("aria2c"));
        candidates.push(local_bin.join("linux").join("aria2c"));
    }

    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            if cfg!(target_os = "windows") {
                candidates.push(dir.join("aria2c.exe"));
            } else {
                candidates.push(dir.join("aria2c"));
            }
        }
    }

    for candidate in candidates {
        if candidate.exists() && candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn infer_resource_dir_from_current_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    #[cfg(target_os = "macos")]
    {
        let contents = exe.parent()?.parent()?.parent()?;
        return Some(contents.join("Resources"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let parent = exe.parent()?;
        Some(parent.join("resources"))
    }
}

fn detect_default_ffmpeg_bin() -> String {
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = if cfg!(windows) {
                dir.join("ffmpeg.exe")
            } else {
                dir.join("ffmpeg")
            };
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    let common: &[&str] = if cfg!(target_os = "macos") {
        &[
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ]
    } else if cfg!(target_os = "linux") {
        &["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]
    } else {
        &[]
    };
    for p in common {
        let candidate = PathBuf::from(p);
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    "ffmpeg".to_string()
}
