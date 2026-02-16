# Flamingo Downloader TODO

## P0 - Usability and Stability

- [x] Replace blocking `alert/confirm` with unified toast + modal feedback
- [x] Improve aria2 startup diagnostics (timeout retry, stderr hint, one-click check)
- [x] Harden safe-delete checks (strictly inside download root)
- [ ] Better add-task UX (paste auto-detect, Enter submit, clearer errors)
- [ ] Startup auto-reconcile/session-recovery messaging

## P0 - List UX

- [x] Task search + status filter toolbar
- [x] Sorting (updated time / speed / progress / name / created time)
- [x] Multi-select and batch actions (pause/resume/remove)
- [x] Rich row info (ETA, completed time, expandable error)
- [x] Row context menu (open/copy/retry)

## P1 - Download Capabilities

- [ ] Per-task options (save dir, filename, limits, headers/cookies/UA)
- [ ] Global speed plan (time-based throttling)
- [ ] Service-layer retry policy and fallback source strategy
- [ ] Import/export task list
- [x] Browser takeover MVP (local bridge + extension template)

## P1 - BT / Magnet

- [ ] Magnet metadata-phase UX polish and timeout handling
- [ ] File selection workflow after metadata ready
- [ ] Tracker management presets and diagnostics integration

## P1 - Settings and Onboarding

- [ ] First-run setup wizard
- [ ] Better grouped settings information architecture
- [ ] Tray/minimize/notification preferences
- [x] Multiple download directories by rules (ext/domain/type)

## P2 - Visual and Interaction Polish

- [x] Theme system (system/light/dark)
- [ ] Better empty states and skeleton loading
- [ ] Advanced table UX (resizable columns, sticky key columns)
- [ ] Unified icon/motion refinement

## P2 - Release and Platform

- [x] Fix release asset upload `Not Found` in GitHub Actions
- [ ] Release notes template and artifact naming checks
- [ ] Application self-update strategy
- [ ] Local crash-log export package
