import {
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Divider,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Progress,
  Select,
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

type Locale = 'en-US' | 'zh-CN'
type ThemeMode = 'system' | 'light' | 'dark'
type SectionKey = 'downloading' | 'downloaded'
type MatcherType = 'ext' | 'domain' | 'type'

type Task = {
  id: string
  source: string
  name?: string | null
  status: string
  total_length: number
  completed_length: number
  download_speed: number
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
}

type AddFormValues = {
  url: string
  magnet: string
  save_dir?: string
}

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
    colStatus: 'Status',
    colActions: 'Actions',
    resume: 'Resume',
    pause: 'Pause',
    openDir: 'Open Dir',
    openFile: 'Open File',
    remove: 'Remove',
    removeConfirm: 'Remove this task?',
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
    urlRequired: 'Please input URL',
    magnetRequired: 'Please input magnet link',
    torrentRequired: 'Please select torrent file',
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
    grpAria2: 'aria2',
    aria2Path: 'aria2 Binary Path',
    detectAria2: 'Detect aria2 Path',
    reload: 'Reload',
    enableUpnp: 'Enable UPnP',
    grpIntegration: 'Integration',
    githubCdn: 'GitHub CDN Prefix',
    githubToken: 'GitHub Token',
    bridgeEnabled: 'Browser Bridge Enabled',
    bridgePort: 'Browser Bridge Port',
    bridgeToken: 'Browser Bridge Token',
    rulesTitle: 'Download Directory Rules',
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
    checkUpdate: 'Check aria2 Update',
    updateNow: 'Update aria2 Now',
    settingsSaved: 'Settings saved',
    noAria2Detected: 'No aria2 path detected',
    detectedPrefix: 'Detected',
    language: 'Language',
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
    colStatus: '状态',
    colActions: '操作',
    resume: '继续',
    pause: '暂停',
    openDir: '打开目录',
    openFile: '打开文件',
    remove: '删除',
    removeConfirm: '确认删除该任务？',
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
    urlRequired: '请输入链接',
    magnetRequired: '请输入磁力链接',
    torrentRequired: '请选择种子文件',
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
    grpAria2: 'aria2',
    aria2Path: 'aria2 可执行文件路径',
    detectAria2: '检测 aria2 路径',
    reload: '重新加载',
    enableUpnp: '启用 UPnP',
    grpIntegration: '集成',
    githubCdn: 'GitHub CDN 前缀',
    githubToken: 'GitHub Token',
    bridgeEnabled: '浏览器桥接启用',
    bridgePort: '浏览器桥接端口',
    bridgeToken: '浏览器桥接令牌',
    rulesTitle: '下载目录规则',
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
    checkUpdate: '检查 aria2 更新',
    updateNow: '立即更新 aria2',
    settingsSaved: '设置已保存',
    noAria2Detected: '未检测到 aria2 路径',
    detectedPrefix: '已检测',
    language: '语言',
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
  const [loading, setLoading] = useState(false)
  const [section, setSection] = useState<SectionKey>('downloading')
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('basic')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'url' | 'magnet' | 'torrent'>('url')
  const [addTorrentFile, setAddTorrentFile] = useState<File | null>(null)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [diagnosticsText, setDiagnosticsText] = useState('')
  const [updateText, setUpdateText] = useState('')

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
      })
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
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (themeMode === 'system') setThemeMode('system')
    }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [themeMode])

  const effectiveTheme = resolveTheme(themeMode)

  const list = useMemo(
    () => tasks.filter((x) => (section === 'downloaded' ? x.status === 'completed' : x.status !== 'completed')),
    [tasks, section],
  )

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

  const onRemove = async (task: Task) => {
    try {
      await invoke('remove_task', { taskId: task.id, deleteFiles: false })
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

  const onOpenAdd = async () => {
    setAddOpen(true)
    setAddType('url')
    setAddTorrentFile(null)
    addForm.setFieldsValue({ url: '', magnet: '', save_dir: '' })
    try {
      const dir = await invoke<string>('suggest_save_dir', { taskType: 'http', source: null })
      addForm.setFieldValue('save_dir', dir)
    } catch {}
  }

  const onAddUrl = async () => {
    const values = await addForm.validateFields()
    setAddSubmitting(true)
    try {
      if (addType === 'url') {
        await invoke('add_url', {
          url: values.url,
          options: { save_dir: values.save_dir || null },
        })
      } else if (addType === 'magnet') {
        await invoke('add_magnet', {
          magnet: values.magnet,
          options: { save_dir: values.save_dir || null },
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
          options: { save_dir: values.save_dir || null },
        })
      }
      msg.success(t('taskAdded'))
      setAddOpen(false)
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
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

  const doUpdateAria2Now = async () => {
    try {
      const res = await invoke<{ message: string }>('update_aria2_now')
      msg.success(res?.message || 'Updated')
      await Promise.all([loadUpdateInfo(), loadDiagnostics()])
    } catch (err) {
      msg.error(parseErr(err))
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
              <Card title={section === 'downloaded' ? t('downloadedList') : t('currentDownloads')}>
                <Table<Task>
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 12 }}
                  dataSource={list}
                  columns={[
                    {
                      title: t('colName'),
                      dataIndex: 'name',
                      render: (_: unknown, row: Task) => row.name || row.source || row.id,
                    },
                    {
                      title: t('colProgress'),
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
                      title: t('colSpeed'),
                      render: (_: unknown, row: Task) => <Typography.Text>{fmtBytes(row.download_speed)}/s</Typography.Text>,
                    },
                    {
                      title: t('colStatus'),
                      dataIndex: 'status',
                      render: (v: string) => <Tag color={statusColor(String(v))}>{String(v).toUpperCase()}</Tag>,
                    },
                    {
                      title: t('colActions'),
                      render: (_: unknown, row: Task) => (
                        <Space wrap>
                          {row.status !== 'completed' && (
                            <Button size="small" onClick={() => onPauseResume(row)}>
                              {String(row.status).toLowerCase() === 'paused' ? t('resume') : t('pause')}
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
                          <Popconfirm title={t('removeConfirm')} onConfirm={() => onRemove(row)}>
                            <Button size="small" danger icon={<DeleteOutlined />}>
                              {t('remove')}
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
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
        >
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
          </Form>
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
          styles={{
            body: {
              maxHeight: '72vh',
              overflow: 'hidden',
              paddingRight: 8,
            },
          }}
        >
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

                    <Divider />
                    <Typography.Title level={5}>{t('grpAria2')}</Typography.Title>
                    <Form.Item name="aria2_bin_path" label={t('aria2Path')}>
                      <Input />
                    </Form.Item>
                    <Space style={{ marginBottom: 12 }}>
                      <Button onClick={detectAria2Path}>{t('detectAria2')}</Button>
                      <Button onClick={loadSettings}>{t('reload')}</Button>
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
                  </Space>
                ),
              },
            ]}
          />
        </Modal>
      </AntApp>
    </ConfigProvider>
  )
}
