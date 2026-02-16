import {
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  theme,
  message,
} from 'antd'
import {
  CloudDownloadOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

type ThemeMode = 'system' | 'light' | 'dark'
type SectionKey = 'downloading' | 'downloaded'

type Task = {
  id: string
  source: string
  name?: string | null
  status: string
  total_length: number
  completed_length: number
  download_speed: number
  updated_at: number
}

type GlobalSettings = {
  ui_theme?: string | null
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
  return 'default'
}

export default function App() {
  const [msg, msgCtx] = message.useMessage()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [section, setSection] = useState<SectionKey>('downloading')
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [form] = Form.useForm<{ url: string }>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await invoke<Task[]>('list_tasks', { status: null, limit: 500, offset: 0 })
      setTasks(Array.isArray(list) ? list : [])
    } catch (err) {
      msg.error(String((err as Error)?.message || err))
    } finally {
      setLoading(false)
    }
  }, [msg])

  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke<GlobalSettings>('get_global_settings')
      const mode = String(settings?.ui_theme || 'system') as ThemeMode
      setThemeMode(mode === 'light' || mode === 'dark' ? mode : 'system')
    } catch {
      setThemeMode('system')
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
      if (themeMode === 'system') {
        setThemeMode('system')
      }
    }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [themeMode])

  const effectiveTheme = resolveTheme(themeMode)

  const list = useMemo(() => {
    return tasks.filter((t) => (section === 'downloaded' ? t.status === 'completed' : t.status !== 'completed'))
  }, [tasks, section])

  const onPauseResume = async (task: Task) => {
    try {
      if (String(task.status).toLowerCase() === 'paused') {
        await invoke('resume_task', { taskId: task.id })
      } else {
        await invoke('pause_task', { taskId: task.id })
      }
      await refresh()
    } catch (err) {
      msg.error(String((err as Error)?.message || err))
    }
  }

  const onRemove = async (task: Task) => {
    try {
      await invoke('remove_task', { taskId: task.id, deleteFiles: false })
      await refresh()
    } catch (err) {
      msg.error(String((err as Error)?.message || err))
    }
  }

  const onAddUrl = async () => {
    const values = await form.validateFields()
    try {
      await invoke('add_url', { url: values.url, options: {} })
      form.resetFields()
      setAddOpen(false)
      msg.success('Task added')
      await refresh()
    } catch (err) {
      msg.error(String((err as Error)?.message || err))
    }
  }

  const saveTheme = async (mode: ThemeMode) => {
    setThemeMode(mode)
    try {
      await invoke('set_global_settings', { settings: { ui_theme: mode } })
    } catch (err) {
      msg.error(String((err as Error)?.message || err))
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: effectiveTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 12,
          colorPrimary: '#1770ff',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        },
      }}
    >
      <AntApp>
        {msgCtx}
        <Layout className="root-layout">
          <Layout.Sider theme={effectiveTheme} width={220} className="side">
            <div className="brand">🦩</div>
            <Menu
              mode="inline"
              theme={effectiveTheme}
              selectedKeys={[section]}
              onClick={(e) => setSection(e.key as SectionKey)}
              items={[
                { key: 'downloading', icon: <DownloadOutlined />, label: 'Downloading' },
                { key: 'downloaded', icon: <FileDoneOutlined />, label: 'Downloaded' },
              ]}
            />
          </Layout.Sider>

          <Layout>
            <Layout.Header className="header">
              <Space wrap>
                <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => setAddOpen(true)}>
                  New Download
                </Button>
                <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
                  Settings
                </Button>
                <Button
                  icon={effectiveTheme === 'dark' ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                  onClick={() => saveTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
                >
                  {effectiveTheme === 'dark' ? 'Light' : 'Dark'}
                </Button>
                <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
                  Refresh
                </Button>
              </Space>
            </Layout.Header>

            <Layout.Content className="content">
              <Card title={section === 'downloaded' ? 'Downloaded' : 'Current Downloads'}>
                <Table<Task>
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 12 }}
                  dataSource={list}
                  columns={[
                    {
                      title: 'Name',
                      dataIndex: 'name',
                      render: (_, row) => row.name || row.source || row.id,
                    },
                    {
                      title: 'Progress',
                      render: (_, row) => {
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
                      title: 'Speed',
                      render: (_, row) => <Typography.Text>{fmtBytes(row.download_speed)}/s</Typography.Text>,
                    },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      render: (v) => <Tag color={statusColor(String(v))}>{String(v).toUpperCase()}</Tag>,
                    },
                    {
                      title: 'Actions',
                      render: (_, row) => (
                        <Space>
                          {row.status !== 'completed' && (
                            <Button size="small" onClick={() => onPauseResume(row)}>
                              {String(row.status).toLowerCase() === 'paused' ? 'Resume' : 'Pause'}
                            </Button>
                          )}
                          <Popconfirm title="Remove this task?" onConfirm={() => onRemove(row)}>
                            <Button size="small" danger>
                              Remove
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

        <Modal title="New URL Download" open={addOpen} onCancel={() => setAddOpen(false)} onOk={onAddUrl} okText="Add">
          <Form form={form} layout="vertical">
            <Form.Item name="url" label="URL" rules={[{ required: true, message: 'Please input URL' }]}>
              <Input placeholder="https://example.com/file.zip" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Appearance"
          open={settingsOpen}
          onCancel={() => setSettingsOpen(false)}
          onOk={() => setSettingsOpen(false)}
          okText="Close"
          cancelButtonProps={{ style: { display: 'none' } }}
        >
          <Typography.Paragraph type="secondary">
            Step 1 migration: React + Ant Design shell with theme and basic task actions.
          </Typography.Paragraph>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text strong>Theme Mode</Typography.Text>
            <Segmented
              block
              value={themeMode}
              options={[
                { label: 'System', value: 'system' },
                { label: 'Light', value: 'light' },
                { label: 'Dark', value: 'dark' },
              ]}
              onChange={(v) => saveTheme(v as ThemeMode)}
            />
          </Space>
        </Modal>
      </AntApp>
    </ConfigProvider>
  )
}
