# 🦩 Flamingo Downloader

A cross-platform desktop downloader built with Tauri + Rust + aria2.  
This project focuses on building a reliable **download product**, not a custom protocol stack.

中文说明请看：[`README_zh.md`](README_zh.md)

## Current Features

- URL downloads (HTTP/HTTPS) through aria2 JSON-RPC
- Two main sections: Downloading / Downloaded
- Pause, resume, remove tasks
- Downloaded task actions: open file, open folder, remove record (optionally delete files)
- Dedicated logs window
- Dedicated full-page settings UI
- i18n support (`en-US`, `zh-CN`) with system language detection and English fallback
- SQLite persistence for tasks and settings
- Manual aria2 binary path configuration with path detection

## Architecture

- UI layer (Tauri WebView): task list, settings, logs, interactions
- Rust service layer: aria2 process lifecycle, RPC wrapper, state sync, persistence
- aria2c process: actual download executor

Core principles:
- UI never calls aria2 RPC directly
- aria2 RPC listens on localhost with secret token
- App-level task model is the source of truth

## Run Locally

### 1. Prerequisites

- Rust (stable recommended)
- Tauri 2 build dependencies for your OS
- A working `aria2c` binary (current mode: user-specified path)

### 2. Start the app

```bash
cargo run --manifest-path src-tauri/Cargo.toml
```

### 3. First-time setup

In Settings:
1. Set `aria2 Binary Path`
2. Click `Detect aria2 Path` (optional)
3. Save settings
4. Click `Restart aria2` and then `RPC Ping` to verify

## Build (Optional)

```bash
# tauri-cli required
cargo tauri build --manifest-path src-tauri/Cargo.toml
```

## GitHub Actions (Build All Platforms)

This repository includes CI workflow:
- `.github/workflows/build-release.yml`

What it does:
- builds on `Linux`, `Windows`, `macOS Intel`, `macOS Apple Silicon`
- installs/stages `aria2c` into `aria2/bin/...` before building
- builds Tauri bundles
- uploads build artifacts for each platform
- creates a GitHub Release automatically when you push a tag like `v0.1.0`

How to use:
1. Push code to `main` to run build checks and produce artifacts.
2. Create a version tag to publish a release:
   - `git tag -a v0.1.0 -m "v0.1.0"`
   - `git push origin v0.1.0`
3. Open Actions/Release page and download platform bundles.

## Suggested GitHub Metadata

- Repository name: `flamingo-downloader`
- Topics:
  - `tauri`
  - `rust`
  - `aria2`
  - `downloader`
  - `cross-platform`
  - `desktop-app`

## Third-Party Notice

- This project integrates `aria2` as its download engine.
- `aria2` is distributed under its own license; make sure your distribution follows its requirements.

## License

This project is licensed under the MIT License. See `LICENSE`.
