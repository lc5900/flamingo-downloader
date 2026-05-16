# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flamingo Downloader is a cross-platform desktop download manager built with **Tauri 2 + Rust + aria2**. It supports HTTP/HTTPS/FTP, magnet links, and `.torrent` files with persistent SQLite-backed task state.

## Build & Development Commands

### Rust (core library)
```bash
# Run standalone backend (no UI, uses StdoutEventEmitter)
cargo run --manifest-path src-tauri/Cargo.toml --no-default-features 2>/dev/null || cargo run

# Check formatting
cargo fmt --check

# Lint
cargo clippy

# Run Rust unit tests
cargo test
```

### Tauri Desktop App
```bash
# Dev mode (builds UI first, then launches Tauri app)
cargo tauri dev

# Production build
cargo tauri build
```

### Frontend (ui/)
```bash
cd ui
npm install
npm run dev          # Vite dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests
```

### Preflight Check
```bash
# Validates Node version, builds UI, checks devtools config, etc.
bash scripts/preflight.sh        # Unix
powershell scripts/preflight.ps1 # Windows
```

## Architecture

### Two-Crate Structure (NOT a Cargo workspace)

- **Root crate** (`Cargo.toml`): Core library (`flamingo_downloader`) — models, DB, aria2 management, download service, browser bridge, link parser.
- **Tauri crate** (`src-tauri/Cargo.toml`): Desktop app (`flamingo_downloader_tauri`) — depends on root crate via `path = ".."`, wires Tauri commands and window management.

### Core Library Layers (`src/`)

```
DownloadService (download_service.rs, ~5370 lines)
    ├── db.rs           — SQLite persistence, 8 schema migrations (PRAGMA user_version)
    ├── aria2_manager.rs — Spawns/manages aria2c process, JSON-RPC over HTTP
    ├── browser_bridge.rs — Raw TCP HTTP server for browser extension + local control API
    ├── link_parser.rs   — Extracts download candidates from text/HTML via regex
    ├── models.rs        — All shared data structures (serde)
    ├── events.rs        — EventEmitter trait (StdoutEventEmitter for standalone, TauriEventEmitter for app)
    ├── commands.rs      — Thin wrappers (dead_code, not used by Tauri layer)
    └── error.rs         — AppError enum
```

`DownloadService` is the central orchestrator. It coordinates all subsystems and is the only layer the Tauri frontend calls. The UI never talks to aria2 directly — Flamingo's task model is the source of truth.

### Tauri App (`src-tauri/src/main.rs`, ~1515 lines)

Registers ~50 `#[tauri::command]` functions that delegate to `DownloadService`. Also handles: native menus with i18n, system tray (Windows/Linux), external protocol registration (`magnet:`, `.torrent`), window state persistence, macOS Liquid Glass effects.

### Frontend (`ui/`)

React 19 + Ant Design 6 + TypeScript + Vite. Structured into `pages/`, `components/`, `hooks/`, `stores/`, `api/`, `i18n/`, `utils/`, `types/`. Supports theming (system/light/dark) and i18n (en-US, zh-CN).

### Browser Extension (`browser-extension/`)

Chromium and Firefox versions. Performs media sniffing (HLS/DASH manifests, video URLs) and sends detected URLs to the desktop app via the browser bridge HTTP API or native messaging.

## Key Design Decisions

- **aria2 is a background worker**, not the source of truth. DownloadService syncs with it via periodic polling (`start_sync_loop`).
- **Browser bridge** is a raw TCP HTTP server (no framework) with token auth, origin allowlisting, and rate limiting. Serves both `/add` (extension) and `/api/*` (local control).
- **SQLite migrations** use `PRAGMA user_version`. There are currently 8 migration versions in `db.rs`.
- **Error handling**: `anyhow` for internal errors, `thiserror` for `AppError` (user-facing).
- **No OpenSSL**: Uses `reqwest` with `rustls-tls`.

## CI/CD

GitHub Actions (`.github/workflows/build-release.yml`):
- **validate** job: `cargo fmt --check`, `cargo clippy`, UI lint, UI tests, preflight, bundle size check
- **build** job: Multi-platform matrix (Ubuntu, Windows, macOS ARM64), stages aria2 binaries, builds with `cargo tauri build`
- **release** job: On `v*` tags, creates GitHub release with checksums and conventional-commit-based release notes
- PRs only run the validate job; optional Linux smoke build via `linux-smoke` label

## Crates.io Mirror

`.cargo/config.toml` configures `rsproxy.cn` (Chinese mirror) for faster dependency downloads in certain regions.
