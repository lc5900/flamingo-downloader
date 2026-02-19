# Flamingo Downloader TODO

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

- [ ] Split `ui/src/App.tsx` into pages/components/hooks; isolate API layer and state stores
- [ ] Extract i18n dictionaries into dedicated files (`ui/src/i18n/*.json`) and add key coverage checks
- [x] Large list performance: virtualize tables and reduce re-render churn (memoization + stable row keys)
- [x] Accessibility: keyboard shortcuts, focus management, and improved contrast audit for light/dark themes
