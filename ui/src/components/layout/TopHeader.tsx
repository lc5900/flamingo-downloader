import type React from 'react'
import { Button, Dropdown, Input, Layout, Space, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloudDownloadOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  MacCommandOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import type { Locale, SectionKey } from '../../types'

interface TopHeaderProps {
  t: (k: string) => string
  locale: Locale
  setLocale: (l: Locale) => void
  onOpenAdd: () => void
  openLogsWindow: () => void
  quickToggleTheme: () => void
  refresh: () => void
  openCommandPalette: () => void
  loading: boolean
  searchText: string
  setSearchText: (value: string) => void
  section: SectionKey
  setSection: (s: SectionKey) => void
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  t,
  locale,
  setLocale,
  onOpenAdd,
  openLogsWindow,
  quickToggleTheme,
  refresh,
  openCommandPalette,
  loading,
  searchText,
  setSearchText,
  section,
  setSection,
}) => {
  const sectionOrder: SectionKey[] = ['downloading', 'downloaded', 'media_discovery', 'rules']
  const cycleSection = (direction: -1 | 1) => {
    const idx = sectionOrder.indexOf(section)
    const next = (idx + direction + sectionOrder.length) % sectionOrder.length
    setSection(sectionOrder[next])
  }

  return (
    <Layout.Header className="header">
      <div className="header-inner">
        <Space size={8} className="header-nav-controls">
          <Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Back" onClick={() => cycleSection(-1)} />
          <Button shape="circle" icon={<ArrowRightOutlined />} aria-label="Forward" onClick={() => cycleSection(1)} />
        </Space>
        <Input
          id="global-task-search-input"
          className="header-search"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          prefix={<SearchOutlined />}
          suffix={<span className="header-kbd">Ctrl K</span>}
          placeholder={t('searchPlaceholder')}
        />
        <Space size={10} className="header-actions">
          <Button type="primary" shape="round" icon={<CloudDownloadOutlined />} onClick={onOpenAdd}>
          {t('newDownload')}
          </Button>
          <Button shape="round" icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            {t('refresh')}
          </Button>
          <Button shape="round" icon={<FileSearchOutlined />} onClick={openLogsWindow}>
            {t('logsWindow')}
          </Button>
          <Tooltip title={t('darkLight')}>
            <Button shape="circle" icon={<SyncOutlined />} onClick={quickToggleTheme} aria-label={t('darkLight')} />
          </Tooltip>
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
          <Tooltip title={t('commandPalette')}>
            <Button
              shape="round"
              icon={<MacCommandOutlined />}
              onClick={openCommandPalette}
              className="command-pill"
            >
              P
            </Button>
          </Tooltip>
        </Space>
      </div>
    </Layout.Header>
  )
}
