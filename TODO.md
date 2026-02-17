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
