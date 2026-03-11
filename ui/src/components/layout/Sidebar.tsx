import type React from 'react'
import { Layout, Tooltip } from 'antd'
import {
  DownloadOutlined,
  FileDoneOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { SectionKey, Task } from '../../types'

interface SidebarProps {
  effectiveTheme: 'light' | 'dark'
  siderCollapsed: boolean
  settingsOpen: boolean
  section: SectionKey
  tasks: Task[]
  t: (k: string) => string
  setSettingsOpen: (v: boolean) => void
  setSection: React.Dispatch<React.SetStateAction<SectionKey>>
  openSettings: () => void
  setSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>
}

export const Sidebar: React.FC<SidebarProps> = ({
  effectiveTheme,
  siderCollapsed,
  settingsOpen,
  section,
  tasks,
  t,
  setSettingsOpen,
  setSection,
  openSettings,
  setSiderCollapsed,
}) => {
  return (
    <Layout.Sider
      theme={effectiveTheme}
      width={220}
      collapsedWidth={72}
      collapsed={siderCollapsed}
      trigger={null}
      className={`side ${siderCollapsed ? 'side-collapsed' : ''}`}
    >
      <div className="brand">
        <span className="brand-icon">🦩</span>
        {!siderCollapsed && <span className="brand-text">Flamingo</span>}
      </div>
      <div className="side-nav">
        <Tooltip title={siderCollapsed ? `${t('navDownloading')} (${tasks.filter((x) => x.status !== 'completed').length})` : undefined} placement="right">
          <button
            type="button"
            className={`side-nav-item ${!settingsOpen && section === 'downloading' ? 'active' : ''}`}
            onClick={() => {
              setSettingsOpen(false)
              setSection('downloading')
            }}
          >
            <DownloadOutlined className="side-nav-icon" />
            {!siderCollapsed && (
              <span className="side-nav-label">
                {t('navDownloading')}
                <span className="side-nav-count">{tasks.filter((x) => x.status !== 'completed').length}</span>
              </span>
            )}
          </button>
        </Tooltip>
        <Tooltip title={siderCollapsed ? `${t('navDownloaded')} (${tasks.filter((x) => x.status === 'completed').length})` : undefined} placement="right">
          <button
            type="button"
            className={`side-nav-item ${!settingsOpen && section === 'downloaded' ? 'active' : ''}`}
            onClick={() => {
              setSettingsOpen(false)
              setSection('downloaded')
            }}
          >
            <FileDoneOutlined className="side-nav-icon" />
            {!siderCollapsed && (
              <span className="side-nav-label">
                {t('navDownloaded')}
                <span className="side-nav-count">{tasks.filter((x) => x.status === 'completed').length}</span>
              </span>
            )}
          </button>
        </Tooltip>
        <Tooltip title={siderCollapsed ? t('settings') : undefined} placement="right">
          <button
            type="button"
            className={`side-nav-item ${settingsOpen ? 'active' : ''}`}
            onClick={openSettings}
          >
            <SettingOutlined className="side-nav-icon" />
            {!siderCollapsed && <span className="side-nav-label">{t('settings')}</span>}
          </button>
        </Tooltip>
      </div>
      <div className="side-footer">
        <Tooltip title={siderCollapsed ? t('expandSidebar') : t('collapseSidebar')} placement="right">
          <button
            type="button"
            className="side-collapse-btn"
            onClick={() => setSiderCollapsed((v) => !v)}
          >
            {siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </Tooltip>
      </div>
    </Layout.Sider>
  )
}

