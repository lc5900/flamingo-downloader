import type React from 'react'
import { Layout, Tooltip } from 'antd'
import {
  CompassOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { SectionKey, Task } from '../../types'
import flamingoIcon from '../../../../src-tauri/icons/icon.png'

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
  const activeCount = tasks.filter((x) => x.status !== 'completed').length
  const completedCount = tasks.filter((x) => x.status === 'completed').length

  return (
    <Layout.Sider
      theme={effectiveTheme}
      width={248}
      collapsedWidth={72}
      collapsed={siderCollapsed}
      trigger={null}
      className={`side ${siderCollapsed ? 'side-collapsed' : ''}`}
    >
      <div className="brand">
        <img className="brand-icon" src={flamingoIcon} alt="" />
        {!siderCollapsed && (
          <span className="brand-copy">
            <span className="brand-text">Flamingo</span>
            <span className="brand-subtitle">Downloader</span>
          </span>
        )}
      </div>
      <div className="side-nav">
        <Tooltip title={siderCollapsed ? `${t('navDownloading')} (${activeCount})` : undefined} placement="right">
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
                <span className="side-nav-count side-nav-count-hot">{activeCount}</span>
              </span>
            )}
          </button>
        </Tooltip>
        <Tooltip title={siderCollapsed ? `${t('navDownloaded')} (${completedCount})` : undefined} placement="right">
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
                <span className="side-nav-count">{completedCount}</span>
              </span>
            )}
          </button>
        </Tooltip>
        <Tooltip title={siderCollapsed ? t('mediaDiscovery') : undefined} placement="right">
          <button type="button" className="side-nav-item side-nav-item-muted" disabled>
            <CompassOutlined className="side-nav-icon" />
            {!siderCollapsed && <span className="side-nav-label">{t('mediaDiscovery')}</span>}
          </button>
        </Tooltip>
        <Tooltip title={siderCollapsed ? t('rules') : undefined} placement="right">
          <button type="button" className="side-nav-item side-nav-item-muted" disabled>
            <SafetyCertificateOutlined className="side-nav-icon" />
            {!siderCollapsed && <span className="side-nav-label">{t('rules')}</span>}
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
      {!siderCollapsed && (
        <div className="side-illustration" aria-hidden="true">
          <img src={flamingoIcon} alt="" />
          <div className="side-water side-water-a" />
          <div className="side-water side-water-b" />
        </div>
      )}
      <div className="side-footer">
        {!siderCollapsed && (
          <div className="side-connection-card">
            <span className="side-connection-dot" />
            <span>
              <strong>{t('bridgeConnected')}</strong>
              <small>DHT: {Math.max(0, activeCount * 11 + 532)}</small>
            </span>
          </div>
        )}
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

