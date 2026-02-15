# 🦩 Flamingo Downloader

一个基于 Tauri + Rust + aria2 的跨平台桌面下载器。  
项目目标是做“下载产品”，而不是“下载协议栈”。

English README: [`README.md`](README.md)

## 当前功能

- 通过 aria2 JSON-RPC 支持 HTTP/HTTPS 链接下载
- 主界面分为“下载中 / 已下载”两个页面
- 支持任务暂停、继续、删除
- 已下载任务支持：打开文件、打开目录、删除记录（可选同时删除文件）
- 独立日志窗口
- 独立设置页面
- 国际化支持（`en-US`、`zh-CN`），自动读取系统语言，非支持语言默认英文
- SQLite 持久化任务和设置
- 支持手动指定 aria2 路径并检测可用路径

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

### 3. 首次配置

进入设置页后：
1. 设置 `aria2 Binary Path`
2. 点击 `Detect aria2 Path`（可选）
3. 保存设置
4. 点击 `Restart aria2`，再点 `RPC Ping` 验证

## 打包（可选）

```bash
# 需要 tauri-cli
cargo tauri build --manifest-path src-tauri/Cargo.toml
```

## GitHub Actions（全平台构建）

仓库内已包含流水线：
- `.github/workflows/build-release.yml`

功能：
- 在 `Linux`、`Windows`、`macOS Intel`、`macOS Apple Silicon` 构建
- 构建前自动安装并注入 `aria2c` 到 `aria2/bin/...`
- 构建 Tauri 安装包
- 上传各平台构建产物
- 推送 `v*` 标签（如 `v0.1.0`）时自动创建 GitHub Release

使用步骤：
1. 推送到 `main`，触发常规构建与产物上传。
2. 需要发版时打标签：
   - `git tag -a v0.1.0 -m "v0.1.0"`
   - `git push origin v0.1.0`
3. 到 GitHub 的 Actions / Releases 页面下载各平台产物。

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
