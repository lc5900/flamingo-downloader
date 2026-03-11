import {
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popover,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Tree,
  Descriptions,
  Typography,
  message,
  notification,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  SlidersOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { readText as readClipboardText, writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import * as api from './api/client'
import { ResizableTitle } from './components/ResizableTitle'
import { Sidebar } from './components/layout/Sidebar'
import { TopHeader } from './components/layout/TopHeader'
import { AddDownloadDialog } from './components/dialogs/AddDownloadDialog'
import { SettingsView } from './components/dialogs/SettingsView'
import { ShortcutEditorDialog, ShortcutCheatsheetDialog } from './components/dialogs/ShortcutDialogs'
import { defaultLayoutFor, useTableLayout } from './hooks/useTableLayout'
import { detectLocale, I18N } from './i18n'
import { DownloadedPage } from './pages/DownloadedPage'
import { DownloadingPage } from './pages/DownloadingPage'
import { useUiViewStore } from './stores/uiViewStore'
import type {
  AddFormValues,
  AddPresetTaskType,
  BrowserBridgeStatus,
  CategoryRule,
  DownloadRule,
  GlobalSettings,
  ImportTaskListResult,
  Locale,
  OperationLog,
  SaveDirSuggestion,
  StartupNotice,
  StartupSelfCheck,
  StorageSummary,
  TableDensity,
  Task,
  TaskFile,
  TaskOptionPreset,
  TaskSortKey,
  ThemeMode,
} from './types'
import {
  detectAddSource,
  fmtBytes,
  fmtDateTime,
  fmtEta,
  fmtTime,
  i18nFormat,
  parseErr,
  statusColor,
} from './utils/format'
import {
  eventMatchesShortcut,
  formatShortcutForDisplayWithMode,
  normalizeShortcut,
  shortcutFromKeyboardEvent,
  type ShortcutDisplayMode,
} from './utils/shortcuts'
import type { ShortcutAction, ShortcutBindings, ShortcutItem } from './types/shortcuts'
import './App.css'
import 'react-resizable/css/styles.css'

const AddDownloadPage = lazy(() =>
  import('./pages/AddDownloadPage').then((module) => ({ default: module.AddDownloadPage })),
)
const TaskDetailPage = lazy(() =>
  import('./pages/TaskDetailPage').then((module) => ({ default: module.TaskDetailPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

const LOCALE_KEY = 'flamingo.locale'
const SHORTCUT_STORAGE_KEY = 'flamingo.shortcuts.v1'
const SHORTCUT_DISPLAY_MODE_KEY = 'flamingo.shortcuts.display_mode.v1'
const PROGRESS_ROW_BG_KEY = 'flamingo.progress_row_bg_enabled.v1'

const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  new_download: 'CmdOrCtrl+N',
  focus_search: '/',
  refresh_list: 'CmdOrCtrl+R',
  open_settings: 'CmdOrCtrl+,',
  open_logs: 'CmdOrCtrl+L',
  toggle_theme: 'CmdOrCtrl+Shift+T',
  pause_all: 'CmdOrCtrl+Shift+P',
  resume_all: 'CmdOrCtrl+Shift+R',
  retry_failed: 'CmdOrCtrl+Shift+F',
  switch_downloading: 'Alt+1',
  switch_downloaded: 'Alt+2',
}

function loadShortcutBindings(): ShortcutBindings {
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SHORTCUT_BINDINGS }
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutAction, string>>
    const merged: ShortcutBindings = { ...DEFAULT_SHORTCUT_BINDINGS }
    for (const key of Object.keys(DEFAULT_SHORTCUT_BINDINGS) as ShortcutAction[]) {
      const value = normalizeShortcut(String(parsed?.[key] || ''))
      if (value) merged[key] = value
    }
    return merged
  } catch {
    return { ...DEFAULT_SHORTCUT_BINDINGS }
  }
}

function saveShortcutBindings(bindings: ShortcutBindings) {
  localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(bindings))
}

function findDuplicateShortcut(bindings: ShortcutBindings): string | null {
  const seen = new Set<string>()
  for (const key of Object.keys(bindings) as ShortcutAction[]) {
    const value = normalizeShortcut(bindings[key])
    if (!value) continue
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

function findShortcutConflictAction(
  bindings: ShortcutBindings,
  candidate: string,
  excluding: ShortcutAction | null,
): ShortcutAction | null {
  const normalized = normalizeShortcut(candidate)
  if (!normalized) return null
  for (const key of Object.keys(bindings) as ShortcutAction[]) {
    if (excluding && key === excluding) continue
    if (normalizeShortcut(bindings[key]) === normalized) return key
  }
  return null
}

function loadShortcutDisplayMode(): ShortcutDisplayMode {
  try {
    const raw = String(localStorage.getItem(SHORTCUT_DISPLAY_MODE_KEY) || '').trim()
    return raw === 'symbol' ? 'symbol' : 'text'
  } catch {
    return 'text'
  }
}

function saveShortcutDisplayMode(mode: ShortcutDisplayMode) {
  localStorage.setItem(SHORTCUT_DISPLAY_MODE_KEY, mode)
}

function loadProgressRowBackgroundEnabled(): boolean {
  try {
    const raw = String(localStorage.getItem(PROGRESS_ROW_BG_KEY) || '').trim().toLowerCase()
    if (raw === 'false' || raw === '0' || raw === 'off') return false
    return true
  } catch {
    return true
  }
}

function saveProgressRowBackgroundEnabled(enabled: boolean) {
  localStorage.setItem(PROGRESS_ROW_BG_KEY, enabled ? 'true' : 'false')
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

type SpeedPlanRuleInput = {
  days?: string
  start?: string
  end?: string
  limit?: string
}
type SpeedPlanMode = 'manual' | 'off' | 'workday_limited' | 'night_boost'

function normalizeSpeedPlanRules(input: unknown): SpeedPlanRuleInput[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as SpeedPlanRuleInput
      return {
        days: String(row.days || '').trim(),
        start: String(row.start || '').trim(),
        end: String(row.end || '').trim(),
        limit: String(row.limit || '').trim(),
      }
    })
    .filter((row) => row.limit)
}

function buildSpeedPlanPreset(mode: SpeedPlanMode): SpeedPlanRuleInput[] {
  if (mode === 'off') return [{ days: '', start: '', end: '', limit: '0' }]
  if (mode === 'workday_limited') {
    return [
      { days: '1,2,3,4,5', start: '09:00', end: '18:00', limit: '2M' },
      { days: '', start: '', end: '', limit: '0' },
    ]
  }
  if (mode === 'night_boost') {
    return [
      { days: '1,2,3,4,5', start: '09:00', end: '23:00', limit: '1M' },
      { days: '6,7', start: '10:00', end: '23:00', limit: '2M' },
      { days: '', start: '', end: '', limit: '0' },
    ]
  }
  return []
}

function inferSpeedPlanMode(rules: SpeedPlanRuleInput[]): SpeedPlanMode {
  const normalized = JSON.stringify(normalizeSpeedPlanRules(rules))
  if (normalized === JSON.stringify(normalizeSpeedPlanRules(buildSpeedPlanPreset('off')))) {
    return 'off'
  }
  if (normalized === JSON.stringify(normalizeSpeedPlanRules(buildSpeedPlanPreset('workday_limited')))) {
    return 'workday_limited'
  }
  if (normalized === JSON.stringify(normalizeSpeedPlanRules(buildSpeedPlanPreset('night_boost')))) {
    return 'night_boost'
  }
  return 'manual'
}

function validateSpeedPlanRules(rules: SpeedPlanRuleInput[]): string | null {
  const timeRe = /^\d{2}:\d{2}$/
  const validDay = (value: string) => {
    const parts = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (parts.length === 0) return true
    return parts.every((p) => {
      const n = Number(p)
      return Number.isInteger(n) && n >= 1 && n <= 7
    })
  }
  for (const row of rules) {
    const start = String(row.start || '').trim()
    const end = String(row.end || '').trim()
    const days = String(row.days || '').trim()
    const limit = String(row.limit || '').trim()
    if (!limit) return 'limit'
    if (start && !timeRe.test(start)) return 'start'
    if (end && !timeRe.test(end)) return 'end'
    if (start && end && start >= end) return 'range'
    if (days && !validDay(days)) return 'days'
  }
  return null
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function shortenText(value: string, max = 56): string {
  const s = String(value || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function inferNameFromUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const k of ['filename', 'file', 'name']) {
      const v = u.searchParams.get(k)
      if (v && v.trim()) return safeDecode(v.trim())
    }
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.length > 0) return safeDecode(segs[segs.length - 1])
    return u.hostname
  } catch {
    return ''
  }
}

function inferDisplayName(task: Task): string {
  const rawName = String(task.name || '').trim()
  const source = String(task.source || '').trim()
  if (rawName) {
    if (/^https?:\/\//i.test(rawName)) {
      const byUrl = inferNameFromUrl(rawName)
      if (byUrl) return shortenText(byUrl)
    }
    return shortenText(rawName)
  }
  if (/^https?:\/\//i.test(source)) {
    const byUrl = inferNameFromUrl(source)
    if (byUrl) return shortenText(byUrl)
  }
  if (/^magnet:\?/i.test(source)) {
    const dn = source.match(/[?&]dn=([^&]+)/i)?.[1]
    if (dn) return shortenText(safeDecode(dn))
    const btih = source.match(/btih:([a-zA-Z0-9]+)/i)?.[1]
    if (btih) return `magnet:${btih.slice(0, 12)}`
    return 'magnet'
  }
  return shortenText(source || task.id || '-')
}

function taskProgressPercent(task: Task): number {
  const total = Number(task.total_length || 0)
  const done = Number(task.completed_length || 0)
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, (done / total) * 100))
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

  const t = useCallback((k: string) => (I18N[locale] as Record<string, string>)[k] || k, [locale])
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
    void api.call('set_app_locale', { locale }).catch(() => {})
  }, [locale])

  const [tasks, setTasks] = useState<Task[]>([])
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [loading, setLoading] = useState(false)
  const {
    section,
    setSection,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
  } = useUiViewStore()
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const { tableLayouts, setTableLayouts } = useTableLayout()
  const [layoutOpen, setLayoutOpen] = useState(false)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [tableWrapWidth, setTableWrapWidth] = useState(0)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeDeleteFiles, setRemoveDeleteFiles] = useState(false)
  const [removeTask, setRemoveTask] = useState<Task | null>(null)
  const [removeTaskIds, setRemoveTaskIds] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [windowMoving, setWindowMoving] = useState(false)
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindings>(() => loadShortcutBindings())
  const [shortcutDraft, setShortcutDraft] = useState<ShortcutBindings>(() => loadShortcutBindings())
  const [shortcutDisplayMode, setShortcutDisplayMode] = useState<ShortcutDisplayMode>(
    () => loadShortcutDisplayMode(),
  )
  const [progressRowBackgroundEnabled, setProgressRowBackgroundEnabled] = useState<boolean>(
    () => loadProgressRowBackgroundEnabled(),
  )
  const [shortcutEditorOpen, setShortcutEditorOpen] = useState(false)
  const [shortcutEditingAction, setShortcutEditingAction] = useState<ShortcutAction | null>(null)
  const [shortcutCaptured, setShortcutCaptured] = useState('')
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [shortcutHelpQuery, setShortcutHelpQuery] = useState('')
  const [settingsTab, setSettingsTab] = useState('basic')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [siderCollapsed, setSiderCollapsed] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'url' | 'magnet' | 'torrent'>('url')
  const [addUrl, setAddUrl] = useState('')
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
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null)
  const [bridgeChecking, setBridgeChecking] = useState(false)
  const [bridgeWizardOpen, setBridgeWizardOpen] = useState(false)
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
  const [detailTrackers, setDetailTrackers] = useState<string[]>([])
  const [detailRuntimeOptions, setDetailRuntimeOptions] = useState({
    maxDownloadLimit: '',
    maxUploadLimit: '',
    maxConnectionPerServer: '',
    split: '',
    seedRatio: '',
    seedTime: '',
  })
  const [detailBtSummary, setDetailBtSummary] = useState('')
  const [detailRetryLogs, setDetailRetryLogs] = useState<OperationLog[]>([])
  const [dragHover, setDragHover] = useState(false)
  const [clipboardWatchEnabled, setClipboardWatchEnabled] = useState(false)
  const [notifyOnCompleteEnabled, setNotifyOnCompleteEnabled] = useState(true)
  const [postCompleteAction, setPostCompleteAction] = useState<'none' | 'open_dir' | 'open_file'>('none')
  const [speedPlanMode, setSpeedPlanMode] = useState<SpeedPlanMode>('manual')
  const lastClipboardRef = useRef('')
  const clipboardPromptingRef = useRef(false)
  const prevTaskStatusRef = useRef<Record<string, string>>({})
  const [firstRunOpen, setFirstRunOpen] = useState(false)
  const [fileSelectOpen, setFileSelectOpen] = useState(false)
  const [fileSelectTaskId, setFileSelectTaskId] = useState<string | null>(null)
  const [fileSelectRows, setFileSelectRows] = useState<TaskFile[]>([])
  const [selectedFileIndexes, setSelectedFileIndexes] = useState<number[]>([])
  const [fileSelectLoading, setFileSelectLoading] = useState(false)
  const movingTimerRef = useRef<number | null>(null)
  const effectiveThemeRef = useRef<'light' | 'dark'>('light')
  const systemMenuHandlersRef = useRef<{
    openAdd: () => void
    openImportExport: () => void
    refresh: () => void
    toggleTheme: () => void
    openSettings: () => void
    openAbout: () => void
    rpcPing: () => void
    startupCheck: () => void
  } | null>(null)

  const [settingsForm] = Form.useForm<GlobalSettings>()
  const [addForm] = Form.useForm<AddFormValues>()
  const currentLayout = tableLayouts[section]
  const columnWidths = currentLayout.columnWidths
  const urlValidationStatus = useMemo(() => {
    if (addType !== 'url') return ''
    const trimmed = addUrl.trim()
    if (!trimmed) return ''
    const detected = detectAddSource(trimmed)
    if (!detected) return 'warning'
    return detected.kind === 'url' ? 'success' : 'error'
  }, [addType, addUrl])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.call<Task[]>('list_tasks', { status: null, limit: 500, offset: 0 })
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
      const s = await api.call<GlobalSettings>('get_global_settings')
      const mode = normalizeThemeMode(s?.ui_theme)
      const speedPlanRules = normalizeSpeedPlanRules(
        (() => {
          try {
            return JSON.parse(String(s?.speed_plan || '[]'))
          } catch {
            return []
          }
        })(),
      )
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
        category_rules: Array.isArray(s?.category_rules) ? (s.category_rules as CategoryRule[]) : [],
        retry_max_attempts: s?.retry_max_attempts ?? undefined,
        retry_backoff_secs: s?.retry_backoff_secs ?? undefined,
        retry_fallback_mirrors: s?.retry_fallback_mirrors || undefined,
        metadata_timeout_secs: s?.metadata_timeout_secs ?? undefined,
        speed_plan: s?.speed_plan || undefined,
        speed_plan_rules: speedPlanRules,
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
      setSpeedPlanMode(inferSpeedPlanMode(speedPlanRules))
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
      setShortcutDraft(loadShortcutBindings())
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
      const d = await api.call('get_diagnostics')
      setDiagnosticsText(JSON.stringify(d, null, 2))
      const summary = await api.call<StartupSelfCheck>('startup_self_check_summary')
      setStartupSummary(summary)
    } catch (err) {
      setDiagnosticsText(parseErr(err))
      setStartupSummary(null)
    }
  }, [])

  const loadUpdateInfo = useCallback(async () => {
    try {
      const d = await api.call('check_aria2_update')
      setUpdateText(JSON.stringify(d, null, 2))
      const s = await api.call('get_app_update_strategy')
      setAppUpdateStrategyText(JSON.stringify(s, null, 2))
    } catch (err) {
      setUpdateText(parseErr(err))
    }
  }, [])

  const checkBridgeStatus = useCallback(async () => {
    setBridgeChecking(true)
    try {
      const status = await api.call<BrowserBridgeStatus>('check_browser_bridge_status')
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

  const loadStorageSummary = useCallback(async () => {
    try {
      const summary = await api.call<StorageSummary>('get_storage_summary')
      setStorageSummary(summary || null)
    } catch {
      setStorageSummary(null)
    }
  }, [])

  useEffect(() => {
    let unlistenTaskUpdate: (() => void) | null = null
    let disposed = false

    const bindTaskUpdate = async () => {
      try {
        unlistenTaskUpdate = await listen<Task[]>('task_update', (event) => {
          const updates = Array.isArray(event.payload) ? event.payload : []
          if (updates.length === 0) return
          setTasks((prev) => {
            const byId = new Map(prev.map((task) => [task.id, task] as const))
            for (const update of updates) {
              const current = byId.get(update.id)
              byId.set(update.id, current ? { ...current, ...update } : update)
            }
            return Array.from(byId.values())
          })
          setHasLoadedOnce(true)
        })
      } catch {
        // polling fallback still keeps list fresh when event listening is unavailable
      }
    }

    void refresh()
    void loadSettings()
    void loadStorageSummary()
    void bindTaskUpdate()

    const timer = setInterval(() => {
      if (disposed) return
      void refresh()
      void loadStorageSummary()
    }, 8000)

    return () => {
      disposed = true
      clearInterval(timer)
      if (unlistenTaskUpdate) unlistenTaskUpdate()
    }
  }, [refresh, loadSettings, loadStorageSummary])

  useEffect(() => {
    const checkStartupNotice = async () => {
      try {
        const notice = await api.call<StartupNotice | null>('consume_startup_notice')
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

  const suggestAndSetSaveDir = useCallback(async (taskType: 'http' | 'magnet' | 'torrent', source: string | null) => {
    try {
      const suggestion = await api.call<SaveDirSuggestion>('suggest_save_dir_detail', {
        taskType,
        source,
      })
      addForm.setFieldValue('save_dir', suggestion?.save_dir || '')
      setAddMatchedRule((suggestion?.matched_rule as DownloadRule) || null)
    } catch {
      setAddMatchedRule(null)
    }
  }, [addForm])

  const onOpenAdd = useCallback(async () => {
    setAddOpen(true)
    setAddType('url')
    setAddUrl('')
    setAddTorrentFile(null)
    setAddMatchedRule(null)
    addForm.setFieldsValue({
      url: '',
      magnet: '',
      save_dir: '',
      preset_name: '',
      preset_selected: undefined,
      out: '',
      merge_format: 'mp4',
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
    } catch {
      setAddMatchedRule(null)
    }
  }, [addForm, suggestAndSetSaveDir])

  const openAddFromDetected = useCallback(async (inferred: { kind: 'url' | 'magnet'; value: string }) => {
    await onOpenAdd()
    if (inferred.kind === 'magnet') {
      setAddType('magnet')
      addForm.setFieldValue('magnet', inferred.value)
      setAddUrl('')
      try {
        await suggestAndSetSaveDir('magnet', inferred.value)
      } catch {
        setAddMatchedRule(null)
      }
    } else {
      setAddType('url')
      addForm.setFieldValue('url', inferred.value)
      setAddUrl(inferred.value)
      try {
        await suggestAndSetSaveDir('http', inferred.value)
      } catch {
        setAddMatchedRule(null)
      }
    }
  }, [addForm, onOpenAdd, suggestAndSetSaveDir])

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
  }, [clipboardWatchEnabled, openAddFromDetected, t])

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
          void api.call('open_task_dir', { taskId: task.id })
        } else if (postCompleteAction === 'open_file') {
          void api.call('open_task_file', { taskId: task.id })
        }
        notification.success({
          message: `${t('taskDetails')}: ${task.name || task.id}`,
          description: t('filterCompleted'),
          btn: (
            <Space>
              <Button
                size="small"
                onClick={() => {
                  void api.call('open_task_dir', { taskId: task.id })
                }}
              >
                {t('openDir')}
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  void api.call('open_task_file', { taskId: task.id })
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

  const effectiveTheme = resolveTheme(themeMode)
  useEffect(() => {
    effectiveThemeRef.current = effectiveTheme
  }, [effectiveTheme])

  useEffect(() => {
    const darkCls = 'app-theme-dark'
    const lightCls = 'app-theme-light'
    const platformMacCls = 'app-platform-mac'
    const platformNonMacCls = 'app-platform-nonmac'
    document.body.classList.remove(darkCls, lightCls, platformMacCls, platformNonMacCls)
    document.body.classList.add(effectiveTheme === 'dark' ? darkCls : lightCls)
    document.body.classList.add(isMac ? platformMacCls : platformNonMacCls)
    return () => {
      document.body.classList.remove(darkCls, lightCls, platformMacCls, platformNonMacCls)
    }
  }, [effectiveTheme, isMac])

  useEffect(() => {
    const movingCls = 'app-window-moving'
    if (windowMoving) document.body.classList.add(movingCls)
    else document.body.classList.remove(movingCls)
    return () => {
      document.body.classList.remove(movingCls)
    }
  }, [windowMoving])

  useEffect(() => {
    const win = getCurrentWindow()
    const pulseMoving = () => {
      setWindowMoving(true)
      if (movingTimerRef.current) window.clearTimeout(movingTimerRef.current)
      movingTimerRef.current = window.setTimeout(() => {
        setWindowMoving(false)
      }, 140)
    }

    let unlistenMoved: (() => void) | null = null
    let unlistenResized: (() => void) | null = null
    ;(async () => {
      try {
        unlistenMoved = await win.onMoved(() => pulseMoving())
        unlistenResized = await win.onResized(() => pulseMoving())
      } catch {
        // no-op
      }
    })()

    return () => {
      if (movingTimerRef.current) window.clearTimeout(movingTimerRef.current)
      if (unlistenMoved) unlistenMoved()
      if (unlistenResized) unlistenResized()
      setWindowMoving(false)
    }
  }, [])
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
  const tableScroll = useMemo(
    () =>
      useVirtualTable
        ? { x: section === 'downloaded' ? 720 : 840, y: 'calc(100vh - 360px)' as const }
        : { x: section === 'downloaded' ? 720 : 840 },
    [section, useVirtualTable],
  )
  const onRowSelectionChange = useCallback((keys: React.Key[]) => {
    setSelectedTaskIds(keys.map((k) => String(k)))
  }, [])

  useEffect(() => {
    const visibleIds = new Set(list.map((task) => task.id))
    setSelectedTaskIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [list])

  const activeTaskCount = useMemo(
    () => tasks.filter((task) => String(task.status || '').toLowerCase() !== 'completed').length,
    [tasks],
  )
  const totalDownloadSpeed = useMemo(
    () => tasks.reduce((sum, task) => sum + Number(task.download_speed || 0), 0),
    [tasks],
  )

  const quickToggleTheme = useCallback(async () => {
    let nextMode: ThemeMode = 'light'
    setThemeMode((prev) => {
      const current = prev === 'system' ? effectiveThemeRef.current : prev
      nextMode = current === 'dark' ? 'light' : 'dark'
      return nextMode
    })
    settingsForm.setFieldValue('ui_theme', nextMode)
    try {
      await api.call('set_global_settings', { settings: { ui_theme: nextMode } })
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, settingsForm])

  const onPauseResume = useCallback(async (task: Task) => {
    try {
      if (String(task.status).toLowerCase() === 'paused') await api.call('resume_task', { taskId: task.id })
      else await api.call('pause_task', { taskId: task.id })
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, refresh])

  const onStopSeeding = useCallback(async (task: Task) => {
    try {
      await api.call('stop_seeding', { taskId: task.id })
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, refresh])

  const onMoveTaskPosition = useCallback(async (task: Task, action: 'top' | 'up' | 'down' | 'bottom') => {
    try {
      await api.call('move_task_position', { taskId: task.id, action })
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, refresh])

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
        await api.call('remove_task', { taskId, deleteFiles: removeDeleteFiles })
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
          await api.call('pause_task', { taskId })
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
          await api.call('resume_task', { taskId })
        }
      }
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const isRetriableTask = (task: Task): boolean => {
    const source = String(task.source || '').trim()
    if (!source) return false
    if (task.task_type === 'http') return /^https?:\/\//i.test(source) || /^ftps?:\/\//i.test(source)
    if (task.task_type === 'magnet') return source.startsWith('magnet:?')
    if (task.task_type === 'torrent') return source.toLowerCase().endsWith('.torrent')
    return false
  }

  const existingSourceSet = useMemo(() => {
    const set = new Set<string>()
    for (const task of tasks) {
      const source = String(task.source || '').trim().toLowerCase()
      if (!source) continue
      set.add(source)
    }
    return set
  }, [tasks])

  const confirmDuplicateAdd = useCallback(async (count: number) => {
    return await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: t('duplicateDetectedTitle'),
        content: i18nFormat(t('duplicateDetectedContent'), { count }),
        okText: t('continueAdd'),
        cancelText: t('cancel'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  }, [t])

  const retrySingleTask = async (task: Task) => {
    const options = {
      saveDir: task.save_dir || null,
      out: task.name || null,
    }
    if (task.task_type === 'http') {
      await api.call('add_url', { url: task.source, options })
      return
    }
    if (task.task_type === 'magnet') {
      await api.call('add_magnet', { magnet: task.source, options })
      return
    }
    if (task.task_type === 'torrent') {
      await api.call('add_torrent', {
        torrentFilePath: task.source,
        torrentBase64: null,
        options,
      })
      return
    }
    throw new Error(`unsupported retry task type: ${task.task_type}`)
  }

  const onGlobalPauseAll = useCallback(async () => {
    try {
      await api.call('pause_all')
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, refresh])

  const onGlobalResumeAll = useCallback(async () => {
    try {
      await api.call('resume_all')
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, refresh])

  const onGlobalRetryFailed = useCallback(async () => {
    try {
      const failed = tasks.filter((task) => String(task.status).toLowerCase() === 'error' && isRetriableTask(task))
      if (failed.length === 0) {
        msg.warning(t('noRetryableFailed'))
        return
      }
      let retried = 0
      for (const task of failed) {
        try {
          await retrySingleTask(task)
          retried += 1
        } catch {
          // keep going; a summary toast is shown below
        }
      }
      msg.success(i18nFormat(t('retriedCount'), { count: retried }))
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, refresh, t, tasks])

  const onGlobalClearCompleted = async () => {
    Modal.confirm({
      title: t('clearCompleted'),
      content: t('clearCompletedConfirm'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const completed = tasks.filter((task) => String(task.status).toLowerCase() === 'completed')
          for (const task of completed) {
            await api.call('remove_task', { taskId: task.id, deleteFiles: false })
          }
          await refresh()
          msg.success(i18nFormat(t('clearedCount'), { count: completed.length }))
        } catch (err) {
          msg.error(parseErr(err))
        }
      },
    })
  }

  const onOpenFile = useCallback(async (task: Task) => {
    try {
      await api.call('open_task_file', { taskId: task.id })
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg])

  const onOpenDir = useCallback(async (task: Task) => {
    try {
      await api.call('open_task_dir', { taskId: task.id })
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg])

  const onCopyPath = useCallback(async (task: Task) => {
    try {
      const path = await api.call<string>('get_task_primary_path', { taskId: task.id })
      await writeClipboardText(String(path || ''))
      msg.success(t('copy'))
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg, t])

  const onOpenFileSelection = useCallback(async (task: Task) => {
    try {
      setFileSelectLoading(true)
      const detail = await api.call<{ task: Task; files: TaskFile[] }>('get_task_detail', {
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
  }, [msg])

  const onOpenTaskDetail = useCallback(async (task: Task) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailTask(task)
    setDetailCategoryInput(String(task.category || ''))
    setDetailFiles([])
    setDetailRuntimeText('')
    setDetailTrackers([])
    setDetailRuntimeOptions({
      maxDownloadLimit: '',
      maxUploadLimit: '',
      maxConnectionPerServer: '',
      split: '',
      seedRatio: '',
      seedTime: '',
    })
    setDetailBtSummary('')
    setDetailRetryLogs([])
    try {
      const detail = await api.call<{ task: Task; files: TaskFile[] }>('get_task_detail', {
        taskId: task.id,
      })
      setDetailTask(detail?.task || task)
      setDetailCategoryInput(String((detail?.task || task)?.category || ''))
      setDetailFiles(Array.isArray(detail?.files) ? detail.files : [])
      try {
        const runtime = await api.call<unknown>('get_task_runtime_status', { taskId: task.id })
        setDetailRuntimeText(JSON.stringify(runtime ?? {}, null, 2))
        const asObj = runtime as {
          summary?: { peers_count?: number; seeders_count?: number; trackers_count?: number; trackers?: string[] }
        }
        const peers = Number(asObj?.summary?.peers_count || 0)
        const seeders = Number(asObj?.summary?.seeders_count || 0)
        const trackers = Number(asObj?.summary?.trackers_count || 0)
        const trackerList = Array.isArray(asObj?.summary?.trackers)
          ? asObj.summary.trackers
              .map((value) => String(value || '').trim())
              .filter((value) => value.length > 0)
          : []
        setDetailTrackers(trackerList)
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
        setDetailTrackers([])
      }
      const logs = await api.call<OperationLog[]>('list_operation_logs', { limit: 500 })
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
  }, [msg, t])

  const onSaveTaskCategory = async () => {
    if (!detailTask?.id) return
    try {
      const value = String(detailCategoryInput || '').trim()
      await api.call('set_task_category', {
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

  const onApplyTaskRuntimeOptions = async () => {
    if (!detailTask?.id) return
    try {
      const payload: Record<string, string> = {}
      const pushIfNotEmpty = (key: string, value: string) => {
        const trimmed = String(value || '').trim()
        if (!trimmed) return
        payload[key] = trimmed
      }
      pushIfNotEmpty('max-download-limit', detailRuntimeOptions.maxDownloadLimit)
      pushIfNotEmpty('max-upload-limit', detailRuntimeOptions.maxUploadLimit)
      pushIfNotEmpty('max-connection-per-server', detailRuntimeOptions.maxConnectionPerServer)
      pushIfNotEmpty('split', detailRuntimeOptions.split)
      pushIfNotEmpty('seed-ratio', detailRuntimeOptions.seedRatio)
      pushIfNotEmpty('seed-time', detailRuntimeOptions.seedTime)

      await api.call('set_task_runtime_options', {
        taskId: detailTask.id,
        options: payload,
      })
      msg.success(t('settingsSaved'))
      await onOpenTaskDetail(detailTask)
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const onApplyFileSelection = async () => {
    if (!fileSelectTaskId) return
    try {
      await api.call('set_task_file_selection', {
        taskId: fileSelectTaskId,
        selectedIndexes: selectedFileIndexes,
      })
      setFileSelectOpen(false)
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const fileSelectTreeData = useMemo(() => {
    type TreeNode = { title: string; key: string; children?: TreeNode[] }
    const rootChildren: TreeNode[] = []
    const folderMap = new Map<string, TreeNode>()

    const ensureFolder = (parts: string[]) => {
      let currentPath = ''
      let siblings = rootChildren
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part
        let node = folderMap.get(currentPath)
        if (!node) {
          node = { title: part, key: `d:${currentPath}`, children: [] }
          folderMap.set(currentPath, node)
          siblings.push(node)
        }
        siblings = node.children || []
      }
      return siblings
    }

    fileSelectRows.forEach((file, idx) => {
      const rawPath = String(file.path || '').replace(/\\/g, '/')
      const parts = rawPath.split('/').filter(Boolean)
      const fileName = parts.length > 0 ? parts[parts.length - 1] : `file-${idx + 1}`
      const folderParts = parts.slice(0, -1)
      const siblings = ensureFolder(folderParts)
      siblings.push({
        title: `${fileName} (${fmtBytes(file.length)})`,
        key: `f:${idx}`,
      })
    })

    return rootChildren
  }, [fileSelectRows])
  const allFileIndexes = useMemo(() => fileSelectRows.map((_, idx) => idx), [fileSelectRows])
  const checkedFileTreeKeys = useMemo(
    () => selectedFileIndexes.map((idx) => `f:${idx}`),
    [selectedFileIndexes],
  )
  const onFileTreeCheck = (checkedKeys: React.Key[] | { checked: React.Key[] }) => {
    const keys = Array.isArray(checkedKeys) ? checkedKeys : checkedKeys.checked
    const indexes = keys
      .map((key) => String(key))
      .filter((key) => key.startsWith('f:'))
      .map((key) => Number.parseInt(key.slice(2), 10))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b)
    setSelectedFileIndexes(indexes)
  }
  const onFileSelectAll = () => setSelectedFileIndexes(allFileIndexes)
  const onFileSelectNone = () => setSelectedFileIndexes([])
  const onFileSelectInvert = () => {
    setSelectedFileIndexes((prev) => {
      const selected = new Set(prev)
      return allFileIndexes.filter((idx) => !selected.has(idx))
    })
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
        setAddUrl('')
        setAddTorrentFile(file)
        try {
          await suggestAndSetSaveDir('torrent', file.name)
        } catch {
          setAddMatchedRule(null)
        }
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
      merge_format: String(values.merge_format || '').trim() || null,
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
    await api.call('set_global_settings', {
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
      await api.call('set_global_settings', {
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
        const lines = urlValue
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        const duplicates = lines.filter((line) => existingSourceSet.has(line.toLowerCase()))
        const invalid = lines.filter((line) => detectAddSource(line)?.kind !== 'url')
        if (invalid.length > 0) {
          throw new Error(`${t('invalidLines')}: ${invalid.slice(0, 3).join(' | ')}`)
        }
        if (duplicates.length > 0) {
          const allowContinue = await confirmDuplicateAdd(duplicates.length)
          if (!allowContinue) {
            setAddSubmitting(false)
            return
          }
        }
        for (const line of lines) {
          await api.call('add_url', {
            url: line,
            options: optionPayload,
          })
        }
        msg.success(i18nFormat(t('taskAddedCount'), { count: lines.length }))
      } else if (addType === 'magnet') {
        const lines = magnetValue
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        const duplicates = lines.filter((line) => existingSourceSet.has(line.toLowerCase()))
        const invalid = lines.filter((line) => detectAddSource(line)?.kind !== 'magnet')
        if (invalid.length > 0) {
          throw new Error(`${t('invalidLines')}: ${invalid.slice(0, 3).join(' | ')}`)
        }
        if (duplicates.length > 0) {
          const allowContinue = await confirmDuplicateAdd(duplicates.length)
          if (!allowContinue) {
            setAddSubmitting(false)
            return
          }
        }
        for (const line of lines) {
          await api.call('add_magnet', {
            magnet: line,
            options: optionPayload,
          })
        }
        msg.success(i18nFormat(t('taskAddedCount'), { count: lines.length }))
      } else {
        if (!addTorrentFile) throw new Error(t('torrentRequired'))
        const buf = await addTorrentFile.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
        await api.call('add_torrent', {
          torrentFilePath: null,
          torrentBase64: btoa(binary),
          options: optionPayload,
        })
        msg.success(t('taskAdded'))
      }
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
    const speedPlanRules = normalizeSpeedPlanRules(settingsForm.getFieldValue('speed_plan_rules'))
    const speedPlanError = validateSpeedPlanRules(speedPlanRules)
    if (speedPlanError) {
      msg.error(t('speedPlanInvalid'))
      return
    }
    const speedPlanJson = JSON.stringify(speedPlanRules)
    const normalizedShortcuts = Object.fromEntries(
      (Object.keys(shortcutDraft) as ShortcutAction[]).map((k) => [k, normalizeShortcut(shortcutDraft[k])]),
    ) as ShortcutBindings
    const duplicateShortcut = findDuplicateShortcut(normalizedShortcuts)
    if (duplicateShortcut) {
      msg.error(i18nFormat(t('shortcutDuplicate'), { key: duplicateShortcut }))
      return
    }
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
        speed_plan: speedPlanJson,
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
        category_rules: (values.category_rules || []).filter(
          (r) => r && String(r.pattern || '').trim() && String(r.category || '').trim(),
        ),
      }
      await api.call('set_global_settings', { settings: payload })
      setPostCompleteAction(
        payload.post_complete_action === 'open_dir' || payload.post_complete_action === 'open_file'
          ? payload.post_complete_action
          : 'none',
      )
      saveShortcutBindings(normalizedShortcuts)
      setShortcutBindings(normalizedShortcuts)
      setShortcutDraft(normalizedShortcuts)
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
      await api.call('set_global_settings', { settings: payload })
      msg.success(t('settingsSaved'))
      setFirstRunOpen(false)
      await loadSettings()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const detectAria2Path = async () => {
    try {
      const paths = await api.call<string[]>('detect_aria2_bin_paths')
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
          await api.call('reset_global_settings_to_defaults')
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

  const onSpeedPlanModeChange = (mode: SpeedPlanMode) => {
    setSpeedPlanMode(mode)
    if (mode === 'manual') return
    settingsForm.setFieldValue('speed_plan_rules', buildSpeedPlanPreset(mode))
  }

  const doRpcPing = async () => {
    try {
      const res = await api.call<string>('rpc_ping')
      msg.success(res)
      await loadDiagnostics()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doRestart = async () => {
    try {
      const res = await api.call<string>('restart_aria2')
      msg.success(res)
      await Promise.all([refresh(), loadDiagnostics()])
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doStartupCheck = async () => {
    try {
      const res = await api.call<string>('startup_check_aria2')
      msg.success(res)
      await loadDiagnostics()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doSaveSession = async () => {
    try {
      const res = await api.call<string>('save_session')
      msg.success(res)
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doExportDebugBundle = async () => {
    try {
      const path = await api.call<string>('export_debug_bundle')
      msg.success(i18nFormat(t('debugBundleSaved'), { path: path || '' }), 6)
      await loadDiagnostics()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const doUpdateAria2Now = async () => {
    try {
      const res = await api.call<{ message: string }>('update_aria2_now')
      msg.success(res?.message || 'Updated')
      await Promise.all([loadUpdateInfo(), loadDiagnostics()])
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const openImportExport = async () => {
    setIoOpen(true)
    try {
      const payload = await api.call<string>('export_task_list_json')
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
      const res = await api.call<ImportTaskListResult>('import_task_list_json', { payload })
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

  const openSettings = useCallback(async () => {
    setSettingsOpen(true)
    await Promise.all([loadSettings(), loadDiagnostics(), loadUpdateInfo(), checkBridgeStatus()])
  }, [checkBridgeStatus, loadDiagnostics, loadSettings, loadUpdateInfo])

  const openLogsWindow = useCallback(async () => {
    try {
      await api.call('open_logs_window')
    } catch (err) {
      msg.error(parseErr(err))
    }
  }, [msg])

  const openAboutDialog = useCallback(() => {
    Modal.info({
      title: 'Flamingo Downloader',
      content: 'Flamingo Downloader',
      okText: 'OK',
    })
  }, [])

  useEffect(() => {
    systemMenuHandlersRef.current = {
      openAdd: () => void onOpenAdd(),
      openImportExport: () => void openImportExport(),
      refresh: () => void refresh(),
      toggleTheme: () => void quickToggleTheme(),
      openSettings: () => void openSettings(),
      openAbout: () => void openAboutDialog(),
      rpcPing: () => void doRpcPing(),
      startupCheck: () => void doStartupCheck(),
    }
  }, [doRpcPing, doStartupCheck, onOpenAdd, openAboutDialog, openImportExport, refresh, quickToggleTheme, openSettings])

  useEffect(() => {
    let unlistenMenu: (() => void) | null = null
    const bindMenuAction = async () => {
      try {
        unlistenMenu = await listen<string>('system_menu_action', (event) => {
          const h = systemMenuHandlersRef.current
          if (!h) return
          const action = String(event.payload || '')
          if (!action) return
          switch (action) {
            case 'open_add':
              h.openAdd()
              break
            case 'open_import_export':
              h.openImportExport()
              break
            case 'refresh_list':
              h.refresh()
              break
            case 'toggle_theme':
              h.toggleTheme()
              break
            case 'open_settings':
              h.openSettings()
              break
            case 'open_about':
              h.openAbout()
              break
            case 'rpc_ping':
              h.rpcPing()
              break
            case 'startup_check':
              h.startupCheck()
              break
            default:
              break
          }
        })
      } catch {
        // ignore if event permission/listen unavailable
      }
    }
    void bindMenuAction()
    return () => {
      if (unlistenMenu) unlistenMenu()
    }
  }, [])

  const shortcutItems = useMemo(
    () =>
      [
        { key: 'new_download', label: t('shortcutNewDownload') },
        { key: 'focus_search', label: t('shortcutFocusSearch') },
        { key: 'refresh_list', label: t('shortcutRefreshList') },
        { key: 'open_settings', label: t('shortcutOpenSettings') },
        { key: 'open_logs', label: t('shortcutOpenLogs') },
        { key: 'toggle_theme', label: t('shortcutToggleTheme') },
        { key: 'pause_all', label: t('shortcutPauseAll') },
        { key: 'resume_all', label: t('shortcutResumeAll') },
        { key: 'retry_failed', label: t('shortcutRetryFailed') },
        { key: 'switch_downloading', label: t('shortcutSwitchDownloading') },
        { key: 'switch_downloaded', label: t('shortcutSwitchDownloaded') },
      ] as ShortcutItem[],
    [t],
  )
  const filteredShortcutItems = useMemo(() => {
    const q = shortcutHelpQuery.trim().toLowerCase()
    if (!q) return shortcutItems
    return shortcutItems.filter((item) => {
      const label = item.label.toLowerCase()
      const binding = formatShortcutForDisplayWithMode(
        shortcutDraft[item.key] || '',
        isMac,
        shortcutDisplayMode,
      ).toLowerCase()
      return label.includes(q) || binding.includes(q)
    })
  }, [isMac, shortcutDisplayMode, shortcutDraft, shortcutHelpQuery, shortcutItems])
  const shortcutLabelMap = useMemo(
    () =>
      new Map<ShortcutAction, string>(
        shortcutItems.map((item) => [item.key, item.label] as [ShortcutAction, string]),
      ),
    [shortcutItems],
  )

  const setShortcutBinding = (action: ShortcutAction, value: string) => {
    setShortcutDraft((prev) => ({ ...prev, [action]: normalizeShortcut(value) }))
  }

  const displayShortcut = useCallback(
    (value: string) => formatShortcutForDisplayWithMode(value, isMac, shortcutDisplayMode),
    [isMac, shortcutDisplayMode],
  )

  const openShortcutEditor = (action: ShortcutAction) => {
    setShortcutEditingAction(action)
    setShortcutCaptured(normalizeShortcut(shortcutDraft[action]))
    setShortcutEditorOpen(true)
  }

  const applyShortcutEditor = () => {
    if (!shortcutEditingAction) return
    setShortcutBinding(shortcutEditingAction, shortcutCaptured)
    setShortcutEditorOpen(false)
    setShortcutEditingAction(null)
  }
  const shortcutConflictAction = useMemo(
    () =>
      findShortcutConflictAction(shortcutDraft, shortcutCaptured, shortcutEditingAction || null),
    [shortcutCaptured, shortcutDraft, shortcutEditingAction],
  )

  const performShortcutAction = useCallback(
    async (action: ShortcutAction) => {
      switch (action) {
        case 'new_download':
          await onOpenAdd()
          break
        case 'focus_search': {
          const el = document.getElementById('task-search-input') as HTMLInputElement | null
          el?.focus()
          break
        }
        case 'refresh_list':
          await refresh()
          break
        case 'open_settings':
          await openSettings()
          break
        case 'open_logs':
          await openLogsWindow()
          break
        case 'toggle_theme':
          await quickToggleTheme()
          break
        case 'pause_all':
          await onGlobalPauseAll()
          break
        case 'resume_all':
          await onGlobalResumeAll()
          break
        case 'retry_failed':
          await onGlobalRetryFailed()
          break
        case 'switch_downloading':
          setSettingsOpen(false)
          setSection('downloading')
          break
        case 'switch_downloaded':
          setSettingsOpen(false)
          setSection('downloaded')
          break
        default:
          break
      }
    },
    [
      onOpenAdd,
      refresh,
      openSettings,
      openLogsWindow,
      quickToggleTheme,
      onGlobalPauseAll,
      onGlobalResumeAll,
      onGlobalRetryFailed,
      setSection,
    ],
  )

  useEffect(() => {
    if (!shortcutEditorOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setShortcutEditorOpen(false)
        setShortcutEditingAction(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setShortcutCaptured('')
        return
      }
      const binding = shortcutFromKeyboardEvent(e)
      if (!binding) return
      setShortcutCaptured(binding)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [shortcutEditorOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutEditorOpen) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() || ''
      const editing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable
      if (!import.meta.env.DEV) {
        if (e.key === 'F12') {
          e.preventDefault()
          return
        }
        if (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) {
          e.preventDefault()
          return
        }
      }
      if (editing) return
      for (const action of Object.keys(shortcutBindings) as ShortcutAction[]) {
        if (eventMatchesShortcut(e, shortcutBindings[action])) {
          e.preventDefault()
          void performShortcutAction(action)
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [performShortcutAction, shortcutBindings, shortcutEditorOpen])

  useEffect(() => {
    if (import.meta.env.DEV) return
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    window.addEventListener('contextmenu', onContextMenu)
    return () => window.removeEventListener('contextmenu', onContextMenu)
  }, [])

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
    [section, setTableLayouts],
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
      const maxNameWidth = section === 'downloaded' ? 156 : 230
      const dynamicName = Math.max(118, Math.min(maxNameWidth, tableWrapWidth - reserved))
      const nameWidth = tableWrapWidth > 0 ? dynamicName : 180

      const nameCol = {
        key: 'name',
        title: t('colName'),
        dataIndex: 'name',
        width: nameWidth,
        fixed: 'left' as const,
        ellipsis: true,
        render: (_: unknown, row: Task) => (
          <Space size={6}>
            <span>{inferDisplayName(row)}</span>
            {!!String(row.category || '').trim() && <Tag>{String(row.category)}</Tag>}
          </Space>
        ),
      }
      const actionsCol = {
        key: 'actions',
        title: t('colActions'),
        width:
          section === 'downloaded'
            ? Math.min(136, Number(columnWidths.actions || 136))
            : Math.min(146, Number(columnWidths.actions || 146)),
        fixed: 'right' as const,
        render: (_: unknown, row: Task) => (
          <Space wrap>
            {section !== 'downloaded' && (
              <Button size="small" onClick={() => onOpenTaskDetail(row)}>
                {t('details')}
              </Button>
            )}
            {section === 'downloaded' && (
              <Popover
                title={t('compactDetails')}
                trigger="click"
                content={
                  <Space direction="vertical" size={2}>
                    <Typography.Text type="secondary">{t('taskIdLabel')}: {row.id}</Typography.Text>
                    <Typography.Text type="secondary">{t('sourceLabel')}: {row.source || '-'}</Typography.Text>
                    <Typography.Text type="secondary">
                      {t('colStatus')}: {String(row.status).toLowerCase() === 'completed'
                        ? t('downloadResultSuccess')
                        : String(row.status).toLowerCase() === 'error'
                          ? t('downloadResultFailed')
                          : t('downloadResultInProgress')}
                    </Typography.Text>
                    <Typography.Text type="secondary">{t('colSize')}: {fmtBytes(row.total_length)}</Typography.Text>
                    <Typography.Text type="secondary">{t('colCompletedAt')}: {fmtDateTime(row.updated_at)}</Typography.Text>
                  </Space>
                }
              >
                <Button size="small">{t('compactDetails')}</Button>
              </Popover>
            )}
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
                  const percent = taskProgressPercent(row)
                  return (
                    <Typography.Text>{`${Number(percent.toFixed(1))}%`}</Typography.Text>
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
                width: Math.min(84, Number(columnWidths.status || 84)),
                render: (v: string, row: Task) => {
                  const status = String(v || '').toLowerCase()
                  const isCompleted = status === 'completed'
                  const isError = status === 'error'
                  const label = isCompleted
                    ? t('downloadResultSuccess')
                    : isError
                      ? t('downloadResultFailed')
                      : t('downloadResultInProgress')
                  const tag = <Tag color={statusColor(String(v))}>{label}</Tag>
                  if (isError && (row.error_message || row.error_code)) {
                    const errText = `${row.error_code ? `[${row.error_code}] ` : ''}${row.error_message || ''}`.trim()
                    return (
                      <Tooltip title={errText}>
                        {tag}
                      </Tooltip>
                    )
                  }
                  return tag
                },
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

  const TaskPageShell = section === 'downloaded' ? DownloadedPage : DownloadingPage

  return (
    <ConfigProvider
      theme={{
        algorithm: effectiveTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 14,
          colorPrimary: '#0A84FF',
          colorInfo: '#0A84FF',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          colorBgLayout: 'transparent',
          colorBgContainer:
            effectiveTheme === 'dark'
              ? 'rgba(20, 28, 40, 0.35)'
              : 'rgba(255, 255, 255, 0.55)',
          colorBgElevated:
            effectiveTheme === 'dark'
              ? 'rgba(30, 40, 56, 0.6)'
              : 'rgba(255, 255, 255, 0.75)',
          colorBgMask:
            effectiveTheme === 'dark'
              ? 'rgba(0, 0, 0, 0.3)'
              : 'rgba(0, 0, 0, 0.15)',
          boxShadowSecondary:
            effectiveTheme === 'dark'
              ? '0 16px 40px rgba(0, 0, 0, 0.4)'
              : '0 16px 40px rgba(0, 0, 0, 0.1)',
        },
      }}
    >
      <AntApp>
        {msgCtx}
        <Layout className={`root-layout theme-${effectiveTheme} ${siderCollapsed ? 'sider-collapsed' : ''} ${windowMoving ? 'window-moving' : ''}`}>
          <Sidebar
            effectiveTheme={effectiveTheme}
            siderCollapsed={siderCollapsed}
            settingsOpen={settingsOpen}
            section={section}
            tasks={tasks}
            t={t}
            setSettingsOpen={setSettingsOpen}
            setSection={setSection}
            openSettings={openSettings}
            setSiderCollapsed={setSiderCollapsed}
          />

          <Layout>
            <TopHeader
              t={t}
              locale={locale}
              setLocale={setLocale}
              onOpenAdd={onOpenAdd}
              openLogsWindow={openLogsWindow}
              quickToggleTheme={quickToggleTheme}
              refresh={refresh}
              loading={loading}
            />

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
              {!settingsOpen && (
              <>
              <Suspense fallback={null}>
              <TaskPageShell>
                <Card
                  className="main-card"
                  title={section === 'downloaded' ? t('downloadedList') : t('currentDownloads')}
                >
                <div className="list-toolbar">
                  <Space wrap className="list-toolbar-row">
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
                        {
                          value: '__uncategorized__',
                          label: `${t('categoryFilter')}: ${t('uncategorized')}`,
                        },
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
                  </Space>
                  <Space wrap className="list-toolbar-row">
                    {section === 'downloading' && (
                      <>
                        <Button size="small" onClick={onGlobalPauseAll}>{t('pauseAll')}</Button>
                        <Button size="small" onClick={onGlobalResumeAll}>{t('resumeAll')}</Button>
                        <Button size="small" onClick={onGlobalRetryFailed}>{t('retryFailed')}</Button>
                      </>
                    )}
                    {section === 'downloaded' && (
                      <Button size="small" danger onClick={onGlobalClearCompleted}>
                        {t('clearCompleted')}
                      </Button>
                    )}
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
                </div>
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
                    scroll={tableScroll}
                    rowSelection={{
                      selectedRowKeys: selectedTaskIds,
                      onChange: onRowSelectionChange,
                    }}
                    onRow={(row) => {
                      if (section === 'downloaded' || !progressRowBackgroundEnabled) return {}
                      const status = String(row.status || '').toLowerCase()
                      const percent = taskProgressPercent(row)
                      const className = `progress-row progress-${status}`
                      const style = {
                        '--row-progress-pct': `${Number(percent.toFixed(2))}%`,
                      } as React.CSSProperties
                      return { className, style }
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
              </TaskPageShell>
              </Suspense>
              {section === 'downloading' && (
                <div className="content-status-bar">
                  <Space size={16}>
                    <Typography.Text type="secondary">
                      {t('navDownloading')}:{' '}
                      <Typography.Text strong>{activeTaskCount}</Typography.Text>
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {t('colSpeed')}:{' '}
                      <Typography.Text strong>{fmtBytes(totalDownloadSpeed)}/s</Typography.Text>
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {t('freeSpace')}:{' '}
                      <Typography.Text strong>
                        {fmtBytes(Number(storageSummary?.free_bytes || 0))}
                      </Typography.Text>
                    </Typography.Text>
                  </Space>
                </div>
              )}
              </>
              )}
        {settingsOpen && (
          <Suspense fallback={null}>
        <SettingsPage>
            <SettingsView
              t={t}
              setSettingsOpen={setSettingsOpen}
              settingsTab={settingsTab}
              setSettingsTab={setSettingsTab}
              settingsForm={settingsForm}
              saveSettings={saveSettings}
              settingsSaving={settingsSaving}
              progressRowBackgroundEnabled={progressRowBackgroundEnabled}
              setProgressRowBackgroundEnabled={setProgressRowBackgroundEnabled}
              saveProgressRowBackgroundEnabled={saveProgressRowBackgroundEnabled}
              isMac={isMac}
              shortcutDisplayMode={shortcutDisplayMode}
              setShortcutDisplayMode={setShortcutDisplayMode}
              saveShortcutDisplayMode={saveShortcutDisplayMode}
              shortcutItems={shortcutItems}
              shortcutDraft={shortcutDraft}
              setShortcutDraft={setShortcutDraft}
              displayShortcut={displayShortcut}
              openShortcutEditor={(key) => openShortcutEditor(key as ShortcutAction)}
              setShortcutBinding={(key, binding) => setShortcutBinding(key as ShortcutAction, binding)}
              setShortcutHelpOpen={setShortcutHelpOpen}
              DEFAULT_SHORTCUT_BINDINGS={DEFAULT_SHORTCUT_BINDINGS}
              browseAria2Path={browseAria2Path}
              detectAria2Path={detectAria2Path}
              loadSettings={loadSettings}
              openImportExport={openImportExport}
              bridgeChecking={bridgeChecking}
              checkBridgeStatus={checkBridgeStatus}
              setBridgeWizardOpen={setBridgeWizardOpen}
              bridgeStatus={bridgeStatus}
              rotateBrowserBridgeToken={async () => {
                try {
                  const token = await api.call<string>('rotate_browser_bridge_token')
                  settingsForm.setFieldValue('browser_bridge_token', token)
                  msg.success(t('settingsSaved'))
                } catch (err) {
                  msg.error(parseErr(err))
                }
              }}
              speedPlanMode={speedPlanMode}
              onSpeedPlanModeChange={onSpeedPlanModeChange}
              resetUiLayout={resetUiLayout}
              resetSettingsToDefaults={resetSettingsToDefaults}
              startupSummary={startupSummary}
              doRpcPing={doRpcPing}
              doRestart={doRestart}
              doStartupCheck={doStartupCheck}
              doSaveSession={doSaveSession}
              doExportDebugBundle={doExportDebugBundle}
              loadDiagnostics={loadDiagnostics}
              diagnosticsText={diagnosticsText}
              loadUpdateInfo={loadUpdateInfo}
              doUpdateAria2Now={doUpdateAria2Now}
              updateText={updateText}
              appUpdateStrategyText={appUpdateStrategyText}
            />
        </SettingsPage>
          </Suspense>
        )}

            </Layout.Content>
          </Layout>
        </Layout>

        <ShortcutEditorDialog
          t={t}
          shortcutEditorOpen={shortcutEditorOpen}
          setShortcutEditorOpen={setShortcutEditorOpen}
          setShortcutEditingAction={(value) => setShortcutEditingAction(value as ShortcutAction | null)}
          applyShortcutEditor={applyShortcutEditor}
          shortcutEditingAction={shortcutEditingAction}
          displayShortcut={displayShortcut}
          shortcutDraft={shortcutDraft}
          shortcutCaptured={shortcutCaptured}
          shortcutConflictAction={shortcutConflictAction}
          shortcutLabelMap={shortcutLabelMap}
          i18nFormat={i18nFormat}
        />

        <ShortcutCheatsheetDialog
          t={t}
          shortcutHelpOpen={shortcutHelpOpen}
          setShortcutHelpOpen={setShortcutHelpOpen}
          shortcutHelpQuery={shortcutHelpQuery}
          setShortcutHelpQuery={setShortcutHelpQuery}
          filteredShortcutItems={filteredShortcutItems}
          displayShortcut={displayShortcut}
          shortcutDraft={shortcutDraft}
        />

        {addOpen && (
          <Suspense fallback={null}>
        <AddDownloadPage>
          <AddDownloadDialog
            t={t}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            addType={addType}
            onAddUrl={onAddUrl}
            addSubmitting={addSubmitting}
            addForm={addForm}
            urlValidationStatus={urlValidationStatus}
            setAddUrl={setAddUrl}
            suggestAndSetSaveDir={suggestAndSetSaveDir}
            addMatchedRule={addMatchedRule}
            setAddMatchedRule={setAddMatchedRule}
            addTorrentFile={addTorrentFile}
            setAddTorrentFile={setAddTorrentFile}
            presetOptionsForCurrentType={presetOptionsForCurrentType}
            onSaveCurrentPreset={onSaveCurrentPreset}
            onApplySelectedPreset={onApplySelectedPreset}
            onExportPresets={onExportPresets}
            onImportPresets={onImportPresets}
          />
        </AddDownloadPage>
          </Suspense>
        )}

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

        {detailOpen && (
          <Suspense fallback={null}>
        <TaskDetailPage>
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
                          await api.call('set_task_category', {
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
            <Card size="small" title={t('taskOptions')}>
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                <div className="grid-2">
                  <Form.Item label={t('maxDownloadLimit')} style={{ marginBottom: 8 }}>
                    <Input
                      placeholder="0 / 2M / 10M"
                      value={detailRuntimeOptions.maxDownloadLimit}
                      onChange={(e) =>
                        setDetailRuntimeOptions((prev) => ({ ...prev, maxDownloadLimit: e.target.value }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t('taskMaxUploadLimit')} style={{ marginBottom: 8 }}>
                    <Input
                      placeholder="0 / 1M / 5M"
                      value={detailRuntimeOptions.maxUploadLimit}
                      onChange={(e) =>
                        setDetailRuntimeOptions((prev) => ({ ...prev, maxUploadLimit: e.target.value }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t('taskMaxConn')} style={{ marginBottom: 8 }}>
                    <Input
                      value={detailRuntimeOptions.maxConnectionPerServer}
                      onChange={(e) =>
                        setDetailRuntimeOptions((prev) => ({ ...prev, maxConnectionPerServer: e.target.value }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t('taskSplit')} style={{ marginBottom: 8 }}>
                    <Input
                      value={detailRuntimeOptions.split}
                      onChange={(e) =>
                        setDetailRuntimeOptions((prev) => ({ ...prev, split: e.target.value }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t('seedRatio')} style={{ marginBottom: 8 }}>
                    <Input
                      value={detailRuntimeOptions.seedRatio}
                      onChange={(e) =>
                        setDetailRuntimeOptions((prev) => ({ ...prev, seedRatio: e.target.value }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t('seedTime')} style={{ marginBottom: 8 }}>
                    <Input
                      value={detailRuntimeOptions.seedTime}
                      onChange={(e) =>
                        setDetailRuntimeOptions((prev) => ({ ...prev, seedTime: e.target.value }))
                      }
                    />
                  </Form.Item>
                </div>
                <Button type="primary" onClick={onApplyTaskRuntimeOptions}>
                  {t('save')}
                </Button>
              </Space>
            </Card>
            <Card
              size="small"
              title={t('runtimeStatus')}
              loading={detailLoading}
              extra={
                <Button
                  size="small"
                  onClick={async () => {
                    if (!detailTask) return
                    await onOpenTaskDetail(detailTask)
                  }}
                >
                  {t('refresh')}
                </Button>
              }
            >
              {detailBtSummary && (
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {detailBtSummary}
                </Typography.Text>
              )}
              {detailTrackers.length > 0 && (
                <Space wrap style={{ marginBottom: 8 }}>
                  {detailTrackers.map((tracker, idx) => (
                    <Tag key={`${tracker}-${idx}`}>{tracker}</Tag>
                  ))}
                </Space>
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
        </TaskDetailPage>
          </Suspense>
        )}


        <Modal
          title={t('bridgePairWizard')}
          open={bridgeWizardOpen}
          onCancel={() => setBridgeWizardOpen(false)}
          footer={[
            <Button
              key="docs"
              onClick={() => {
                window.open('https://github.com/lc5900/flamingo-downloader/tree/main/browser-extension', '_blank')
              }}
            >
              {t('bridgeOpenDocs')}
            </Button>,
            <Button key="ok" type="primary" onClick={() => setBridgeWizardOpen(false)}>
              {t('done')}
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">{t('bridgeWizardStepInstall')}</Typography.Text>
            <Typography.Text type="secondary">{t('bridgeWizardStepOpen')}</Typography.Text>
            <Typography.Text type="secondary">{t('bridgeWizardStepPaste')}</Typography.Text>
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Typography.Text strong>{t('bridgeEndpoint')}</Typography.Text>
                  <Typography.Paragraph copyable style={{ marginBottom: 0 }}>
                    {String(
                      bridgeStatus?.endpoint ||
                        `http://127.0.0.1:${Number(settingsForm.getFieldValue('browser_bridge_port') || 16789)}`,
                    )}
                  </Typography.Paragraph>
                </div>
                <div>
                  <Typography.Text strong>{t('bridgeToken')}</Typography.Text>
                  <Typography.Paragraph copyable style={{ marginBottom: 0 }}>
                    {String(settingsForm.getFieldValue('browser_bridge_token') || '-')}
                  </Typography.Paragraph>
                </div>
                <Space wrap>
                  <Button
                    onClick={async () => {
                      const endpoint = String(
                        bridgeStatus?.endpoint ||
                          `http://127.0.0.1:${Number(settingsForm.getFieldValue('browser_bridge_port') || 16789)}`,
                      )
                      await writeClipboardText(endpoint)
                      msg.success(t('bridgeCopiedEndpoint'))
                    }}
                  >
                    {t('bridgeCopyEndpoint')}
                  </Button>
                  <Button
                    onClick={async () => {
                      const token = String(settingsForm.getFieldValue('browser_bridge_token') || '')
                      if (!token) {
                        msg.warning(t('bridgeTokenMissing'))
                        return
                      }
                      await writeClipboardText(token)
                      msg.success(t('bridgeCopiedToken'))
                    }}
                  >
                    {t('bridgeCopyToken')}
                  </Button>
                  <Button loading={bridgeChecking} onClick={checkBridgeStatus}>
                    {t('bridgeCheck')}
                  </Button>
                </Space>
                <Tag color={bridgeStatus?.connected ? 'green' : 'orange'}>
                  {t('bridgeStatus')}: {bridgeStatus?.connected ? t('bridgeConnected') : t('bridgeDisconnected')}
                </Tag>
              </Space>
            </Card>
          </Space>
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
                : removeTask
                  ? inferDisplayName(removeTask)
                  : '-'}
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
              <Space wrap size={8}>
                <Button size="small" onClick={onFileSelectAll}>{t('selectAll')}</Button>
                <Button size="small" onClick={onFileSelectNone}>{t('selectNone')}</Button>
                <Button size="small" onClick={onFileSelectInvert}>{t('invertSelection')}</Button>
                <Typography.Text type="secondary">
                  {t('selectedCount')}: {selectedFileIndexes.length} / {fileSelectRows.length}
                </Typography.Text>
              </Space>
              <Tree
                checkable
                defaultExpandAll
                selectable={false}
                checkedKeys={checkedFileTreeKeys}
                onCheck={onFileTreeCheck}
                treeData={fileSelectTreeData}
              />
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


