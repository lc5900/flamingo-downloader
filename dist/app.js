const state = {
  tasks: new Map(),
  unlisten: null,
  selectedTaskId: null,
  selectedFiles: [],
  locale: "en-US",
  themeMode: "system",
  currentSection: "downloading",
  currentSettingsTab: "basic",
  currentAddTab: "url",
  listQuery: "",
  statusFilter: "all",
  sortBy: "updated_desc",
  selectedTaskIds: new Set(),
  confirmResolve: null,
  pendingDeleteTaskId: null,
  autoRefreshTimer: null,
  uiLogs: [],
  logsDragging: false,
  logsDragOffsetX: 0,
  logsDragOffsetY: 0,
  contextMenuTaskId: null,
  addSaveDirTouched: {
    url: false,
    magnet: false,
    torrent: false,
  },
};

const SUPPORTED_LOCALES = ["en-US", "zh-CN"];
const LOCALE_STORAGE_KEY = "tarui.locale";
const UI_LOGS_STORAGE_KEY = "tarui.ui_logs";
const GITHUB_CDN_PRESETS = [
  "https://ghproxy.com/",
  "https://ghfast.top/",
  "https://ghproxy.net/",
];

const I18N = {
  "en-US": {
    "app.title": "Flamingo Downloader",
    "sections.navigation": "Navigation",
    "nav.downloading": "Downloading",
    "nav.downloaded": "Downloaded",
    "sections.addTasks": "Add Tasks",
    "sections.downloadingTasks": "Current Downloads",
    "sections.downloadedTasks": "Downloaded",
    "sections.settings": "Settings",
    "sections.diagnostics": "Diagnostics",
    "sections.aria2Update": "aria2 Update",
    "sections.operationLogs": "Operation Logs",
    "groups.appearance": "Appearance",
    "groups.download": "Download",
    "groups.aria2": "aria2",
    "groups.integration": "Integration",
    "settingsTabs.basic": "Basic",
    "settingsTabs.diagnostics": "Diagnostics",
    "settingsTabs.updates": "Updates",
    "sections.taskDetail": "Task Detail",
    "sections.files": "Files",
    "fields.url": "URL",
    "fields.magnet": "Magnet",
    "fields.torrentFile": "Torrent File",
    "fields.aria2BinPath": "aria2 Binary Path",
    "fields.downloadDirectory": "Download Directory",
    "fields.maxConcurrentDownloads": "Max Concurrent Downloads",
    "fields.maxConnPerServer": "Max Connection Per Server",
    "fields.maxOverallDownloadLimit": "Max Overall Download Limit",
    "fields.btTrackerList": "BT Tracker List (comma separated)",
    "fields.githubCdn": "GitHub CDN Prefix",
    "fields.githubToken": "GitHub Token (optional)",
    "fields.githubCdnPreset": "Preset CDN",
    "fields.enableUpnp": "Enable UPnP",
    "fields.browserBridgeEnabled": "Browser Bridge Enabled",
    "fields.browserBridgePort": "Browser Bridge Port",
    "fields.browserBridgeToken": "Browser Bridge Token",
    "fields.downloadDirRules": "Download Directory Rules",
    "fields.search": "Search",
    "fields.statusFilter": "Status",
    "fields.sortBy": "Sort",
    "fields.select": "Select",
    "fields.language": "Language",
    "fields.themeMode": "Theme",
    "languages.enUS": "English",
    "languages.zhCN": "Simplified Chinese",
    "themes.system": "Follow System",
    "themes.light": "Light",
    "themes.dark": "Dark",
    "placeholders.url": "https://example.com/file.zip",
    "placeholders.magnet": "magnet:?xt=urn:btih:...",
    "placeholders.downloadDirectory": "./downloads",
    "placeholders.aria2BinPath": "/path/to/aria2c",
    "placeholders.maxOverallDownloadLimit": "0 / 10M / 2M",
    "placeholders.btTrackerList": "udp://tracker.opentrackr.org:1337/announce",
    "placeholders.githubCdn": "https://ghproxy.com/ or https://cdn.example/{url}",
    "placeholders.githubToken": "ghp_xxx...",
    "placeholders.searchTasks": "Search by name / URL / task id",
    "filters.all": "All",
    "filters.active": "Active",
    "filters.paused": "Paused",
    "filters.queued": "Queued",
    "filters.error": "Error",
    "filters.metadata": "Metadata",
    "filters.completed": "Completed",
    "sort.updatedDesc": "Updated (newest)",
    "sort.createdDesc": "Created (newest)",
    "sort.speedDesc": "Speed (highest)",
    "sort.progressDesc": "Progress (highest)",
    "sort.nameAsc": "Name (A-Z)",
    "cdnPreset.custom": "Custom / Direct",
    "cdnPreset.ghproxy": "ghproxy.com",
    "cdnPreset.ghfast": "ghfast.top",
    "cdnPreset.ghproxyNet": "ghproxy.net",
    "actions.refresh": "Refresh",
    "actions.openLogsWindow": "Logs",
    "actions.quickTheme": "Theme",
    "actions.openNewDownload": "New Download",
    "actions.openSettingsMenu": "Settings",
    "actions.pauseAll": "Pause All",
    "actions.resumeAll": "Resume All",
    "actions.addUrl": "Add URL",
    "actions.addMagnet": "Add Magnet",
    "actions.addTorrent": "Add Torrent",
    "actions.saveSettings": "Save Settings",
    "actions.detectAria2Path": "Detect aria2 Path",
    "actions.reload": "Reload",
    "actions.rpcPing": "RPC Ping",
    "actions.restartAria2": "Restart aria2",
    "actions.startupCheckAria2": "Startup Check",
    "actions.saveSession": "Save Session",
    "actions.clearLogs": "Clear Logs",
    "actions.checkAria2Update": "Check aria2 Update",
    "actions.updateAria2Now": "Update aria2 Now",
    "actions.close": "Close",
    "actions.applySelection": "Apply Selection",
    "actions.detail": "Detail",
    "actions.openFile": "Open File",
    "actions.openDir": "Open Folder",
    "actions.removeFiles": "Delete Files",
    "actions.removeRecord": "Delete Record",
    "actions.copySource": "Copy Source",
    "actions.copyTaskId": "Copy Task ID",
    "actions.retryTask": "Retry",
    "actions.pause": "Pause",
    "actions.resume": "Resume",
    "actions.remove": "Remove",
    "actions.batchPause": "Pause Selected",
    "actions.batchResume": "Resume Selected",
    "actions.batchRemove": "Remove Selected",
    "actions.clearSelection": "Clear",
    "actions.cancel": "Cancel",
    "actions.ok": "OK",
    "actions.addRule": "Add Rule",
    "actions.removeRule": "Remove",
    "options.ruleMatcherExt": "By file extension",
    "options.ruleMatcherDomain": "By domain",
    "options.ruleMatcherType": "By task type",
    "placeholders.rulePattern": "e.g. mp4,mkv or github.com or torrent",
    "placeholders.ruleSaveDir": "/path/to/save/dir",
    "help.downloadRules":
      "Matchers: ext (mp4,zip), domain (github.com), type (http,torrent,magnet).",
    "common.default": "Default",
    "common.true": "true",
    "common.false": "false",
    "common.noLogsYet": "(no logs yet)",
    "common.noDownloadingTasks": "No active download tasks.",
    "common.noDownloadedTasks": "No completed tasks yet.",
    "common.noUpdateResult": "(no update result yet)",
    "meta.progress": "Progress",
    "meta.status": "Status",
    "meta.type": "Type",
    "meta.done": "Done",
    "meta.error": "Error",
    "meta.eta": "ETA",
    "meta.completedAt": "Completed At",
    "meta.selectedNone": "Selected: 0",
    "meta.metadataNotReady": "Metadata not ready yet.",
    "table.name": "Name",
    "table.size": "Size",
    "table.progress": "Progress",
    "table.speed": "Speed",
    "table.status": "Status",
    "table.actions": "Actions",
    "dialog.removeTask": "Remove this task from list?",
    "dialog.removeFiles": "Also delete downloaded files from disk?",
    "dialog.removeRecordOnly": "Remove this task record only?",
    "dialog.removeFilesAndRecord": "Delete downloaded files and remove this task record?",
    "dialog.removeTitle": "Remove Task",
    "dialog.removePrompt": "Remove this completed task?",
    "dialog.removeWithFiles": "Also delete downloaded files",
    "dialog.clearLogs": "Clear all operation logs?",
    "dialog.confirmTitle": "Confirm",
    "dialog.updateAria2Now": "Download and replace aria2 binary now?",
    "msg.saveSessionPrefix": "save_session",
    "msg.addUrlSuccess": "Task added successfully",
    "msg.updateStart": "Checking and downloading aria2 package...",
    "msg.updateInstalling": "Installing aria2 binary...",
    "msg.updateDone": "aria2 update completed",
  },
  "zh-CN": {
    "app.title": "火烈鸟下载器",
    "sections.navigation": "导航",
    "nav.downloading": "下载中",
    "nav.downloaded": "已下载",
    "sections.addTasks": "添加任务",
    "sections.downloadingTasks": "当前下载",
    "sections.downloadedTasks": "已下载",
    "sections.settings": "设置",
    "sections.diagnostics": "诊断",
    "sections.aria2Update": "aria2 更新",
    "sections.operationLogs": "操作日志",
    "groups.appearance": "外观",
    "groups.download": "下载",
    "groups.aria2": "aria2",
    "groups.integration": "集成",
    "settingsTabs.basic": "基础设置",
    "settingsTabs.diagnostics": "诊断",
    "settingsTabs.updates": "更新",
    "sections.taskDetail": "任务详情",
    "sections.files": "文件",
    "fields.url": "下载链接",
    "fields.magnet": "磁力链接",
    "fields.torrentFile": "种子文件",
    "fields.aria2BinPath": "aria2 可执行文件路径",
    "fields.downloadDirectory": "下载目录",
    "fields.maxConcurrentDownloads": "最大并发下载数",
    "fields.maxConnPerServer": "单服务器最大连接数",
    "fields.maxOverallDownloadLimit": "全局下载限速",
    "fields.btTrackerList": "BT Tracker 列表（逗号分隔）",
    "fields.githubCdn": "GitHub CDN 前缀",
    "fields.githubToken": "GitHub Token（可选）",
    "fields.githubCdnPreset": "预置 CDN",
    "fields.enableUpnp": "启用 UPnP",
    "fields.browserBridgeEnabled": "浏览器桥接启用",
    "fields.browserBridgePort": "浏览器桥接端口",
    "fields.browserBridgeToken": "浏览器桥接令牌",
    "fields.downloadDirRules": "下载目录规则",
    "fields.search": "搜索",
    "fields.statusFilter": "状态",
    "fields.sortBy": "排序",
    "fields.select": "选择",
    "fields.language": "语言",
    "fields.themeMode": "主题",
    "languages.enUS": "英文",
    "languages.zhCN": "简体中文",
    "themes.system": "跟随系统",
    "themes.light": "浅色",
    "themes.dark": "深色",
    "placeholders.url": "https://example.com/file.zip",
    "placeholders.magnet": "magnet:?xt=urn:btih:...",
    "placeholders.downloadDirectory": "./downloads",
    "placeholders.aria2BinPath": "/path/to/aria2c",
    "placeholders.maxOverallDownloadLimit": "0 / 10M / 2M",
    "placeholders.btTrackerList": "udp://tracker.opentrackr.org:1337/announce",
    "placeholders.githubCdn": "https://ghproxy.com/ 或 https://cdn.example/{url}",
    "placeholders.githubToken": "ghp_xxx...",
    "placeholders.searchTasks": "按名称 / 链接 / 任务ID 搜索",
    "filters.all": "全部",
    "filters.active": "进行中",
    "filters.paused": "已暂停",
    "filters.queued": "排队中",
    "filters.error": "错误",
    "filters.metadata": "元数据",
    "filters.completed": "已完成",
    "sort.updatedDesc": "更新时间（最新）",
    "sort.createdDesc": "创建时间（最新）",
    "sort.speedDesc": "速度（最高）",
    "sort.progressDesc": "进度（最高）",
    "sort.nameAsc": "名称（A-Z）",
    "cdnPreset.custom": "自定义 / 直连",
    "cdnPreset.ghproxy": "ghproxy.com",
    "cdnPreset.ghfast": "ghfast.top",
    "cdnPreset.ghproxyNet": "ghproxy.net",
    "actions.refresh": "刷新",
    "actions.openLogsWindow": "日志",
    "actions.quickTheme": "主题",
    "actions.openNewDownload": "新建下载",
    "actions.openSettingsMenu": "设置",
    "actions.pauseAll": "全部暂停",
    "actions.resumeAll": "全部继续",
    "actions.addUrl": "添加链接",
    "actions.addMagnet": "添加磁力",
    "actions.addTorrent": "添加种子",
    "actions.saveSettings": "保存设置",
    "actions.detectAria2Path": "检测 aria2 路径",
    "actions.reload": "重新加载",
    "actions.rpcPing": "RPC 探测",
    "actions.restartAria2": "重启 aria2",
    "actions.startupCheckAria2": "启动检查",
    "actions.saveSession": "保存会话",
    "actions.clearLogs": "清空日志",
    "actions.checkAria2Update": "检查 aria2 更新",
    "actions.updateAria2Now": "立即更新 aria2",
    "actions.close": "关闭",
    "actions.applySelection": "应用选择",
    "actions.detail": "详情",
    "actions.openFile": "打开文件",
    "actions.openDir": "打开目录",
    "actions.removeFiles": "删除文件",
    "actions.removeRecord": "删除记录",
    "actions.copySource": "复制链接",
    "actions.copyTaskId": "复制任务ID",
    "actions.retryTask": "重试任务",
    "actions.pause": "暂停",
    "actions.resume": "继续",
    "actions.remove": "删除",
    "actions.batchPause": "批量暂停",
    "actions.batchResume": "批量继续",
    "actions.batchRemove": "批量删除",
    "actions.clearSelection": "清空",
    "actions.cancel": "取消",
    "actions.ok": "确定",
    "actions.addRule": "添加规则",
    "actions.removeRule": "删除",
    "options.ruleMatcherExt": "按文件后缀",
    "options.ruleMatcherDomain": "按域名",
    "options.ruleMatcherType": "按任务类型",
    "placeholders.rulePattern": "例如 mp4,mkv 或 github.com 或 torrent",
    "placeholders.ruleSaveDir": "/path/to/save/dir",
    "help.downloadRules": "匹配类型：ext(后缀)、domain(域名)、type(http/torrent/magnet)。",
    "common.default": "默认",
    "common.true": "是",
    "common.false": "否",
    "common.noLogsYet": "（暂无日志）",
    "common.noDownloadingTasks": "暂无下载任务。",
    "common.noDownloadedTasks": "暂无已完成任务。",
    "common.noUpdateResult": "（暂无更新结果）",
    "meta.progress": "进度",
    "meta.status": "状态",
    "meta.type": "类型",
    "meta.done": "已完成",
    "meta.error": "错误详情",
    "meta.eta": "剩余时间",
    "meta.completedAt": "完成时间",
    "meta.selectedNone": "已选：0",
    "meta.metadataNotReady": "元数据尚未就绪。",
    "table.name": "名称",
    "table.size": "大小",
    "table.progress": "进度",
    "table.speed": "速度",
    "table.status": "状态",
    "table.actions": "操作",
    "dialog.removeTask": "要从列表中移除此任务吗？",
    "dialog.removeFiles": "同时删除磁盘中的下载文件吗？",
    "dialog.removeRecordOnly": "仅删除此任务记录？",
    "dialog.removeFilesAndRecord": "删除下载文件并移除此任务记录？",
    "dialog.removeTitle": "删除任务",
    "dialog.removePrompt": "要删除这个已完成任务吗？",
    "dialog.removeWithFiles": "同时删除下载文件",
    "dialog.clearLogs": "要清空全部操作日志吗？",
    "dialog.confirmTitle": "确认",
    "dialog.updateAria2Now": "现在下载并替换 aria2 可执行文件吗？",
    "msg.saveSessionPrefix": "保存会话",
    "msg.addUrlSuccess": "任务添加成功",
    "msg.updateStart": "正在检查并下载 aria2 安装包...",
    "msg.updateInstalling": "正在安装 aria2 可执行文件...",
    "msg.updateDone": "aria2 更新完成",
  },
};

const el = {
  navDownloading: document.getElementById("nav-downloading"),
  navDownloaded: document.getElementById("nav-downloaded"),
  mainListTitle: document.getElementById("main-list-title"),
  taskList: document.getElementById("task-list"),
  completedList: document.getElementById("completed-list"),
  taskCount: document.getElementById("task-count"),
  completedCount: document.getElementById("completed-count"),
  taskSearchInput: document.getElementById("task-search-input"),
  taskStatusFilter: document.getElementById("task-status-filter"),
  taskSortBy: document.getElementById("task-sort-by"),
  batchSelectedCount: document.getElementById("batch-selected-count"),
  btnBatchPause: document.getElementById("btn-batch-pause"),
  btnBatchResume: document.getElementById("btn-batch-resume"),
  btnBatchRemove: document.getElementById("btn-batch-remove"),
  btnBatchClear: document.getElementById("btn-batch-clear"),
  btnPauseAll: document.getElementById("btn-pause-all"),
  btnResumeAll: document.getElementById("btn-resume-all"),

  btnOpenAddTools: document.getElementById("btn-open-add-tools"),
  btnCloseAddTools: document.getElementById("btn-close-add-tools"),
  btnOpenSettingsTools: document.getElementById("btn-open-settings-tools"),
  btnCloseSettingsTools: document.getElementById("btn-close-settings-tools"),
  addToolsPanel: document.getElementById("add-tools-panel"),
  addModalBackdrop: document.getElementById("add-modal-backdrop"),
  addTabs: document.querySelectorAll("[data-add-tab]"),
  addSections: document.querySelectorAll("[data-add-section]"),
  settingsToolsPanel: document.getElementById("settings-tools-panel"),
  settingsTabs: document.querySelectorAll("[data-settings-tab]"),
  settingsSections: document.querySelectorAll("[data-settings-section]"),

  addUrlForm: document.getElementById("add-url-form"),
  addMagnetForm: document.getElementById("add-magnet-form"),
  addTorrentForm: document.getElementById("add-torrent-form"),
  btnAddUrl: document.getElementById("btn-add-url"),
  btnAddMagnet: document.getElementById("btn-add-magnet"),
  btnAddTorrent: document.getElementById("btn-add-torrent"),
  urlInput: document.getElementById("url-input"),
  urlSaveDirInput: document.getElementById("url-save-dir-input"),
  magnetInput: document.getElementById("magnet-input"),
  magnetSaveDirInput: document.getElementById("magnet-save-dir-input"),
  torrentInput: document.getElementById("torrent-input"),
  torrentSaveDirInput: document.getElementById("torrent-save-dir-input"),

  settingsForm: document.getElementById("settings-form"),
  btnDetectAria2Path: document.getElementById("btn-detect-aria2-path"),
  btnReloadSettings: document.getElementById("btn-reload-settings"),
  settingAria2BinPath: document.getElementById("setting-aria2-bin-path"),
  settingDownloadDir: document.getElementById("setting-download-dir"),
  settingMaxConcurrent: document.getElementById("setting-max-concurrent"),
  settingMaxConn: document.getElementById("setting-max-conn"),
  settingMaxLimit: document.getElementById("setting-max-limit"),
  settingBtTracker: document.getElementById("setting-bt-tracker"),
  settingGithubCdn: document.getElementById("setting-github-cdn"),
  settingGithubToken: document.getElementById("setting-github-token"),
  settingGithubCdnPreset: document.getElementById("setting-github-cdn-preset"),
  settingEnableUpnp: document.getElementById("setting-enable-upnp"),
  settingBrowserBridgeEnabled: document.getElementById("setting-browser-bridge-enabled"),
  settingBrowserBridgePort: document.getElementById("setting-browser-bridge-port"),
  settingBrowserBridgeToken: document.getElementById("setting-browser-bridge-token"),
  downloadRulesList: document.getElementById("download-rules-list"),
  btnAddDownloadRule: document.getElementById("btn-add-download-rule"),

  btnRefresh: document.getElementById("btn-refresh"),
  btnThemeQuick: document.getElementById("btn-theme-quick"),
  btnOpenLogsWindow: document.getElementById("btn-open-logs-window"),
  btnOpenLogsWindowInSettings: document.getElementById("btn-open-logs-window-in-settings"),
  btnRpcPing: document.getElementById("btn-rpc-ping"),
  btnRestartAria2: document.getElementById("btn-restart-aria2"),
  btnStartupCheckAria2: document.getElementById("btn-startup-check-aria2"),
  btnSaveSession: document.getElementById("btn-save-session"),
  btnCheckAria2Update: document.getElementById("btn-check-aria2-update"),
  btnUpdateAria2Now: document.getElementById("btn-update-aria2-now"),
  btnClearLogs: document.getElementById("btn-clear-logs"),
  diagnostics: document.getElementById("diagnostics"),
  aria2Update: document.getElementById("aria2-update"),
  opLogs: document.getElementById("op-logs"),

  languageSelect: document.getElementById("language-select"),
  settingThemeMode: document.getElementById("setting-theme-mode"),

  taskTemplate: document.getElementById("task-item-template"),
  completedTemplate: document.getElementById("completed-item-template"),
  deleteModal: document.getElementById("delete-confirm-modal"),
  deleteModalBackdrop: document.getElementById("delete-modal-backdrop"),
  deleteWithFilesCheckbox: document.getElementById("delete-with-files-checkbox"),
  btnDeleteConfirmCancel: document.getElementById("btn-delete-confirm-cancel"),
  btnDeleteConfirmOk: document.getElementById("btn-delete-confirm-ok"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmModalBackdrop: document.getElementById("confirm-modal-backdrop"),
  confirmModalTitle: document.getElementById("confirm-modal-title"),
  confirmModalMessage: document.getElementById("confirm-modal-message"),
  btnConfirmCancel: document.getElementById("btn-confirm-cancel"),
  btnConfirmOk: document.getElementById("btn-confirm-ok"),
  toastStack: document.getElementById("toast-stack"),
  taskContextMenu: document.getElementById("task-context-menu"),
  ctxDetail: document.getElementById("ctx-detail"),
  ctxOpenFile: document.getElementById("ctx-open-file"),
  ctxOpenDir: document.getElementById("ctx-open-dir"),
  ctxCopySource: document.getElementById("ctx-copy-source"),
  ctxCopyId: document.getElementById("ctx-copy-id"),
  ctxRetry: document.getElementById("ctx-retry"),

  drawer: document.getElementById("detail-drawer"),
  drawerTitle: document.getElementById("drawer-title"),
  drawerMeta: document.getElementById("drawer-meta"),
  drawerFilesList: document.getElementById("drawer-files-list"),
  btnCloseDrawer: document.getElementById("btn-close-drawer"),
  btnApplySelection: document.getElementById("btn-apply-selection"),
};

function normalizeLocale(raw) {
  const locale = String(raw || "").trim().toLowerCase();
  if (!locale) return null;
  if (locale.startsWith("zh")) return "zh-CN";
  if (locale.startsWith("en")) return "en-US";
  return null;
}

function detectLocale() {
  const langs = Array.isArray(navigator.languages) ? navigator.languages : [];
  for (const lang of langs) {
    const normalized = normalizeLocale(lang);
    if (normalized && SUPPORTED_LOCALES.includes(normalized)) return normalized;
  }
  const single = normalizeLocale(navigator.language);
  if (single && SUPPORTED_LOCALES.includes(single)) return single;
  return "en-US";
}

function loadSavedLocale() {
  const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (!raw) return null;
  return SUPPORTED_LOCALES.includes(raw) ? raw : null;
}

function saveLocale(locale) {
  if (SUPPORTED_LOCALES.includes(locale)) {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}

function t(key) {
  const lang = I18N[state.locale] || I18N["en-US"];
  return lang[key] ?? I18N["en-US"][key] ?? key;
}

function applyI18n() {
  document.documentElement.lang = state.locale;
  if (el.languageSelect) el.languageSelect.value = state.locale;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  updateThemeQuickButton();
}

function normalizeThemeMode(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function resolveEffectiveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  const mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  return mql && mql.matches ? "dark" : "light";
}

function applyTheme() {
  const mode = normalizeThemeMode(state.themeMode);
  const effective = resolveEffectiveTheme(mode);
  document.documentElement.dataset.theme = effective;
  if (el.settingThemeMode) el.settingThemeMode.value = mode;
  updateThemeQuickButton();
}

function updateThemeQuickButton() {
  if (!el.btnThemeQuick) return;
  const effective = resolveEffectiveTheme(normalizeThemeMode(state.themeMode));
  const icon = effective === "dark" ? "☀️" : "🌙";
  const label = t("actions.quickTheme");
  el.btnThemeQuick.setAttribute("aria-label", label);
  el.btnThemeQuick.title = label;
  const span = el.btnThemeQuick.querySelector("span");
  if (span) span.textContent = `${icon} ${label}`;
}

function toast(message, level = "info", timeoutMs = 2600) {
  if (!el.toastStack) return;
  const node = document.createElement("article");
  node.className = `toast toast-${level}`;
  node.textContent = String(message || "");
  el.toastStack.appendChild(node);
  window.setTimeout(() => {
    node.remove();
  }, timeoutMs);
}

function resolveConfirm(result) {
  const resolver = state.confirmResolve;
  state.confirmResolve = null;
  if (el.confirmModal) {
    el.confirmModal.classList.add("hidden");
    el.confirmModal.setAttribute("aria-hidden", "true");
  }
  if (el.confirmModalBackdrop) el.confirmModalBackdrop.classList.add("hidden");
  if (typeof resolver === "function") resolver(!!result);
}

function askConfirm(message, title = t("dialog.confirmTitle")) {
  return new Promise((resolve) => {
    state.confirmResolve = resolve;
    if (el.confirmModalTitle) el.confirmModalTitle.textContent = title;
    if (el.confirmModalMessage) el.confirmModalMessage.textContent = message;
    if (el.confirmModal) {
      el.confirmModal.classList.remove("hidden");
      el.confirmModal.setAttribute("aria-hidden", "false");
    }
    if (el.confirmModalBackdrop) el.confirmModalBackdrop.classList.remove("hidden");
  });
}

function setStatus(message, level = "info") {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${message}`;
  const last = state.uiLogs[state.uiLogs.length - 1];
  if (last && String(last).replace(/^\[[^\]]+\]\s*/, "") === String(message)) {
    return;
  }
  state.uiLogs.push(line);
  if (state.uiLogs.length > 300) {
    state.uiLogs.splice(0, state.uiLogs.length - 300);
  }
  try {
    window.localStorage.setItem(UI_LOGS_STORAGE_KEY, JSON.stringify(state.uiLogs));
  } catch (_) {}
  renderLogsContent();
}

function tauriCore() {
  return window.__TAURI__?.core ?? null;
}

function tauriEvent() {
  return window.__TAURI__?.event ?? null;
}

async function invoke(cmd, args = {}) {
  const core = tauriCore();
  if (!core || typeof core.invoke !== "function") {
    throw new Error("Tauri invoke is unavailable. Enable app.withGlobalTauri in tauri config.");
  }
  return core.invoke(cmd, args);
}

function fmtBytes(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function progressPercent(task) {
  const total = Number(task.total_length || 0);
  const done = Number(task.completed_length || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeCdnValue(value) {
  return String(value || "").trim();
}

function syncGithubCdnPreset() {
  if (!el.settingGithubCdn || !el.settingGithubCdnPreset) return;
  const current = normalizeCdnValue(el.settingGithubCdn.value);
  const matched = GITHUB_CDN_PRESETS.find((v) => normalizeCdnValue(v) === current);
  el.settingGithubCdnPreset.value = matched || "";
}

function createDefaultRule() {
  return {
    enabled: true,
    matcher: "ext",
    pattern: "",
    save_dir: "",
  };
}

function normalizeRule(raw) {
  const matcher = String(raw?.matcher || "ext").trim().toLowerCase();
  return {
    enabled: !!raw?.enabled,
    matcher: ["ext", "domain", "type"].includes(matcher) ? matcher : "ext",
    pattern: String(raw?.pattern || "").trim(),
    save_dir: String(raw?.save_dir || "").trim(),
  };
}

function renderDownloadRules(rules) {
  if (!el.downloadRulesList) return;
  const list = Array.isArray(rules) ? rules.map(normalizeRule) : [];
  el.downloadRulesList.innerHTML = "";
  list.forEach((rule) => {
    const row = document.createElement("div");
    row.className = "rule-row";
    row.innerHTML = `
      <label><input type="checkbox" data-role="enabled" ${rule.enabled ? "checked" : ""} /></label>
      <select data-role="matcher">
        <option value="ext">${t("options.ruleMatcherExt")}</option>
        <option value="domain">${t("options.ruleMatcherDomain")}</option>
        <option value="type">${t("options.ruleMatcherType")}</option>
      </select>
      <input data-role="pattern" type="text" placeholder="${t("placeholders.rulePattern")}" />
      <input data-role="save_dir" type="text" placeholder="${t("placeholders.ruleSaveDir")}" />
      <button type="button" class="ghost" data-role="remove">${t("actions.removeRule")}</button>
    `;
    row.querySelector('[data-role="matcher"]').value = rule.matcher;
    row.querySelector('[data-role="pattern"]').value = rule.pattern;
    row.querySelector('[data-role="save_dir"]').value = rule.save_dir;
    row.querySelector('[data-role="remove"]').onclick = () => row.remove();
    el.downloadRulesList.appendChild(row);
  });
}

function readDownloadRulesFromUi() {
  if (!el.downloadRulesList) return [];
  return Array.from(el.downloadRulesList.querySelectorAll(".rule-row"))
    .map((row) => ({
      enabled: !!row.querySelector('[data-role="enabled"]')?.checked,
      matcher: String(row.querySelector('[data-role="matcher"]')?.value || "ext")
        .trim()
        .toLowerCase(),
      pattern: String(row.querySelector('[data-role="pattern"]')?.value || "").trim(),
      save_dir: String(row.querySelector('[data-role="save_dir"]')?.value || "").trim(),
    }))
    .filter((rule) => rule.pattern && rule.save_dir);
}

function formatTs(ts) {
  const n = Number(ts || 0);
  return n > 0 ? new Date(n * 1000).toLocaleString() : "-";
}

function formatEta(task) {
  const speed = Number(task.download_speed || 0);
  const total = Number(task.total_length || 0);
  const done = Number(task.completed_length || 0);
  const remain = Math.max(0, total - done);
  if (!remain) return "0s";
  if (!speed) return "-";
  const secs = Math.floor(remain / speed);
  if (!Number.isFinite(secs) || secs < 0) return "-";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function normalizeStatus(status) {
  return String(status || "").toLowerCase();
}

function isCompletedTask(task) {
  return normalizeStatus(task.status) === "completed";
}

function isDownloadingTask(task) {
  return !isCompletedTask(task) && normalizeStatus(task.status) !== "removed";
}

function matchTaskQuery(task, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    task.name || "",
    task.source || "",
    task.id || "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function matchTaskStatus(task, statusFilter) {
  const f = String(statusFilter || "all").toLowerCase();
  if (f === "all") return true;
  return normalizeStatus(task.status) === f;
}

function setTaskSelected(taskId, selected) {
  if (!taskId) return;
  if (selected) state.selectedTaskIds.add(taskId);
  else state.selectedTaskIds.delete(taskId);
}

function clearSelection() {
  state.selectedTaskIds.clear();
}

function pruneSelection() {
  for (const id of Array.from(state.selectedTaskIds)) {
    if (!state.tasks.has(id)) state.selectedTaskIds.delete(id);
  }
}

function getFilteredTasks() {
  const all = Array.from(state.tasks.values());
  const query = state.listQuery;
  const statusFilter = state.statusFilter;
  const sortBy = state.sortBy;
  const downloading = all
    .filter(isDownloadingTask)
    .filter((t) => matchTaskQuery(t, query) && matchTaskStatus(t, statusFilter))
    .sort((a, b) => compareTasksBySort(a, b, sortBy));
  const completed = all
    .filter(isCompletedTask)
    .filter((t) => matchTaskQuery(t, query) && matchTaskStatus(t, statusFilter))
    .sort((a, b) => compareTasksBySort(a, b, sortBy));
  return { downloading, completed };
}

function updateBatchToolbar(visibleTasks) {
  const selectedVisible = visibleTasks.filter((t) => state.selectedTaskIds.has(t.id));
  const selectedCount = selectedVisible.length;
  if (el.batchSelectedCount) {
    el.batchSelectedCount.textContent = `${t("fields.select")}: ${selectedCount}`;
  }
  const inDownloading = state.currentSection === "downloading";
  if (el.btnBatchPause) el.btnBatchPause.disabled = !inDownloading || selectedCount === 0;
  if (el.btnBatchResume) el.btnBatchResume.disabled = !inDownloading || selectedCount === 0;
  if (el.btnBatchRemove) el.btnBatchRemove.disabled = selectedCount === 0;
  if (el.btnBatchClear) el.btnBatchClear.disabled = selectedCount === 0;
}

function compareTasksBySort(a, b, sortBy) {
  const key = String(sortBy || "updated_desc");
  if (key === "name_asc") {
    const aName = String(a.name || a.source || a.id || "");
    const bName = String(b.name || b.source || b.id || "");
    return aName.localeCompare(bName);
  }
  if (key === "created_desc") {
    return Number(b.created_at || 0) - Number(a.created_at || 0);
  }
  if (key === "speed_desc") {
    const speedDelta = Number(b.download_speed || 0) - Number(a.download_speed || 0);
    if (speedDelta !== 0) return speedDelta;
    return Number(b.updated_at || 0) - Number(a.updated_at || 0);
  }
  if (key === "progress_desc") {
    const progressDelta = progressPercent(b) - progressPercent(a);
    if (progressDelta !== 0) return progressDelta;
    return Number(b.updated_at || 0) - Number(a.updated_at || 0);
  }
  return Number(b.updated_at || 0) - Number(a.updated_at || 0);
}

function setSection(section) {
  state.currentSection = section;
  if (el.navDownloading) el.navDownloading.classList.toggle("active", section === "downloading");
  if (el.navDownloaded) el.navDownloaded.classList.toggle("active", section === "downloaded");

  const downloading = section === "downloading";
  el.taskList.classList.toggle("hidden", !downloading);
  el.completedList.classList.toggle("hidden", downloading);
  el.taskCount.classList.toggle("hidden", !downloading);
  el.completedCount.classList.toggle("hidden", downloading);
  el.btnPauseAll.classList.toggle("hidden", !downloading);
  el.btnResumeAll.classList.toggle("hidden", !downloading);
  el.mainListTitle.textContent = downloading ? t("sections.downloadingTasks") : t("sections.downloadedTasks");
}

function setSettingsTab(tab) {
  state.currentSettingsTab = tab;
  if (el.settingsTabs) {
    el.settingsTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.settingsTab === tab);
    });
  }
  if (el.settingsSections) {
    el.settingsSections.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.settingsSection !== tab);
    });
  }
}

function setAddTab(tab) {
  state.currentAddTab = tab;
  if (el.addTabs) {
    el.addTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.addTab === tab);
    });
  }
  if (el.addSections) {
    el.addSections.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.addSection !== tab);
    });
  }
  updateSuggestedSaveDir(tab).catch(() => {});
}

function addTabToTaskType(tab) {
  if (tab === "magnet") return "magnet";
  if (tab === "torrent") return "torrent";
  return "http";
}

function getAddSourceByTab(tab) {
  if (tab === "magnet") return String(el.magnetInput?.value || "").trim();
  if (tab === "torrent") {
    const f = el.torrentInput?.files?.[0];
    return f ? f.name : "";
  }
  return String(el.urlInput?.value || "").trim();
}

function getAddSaveDirInputByTab(tab) {
  if (tab === "magnet") return el.magnetSaveDirInput;
  if (tab === "torrent") return el.torrentSaveDirInput;
  return el.urlSaveDirInput;
}

async function updateSuggestedSaveDir(tab, force = false) {
  const input = getAddSaveDirInputByTab(tab);
  if (!input) return;
  if (!force && state.addSaveDirTouched[tab]) return;
  const taskType = addTabToTaskType(tab);
  const source = getAddSourceByTab(tab);
  const saveDir = await invoke("suggest_save_dir", {
    taskType,
    source: source || null,
  });
  input.value = String(saveDir || "");
}

function resetAddSaveDirTouched() {
  state.addSaveDirTouched = {
    url: false,
    magnet: false,
    torrent: false,
  };
}

function openAddModal() {
  if (el.settingsToolsPanel) el.settingsToolsPanel.classList.add("hidden");
  if (el.addToolsPanel) el.addToolsPanel.classList.remove("hidden");
  if (el.addModalBackdrop) el.addModalBackdrop.classList.remove("hidden");
  resetAddSaveDirTouched();
  setAddTab(state.currentAddTab || "url");
  updateSuggestedSaveDir("url", true).catch(() => {});
  updateSuggestedSaveDir("magnet", true).catch(() => {});
  updateSuggestedSaveDir("torrent", true).catch(() => {});
}

function closeAddModal() {
  if (el.addToolsPanel) el.addToolsPanel.classList.add("hidden");
  if (el.addModalBackdrop) el.addModalBackdrop.classList.add("hidden");
}

function openDeleteModal(taskId) {
  state.pendingDeleteTaskId = taskId;
  if (el.deleteWithFilesCheckbox) el.deleteWithFilesCheckbox.checked = false;
  if (el.deleteModal) {
    el.deleteModal.classList.remove("hidden");
    el.deleteModal.setAttribute("aria-hidden", "false");
  }
  if (el.deleteModalBackdrop) el.deleteModalBackdrop.classList.remove("hidden");
}

function closeDeleteModal() {
  state.pendingDeleteTaskId = null;
  if (el.deleteModal) {
    el.deleteModal.classList.add("hidden");
    el.deleteModal.setAttribute("aria-hidden", "true");
  }
  if (el.deleteModalBackdrop) el.deleteModalBackdrop.classList.add("hidden");
}

function togglePanel(panel, forceOpen) {
  if (!panel) return;
  const open = forceOpen == null ? panel.classList.contains("hidden") : !!forceOpen;
  panel.classList.toggle("hidden", !open);
}

function getContextTask() {
  if (!state.contextMenuTaskId) return null;
  return state.tasks.get(state.contextMenuTaskId) || null;
}

function closeContextMenu() {
  state.contextMenuTaskId = null;
  if (el.taskContextMenu) el.taskContextMenu.classList.add("hidden");
}

function openContextMenu(task, x, y) {
  if (!task || !task.id || !el.taskContextMenu) return;
  state.contextMenuTaskId = task.id;
  el.taskContextMenu.classList.remove("hidden");

  const source = String(task.source || "");
  const retryable = /^magnet:\?/i.test(source) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source);
  if (el.ctxOpenFile) el.ctxOpenFile.disabled = !isCompletedTask(task);
  if (el.ctxOpenDir) el.ctxOpenDir.disabled = !isCompletedTask(task);
  if (el.ctxRetry) el.ctxRetry.disabled = !retryable;

  const menuRect = el.taskContextMenu.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - menuRect.width - 8);
  const maxTop = Math.max(0, window.innerHeight - menuRect.height - 8);
  const left = Math.max(8, Math.min(x, maxLeft));
  const top = Math.max(8, Math.min(y, maxTop));
  el.taskContextMenu.style.left = `${left}px`;
  el.taskContextMenu.style.top = `${top}px`;
}

async function copyText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    toast("Nothing to copy", "warn");
    return;
  }
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    throw new Error("Clipboard API is unavailable in this environment.");
  }
  await navigator.clipboard.writeText(text);
  toast(label, "success");
}

function renderDownloadingTable(tasks) {
  const wrap = document.createElement("div");
  wrap.className = "completed-table-wrap";
  const table = document.createElement("table");
  table.className = "completed-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
    <th class="col-select">${t("fields.select")}</th>
    <th>${t("table.name")}</th>
    <th>${t("table.progress")}</th>
    <th>${t("table.speed")}</th>
    <th>${t("table.status")}</th>
    <th>${t("table.actions")}</th>
  </tr>`;
  const headRow = thead.querySelector("tr");
  const master = document.createElement("input");
  master.type = "checkbox";
  const allSelected = tasks.length > 0 && tasks.every((t) => state.selectedTaskIds.has(t.id));
  master.checked = allSelected;
  master.onchange = () => {
    tasks.forEach((t) => setTaskSelected(t.id, master.checked));
    render();
  };
  const firstTh = headRow?.querySelector("th");
  if (firstTh) {
    firstTh.innerHTML = "";
    firstTh.appendChild(master);
  }
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (tasks.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="cell-empty" colspan="6">${t("common.noDownloadingTasks")}</td>`;
    tbody.appendChild(tr);
  } else {
    tasks.forEach((task) => {
      const tr = document.createElement("tr");
      tr.oncontextmenu = (e) => {
        e.preventDefault();
        openContextMenu(task, e.clientX, e.clientY);
      };
      const name = task.name || task.source || task.id;
      const p = progressPercent(task);
      const progress = `${p.toFixed(1)}% (${fmtBytes(task.completed_length)} / ${fmtBytes(task.total_length)})`;
      const speed = `DL ${fmtBytes(task.download_speed)}/s | UL ${fmtBytes(task.upload_speed)}/s`;
      const status = normalizeStatus(task.status);
      const eta = formatEta(task);
      tr.innerHTML = `
        <td class="cell-select"></td>
        <td class="cell-name" title="${name}">${name}</td>
        <td class="cell-size">
          <div>${progress}</div>
          <div class="cell-sub">${t("meta.eta")}: ${eta}</div>
        </td>
        <td class="cell-size">${speed}</td>
        <td class="cell-status">
          <span class="task-status">${task.status}</span>
          ${
            task.error_message
              ? `<details class="error-detail"><summary>${t("meta.error")}</summary><pre>${task.error_message}</pre></details>`
              : ""
          }
        </td>
        <td class="cell-actions"></td>
      `;
      const cellSelect = tr.querySelector(".cell-select");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedTaskIds.has(task.id);
      cb.onchange = () => {
        setTaskSelected(task.id, cb.checked);
        updateBatchToolbar(tasks);
      };
      cellSelect?.appendChild(cb);

      const cellActions = tr.querySelector(".cell-actions");
      const mkBtn = (label, cls, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.onclick = onClick;
        return b;
      };

      cellActions.appendChild(mkBtn(t("actions.detail"), "ghost", () => openTaskDetail(task.id)));
      if (status === "paused") {
        cellActions.appendChild(mkBtn(t("actions.resume"), "primary", () => doResume(task.id)));
      } else {
        cellActions.appendChild(mkBtn(t("actions.pause"), "primary", () => doPause(task.id)));
      }
      cellActions.appendChild(mkBtn(t("actions.remove"), "danger", () => doRemove(task.id)));

      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function renderCompletedTable(tasks) {
  const wrap = document.createElement("div");
  wrap.className = "completed-table-wrap";
  const table = document.createElement("table");
  table.className = "completed-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
    <th class="col-select">${t("fields.select")}</th>
    <th>${t("table.name")}</th>
    <th>${t("table.size")}</th>
    <th>${t("table.status")}</th>
    <th>${t("table.actions")}</th>
  </tr>`;
  const headRow = thead.querySelector("tr");
  const master = document.createElement("input");
  master.type = "checkbox";
  const allSelected = tasks.length > 0 && tasks.every((t) => state.selectedTaskIds.has(t.id));
  master.checked = allSelected;
  master.onchange = () => {
    tasks.forEach((t) => setTaskSelected(t.id, master.checked));
    render();
  };
  const firstTh = headRow?.querySelector("th");
  if (firstTh) {
    firstTh.innerHTML = "";
    firstTh.appendChild(master);
  }
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (tasks.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="cell-empty" colspan="5">${t("common.noDownloadedTasks")}</td>`;
    tbody.appendChild(tr);
  } else {
    tasks.forEach((task) => {
      const tr = document.createElement("tr");
      tr.oncontextmenu = (e) => {
        e.preventDefault();
        openContextMenu(task, e.clientX, e.clientY);
      };
      const name = task.name || task.source || task.id;
      const size = `${fmtBytes(task.completed_length)} / ${fmtBytes(task.total_length)}`;
      const completedAt = formatTs(task.updated_at);
      tr.innerHTML = `
        <td class="cell-select"></td>
        <td class="cell-name" title="${name}">${name}</td>
        <td class="cell-size">
          <div>${size}</div>
          <div class="cell-sub">${t("meta.completedAt")}: ${completedAt}</div>
        </td>
        <td class="cell-status">
          <span class="task-status">${task.status}</span>
          ${
            task.error_message
              ? `<details class="error-detail"><summary>${t("meta.error")}</summary><pre>${task.error_message}</pre></details>`
              : ""
          }
        </td>
        <td class="cell-actions"></td>
      `;
      const cellSelect = tr.querySelector(".cell-select");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedTaskIds.has(task.id);
      cb.onchange = () => {
        setTaskSelected(task.id, cb.checked);
        updateBatchToolbar(tasks);
      };
      cellSelect?.appendChild(cb);

      const cellActions = tr.querySelector(".cell-actions");
      const mkBtn = (label, cls, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.onclick = onClick;
        return b;
      };

      cellActions.appendChild(mkBtn(t("actions.detail"), "ghost", () => openTaskDetail(task.id)));
      cellActions.appendChild(mkBtn(t("actions.openFile"), "ghost", () => doOpenTaskFile(task.id).catch(alertError)));
      cellActions.appendChild(mkBtn(t("actions.openDir"), "ghost", () => doOpenTaskDir(task.id).catch(alertError)));
      cellActions.appendChild(mkBtn(t("actions.remove"), "danger", () => openDeleteModal(task.id)));

      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function render() {
  pruneSelection();
  if (state.contextMenuTaskId && !state.tasks.has(state.contextMenuTaskId)) {
    closeContextMenu();
  }
  const { downloading, completed } = getFilteredTasks();

  el.taskCount.textContent = String(downloading.length);
  el.taskList.innerHTML = "";
  el.taskList.appendChild(renderDownloadingTable(downloading));

  el.completedCount.textContent = String(completed.length);
  el.completedList.innerHTML = "";
  el.completedList.appendChild(renderCompletedTable(completed));

  const visible = state.currentSection === "downloading" ? downloading : completed;
  updateBatchToolbar(visible);
  setSection(state.currentSection);
}

async function refreshTasks() {
  const list = await invoke("list_tasks", { status: null, limit: 500, offset: 0 });
  state.tasks.clear();
  for (const t of list) state.tasks.set(t.id, t);
  render();
}

async function refreshDiagnostics() {
  const diagnostics = await invoke("get_diagnostics");
  el.diagnostics.textContent = JSON.stringify(diagnostics, null, 2);
}

async function refreshAria2UpdateInfo() {
  const info = await invoke("check_aria2_update");
  el.aria2Update.textContent = JSON.stringify(info, null, 2);
}

async function refreshLogs() {
  const logs = await invoke("list_operation_logs", { limit: 200 });
  const backendLines = logs.map((l) => `[${formatTs(l.ts)}] ${l.action}: ${l.message}`);
  renderLogsContent(backendLines);
}

function renderLogsContent(backendLines = null) {
  if (!el.opLogs) return;
  const existingBackend = el.opLogs.dataset.backendLines
    ? JSON.parse(el.opLogs.dataset.backendLines)
    : [];
  const backend = backendLines ?? existingBackend;
  if (backendLines) {
    el.opLogs.dataset.backendLines = JSON.stringify(backend);
  }
  const merged = [
    "[UI]",
    ...state.uiLogs,
    "",
    "[Backend]",
    ...backend,
  ];
  el.opLogs.textContent = merged.length > 4 ? merged.join("\n") : t("common.noLogsYet");
}

async function loadSettings() {
  const s = await invoke("get_global_settings");
  el.settingAria2BinPath.value = s.aria2_bin_path || "";
  el.settingDownloadDir.value = s.download_dir || "";
  el.settingMaxConcurrent.value = s.max_concurrent_downloads || "";
  el.settingMaxConn.value = s.max_connection_per_server || "";
  el.settingMaxLimit.value = s.max_overall_download_limit || "";
  el.settingBtTracker.value = s.bt_tracker || "";
  el.settingGithubCdn.value = normalizeCdnValue(s.github_cdn || "");
  el.settingGithubToken.value = s.github_token || "";
  syncGithubCdnPreset();
  if (typeof s.enable_upnp === "boolean") {
    el.settingEnableUpnp.value = s.enable_upnp ? "true" : "false";
  } else {
    el.settingEnableUpnp.value = "";
  }
  if (typeof s.browser_bridge_enabled === "boolean") {
    el.settingBrowserBridgeEnabled.value = s.browser_bridge_enabled ? "true" : "false";
  } else {
    el.settingBrowserBridgeEnabled.value = "";
  }
  state.themeMode = normalizeThemeMode(s.ui_theme || "system");
  applyTheme();
  el.settingBrowserBridgePort.value = s.browser_bridge_port || "";
  el.settingBrowserBridgeToken.value = s.browser_bridge_token || "";
  renderDownloadRules(s.download_dir_rules || []);
}

async function saveSettings(e) {
  e.preventDefault();
  const settings = {
    aria2_bin_path: String(el.settingAria2BinPath.value || "").trim() || null,
    download_dir: el.settingDownloadDir.value.trim() || null,
    max_concurrent_downloads: toNum(el.settingMaxConcurrent.value),
    max_connection_per_server: toNum(el.settingMaxConn.value),
    max_overall_download_limit: el.settingMaxLimit.value.trim() || null,
    bt_tracker: el.settingBtTracker.value.trim() || null,
    github_cdn: normalizeCdnValue(el.settingGithubCdn.value),
    github_token: String(el.settingGithubToken.value || "").trim(),
    download_dir_rules: readDownloadRulesFromUi(),
    browser_bridge_enabled:
      el.settingBrowserBridgeEnabled.value === "true"
        ? true
        : el.settingBrowserBridgeEnabled.value === "false"
          ? false
          : null,
    browser_bridge_port: toNum(el.settingBrowserBridgePort.value),
    browser_bridge_token: String(el.settingBrowserBridgeToken.value || "").trim() || null,
    ui_theme: normalizeThemeMode(el.settingThemeMode?.value || "system"),
    enable_upnp:
      el.settingEnableUpnp.value === "true"
        ? true
        : el.settingEnableUpnp.value === "false"
          ? false
          : null,
  };

  await invoke("set_global_settings", { settings });
  await Promise.all([loadSettings(), refreshDiagnostics(), refreshLogs()]);
}

async function detectAria2Path() {
  const paths = await invoke("detect_aria2_bin_paths");
  const list = Array.isArray(paths) ? paths : [];
  if (list.length === 0) {
    toast("No aria2 binary found in common locations.", "warn");
    return;
  }
  if (el.settingAria2BinPath) {
    el.settingAria2BinPath.value = list[0];
  }
  toast(`Detected aria2 path: ${list[0]}`, "success");
  setStatus(`Detected paths: ${list.join(" | ")}`, "info");
}

async function doAddUrl() {
  const submitBtn = el.btnAddUrl;
  let url = el.urlInput.value.trim();
  if (!url) {
    setStatus("URL is empty", "warn");
    toast("URL is empty", "warn");
    return;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    url = `https://${url}`;
  }
  try {
    setStatus(`Adding URL: ${url}`, "info");
    const checked = new URL(url).toString();
    if (submitBtn) submitBtn.disabled = true;
    const saveDir = String(el.urlSaveDirInput?.value || "").trim();
    await invoke("add_url", {
      url: checked,
      options: { save_dir: saveDir || null },
    });
    el.urlInput.value = "";
    state.addSaveDirTouched.url = false;
    await updateSuggestedSaveDir("url", true);
    await Promise.all([refreshTasks(), refreshLogs()]);
    setStatus(t("msg.addUrlSuccess"), "ok");
    closeAddModal();
    toast(t("msg.addUrlSuccess"), "success");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function doAddMagnet(e) {
  if (e) e.preventDefault();
  const magnet = el.magnetInput.value.trim();
  if (!magnet) return;
  const saveDir = String(el.magnetSaveDirInput?.value || "").trim();
  await invoke("add_magnet", {
    magnet,
    options: { save_dir: saveDir || null },
  });
  el.magnetInput.value = "";
  state.addSaveDirTouched.magnet = false;
  await updateSuggestedSaveDir("magnet", true);
  await Promise.all([refreshTasks(), refreshLogs()]);
  closeAddModal();
}

async function doAddTorrent(e) {
  if (e) e.preventDefault();
  const file = el.torrentInput.files?.[0];
  if (!file) return;

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);

  await invoke("add_torrent", {
    torrentFilePath: null,
    torrentBase64: btoa(binary),
    options: {
      save_dir: String(el.torrentSaveDirInput?.value || "").trim() || null,
    },
  });

  el.torrentInput.value = "";
  state.addSaveDirTouched.torrent = false;
  await updateSuggestedSaveDir("torrent", true);
  await Promise.all([refreshTasks(), refreshLogs()]);
  closeAddModal();
}

async function doPause(taskId) {
  await invoke("pause_task", { taskId });
  await Promise.all([refreshTasks(), refreshLogs()]);
}

async function doResume(taskId) {
  await invoke("resume_task", { taskId });
  await Promise.all([refreshTasks(), refreshLogs()]);
}

async function doRemove(taskId) {
  const confirmRemove = await askConfirm(t("dialog.removeTask"));
  if (!confirmRemove) return;
  const deleteFiles = await askConfirm(t("dialog.removeFiles"));
  await invoke("remove_task", { taskId, deleteFiles });
  state.tasks.delete(taskId);
  if (state.selectedTaskId === taskId) closeTaskDetail();
  render();
  await refreshLogs();
  toast(t("actions.remove"), "success");
}

function getSelectedVisibleTasks() {
  const { downloading, completed } = getFilteredTasks();
  const visible = state.currentSection === "downloading" ? downloading : completed;
  return visible.filter((t) => state.selectedTaskIds.has(t.id));
}

async function doBatchPause() {
  const tasks = getSelectedVisibleTasks();
  for (const task of tasks) {
    if (isCompletedTask(task)) continue;
    await invoke("pause_task", { taskId: task.id });
  }
  await Promise.all([refreshTasks(), refreshLogs()]);
  toast(t("actions.batchPause"), "success");
}

async function doBatchResume() {
  const tasks = getSelectedVisibleTasks();
  for (const task of tasks) {
    if (isCompletedTask(task)) continue;
    await invoke("resume_task", { taskId: task.id });
  }
  await Promise.all([refreshTasks(), refreshLogs()]);
  toast(t("actions.batchResume"), "success");
}

async function doBatchRemove() {
  const tasks = getSelectedVisibleTasks();
  if (tasks.length === 0) return;
  const ok = await askConfirm(`${t("actions.batchRemove")} (${tasks.length})?`);
  if (!ok) return;
  const deleteFiles = await askConfirm(t("dialog.removeFiles"));
  for (const task of tasks) {
    await invoke("remove_task", { taskId: task.id, deleteFiles });
    state.selectedTaskIds.delete(task.id);
  }
  await Promise.all([refreshTasks(), refreshLogs()]);
  toast(t("actions.batchRemove"), "success");
}

async function doOpenTaskFile(taskId) {
  await invoke("open_task_file", { taskId });
}

async function doOpenTaskDir(taskId) {
  await invoke("open_task_dir", { taskId });
}

async function doRetryTask(taskId) {
  const task = state.tasks.get(taskId);
  if (!task) throw new Error("Task not found");
  const source = String(task.source || "").trim();
  if (!source) throw new Error("Task source is empty");

  if (/^magnet:\?/i.test(source)) {
    await invoke("add_magnet", { magnet: source, options: {} });
  } else {
    let checked = null;
    try {
      checked = new URL(source).toString();
    } catch (_) {
      checked = null;
    }
    if (!checked) throw new Error("Retry currently supports URL or magnet tasks only.");
    await invoke("add_url", { url: checked, options: {} });
  }

  await Promise.all([refreshTasks(), refreshLogs()]);
  toast(t("actions.retryTask"), "success");
}

async function doRemoveRecordOnly(taskId) {
  setStatus(`delete record requested: ${taskId}`, "info");
  await invoke("remove_task", { taskId, deleteFiles: false });
  state.tasks.delete(taskId);
  if (state.selectedTaskId === taskId) closeTaskDetail();
  render();
  await refreshLogs();
  setStatus(`record removed: ${taskId}`, "ok");
}

async function doRemoveFilesAndRecord(taskId) {
  setStatus(`delete files+record requested: ${taskId}`, "info");
  await invoke("remove_task", { taskId, deleteFiles: true });
  state.tasks.delete(taskId);
  if (state.selectedTaskId === taskId) closeTaskDetail();
  render();
  await refreshLogs();
  setStatus(`files+record removed: ${taskId}`, "ok");
}

async function doConfirmDeleteCompleted() {
  const taskId = state.pendingDeleteTaskId;
  if (!taskId) {
    closeDeleteModal();
    return;
  }
  const deleteFiles = !!(el.deleteWithFilesCheckbox && el.deleteWithFilesCheckbox.checked);
  setStatus(`delete completed task requested: ${taskId}, deleteFiles=${deleteFiles}`, "info");
  await invoke("remove_task", { taskId, deleteFiles });
  state.tasks.delete(taskId);
  if (state.selectedTaskId === taskId) closeTaskDetail();
  render();
  closeDeleteModal();
  await refreshLogs();
  setStatus(`completed task removed: ${taskId}`, "ok");
}

async function doPauseAll() {
  await invoke("pause_all");
  await Promise.all([refreshTasks(), refreshLogs()]);
}

async function doResumeAll() {
  await invoke("resume_all");
  await Promise.all([refreshTasks(), refreshLogs()]);
}

async function doRpcPing() {
  setStatus("RPC ping...", "info");
  const msg = await invoke("rpc_ping");
  setStatus(msg, "ok");
  toast(msg, "success");
  await Promise.all([refreshDiagnostics(), refreshLogs()]);
}

async function doRestartAria2() {
  setStatus("Restarting aria2...", "info");
  const msg = await invoke("restart_aria2");
  setStatus(msg, "ok");
  toast(msg, "success");
  await Promise.all([refreshDiagnostics(), refreshTasks(), refreshLogs()]);
}

async function doStartupCheckAria2() {
  setStatus("Running startup check...", "info");
  const msg = await invoke("startup_check_aria2");
  setStatus(msg, "ok");
  toast(msg, "success", 3800);
  await Promise.all([refreshDiagnostics(), refreshLogs()]);
}

async function doSaveSession() {
  const msg = await invoke("save_session");
  toast(`${t("msg.saveSessionPrefix")}: ${msg}`, "success");
  await refreshLogs();
}

async function doUpdateAria2Now() {
  const btn = el.btnUpdateAria2Now;
  try {
    const ok = await askConfirm(t("dialog.updateAria2Now"));
    if (!ok) return;
    if (btn) btn.disabled = true;
    setStatus(t("msg.updateStart"), "info");
    const result = await invoke("update_aria2_now");
    setStatus(t("msg.updateInstalling"), "info");
    await Promise.all([refreshDiagnostics(), refreshAria2UpdateInfo(), refreshLogs()]);
    setStatus(result?.message || t("msg.updateDone"), "ok");
    toast(result?.message || t("msg.updateDone"), "success");
  } catch (err) {
    setStatus(err?.message || String(err), "error");
    throw err;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function doClearLogs() {
  const ok = await askConfirm(t("dialog.clearLogs"));
  if (!ok) return;
  await invoke("clear_operation_logs");
  await refreshLogs();
  toast(t("actions.clearLogs"), "success");
}

async function openTaskDetail(taskId) {
  state.selectedTaskId = taskId;
  const detail = await invoke("get_task_detail", { taskId });
  const task = detail.task;
  const files = Array.isArray(detail.files) ? detail.files : [];

  el.drawer.classList.remove("hidden");
  el.drawer.setAttribute("aria-hidden", "false");
  el.drawerTitle.textContent = task.name || task.source || task.id;
  el.drawerMeta.textContent = [
    `${t("meta.status")}: ${task.status}`,
    `${t("meta.type")}: ${task.task_type}`,
    `${t("meta.progress")}: ${progressPercent(task).toFixed(1)}%`,
    `${t("meta.done")}: ${fmtBytes(task.completed_length)} / ${fmtBytes(task.total_length)}`,
  ].join("\n");

  if (files.length === 0) {
    el.drawerFilesList.innerHTML = `<div class="file-size">${t("meta.metadataNotReady")}</div>`;
    state.selectedFiles = [];
    return;
  }

  state.selectedFiles = files.map((f) => !!f.selected);
  renderDrawerFiles(files);
}

function renderDrawerFiles(files) {
  el.drawerFilesList.innerHTML = "";
  files.forEach((file, idx) => {
    const row = document.createElement("label");
    row.className = "file-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.selectedFiles[idx];
    cb.onchange = () => {
      state.selectedFiles[idx] = cb.checked;
    };

    const path = document.createElement("div");
    path.className = "file-path";
    path.textContent = file.path || `file-${idx + 1}`;

    const size = document.createElement("div");
    size.className = "file-size";
    size.textContent = `${fmtBytes(file.completed_length)} / ${fmtBytes(file.length)}`;

    row.appendChild(cb);
    row.appendChild(path);
    row.appendChild(size);
    el.drawerFilesList.appendChild(row);
  });
}

function closeTaskDetail() {
  state.selectedTaskId = null;
  state.selectedFiles = [];
  el.drawer.classList.add("hidden");
  el.drawer.setAttribute("aria-hidden", "true");
  el.drawerFilesList.innerHTML = "";
}

async function applySelection() {
  if (!state.selectedTaskId) return;
  const selectedIndexes = state.selectedFiles
    .map((checked, idx) => (checked ? idx : null))
    .filter((v) => v !== null);

  await invoke("set_task_file_selection", {
    taskId: state.selectedTaskId,
    selectedIndexes,
  });

  await Promise.all([openTaskDetail(state.selectedTaskId), refreshLogs()]);
}

async function bindTaskUpdates() {
  const evt = tauriEvent();
  if (!evt || typeof evt.listen !== "function") return;

  try {
    state.unlisten = await evt.listen("task_update", (event) => {
      const tasks = Array.isArray(event.payload) ? event.payload : [];
      for (const t of tasks) {
        if (t && t.id) state.tasks.set(t.id, t);
      }
      render();
    });
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.includes("event.listen not allowed")) {
      throw err;
    }
  }
}

function openLogsWindow() {
  invoke("open_logs_window").catch((err) => {
    const msg = `open logs window failed: ${err?.message || String(err)}`;
    setStatus(msg, "error");
    toast(msg, "error", 3600);
  });
}

function startAutoRefresh() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
  }
  state.autoRefreshTimer = window.setInterval(() => {
    refreshTasks().catch(() => {});
  }, 2500);
}

async function boot() {
  state.locale = loadSavedLocale() || detectLocale();
  state.themeMode = "system";
  applyTheme();
  applyI18n();
  setSection("downloading");
  setSettingsTab("basic");
  setAddTab("url");
  if (el.taskStatusFilter) el.taskStatusFilter.value = state.statusFilter;
  if (el.taskSortBy) el.taskSortBy.value = state.sortBy;

  if (el.navDownloading) {
    el.navDownloading.onclick = () => {
      setSection("downloading");
      render();
    };
  }
  if (el.navDownloaded) {
    el.navDownloaded.onclick = () => {
      setSection("downloaded");
      render();
    };
  }

  if (el.settingsTabs) {
    el.settingsTabs.forEach((btn) => {
      btn.onclick = () => setSettingsTab(btn.dataset.settingsTab || "basic");
    });
  }

  if (el.btnOpenAddTools) {
    el.btnOpenAddTools.onclick = () => openAddModal();
  }
  if (el.btnCloseAddTools) el.btnCloseAddTools.onclick = () => closeAddModal();
  if (el.addModalBackdrop) el.addModalBackdrop.onclick = () => closeAddModal();
  if (el.deleteModalBackdrop) el.deleteModalBackdrop.onclick = () => closeDeleteModal();
  if (el.btnDeleteConfirmCancel) el.btnDeleteConfirmCancel.onclick = () => closeDeleteModal();
  if (el.btnDeleteConfirmOk) el.btnDeleteConfirmOk.onclick = () => doConfirmDeleteCompleted().catch(alertError);
  if (el.confirmModalBackdrop) el.confirmModalBackdrop.onclick = () => resolveConfirm(false);
  if (el.btnConfirmCancel) el.btnConfirmCancel.onclick = () => resolveConfirm(false);
  if (el.btnConfirmOk) el.btnConfirmOk.onclick = () => resolveConfirm(true);
  if (el.ctxDetail) {
    el.ctxDetail.onclick = () => {
      const task = getContextTask();
      closeContextMenu();
      if (task) openTaskDetail(task.id).catch(alertError);
    };
  }
  if (el.ctxOpenFile) {
    el.ctxOpenFile.onclick = () => {
      const task = getContextTask();
      closeContextMenu();
      if (task) doOpenTaskFile(task.id).catch(alertError);
    };
  }
  if (el.ctxOpenDir) {
    el.ctxOpenDir.onclick = () => {
      const task = getContextTask();
      closeContextMenu();
      if (task) doOpenTaskDir(task.id).catch(alertError);
    };
  }
  if (el.ctxCopySource) {
    el.ctxCopySource.onclick = () => {
      const task = getContextTask();
      closeContextMenu();
      if (task) copyText(task.source, t("actions.copySource")).catch(alertError);
    };
  }
  if (el.ctxCopyId) {
    el.ctxCopyId.onclick = () => {
      const task = getContextTask();
      closeContextMenu();
      if (task) copyText(task.id, t("actions.copyTaskId")).catch(alertError);
    };
  }
  if (el.ctxRetry) {
    el.ctxRetry.onclick = () => {
      const task = getContextTask();
      closeContextMenu();
      if (task) doRetryTask(task.id).catch(alertError);
    };
  }
  document.addEventListener("click", (event) => {
    if (!el.taskContextMenu || el.taskContextMenu.classList.contains("hidden")) return;
    if (el.taskContextMenu.contains(event.target)) return;
    closeContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContextMenu();
    }
  });
  window.addEventListener("resize", () => closeContextMenu());
  window.addEventListener("blur", () => closeContextMenu());
  if (el.addTabs) {
    el.addTabs.forEach((btn) => {
      btn.onclick = () => setAddTab(btn.dataset.addTab || "url");
    });
  }
  if (el.btnOpenSettingsTools) {
    el.btnOpenSettingsTools.onclick = () => {
      closeAddModal();
      togglePanel(el.settingsToolsPanel);
      setSettingsTab(state.currentSettingsTab || "basic");
      Promise.all([loadSettings(), refreshDiagnostics(), refreshAria2UpdateInfo(), refreshLogs()]).catch(alertError);
    };
  }
  if (el.btnCloseSettingsTools) {
    el.btnCloseSettingsTools.onclick = () => {
      togglePanel(el.settingsToolsPanel, false);
      setSettingsTab("basic");
    };
  }

  if (el.btnAddUrl) el.btnAddUrl.onclick = () => doAddUrl().catch(alertError);
  if (el.btnAddMagnet) el.btnAddMagnet.onclick = () => doAddMagnet().catch(alertError);
  if (el.btnAddTorrent) el.btnAddTorrent.onclick = () => doAddTorrent().catch(alertError);
  if (el.urlInput) {
    el.urlInput.oninput = () => {
      updateSuggestedSaveDir("url").catch(() => {});
    };
    el.urlInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doAddUrl().catch(alertError);
      }
    };
  }
  if (el.urlSaveDirInput) {
    el.urlSaveDirInput.oninput = () => {
      state.addSaveDirTouched.url = true;
    };
  }
  if (el.magnetInput) {
    el.magnetInput.oninput = () => {
      updateSuggestedSaveDir("magnet").catch(() => {});
    };
    el.magnetInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doAddMagnet().catch(alertError);
      }
    };
  }
  if (el.magnetSaveDirInput) {
    el.magnetSaveDirInput.oninput = () => {
      state.addSaveDirTouched.magnet = true;
    };
  }
  if (el.torrentInput) {
    el.torrentInput.onchange = () => {
      updateSuggestedSaveDir("torrent").catch(() => {});
    };
  }
  if (el.torrentSaveDirInput) {
    el.torrentSaveDirInput.oninput = () => {
      state.addSaveDirTouched.torrent = true;
    };
  }
  if (el.settingsForm) el.settingsForm.addEventListener("submit", (e) => saveSettings(e).catch(alertError));
  if (el.btnDetectAria2Path) el.btnDetectAria2Path.onclick = () => detectAria2Path().catch(alertError);
  if (el.settingGithubCdnPreset) {
    el.settingGithubCdnPreset.onchange = () => {
      if (!el.settingGithubCdn) return;
      el.settingGithubCdn.value = normalizeCdnValue(el.settingGithubCdnPreset.value);
      syncGithubCdnPreset();
    };
  }
  if (el.settingGithubCdn) {
    el.settingGithubCdn.oninput = () => syncGithubCdnPreset();
  }
  if (el.btnAddDownloadRule) {
    el.btnAddDownloadRule.onclick = () => {
      const rules = readDownloadRulesFromUi();
      rules.push(createDefaultRule());
      renderDownloadRules(rules);
    };
  }

  if (el.btnReloadSettings) el.btnReloadSettings.onclick = () => loadSettings().catch(alertError);
  if (el.btnRefresh) {
    el.btnRefresh.onclick = () =>
      Promise.all([refreshTasks(), refreshDiagnostics(), refreshLogs()]).catch(alertError);
  }
  if (el.btnThemeQuick) {
    el.btnThemeQuick.onclick = () => {
      const effective = resolveEffectiveTheme(normalizeThemeMode(state.themeMode));
      state.themeMode = effective === "dark" ? "light" : "dark";
      applyTheme();
      if (el.settingThemeMode) el.settingThemeMode.value = state.themeMode;
    };
  }
  if (el.btnOpenLogsWindow) {
    el.btnOpenLogsWindow.onclick = () => openLogsWindow();
  }
  if (el.btnOpenLogsWindowInSettings) {
    el.btnOpenLogsWindowInSettings.onclick = () => openLogsWindow();
  }
  if (el.btnPauseAll) el.btnPauseAll.onclick = () => doPauseAll().catch(alertError);
  if (el.btnResumeAll) el.btnResumeAll.onclick = () => doResumeAll().catch(alertError);

  if (el.languageSelect) {
    el.languageSelect.onchange = () => {
      const picked = el.languageSelect.value;
      state.locale = SUPPORTED_LOCALES.includes(picked) ? picked : "en-US";
      saveLocale(state.locale);
      applyI18n();
      renderDownloadRules(readDownloadRulesFromUi());
      render();
      refreshLogs().catch(alertError);
      if (state.selectedTaskId) {
        openTaskDetail(state.selectedTaskId).catch(alertError);
      }
    };
  }
  if (el.settingThemeMode) {
    el.settingThemeMode.onchange = () => {
      state.themeMode = normalizeThemeMode(el.settingThemeMode.value);
      applyTheme();
    };
  }
  if (window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (normalizeThemeMode(state.themeMode) === "system") {
        applyTheme();
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onMedia);
    } else if (typeof media.addListener === "function") {
      media.addListener(onMedia);
    }
  }

  if (el.taskSearchInput) {
    el.taskSearchInput.oninput = () => {
      state.listQuery = String(el.taskSearchInput.value || "");
      render();
    };
  }
  if (el.taskStatusFilter) {
    el.taskStatusFilter.onchange = () => {
      state.statusFilter = String(el.taskStatusFilter.value || "all");
      render();
    };
  }
  if (el.taskSortBy) {
    el.taskSortBy.onchange = () => {
      state.sortBy = String(el.taskSortBy.value || "updated_desc");
      render();
    };
  }
  if (el.btnBatchPause) el.btnBatchPause.onclick = () => doBatchPause().catch(alertError);
  if (el.btnBatchResume) el.btnBatchResume.onclick = () => doBatchResume().catch(alertError);
  if (el.btnBatchRemove) el.btnBatchRemove.onclick = () => doBatchRemove().catch(alertError);
  if (el.btnBatchClear) {
    el.btnBatchClear.onclick = () => {
      clearSelection();
      render();
    };
  }

  if (el.btnRpcPing) el.btnRpcPing.onclick = () => doRpcPing().catch(alertError);
  if (el.btnRestartAria2) el.btnRestartAria2.onclick = () => doRestartAria2().catch(alertError);
  if (el.btnStartupCheckAria2) el.btnStartupCheckAria2.onclick = () => doStartupCheckAria2().catch(alertError);
  if (el.btnSaveSession) el.btnSaveSession.onclick = () => doSaveSession().catch(alertError);
  if (el.btnCheckAria2Update) el.btnCheckAria2Update.onclick = () => refreshAria2UpdateInfo().catch(alertError);
  if (el.btnUpdateAria2Now) el.btnUpdateAria2Now.onclick = () => doUpdateAria2Now().catch(alertError);
  if (el.btnClearLogs) el.btnClearLogs.onclick = () => doClearLogs().catch(alertError);
  if (el.btnCloseDrawer) el.btnCloseDrawer.onclick = () => closeTaskDetail();
  if (el.btnApplySelection) el.btnApplySelection.onclick = () => applySelection().catch(alertError);

  await bindTaskUpdates();
  startAutoRefresh();
  setStatus("Ready");
  el.aria2Update.textContent = t("common.noUpdateResult");
  await Promise.all([refreshTasks(), refreshDiagnostics(), loadSettings(), refreshLogs()]);
}

function alertError(err) {
  setStatus(err?.message || String(err), "error");
  toast(err?.message || String(err), "error", 3600);
}

boot().catch(alertError);

window.addEventListener("beforeunload", () => {
  if (typeof state.unlisten === "function") state.unlisten();
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
});
  try {
    const stored = window.localStorage.getItem(UI_LOGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        state.uiLogs = parsed
          .filter((line) => {
            const s = String(line);
            if (s.includes("Update button clicked")) return false;
            if (s.includes("event.listen not allowed")) return false;
            return true;
          })
          .slice(-300);
        window.localStorage.setItem(UI_LOGS_STORAGE_KEY, JSON.stringify(state.uiLogs));
      }
    }
  } catch (_) {}
