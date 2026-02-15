# Implementation Progress

## Step 1 - Backend Core Skeleton (Done)
- Added core modules under `src/` and completed basic service wiring.

## Step 2 - Runtime Layout & Config Template (Done)
- Added `aria2/` runtime structure (`bin/conf/session`) with secure defaults.

## Step 3 - Build Verification & Tooling (Done)
- Added workspace Cargo mirror config and fixed `tokio` features.

## Step 4 - MVP Hardening (Done)
- Added BT file snapshot persistence and detail refresh improvements.

## Step 5 - Tauri Bridge Integration (Done)
- Added reusable backend init and full `src-tauri` command shell.

## Step 6 - Frontend MVP Page (Done)
- Added task list, URL add flow, controls, diagnostics, and real-time updates.

## Step 7 - BT/Magnet Product Flow UI (Done)
- Added magnet/torrent submit + file selection drawer.

## Step 8 - Settings Panel & Persistence UI (Done)
- Added settings load/save/reload UI and backend APIs.

## Step 9 - Safe Delete Files Flow (Done)
- Added delete-files option with download-root boundary safeguards.

## Step 10 - Diagnostics Actions & Operation Logs (Done)
- Added diagnostics actions and operation log UI.

## Step 11 - Startup Recovery & Baseline Tests (Done)
- Added reconcile-on-start/restart and baseline unit tests.

## Step 12 - Aria2 Trait Abstraction & Mock Service Tests (Done)
- Introduced `Aria2Api` trait and mock-based async service tests.

## Step 13 - Single-Flight Lifecycle Guard & Log Persistence (Done)
- Added single-flight guards and SQLite-backed operation log persistence with periodic flush.

## Step 14 - Log Retention & Clear-Logs Action (Done)
- Added retention policy (keep latest 5000 logs) and clear logs command/UI action.

## Step 15 - SQLite Migration Versioning (Done)
- Added schema version marker via `PRAGMA user_version` (current-schema init path).

## Step 16 - Destructive Iteration Cleanup (Done)
- Removed old upgrade compatibility branches and old-version migration regression tests.

## Step 17 - Strict DB Enums & Simpler Recovery Policy (Done)
- Unknown DB enum values now error explicitly (no default fallback).
- Recovered orphan tasks use deterministic type policy.

## Step 18 - Single Runtime Config Source (Done)
- Seeded runtime defaults into DB settings once at startup.
- Removed service-level download dir fallback defaults.

## Step 19 - Startup Config Integrity Validation (Done)
- Added `Database::validate_runtime_settings()` fail-fast validation:
  - required keys must exist and be non-empty (`download_dir`, `max_concurrent_downloads`, `max_connection_per_server`)
  - numeric settings must parse (`max_concurrent_downloads`, `max_connection_per_server`, optional `split`)
  - boolean settings must be strict (`enable_upnp` => `true|false`)
- Hooked validation into backend init after default seeding.
- Added regression tests:
  - `validate_runtime_settings_passes_for_valid_values`
  - `validate_runtime_settings_fails_for_invalid_values`

## Verification
- `cargo test` passes (10 tests).
- `cargo check` (root) passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.

## Next Step
- Expose runtime config validation result and DB path/schema version in diagnostics payload for easier support/debugging.

## Step 20 - i18n System Locale Fallback (Done)
- Added frontend i18n dictionary for `en-US` and `zh-CN`.
- Added startup locale detection from system (`navigator.languages` / `navigator.language`).
- Fallback policy: if system locale is unsupported, default to English (`en-US`).
- Applied i18n to static page labels/placeholders and dynamic UI messages.

## Step 21 - Manual Locale Override & Persistence (Done)
- Added language selector in top bar (`en-US`, `zh-CN`).
- Added locale persistence via `localStorage` (`tarui.locale`).
- Locale resolution order: user selection > system locale > fallback `en-US`.
- Switching locale now re-renders task cards, logs, and open detail drawer immediately.

## Step 22 - UX Split into Downloading / Downloaded / Settings (Done)
- Refactored frontend into 3 user-facing views with tabs:
  - Downloading: add tasks + current downloads + pause/resume operations.
  - Downloaded: completed task list.
  - Settings: global settings + diagnostics + operation logs.
- Main view now avoids exposing settings/diagnostics directly.
- Task rendering now splits by status (`completed` into Downloaded; others in active list except `removed`).

## Step 23 - aria2 Auto-Integration & Update Check (Done)
- Added platform-aware aria2 binary resolution (`windows/mac/linux` candidates, fallback path).
- Persisted resolved `aria2_bin_path` in runtime settings for diagnostics.
- Extended diagnostics payload with:
  - `aria2_bin_path`
  - `aria2_bin_exists`
- Added backend update check API `check_aria2_update`:
  - reads current aria2 version via RPC
  - fetches latest release from GitHub API
  - compares versions and returns `update_available`
- Added Tauri command: `check_aria2_update`.
- Added Settings UI action/button and result panel for aria2 update check.

## Step 24 - aria2 Auto-Update Execution Flow (Done)
- Added backend command `update_aria2_now`:
  - check latest release and platform asset
  - download archive
  - extract `aria2c` (`zip` / `tar.gz` / `tar.xz`)
  - stop aria2 -> replace binary -> restart aria2 -> reconcile
- Extended update-check payload:
  - `selected_asset_name`
  - `selected_asset_url`
- Added Tauri command bridge for update execution.
- Added Settings UI button: `Update aria2 Now`.
- Added i18n strings for update execution confirmation/action.

## Step 25 - Safe Update Rollback & Binary Self-Check (Done)
- Added binary self-check before swap: run downloaded `aria2c --version` from temp file.
- Added atomic update with backup:
  - existing binary renamed to `.bak`
  - new binary swapped into place
- Added restart failure rollback:
  - if aria2 fails to restart after update, restore `.bak` and retry startup.
- Added cleanup:
  - remove backup file after successful restart.

## Step 26 - UI Layout Refactor: Left Nav + Top Tool Menu (Done)
- Refactored frontend layout into:
  - left navigation (`Downloading` / `Downloaded`)
  - top tool menu (`New Download`, `Settings`, `Refresh`)
  - main content focused on download list display.
- Moved add-task forms and settings/diagnostics/logs into top tool panels.
- Main panel now switches between current downloads and completed downloads via left nav.
- Kept existing task operations, i18n, diagnostics, update-check and update-now features.

## Step 27 - Modernized Adaptive Layout + Icon Navigation + Settings Subtabs (Done)
- Added parent-friendly adaptive sizing:
  - `html/body` full height
  - app shell and workspace minimum heights to prevent sparse/short layouts.
- Modernized visual language:
  - layered gradients, glass-like panels, stronger spacing, soft shadows, refined button styles.
- Added icon-enhanced navigation and top tools using inline SVG icons.
- Split settings tool panel into subtabs:
  - Basic / Diagnostics / Updates / Logs.
- Updated frontend behavior:
  - settings subtab switching
  - top tool panels open mutually exclusively.

## Step 28 - Visual Hierarchy Refinement (Done)
- Added task status visual system:
  - colored left border + status badge style per state (`active/paused/error/completed/queued/metadata`).
- Added action hierarchy in task cards:
  - active-like tasks prioritize `Pause`
  - paused tasks prioritize `Resume`
  - secondary actions use quieter styling.
- Tuned ghost button hover and card contrast for clearer interaction priority.

## Step 29 - Add URL Submit Reliability Fix (Done)
- Switched URL input from browser-native `type=url` to `type=text` and enabled `novalidate` on add-url form.
- Added explicit URL normalization in frontend:
  - auto-prefix `https://` when scheme is missing.
- This avoids silent form-block behavior in WebView and ensures backend errors are surfaced.

## Step 30 - Settings Auto-Load + List Auto-Refresh + Add URL Feedback (Done)
- Opening settings tools now auto-loads:
  - current global settings
  - diagnostics
  - aria2 update info
  - operation logs.
- Added periodic task list auto-refresh (`2.5s`) with cleanup on unload.
- Improved add-url UX reliability:
  - normalize/validate URL before submit
  - disable submit button during request
  - explicit success alert after task creation.
- Closing settings panel now resets settings subtab to `Basic` for predictable reopen behavior.

## Step 31 - Add Action Reliability via Explicit Click Handlers + In-App Status Bar (Done)
- Replaced add-task submit dependency with explicit button click handlers (`Add URL/Magnet/Torrent`).
- Added Enter-key handlers for URL/Magnet inputs.
- Added persistent in-app status bar to show `Ready / Processing / Success / Error` messages.
- Integrated status updates into add-url flow and global error handler.

## Step 32 - System aria2 Binary Fallback Resolution (Done)
- Enhanced aria2 binary resolution to also search:
  - common system paths (macOS/Linux)
  - all directories in `PATH`.
- This allows using Homebrew/system-installed `aria2c` without manually copying into `aria2/bin`.

## Step 33 - Zero-Setup aria2 Bootstrap on First Launch (Done)
- Added backend bootstrap logic: if `aria2c` is missing, app now auto-downloads a platform-matching aria2 release asset from GitHub.
- Implemented archive extraction (`zip` / `tar.gz` / `tar.xz`) and binary install before service start.
- Backend init now enforces:
  - ensure aria2 binary present
  - then start aria2 + sync loop
- Result: first launch no longer requires manual aria2 installation in normal network conditions.

## Step 34 - Cross-Platform aria2 Availability Guard (Done)
- Removed startup hard-fail bootstrap path that could crash app setup when no compatible asset is found.
- Startup now degrades gracefully: app can open even when aria2 binary is missing.
- Added preflight readiness checks before aria2-dependent operations:
  - if aria2 unavailable, return unified actionable error:
    `Go to Settings > Updates and click 'Update aria2 Now'`.
- Updated update flow logic:
  - `update_aria2_now` now treats `no current version` as update-needed.
- Updated release lookup strategy in updater:
  - tries multiple binary release sources and picks first compatible asset.
- Removed non-cross-platform `brew` installation path from runtime logic.

## Step 35 - Update Asset Matching Robustness (Done)
- Relaxed release asset matcher for cross-platform binaries:
  - expanded OS/arch keywords
  - supports universal/all naming patterns
  - fallback to first supported archive if exact tags are missing.
- Added additional archive support for updater extraction:
  - `tar.bz2` / `tbz2`.
- This fixes `no compatible binary asset found for current platform` in common macOS arm64 release naming variants.

## Step 36 - Update Action Visible Progress Feedback (Done)
- Added in-app visible progress feedback for `Update aria2 Now`:
  - status bar shows ongoing update/download text with animated dots.
  - update button disabled during operation.
- Added explicit success/failure status updates after update flow completes.
- This removes the “clicked but no reaction” perception during long-running update calls.

## Step 37 - No-Scroll Layout + Stronger Update Click Feedback (Done)
- Enforced no-page-scroll layout:
  - body/app shell/workspace overflow locked
  - only content zones (task list, tool panel, logs/pre blocks, sidebar) are scrollable.
- Added stronger update action feedback:
  - immediate click status trace with timestamp
  - safer optional event bindings to avoid silent failures when elements are missing.

## Step 38 - Update UX + Detached Logs Window + Tool Panel Height Fix (Done)
- Removed update confirmation blocker; `Update aria2 Now` now starts immediately on click.
- Added detached floating logs window:
  - topbar `Logs` button opens independent logs panel
  - logs can be closed separately.
- Reduced tools panel height to keep main list dominant and avoid oversized diagnostics/tools area.
- Refined fixed-layout rows to better prevent whole-page scrolling while keeping inner regions scrollable.

## Step 39 - Full-Page Settings Mode + Update Asset Validation Tightening (Done)
- Settings panel is now full-page overlay mode (independent from main page, close returns to main).
- Kept add-tools panel compact while allowing settings panel full-height usage.
- Tightened update asset selection:
  - requires OS match and (arch match or universal)
  - excludes likely source archives (`aria2-<ver>.tar.*`).
- Improved update install failure diagnostics to include selected asset name.

## Step 40 - Logs Window Visibility in Settings + Update Candidate Fallback (Done)
- Added settings-panel log-window entry button so logs can be opened while settings full-page mode is active.
- Raised detached logs window z-index above settings overlay to ensure visibility.
- Improved update candidate resolution:
  - surfaces GitHub API error message when present
  - adds relaxed non-source binary fallback when strict OS/arch matching yields no candidate.

## Step 41 - Independent Draggable Logs Window + UI Status Log Stream (Done)
- Promoted logs into a truly independent floating logs window with:
  - open/close controls
  - draggable title bar.
- Added frontend status lines into logs stream (not only backend operation logs), so errors like install/self-check are visible in the logs window.
- Kept logs window visible above settings full-page overlay.

## Step 42 - True External Logs Window (Tauri WebviewWindow) + Platform Error Detail (Done)
- Logs now open in a true separate Tauri window (`logs.html`) outside the main UI surface.
- External logs window supports:
  - refresh
  - clear backend logs
  - close window.
- UI status lines are persisted to local storage and displayed in the external logs window alongside backend logs.
- Enhanced update failure message now includes runtime platform tuple (`os-arch`).

## Step 43 - External Logs Window Open Reliability + Removed Redundant Update Click Log (Done)
- Removed redundant `Update button clicked` status line from UI logs.
- Improved external logs window open path compatibility:
  - tries `window.WebviewWindow` and legacy fallback namespaces
  - adds explicit status error when open fails.

## Step 44 - Logs Window Open via Backend Command + Legacy UI Log Cleanup (Done)
- Added backend Tauri command `open_logs_window` to create/focus logs window reliably.
- Frontend `Logs` action now calls backend command (with fallback to in-page drawer only if open fails).
- Added startup cleanup for legacy UI log lines containing `Update button clicked` and persists cleaned log set.

## Step 45 - Main-Page Status Area Removed; Logs Unified to External Window (Done)
- Removed top status/log display area from main page.
- Removed in-page draggable logs drawer fallback path.
- Logs are now unified to external logs window flow (`open_logs_window`) only.
- Kept UI status entries persisted for external logs window visibility.

## Step 46 - External Logs Auto-Refresh Enhancement (Done)
- Increased external logs window polling frequency to 1s.
- Added immediate refresh on window focus.
- Added refresh trigger on storage changes (`UI logs` updates).

## Step 47 - Logs Window Buttons Reliability + Auto-Refresh Stability (Done)
- Fixed external logs window command compatibility across Tauri API namespaces:
  - supports `__TAURI__.core.invoke`
  - supports legacy `__TAURI__.tauri.invoke`
  - supports `__TAURI_INTERNALS__.invoke` fallback.
- Added backend command `close_logs_window` and wired logs `Close` button to it first, with frontend fallback close paths.
- Updated logs `Clear` behavior to clear both backend operation logs and persisted UI logs.
- Added strict init guard for logs window required elements so failures are explicit instead of silent no-op.
- Verified with `node --check dist/logs.js` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Step 48 - Strict Platform Asset Selection + GitHub CDN Setting (Done)
- Fixed update asset selection to avoid cross-platform fallback mistakes:
  - removed relaxed fallback that could pick incompatible binaries (e.g. Windows asset on macOS).
  - kept strict OS/arch matching and added OS-specific archive preference scoring.
- Added new global setting `github_cdn` (Settings -> Basic):
  - used for release API request URL rewrite.
  - used for release asset download URL rewrite.
  - supports either prefix concat (`<cdn><url>`) or template mode (`...{url}...`).
- Improved GitHub rate-limit error message to explicitly suggest configuring `github_cdn` in Settings.
- Wired frontend settings form + i18n for GitHub CDN input.
- Verified by `node --check dist/app.js`, `node --check dist/logs.js`, and `cargo check`.

## Step 49 - Fallback to Historical Releases When Latest Has No Compatible Asset (Done)
- Updated GitHub release resolution logic:
  - first checks `releases/latest` for compatible current-platform asset.
  - if latest has no compatible asset, now falls back to `releases?per_page=30` and scans historical releases.
  - picks the first non-draft release containing a strict OS/arch compatible binary asset.
- Preserved strict platform matching (no cross-platform fallback).
- Kept GitHub rate-limit guidance with `github_cdn` hint.
- Verified by `cargo check --manifest-path src-tauri/Cargo.toml`.

## Step 50 - Preset GitHub CDN Options in Settings (Done)
- Added preset GitHub CDN dropdown in settings basic page.
- Included common preset entries:
  - `https://ghproxy.com/`
  - `https://ghfast.top/`
  - `https://ghproxy.net/`
- Added `Custom / Direct` mode; manual input still fully supported.
- Wired dropdown/input sync:
  - selecting preset auto-fills CDN input
  - manual edit auto-switches preset selector to matching entry or custom.
- Added i18n labels (English + Chinese) for preset field/options.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 51 - Better GitHub API Error Message + Logs Selection-Friendly Refresh (Done)
- Replaced direct `response.json()` calls in release fetching with `fetch_json()` helper:
  - includes URL + HTTP status when request fails.
  - when body is non-JSON (e.g. CDN HTML page), reports readable parse error with response snippet.
  - avoids opaque `error decoding response body` diagnostics.
- Updated external logs window refresh behavior:
  - auto-refresh now skips updates while user is actively selecting text in log area.
  - manual refresh button still forces refresh.
  - reduced unnecessary re-render by only updating text when content changes.
- Verified with `node --check dist/logs.js` and `cargo check`.

## Step 52 - Keep GitHub API Direct, Use CDN Only for Asset Downloads (Done)
- Fixed update-check JSON parse issue with `ghproxy` HTML responses.
- Changed release metadata requests to always call GitHub API directly:
  - `releases/latest`
  - `releases?per_page=30`
- Kept CDN rewriting only for `browser_download_url` asset downloads.
- Result: avoids `invalid json response ... body starts with <!DOCTYPE html>` when CDN does not proxy API endpoints.
- Verified by `cargo check`.

## Step 53 - Repo Source Order + Error Reporting Cleanup (Done)
- Removed invalid/404-prone repo source `P3TERX/aria2-static-builds` from updater source list.
- Adjusted source order to try official repo first (`aria2/aria2`), then static-binary repo.
- Improved final error decision logic:
  - if any repo responded normally but had no compatible binary, return clear `no compatible binary asset` message.
  - only surface raw repo API error when all sources failed with hard errors.
- Verified by `cargo check`.

## Step 54 - Official Repo Legacy Binary Fallback + Noise Reduction + Auth Token Support (Done)
- Improved official repo asset selection:
  - strict OS/arch match still first priority.
  - added fallback for `aria2/aria2` historical OS-only binary assets (legacy naming without explicit arch).
- Added optional `github_token` setting and wired it into update requests:
  - sent as `Authorization: Bearer <token>` for GitHub API calls and release asset download requests.
- Added settings UI field for GitHub token (password input).
- Reduced update log spam:
  - removed repeated dotted progress status lines during `update_aria2_now`.
- Suppressed noisy `event.listen not allowed` startup error by gracefully falling back to polling-only updates.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 55 - Fix Source-Archive Misclassification for Official macOS Binary Tarballs (Done)
- Fixed `is_source_archive_name()` false positives:
  - previously, filenames like `aria2-1.35.0-osx-darwin.tar.bz2` were incorrectly treated as source archives and filtered out.
  - now only treat `aria2-<version>.tar.*` as source when no platform/arch markers are present.
- This enables selecting official historical macOS binary tarballs for `macos-aarch64` fallback flow.
- Verified by `cargo check`.

## Step 56 - CDN Download Fallback + Legacy Log Noise Cleanup (Done)
- Fixed `bzip2: bz2 header missing` update failure path by hardening asset download:
  - if CDN is configured, updater now tries CDN-wrapped asset URL first.
  - if content is invalid or request fails, automatically falls back to official direct asset URL.
  - validates downloaded payload can be parsed as expected archive/binary before install.
- Added optional GitHub auth support already wired in update requests to reduce rate-limit issues.
- Reduced UI log noise:
  - status logger now suppresses immediate duplicate messages.
  - startup cleanup removes legacy `event.listen not allowed` and old update-click noise entries from stored UI logs.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 57 - Manual aria2 Path + Auto Detect (Done)
- Added manual `aria2 binary path` setting to basic settings page.
- Added `Detect aria2 Path` action:
  - scans common install locations and PATH.
  - returns existing executable candidates and auto-fills first match.
- Saving manual path now validates the file and applies it immediately by copying into managed aria2 runtime binary path, then restarts aria2.
- Kept diagnostics/restart workflow unchanged for user verification.
- Verified with `node --check dist/app.js` and `cargo check`.

## Step 58 - Settings Save Resilience + New Download Modal with Secondary Tabs (Done)
- Fixed settings save failure when aria2 is not running:
  - global settings now persist successfully even if aria2 process is offline.
  - runtime `change_global_option` is only attempted when aria2 endpoint is active.
- Added manual install UX improvements:
  - `Detect aria2 Path` backend command + frontend button to scan common paths and PATH.
- Implemented new-download popup workflow:
  - `New Download` now opens a centered modal with backdrop.
  - added secondary tabs: `URL`, `Magnet`, `Torrent`.
  - each add action closes modal after success.
- Kept settings full-page flow intact while ensuring it closes add modal before opening.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 59 - Manual Path Save Decoupled from Runtime Apply (Done)
- Fixed manual aria2 path save failure by decoupling persistence from runtime apply.
- New behavior:
  - valid manual path is always saved first.
  - applying/copying/restarting aria2 is attempted afterwards.
  - if apply fails, settings still remain saved and a warning is written to operation logs.
- Added internal helper `apply_manual_aria2_binary()` for clearer flow and rollback handling.
- Verified by `cargo check` and `node --check dist/app.js`.

## Step 60 - Aria2 Startup Reliability + Faster App Boot (Done)
- Improved aria2 startup reliability:
  - ensure session file exists before launching aria2 (`--input-file` no longer fails on missing file).
  - increased RPC readiness wait window from ~10s to ~30s.
  - timeout message now explicit (`30s timeout`).
- Reduced startup latency in frontend:
  - removed automatic `check_aria2_update` call from app boot sequence.
  - toolbar `Refresh` no longer triggers update-check request by default.
  - update check remains available from Updates tab/button.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 61 - Faster Failure Feedback for aria2 Startup + Immediate UI Action Status (Done)
- Reduced RPC-ready wait from 30s to 12s to avoid long no-response perception.
- Added early-exit detection during aria2 startup:
  - if aria2 process exits before RPC is ready, return immediate explicit error (`aria2 exited before rpc became ready: <status>`).
  - cleanup child/client/endpoint state on startup failure.
- Added immediate frontend status lines for diagnostics actions:
  - `RPC ping...`
  - `Restarting aria2...`
  so button clicks now show instant feedback.
- Verified with `node --check dist/app.js` and `cargo check`.

## Step 62 - Surface Real aria2 Startup Error (stderr tail) + Updated Guidance (Done)
- aria2 startup now writes stderr to `runtime/aria2.stderr.log` instead of discarding it.
- Startup failure now includes stderr tail in returned error for both:
  - early process exit before RPC ready
  - RPC readiness timeout.
- Updated user-facing unavailable guidance from update-centric text to settings-path-centric text.
- Goal: quickly diagnose exit status issues like `exit status: 28` without blind retries.
- Verified by `cargo check` and `node --check dist/app.js`.

## Step 63 - Fix Startup Crash on Unsupported `--enable-upnp` Option (Done)
- Root cause identified from stderr: current aria2 binary does not support CLI option `--enable-upnp`.
- Removed `--enable-upnp=...` from aria2 startup arguments for compatibility.
- Also stopped sending runtime `enable-upnp` via `change_global_option` in settings apply path to avoid RPC option errors on this binary.
- Verified by `cargo check`.

## Step 64 - Completed List Action Buttons (Open File/Dir, Delete Files, Delete Record) (Done)
- Added backend commands:
  - `open_task_file(task_id)`
  - `open_task_dir(task_id)`
- Implemented task path resolution from task files/save_dir/name and OS-native open behavior.
- Updated completed-item UI actions to include:
  - Open File
  - Open Folder
  - Delete Files
  - Delete Record
- Wired frontend handlers:
  - open file/folder invokes new backend commands.
  - delete files+record -> `remove_task(deleteFiles: true)`.
  - delete record only -> `remove_task(deleteFiles: false)`.
- Added i18n labels and confirmation texts (EN + ZH).
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 65 - Completed Delete Buttons Responsiveness Hardening (Done)
- Improved completed-list delete handlers for WebView reliability:
  - added immediate status logs on click (`requested`/`removed`) for observability.
  - confirmation now degrades safely when `window.confirm` is unavailable/fails.
- Added explicit `type="button"` for completed-item action buttons to avoid accidental default button behavior.
- Verified with `node --check dist/app.js` and `cargo check`.

## Step 66 - Fix Hanging Completed Deletion Actions (Done)
- Root cause: completed-task deletion could block on `aria2.remove` RPC and never return to UI.
- Updated backend `remove_task` to guard aria2 remove with short timeout (1.2s) and always continue with local deletion flow.
- Result: `Delete Files` / `Delete Record` now complete even when aria2 RPC is slow/unresponsive for historical GIDs.
- Verified by `cargo check` and `node --check dist/app.js`.

## Step 67 - Completed Deletion UX Simplified to Single Button + Checkbox Modal (Done)
- Replaced dual completed-delete buttons with a single `Remove` button.
- Added custom confirmation modal for completed-task deletion:
  - checkbox `Also delete downloaded files`.
  - unchecked -> remove record only.
  - checked -> delete files + remove record.
- Added modal backdrop/cancel/confirm wiring and i18n entries (EN + ZH).
- Preserved `Open File` / `Open Folder` actions in completed list.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 68 - Modern Visual Refresh (Design-System Pass) (Done)
- Upgraded visual system to a more modern look while preserving existing interactions:
  - refined color tokens, softer elevation, and cleaner glass panel layering.
  - sticky topbar, improved button motion feedback, and card hover elevation.
  - improved modal atmosphere with stronger backdrop blur + pop-in animation.
  - added focus rings for input/select accessibility and perceived polish.
  - added custom thin scrollbars for list/drawer/panel consistency.
- Fixed style sheet inconsistency around form control blocks and kept CSS structure stable.
- Verified frontend script integrity via `node --check dist/app.js`.

## Step 69 - Full Layout-Level Modernization Pass (Done)
- Rebuilt `dist/styles.css` with a stronger modern visual system (not only shadow tweaks):
  - new structural hierarchy for shell/sidebar/main workspace with clearer visual contrast.
  - dark-tinted navigation rail + bright content surface for stronger information architecture.
  - refined topbar, card system, action controls, modals, and drawer cohesion.
  - improved micro-interactions (hover/press transitions), modal animations, and focus styles.
  - unified custom scrollbar styling and responsive behavior.
- Preserved all existing DOM hooks and JS behavior compatibility.
- Verified frontend script integrity via `node --check dist/app.js`.

## Step 70 - Conservative Enterprise-Style Redesign (Ant/Tabler-like) (Done)
- Replaced previous experimental visual direction with a conservative, mature product style.
- Rewrote `dist/styles.css` to align with enterprise UI conventions:
  - neutral background, clean white surfaces, restrained shadows.
  - stable button system, clear focus states, standardized spacing.
  - dark left navigation rail + light content work area for strong hierarchy.
  - consistent cards/modals/drawers/forms/status styling.
- Preserved all existing DOM structure and JS bindings (no behavior changes).
- Verified frontend script with `node --check dist/app.js`.

## Step 71 - Downloaded View Upgraded to Table Layout (Ant-like) (Done)
- Replaced completed-task card rendering with a table-style layout (header + rows).
- Added table columns:
  - Name
  - Size
  - Status
  - Actions
- Kept all completed-item actions in-row:
  - Detail
  - Open File
  - Open Folder
  - Remove (opens checkbox modal)
- Added dedicated styles for table container, sticky header, hover rows, and action-cell layout.
- Added i18n keys for table headers (EN + ZH).
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 72 - Always-Visible Empty Tables for Downloading/Downloaded (Done)
- Converted `downloading` section rendering from card list to table view.
- Added downloading table columns:
  - Name
  - Progress
  - Speed
  - Status
  - Actions
- Kept row actions for downloading tasks:
  - Detail
  - Pause/Resume (status-aware primary action)
  - Remove
- Updated completed table to always render even when list is empty.
- Added empty-state table rows (`cell-empty`) for both downloading and downloaded tables, so headers remain visible with no data.
- Added i18n keys for new table headers (`table.progress`, `table.speed`) in EN + ZH.
- Verified by `node --check dist/app.js` and `cargo check`.

## Step 73 - Repository Publish Docs and License (Done)
- Added root `README.md` with:
  - project positioning and architecture summary
  - current feature list
  - local run instructions (`cargo run --manifest-path src-tauri/Cargo.toml`)
  - release build hint
  - GitHub publish recommendations
- Chosen project name: `🦩 Flamingo Downloader`.
- Added root `LICENSE` using MIT License.

## Step 74 - Bilingual README Split (Done)
- Rewrote root `README.md` as English-first documentation.
- Added `README_zh.md` for Chinese documentation.
- Added cross-links between `README.md` and `README_zh.md`.

## Step 75 - GitHub Actions Cross-Platform Build/Release Pipeline (Done)
- Added CI scripts:
  - `scripts/ci/prepare_aria2_unix.sh`
  - `scripts/ci/prepare_aria2_windows.ps1`
- Added workflow:
  - `.github/workflows/build-release.yml`
- Pipeline capabilities:
  - matrix builds for Linux/Windows/macOS (x64 + arm64 macOS runners)
  - stages aria2 binary before Tauri packaging
  - uploads per-platform bundle artifacts
  - auto-publishes GitHub Release assets on `v*` tags
- Enabled Tauri bundling in `src-tauri/tauri.conf.json` (`bundle.active=true`) for CI packaging.
- Updated `README.md` and `README_zh.md` with CI usage instructions.
