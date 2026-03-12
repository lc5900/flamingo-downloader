import type React from 'react'
import { Button, Dropdown, Layout, Space } from 'antd'
import {
  CloudDownloadOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import type { Locale } from '../../types'

interface TopHeaderProps {
  t: (k: string) => string
  locale: Locale
  setLocale: (l: Locale) => void
  onOpenAdd: () => void
  openLogsWindow: () => void
  quickToggleTheme: () => void
  refresh: () => void
  loading: boolean
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  t,
  locale,
  setLocale,
  onOpenAdd,
  openLogsWindow,
  quickToggleTheme,
  refresh,
  loading,
}) => {
  return (
    <Layout.Header className="header">
      <Space wrap>
        <Button type="primary" shape="round" icon={<CloudDownloadOutlined />} onClick={onOpenAdd}>
          {t('newDownload')}
        </Button>
        <Button shape="round" icon={<FileSearchOutlined />} onClick={openLogsWindow}>
          {t('logsWindow')}
        </Button>
        <Button shape="round" icon={<SyncOutlined />} onClick={quickToggleTheme}>
          {t('darkLight')}
        </Button>
        <Button shape="round" icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
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
          <Button shape="round" icon={<GlobalOutlined />}>
            {locale === 'zh-CN' ? '简体中文' : 'English'}
          </Button>
        </Dropdown>
      </Space>
    </Layout.Header>
  )
}
