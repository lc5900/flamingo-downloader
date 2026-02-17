import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Collapse,
  ConfigProvider,
  Divider,
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
  Typography,
  Upload,
  message,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Resizable } from 'react-resizable'
import './App.css'
import 'react-resizable/css/styles.css'

type Locale = 'en-US' | 'zh-CN'
type ThemeMode = 'system' | 'light' | 'dark'
type SectionKey = 'downloading' | 'downloaded'
type MatcherType = 'ext' | 'domain' | 'type'

type Task = {
  id: string
  task_type?: string
  source: string
  name?: string | null
  status: string
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
  download_dir_rules?: DownloadRule[]
  retry_max_attempts?: number | null
  retry_backoff_secs?: number | null
  retry_fallback_mirrors?: string | null
  metadata_timeout_secs?: number | null
  speed_plan?: string | null
  first_run_done?: boolean | null
  minimize_to_tray?: boolean | null
  notify_on_complete?: boolean | null
}

type AddFormValues = {
  url: string
  magnet: string
  save_dir?: string
  out?: string
  max_download_limit?: string
  max_connection_per_server?: number
  split?: number
  user_agent?: string
  referer?: string
  cookie?: string
  headers_text?: string
}

type StartupNotice = {
  level: string
  message: string
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

type TaskSortKey = 'updated_desc' | 'speed_desc' | 'progress_desc' | 'name_asc'

const LOCALE_KEY = 'flamingo.locale'

const I18N: Record<Locale, Record<string, string>> = {
  'en-US': {
    navDownloading: 'Downloading',
    navDownloaded: 'Downloaded',
    newDownload: 'New Download',
    settings: 'Settings',
    refresh: 'Refresh',
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
    search: 'Search',
    searchPlaceholder: 'Search by name / source / task id',
    statusFilter: 'Status',
    sortBy: 'Sort',
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
    addAdvanced: 'Advanced Options',
    outName: 'Filename (optional)',
    maxDownloadLimit: 'Per-task Max Download Limit',
    taskMaxConn: 'Per-task Max Connections',
    taskSplit: 'Per-task Split',
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
    minimizeToTray: 'Minimize to tray on close',
    notifyOnComplete: 'Notify when download completes',
    saveAndFinish: 'Save and Finish',
    setupTitle: 'First Run Setup',
    setupHint: 'Complete basic settings before using Flamingo Downloader.',
    githubCdn: 'GitHub CDN Prefix',
    githubToken: 'GitHub Token',
    bridgeEnabled: 'Browser Bridge Enabled',
    bridgePort: 'Browser Bridge Port',
    bridgeToken: 'Browser Bridge Token',
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
    rpcPing: 'RPC Ping',
    restartAria2: 'Restart aria2',
    startupCheck: 'Startup Check',
    saveSession: 'Save Session',
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
    search: '搜索',
    searchPlaceholder: '按名称 / 来源 / 任务ID 搜索',
    statusFilter: '状态',
    sortBy: '排序',
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
    addAdvanced: '高级选项',
    outName: '文件名（可选）',
    maxDownloadLimit: '单任务下载限速',
    taskMaxConn: '单任务最大连接数',
    taskSplit: '单任务分段数',
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
    minimizeToTray: '关闭时最小化到托盘',
    notifyOnComplete: '下载完成时通知',
    saveAndFinish: '保存并完成',
    setupTitle: '首次启动设置',
    setupHint: '请先完成基础设置后再开始使用。',
    githubCdn: 'GitHub CDN 前缀',
    githubToken: 'GitHub Token',
    bridgeEnabled: '浏览器桥接启用',
    bridgePort: '浏览器桥接端口',
    bridgeToken: '浏览器桥接令牌',
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
    rpcPing: 'RPC 探测',
    restartAria2: '重启 aria2',
    startupCheck: '启动检查',
    saveSession: '保存会话',
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
  const [msg, msgCtx] = message.useMessage()
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY)
    return saved === 'zh-CN' || saved === 'en-US' ? saved : detectLocale()
  })

  const t = useCallback((k: string) => I18N[locale][k] || k, [locale])

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
  const [sortBy, setSortBy] = useState<TaskSortKey>('updated_desc')
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    progress: 180,
    speed: 105,
    eta: 88,
    status: 180,
    actions: 180,
    size: 120,
    completed_at: 180,
  })
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
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [diagnosticsText, setDiagnosticsText] = useState('')
  const [updateText, setUpdateText] = useState('')
  const [appUpdateStrategyText, setAppUpdateStrategyText] = useState('')
  const [ioOpen, setIoOpen] = useState(false)
  const [exportJsonText, setExportJsonText] = useState('')
  const [importJsonText, setImportJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const [firstRunOpen, setFirstRunOpen] = useState(false)
  const [fileSelectOpen, setFileSelectOpen] = useState(false)
  const [fileSelectTaskId, setFileSelectTaskId] = useState<string | null>(null)
  const [fileSelectRows, setFileSelectRows] = useState<TaskFile[]>([])
  const [selectedFileIndexes, setSelectedFileIndexes] = useState<number[]>([])
  const [fileSelectLoading, setFileSelectLoading] = useState(false)

  const [settingsForm] = Form.useForm<GlobalSettings>()
  const [addForm] = Form.useForm<AddFormValues>()

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
        download_dir_rules: Array.isArray(s?.download_dir_rules) ? s.download_dir_rules : [],
        retry_max_attempts: s?.retry_max_attempts ?? undefined,
        retry_backoff_secs: s?.retry_backoff_secs ?? undefined,
        retry_fallback_mirrors: s?.retry_fallback_mirrors || undefined,
        metadata_timeout_secs: s?.metadata_timeout_secs ?? undefined,
        speed_plan: s?.speed_plan || undefined,
        first_run_done: s?.first_run_done ?? undefined,
        minimize_to_tray: s?.minimize_to_tray ?? undefined,
        notify_on_complete: s?.notify_on_complete ?? undefined,
      })
      if (s?.first_run_done !== true) {
        setFirstRunOpen(true)
      }
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, settingsForm])

  const loadDiagnostics = useCallback(async () => {
    try {
      const d = await invoke('get_diagnostics')
      setDiagnosticsText(JSON.stringify(d, null, 2))
    } catch (err) {
      setDiagnosticsText(parseErr(err))
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
        if (level === 'warning') msg.warning(notice.message, 5)
        else if (level === 'error') msg.error(notice.message, 6)
        else msg.success(notice.message, 4)
      } catch {
        // ignore startup notice failures
      }
    }
    void checkStartupNotice()
  }, [msg])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (themeMode === 'system') setThemeMode('system')
    }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [themeMode])

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

  const list = useMemo(
    () => {
      const bySection = tasks.filter((task) =>
        section === 'downloaded' ? task.status === 'completed' : task.status !== 'completed',
      )
      const filtered = bySection.filter((task) => {
        const status = String(task.status || '').toLowerCase()
        if (statusFilter !== 'all' && status !== statusFilter) return false
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
    [tasks, section, statusFilter, searchText, sortBy],
  )

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
    addForm.setFieldsValue({
      url: '',
      magnet: '',
      save_dir: '',
      out: '',
      max_download_limit: '',
      max_connection_per_server: undefined,
      split: undefined,
      user_agent: '',
      referer: '',
      cookie: '',
      headers_text: '',
    })
    try {
      const dir = await invoke<string>('suggest_save_dir', {
        taskType: 'http',
        source: null,
      })
      addForm.setFieldValue('save_dir', dir)
    } catch {}
  }

  const onAddUrl = async () => {
    try {
      const values = await addForm.validateFields()
      const urlValue = String(values.url || '').trim()
      const magnetValue = String(values.magnet || '').trim()
      const headerLines = String(values.headers_text || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const cookie = String(values.cookie || '').trim()
      if (cookie) headerLines.push(`Cookie: ${cookie}`)
      const optionPayload = {
        save_dir: values.save_dir || null,
        out: String(values.out || '').trim() || null,
        max_download_limit: String(values.max_download_limit || '').trim() || null,
        max_connection_per_server: values.max_connection_per_server ?? null,
        split: values.split ?? null,
        user_agent: String(values.user_agent || '').trim() || null,
        referer: String(values.referer || '').trim() || null,
        headers: headerLines,
      }
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
        retry_max_attempts: values.retry_max_attempts ?? null,
        retry_backoff_secs: values.retry_backoff_secs ?? null,
        retry_fallback_mirrors: values.retry_fallback_mirrors || null,
        metadata_timeout_secs: values.metadata_timeout_secs ?? null,
        speed_plan: values.speed_plan || null,
        first_run_done: values.first_run_done ?? null,
        minimize_to_tray: values.minimize_to_tray ?? null,
        notify_on_complete: values.notify_on_complete ?? null,
        download_dir_rules: (values.download_dir_rules || []).filter(
          (r) => r && String(r.pattern || '').trim() && String(r.save_dir || '').trim(),
        ),
      }
      await invoke('set_global_settings', { settings: payload })
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
    await Promise.all([loadSettings(), loadDiagnostics(), loadUpdateInfo()])
  }

  const onChangeAddType = async (key: string) => {
    const next = key as 'url' | 'magnet' | 'torrent'
    setAddType(next)
    try {
      const source =
        next === 'url'
          ? addForm.getFieldValue('url')
          : next === 'magnet'
            ? addForm.getFieldValue('magnet')
            : addTorrentFile?.name || null
      const dir = await invoke<string>('suggest_save_dir', {
        taskType: next === 'url' ? 'http' : next,
        source,
      })
      addForm.setFieldValue('save_dir', dir)
    } catch {
      // no-op
    }
  }

  const onResizeColumn = useCallback(
    (key: string) =>
      (_e: unknown, data: { size: { width: number; height: number } }) => {
        const next = Math.max(90, Math.floor(data.size.width))
        setColumnWidths((prev) => ({ ...prev, [key]: next }))
      },
    [],
  )

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
        render: (_: unknown, row: Task) => row.name || row.source || row.id,
      }
      const actionsCol = {
        key: 'actions',
        title: t('colActions'),
        width: columnWidths.actions,
        fixed: 'right' as const,
        render: (_: unknown, row: Task) => (
          <Space wrap>
            {row.status !== 'completed' && (
              <Button size="small" onClick={() => onPauseResume(row)}>
                {String(row.status).toLowerCase() === 'paused' ? t('resume') : t('pause')}
              </Button>
            )}
            {(row.task_type === 'torrent' || row.task_type === 'magnet') && (
              <Button size="small" loading={fileSelectLoading} onClick={() => onOpenFileSelection(row)}>
                {t('fileSelect')}
              </Button>
            )}
            {row.status === 'completed' && (
              <>
                <Button size="small" icon={<FolderOpenOutlined />} onClick={() => onOpenDir(row)}>
                  {t('openDir')}
                </Button>
                <Button size="small" onClick={() => onOpenFile(row)}>
                  {t('openFile')}
                </Button>
              </>
            )}
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRequestRemove(row)}>
              {t('remove')}
            </Button>
          </Space>
        ),
      }

      if (section === 'downloaded') {
        return [
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
        ]
      }

      return [
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
      ]
    },
    [columnWidths, fileSelectLoading, onOpenDir, onOpenFile, onOpenFileSelection, onPauseResume, section, t, tableWrapWidth],
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
                { key: 'downloading', icon: <DownloadOutlined />, label: t('navDownloading') },
                { key: 'downloaded', icon: <FileDoneOutlined />, label: t('navDownloaded') },
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

            <Layout.Content className="content">
              <Card
                className="main-card"
                title={section === 'downloaded' ? t('downloadedList') : t('currentDownloads')}
              >
                <Space wrap style={{ marginBottom: 12 }}>
                  <Input
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
                    size="small"
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 12 }}
                    dataSource={list}
                    components={{
                      header: {
                        cell: ResizableTitle,
                      },
                    }}
                    scroll={{ x: 980, y: 'calc(100vh - 360px)' }}
                    rowSelection={{
                      selectedRowKeys: selectedTaskIds,
                      onChange: (keys) => setSelectedTaskIds(keys.map((k) => String(k))),
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
                        const dir = await invoke<string>('suggest_save_dir', {
                          taskType: 'http',
                          source: e.target.value || null,
                        })
                        addForm.setFieldValue('save_dir', dir)
                      } catch {}
                    }}
                  />
                </Form.Item>
              )}
              {addType === 'magnet' && (
                <Form.Item name="magnet" label={t('magnet')} rules={[{ required: true, message: t('magnetRequired') }]}>
                  <Input
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
                        const dir = await invoke<string>('suggest_save_dir', {
                          taskType: 'magnet',
                          source: e.target.value || null,
                        })
                        addForm.setFieldValue('save_dir', dir)
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
                      invoke<string>('suggest_save_dir', {
                        taskType: 'torrent',
                        source: file.name,
                      })
                        .then((dir) => addForm.setFieldValue('save_dir', dir))
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
              <Collapse
                size="small"
                items={[
                  {
                    key: 'advanced',
                    label: t('addAdvanced'),
                    children: (
                      <>
                        <div className="grid-2">
                          <Form.Item name="out" label={t('outName')}>
                            <Input placeholder="example.zip" />
                          </Form.Item>
                          <Form.Item name="max_download_limit" label={t('maxDownloadLimit')}>
                            <Input placeholder="0 / 2M / 10M" />
                          </Form.Item>
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

                    <Divider />
                    <Typography.Title level={5}>{t('trayPrefs')}</Typography.Title>
                    <div className="grid-2">
                      <Form.Item name="minimize_to_tray" label={t('minimizeToTray')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="notify_on_complete" label={t('notifyOnComplete')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </div>

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
                              </div>
                              <Button danger onClick={() => remove(field.name)}>
                                {t('removeRule')}
                              </Button>
                            </Card>
                          ))}
                          <Button icon={<PlusOutlined />} onClick={() => add({ enabled: true, matcher: 'ext' })}>
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
