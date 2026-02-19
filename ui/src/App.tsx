import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Collapse,
  ConfigProvider,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Progress,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Descriptions,
  Typography,
  Upload,
  message,
  notification,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  SlidersOutlined,
  SyncOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Resizable } from 'react-resizable'
import './App.css'
import 'react-resizable/css/styles.css'

type Locale = 'en-US' | 'zh-CN'
type ThemeMode = 'system' | 'light' | 'dark'
type SectionKey = 'downloading' | 'downloaded'
type MatcherType = 'ext' | 'domain' | 'type'

type Task = {
  id: string
  aria2_gid?: string | null
  task_type?: string
  source: string
  name?: string | null
  status: string
  save_dir?: string
  category?: string | null
  total_length: number
  completed_length: number
  download_speed: number
  error_code?: string | null
  error_message?: string | null
  created_at?: number
  updated_at?: number
}

type DownloadRule = {
  enabled: boolean
  matcher: MatcherType
  pattern: string
  save_dir: string
  subdir_by_date?: boolean
  subdir_by_domain?: boolean
}

type GlobalSettings = {
  aria2_bin_path?: string | null
  download_dir?: string | null
  max_concurrent_downloads?: number | null
  max_connection_per_server?: number | null
  max_overall_download_limit?: string | null
  bt_tracker?: string | null
  github_cdn?: string | null
  github_token?: string | null
  enable_upnp?: boolean | null
  ui_theme?: string | null
  browser_bridge_enabled?: boolean | null
  browser_bridge_port?: number | null
  browser_bridge_token?: string | null
  browser_bridge_allowed_origins?: string | null
  clipboard_watch_enabled?: boolean | null
  download_dir_rules?: DownloadRule[]
  retry_max_attempts?: number | null
  retry_backoff_secs?: number | null
  retry_fallback_mirrors?: string | null
  metadata_timeout_secs?: number | null
  speed_plan?: string | null
  task_option_presets?: string | null
  post_complete_action?: string | null
  auto_delete_control_files?: boolean | null
  auto_clear_completed_days?: number | null
  first_run_done?: boolean | null
  start_minimized?: boolean | null
  minimize_to_tray?: boolean | null
  notify_on_complete?: boolean | null
}

type AddFormValues = {
  url: string
  magnet: string
  save_dir?: string
  out?: string
  max_download_limit?: string
  max_upload_limit?: string
  seed_ratio?: number
  seed_time?: number
  max_connection_per_server?: number
  split?: number
  user_agent?: string
  referer?: string
  cookie?: string
  headers_text?: string
  preset_name?: string
  preset_selected?: string
}

type AddPresetTaskType = 'http' | 'magnet' | 'torrent'

type TaskOptionPreset = {
  name: string
  task_type: AddPresetTaskType
  options: {
    out?: string | null
    max_download_limit?: string | null
    max_upload_limit?: string | null
    seed_ratio?: number | null
    seed_time?: number | null
    max_connection_per_server?: number | null
    split?: number | null
    user_agent?: string | null
    referer?: string | null
    headers?: string[]
  }
}

type StartupNotice = {
  level: string
  message: string
}

type StartupSelfCheck = {
  aria2_bin_path: string
  aria2_bin_exists: boolean
  aria2_bin_executable: boolean
  download_dir: string
  download_dir_exists: boolean
  download_dir_writable: boolean
  rpc_ready: boolean
  rpc_endpoint?: string | null
}

type ImportTaskListResult = {
  imported_tasks: number
  imported_files: number
}

type TaskFile = {
  path: string
  length: number
  completed_length: number
  selected: boolean
}

type OperationLog = {
  ts: number
  action: string
  message: string
}

type SaveDirSuggestion = {
  save_dir: string
  matched_rule?: DownloadRule | null
}

type BrowserBridgeStatus = {
  enabled: boolean
  endpoint: string
  token_set: boolean
  connected: boolean
  message: string
}

type TaskSortKey = 'updated_desc' | 'speed_desc' | 'progress_desc' | 'name_asc'
type TableDensity = 'small' | 'middle' | 'large'
type TableLayout = {
  columnWidths: Record<string, number>
  columnOrder: string[]
  hiddenColumns: string[]
  density: TableDensity
}
type TableLayoutStore = Record<SectionKey, TableLayout>

const LOCALE_KEY = 'flamingo.locale'
const TABLE_LAYOUT_KEY = 'flamingo.table_layout.v1'
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  progress: 180,
  speed: 105,
  eta: 88,
  status: 180,
  actions: 180,
  size: 120,
  completed_at: 180,
}
const DEFAULT_TABLE_LAYOUT: TableLayoutStore = {
  downloading: {
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    columnOrder: ['name', 'progress', 'speed', 'eta', 'status', 'actions'],
    hiddenColumns: [],
    density: 'small',
  },
  downloaded: {
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    columnOrder: ['name', 'size', 'completed_at', 'actions'],
    hiddenColumns: [],
    density: 'small',
  },
}

const I18N: Record<Locale, Record<string, string>> = {
  'en-US': {
    navDownloading: 'Downloading',
    navDownloaded: 'Downloaded',
    newDownload: 'New Download',
    settings: 'Settings',
    refresh: 'Refresh',
    logsWindow: 'Logs',
    darkLight: 'Dark/Light',
    currentDownloads: 'Current Downloads',
    downloadedList: 'Downloaded',
    colName: 'Name',
    colProgress: 'Progress',
    colSpeed: 'Speed',
    colEta: 'ETA',
    colSize: 'Size',
    colCompletedAt: 'Completed At',
    colStatus: 'Status',
    colActions: 'Actions',
    details: 'Details',
    taskDetails: 'Task Details',
    overview: 'Overview',
    runtimeStatus: 'Runtime Status',
    retryLogs: 'Retry Logs',
    noRuntimeStatus: 'No runtime status',
    noRetryLogs: 'No retry-related logs',
    btDiagnostics: 'BT Diagnostics',
    peers: 'Peers',
    seeders: 'Seeders',
    trackers: 'Trackers',
    dropHint: 'Drop URL or .torrent file here',
    search: 'Search',
    searchPlaceholder: 'Search by name / source / task id',
    statusFilter: 'Status',
    categoryFilter: 'Category',
    uncategorized: 'Uncategorized',
    setCategory: 'Set Category',
    clearCategory: 'Clear Category',
    sortBy: 'Sort',
    layoutSettings: 'Layout',
    density: 'Density',
    densityCompact: 'Compact',
    densityDefault: 'Default',
    densityComfortable: 'Comfortable',
    columns: 'Columns',
    moveUp: 'Up',
    moveDown: 'Down',
    queueTop: 'Queue Top',
    queueUp: 'Queue Up',
    queueDown: 'Queue Down',
    queueBottom: 'Queue Bottom',
    showColumn: 'Show',
    filterAll: 'All',
    filterActive: 'Active',
    filterPaused: 'Paused',
    filterQueued: 'Queued',
    filterError: 'Error',
    filterMetadata: 'Metadata',
    filterCompleted: 'Completed',
    sortUpdated: 'Updated (newest)',
    sortSpeed: 'Speed (highest)',
    sortProgress: 'Progress (highest)',
    sortName: 'Name (A-Z)',
    selectedCount: 'Selected',
    batchPause: 'Pause Selected',
    batchResume: 'Resume Selected',
    batchRemove: 'Remove Selected',
    resume: 'Resume',
    pause: 'Pause',
    openDir: 'Open Dir',
    openFile: 'Open File',
    fileSelect: 'Files',
    fileSelectTitle: 'Select Download Files',
    applySelection: 'Apply Selection',
    remove: 'Remove',
    removeConfirm: 'Remove this task?',
    removeWithFiles: 'Also delete downloaded files',
    cancel: 'Cancel',
    addUrlTitle: 'New URL Download',
    addMagnetTitle: 'New Magnet Download',
    addTorrentTitle: 'New Torrent Download',
    tabUrl: 'URL',
    tabMagnet: 'Magnet',
    tabTorrent: 'Torrent',
    add: 'Add',
    url: 'URL',
    magnet: 'Magnet',
    torrentFile: 'Torrent File',
    selectFile: 'Select File',
    saveDirOptional: 'Save Directory (optional)',
    matchedRule: 'Matched Rule',
    noMatchedRule: 'No matched rule (fallback to default)',
    addAdvanced: 'Advanced Options',
    taskPresets: 'Task Presets',
    presetName: 'Preset Name',
    presetSelect: 'Select Preset',
    savePreset: 'Save Preset',
    applyPreset: 'Apply Preset',
    exportPresets: 'Export Presets',
    importPresets: 'Import Presets',
    presetJsonTitle: 'Preset JSON',
    presetJsonPlaceholder: 'Paste preset JSON array here',
    presetSaved: 'Preset saved',
    presetApplied: 'Preset applied',
    presetImported: 'Presets imported',
    presetRequired: 'Please input preset name',
    presetInvalid: 'Invalid preset JSON',
    outName: 'Filename (optional)',
    maxDownloadLimit: 'Per-task Max Download Limit',
    taskMaxConn: 'Per-task Max Connections',
    taskSplit: 'Per-task Split',
    taskMaxUploadLimit: 'Per-task Max Upload Limit',
    seedRatio: 'Seed Ratio',
    seedTime: 'Seed Time (minutes)',
    stopSeeding: 'Stop Seeding',
    userAgent: 'User-Agent',
    referer: 'Referer',
    cookie: 'Cookie',
    extraHeaders: 'Extra Headers',
    extraHeadersPlaceholder: 'One header per line, e.g. Authorization: Bearer xxx',
    urlRequired: 'Please input URL',
    magnetRequired: 'Please input magnet link',
    torrentRequired: 'Please select torrent file',
    addFailedPrefix: 'Add task failed',
    addInvalidType: 'Input does not match current tab. Please switch tab or fix content.',
    taskAdded: 'Task added',
    settingsTitle: 'Settings',
    save: 'Save',
    tabBasic: 'Basic',
    tabDiagnostics: 'Diagnostics',
    startupSelfCheck: 'Startup Self-check',
    tabUpdates: 'Updates',
    grpAppearance: 'Appearance',
    themeMode: 'Theme Mode',
    themeSystem: 'Follow System',
    themeLight: 'Light',
    themeDark: 'Dark',
    grpDownload: 'Download',
    downloadDir: 'Download Directory',
    maxConcurrent: 'Max Concurrent Downloads',
    maxConn: 'Max Connection Per Server',
    maxLimit: 'Max Overall Download Limit',
    btTracker: 'BT Tracker List',
    trackerPresets: 'Tracker Presets',
    grpAria2: 'aria2',
    aria2Path: 'aria2 Binary Path',
    detectAria2: 'Detect aria2 Path',
    browse: 'Browse',
    reload: 'Reload',
    enableUpnp: 'Enable UPnP',
    grpIntegration: 'Integration',
    grpReliability: 'Reliability',
    retryMaxAttempts: 'Retry Max Attempts',
    retryBackoff: 'Retry Backoff (seconds)',
    retryMirrors: 'Fallback Mirror Prefixes',
    metadataTimeout: 'Metadata Timeout (seconds)',
    speedPlan: 'Speed Plan (JSON)',
    trayPrefs: 'Tray / Notification',
    trayPrefsMac: 'Dock / Notification',
    startMinimized: 'Start minimized',
    minimizeToTray: 'Minimize to tray on close',
    minimizeToTrayMac: 'Minimize on close (restore from Dock)',
    trayRecoverHintMac: 'On macOS, restore the app from Dock. Menu bar icon is mainly for quick menu actions.',
    trayDisabledMac: 'Menu bar tray icon is disabled on macOS for reliability.',
    notifyOnComplete: 'Notify when download completes',
    postCompleteAction: 'Post-complete Action',
    postCompleteNone: 'None',
    postCompleteOpenDir: 'Auto Open Folder',
    postCompleteOpenFile: 'Auto Reveal File',
    copyPath: 'Copy Path',
    autoDeleteControlFiles: 'Auto Delete .aria2 Control Files',
    autoClearCompletedDays: 'Auto Clear Completed Records (days, 0=off)',
    resetSettingsDefaults: 'Reset Settings',
    resetUiLayout: 'Reset UI Layout',
    resetSettingsConfirm: 'Reset settings to defaults? This keeps your aria2 path.',
    saveAndFinish: 'Save and Finish',
    setupTitle: 'First Run Setup',
    setupHint: 'Complete basic settings before using Flamingo Downloader.',
    githubCdn: 'GitHub CDN Prefix',
    githubToken: 'GitHub Token',
    bridgeEnabled: 'Browser Bridge Enabled',
    bridgePort: 'Browser Bridge Port',
    bridgeToken: 'Browser Bridge Token',
    bridgeAllowedOrigins: 'Allowed Origins',
    rotateBridgeToken: 'Rotate Token',
    bridgeStatus: 'Bridge Status',
    bridgeCheck: 'Check Bridge',
    bridgeReconnect: 'Reconnect',
    bridgeConnected: 'Connected',
    bridgeDisconnected: 'Disconnected',
    clipboardWatchEnabled: 'Clipboard Watcher',
    clipboardDetectedTitle: 'Clipboard download link detected',
    clipboardDetectedUse: 'Use this link to create a new task?',
    rulesTitle: 'Download Directory Rules',
    importExport: 'Import / Export',
    exportTasks: 'Export Task List',
    importTasks: 'Import Task List',
    importExportTitle: 'Task List Import / Export',
    exportResult: 'Exported JSON',
    importInput: 'Import JSON',
    copy: 'Copy',
    applyImport: 'Apply Import',
    importedResult: 'Imported tasks: {tasks}, files: {files}',
    debugBundleSaved: 'Debug bundle saved: {path}',
    enabled: 'Enabled',
    matcher: 'Matcher',
    pattern: 'Pattern',
    saveDir: 'Save Directory',
    removeRule: 'Remove Rule',
    addRule: 'Add Rule',
    subdirByDate: 'Subdir by Date',
    subdirByDomain: 'Subdir by Domain',
    rpcPing: 'RPC Ping',
    restartAria2: 'Restart aria2',
    startupCheck: 'Startup Check',
    saveSession: 'Save Session',
    statusOk: 'OK',
    statusFail: 'Fail',
    exportDebug: 'Export Debug Bundle',
    checkUpdate: 'Check aria2 Update',
    updateNow: 'Update aria2 Now',
    settingsSaved: 'Settings saved',
    noAria2Detected: 'No aria2 path detected',
    detectedPrefix: 'Detected',
    language: 'Language',
    noEta: '--',
    errorDetails: 'Error details',
    sourceLabel: 'Source',
    taskIdLabel: 'Task ID',
    emptyDownloading: 'No active downloads',
    emptyDownloaded: 'No completed downloads yet',
    emptyHint: 'Create a new task to get started',
  },
  'zh-CN': {
    navDownloading: '下载中',
    navDownloaded: '已下载',
    newDownload: '新建下载',
    settings: '设置',
    refresh: '刷新',
    logsWindow: '日志',
    darkLight: '暗/亮切换',
    currentDownloads: '当前下载',
    downloadedList: '已下载',
    colName: '名称',
    colProgress: '进度',
    colSpeed: '速度',
    colEta: '剩余时间',
    colSize: '大小',
    colCompletedAt: '完成时间',
    colStatus: '状态',
    colActions: '操作',
    details: '详情',
    taskDetails: '任务详情',
    overview: '概览',
    runtimeStatus: '运行状态',
    retryLogs: '重试日志',
    noRuntimeStatus: '暂无运行状态',
    noRetryLogs: '暂无重试相关日志',
    btDiagnostics: 'BT 诊断',
    peers: '节点',
    seeders: '做种者',
    trackers: 'Tracker',
    dropHint: '拖拽 URL 或 .torrent 文件到这里',
    search: '搜索',
    searchPlaceholder: '按名称 / 来源 / 任务ID 搜索',
    statusFilter: '状态',
    categoryFilter: '分类',
    uncategorized: '未分类',
    setCategory: '设置分类',
    clearCategory: '清除分类',
    sortBy: '排序',
    layoutSettings: '布局',
    density: '密度',
    densityCompact: '紧凑',
    densityDefault: '默认',
    densityComfortable: '宽松',
    columns: '列',
    moveUp: '上移',
    moveDown: '下移',
    queueTop: '置顶',
    queueUp: '上移队列',
    queueDown: '下移队列',
    queueBottom: '置底',
    showColumn: '显示',
    filterAll: '全部',
    filterActive: '进行中',
    filterPaused: '已暂停',
    filterQueued: '排队中',
    filterError: '错误',
    filterMetadata: '元数据',
    filterCompleted: '已完成',
    sortUpdated: '更新时间（最新）',
    sortSpeed: '速度（最高）',
    sortProgress: '进度（最高）',
    sortName: '名称（A-Z）',
    selectedCount: '已选',
    batchPause: '批量暂停',
    batchResume: '批量继续',
    batchRemove: '批量删除',
    resume: '继续',
    pause: '暂停',
    openDir: '打开目录',
    openFile: '打开文件',
    fileSelect: '文件选择',
    fileSelectTitle: '选择下载文件',
    applySelection: '应用选择',
    remove: '删除',
    removeConfirm: '确认删除该任务？',
    removeWithFiles: '同时删除已下载文件',
    cancel: '取消',
    addUrlTitle: '新建链接下载',
    addMagnetTitle: '新建磁力下载',
    addTorrentTitle: '新建种子下载',
    tabUrl: '链接',
    tabMagnet: '磁力',
    tabTorrent: '种子',
    add: '添加',
    url: '链接',
    magnet: '磁力链接',
    torrentFile: '种子文件',
    selectFile: '选择文件',
    saveDirOptional: '本次下载目录（可选）',
    matchedRule: '命中规则',
    noMatchedRule: '未命中规则（使用默认目录）',
    addAdvanced: '高级选项',
    taskPresets: '任务预设',
    presetName: '预设名称',
    presetSelect: '选择预设',
    savePreset: '保存预设',
    applyPreset: '应用预设',
    exportPresets: '导出预设',
    importPresets: '导入预设',
    presetJsonTitle: '预设 JSON',
    presetJsonPlaceholder: '在此粘贴预设 JSON 数组',
    presetSaved: '预设已保存',
    presetApplied: '预设已应用',
    presetImported: '预设已导入',
    presetRequired: '请输入预设名称',
    presetInvalid: '预设 JSON 无效',
    outName: '文件名（可选）',
    maxDownloadLimit: '单任务下载限速',
    taskMaxConn: '单任务最大连接数',
    taskSplit: '单任务分段数',
    taskMaxUploadLimit: '单任务上传限速',
    seedRatio: '做种分享率',
    seedTime: '做种时长（分钟）',
    stopSeeding: '停止做种',
    userAgent: 'User-Agent',
    referer: 'Referer',
    cookie: 'Cookie',
    extraHeaders: '额外请求头',
    extraHeadersPlaceholder: '每行一个请求头，例如 Authorization: Bearer xxx',
    urlRequired: '请输入链接',
    magnetRequired: '请输入磁力链接',
    torrentRequired: '请选择种子文件',
    addFailedPrefix: '添加任务失败',
    addInvalidType: '输入内容与当前标签不匹配，请切换标签或修正内容。',
    taskAdded: '任务已添加',
    settingsTitle: '设置',
    save: '保存',
    tabBasic: '基础',
    tabDiagnostics: '诊断',
    startupSelfCheck: '启动自检',
    tabUpdates: '更新',
    grpAppearance: '外观',
    themeMode: '主题模式',
    themeSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    grpDownload: '下载',
    downloadDir: '下载目录',
    maxConcurrent: '最大并发下载数',
    maxConn: '单服务器最大连接数',
    maxLimit: '全局下载限速',
    btTracker: 'BT Tracker 列表',
    trackerPresets: 'Tracker 预设',
    grpAria2: 'aria2',
    aria2Path: 'aria2 可执行文件路径',
    detectAria2: '检测 aria2 路径',
    browse: '浏览',
    reload: '重新加载',
    enableUpnp: '启用 UPnP',
    grpIntegration: '集成',
    grpReliability: '可靠性',
    retryMaxAttempts: '最大重试次数',
    retryBackoff: '重试退避（秒）',
    retryMirrors: '回退镜像前缀',
    metadataTimeout: '元数据超时（秒）',
    speedPlan: '速度计划（JSON）',
    trayPrefs: '托盘 / 通知',
    trayPrefsMac: 'Dock / 通知',
    startMinimized: '启动时最小化',
    minimizeToTray: '关闭时最小化到托盘',
    minimizeToTrayMac: '关闭时最小化（从 Dock 恢复）',
    trayRecoverHintMac: '在 macOS 上建议从 Dock 恢复应用，菜单栏图标主要用于快捷菜单操作。',
    trayDisabledMac: '为保证稳定性，macOS 下默认不使用菜单栏托盘图标。',
    notifyOnComplete: '下载完成时通知',
    postCompleteAction: '完成后动作',
    postCompleteNone: '无',
    postCompleteOpenDir: '自动打开目录',
    postCompleteOpenFile: '自动定位文件',
    copyPath: '复制路径',
    autoDeleteControlFiles: '自动删除 .aria2 控制文件',
    autoClearCompletedDays: '自动清理已完成记录（天，0=关闭）',
    resetSettingsDefaults: '重置设置',
    resetUiLayout: '重置界面布局',
    resetSettingsConfirm: '确认恢复默认设置？会保留 aria2 路径。',
    saveAndFinish: '保存并完成',
    setupTitle: '首次启动设置',
    setupHint: '请先完成基础设置后再开始使用。',
    githubCdn: 'GitHub CDN 前缀',
    githubToken: 'GitHub Token',
    bridgeEnabled: '浏览器桥接启用',
    bridgePort: '浏览器桥接端口',
    bridgeToken: '浏览器桥接令牌',
    bridgeAllowedOrigins: '允许来源',
    rotateBridgeToken: '轮换令牌',
    bridgeStatus: '桥接状态',
    bridgeCheck: '检查连接',
    bridgeReconnect: '重连',
    bridgeConnected: '已连接',
    bridgeDisconnected: '未连接',
    clipboardWatchEnabled: '剪贴板监听',
    clipboardDetectedTitle: '检测到下载链接',
    clipboardDetectedUse: '是否使用该链接创建新任务？',
    rulesTitle: '下载目录规则',
    importExport: '导入 / 导出',
    exportTasks: '导出任务列表',
    importTasks: '导入任务列表',
    importExportTitle: '任务列表导入 / 导出',
    exportResult: '导出 JSON',
    importInput: '导入 JSON',
    copy: '复制',
    applyImport: '执行导入',
    importedResult: '已导入任务: {tasks}，文件: {files}',
    debugBundleSaved: '调试包已保存: {path}',
    enabled: '启用',
    matcher: '匹配器',
    pattern: '匹配模式',
    saveDir: '保存目录',
    removeRule: '删除规则',
    addRule: '添加规则',
    subdirByDate: '按日期子目录',
    subdirByDomain: '按域名子目录',
    rpcPing: 'RPC 探测',
    restartAria2: '重启 aria2',
    startupCheck: '启动检查',
    saveSession: '保存会话',
    statusOk: '正常',
    statusFail: '异常',
    exportDebug: '导出调试包',
    checkUpdate: '检查 aria2 更新',
    updateNow: '立即更新 aria2',
    settingsSaved: '设置已保存',
    noAria2Detected: '未检测到 aria2 路径',
    detectedPrefix: '已检测',
    language: '语言',
    noEta: '--',
    errorDetails: '错误详情',
    sourceLabel: '来源',
    taskIdLabel: '任务ID',
    emptyDownloading: '当前没有下载任务',
    emptyDownloaded: '还没有已完成任务',
    emptyHint: '新建一个下载任务开始使用',
  },
}

function detectLocale(): Locale {
  const langs = Array.isArray(navigator.languages) ? navigator.languages : []
  for (const l of langs) {
    const x = String(l || '').toLowerCase()
    if (x.startsWith('zh')) return 'zh-CN'
    if (x.startsWith('en')) return 'en-US'
  }
  const single = String(navigator.language || '').toLowerCase()
  if (single.startsWith('zh')) return 'zh-CN'
  return 'en-US'
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function normalizeThemeMode(v: unknown): ThemeMode {
  const x = String(v || '').toLowerCase()
  if (x === 'light' || x === 'dark') return x
  return 'system'
}

function fmtBytes(n: number): string {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let value = n
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function fmtEta(remainingBytes: number, speedBytesPerSec: number, fallback: string): string {
  if (remainingBytes <= 0) return '0s'
  if (speedBytesPerSec <= 0) return fallback
  const total = Math.floor(remainingBytes / speedBytesPerSec)
  if (total <= 0) return '1s'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtDateTime(ts?: number): string {
  if (!ts || ts <= 0) return '-'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

function fmtTime(ts?: number): string {
  if (!ts || ts <= 0) return '-'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString()
}

function i18nFormat(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

function detectAddSource(text: string): { kind: 'url' | 'magnet'; value: string } | null {
  const v = String(text || '').trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower.startsWith('magnet:?')) return { kind: 'magnet', value: v }
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('ftp://') ||
    lower.startsWith('ftps://')
  ) {
    return { kind: 'url', value: v }
  }
  return null
}

function statusColor(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'active') return 'processing'
  if (s === 'paused') return 'warning'
  if (s === 'completed') return 'success'
  if (s === 'error') return 'error'
  if (s === 'metadata') return 'purple'
  return 'default'
}

function parseErr(err: unknown): string {
  return String((err as Error)?.message || err)
}

function defaultLayoutFor(section: SectionKey): TableLayout {
  const d = DEFAULT_TABLE_LAYOUT[section]
  return {
    columnWidths: { ...d.columnWidths },
    columnOrder: [...d.columnOrder],
    hiddenColumns: [...d.hiddenColumns],
    density: d.density,
  }
}

function sanitizeLayout(section: SectionKey, raw: unknown): TableLayout {
  const base = defaultLayoutFor(section)
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Partial<TableLayout>
  const widths = { ...base.columnWidths, ...(obj.columnWidths || {}) }
  const allowed = new Set(base.columnOrder)
  const order = Array.isArray(obj.columnOrder)
    ? obj.columnOrder.filter((k): k is string => typeof k === 'string' && allowed.has(k))
    : []
  const mergedOrder = [...order, ...base.columnOrder.filter((k) => !order.includes(k))]
  const hiddenColumns = Array.isArray(obj.hiddenColumns)
    ? obj.hiddenColumns.filter((k): k is string => typeof k === 'string' && allowed.has(k))
    : []
  const density: TableDensity =
    obj.density === 'middle' || obj.density === 'large' || obj.density === 'small'
      ? obj.density
      : base.density
  return {
    columnWidths: widths,
    columnOrder: mergedOrder,
    hiddenColumns,
    density,
  }
}

function loadTableLayoutStore(): TableLayoutStore {
  try {
    const raw = localStorage.getItem(TABLE_LAYOUT_KEY)
    if (!raw) {
      return {
        downloading: defaultLayoutFor('downloading'),
        downloaded: defaultLayoutFor('downloaded'),
      }
    }
    const parsed = JSON.parse(raw) as Partial<TableLayoutStore>
    return {
      downloading: sanitizeLayout('downloading', parsed?.downloading),
      downloaded: sanitizeLayout('downloaded', parsed?.downloaded),
    }
  } catch {
    return {
      downloading: defaultLayoutFor('downloading'),
      downloaded: defaultLayoutFor('downloaded'),
    }
  }
}

type ResizeableHeaderProps = React.HTMLAttributes<HTMLElement> & {
  onResize?: (e: unknown, data: { size: { width: number; height: number } }) => void
  width?: number
}

function ResizableTitle(props: ResizeableHeaderProps) {
  const { onResize, width, ...rest } = props
  if (!width) {
    return <th {...rest} />
  }
  return (
    <Resizable
      width={width}
      height={0}
      handle={<span className="resize-handle" onClick={(e) => e.stopPropagation()} />}
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...rest} />
    </Resizable>
  )
}

export default function App() {
  const [msg, msgCtx] = message.useMessage({
    top: 72,
    duration: 1.8,
    maxCount: 2,
  })
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY)
    return saved === 'zh-CN' || saved === 'en-US' ? saved : detectLocale()
  })

  const t = useCallback((k: string) => I18N[locale][k] || k, [locale])
  const isMac = useMemo(
    () =>
      /mac|iphone|ipad|ipod/i.test(
        `${navigator.platform || ''} ${navigator.userAgent || ''}`,
      ),
    [],
  )

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const [tasks, setTasks] = useState<Task[]>([])
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [loading, setLoading] = useState(false)
  const [section, setSection] = useState<SectionKey>('downloading')
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState<TaskSortKey>('updated_desc')
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [tableLayouts, setTableLayouts] = useState<TableLayoutStore>(() => loadTableLayoutStore())
  const [layoutOpen, setLayoutOpen] = useState(false)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [tableWrapWidth, setTableWrapWidth] = useState(0)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false)
  const [removeTask, setRemoveTask] = useState<Task | null>(null)
  const [removeTaskIds, setRemoveTaskIds] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('basic')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'url' | 'magnet' | 'torrent'>('url')
  const [addTorrentFile, setAddTorrentFile] = useState<File | null>(null)
  const [addMatchedRule, setAddMatchedRule] = useState<DownloadRule | null>(null)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [taskOptionPresets, setTaskOptionPresets] = useState<TaskOptionPreset[]>([])
  const [presetJsonOpen, setPresetJsonOpen] = useState(false)
  const [presetJsonText, setPresetJsonText] = useState('')
  const [diagnosticsText, setDiagnosticsText] = useState('')
  const [startupSummary, setStartupSummary] = useState<StartupSelfCheck | null>(null)
  const [updateText, setUpdateText] = useState('')
  const [appUpdateStrategyText, setAppUpdateStrategyText] = useState('')
  const [bridgeStatus, setBridgeStatus] = useState<BrowserBridgeStatus | null>(null)
  const [bridgeChecking, setBridgeChecking] = useState(false)
  const [ioOpen, setIoOpen] = useState(false)
  const [exportJsonText, setExportJsonText] = useState('')
  const [importJsonText, setImportJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [detailCategoryInput, setDetailCategoryInput] = useState('')
  const [detailFiles, setDetailFiles] = useState<TaskFile[]>([])
  const [detailRuntimeText, setDetailRuntimeText] = useState('')
  const [detailBtSummary, setDetailBtSummary] = useState('')
  const [detailRetryLogs, setDetailRetryLogs] = useState<OperationLog[]>([])
  const [dragHover, setDragHover] = useState(false)
  const [clipboardWatchEnabled, setClipboardWatchEnabled] = useState(false)
  const [notifyOnCompleteEnabled, setNotifyOnCompleteEnabled] = useState(true)
  const [postCompleteAction, setPostCompleteAction] = useState<'none' | 'open_dir' | 'open_file'>('none')
  const lastClipboardRef = useRef('')
  const clipboardPromptingRef = useRef(false)
  const prevTaskStatusRef = useRef<Record<string, string>>({})
  const [firstRunOpen, setFirstRunOpen] = useState(false)
  const [fileSelectOpen, setFileSelectOpen] = useState(false)
  const [fileSelectTaskId, setFileSelectTaskId] = useState<string | null>(null)
  const [fileSelectRows, setFileSelectRows] = useState<TaskFile[]>([])
  const [selectedFileIndexes, setSelectedFileIndexes] = useState<number[]>([])
  const [fileSelectLoading, setFileSelectLoading] = useState(false)

  const [settingsForm] = Form.useForm<GlobalSettings>()
  const [addForm] = Form.useForm<AddFormValues>()
  const currentLayout = tableLayouts[section] || defaultLayoutFor(section)
  const columnWidths = currentLayout.columnWidths

  useEffect(() => {
    localStorage.setItem(TABLE_LAYOUT_KEY, JSON.stringify(tableLayouts))
  }, [tableLayouts])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await invoke<Task[]>('list_tasks', { status: null, limit: 500, offset: 0 })
      setTasks(Array.isArray(list) ? list : [])
    } catch (err) {
      msg.error(parseErr(err))
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [msg])

  const loadSettings = useCallback(async () => {
    try {
      const s = await invoke<GlobalSettings>('get_global_settings')
      const mode = normalizeThemeMode(s?.ui_theme)
      setThemeMode(mode)
      settingsForm.setFieldsValue({
        aria2_bin_path: s?.aria2_bin_path || undefined,
        download_dir: s?.download_dir || undefined,
        max_concurrent_downloads: s?.max_concurrent_downloads ?? undefined,
        max_connection_per_server: s?.max_connection_per_server ?? undefined,
        max_overall_download_limit: s?.max_overall_download_limit || undefined,
        bt_tracker: s?.bt_tracker || undefined,
        github_cdn: s?.github_cdn || undefined,
        github_token: s?.github_token || undefined,
        enable_upnp: s?.enable_upnp ?? undefined,
        ui_theme: mode,
        browser_bridge_enabled: s?.browser_bridge_enabled ?? undefined,
        browser_bridge_port: s?.browser_bridge_port ?? undefined,
        browser_bridge_token: s?.browser_bridge_token || undefined,
        browser_bridge_allowed_origins: s?.browser_bridge_allowed_origins || undefined,
        clipboard_watch_enabled: s?.clipboard_watch_enabled ?? undefined,
        download_dir_rules: Array.isArray(s?.download_dir_rules) ? s.download_dir_rules : [],
        retry_max_attempts: s?.retry_max_attempts ?? undefined,
        retry_backoff_secs: s?.retry_backoff_secs ?? undefined,
        retry_fallback_mirrors: s?.retry_fallback_mirrors || undefined,
        metadata_timeout_secs: s?.metadata_timeout_secs ?? undefined,
        speed_plan: s?.speed_plan || undefined,
        post_complete_action: s?.post_complete_action || 'none',
        auto_delete_control_files: s?.auto_delete_control_files ?? undefined,
        auto_clear_completed_days: s?.auto_clear_completed_days ?? undefined,
        first_run_done: s?.first_run_done ?? undefined,
        start_minimized: s?.start_minimized ?? undefined,
        minimize_to_tray: s?.minimize_to_tray ?? undefined,
        notify_on_complete: s?.notify_on_complete ?? undefined,
      })
      if (s?.first_run_done !== true) {
        setFirstRunOpen(true)
      }
      setClipboardWatchEnabled(Boolean(s?.clipboard_watch_enabled))
      setNotifyOnCompleteEnabled(s?.notify_on_complete !== false)
      setPostCompleteAction(
        s?.post_complete_action === 'open_dir' || s?.post_complete_action === 'open_file'
          ? s.post_complete_action
          : 'none',
      )
      const presets = (() => {
        try {
          const raw = String(s?.task_option_presets || '[]')
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return [] as TaskOptionPreset[]
          return parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
              name: String((item as TaskOptionPreset).name || '').trim(),
              task_type: String((item as TaskOptionPreset).task_type || '') as AddPresetTaskType,
              options: (item as TaskOptionPreset).options || {},
            }))
            .filter(
              (item) =>
                item.name &&
                (item.task_type === 'http' || item.task_type === 'magnet' || item.task_type === 'torrent'),
            )
        } catch {
          return [] as TaskOptionPreset[]
        }
      })()
      setTaskOptionPresets(presets)
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, settingsForm])

  const currentAddTaskType = useMemo<AddPresetTaskType>(
    () => (addType === 'url' ? 'http' : addType),
    [addType],
  )

  const presetOptionsForCurrentType = useMemo(
    () => taskOptionPresets.filter((preset) => preset.task_type === currentAddTaskType),
    [currentAddTaskType, taskOptionPresets],
  )

  const loadDiagnostics = useCallback(async () => {
    try {
      const d = await invoke('get_diagnostics')
      setDiagnosticsText(JSON.stringify(d, null, 2))
      const summary = await invoke<StartupSelfCheck>('startup_self_check_summary')
      setStartupSummary(summary)
    } catch (err) {
      setDiagnosticsText(parseErr(err))
      setStartupSummary(null)
    }
  }, [])

  const loadUpdateInfo = useCallback(async () => {
    try {
      const d = await invoke('check_aria2_update')
      setUpdateText(JSON.stringify(d, null, 2))
      const s = await invoke('get_app_update_strategy')
      setAppUpdateStrategyText(JSON.stringify(s, null, 2))
    } catch (err) {
      setUpdateText(parseErr(err))
    }
  }, [])

  const checkBridgeStatus = useCallback(async () => {
    setBridgeChecking(true)
    try {
      const status = await invoke<BrowserBridgeStatus>('check_browser_bridge_status')
      setBridgeStatus(status)
    } catch (err) {
      setBridgeStatus({
        enabled: false,
        endpoint: '',
        token_set: false,
        connected: false,
        message: parseErr(err),
      })
    } finally {
      setBridgeChecking(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    loadSettings()
    const timer = setInterval(refresh, 2500)
    return () => clearInterval(timer)
  }, [refresh, loadSettings])

  useEffect(() => {
    const checkStartupNotice = async () => {
      try {
        const notice = await invoke<StartupNotice | null>('consume_startup_notice')
        if (!notice?.message) return
        const level = String(notice.level || 'info').toLowerCase()
        if (level === 'warning') msg.warning(notice.message, 2.5)
        else if (level === 'error') msg.error(notice.message, 3)
        else msg.success(notice.message, 2.2)
      } catch {
        // ignore startup notice failures
      }
    }
    void checkStartupNotice()
  }, [msg])

  useEffect(() => {
    if (!clipboardWatchEnabled) return
    let cancelled = false
    const checkClipboard = async () => {
      if (cancelled || document.hidden || clipboardPromptingRef.current) return
      try {
        const text = String((await readClipboardText()) || '').trim()
        if (!text || text === lastClipboardRef.current) return
        lastClipboardRef.current = text
        const inferred = detectAddSource(text)
        if (!inferred) return
        clipboardPromptingRef.current = true
        Modal.confirm({
          title: t('clipboardDetectedTitle'),
          content: `${inferred.value}\n\n${t('clipboardDetectedUse')}`,
          onOk: async () => {
            try {
              await openAddFromDetected(inferred)
            } finally {
              clipboardPromptingRef.current = false
            }
          },
          onCancel: () => {
            clipboardPromptingRef.current = false
          },
        })
      } catch {
        // ignore clipboard read errors
      }
    }
    const timer = setInterval(checkClipboard, 2500)
    void checkClipboard()
    return () => {
      cancelled = true
      clearInterval(timer)
      clipboardPromptingRef.current = false
    }
  }, [clipboardWatchEnabled, t])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (themeMode === 'system') setThemeMode('system')
    }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [themeMode])

  useEffect(() => {
    const prev = prevTaskStatusRef.current
    const next: Record<string, string> = {}
    for (const task of tasks) {
      const status = String(task.status || '').toLowerCase()
      next[task.id] = status
      const prevStatus = prev[task.id]
      if (!notifyOnCompleteEnabled || !prevStatus || prevStatus === status) continue
      if (status === 'completed') {
        if (postCompleteAction === 'open_dir') {
          void invoke('open_task_dir', { taskId: task.id })
        } else if (postCompleteAction === 'open_file') {
          void invoke('open_task_file', { taskId: task.id })
        }
        notification.success({
          message: `${t('taskDetails')}: ${task.name || task.id}`,
          description: t('filterCompleted'),
          btn: (
            <Space>
              <Button
                size="small"
                onClick={() => {
                  void invoke('open_task_dir', { taskId: task.id })
                }}
              >
                {t('openDir')}
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  void invoke('open_task_file', { taskId: task.id })
                }}
              >
                {t('openFile')}
              </Button>
            </Space>
          ),
          duration: 6,
        })
      } else if (status === 'error') {
        notification.error({
          message: `${t('taskDetails')}: ${task.name || task.id}`,
          description: task.error_message || t('filterError'),
          duration: 8,
        })
      }
    }
    prevTaskStatusRef.current = next
  }, [notifyOnCompleteEnabled, postCompleteAction, t, tasks])

  useEffect(() => {
    const active = tasks.filter((task) => {
      const s = String(task.status || '').toLowerCase()
      return s !== 'completed' && s !== 'error'
    }).length
    const completed = tasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length
    const error = tasks.filter((task) => String(task.status || '').toLowerCase() === 'error').length
    const badge = active + error
    const win = getCurrentWindow()
    void win.setBadgeCount(badge > 0 ? badge : undefined).catch(() => {})
    void win.setBadgeLabel(error > 0 ? `E${error}` : undefined).catch(() => {})
    document.title = `Flamingo Downloader (${active}/${completed}/${error})`
  }, [tasks])

  useEffect(() => {
    const el = tableWrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setTableWrapWidth(Math.floor(el.clientWidth || 0))
    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [settingsOpen])

  const effectiveTheme = resolveTheme(themeMode)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const task of tasks) {
      const c = String(task.category || '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [tasks])

  const list = useMemo(
    () => {
      const bySection = tasks.filter((task) =>
        section === 'downloaded' ? task.status === 'completed' : task.status !== 'completed',
      )
      const filtered = bySection.filter((task) => {
        const status = String(task.status || '').toLowerCase()
        if (statusFilter !== 'all' && status !== statusFilter) return false
        const category = String(task.category || '').trim()
        if (categoryFilter === '__uncategorized__' && category) return false
        if (categoryFilter !== 'all' && categoryFilter !== '__uncategorized__' && category !== categoryFilter)
          return false
        const query = searchText.trim().toLowerCase()
        if (!query) return true
        const text = `${task.name || ''} ${task.source || ''} ${task.id || ''}`.toLowerCase()
        return text.includes(query)
      })
      const progressValue = (task: Task) =>
        task.total_length > 0 ? task.completed_length / Math.max(task.total_length, 1) : 0
      filtered.sort((a, b) => {
        if (sortBy === 'name_asc') {
          return String(a.name || a.source || a.id).localeCompare(String(b.name || b.source || b.id))
        }
        if (sortBy === 'speed_desc') {
          return Number(b.download_speed || 0) - Number(a.download_speed || 0)
        }
        if (sortBy === 'progress_desc') {
          return progressValue(b) - progressValue(a)
        }
        return Number(b.updated_at || 0) - Number(a.updated_at || 0)
      })
      return filtered
    },
    [categoryFilter, searchText, section, sortBy, statusFilter, tasks],
  )
  const useVirtualTable = list.length > 150
  const onRowSelectionChange = useCallback((keys: React.Key[]) => {
    setSelectedTaskIds(keys.map((k) => String(k)))
  }, [])

  useEffect(() => {
    const visibleIds = new Set(list.map((task) => task.id))
    setSelectedTaskIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [list])

  const quickToggleTheme = async () => {
    const next = effectiveTheme === 'dark' ? 'light' : 'dark'
    setThemeMode(next)
    settingsForm.setFieldValue('ui_theme', next)
    try {
      await invoke('set_global_settings', { settings: { ui_theme: next } })
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onPauseResume = async (task: Task) => {
    try {
      if (String(task.status).toLowerCase() === 'paused') await invoke('resume_task', { taskId: task.id })
      else await invoke('pause_task', { taskId: task.id })
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onStopSeeding = async (task: Task) => {
    try {
      await invoke('stop_seeding', { taskId: task.id })
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onMoveTaskPosition = async (task: Task, action: 'top' | 'up' | 'down' | 'bottom') => {
    try {
      await invoke('move_task_position', { taskId: task.id, action })
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onRequestRemove = (task: Task) => {
    setRemoveTask(task)
    setRemoveTaskIds([task.id])
    setRemoveDeleteFiles(false)
    setRemoveDialogOpen(true)
  }

  const onRequestBatchRemove = () => {
    if (selectedTaskIds.length === 0) return
    const first = list.find((task) => task.id === selectedTaskIds[0]) || null
    setRemoveTask(first)
    setRemoveTaskIds(selectedTaskIds.slice())
    setRemoveDeleteFiles(false)
    setRemoveDialogOpen(true)
  }

  const onRemove = async () => {
    if (removeTaskIds.length === 0) return
    try {
      for (const taskId of removeTaskIds) {
        await invoke('remove_task', { taskId, deleteFiles: removeDeleteFiles })
      }
      await refresh()
      setRemoveDialogOpen(false)
      setRemoveTask(null)
      setRemoveTaskIds([])
      setSelectedTaskIds([])
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onBatchPause = async () => {
    try {
      for (const taskId of selectedTaskIds) {
        const task = list.find((x) => x.id === taskId)
        if (!task) continue
        if (String(task.status).toLowerCase() !== 'completed') {
          await invoke('pause_task', { taskId })
        }
      }
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onBatchResume = async () => {
    try {
      for (const taskId of selectedTaskIds) {
        const task = list.find((x) => x.id === taskId)
        if (!task) continue
        if (String(task.status).toLowerCase() !== 'completed') {
          await invoke('resume_task', { taskId })
        }
      }
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onOpenFile = async (task: Task) => {
    try {
      await invoke('open_task_file', { taskId: task.id })
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onOpenDir = async (task: Task) => {
    try {
      await invoke('open_task_dir', { taskId: task.id })
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onCopyPath = async (task: Task) => {
    try {
      const path = await invoke<string>('get_task_primary_path', { taskId: task.id })
      await writeClipboardText(String(path || ''))
      msg.success(t('copy'))
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onOpenFileSelection = async (task: Task) => {
    try {
      setFileSelectLoading(true)
      const detail = await invoke<{ task: Task; files: TaskFile[] }>('get_task_detail', {
        taskId: task.id,
      })
      const files = Array.isArray(detail?.files) ? detail.files : []
      setFileSelectTaskId(task.id)
      setFileSelectRows(files)
      const indexes = files
        .map((f, idx) => ({ idx, selected: !!f.selected }))
        .filter((x) => x.selected)
        .map((x) => x.idx)
      setSelectedFileIndexes(indexes)
      setFileSelectOpen(true)
    } catch (err) {
      msg.error(parseErr(err))
    } finally {
      setFileSelectLoading(false)
    }
  }

  const onOpenTaskDetail = async (task: Task) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailTask(task)
    setDetailCategoryInput(String(task.category || ''))
    setDetailFiles([])
    setDetailRuntimeText('')
    setDetailBtSummary('')
    setDetailRetryLogs([])
    try {
      const detail = await invoke<{ task: Task; files: TaskFile[] }>('get_task_detail', {
        taskId: task.id,
      })
      setDetailTask(detail?.task || task)
      setDetailCategoryInput(String((detail?.task || task)?.category || ''))
      setDetailFiles(Array.isArray(detail?.files) ? detail.files : [])
      try {
        const runtime = await invoke<unknown>('get_task_runtime_status', { taskId: task.id })
        setDetailRuntimeText(JSON.stringify(runtime ?? {}, null, 2))
        const asObj = runtime as {
          summary?: { peers_count?: number; seeders_count?: number; trackers_count?: number }
        }
        const peers = Number(asObj?.summary?.peers_count || 0)
        const seeders = Number(asObj?.summary?.seeders_count || 0)
        const trackers = Number(asObj?.summary?.trackers_count || 0)
        if (peers > 0 || seeders > 0 || trackers > 0) {
          setDetailBtSummary(
            `${t('btDiagnostics')}: ${t('peers')} ${peers} / ${t('seeders')} ${seeders} / ${t('trackers')} ${trackers}`,
          )
        } else {
          setDetailBtSummary('')
        }
      } catch {
        setDetailRuntimeText('')
        setDetailBtSummary('')
      }
      const logs = await invoke<OperationLog[]>('list_operation_logs', { limit: 500 })
      const gid = detail?.task?.aria2_gid || task.aria2_gid || ''
      const related = (Array.isArray(logs) ? logs : []).filter((log) => {
        const text = `${log.action || ''} ${log.message || ''}`
        return (
          text.includes(task.id) ||
          (!!gid && text.includes(gid)) ||
          String(log.action || '').includes('retry')
        )
      })
      setDetailRetryLogs(related)
    } catch (err) {
      msg.error(parseErr(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const onSaveTaskCategory = async () => {
    if (!detailTask?.id) return
    try {
      const value = String(detailCategoryInput || '').trim()
      await invoke('set_task_category', {
        taskId: detailTask.id,
        category: value || null,
      })
      setDetailTask((prev) => (prev ? { ...prev, category: value || null } : prev))
      await refresh()
      msg.success(t('settingsSaved'))
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onApplyFileSelection = async () => {
    if (!fileSelectTaskId) return
    try {
      await invoke('set_task_file_selection', {
        taskId: fileSelectTaskId,
        selectedIndexes: selectedFileIndexes,
      })
      setFileSelectOpen(false)
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onOpenAdd = async () => {
    setAddOpen(true)
    setAddType('url')
    setAddTorrentFile(null)
    setAddMatchedRule(null)
    addForm.setFieldsValue({
      url: '',
      magnet: '',
      save_dir: '',
      preset_name: '',
      preset_selected: undefined,
      out: '',
      max_download_limit: '',
      max_upload_limit: '',
      seed_ratio: undefined,
      seed_time: undefined,
      max_connection_per_server: undefined,
      split: undefined,
      user_agent: '',
      referer: '',
      cookie: '',
      headers_text: '',
    })
    try {
      await suggestAndSetSaveDir('http', null)
    } catch {}
  }

  const openAddFromDetected = async (inferred: { kind: 'url' | 'magnet'; value: string }) => {
    await onOpenAdd()
    if (inferred.kind === 'magnet') {
      setAddType('magnet')
      addForm.setFieldValue('magnet', inferred.value)
      try {
        await suggestAndSetSaveDir('magnet', inferred.value)
      } catch {}
    } else {
      setAddType('url')
      addForm.setFieldValue('url', inferred.value)
      try {
        await suggestAndSetSaveDir('http', inferred.value)
      } catch {}
    }
  }

  const onDropToAdd = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragHover(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length > 0) {
      const file = files[0]
      if (String(file.name || '').toLowerCase().endsWith('.torrent')) {
        await onOpenAdd()
        setAddType('torrent')
        setAddTorrentFile(file)
        try {
          await suggestAndSetSaveDir('torrent', file.name)
        } catch {}
      }
      return
    }

    const plain = String(e.dataTransfer?.getData('text/plain') || '').trim()
    const inferred = detectAddSource(plain)
    if (!inferred) return
    await openAddFromDetected(inferred)
  }

  const buildAddOptionPayload = (values: AddFormValues) => {
    const headerLines = String(values.headers_text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const cookie = String(values.cookie || '').trim()
    if (cookie) headerLines.push(`Cookie: ${cookie}`)
    return {
      save_dir: values.save_dir || null,
      out: String(values.out || '').trim() || null,
      max_download_limit: String(values.max_download_limit || '').trim() || null,
      max_upload_limit: String(values.max_upload_limit || '').trim() || null,
      seed_ratio: values.seed_ratio ?? null,
      seed_time: values.seed_time ?? null,
      max_connection_per_server: values.max_connection_per_server ?? null,
      split: values.split ?? null,
      user_agent: String(values.user_agent || '').trim() || null,
      referer: String(values.referer || '').trim() || null,
      headers: headerLines,
    }
  }

  const onSaveCurrentPreset = async () => {
    const values = addForm.getFieldsValue()
    const presetName = String(values.preset_name || '').trim()
    if (!presetName) {
      msg.warning(t('presetRequired'))
      return
    }
    const optionPayload = buildAddOptionPayload(values)
    const next = taskOptionPresets.filter(
      (preset) => !(preset.task_type === currentAddTaskType && preset.name === presetName),
    )
    next.push({
      name: presetName,
      task_type: currentAddTaskType,
      options: {
        out: optionPayload.out,
        max_download_limit: optionPayload.max_download_limit,
        max_upload_limit: optionPayload.max_upload_limit,
        seed_ratio: optionPayload.seed_ratio,
        seed_time: optionPayload.seed_time,
        max_connection_per_server: optionPayload.max_connection_per_server,
        split: optionPayload.split,
        user_agent: optionPayload.user_agent,
        referer: optionPayload.referer,
        headers: optionPayload.headers,
      },
    })
    setTaskOptionPresets(next)
    await invoke('set_global_settings', {
      settings: { task_option_presets: JSON.stringify(next) },
    })
    msg.success(t('presetSaved'))
  }

  const onApplySelectedPreset = async () => {
    const selectedName = String(addForm.getFieldValue('preset_selected') || '').trim()
    if (!selectedName) return
    const preset = taskOptionPresets.find(
      (item) => item.task_type === currentAddTaskType && item.name === selectedName,
    )
    if (!preset) return
    const headers = Array.isArray(preset.options.headers) ? preset.options.headers : []
    const cookieHeader = headers.find((line) => /^cookie:/i.test(String(line || '')))
    const cookie = cookieHeader ? String(cookieHeader).replace(/^cookie:\s*/i, '') : ''
    const remainingHeaders = headers.filter((line) => !/^cookie:/i.test(String(line || '')))
    addForm.setFieldsValue({
      out: preset.options.out || '',
      max_download_limit: preset.options.max_download_limit || '',
      max_upload_limit: preset.options.max_upload_limit || '',
      seed_ratio: preset.options.seed_ratio ?? undefined,
      seed_time: preset.options.seed_time ?? undefined,
      max_connection_per_server: preset.options.max_connection_per_server ?? undefined,
      split: preset.options.split ?? undefined,
      user_agent: preset.options.user_agent || '',
      referer: preset.options.referer || '',
      cookie,
      headers_text: remainingHeaders.join('\n'),
    })
    msg.success(t('presetApplied'))
  }

  const onExportPresets = () => {
    setPresetJsonText(JSON.stringify(taskOptionPresets, null, 2))
    setPresetJsonOpen(true)
  }

  const onImportPresets = () => {
    setPresetJsonText('')
    setPresetJsonOpen(true)
  }

  const onApplyPresetJson = async () => {
    try {
      const parsed = JSON.parse(String(presetJsonText || '[]'))
      if (!Array.isArray(parsed)) {
        throw new Error('invalid')
      }
      const normalized = parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          name: String((item as TaskOptionPreset).name || '').trim(),
          task_type: String((item as TaskOptionPreset).task_type || '') as AddPresetTaskType,
          options: (item as TaskOptionPreset).options || {},
        }))
        .filter(
          (item) =>
            item.name &&
            (item.task_type === 'http' || item.task_type === 'magnet' || item.task_type === 'torrent'),
        )
      setTaskOptionPresets(normalized)
      await invoke('set_global_settings', {
        settings: { task_option_presets: JSON.stringify(normalized) },
      })
      setPresetJsonOpen(false)
      msg.success(t('presetImported'))
    } catch {
      msg.error(t('presetInvalid'))
    }
  }

  const onAddUrl = async () => {
    try {
      const values = await addForm.validateFields()
      const urlValue = String(values.url || '').trim()
      const magnetValue = String(values.magnet || '').trim()
      const optionPayload = buildAddOptionPayload(values)
      if (addType === 'url' && detectAddSource(urlValue)?.kind === 'magnet') {
        throw new Error(t('addInvalidType'))
      }
      if (addType === 'magnet' && detectAddSource(magnetValue)?.kind === 'url') {
        throw new Error(t('addInvalidType'))
      }

      setAddSubmitting(true)
      if (addType === 'url') {
        await invoke('add_url', {
          url: urlValue,
          options: optionPayload,
        })
      } else if (addType === 'magnet') {
        await invoke('add_magnet', {
          magnet: magnetValue,
          options: optionPayload,
        })
      } else {
        if (!addTorrentFile) throw new Error(t('torrentRequired'))
        const buf = await addTorrentFile.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
        await invoke('add_torrent', {
          torrentFilePath: null,
          torrentBase64: btoa(binary),
          options: optionPayload,
        })
      }
      msg.success(t('taskAdded'))
      setAddOpen(false)
      await refresh()
    } catch (err) {
      const e = err as { errorFields?: unknown[]; message?: string }
      if (Array.isArray(e?.errorFields) && e.errorFields.length > 0) return
      msg.error(`${t('addFailedPrefix')}: ${parseErr(err)}`)
    } finally {
      setAddSubmitting(false)
    }
  }

  const saveSettings = async () => {
    const values = await settingsForm.validateFields()
    setSettingsSaving(true)
    try {
      const payload: GlobalSettings = {
        aria2_bin_path: values.aria2_bin_path || null,
        download_dir: values.download_dir || null,
        max_concurrent_downloads: values.max_concurrent_downloads ?? null,
        max_connection_per_server: values.max_connection_per_server ?? null,
        max_overall_download_limit: values.max_overall_download_limit || null,
        bt_tracker: values.bt_tracker || null,
        github_cdn: values.github_cdn || null,
        github_token: values.github_token || null,
        enable_upnp: values.enable_upnp ?? null,
        ui_theme: normalizeThemeMode(values.ui_theme),
        browser_bridge_enabled: values.browser_bridge_enabled ?? null,
        browser_bridge_port: values.browser_bridge_port ?? null,
        browser_bridge_token: values.browser_bridge_token || null,
        browser_bridge_allowed_origins: values.browser_bridge_allowed_origins || null,
        clipboard_watch_enabled: values.clipboard_watch_enabled ?? null,
        retry_max_attempts: values.retry_max_attempts ?? null,
        retry_backoff_secs: values.retry_backoff_secs ?? null,
        retry_fallback_mirrors: values.retry_fallback_mirrors || null,
        metadata_timeout_secs: values.metadata_timeout_secs ?? null,
        speed_plan: values.speed_plan || null,
        task_option_presets: JSON.stringify(taskOptionPresets),
        post_complete_action: values.post_complete_action || 'none',
        auto_delete_control_files: values.auto_delete_control_files ?? true,
        auto_clear_completed_days: values.auto_clear_completed_days ?? 0,
        first_run_done: values.first_run_done ?? null,
        start_minimized: values.start_minimized ?? null,
        minimize_to_tray: values.minimize_to_tray ?? null,
        notify_on_complete: values.notify_on_complete ?? null,
        download_dir_rules: (values.download_dir_rules || []).filter(
          (r) => r && String(r.pattern || '').trim() && String(r.save_dir || '').trim(),
        ),
      }
      await invoke('set_global_settings', { settings: payload })
      setPostCompleteAction(
        payload.post_complete_action === 'open_dir' || payload.post_complete_action === 'open_file'
          ? payload.post_complete_action
          : 'none',
      )
      setThemeMode(normalizeThemeMode(payload.ui_theme))
      msg.success(t('settingsSaved'))
      await Promise.all([loadSettings(), loadDiagnostics(), loadUpdateInfo()])
    } catch (err) {
      msg.error(parseErr(err))
    } finally {
      setSettingsSaving(false)
    }
  }

  const completeFirstRun = async () => {
    try {
      const values = await settingsForm.validateFields()
      const payload: GlobalSettings = {
        aria2_bin_path: values.aria2_bin_path || null,
        download_dir: values.download_dir || null,
        max_concurrent_downloads: values.max_concurrent_downloads ?? null,
        max_connection_per_server: values.max_connection_per_server ?? null,
        first_run_done: true,
      }
      await invoke('set_global_settings', { settings: payload })
      msg.success(t('settingsSaved'))
      setFirstRunOpen(false)
      await loadSettings()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const detectAria2Path = async () => {
    try {
      const paths = await invoke<string[]>('detect_aria2_bin_paths')
      if (Array.isArray(paths) && paths.length > 0) {
        settingsForm.setFieldValue('aria2_bin_path', paths[0])
        msg.success(`${t('detectedPrefix')}: ${paths[0]}`)
      } else {
        msg.warning(t('noAria2Detected'))
      }
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const browseAria2Path = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
      })
      if (!selected || Array.isArray(selected)) {
        return
      }
      settingsForm.setFieldValue('aria2_bin_path', selected)
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const resetSettingsToDefaults = () => {
    Modal.confirm({
      title: t('resetSettingsDefaults'),
      content: t('resetSettingsConfirm'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await invoke('reset_global_settings_to_defaults')
          await Promise.all([loadSettings(), loadDiagnostics(), loadUpdateInfo()])
          msg.success(t('settingsSaved'))
        } catch (err) {
          msg.error(parseErr(err))
        }
      },
    })
  }

  const resetUiLayout = () => {
    setTableLayouts({
      downloading: defaultLayoutFor('downloading'),
      downloaded: defaultLayoutFor('downloaded'),
    })
    setSearchText('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setSortBy('updated_desc')
    setSelectedTaskIds([])
    msg.success(t('settingsSaved'))
  }

  const doRpcPing = async () => {
    try {
      const res = await invoke<string>('rpc_ping')
      msg.success(res)
      await loadDiagnostics()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doRestart = async () => {
    try {
      const res = await invoke<string>('restart_aria2')
      msg.success(res)
      await Promise.all([refresh(), loadDiagnostics()])
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doStartupCheck = async () => {
    try {
      const res = await invoke<string>('startup_check_aria2')
      msg.success(res)
      await loadDiagnostics()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doSaveSession = async () => {
    try {
      const res = await invoke<string>('save_session')
      msg.success(res)
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doExportDebugBundle = async () => {
    try {
      const path = await invoke<string>('export_debug_bundle')
      msg.success(i18nFormat(t('debugBundleSaved'), { path: path || '' }), 6)
      await loadDiagnostics()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doUpdateAria2Now = async () => {
    try {
      const res = await invoke<{ message: string }>('update_aria2_now')
      msg.success(res?.message || 'Updated')
      await Promise.all([loadUpdateInfo(), loadDiagnostics()])
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const openImportExport = async () => {
    setIoOpen(true)
    try {
      const payload = await invoke<string>('export_task_list_json')
      setExportJsonText(payload || '')
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const copyExportJson = async () => {
    try {
      await navigator.clipboard.writeText(exportJsonText || '')
      msg.success(t('copy'))
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const applyImportJson = async () => {
    const payload = String(importJsonText || '').trim()
    if (!payload) return
    setImporting(true)
    try {
      const res = await invoke<ImportTaskListResult>('import_task_list_json', { payload })
      msg.success(
        i18nFormat(t('importedResult'), {
          tasks: Number(res?.imported_tasks || 0),
          files: Number(res?.imported_files || 0),
        }),
      )
      setImportJsonText('')
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    } finally {
      setImporting(false)
    }
  }

  const openSettings = async () => {
    setSettingsOpen(true)
    await Promise.all([loadSettings(), loadDiagnostics(), loadUpdateInfo(), checkBridgeStatus()])
  }

  const openLogsWindow = async () => {
    try {
      await invoke('open_logs_window')
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() || ''
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void onOpenAdd()
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        void openSettings()
        return
      }
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        void openLogsWindow()
        return
      }
      if (!mod && e.key === '/' && !editing) {
        e.preventDefault()
        const el = document.getElementById('task-search-input') as HTMLInputElement | null
        el?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenAdd, openSettings, openLogsWindow])

  useEffect(() => {
    if (!addOpen) return
    const timer = window.setTimeout(() => {
      const fieldId = addType === 'magnet' ? 'add-magnet-input' : addType === 'url' ? 'add-url-input' : ''
      if (!fieldId) return
      const el = document.getElementById(fieldId) as HTMLInputElement | null
      el?.focus()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [addOpen, addType])

  const suggestAndSetSaveDir = async (taskType: 'http' | 'magnet' | 'torrent', source: string | null) => {
    try {
      const suggestion = await invoke<SaveDirSuggestion>('suggest_save_dir_detail', {
        taskType,
        source,
      })
      addForm.setFieldValue('save_dir', suggestion?.save_dir || '')
      setAddMatchedRule((suggestion?.matched_rule as DownloadRule) || null)
    } catch {
      setAddMatchedRule(null)
    }
  }

  const onChangeAddType = async (key: string) => {
    const next = key as 'url' | 'magnet' | 'torrent'
    setAddType(next)
    addForm.setFieldValue('preset_selected', undefined)
    try {
      const source =
        next === 'url'
          ? addForm.getFieldValue('url')
          : next === 'magnet'
            ? addForm.getFieldValue('magnet')
            : addTorrentFile?.name || null
      await suggestAndSetSaveDir(next === 'url' ? 'http' : next, source)
    } catch {
      // no-op
    }
  }

  const onResizeColumn = useCallback(
    (key: string) =>
      (_e: unknown, data: { size: { width: number; height: number } }) => {
        const next = Math.max(90, Math.floor(data.size.width))
        setTableLayouts((prev) => ({
          ...prev,
          [section]: {
            ...(prev[section] || defaultLayoutFor(section)),
            columnWidths: {
              ...(prev[section]?.columnWidths || defaultLayoutFor(section).columnWidths),
              [key]: next,
            },
          },
        }))
      },
    [section],
  )

  const setLayoutDensity = (density: TableDensity) => {
    setTableLayouts((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || defaultLayoutFor(section)),
        density,
      },
    }))
  }

  const toggleColumnVisible = (key: string, checked: boolean) => {
    if (key === 'name' || key === 'actions') return
    setTableLayouts((prev) => {
      const current = prev[section] || defaultLayoutFor(section)
      const hidden = new Set(current.hiddenColumns)
      if (checked) hidden.delete(key)
      else hidden.add(key)
      return {
        ...prev,
        [section]: {
          ...current,
          hiddenColumns: Array.from(hidden),
        },
      }
    })
  }

  const moveColumn = (key: string, direction: 'up' | 'down') => {
    setTableLayouts((prev) => {
      const current = prev[section] || defaultLayoutFor(section)
      const order = [...current.columnOrder]
      const idx = order.indexOf(key)
      if (idx < 0) return prev
      const swapWith = direction === 'up' ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= order.length) return prev
      ;[order[idx], order[swapWith]] = [order[swapWith], order[idx]]
      return {
        ...prev,
        [section]: {
          ...current,
          columnOrder: order,
        },
      }
    })
  }

  const tableColumns = useMemo<ColumnsType<Task>>(
    () => {
      const otherColsTotal =
        section === 'downloaded'
          ? Number(columnWidths.size || 0) +
            Number(columnWidths.completed_at || 0) +
            Number(columnWidths.actions || 0)
          : Number(columnWidths.progress || 0) +
            Number(columnWidths.speed || 0) +
            Number(columnWidths.eta || 0) +
            Number(columnWidths.status || 0) +
            Number(columnWidths.actions || 0)
      // Reserve space for selection/expand gutters and paddings.
      const reserved = otherColsTotal + 180
      const maxNameWidth = section === 'downloaded' ? 170 : 300
      const dynamicName = Math.max(140, Math.min(maxNameWidth, tableWrapWidth - reserved))
      const nameWidth = tableWrapWidth > 0 ? dynamicName : 220

      const nameCol = {
        key: 'name',
        title: t('colName'),
        dataIndex: 'name',
        width: nameWidth,
        fixed: 'left' as const,
        ellipsis: true,
        render: (_: unknown, row: Task) => (
          <Space size={6}>
            <span>{row.name || row.source || row.id}</span>
            {!!String(row.category || '').trim() && <Tag>{String(row.category)}</Tag>}
          </Space>
        ),
      }
      const actionsCol = {
        key: 'actions',
        title: t('colActions'),
        width: columnWidths.actions,
        fixed: 'right' as const,
        render: (_: unknown, row: Task) => (
          <Space wrap>
            <Button size="small" onClick={() => onOpenTaskDetail(row)}>
              {t('details')}
            </Button>
            {row.status !== 'completed' && (
              <Button size="small" onClick={() => onPauseResume(row)}>
                {String(row.status).toLowerCase() === 'paused' ? t('resume') : t('pause')}
              </Button>
            )}
            {section !== 'downloaded' && row.status !== 'completed' && (
              <>
                <Button
                  size="small"
                  aria-label={t('queueTop')}
                  title={t('queueTop')}
                  icon={<VerticalAlignTopOutlined />}
                  onClick={() => onMoveTaskPosition(row, 'top')}
                />
                <Button
                  size="small"
                  aria-label={t('queueUp')}
                  title={t('queueUp')}
                  icon={<ArrowUpOutlined />}
                  onClick={() => onMoveTaskPosition(row, 'up')}
                />
                <Button
                  size="small"
                  aria-label={t('queueDown')}
                  title={t('queueDown')}
                  icon={<ArrowDownOutlined />}
                  onClick={() => onMoveTaskPosition(row, 'down')}
                />
                <Button
                  size="small"
                  aria-label={t('queueBottom')}
                  title={t('queueBottom')}
                  icon={<VerticalAlignBottomOutlined />}
                  onClick={() => onMoveTaskPosition(row, 'bottom')}
                />
              </>
            )}
            {(row.task_type === 'torrent' || row.task_type === 'magnet') && (
              <Button size="small" loading={fileSelectLoading} onClick={() => onOpenFileSelection(row)}>
                {t('fileSelect')}
              </Button>
            )}
            {row.status === 'completed' && (
              <>
                {(row.task_type === 'torrent' || row.task_type === 'magnet') && (
                  <Button size="small" onClick={() => onStopSeeding(row)}>
                    {t('stopSeeding')}
                  </Button>
                )}
                <Button size="small" icon={<FolderOpenOutlined />} onClick={() => onOpenDir(row)}>
                  {t('openDir')}
                </Button>
                <Button size="small" onClick={() => onOpenFile(row)}>
                  {t('openFile')}
                </Button>
                <Button size="small" onClick={() => onCopyPath(row)}>
                  {t('copyPath')}
                </Button>
              </>
            )}
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRequestRemove(row)}>
              {t('remove')}
            </Button>
          </Space>
        ),
      }

      const sectionColumns =
        section === 'downloaded'
          ? ([
              nameCol,
              {
                key: 'size',
                title: t('colSize'),
                width: columnWidths.size,
                render: (_: unknown, row: Task) => <Typography.Text>{fmtBytes(row.total_length)}</Typography.Text>,
              },
              {
                key: 'completed_at',
                title: t('colCompletedAt'),
                width: columnWidths.completed_at,
                render: (_: unknown, row: Task) => <Typography.Text>{fmtDateTime(row.updated_at)}</Typography.Text>,
              },
              actionsCol,
            ] as ColumnsType<Task>)
          : ([
              nameCol,
              {
                key: 'progress',
                title: t('colProgress'),
                width: columnWidths.progress,
                render: (_: unknown, row: Task) => {
                  const percent = row.total_length > 0 ? Math.min(100, (row.completed_length / row.total_length) * 100) : 0
                  return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Progress percent={Number(percent.toFixed(1))} size="small" />
                      <Typography.Text type="secondary">
                        {fmtBytes(row.completed_length)} / {fmtBytes(row.total_length)}
                      </Typography.Text>
                    </Space>
                  )
                },
              },
              {
                key: 'speed',
                title: t('colSpeed'),
                width: columnWidths.speed,
                render: (_: unknown, row: Task) => <Typography.Text>{fmtBytes(row.download_speed)}/s</Typography.Text>,
              },
              {
                key: 'eta',
                title: t('colEta'),
                width: columnWidths.eta,
                render: (_: unknown, row: Task) => {
                  const done = Number(row.completed_length || 0)
                  const total = Number(row.total_length || 0)
                  const speed = Number(row.download_speed || 0)
                  const remaining = Math.max(total - done, 0)
                  if (String(row.status).toLowerCase() === 'completed') return '0s'
                  return fmtEta(remaining, speed, t('noEta'))
                },
              },
              {
                key: 'status',
                title: t('colStatus'),
                dataIndex: 'status',
                width: columnWidths.status,
                render: (v: string, row: Task) => (
                  <Space size={4}>
                    <Tag color={statusColor(String(v))}>{String(v).toUpperCase()}</Tag>
                    {(row.error_message || row.error_code) && String(v).toLowerCase() === 'error' && (
                      <Typography.Text type="danger" className="error-inline">
                        {row.error_code ? `[${row.error_code}] ` : ''}
                        {row.error_message || ''}
                      </Typography.Text>
                    )}
                  </Space>
                ),
              },
              actionsCol,
            ] as ColumnsType<Task>)

      const byKey = new Map<string, ColumnsType<Task>[number]>()
      for (const col of sectionColumns) {
        const key = String(col.key || ('dataIndex' in col ? (col.dataIndex as string) : 'col'))
        byKey.set(key, col)
      }
      const orderedKeys = [
        ...currentLayout.columnOrder.filter((k) => byKey.has(k)),
        ...Array.from(byKey.keys()).filter((k) => !currentLayout.columnOrder.includes(k)),
      ]
      const visibleKeys = orderedKeys.filter(
        (k) => !currentLayout.hiddenColumns.includes(k) || k === 'name' || k === 'actions',
      )
      return visibleKeys.map((k) => byKey.get(k)).filter(Boolean) as ColumnsType<Task>
    },
    [
      columnWidths,
      currentLayout.columnOrder,
      currentLayout.hiddenColumns,
      fileSelectLoading,
      onOpenDir,
      onOpenFile,
      onCopyPath,
      onOpenTaskDetail,
      onOpenFileSelection,
      onMoveTaskPosition,
      onPauseResume,
      onStopSeeding,
      section,
      t,
      tableWrapWidth,
    ],
  )

  const mergedColumns = useMemo<ColumnsType<Task>>(
    () =>
      tableColumns.map((col) => ({
        ...col,
        key: String(col.key || ('dataIndex' in col ? (col.dataIndex as string) : 'col')),
        onHeaderCell: () => ({
          width: Number(col.width || 120),
          onResize:
            String(col.key || ('dataIndex' in col ? (col.dataIndex as string) : 'col')) === 'name'
              ? undefined
              : onResizeColumn(
                  String(col.key || ('dataIndex' in col ? (col.dataIndex as string) : 'col')),
                ),
        }),
      })),
    [onResizeColumn, tableColumns],
  )

  const layoutEditableColumns = useMemo(() => {
    if (section === 'downloaded') {
      return [
        { key: 'name', label: t('colName'), lock: true },
        { key: 'size', label: t('colSize') },
        { key: 'completed_at', label: t('colCompletedAt') },
        { key: 'actions', label: t('colActions'), lock: true },
      ]
    }
    return [
      { key: 'name', label: t('colName'), lock: true },
      { key: 'progress', label: t('colProgress') },
      { key: 'speed', label: t('colSpeed') },
      { key: 'eta', label: t('colEta') },
      { key: 'status', label: t('colStatus') },
      { key: 'actions', label: t('colActions'), lock: true },
    ]
  }, [section, t])

  return (
    <ConfigProvider
      theme={{
        algorithm: effectiveTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 12,
          colorPrimary: '#1677ff',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        },
      }}
    >
      <AntApp>
        {msgCtx}
        <Layout className="root-layout">
          <Layout.Sider theme={effectiveTheme} width={228} className="side">
            <div className="brand">🦩</div>
            <Menu
              mode="inline"
              theme={effectiveTheme}
              selectedKeys={[section]}
              onClick={(e) => setSection(e.key as SectionKey)}
              items={[
                {
                  key: 'downloading',
                  icon: <DownloadOutlined />,
                  label: `${t('navDownloading')} (${tasks.filter((x) => x.status !== 'completed').length})`,
                },
                {
                  key: 'downloaded',
                  icon: <FileDoneOutlined />,
                  label: `${t('navDownloaded')} (${tasks.filter((x) => x.status === 'completed').length})`,
                },
              ]}
            />
          </Layout.Sider>

          <Layout>
            <Layout.Header className="header">
              <Space wrap>
                <Button type="primary" icon={<CloudDownloadOutlined />} onClick={onOpenAdd}>
                  {t('newDownload')}
                </Button>
                <Button icon={<SettingOutlined />} onClick={openSettings}>
                  {t('settings')}
                </Button>
                <Button icon={<FileSearchOutlined />} onClick={openLogsWindow}>
                  {t('logsWindow')}
                </Button>
                <Button icon={<SyncOutlined />} onClick={quickToggleTheme}>
                  {t('darkLight')}
                </Button>
                <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
                  {t('refresh')}
                </Button>
                <Dropdown
                  menu={{
                    selectedKeys: [locale],
                    items: [
                      { key: 'en-US', label: 'English' },
                      { key: 'zh-CN', label: '简体中文' },
                    ],
                    onClick: ({ key }) => setLocale(key as Locale),
                  }}
                >
                  <Button icon={<GlobalOutlined />}>
                    {locale === 'zh-CN' ? '简体中文' : 'English'}
                  </Button>
                </Dropdown>
              </Space>
            </Layout.Header>

            <Layout.Content
              className="content"
              onDragOver={(e) => {
                e.preventDefault()
                setDragHover(true)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setDragHover(false)
              }}
              onDrop={onDropToAdd}
            >
              {dragHover && <div className="drop-hint">{t('dropHint')}</div>}
              <Card
                className="main-card"
                title={section === 'downloaded' ? t('downloadedList') : t('currentDownloads')}
              >
                <Space wrap style={{ marginBottom: 12 }}>
                  <Input
                    id="task-search-input"
                    allowClear
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: 300 }}
                    placeholder={t('searchPlaceholder')}
                    addonBefore={t('search')}
                  />
                  <Select
                    style={{ width: 170 }}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: 'all', label: `${t('statusFilter')}: ${t('filterAll')}` },
                      { value: 'active', label: `${t('statusFilter')}: ${t('filterActive')}` },
                      { value: 'paused', label: `${t('statusFilter')}: ${t('filterPaused')}` },
                      { value: 'queued', label: `${t('statusFilter')}: ${t('filterQueued')}` },
                      { value: 'error', label: `${t('statusFilter')}: ${t('filterError')}` },
                      { value: 'metadata', label: `${t('statusFilter')}: ${t('filterMetadata')}` },
                      { value: 'completed', label: `${t('statusFilter')}: ${t('filterCompleted')}` },
                    ]}
                  />
                  <Select
                    style={{ width: 200 }}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={[
                      { value: 'all', label: `${t('categoryFilter')}: ${t('filterAll')}` },
                      { value: '__uncategorized__', label: `${t('categoryFilter')}: ${t('uncategorized')}` },
                      ...categoryOptions.map((c) => ({ value: c, label: `${t('categoryFilter')}: ${c}` })),
                    ]}
                  />
                  <Select
                    style={{ width: 220 }}
                    value={sortBy}
                    onChange={(v) => setSortBy(v as TaskSortKey)}
                    options={[
                      { value: 'updated_desc', label: `${t('sortBy')}: ${t('sortUpdated')}` },
                      { value: 'speed_desc', label: `${t('sortBy')}: ${t('sortSpeed')}` },
                      { value: 'progress_desc', label: `${t('sortBy')}: ${t('sortProgress')}` },
                      { value: 'name_asc', label: `${t('sortBy')}: ${t('sortName')}` },
                    ]}
                  />
                  <Button icon={<SlidersOutlined />} onClick={() => setLayoutOpen(true)}>
                    {t('layoutSettings')}
                  </Button>
                  <Tag>{`${t('selectedCount')}: ${selectedTaskIds.length}`}</Tag>
                  <Button size="small" onClick={onBatchPause} disabled={selectedTaskIds.length === 0 || section === 'downloaded'}>
                    {t('batchPause')}
                  </Button>
                  <Button size="small" onClick={onBatchResume} disabled={selectedTaskIds.length === 0 || section === 'downloaded'}>
                    {t('batchResume')}
                  </Button>
                  <Button size="small" danger onClick={onRequestBatchRemove} disabled={selectedTaskIds.length === 0}>
                    {t('batchRemove')}
                  </Button>
                </Space>
                <div className="task-table-wrap" ref={tableWrapRef}>
                  {!hasLoadedOnce && loading ? (
                    <div style={{ padding: 8 }}>
                      <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                  ) : (
                    <Table<Task>
                    className="task-table"
                    size={currentLayout.density}
                    rowKey="id"
                    loading={loading}
                    virtual={useVirtualTable}
                    pagination={useVirtualTable ? false : { pageSize: 12 }}
                    dataSource={list}
                    components={{
                      header: {
                        cell: ResizableTitle,
                      },
                    }}
                    scroll={{ x: 980, y: 'calc(100vh - 360px)' }}
                    rowSelection={{
                      selectedRowKeys: selectedTaskIds,
                      onChange: onRowSelectionChange,
                    }}
                    expandable={{
                      rowExpandable: (row) => !!row.error_message || !!row.error_code || !!row.source,
                      expandedRowRender: (row) => (
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Typography.Text type="secondary">
                            {t('sourceLabel')}: {row.source || '-'}
                          </Typography.Text>
                          <Typography.Text type="secondary">
                            {t('taskIdLabel')}: {row.id}
                          </Typography.Text>
                          {(row.error_message || row.error_code) && (
                            <Typography.Text type="danger" className="error-detail">
                              {t('errorDetails')}: {row.error_code ? `[${row.error_code}] ` : ''}
                              {row.error_message || '-'}
                            </Typography.Text>
                          )}
                        </Space>
                      ),
                    }}
                    columns={mergedColumns}
                    locale={{
                      emptyText: (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            <Space direction="vertical" size={2}>
                              <Typography.Text>
                                {section === 'downloaded' ? t('emptyDownloaded') : t('emptyDownloading')}
                              </Typography.Text>
                              <Typography.Text type="secondary">{t('emptyHint')}</Typography.Text>
                              {section !== 'downloaded' && (
                                <Button type="primary" size="small" onClick={onOpenAdd}>
                                  {t('newDownload')}
                                </Button>
                              )}
                            </Space>
                          }
                        />
                      ),
                    }}
                    />
                  )}
                </div>
              </Card>
            </Layout.Content>
          </Layout>
        </Layout>

        <Modal
          title={addType === 'url' ? t('addUrlTitle') : addType === 'magnet' ? t('addMagnetTitle') : t('addTorrentTitle')}
          open={addOpen}
          onCancel={() => setAddOpen(false)}
          onOk={onAddUrl}
          okText={t('add')}
          confirmLoading={addSubmitting}
          className="add-modal"
          rootClassName="add-modal-root"
          style={{ top: 24 }}
          styles={{
            body: {
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              maxHeight: 'calc(100vh - 200px)',
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }}
        >
          <div className="add-modal-body">
            <Tabs
              activeKey={addType}
              onChange={onChangeAddType}
              items={[
                { key: 'url', label: t('tabUrl') },
                { key: 'magnet', label: t('tabMagnet') },
                { key: 'torrent', label: t('tabTorrent') },
              ]}
            />
            <Form form={addForm} layout="vertical">
              {addType === 'url' && (
                <Form.Item name="url" label={t('url')} rules={[{ required: true, message: t('urlRequired') }]}>
                  <Input
                    id="add-url-input"
                    placeholder="https://example.com/file.zip"
                    onPressEnter={(e) => {
                      e.preventDefault()
                      void onAddUrl()
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text')
                      const inferred = detectAddSource(pasted)
                      if (!inferred) return
                      if (inferred.kind === 'magnet') {
                        setAddType('magnet')
                        addForm.setFieldValue('magnet', inferred.value)
                        e.preventDefault()
                      }
                    }}
                    onChange={async (e) => {
                      try {
                        await suggestAndSetSaveDir('http', e.target.value || null)
                      } catch {}
                    }}
                  />
                </Form.Item>
              )}
              {addType === 'magnet' && (
                <Form.Item name="magnet" label={t('magnet')} rules={[{ required: true, message: t('magnetRequired') }]}>
                  <Input
                    id="add-magnet-input"
                    placeholder="magnet:?xt=urn:btih:..."
                    onPressEnter={(e) => {
                      e.preventDefault()
                      void onAddUrl()
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text')
                      const inferred = detectAddSource(pasted)
                      if (!inferred) return
                      if (inferred.kind === 'url') {
                        setAddType('url')
                        addForm.setFieldValue('url', inferred.value)
                        e.preventDefault()
                      }
                    }}
                    onChange={async (e) => {
                      try {
                        await suggestAndSetSaveDir('magnet', e.target.value || null)
                      } catch {}
                    }}
                  />
                </Form.Item>
              )}
              {addType === 'torrent' && (
                <Form.Item label={t('torrentFile')} required help={!addTorrentFile ? t('torrentRequired') : undefined}>
                  <Upload
                    maxCount={1}
                    beforeUpload={(file) => {
                      setAddTorrentFile(file as File)
                      suggestAndSetSaveDir('torrent', file.name)
                        .catch(() => {})
                      return false
                    }}
                    onRemove={() => {
                      setAddTorrentFile(null)
                    }}
                  >
                    <Button icon={<PlusOutlined />}>{t('selectFile')}</Button>
                  </Upload>
                </Form.Item>
              )}
              <Form.Item name="save_dir" label={t('saveDirOptional')}>
                <Input placeholder="/path/to/downloads" />
              </Form.Item>
              <Typography.Text type="secondary" style={{ marginTop: -8, display: 'block', marginBottom: 8 }}>
                {t('matchedRule')}:{' '}
                {addMatchedRule
                  ? `${addMatchedRule.matcher}=${addMatchedRule.pattern} -> ${addMatchedRule.save_dir}`
                  : t('noMatchedRule')}
              </Typography.Text>
              <Collapse
                size="small"
                items={[
                  {
                    key: 'advanced',
                    label: t('addAdvanced'),
                    children: (
                      <>
                        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                          {t('taskPresets')}
                        </Typography.Text>
                        <div className="grid-2">
                          <Form.Item name="preset_name" label={t('presetName')}>
                            <Input placeholder="default-http" />
                          </Form.Item>
                          <Form.Item name="preset_selected" label={t('presetSelect')}>
                            <Select
                              allowClear
                              options={presetOptionsForCurrentType.map((preset) => ({
                                label: preset.name,
                                value: preset.name,
                              }))}
                            />
                          </Form.Item>
                        </div>
                        <Space wrap style={{ marginBottom: 12 }}>
                          <Button size="small" onClick={onSaveCurrentPreset}>
                            {t('savePreset')}
                          </Button>
                          <Button size="small" onClick={onApplySelectedPreset}>
                            {t('applyPreset')}
                          </Button>
                          <Button size="small" onClick={onExportPresets}>
                            {t('exportPresets')}
                          </Button>
                          <Button size="small" onClick={onImportPresets}>
                            {t('importPresets')}
                          </Button>
                        </Space>
                        <div className="grid-2">
                          <Form.Item name="out" label={t('outName')}>
                            <Input placeholder="example.zip" />
                          </Form.Item>
                          <Form.Item name="max_download_limit" label={t('maxDownloadLimit')}>
                            <Input placeholder="0 / 2M / 10M" />
                          </Form.Item>
                          <Form.Item name="max_upload_limit" label={t('taskMaxUploadLimit')}>
                            <Input placeholder="0 / 1M / 5M" />
                          </Form.Item>
                          {(addType === 'magnet' || addType === 'torrent') && (
                            <Form.Item name="seed_ratio" label={t('seedRatio')}>
                              <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                            </Form.Item>
                          )}
                          {(addType === 'magnet' || addType === 'torrent') && (
                            <Form.Item name="seed_time" label={t('seedTime')}>
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                          )}
                          <Form.Item name="max_connection_per_server" label={t('taskMaxConn')}>
                            <InputNumber min={1} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="split" label={t('taskSplit')}>
                            <InputNumber min={1} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="user_agent" label={t('userAgent')}>
                            <Input placeholder="Mozilla/5.0 ..." />
                          </Form.Item>
                          <Form.Item name="referer" label={t('referer')}>
                            <Input placeholder="https://example.com" />
                          </Form.Item>
                          <Form.Item name="cookie" label={t('cookie')}>
                            <Input placeholder="SESSION=xxx; token=yyy" />
                          </Form.Item>
                        </div>
                        <Form.Item name="headers_text" label={t('extraHeaders')} style={{ marginBottom: 4 }}>
                          <Input.TextArea rows={3} placeholder={t('extraHeadersPlaceholder')} />
                        </Form.Item>
                      </>
                    ),
                  },
                ]}
              />
            </Form>
          </div>
        </Modal>

        <Modal
          title={t('presetJsonTitle')}
          open={presetJsonOpen}
          onCancel={() => setPresetJsonOpen(false)}
          onOk={onApplyPresetJson}
          okText={t('applyImport')}
          width={760}
        >
          <Input.TextArea
            value={presetJsonText}
            onChange={(e) => setPresetJsonText(e.target.value)}
            rows={16}
            placeholder={t('presetJsonPlaceholder')}
          />
        </Modal>

        <Modal
          title={t('layoutSettings')}
          open={layoutOpen}
          onCancel={() => setLayoutOpen(false)}
          footer={null}
          width={620}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={14}>
            <div className="grid-2">
              <Form layout="vertical" style={{ width: '100%' }}>
                <Form.Item label={t('density')} style={{ marginBottom: 0 }}>
                  <Select
                    value={currentLayout.density}
                    onChange={(v) => setLayoutDensity(v as TableDensity)}
                    options={[
                      { value: 'small', label: t('densityCompact') },
                      { value: 'middle', label: t('densityDefault') },
                      { value: 'large', label: t('densityComfortable') },
                    ]}
                  />
                </Form.Item>
              </Form>
            </div>
            <Divider style={{ margin: '2px 0 8px' }} />
            <Typography.Text strong>{t('columns')}</Typography.Text>
            <Space direction="vertical" style={{ width: '100%' }}>
              {currentLayout.columnOrder
                .filter((k) => layoutEditableColumns.some((c) => c.key === k))
                .map((key, idx, arr) => {
                  const meta = layoutEditableColumns.find((c) => c.key === key)
                  if (!meta) return null
                  const visible = !currentLayout.hiddenColumns.includes(key)
                  return (
                    <Card key={key} size="small">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <Typography.Text>{meta.label}</Typography.Text>
                        <Space>
                          <Switch
                            size="small"
                            checked={visible}
                            disabled={meta.lock}
                            onChange={(checked) => toggleColumnVisible(key, checked)}
                          />
                          <Typography.Text type="secondary">{t('showColumn')}</Typography.Text>
                          <Button size="small" disabled={idx === 0} onClick={() => moveColumn(key, 'up')}>
                            {t('moveUp')}
                          </Button>
                          <Button size="small" disabled={idx === arr.length - 1} onClick={() => moveColumn(key, 'down')}>
                            {t('moveDown')}
                          </Button>
                        </Space>
                      </div>
                    </Card>
                  )
                })}
            </Space>
          </Space>
        </Modal>

        <Drawer
          title={t('taskDetails')}
          placement="right"
          width={620}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" title={t('overview')} loading={detailLoading}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label={t('colName')}>
                  {detailTask?.name || detailTask?.source || detailTask?.id || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('taskIdLabel')}>{detailTask?.id || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('colStatus')}>
                  <Tag color={statusColor(String(detailTask?.status || ''))}>
                    {String(detailTask?.status || '').toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('colSize')}>
                  {fmtBytes(Number(detailTask?.completed_length || 0))} / {fmtBytes(Number(detailTask?.total_length || 0))}
                </Descriptions.Item>
                <Descriptions.Item label={t('saveDir')}>
                  {detailTask?.save_dir || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('categoryFilter')}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      value={detailCategoryInput}
                      onChange={(e) => setDetailCategoryInput(e.target.value)}
                      placeholder={t('setCategory')}
                    />
                    <Button onClick={onSaveTaskCategory}>{t('setCategory')}</Button>
                    <Button
                      onClick={async () => {
                        if (!detailTask?.id) return
                        try {
                          setDetailCategoryInput('')
                          await invoke('set_task_category', {
                            taskId: detailTask.id,
                            category: null,
                          })
                          setDetailTask((prev) => (prev ? { ...prev, category: null } : prev))
                          await refresh()
                        } catch (err) {
                          msg.error(parseErr(err))
                        }
                      }}
                    >
                      {t('clearCategory')}
                    </Button>
                  </Space.Compact>
                </Descriptions.Item>
                <Descriptions.Item label={t('sourceLabel')}>
                  <Typography.Text copyable={{ text: detailTask?.source || '' }}>
                    {detailTask?.source || '-'}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
            <Card size="small" title={t('fileSelect')} loading={detailLoading}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {detailFiles.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  detailFiles.map((f, idx) => (
                    <Typography.Text key={`${idx}-${f.path}`}>
                      {f.path} ({fmtBytes(f.completed_length)} / {fmtBytes(f.length)})
                    </Typography.Text>
                  ))
                )}
              </Space>
            </Card>
            <Card size="small" title={t('runtimeStatus')} loading={detailLoading}>
              {detailBtSummary && (
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {detailBtSummary}
                </Typography.Text>
              )}
              <Input.TextArea
                value={detailRuntimeText || t('noRuntimeStatus')}
                autoSize={{ minRows: 6, maxRows: 14 }}
                readOnly
              />
            </Card>
            <Card size="small" title={t('retryLogs')} loading={detailLoading}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {detailRetryLogs.length === 0 ? (
                  <Typography.Text type="secondary">{t('noRetryLogs')}</Typography.Text>
                ) : (
                  detailRetryLogs.map((log, idx) => (
                    <Typography.Text key={`${log.ts}-${idx}`}>
                      [{fmtTime(log.ts)}] {log.action}: {log.message}
                    </Typography.Text>
                  ))
                )}
              </Space>
            </Card>
          </Space>
        </Drawer>

        <Modal
          title={t('settingsTitle')}
          open={settingsOpen}
          onCancel={() => setSettingsOpen(false)}
          width={980}
          okText={t('save')}
          onOk={saveSettings}
          confirmLoading={settingsSaving}
          className="settings-modal"
          rootClassName="settings-modal-root"
          style={{ top: 24 }}
          styles={{
            body: {
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              paddingRight: 8,
            },
          }}
        >
          <div className="settings-shell">
            <Tabs
              className="settings-tabs"
              activeKey={settingsTab}
              onChange={setSettingsTab}
              items={[
              {
                key: 'basic',
                label: t('tabBasic'),
                children: (
                  <Form form={settingsForm} layout="vertical" className="settings-form">
                    <Form.Item name="first_run_done" hidden>
                      <Input />
                    </Form.Item>
                    <Typography.Title level={5}>{t('grpAppearance')}</Typography.Title>
                    <Form.Item name="ui_theme" label={t('themeMode')}>
                      <Select
                        options={[
                          { label: t('themeSystem'), value: 'system' },
                          { label: t('themeLight'), value: 'light' },
                          { label: t('themeDark'), value: 'dark' },
                        ]}
                      />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>{t('grpDownload')}</Typography.Title>
                    <div className="grid-2">
                      <Form.Item name="download_dir" label={t('downloadDir')}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="max_concurrent_downloads" label={t('maxConcurrent')}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="max_connection_per_server" label={t('maxConn')}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="max_overall_download_limit" label={t('maxLimit')}>
                        <Input placeholder="0 / 10M / 2M" />
                      </Form.Item>
                    </div>
                    <Form.Item name="bt_tracker" label={t('btTracker')}>
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Space wrap style={{ marginBottom: 12 }}>
                      <Typography.Text type="secondary">{t('trackerPresets')}:</Typography.Text>
                      <Button
                        size="small"
                        onClick={() =>
                          settingsForm.setFieldValue(
                            'bt_tracker',
                            'udp://tracker.opentrackr.org:1337/announce,udp://open.demonii.com:1337/announce',
                          )
                        }
                      >
                        Public A
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          settingsForm.setFieldValue(
                            'bt_tracker',
                            'udp://tracker.torrent.eu.org:451/announce,udp://tracker.moeking.me:6969/announce',
                          )
                        }
                      >
                        Public B
                      </Button>
                    </Space>

                    <Divider />
                    <Typography.Title level={5}>{t('grpAria2')}</Typography.Title>
                    <Form.Item name="aria2_bin_path" label={t('aria2Path')}>
                      <Input />
                    </Form.Item>
                    <Space style={{ marginBottom: 12 }}>
                      <Button onClick={browseAria2Path}>{t('browse')}</Button>
                      <Button onClick={detectAria2Path}>{t('detectAria2')}</Button>
                      <Button onClick={loadSettings}>{t('reload')}</Button>
                      <Button onClick={openImportExport}>{t('importExport')}</Button>
                    </Space>
                    <Form.Item name="enable_upnp" label={t('enableUpnp')} valuePropName="checked">
                      <Switch />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>{t('grpIntegration')}</Typography.Title>
                    <div className="grid-2">
                      <Form.Item name="github_cdn" label={t('githubCdn')}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="github_token" label={t('githubToken')}>
                        <Input.Password />
                      </Form.Item>
                      <Form.Item name="browser_bridge_enabled" label={t('bridgeEnabled')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="browser_bridge_port" label={t('bridgePort')}>
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                    <Form.Item name="browser_bridge_token" label={t('bridgeToken')}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="browser_bridge_allowed_origins" label={t('bridgeAllowedOrigins')}>
                      <Input placeholder="chrome-extension://,moz-extension://" />
                    </Form.Item>
                    <Space wrap style={{ marginBottom: 8 }}>
                      <Button loading={bridgeChecking} onClick={checkBridgeStatus}>
                        {t('bridgeCheck')}
                      </Button>
                      <Button
                        onClick={async () => {
                          try {
                            const token = await invoke<string>('rotate_browser_bridge_token')
                            settingsForm.setFieldValue('browser_bridge_token', token)
                            msg.success(t('settingsSaved'))
                          } catch (err) {
                            msg.error(parseErr(err))
                          }
                        }}
                      >
                        {t('rotateBridgeToken')}
                      </Button>
                      <Button
                        loading={bridgeChecking}
                        onClick={async () => {
                          await saveSettings()
                          await checkBridgeStatus()
                        }}
                      >
                        {t('bridgeReconnect')}
                      </Button>
                      <Tag color={bridgeStatus?.connected ? 'green' : 'orange'}>
                        {t('bridgeStatus')}: {bridgeStatus?.connected ? t('bridgeConnected') : t('bridgeDisconnected')}
                      </Tag>
                    </Space>
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: -4, marginBottom: 8 }}>
                      {bridgeStatus?.endpoint ? `${bridgeStatus.endpoint} - ${bridgeStatus.message}` : bridgeStatus?.message || '-'}
                    </Typography.Text>
                    <Form.Item name="clipboard_watch_enabled" label={t('clipboardWatchEnabled')} valuePropName="checked">
                      <Switch />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>{t('grpReliability')}</Typography.Title>
                    <div className="grid-2">
                      <Form.Item name="retry_max_attempts" label={t('retryMaxAttempts')}>
                        <InputNumber min={0} max={20} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="retry_backoff_secs" label={t('retryBackoff')}>
                        <InputNumber min={1} max={3600} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="metadata_timeout_secs" label={t('metadataTimeout')}>
                        <InputNumber min={30} max={3600} style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                    <Form.Item name="retry_fallback_mirrors" label={t('retryMirrors')}>
                      <Input.TextArea rows={2} placeholder="https://mirror1.example.com\nhttps://mirror2.example.com" />
                    </Form.Item>
                    <Form.Item name="speed_plan" label={t('speedPlan')}>
                      <Input.TextArea
                        rows={3}
                        placeholder={'[{"days":"1,2,3,4,5","start":"09:00","end":"18:00","limit":"2M"}]'}
                      />
                    </Form.Item>
                    <Form.Item
                      name="auto_delete_control_files"
                      label={t('autoDeleteControlFiles')}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item name="auto_clear_completed_days" label={t('autoClearCompletedDays')}>
                      <InputNumber min={0} max={3650} style={{ width: '100%' }} />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>{isMac ? t('trayPrefsMac') : t('trayPrefs')}</Typography.Title>
                    <div className="grid-2">
                      <Form.Item name="start_minimized" label={t('startMinimized')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item
                        name="minimize_to_tray"
                        label={isMac ? t('minimizeToTrayMac') : t('minimizeToTray')}
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      {isMac && (
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: -8 }}>
                          {t('trayRecoverHintMac')}
                        </Typography.Text>
                      )}
                      {isMac && (
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                          {t('trayDisabledMac')}
                        </Typography.Text>
                      )}
                      <Form.Item name="notify_on_complete" label={t('notifyOnComplete')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="post_complete_action" label={t('postCompleteAction')}>
                        <Select
                          options={[
                            { label: t('postCompleteNone'), value: 'none' },
                            { label: t('postCompleteOpenDir'), value: 'open_dir' },
                            { label: t('postCompleteOpenFile'), value: 'open_file' },
                          ]}
                        />
                      </Form.Item>
                    </div>
                    <Space style={{ marginBottom: 8 }}>
                      <Button onClick={resetUiLayout}>{t('resetUiLayout')}</Button>
                      <Button danger onClick={resetSettingsToDefaults}>{t('resetSettingsDefaults')}</Button>
                    </Space>

                    <Divider />
                    <Typography.Title level={5}>{t('rulesTitle')}</Typography.Title>
                    <Form.List name="download_dir_rules">
                      {(fields, { add, remove }) => (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          {fields.map((field) => (
                            <Card key={field.key} size="small">
                              <div className="grid-rule">
                                <Form.Item name={[field.name, 'enabled']} label={t('enabled')} valuePropName="checked">
                                  <Switch />
                                </Form.Item>
                                <Form.Item name={[field.name, 'matcher']} label={t('matcher')}>
                                  <Select
                                    options={[
                                      { label: 'ext', value: 'ext' },
                                      { label: 'domain', value: 'domain' },
                                      { label: 'type', value: 'type' },
                                    ]}
                                  />
                                </Form.Item>
                                <Form.Item name={[field.name, 'pattern']} label={t('pattern')}>
                                  <Input placeholder="mp4,mkv or github.com or torrent" />
                                </Form.Item>
                                <Form.Item name={[field.name, 'save_dir']} label={t('saveDir')}>
                                  <Input placeholder="/path/to/save" />
                                </Form.Item>
                                <Form.Item
                                  name={[field.name, 'subdir_by_domain']}
                                  label={t('subdirByDomain')}
                                  valuePropName="checked"
                                >
                                  <Switch />
                                </Form.Item>
                                <Form.Item
                                  name={[field.name, 'subdir_by_date']}
                                  label={t('subdirByDate')}
                                  valuePropName="checked"
                                >
                                  <Switch />
                                </Form.Item>
                              </div>
                              <Button danger onClick={() => remove(field.name)}>
                                {t('removeRule')}
                              </Button>
                            </Card>
                          ))}
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() =>
                              add({
                                enabled: true,
                                matcher: 'ext',
                                subdir_by_domain: false,
                                subdir_by_date: false,
                              })
                            }
                          >
                            {t('addRule')}
                          </Button>
                        </Space>
                      )}
                    </Form.List>
                  </Form>
                ),
              },
              {
                key: 'diagnostics',
                label: t('tabDiagnostics'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Card size="small" title={t('startupSelfCheck')}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Typography.Text>
                          aria2: <Typography.Text code>{startupSummary?.aria2_bin_path || '-'}</Typography.Text>
                        </Typography.Text>
                        <Space wrap>
                          <Tag color={startupSummary?.aria2_bin_exists ? 'green' : 'red'}>
                            bin {startupSummary?.aria2_bin_exists ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.aria2_bin_executable ? 'green' : 'red'}>
                            exec {startupSummary?.aria2_bin_executable ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.download_dir_exists ? 'green' : 'red'}>
                            dir {startupSummary?.download_dir_exists ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.download_dir_writable ? 'green' : 'red'}>
                            writable {startupSummary?.download_dir_writable ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.rpc_ready ? 'green' : 'orange'}>
                            rpc {startupSummary?.rpc_ready ? t('statusOk') : t('statusFail')}
                          </Tag>
                        </Space>
                        <Typography.Text>
                          download dir:{' '}
                          <Typography.Text code>{startupSummary?.download_dir || '-'}</Typography.Text>
                        </Typography.Text>
                        <Typography.Text>
                          rpc endpoint:{' '}
                          <Typography.Text code>{startupSummary?.rpc_endpoint || '-'}</Typography.Text>
                        </Typography.Text>
                      </Space>
                    </Card>
                    <Space wrap>
                      <Button onClick={doRpcPing}>{t('rpcPing')}</Button>
                      <Button onClick={doRestart}>{t('restartAria2')}</Button>
                      <Button onClick={doStartupCheck}>{t('startupCheck')}</Button>
                      <Button onClick={doSaveSession}>{t('saveSession')}</Button>
                      <Button onClick={doExportDebugBundle}>{t('exportDebug')}</Button>
                      <Button icon={<ReloadOutlined />} onClick={loadDiagnostics}>{t('refresh')}</Button>
                    </Space>
                    <Input.TextArea value={diagnosticsText} autoSize={{ minRows: 12, maxRows: 22 }} readOnly />
                  </Space>
                ),
              },
              {
                key: 'updates',
                label: t('tabUpdates'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space wrap>
                      <Button onClick={loadUpdateInfo}>{t('checkUpdate')}</Button>
                      <Button type="primary" onClick={doUpdateAria2Now}>{t('updateNow')}</Button>
                    </Space>
                    <Input.TextArea value={updateText} autoSize={{ minRows: 10, maxRows: 20 }} readOnly />
                    <Input.TextArea value={appUpdateStrategyText} autoSize={{ minRows: 4, maxRows: 10 }} readOnly />
                  </Space>
                ),
              },
              ]}
            />
          </div>
        </Modal>

        <Modal
          title={t('removeConfirm')}
          open={removeDialogOpen}
          onCancel={() => {
            setRemoveDialogOpen(false)
            setRemoveTaskIds([])
          }}
          onOk={onRemove}
          okButtonProps={{ danger: true }}
          okText={t('remove')}
          cancelText={t('cancel')}
        >
          <Space direction="vertical">
            <Typography.Text>
              {removeTaskIds.length > 1
                ? `${removeTaskIds.length} task(s)`
                : removeTask?.name || removeTask?.source || removeTask?.id}
            </Typography.Text>
            <Switch checked={removeDeleteFiles} onChange={setRemoveDeleteFiles} />
            <Typography.Text type="secondary">{t('removeWithFiles')}</Typography.Text>
          </Space>
        </Modal>

        <Modal
          title={t('fileSelectTitle')}
          open={fileSelectOpen}
          onCancel={() => setFileSelectOpen(false)}
          onOk={onApplyFileSelection}
          okText={t('applySelection')}
          confirmLoading={fileSelectLoading}
          width={860}
        >
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {fileSelectRows.map((f, idx) => (
                <Checkbox
                  key={`${idx}-${f.path}`}
                  checked={selectedFileIndexes.includes(idx)}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setSelectedFileIndexes((prev) =>
                      checked ? [...prev, idx] : prev.filter((x) => x !== idx),
                    )
                  }}
                >
                  {f.path} ({fmtBytes(f.length)})
                </Checkbox>
              ))}
            </Space>
          </div>
        </Modal>

        <Modal
          title={t('importExportTitle')}
          open={ioOpen}
          onCancel={() => setIoOpen(false)}
          footer={null}
          width={860}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Typography.Text strong>{t('exportResult')}</Typography.Text>
            <Input.TextArea value={exportJsonText} autoSize={{ minRows: 8, maxRows: 14 }} readOnly />
            <Button onClick={copyExportJson}>{t('copy')}</Button>

            <Divider style={{ margin: '8px 0' }} />

            <Typography.Text strong>{t('importInput')}</Typography.Text>
            <Input.TextArea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              autoSize={{ minRows: 8, maxRows: 14 }}
            />
            <Button type="primary" onClick={applyImportJson} loading={importing}>
              {t('applyImport')}
            </Button>
          </Space>
        </Modal>

        <Modal
          title={t('setupTitle')}
          open={firstRunOpen}
          closable={false}
          maskClosable={false}
          footer={[
            <Button key="save" type="primary" onClick={completeFirstRun}>
              {t('saveAndFinish')}
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Typography.Text type="secondary">{t('setupHint')}</Typography.Text>
            <Form form={settingsForm} layout="vertical">
              <Form.Item name="download_dir" label={t('downloadDir')}>
                <Input />
              </Form.Item>
              <Form.Item name="aria2_bin_path" label={t('aria2Path')}>
                <Input />
              </Form.Item>
              <Space style={{ marginBottom: 8 }}>
                <Button onClick={browseAria2Path}>{t('browse')}</Button>
                <Button onClick={detectAria2Path}>{t('detectAria2')}</Button>
              </Space>
              <div className="grid-2">
                <Form.Item name="max_concurrent_downloads" label={t('maxConcurrent')}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="max_connection_per_server" label={t('maxConn')}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </Form>
          </Space>
        </Modal>
      </AntApp>
    </ConfigProvider>
  )
}
