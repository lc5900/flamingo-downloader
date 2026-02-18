# 🦩 Flamingo Downloader

一个基于 Tauri + Rust + aria2 的跨平台桌面下载器。  
项目目标是做“下载产品”，而不是“下载协议栈”。

English README: [`README.md`](README.md)

## 当前功能

- 通过 aria2 JSON-RPC 支持 HTTP/HTTPS 链接下载
- 支持 magnet / torrent
- 主界面分为“下载中 / 已下载”两个页面
- 支持任务暂停、继续、删除
- 已下载任务支持：打开文件、打开目录、删除记录（可选同时删除文件）
- 新建下载弹窗支持“本次下载目录”设置（默认自动建议）
- 支持按 `ext/domain/type` 规则分流到不同下载目录
- 独立日志窗口
- 独立设置页面
- 主题模式支持 `system / light / dark`，并提供工具栏快捷切换
- 国际化支持（`en-US`、`zh-CN`），自动读取系统语言，非支持语言默认英文
- SQLite 持久化任务和设置
- 支持手动指定 aria2 路径并检测可用路径
- 提供本地浏览器桥接（`127.0.0.1` + token）
- 提供浏览器扩展模板：`browser-extension/`（Chromium + Firefox，自动接管 + 右键发送）

## 架构概览

- 前端（Tauri WebView）：任务列表、设置、日志与交互
- Rust 服务层：aria2 生命周期管理、RPC 封装、状态同步、数据持久化
- aria2c 进程：实际下载执行器

核心原则：
- UI 不直接访问 aria2 RPC
- aria2 RPC 仅监听 localhost，并启用 secret
- 应用自己的任务状态模型是“真相”

## 本地运行

### 1. 环境准备

- Rust（建议 stable）
- 对应系统的 Tauri 2 构建依赖
- 可用的 `aria2c` 二进制（当前模式为手动指定路径）

### 2. 启动

```bash
cargo run --manifest-path src-tauri/Cargo.toml
```

### React + Ant Design 迁移工作区（进行中）

仓库已新增 `ui/`（React + AntD）用于渐进迁移：

```bash
cd ui
npm install
npm run dev
```

将 React 构建产物同步到应用静态资源：

```bash
cd ui
npm run build
cp -R dist/* ../dist/
```

### 3. 首次配置

进入设置页后：
1. 设置 `aria2 Binary Path`
2. 点击 `Detect aria2 Path`（可选）
3. 保存设置
4. 点击 `Restart aria2`，再点 `RPC Ping` 验证

如需浏览器接管：
1. 设置中保持 `Browser Bridge Enabled` 开启
2. 查看桥接端口与 token
3. 在 Chrome/Edge 以开发者模式加载 `browser-extension/`
4. Firefox 测试请使用 `browser-extension/manifest.firefox.json`（见 `browser-extension/README.md`）
5. 在扩展选项中填入 endpoint 与 token

## 打包（可选）

```bash
# 1) 先构建前端产物（frontendDist=../ui/dist）
npm --prefix ui run build

# 2) 再构建 Tauri 安装包
cd src-tauri
cargo tauri build
```

## GitHub Actions（全平台构建）

仓库内已包含流水线：
- `.github/workflows/build-release.yml`

功能：
- 在 `Linux`、`Windows`、`macOS Apple Silicon` 构建
- 构建前自动安装并注入 `aria2c` 到 `aria2/bin/...`
- 构建 Tauri 安装包
- 上传各平台构建产物
- 推送 `v*` 标签（如 `v0.1.0`）时自动创建 GitHub Release
- 配置 Apple 证书后可在 macOS 任务中自动签名与公证

说明：
- 当前默认使用 `macos-14`（Apple Silicon）Runner。
- 如果你的 GitHub 计划/区域支持 Intel macOS Runner，可再补回 `macos-13`。

使用步骤：
1. 推送到 `main`，触发常规构建与产物上传。
2. 需要发版时打标签：
   - `git tag -a v0.1.0 -m "v0.1.0"`
   - `git push origin v0.1.0`
3. 到 GitHub 的 Actions / Releases 页面下载各平台产物。

### macOS 提示（“应用已损坏”）

如果 DMG 未签名/未公证，Gatekeeper 可能拦截并提示“已损坏，无法打开”。
要用于正式分发，请在仓库 Secrets 中配置以下参数，让 macOS 流水线自动签名+公证：

- `APPLE_CERTIFICATE`（base64 编码的 `.p12`）
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`（app-specific password）
- `APPLE_TEAM_ID`

若未配置签名参数，CI 现在会在产物中额外输出 `UNSIGNED-MACOS-BUILD.txt`，用于明确标识该 macOS 包未签名/未公证。

仅本地测试时，可手动移除隔离属性：

```bash
xattr -dr com.apple.quarantine "/Applications/Flamingo Downloader.app"
```

## GitHub 建议信息

- 仓库名：`flamingo-downloader`
- Topics：
  - `tauri`
  - `rust`
  - `aria2`
  - `downloader`
  - `cross-platform`
  - `desktop-app`

## 第三方说明

- 本项目集成 `aria2` 作为下载引擎。
- `aria2` 使用其独立许可证发布，分发时请同时遵守其许可要求。

## 许可证

本项目使用 MIT License，详见 `LICENSE`。
