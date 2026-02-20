import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { App as AntApp, Button, Card, ConfigProvider, Input, Select, Space, Switch, Table, Typography, message, theme } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import './logs.css'

type OperationLog = {
  ts: number
  action: string
  message: string
}

function fmtTime(ts?: number): string {
  if (!ts || ts <= 0) return '-'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

function parseErr(err: unknown): string {
  return String((err as Error)?.message || err)
}

export default function LogsApp() {
  const [msg, msgCtx] = message.useMessage()
  const [rows, setRows] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [followTail, setFollowTail] = useState(true)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (window.getSelection()?.toString()) return
    setLoading(true)
    try {
      const list = await invoke<OperationLog[]>('list_operation_logs', { limit: 500 })
      setRows(Array.isArray(list) ? list : [])
    } catch (err) {
      msg.error(parseErr(err))
    } finally {
      setLoading(false)
    }
  }, [msg])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (!followTail) return
      void refresh()
    }, 2000)
    return () => clearInterval(timer)
  }, [followTail, refresh])

  const clearLogs = async () => {
    try {
      await invoke('clear_operation_logs')
      await refresh()
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const closeWindow = async () => {
    try {
      await invoke('close_logs_window')
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const actionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      const action = String(row.action || '').trim()
      if (action) set.add(action)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    const text = String(searchText || '').trim().toLowerCase()
    return rows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false
      if (!text) return true
      const merged = `${row.action || ''} ${row.message || ''}`.toLowerCase()
      return merged.includes(text)
    })
  }, [actionFilter, rows, searchText])

  const copySelected = async () => {
    const selected = filteredRows.filter((row) =>
      selectedRowKeys.includes(`${row.ts}-${row.action}-${row.message}`),
    )
    const target = selected.length > 0 ? selected : filteredRows
    const payload = target
      .map((row) => `${fmtTime(row.ts)}\t${row.action}\t${row.message}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(payload)
      msg.success(`Copied ${target.length} row(s)`)
    } catch (err) {
      msg.error(parseErr(err))
    }
  }

  const exportLogs = () => {
    const target = filteredRows
    const payload = target
      .map((row) => `${fmtTime(row.ts)}\t${row.action}\t${row.message}`)
      .join('\n')
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replaceAll(':', '-')
    a.href = url
    a.download = `flamingo-logs-${stamp}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const columns: ColumnsType<OperationLog> = [
    {
      key: 'ts',
      title: 'Time',
      dataIndex: 'ts',
      width: 200,
      render: (v: number) => <Typography.Text>{fmtTime(v)}</Typography.Text>,
    },
    {
      key: 'action',
      title: 'Action',
      dataIndex: 'action',
      width: 180,
      ellipsis: true,
    },
    {
      key: 'message',
      title: 'Message',
      dataIndex: 'message',
      ellipsis: true,
    },
  ]

  return (
    <ConfigProvider
      theme={{
        algorithm: window.matchMedia('(prefers-color-scheme: dark)').matches
          ? theme.darkAlgorithm
          : theme.defaultAlgorithm,
      }}
    >
      <AntApp>
        {msgCtx}
        <div className="logs-root">
          <Card
            className="logs-card"
            title="Operation Logs"
            extra={
              <Space>
                <Button onClick={() => void refresh()}>Refresh</Button>
                <Button onClick={copySelected}>Copy</Button>
                <Button onClick={exportLogs}>Export</Button>
                <Button danger onClick={clearLogs}>
                  Clear
                </Button>
                <Button type="primary" onClick={closeWindow}>
                  Close
                </Button>
              </Space>
            }
          >
            <Space wrap style={{ marginBottom: 10 }}>
              <Input.Search
                allowClear
                placeholder="Search action/message"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 260 }}
              />
              <Select
                value={actionFilter}
                onChange={setActionFilter}
                style={{ width: 220 }}
                options={[
                  { value: 'all', label: 'Action: All' },
                  ...actionOptions.map((action) => ({ value: action, label: `Action: ${action}` })),
                ]}
              />
              <Space>
                <Typography.Text type="secondary">Follow tail</Typography.Text>
                <Switch checked={followTail} onChange={setFollowTail} />
              </Space>
            </Space>
            <Table<OperationLog>
              rowKey={(row) => `${row.ts}-${row.action}-${row.message}`}
              loading={loading}
              columns={columns}
              dataSource={filteredRows}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys.map((k) => String(k))),
              }}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              scroll={{ y: 'calc(100vh - 190px)' }}
              size="small"
            />
          </Card>
        </div>
      </AntApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(<LogsApp />)
