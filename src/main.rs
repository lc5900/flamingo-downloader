use std::sync::Arc;

use anyhow::Result;
use tarui_aria2_downloader::{events::StdoutEventEmitter, init_backend};

#[tokio::main]
async fn main() -> Result<()> {
    let cwd = std::env::current_dir()?;
    let runtime_dir = cwd.join("runtime");
    std::fs::create_dir_all(&runtime_dir)?;

    let emitter = Arc::new(StdoutEventEmitter) as tarui_aria2_downloader::events::SharedEmitter;
    let handles = init_backend(&cwd, &runtime_dir.join("app.db"), emitter).await?;

    if handles.config.aria2_bin.exists() {
        println!("aria2 service started");
    } else {
        println!(
            "aria2 binary not found at {}, service skeleton is ready",
            handles.config.aria2_bin.display()
        );
    }

    println!("backend core initialized");
    Ok(())
}
