# 🦩 Flamingo Downloader

A cross-platform desktop downloader built with Tauri + Rust + aria2.  
This project focuses on building a reliable **download product**, not a custom protocol stack.

中文说明请看：[`README_zh.md`](README_zh.md)

## Current Features

- URL downloads (HTTP/HTTPS) through aria2 JSON-RPC
- Magnet and torrent support
- Two main sections: Downloading / Downloaded
- Pause, resume, remove tasks
- Downloaded task actions: open file, open folder, remove record (optionally delete files)
- Per-task save directory in Add dialog (with smart default suggestion)
- Multi-directory routing rules by `ext/domain/type`
- Dedicated logs window
- Dedicated full-page settings UI
- Theme modes: `system / light / dark` + quick toolbar toggle
- i18n support (`en-US`, `zh-CN`) with system language detection and English fallback
- SQLite persistence for tasks and settings
- Manual aria2 binary path configuration with path detection
- Local browser bridge (`127.0.0.1` + token) for browser takeover
- Browser extension template in `browser-extension/` (Chromium + Firefox, auto takeover + context menu send)

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

### React + Ant Design migration workspace (WIP)

A new React UI workspace is added under `ui/` and currently in staged migration:

```bash
cd ui
npm install
npm run dev
```

Build React UI into app static assets:

```bash
cd ui
npm run build
cp -R dist/* ../dist/
```

### 3. First-time setup

In Settings:
1. Set `aria2 Binary Path`
2. Click `Detect aria2 Path` (optional)
3. Save settings
4. Click `Restart aria2` and then `RPC Ping` to verify

Optional browser takeover setup:
1. In Settings, keep `Browser Bridge Enabled` on
2. Check bridge port/token
3. Load `browser-extension/` as unpacked extension in Chrome/Edge
4. For Firefox testing, use `browser-extension/manifest.firefox.json` (see `browser-extension/README.md`)
5. Fill endpoint/token in extension options

## Build (Optional)

```bash
# tauri-cli required
cargo tauri build --manifest-path src-tauri/Cargo.toml
```

## GitHub Actions (Build All Platforms)

This repository includes CI workflow:
- `.github/workflows/build-release.yml`

What it does:
- builds on `Linux`, `Windows`, `macOS Apple Silicon`
- installs/stages `aria2c` into `aria2/bin/...` before building
- builds Tauri bundles
- uploads build artifacts for each platform
- creates a GitHub Release automatically when you push a tag like `v0.1.0`
- supports macOS signing/notarization when Apple secrets are configured

Note:
- The default workflow currently targets `macos-14` (Apple Silicon).
- If your GitHub plan/region supports Intel macOS runners, you can add `macos-13` back.

How to use:
1. Push code to `main` to run build checks and produce artifacts.
2. Create a version tag to publish a release:
   - `git tag -a v0.1.0 -m "v0.1.0"`
   - `git push origin v0.1.0`
3. Open Actions/Release page and download platform bundles.

### macOS note (`"app is damaged"` warning)

Unsigned/unnotarized DMG builds may be blocked by Gatekeeper and show a damaged warning.
For proper public distribution, configure these repository secrets so the macOS job signs + notarizes:

- `APPLE_CERTIFICATE` (base64-encoded `.p12`)
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD` (app-specific password)
- `APPLE_TEAM_ID`

For local testing only, you can remove quarantine manually after install:

```bash
xattr -dr com.apple.quarantine "/Applications/Flamingo Downloader.app"
```

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
