# Flamingo Downloader TODO

## 2026-02-22 Backlog (New)

### P0 - Must Fix / Guardrails

- [x] Windows: spawn `aria2c` without a console window (no black CMD flash)
- [x] CI: assert Release build has devtools disabled (Tauri `devtools=false`) and UI blocks context menu/DevTools hotkeys
- [ ] Table: fully eliminate the right-edge blank/white strip across virtual/non-virtual modes (AntD `Table` scroll/virtual quirks)
- [ ] Deletion persistence: ensure removed tasks never resurrect after restart (aria2 session import + DB reconcile edge cases)

### P1 - UX and Productivity

- [ ] Shortcuts: show macOS symbols (⌘ ⌥ ⇧) as an optional display mode
- [ ] Shortcuts editor: live conflict warnings inside the edit modal (show which action already uses the combo)
- [ ] Add a “Keyboard Shortcuts” help/cheatsheet modal (read-only list + search)
- [ ] Progress-row background: add a Settings toggle (some users prefer the classic progress bar)

### P1 - Browser Integration

- [ ] Extension i18n (zh-CN/en-US) + default language detection
- [ ] Extension popup: show “Send succeeded/failed” toast per URL with error reason
- [ ] Extension: auto-bridge discovery UX (detect app running/port/token status and guide user)

### P2 - Media and Post-processing

- [ ] HLS/DASH merge: make ffmpeg merge a first-class workflow (progress, output path, failure reasons)
- [ ] Media tasks: persist merge metadata (input URL, output file, ffmpeg args) for diagnostics/export

### P2 - Performance and Maintainability

- [ ] UI bundle size: split vendor chunks (antd), lazy-load heavy panels, and track bundle size in CI
- [ ] Add small unit tests for: shortcut parsing/matching, rule matching, and safe-delete path validation

## P0 - Usability and Stability

- [x] Replace blocking `alert/confirm` with unified toast + modal feedback
- [x] Improve aria2 startup diagnostics (timeout retry, stderr hint, one-click check)
- [x] Harden safe-delete checks (strictly inside download root)
- [x] Better add-task UX (paste auto-detect, Enter submit, clearer errors)
- [x] Startup auto-reconcile/session-recovery messaging

## P0 - List UX

- [x] Task search + status filter toolbar
- [x] Sorting (updated time / speed / progress / name / created time)
- [x] Multi-select and batch actions (pause/resume/remove)
- [x] Rich row info (ETA, completed time, expandable error)
- [x] Row context menu (open/copy/retry)

## P0 - React Migration Gaps

- [x] React list search/filter/sort parity
- [x] React remove dialog with `delete_files` option
- [x] React batch actions (pause/resume/remove)
- [x] React rich row info (ETA, error details)

## P1 - Download Capabilities

- [x] Per-task options (save dir, filename, limits, headers/cookies/UA)
- [x] Global speed plan (time-based throttling)
- [x] Service-layer retry policy and fallback source strategy
- [x] Import/export task list
- [x] Browser takeover MVP (local bridge + extension template)

## P1 - BT / Magnet

- [x] Magnet metadata-phase UX polish and timeout handling
- [x] File selection workflow after metadata ready
- [x] Tracker management presets and diagnostics integration

## P1 - Settings and Onboarding

- [x] First-run setup wizard
- [x] Better grouped settings information architecture
- [x] Tray/minimize/notification preferences
- [x] Multiple download directories by rules (ext/domain/type)

## P2 - Visual and Interaction Polish

- [x] Theme system (system/light/dark)
- [x] Better empty states and skeleton loading
- [x] Advanced table UX (resizable columns, sticky key columns)
- [x] Unified icon/motion refinement

## P2 - Release and Platform

- [x] Fix release asset upload `Not Found` in GitHub Actions
- [x] Release notes template and artifact naming checks
- [x] Application self-update strategy
- [x] Local crash-log export package

## Next Iteration (Backlog)

### P0 - Tray and Startup

- [x] Ensure tray icon is always visible on macOS/Windows/Linux (explicit icon + fallback)
- [x] Add "start minimized" behavior and restore window state on app relaunch
- [x] Make aria2 startup non-blocking (UI renders immediately; background start + status indicator)
- [x] Add startup self-check summary page (aria2 path, RPC reachability, download dir permissions)

### P0 - Settings and Reliability

- [x] Apply more global settings to aria2 at runtime (e.g. overall speed limit, UPnP toggle) and reflect current effective values in UI
- [x] Improve aria2 option compatibility: detect unsupported flags and auto-fallback to a minimal arg set with a clear warning
- [x] Make aria2 path picker support "browse file" and validate executable permissions
- [x] Add safe "reset settings to defaults" and "reset UI layout" actions

### P1 - UX and Productivity

- [x] Persist table layout per list (column widths, order, hidden columns, density)
- [x] Add task details drawer (files, trackers, options, retry history, raw aria2 status)
- [x] Support drag-and-drop (URL text, `.torrent` file) into main window to open New Download
- [x] Add clipboard watcher (optional) to suggest creating a task when URL/magnet detected
- [x] Add per-task tags/categories and a simple filter

### P1 - Rules and Directories

- [x] Show which download-dir rule matched (and allow override) in the New Download dialog
- [x] Add "by mime/type" rule support for HTTP tasks after headers are known (fallback to extension)
- [x] Add per-rule "create subfolder by date/domain" toggles

### P1 - Notifications and Integrations

- [x] Desktop notifications on complete/error with action buttons (open file/folder)
- [x] Show dock/taskbar/tray badge counts (active/completed/error)
- [x] Register as handler for `magnet:` links and `.torrent` files (optional)

### P2 - Browser Takeover Hardening

- [x] Finish extension handshake UX (pairing token, connection status, reconnect)
- [x] Add "send to Flamingo Downloader" context menu item and optional auto-intercept downloads
- [x] Add Firefox build and docs alongside Chromium build

### P2 - QA and CI

- [x] CI: verify bundled aria2 binary runs (`aria2c --version`) on each OS and fail fast if missing
- [x] Add unit tests for retry scheduling, speed plan evaluation, and download-dir rules

## Next Iteration (Proposed)

### P0 - Release/CI and Packaging

- [x] README: fix `cargo tauri build` usage (`--manifest-path` passthrough) and align with current `frontendDist`
- [x] Tauri config: add `beforeBuildCommand` to build UI automatically for local `cargo tauri build`
- [x] CI: publish only user-facing bundles (dmg/msi/AppImage/deb/rpm) instead of entire `bundle/**` directory
- [x] CI: add `workflow_run`/preflight step to validate `ui/dist` and fail with clear hint when missing
- [x] macOS: document codesign/notarization options clearly; label unsigned artifacts explicitly

### P0 - Data and Stability

- [x] Add SQLite schema migrations with `PRAGMA user_version` to avoid startup panics on schema changes
- [x] Add DB auto-backup + integrity check, and include DB + logs in debug bundle (redacted)
- [x] Add startup error boundary: never `panic` in setup; surface failures via startup notice + logs window

### P1 - Download UX and Capability

- [x] Task queue ordering + priority controls (aria2 `changePosition`), including "top/bottom" actions
- [x] “New Download” dialog: presets per task type (HTTP/BT), and import/export of per-task option presets
- [x] Post-download actions: auto-open folder, auto-reveal file, and “copy final path” action
- [x] Completion rules: auto-delete `.aria2` control files; optional auto-clear completed records after N days

### P1 - BT Improvements

- [x] Seeding controls: stop after ratio/time, per-task upload limit, and “stop seeding” quick action
- [x] Better BT diagnostics: show peers/seeders if available, and tracker status parsing into UI

### P1 - Browser Takeover Hardening

- [x] Bridge security: restrict allowed origins, rotate token, and show recent browser-client activity
- [x] Extension: improve error reporting (why takeover failed) and add “Send to Flamingo” from link context menu on more pages

### P2 - UI Maintainability and Polish

- [x] Split `ui/src/App.tsx` into pages/components/hooks; isolate API layer and state stores
- [x] Extract i18n dictionaries into dedicated files (`ui/src/i18n/*.json`) and add key coverage checks
- [x] Large list performance: virtualize tables and reduce re-render churn (memoization + stable row keys)
- [x] Accessibility: keyboard shortcuts, focus management, and improved contrast audit for light/dark themes

## Next Iteration (New)

### P0 - Release/CI and Packaging

- [x] macOS signing: document secrets format (`APPLE_CERTIFICATE` base64 vs raw), add better debug output on import failure, and support notarization when secrets present
- [x] CI: add macOS x64 build (macos-13) alongside arm64, and normalize artifact naming for both
- [x] CI: cache `tauri-cli` install (or switch to `tauri-apps/tauri-action`) to speed up builds
- [x] CI: add a fast validation job (`cargo fmt --check`, `cargo clippy`, `npm --prefix ui run lint`, `npm --prefix ui run build`)
- [x] Repo hygiene: decide on npm vs pnpm and either commit/remove lockfiles or ignore `ui/pnpm-lock.yaml`

### P0 - UX and Productivity

- [x] Toolbar: add global actions (pause all / resume all / retry failed / clear completed)
- [x] New Download: support multi-line paste (create multiple tasks) with per-line validation/errors
- [x] Downloaded list: tailor columns for completed tasks (hide irrelevant columns) and add a compact “details” popover
- [x] Logs window: add search/filter, copy selected, export logs to file, and “follow tail” toggle

### P1 - Rules and Automation

- [x] Add category auto-tag rules (domain/ext/type -> category) and show category chips in list
- [x] Replace speed-plan raw JSON with a small UI editor (time ranges + limits), and keep JSON as the storage format
- [x] Add “schedule” mode (e.g. night-time full speed, day-time throttled) built on speed plan

### P1 - Browser Integration

- [x] CI: build and attach browser extension zip(s) to GitHub Releases
- [x] Extension: optional native-messaging mode (no open port) as an alternative to HTTP bridge

### P2 - Codebase Maintainability

- [x] Continue splitting UI into `pages/` + `stores/` (Downloading/Downloaded/Settings/AddDownload/TaskDetail), keep `App.tsx` as shell only
- [x] i18n: add placeholder coverage checks (e.g. `{tasks}` appears in both locales) and optional key typing generation

## Next Iteration (Roadmap)

### P0 - CI Guardrails

- [x] Add a single `scripts/preflight.sh` (and `scripts/preflight.ps1`) and reuse it in CI to keep checks consistent
- [x] Add GitHub Actions concurrency (cancel superseded runs on the same branch/tag)
- [x] Make macOS x64 build opt-in (workflow input) and keep it disabled by default unless the runner is supported

### P0 - UI Correctness

- [x] Fix all `react-hooks/exhaustive-deps` warnings in `ui/src/App.tsx` (stabilize callbacks and dependency arrays)
- [x] Switch task list refresh to event-driven updates (`task_update`) with a fallback polling timer
- [x] Add a diagnostics field showing resolved aria2 path source (bundled vs system vs manual)

### P1 - Download UX

- [x] Detect duplicate tasks (same URL/magnet/infohash) and prompt: open existing / create new anyway
- [x] Add a per-task “edit options” flow for supported aria2 options (limits, headers, seeding stop rules)
- [x] Show a compact header summary (total download speed, active count, free disk space of current save dir)

### P1 - BT Improvements

- [x] Task detail: show tracker list and peer summary (refresh button)
- [x] File selection: show BT file tree (folders) with select all/none and “invert selection”

### P1 - Browser Integration

- [x] Provide native-messaging host installers + docs for Win/macOS/Linux (to avoid open HTTP port)
- [x] Extension: optional downloads interception with allowlist (per-domain) and a clear “why not intercepted” reason

### P2 - Performance and Polish

- [x] Reduce initial bundle size (Vite `manualChunks` and lazy-load Settings/TaskDetail/Logs)
- [x] Add a “What’s new” section in Release notes with grouped changes (feat/fix/ci) instead of raw commit subjects

## Next Iteration (Video Sniffer)

### Phase 1 - Basic Detection (Extension-side)

- [x] Detect media candidates from browser requests (URL extension + response content-type)
- [x] Add media candidate list in extension options (latest first, dedupe by URL)
- [x] Support one-click “Send to Flamingo” for each detected candidate

### Phase 2 - UX and Filtering

- [x] Add page-scoped filtering (current tab only) and simple quality/format labels
- [x] Add whitelist/blacklist patterns for sniffer capture (host/path rules)
- [x] Add action buttons: copy URL / open source page / batch send selected

### Phase 3 - Product Hardening

- [x] Add optional HLS/DASH merge pipeline (ffmpeg-based) for `.m3u8/.mpd` links
- [x] Add backend endpoint validation for media jobs (normalize headers/referer when needed)
- [x] Add diagnostics for sniffer failures (CORS, expired URL, auth-required) with clear reasons
- [x] Add docs for DRM limitations and unsupported encrypted streams
