# Flamingo Downloader TODO

## 2026-05-01 Product Iteration Roadmap

参考对象：

- Gopeed：跨平台、多协议、浏览器扩展自动捕获、REST API/远程自动化。
- Free Download Manager：流量模式、分类组织、媒体预览、计划下载、批量处理。
- Motrix：aria2 驱动的现代桌面体验、BT 文件选择、多协议统一入口。
- JDownloader：面向重度用户的链接抓取、插件化站点适配、解压/密码/账号等自动化。
- aria2：HTTP/HTTPS/FTP/SFTP/BT/Metalink 与 JSON-RPC 是底层能力边界。

产品判断：

- Flamingo 已经具备下载器的基础闭环：aria2 生命周期、任务持久化、BT/磁力、浏览器桥、媒体嗅探、ffmpeg 合并、设置/诊断、发布流水线。
- 下一阶段不要继续只补散点功能，应围绕“可靠下载、资源发现、远程控制、自动化、可发布质量”形成可交付迭代。
- 项目技术形态适合保持 aria2 为传输核心，Rust 服务层做策略与状态真相，React/Tauri 做高质量桌面控制台。

### Phase 1 - P0 可靠下载闭环

- [ ] 设计任务健康状态模型：把 `waiting/active/paused/error/complete` 扩展为可解释的 health 字段，如 `network_unstable/auth_required/url_expired/disk_full/engine_unreachable/merge_failed`
- [ ] 后端统一错误归因：梳理 aria2 RPC 错误、HTTP 状态、ffmpeg stderr、文件系统错误，输出稳定 error_code + user_message + remediation
- [ ] UI 任务行展示可操作失败原因：失败任务直接给出“重试/编辑请求头/重新嗅探/打开日志/复制诊断”动作
- [ ] 增强重试策略：按错误类型决定是否自动重试，支持指数退避、最大尝试次数、网络恢复后重试
- [ ] 增加下载完整性校验入口：支持用户输入 checksum，完成后验证 SHA256/SHA1/MD5 并持久化结果
- [x] 新增磁盘空间守护：创建任务和下载过程中检查保存目录剩余空间，低空间时暂停并提示
- [ ] 验收：构造断网、403、过期 URL、磁盘不足、ffmpeg 失败、aria2 断连 6 类场景，UI 都能给出明确原因和下一步动作

### Phase 2 - P0 资源发现与批量添加

- [ ] 新建“链接解析”服务层：输入文本/HTML/剪贴板/浏览器候选，输出去重后的候选任务列表
- [ ] 支持网页资源扫描 MVP：用户输入页面 URL，后端拉取 HTML，按后缀、content-type、链接文本识别可下载资源
- [ ] 批量添加确认页：按类型/域名/文件大小分组，支持全选、反选、过滤、统一保存目录和分类
- [ ] 扩展浏览器嗅探候选质量评分：manifest 优先于分片，文件名清晰优先，带 content-length 的候选优先
- [ ] 加入重复资源归并：同 URL、同 final URL、同 BT infohash、同文件名+大小提示合并或保留
- [ ] 支持批量任务模板：headers/cookies/user-agent/referrer/save_dir/category 可以批量应用
- [ ] 验收：一个普通下载页、一个媒体播放页、一个包含 50+ 文件链接的页面，都能进入统一候选列表并批量创建任务

### Phase 3 - P1 远程控制与自动化

- [ ] 定义 Flamingo 本地控制 API：在现有 browser bridge 之外，提供受 token 保护的 `/tasks`、`/tasks/:id/actions`、`/stats`、`/health` 等只监听本机的 HTTP API
- [ ] 增加 API token 管理 UI：创建、撤销、复制、最近使用记录、权限范围（read/add/control）
- [ ] 提供 CLI 小工具或脚本入口：支持 add/list/pause/resume/status，方便终端和自动化调用
- [ ] 增加 Webhook/通知集成抽象：完成/失败/需要处理时可调用本地命令或 HTTP webhook
- [ ] 支持任务完成后动作链：校验、解压、移动、打开目录、执行命令，默认关闭高风险动作并加安全提示
- [ ] 增加远程只读仪表盘可行性调研：保持默认本机访问，评估局域网模式的认证、CORS、CSRF 和敏感信息脱敏
- [ ] 验收：用户可用 API/CLI 添加任务、查询进度、暂停恢复，并能在任务完成后触发一个本地脚本或 webhook

### Phase 4 - P1 媒体下载体验升级

- [ ] 媒体任务独立类型化：区分 direct file、HLS、DASH、progressive video、audio-only、unknown stream
- [ ] HLS/DASH 预检：创建任务前检查 manifest 可访问性、加密标记、分辨率/码率/音轨信息
- [ ] 新建媒体选择 UI：展示清晰度、格式、音轨、字幕候选，允许选择输出容器和文件名
- [ ] ffmpeg 参数模板化：普通合并、仅音频、转码规避、复制流优先等预设，保留高级自定义入口
- [ ] 嗅探候选过期处理：失败后引导用户回到浏览器刷新候选，而不是只显示下载失败
- [ ] 记录媒体任务 provenance：source_page、referer、manifest、headers 摘要、ffmpeg args、失败 stderr 摘要
- [ ] 验收：公开视频 HLS 页面可以从嗅探到合并完成形成稳定路径；DRM/加密/过期链接能明确说明不支持或需要刷新

### Phase 5 - P1 BT/磁力深度能力

- [ ] 完善 metadata 阶段体验：显示 metadata 下载进度、tracker/DHT 状态、超时后建议添加 tracker 或重试
- [ ] BT 文件树增强：按目录大小汇总、搜索文件、只选视频/压缩包/文档、选择结果保存为模板
- [ ] Tracker 订阅列表：内置公共 tracker 源，支持更新、启用/禁用、按任务追加
- [ ] 做种策略可视化：ratio/time/upload limit/完成后停止做种在任务详情中直接编辑
- [ ] 增加 BT 健康诊断：无 tracker、无 peer、DHT 未启用、端口不可达等给出原因和建议
- [ ] 验收：磁力任务从 metadata 到文件选择到下载/做种的每个阶段都有明确状态与可操作建议

### Phase 6 - P2 信息架构与高级用户效率

- [ ] 重构任务详情为多 Tab：Overview、Files、Network、Logs、Automation、Raw，降低单页复杂度
- [ ] 增加全局命令面板：搜索任务、执行暂停/恢复/打开目录/设置跳转等高频动作
- [ ] 增强筛选查询语法：支持 `status:error domain:example.com type:video size:>1GB tag:movie`
- [ ] 下载历史分析：按域名/类型/日期统计成功率、失败原因、下载量、平均速度
- [ ] 任务归档策略：完成任务可归档但保留可搜索记录，避免“已下载”列表无限增长
- [ ] 验收：1000+ 历史任务下仍能快速搜索、筛选、查看统计，并保持主列表清爽

### Phase 7 - P2 发布、质量与信任

- [ ] 增加端到端冒烟测试：Tauri 启动、aria2 检测、添加小文件、暂停恢复、完成入库
- [ ] 增加浏览器扩展集成测试清单：Chrome/Edge/Firefox 手动或自动化验证安装、配对、发送链接、嗅探候选
- [ ] 建立下载测试样本集：小文件、大文件、断点续传、BT、magnet、HLS、失败 URL、需要 referer 的资源
- [ ] 完善隐私说明：本地 RPC、token、浏览器扩展权限、日志脱敏、不会绕过 DRM
- [ ] 发布前检查脚本：版本号、README 截图、release notes、扩展 zip、aria2/ffmpeg 检测、签名状态
- [ ] 增加崩溃/错误报告导出向导：用户主动导出，默认脱敏，不自动上传
- [ ] 验收：每个 Release 都有可重复的 smoke checklist、测试样本结果和明确的已知限制

### Suggested Implementation Order

1. 先做 Phase 1：下载失败解释、重试、磁盘空间、校验。这一阶段直接提升可信度，也是后续自动化的基础。
2. 再做 Phase 2：统一候选资源解析和批量添加，把浏览器扩展、剪贴板、手工输入收敛到同一套模型。
3. 接着做 Phase 4：媒体下载已经有嗅探和 ffmpeg 基础，应补齐预检、选择和失败恢复。
4. 然后做 Phase 3：在核心模型稳定后开放本地 API/CLI，否则会过早固化不成熟接口。
5. Phase 5/6/7 可穿插推进，但每次发布至少带一个可验证的质量项。

### Near-term Slice: v0.2 Candidate

- [x] 后端：新增 `TaskHealth`/`FailureReason` 数据结构，并从 aria2/ffmpeg/IO 错误映射到稳定 code
- [x] DB：为任务表增加 health/error_code/remediation/last_retry_at/retry_count 字段，提供迁移
- [x] UI：失败任务行和详情页展示原因、下一步动作和复制诊断
- [x] Service：按错误类型实现自动/手动重试策略，并写入 operation log
- [x] Tests：覆盖错误映射、重试策略、DB 迁移、UI 格式化展示
- [x] Docs：在 README 增加“失败诊断与限制”小节

## 2026-03-19 Iteration

### P1 - Engineering Health

- [x] Backend: make `cargo clippy -- -D warnings` pass cleanly, including ffmpeg merge path cleanup and nested-condition simplification
- [x] Config safety: expand runtime settings validation to cover retry/bridge/JSON-backed settings and add focused unit tests
- [x] UI: remove remaining `react-hooks/exhaustive-deps` warnings in `ui/src/App.tsx`
- [x] UI build: split oversized Ant Design vendor chunk into smaller stable bundles and tighten bundle-size checks
- [x] Backend: restore `cargo fmt --check` to clean after the settings-validation refactor
- [x] Docs: replace the default Vite template in `ui/README.md` with project-specific frontend developer notes
- [x] Docs/tooling: align declared Node.js requirement with the current Vite 7 baseline
- [x] Tests: add unit coverage for `ui/src/utils/format.ts`
- [x] Tooling: add an early Node.js version check to preflight with warning/strict modes
- [x] CI/tooling: enforce the supported Node baseline in GitHub Actions and strict CI checks
- [x] UI maintainability: extract settings-related pure helpers from `ui/src/App.tsx` into a dedicated util with tests
- [x] Tests: add coverage for table layout sanitization rules

## 2026-02-22 Backlog (Next)

### P0 - CI Speed and Reliability

- [x] CI: skip full multi-platform build on `pull_request` (run `validate` + optional Linux smoke build only)
- [x] CI: avoid double UI builds (`preflight build-ui` vs Tauri `beforeBuildCommand`) via an env gate
- [x] CI: speed up Linux deps install (consider a prebuilt container image or a reusable composite action)
- [x] CI: upload bundle-size report for each platform build job too (not only `validate`)

### P0 - Media Merge (ffmpeg) UX

- [x] Merge progress: compute real progress via `out_time_ms` + `ffprobe` duration (avoid fake 0/100%)
- [x] Merge control: keep process handle to support cancel/stop from UI
- [x] Merge errors: normalize common failure reasons (403/401/cors, protocol whitelist, redirects) for clearer UI
- [x] Merge output: allow user to choose output filename/format (`.mp4` vs `.mkv`) in New Download advanced options

### P1 - Onboarding and Defaults

- [x] Default aria2 path: prefer bundled aria2 on first run, fallback to system PATH, then manual prompt
- [x] Default ffmpeg path: auto-detect common locations and validate, show effective path in Diagnostics
- [x] Browser bridge: add a small pairing wizard (copy endpoint/token, show status, open extension docs)

### P1 - Extension UX Polish

- [x] Extension popup: one-click “Send current page URL” action + clear skip reason if unsupported
- [x] Extension popup: show bridge probe details in a collapsible panel (avoid pushing out the media list)
- [x] Extension: add a simple “best guess” filter (prefer HLS/DASH manifests over segments when both present)

### P2 - Security and Diagnostics

- [x] Debug bundle: redact sensitive fields in `tasks.json`/`task_files.json` (not just operation logs)
- [x] Browser bridge: add request size limits and basic rate limiting for `/add` and `/health`
- [x] Extension: surface token/origin mismatch reason with actionable steps (copy token, open settings)

### P2 - Dependency Hygiene

- [x] UI: review `npm audit` vulnerabilities and upgrade/patch (avoid `--force` upgrades unless necessary)
- [x] Repo: add Dependabot for `cargo` and `npm` ecosystems

## 2026-02-22 Backlog (New)

### P0 - Must Fix / Guardrails

- [x] Windows: spawn `aria2c` without a console window (no black CMD flash)
- [x] CI: assert Release build has devtools disabled (Tauri `devtools=false`) and UI blocks context menu/DevTools hotkeys
- [x] Table: fully eliminate the right-edge blank/white strip across virtual/non-virtual modes (AntD `Table` scroll/virtual quirks)
- [x] Deletion persistence: ensure removed tasks never resurrect after restart (aria2 session import + DB reconcile edge cases)

### P1 - UX and Productivity

- [x] Shortcuts: show macOS symbols (⌘ ⌥ ⇧) as an optional display mode
- [x] Shortcuts editor: live conflict warnings inside the edit modal (show which action already uses the combo)
- [x] Add a “Keyboard Shortcuts” help/cheatsheet modal (read-only list + search)
- [x] Progress-row background: add a Settings toggle (some users prefer the classic progress bar)

### P1 - Browser Integration

- [x] Extension i18n (zh-CN/en-US) + default language detection
- [x] Extension popup: show “Send succeeded/failed” toast per URL with error reason
- [x] Extension: auto-bridge discovery UX (detect app running/port/token status and guide user)

### P2 - Media and Post-processing

- [x] HLS/DASH merge: make ffmpeg merge a first-class workflow (progress, output path, failure reasons)
- [x] Media tasks: persist merge metadata (input URL, output file, ffmpeg args) for diagnostics/export

### P2 - Performance and Maintainability

- [x] UI bundle size: split vendor chunks (antd), lazy-load heavy panels, and track bundle size in CI
- [x] Add small unit tests for: shortcut parsing/matching, rule matching, and safe-delete path validation

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
