# 🦩 Flamingo Downloader

一个基于 Tauri + Rust + aria2 的跨平台桌面下载器。  
定位是“下载产品”，而不是“下载协议栈”。

## 项目名称

推荐项目名：`🦩 Flamingo Downloader`  
- emoji 记忆点强，品牌辨识度高
- `Flamingo` 简单好记，适合面向普通用户
- 对外展示友好，同时可保留技术架构灵活性

推荐中文名：`🦩 火烈鸟下载器`。

## 当前能力

- HTTP/HTTPS URL 下载（通过 aria2 RPC）
- 下载中 / 已下载分栏管理
- 暂停、继续、删除任务
- 已下载任务支持：打开文件、打开目录、删除记录（可选同时删除文件）
- 独立日志窗口
- 设置页独立展示
- 国际化（简体中文 / 英文），自动读取系统语言，非支持语言默认英文
- SQLite 持久化任务与设置
- 手动指定 aria2 可执行路径（支持路径检测）

## 架构概览

- 前端（Tauri WebView）：任务列表、设置、日志、交互
- Rust 服务层：aria2 进程生命周期、RPC 封装、状态同步、持久化
- aria2c：实际下载执行器（外部进程）

关键原则：
- UI 不直接访问 aria2 RPC
- aria2 RPC 仅监听 localhost，使用 secret
- 任务状态以你的服务层模型为准

## 本地运行

### 1. 环境准备

- Rust（建议 stable）
- Tauri 2 构建依赖（按你的系统安装）
- 一个可用的 `aria2c`（你目前走“用户手动指定路径”模式）

### 2. 启动应用

```bash
cargo run --manifest-path src-tauri/Cargo.toml
```

### 3. 首次使用

打开应用后进入设置页：
1. 设置 `aria2 Binary Path`
2. 点击“检测 aria2 路径”（可选）
3. 保存设置
4. 点击“Restart aria2”并 `RPC Ping` 验证

## 打包发布（可选）

```bash
# 需要已安装 tauri-cli
cargo tauri build --manifest-path src-tauri/Cargo.toml
```

## GitHub 发布建议

建议仓库名：`flamingo-downloader`

建议 Topics：
- `tauri`
- `rust`
- `aria2`
- `downloader`
- `cross-platform`
- `desktop-app`

## 第三方说明

- 本项目依赖并调用 `aria2` 作为下载执行器。
- `aria2` 本身使用其独立许可证发布；你在分发时应同时遵守 aria2 的许可证要求。

## License

本项目使用 `MIT License`，详见 `LICENSE`。
