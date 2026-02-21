# 🦩 Flamingo Downloader

[![Build](https://github.com/lc5900/flamingo-downloader/actions/workflows/build-release.yml/badge.svg)](https://github.com/lc5900/flamingo-downloader/actions/workflows/build-release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-orange)](https://www.rust-lang.org)

一个基于 **Tauri + Rust + aria2** 的跨平台桌面下载器。

Flamingo 的目标是做稳定好用的“下载产品”（任务体验、持久化、诊断、规则能力），而不是重复造协议轮子。

English README: [`README.md`](README.md)

## 目录

- [功能亮点](#功能亮点)
- [界面截图](#界面截图)
- [架构说明](#架构说明)
- [快速开始](#快速开始)
- [构建与发布](#构建与发布)
- [浏览器集成](#浏览器集成)
- [项目结构](#项目结构)
- [许可证](#许可证)

## 功能亮点

- 通过 aria2 JSON-RPC 支持 HTTP/HTTPS/FTP、magnet、torrent
- 下载中 / 已下载双列表，常用操作完整
- 任务级参数与运行时选项（限速、分片、做种）
- 按 `ext/domain/type` 规则分流到不同目录
- 分类规则与筛选
- 独立设置页、诊断页、操作日志窗口
- 国际化（`en-US`、`zh-CN`）和主题模式（`system/light/dark`）
- 浏览器桥接 + 扩展模板（Chromium + Firefox）
- Win/macOS/Linux 原生消息宿主安装脚本
- SQLite 持久化、会话恢复、启动自检

## 界面截图

> 当前展示为真实截图，文件位于 `docs/screenshots/`。

### 主界面

![主界面](docs/screenshots/main-overview.png)

### 新建下载弹窗

![新建下载](docs/screenshots/add-download-modal.png)

### 设置与诊断

![设置与诊断](docs/screenshots/settings-page.png)

## 架构说明

- **UI 层（Tauri WebView）**：任务列表、设置、弹窗、日志
- **Rust 服务层**：aria2 生命周期、RPC 封装、输入校验、状态同步、数据库
- **aria2 进程**：协议下载执行器

核心原则：

- UI 不直接访问 aria2 RPC
- aria2 RPC 仅监听 localhost + token
- 应用侧任务模型为“真相”

## 快速开始

### 1）环境准备

- Rust（stable）
- 对应系统的 Tauri 2 构建依赖
- 可用 `aria2c`（当前为手动路径模式）
- Node.js 20+（前端构建）

### 2）开发运行

```bash
cargo run --manifest-path src-tauri/Cargo.toml
```

### 3）前端工作区（React + Ant Design）

```bash
cd ui
npm install
npm run dev
```

### 4）首次配置

在设置页中：

1. 配置 `aria2 Binary Path`
2. （可选）点击 `Detect aria2 Path`
3. 保存
4. 点击 `Restart aria2`
5. 点击 `RPC Ping`

## 构建与发布

### 本地打包

```bash
# 先构建 UI（frontendDist = ../ui/dist）
npm --prefix ui run build

# 再打 Tauri 包
cd src-tauri
cargo tauri build
```

### GitHub Actions

流水线文件：`.github/workflows/build-release.yml`

- 校验 Rust + UI（fmt/clippy/lint/build）
- 构建 Linux / Windows / macOS（Apple Silicon）
- 打包前自动注入 aria2 二进制
- 上传桌面安装包和浏览器扩展 zip
- 推送 `v*` 标签自动发 Release
- 配置 Apple Secrets 后支持 macOS 签名与公证

## 浏览器集成

- HTTP 桥接：`127.0.0.1 + token`
- 扩展目录：[`browser-extension/`](browser-extension)
- 扩展文档：[`browser-extension/README.md`](browser-extension/README.md)
- 原生消息宿主：[`browser-extension/native-host/`](browser-extension/native-host)

## 项目结构

```text
src/                # Rust 核心服务
src-tauri/          # Tauri 入口与打包配置
ui/                 # React + Ant Design 前端
aria2/              # bundled/runtime aria2 binaries
browser-extension/  # 浏览器扩展模板
```

## 许可证

MIT License，见 [`LICENSE`](LICENSE)。

第三方说明：aria2 按其独立许可证分发和使用。
