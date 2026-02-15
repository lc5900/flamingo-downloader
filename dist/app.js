const state = {
  tasks: new Map(),
  unlisten: null,
  selectedTaskId: null,
  selectedFiles: [],
  locale: "en-US",
  currentSection: "downloading",
  currentSettingsTab: "basic",
  currentAddTab: "url",
  pendingDeleteTaskId: null,
  autoRefreshTimer: null,
  uiLogs: [],
  logsDragging: false,
  logsDragOffsetX: 0,
  logsDragOffsetY: 0,
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
    "app.title": "Tarui Aria2 Downloader",
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
    "fields.language": "Language",
    "languages.enUS": "English",
    "languages.zhCN": "Simplified Chinese",
    "placeholders.url": "https://example.com/file.zip",
    "placeholders.magnet": "magnet:?xt=urn:btih:...",
    "placeholders.downloadDirectory": "./downloads",
    "placeholders.aria2BinPath": "/path/to/aria2c",
    "placeholders.maxOverallDownloadLimit": "0 / 10M / 2M",
    "placeholders.btTrackerList": "udp://tracker.opentrackr.org:1337/announce",
    "placeholders.githubCdn": "https://ghproxy.com/ or https://cdn.example/{url}",
    "placeholders.githubToken": "ghp_xxx...",
    "cdnPreset.custom": "Custom / Direct",
    "cdnPreset.ghproxy": "ghproxy.com",
    "cdnPreset.ghfast": "ghfast.top",
    "cdnPreset.ghproxyNet": "ghproxy.net",
    "actions.refresh": "Refresh",
    "actions.openLogsWindow": "Logs",
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
    "actions.pause": "Pause",
    "actions.resume": "Resume",
    "actions.remove": "Remove",
    "actions.cancel": "Cancel",
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
    "dialog.updateAria2Now": "Download and replace aria2 binary now?",
    "msg.saveSessionPrefix": "save_session",
    "msg.addUrlSuccess": "Task added successfully",
    "msg.updateStart": "Checking and downloading aria2 package...",
    "msg.updateInstalling": "Installing aria2 binary...",
    "msg.updateDone": "aria2 update completed",
  },
  "zh-CN": {
    "app.title": "Tarui Aria2 下载器",
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
    "fields.language": "语言",
    "languages.enUS": "英文",
    "languages.zhCN": "简体中文",
    "placeholders.url": "https://example.com/file.zip",
    "placeholders.magnet": "magnet:?xt=urn:btih:...",
    "placeholders.downloadDirectory": "./downloads",
    "placeholders.aria2BinPath": "/path/to/aria2c",
    "placeholders.maxOverallDownloadLimit": "0 / 10M / 2M",
    "placeholders.btTrackerList": "udp://tracker.opentrackr.org:1337/announce",
    "placeholders.githubCdn": "https://ghproxy.com/ 或 https://cdn.example/{url}",
    "placeholders.githubToken": "ghp_xxx...",
    "cdnPreset.custom": "自定义 / 直连",
    "cdnPreset.ghproxy": "ghproxy.com",
    "cdnPreset.ghfast": "ghfast.top",
    "cdnPreset.ghproxyNet": "ghproxy.net",
    "actions.refresh": "刷新",
    "actions.openLogsWindow": "日志",
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
    "actions.pause": "暂停",
    "actions.resume": "继续",
    "actions.remove": "删除",
    "actions.cancel": "取消",
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
  magnetInput: document.getElementById("magnet-input"),
  torrentInput: document.getElementById("torrent-input"),

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

  btnRefresh: document.getElementById("btn-refresh"),
  btnOpenLogsWindow: document.getElementById("btn-open-logs-window"),
  btnOpenLogsWindowInSettings: document.getElementById("btn-open-logs-window-in-settings"),
  btnRpcPing: document.getElementById("btn-rpc-ping"),
  btnRestartAria2: document.getElementById("btn-restart-aria2"),
  btnSaveSession: document.getElementById("btn-save-session"),
  btnCheckAria2Update: document.getElementById("btn-check-aria2-update"),
  btnUpdateAria2Now: document.getElementById("btn-update-aria2-now"),
  btnClearLogs: document.getElementById("btn-clear-logs"),
  diagnostics: document.getElementById("diagnostics"),
  aria2Update: document.getElementById("aria2-update"),
  opLogs: document.getElementById("op-logs"),

  languageSelect: document.getElementById("language-select"),

  taskTemplate: document.getElementById("task-item-template"),
  completedTemplate: document.getElementById("completed-item-template"),
  deleteModal: document.getElementById("delete-confirm-modal"),
  deleteModalBackdrop: document.getElementById("delete-modal-backdrop"),
  deleteWithFilesCheckbox: document.getElementById("delete-with-files-checkbox"),
  btnDeleteConfirmCancel: document.getElementById("btn-delete-confirm-cancel"),
  btnDeleteConfirmOk: document.getElementById("btn-delete-confirm-ok"),

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

function formatTs(ts) {
  const n = Number(ts || 0);
  return n > 0 ? new Date(n * 1000).toLocaleString() : "-";
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
}

function openAddModal() {
  if (el.settingsToolsPanel) el.settingsToolsPanel.classList.add("hidden");
  if (el.addToolsPanel) el.addToolsPanel.classList.remove("hidden");
  if (el.addModalBackdrop) el.addModalBackdrop.classList.remove("hidden");
  setAddTab(state.currentAddTab || "url");
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

function renderDownloadingTable(tasks) {
  const wrap = document.createElement("div");
  wrap.className = "completed-table-wrap";
  const table = document.createElement("table");
  table.className = "completed-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
    <th>${t("table.name")}</th>
    <th>${t("table.progress")}</th>
    <th>${t("table.speed")}</th>
    <th>${t("table.status")}</th>
    <th>${t("table.actions")}</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (tasks.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="cell-empty" colspan="5">${t("common.noDownloadingTasks")}</td>`;
    tbody.appendChild(tr);
  } else {
    tasks.forEach((task) => {
      const tr = document.createElement("tr");
      const name = task.name || task.source || task.id;
      const p = progressPercent(task);
      const progress = `${p.toFixed(1)}% (${fmtBytes(task.completed_length)} / ${fmtBytes(task.total_length)})`;
      const speed = `DL ${fmtBytes(task.download_speed)}/s | UL ${fmtBytes(task.upload_speed)}/s`;
      const status = normalizeStatus(task.status);
      tr.innerHTML = `
        <td class="cell-name" title="${name}">${name}</td>
        <td class="cell-size">${progress}</td>
        <td class="cell-size">${speed}</td>
        <td class="cell-status"><span class="task-status">${task.status}</span></td>
        <td class="cell-actions"></td>
      `;

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
    <th>${t("table.name")}</th>
    <th>${t("table.size")}</th>
    <th>${t("table.status")}</th>
    <th>${t("table.actions")}</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (tasks.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="cell-empty" colspan="4">${t("common.noDownloadedTasks")}</td>`;
    tbody.appendChild(tr);
  } else {
    tasks.forEach((task) => {
      const tr = document.createElement("tr");
      const name = task.name || task.source || task.id;
      const size = `${fmtBytes(task.completed_length)} / ${fmtBytes(task.total_length)}`;
      tr.innerHTML = `
        <td class="cell-name" title="${name}">${name}</td>
        <td class="cell-size">${size}</td>
        <td class="cell-status"><span class="task-status">${task.status}</span></td>
        <td class="cell-actions"></td>
      `;

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
  const all = Array.from(state.tasks.values()).sort((a, b) => b.created_at - a.created_at);
  const downloading = all.filter(isDownloadingTask);
  const completed = all.filter(isCompletedTask);

  el.taskCount.textContent = String(downloading.length);
  el.taskList.innerHTML = "";
  el.taskList.appendChild(renderDownloadingTable(downloading));

  el.completedCount.textContent = String(completed.length);
  el.completedList.innerHTML = "";
  el.completedList.appendChild(renderCompletedTable(completed));

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
    alert("No aria2 binary found in common locations.");
    return;
  }
  if (el.settingAria2BinPath) {
    el.settingAria2BinPath.value = list[0];
  }
  alert(`Detected paths:\n${list.join("\n")}`);
}

async function doAddUrl() {
  const submitBtn = el.btnAddUrl;
  let url = el.urlInput.value.trim();
  if (!url) {
    setStatus("URL is empty", "warn");
    alert("URL is empty");
    return;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    url = `https://${url}`;
  }
  try {
    setStatus(`Adding URL: ${url}`, "info");
    const checked = new URL(url).toString();
    if (submitBtn) submitBtn.disabled = true;
    await invoke("add_url", { url: checked, options: {} });
    el.urlInput.value = "";
    await Promise.all([refreshTasks(), refreshLogs()]);
    setStatus(t("msg.addUrlSuccess"), "ok");
    closeAddModal();
    alert(t("msg.addUrlSuccess"));
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function doAddMagnet(e) {
  if (e) e.preventDefault();
  const magnet = el.magnetInput.value.trim();
  if (!magnet) return;
  await invoke("add_magnet", { magnet, options: {} });
  el.magnetInput.value = "";
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
    options: {},
  });

  el.torrentInput.value = "";
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
  const confirmRemove = window.confirm(t("dialog.removeTask"));
  if (!confirmRemove) return;
  const deleteFiles = window.confirm(t("dialog.removeFiles"));
  await invoke("remove_task", { taskId, deleteFiles });
  state.tasks.delete(taskId);
  if (state.selectedTaskId === taskId) closeTaskDetail();
  render();
  await refreshLogs();
}

async function doOpenTaskFile(taskId) {
  await invoke("open_task_file", { taskId });
}

async function doOpenTaskDir(taskId) {
  await invoke("open_task_dir", { taskId });
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
  alert(msg);
  await Promise.all([refreshDiagnostics(), refreshLogs()]);
}

async function doRestartAria2() {
  setStatus("Restarting aria2...", "info");
  const msg = await invoke("restart_aria2");
  setStatus(msg, "ok");
  alert(msg);
  await Promise.all([refreshDiagnostics(), refreshTasks(), refreshLogs()]);
}

async function doSaveSession() {
  const msg = await invoke("save_session");
  alert(`${t("msg.saveSessionPrefix")}: ${msg}`);
  await refreshLogs();
}

async function doUpdateAria2Now() {
  const btn = el.btnUpdateAria2Now;
  try {
    if (btn) btn.disabled = true;
    setStatus(t("msg.updateStart"), "info");
    const result = await invoke("update_aria2_now");
    setStatus(t("msg.updateInstalling"), "info");
    await Promise.all([refreshDiagnostics(), refreshAria2UpdateInfo(), refreshLogs()]);
    setStatus(result?.message || t("msg.updateDone"), "ok");
    alert(result?.message || t("msg.updateDone"));
  } catch (err) {
    setStatus(err?.message || String(err), "error");
    throw err;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function doClearLogs() {
  const ok = window.confirm(t("dialog.clearLogs"));
  if (!ok) return;
  await invoke("clear_operation_logs");
  await refreshLogs();
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
    alert(msg);
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
  applyI18n();
  setSection("downloading");
  setSettingsTab("basic");
  setAddTab("url");

  if (el.navDownloading) el.navDownloading.onclick = () => setSection("downloading");
  if (el.navDownloaded) el.navDownloaded.onclick = () => setSection("downloaded");

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
    el.urlInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doAddUrl().catch(alertError);
      }
    };
  }
  if (el.magnetInput) {
    el.magnetInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doAddMagnet().catch(alertError);
      }
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

  if (el.btnReloadSettings) el.btnReloadSettings.onclick = () => loadSettings().catch(alertError);
  if (el.btnRefresh) {
    el.btnRefresh.onclick = () =>
      Promise.all([refreshTasks(), refreshDiagnostics(), refreshLogs()]).catch(alertError);
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
      render();
      refreshLogs().catch(alertError);
      if (state.selectedTaskId) {
        openTaskDetail(state.selectedTaskId).catch(alertError);
      }
    };
  }

  if (el.btnRpcPing) el.btnRpcPing.onclick = () => doRpcPing().catch(alertError);
  if (el.btnRestartAria2) el.btnRestartAria2.onclick = () => doRestartAria2().catch(alertError);
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
  alert(err?.message || String(err));
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
