# 🦩 Flamingo Downloader

[![Build](https://github.com/lc5900/flamingo-downloader/actions/workflows/build-release.yml/badge.svg)](https://github.com/lc5900/flamingo-downloader/actions/workflows/build-release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-orange)](https://www.rust-lang.org)

Flamingo Downloader is a cross-platform desktop download manager built with **Tauri + Rust + aria2**.

The goal is simple: keep protocol complexity in aria2, and deliver a stable, user-friendly download product on top of it.

Chinese README: [`README_zh.md`](README_zh.md)

## Why Flamingo

- Supports HTTP/HTTPS/FTP, magnet, and `.torrent`
- Clean split between **Downloading** and **Downloaded** workflows
- Persistent task state with SQLite + startup self-check + recovery
- Per-task controls (speed, split, seeding, headers, save dir)
- Rule-based directories and category tagging (`ext/domain/type`)
- Browser bridge + extension (Chromium and Firefox)
- Native messaging support for safer browser integration
- Themed desktop UI with i18n (`en-US`, `zh-CN`)

## Screenshots

Latest screenshots are in `docs/screenshots/`.

### Main

![Main Window](docs/screenshots/main-overview.png)

### New Download

![Add Download](docs/screenshots/add-download-modal.png)

### Settings

![Settings](docs/screenshots/settings-page.png)

## Quick Start

### Prerequisites

- Rust (stable)
- Node.js 20+
- Tauri 2 build dependencies for your OS
- A usable `aria2c` binary (current app flow uses manual path setting)

### Run (dev)

```bash
cargo run --manifest-path src-tauri/Cargo.toml
```

### Optional: run UI only

```bash
cd ui
npm install
npm run dev
```

### First launch checklist

In **Settings**:

1. Set `aria2 Binary Path` (or use `Detect aria2 Path`)
2. Save settings
3. Click `Restart aria2`
4. Click `RPC Ping`

## Build

```bash
# Build frontend assets
npm --prefix ui run build

# Package desktop app
cd src-tauri
cargo tauri build
```

## Release Pipeline

Workflow: `.github/workflows/build-release.yml`

It includes:

- Validation: fmt, clippy, ui lint, ui tests, ui build, bundle-size checks
- Multi-platform builds (Linux / Windows / macOS arm64)
- Staging aria2 binaries before packaging
- Uploading desktop artifacts and browser extension zips
- Publishing Release on tags (`v*`)
- Optional macOS signing/notarization when Apple secrets are configured

## Architecture

- **Tauri UI**: task list, dialogs, settings, logs
- **Rust service layer**: aria2 lifecycle, RPC, validation, orchestration, DB
- **aria2 process**: transfer engine

Design principles:

- UI never calls aria2 RPC directly
- RPC is local-only with token protection
- Flamingo task model is the source of truth

## Browser Integration

- Extension source: [`browser-extension/`](browser-extension)
- Extension docs: [`browser-extension/README.md`](browser-extension/README.md)
- Native host scripts: [`browser-extension/native-host/`](browser-extension/native-host)
- DRM-protected streams (Widevine/FairPlay/PlayReady) are not supported

## Project Layout

```text
src/                # Rust core service
src-tauri/          # Tauri app entry and packaging config
ui/                 # React + Ant Design frontend
aria2/              # Bundled/runtime aria2 binaries
browser-extension/  # Browser extension and native host scripts
```

## License

MIT, see [`LICENSE`](LICENSE).

Note: aria2 is distributed under its own license terms.
