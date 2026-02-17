import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { App as AntApp, Button, Card, ConfigProvider, Space, Table, Typography, message, theme } from 'antd'
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

function LogsApp() {
  const [msg, msgCtx] = message.useMessage()
  const [rows, setRows] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(false)

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
      void refresh()
    }, 2000)
    return () => clearInterval(timer)
  }, [refresh])

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
                <Button danger onClick={clearLogs}>
                  Clear
                </Button>
                <Button type="primary" onClick={closeWindow}>
                  Close
                </Button>
              </Space>
            }
          >
            <Table<OperationLog>
              rowKey={(row) => `${row.ts}-${row.action}-${row.message}`}
              loading={loading}
              columns={columns}
              dataSource={rows}
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
