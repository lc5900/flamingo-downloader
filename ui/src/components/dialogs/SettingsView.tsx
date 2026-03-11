import type React from 'react'
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import type { BrowserBridgeStatus, GlobalSettings, StartupSelfCheck } from '../../types'
import type { ShortcutAction, ShortcutBindings, ShortcutItem } from '../../types/shortcuts'
import type { ShortcutDisplayMode } from '../../utils/shortcuts'

type SpeedPlanMode = 'manual' | 'off' | 'workday_limited' | 'night_boost'

export interface SettingsViewProps {
  t: (k: string) => string
  setSettingsOpen: (v: boolean) => void
  settingsTab: string
  setSettingsTab: (v: string) => void
  settingsForm: FormInstance<GlobalSettings>
  saveSettings: () => Promise<void>
  settingsSaving: boolean
  progressRowBackgroundEnabled: boolean
  setProgressRowBackgroundEnabled: (v: boolean) => void
  saveProgressRowBackgroundEnabled: (v: boolean) => void
  isMac: boolean
  shortcutDisplayMode: ShortcutDisplayMode
  setShortcutDisplayMode: (v: ShortcutDisplayMode) => void
  saveShortcutDisplayMode: (v: ShortcutDisplayMode) => void
  shortcutItems: ShortcutItem[]
  shortcutDraft: ShortcutBindings
  setShortcutDraft: Dispatch<SetStateAction<ShortcutBindings>>
  displayShortcut: (s: string) => string
  openShortcutEditor: (k: ShortcutAction) => void
  setShortcutBinding: (k: ShortcutAction, b: string) => void
  setShortcutHelpOpen: (v: boolean) => void
  DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings
  browseAria2Path: () => void
  detectAria2Path: () => void
  loadSettings: () => void
  openImportExport: () => void
  bridgeChecking: boolean
  checkBridgeStatus: () => Promise<void>
  setBridgeWizardOpen: (v: boolean) => void
  bridgeStatus: BrowserBridgeStatus | null
  rotateBrowserBridgeToken: () => void
  speedPlanMode: SpeedPlanMode
  onSpeedPlanModeChange: (v: SpeedPlanMode) => void
  resetUiLayout: () => void
  resetSettingsToDefaults: () => void
  startupSummary: StartupSelfCheck | null
  doRpcPing: () => void
  doRestart: () => void
  doStartupCheck: () => void
  doSaveSession: () => void
  doExportDebugBundle: () => void
  loadDiagnostics: () => void
  diagnosticsText: string
  loadUpdateInfo: () => void
  doUpdateAria2Now: () => void
  updateText: string
  appUpdateStrategyText: string
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  t,
  setSettingsOpen,
  settingsTab,
  setSettingsTab,
  settingsForm,
  saveSettings,
  settingsSaving,
  progressRowBackgroundEnabled,
  setProgressRowBackgroundEnabled,
  saveProgressRowBackgroundEnabled,
  isMac,
  shortcutDisplayMode,
  setShortcutDisplayMode,
  saveShortcutDisplayMode,
  shortcutItems,
  shortcutDraft,
  setShortcutDraft,
  displayShortcut,
  openShortcutEditor,
  setShortcutBinding,
  setShortcutHelpOpen,
  DEFAULT_SHORTCUT_BINDINGS,
  browseAria2Path,
  detectAria2Path,
  loadSettings,
  openImportExport,
  bridgeChecking,
  checkBridgeStatus,
  setBridgeWizardOpen,
  bridgeStatus,
  rotateBrowserBridgeToken,
  speedPlanMode,
  onSpeedPlanModeChange,
  resetUiLayout,
  resetSettingsToDefaults,
  startupSummary,
  doRpcPing,
  doRestart,
  doStartupCheck,
  doSaveSession,
  doExportDebugBundle,
  loadDiagnostics,
  diagnosticsText,
  loadUpdateInfo,
  doUpdateAria2Now,
  updateText,
  appUpdateStrategyText,
}) => {
  return (
    <Card
      className="main-card settings-card"
      title={t('settingsTitle')}
      extra={
        <Space>
          <Button onClick={() => setSettingsOpen(false)}>{t('cancel')}</Button>
          <Button type="primary" onClick={saveSettings} loading={settingsSaving}>
            {t('save')}
          </Button>
        </Space>
      }
    >
      <div className="settings-inline-body">
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
                    <Form.Item label={t('progressRowBackground')} style={{ marginTop: -2, marginBottom: 8 }}>
                      <Switch
                        checked={progressRowBackgroundEnabled}
                        checkedChildren={t('enabled')}
                        unCheckedChildren={t('disabled')}
                        onChange={(checked) => {
                          setProgressRowBackgroundEnabled(checked)
                          saveProgressRowBackgroundEnabled(checked)
                        }}
                      />
                    </Form.Item>
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: -6, marginBottom: 8 }}>
                      {t('shortcutHint')}
                    </Typography.Text>
                    <Typography.Title level={5}>{t('grpShortcuts')}</Typography.Title>
                    {isMac && (
                      <Form.Item label={t('shortcutDisplayMode')} style={{ maxWidth: 260, marginBottom: 10 }}>
                        <Select
                          value={shortcutDisplayMode}
                          onChange={(v) => {
                            const mode = v === 'symbol' ? 'symbol' : 'text'
                            setShortcutDisplayMode(mode)
                            saveShortcutDisplayMode(mode)
                          }}
                          options={[
                            { label: t('shortcutDisplayText'), value: 'text' },
                            { label: t('shortcutDisplaySymbol'), value: 'symbol' },
                          ]}
                        />
                      </Form.Item>
                    )}
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {shortcutItems.map((item) => (
                        <div key={item.key} className="grid-2" style={{ alignItems: 'center' }}>
                          <Typography.Text>{item.label}</Typography.Text>
                          <Space.Compact block>
                            <Input
                              value={displayShortcut(shortcutDraft[item.key])}
                              readOnly
                              placeholder={t('shortcutPress')}
                            />
                            <Button onClick={() => openShortcutEditor(item.key)}>{t('shortcutEdit')}</Button>
                            <Button onClick={() => setShortcutBinding(item.key, '')}>{t('shortcutClear')}</Button>
                          </Space.Compact>
                        </div>
                      ))}
                      <Space>
                        <Button onClick={() => setShortcutHelpOpen(true)}>{t('shortcutCheatsheet')}</Button>
                        <Button
                          onClick={() => {
                            setShortcutDraft({ ...DEFAULT_SHORTCUT_BINDINGS })
                          }}
                        >
                          {t('shortcutResetDefaults')}
                        </Button>
                      </Space>
                    </Space>

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
                      <Button onClick={browseAria2Path}>{t('browse')}</Button>
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
                    <Form.Item name="browser_bridge_allowed_origins" label={t('bridgeAllowedOrigins')}>
                      <Input placeholder="chrome-extension://,moz-extension://" />
                    </Form.Item>
                    <Space wrap style={{ marginBottom: 8 }}>
                      <Button loading={bridgeChecking} onClick={checkBridgeStatus}>
                        {t('bridgeCheck')}
                      </Button>
                      <Button onClick={rotateBrowserBridgeToken}>
                        {t('rotateBridgeToken')}
                      </Button>
                      <Button
                        loading={bridgeChecking}
                        onClick={async () => {
                          await saveSettings()
                          await checkBridgeStatus()
                        }}
                      >
                        {t('bridgeReconnect')}
                      </Button>
                      <Button onClick={() => setBridgeWizardOpen(true)}>{t('bridgePairWizard')}</Button>
                      <Tag color={bridgeStatus?.connected ? 'green' : 'orange'}>
                        {t('bridgeStatus')}: {bridgeStatus?.connected ? t('bridgeConnected') : t('bridgeDisconnected')}
                      </Tag>
                    </Space>
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: -4, marginBottom: 8 }}>
                      {bridgeStatus?.endpoint ? `${bridgeStatus.endpoint} - ${bridgeStatus.message}` : bridgeStatus?.message || '-'}
                    </Typography.Text>
                    <Form.Item name="clipboard_watch_enabled" label={t('clipboardWatchEnabled')} valuePropName="checked">
                      <Switch />
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
                    <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                      {t('speedPlan')}
                    </Typography.Text>
                    <Space wrap style={{ marginBottom: 10 }}>
                      <Typography.Text type="secondary">{t('scheduleMode')}</Typography.Text>
                      <Select
                        style={{ width: 260 }}
                        value={speedPlanMode}
                        onChange={(v) => onSpeedPlanModeChange(v as SpeedPlanMode)}
                        options={[
                          { label: t('scheduleManual'), value: 'manual' },
                          { label: t('scheduleOff'), value: 'off' },
                          { label: t('scheduleWorkdayLimited'), value: 'workday_limited' },
                          { label: t('scheduleNightBoost'), value: 'night_boost' },
                        ]}
                      />
                    </Space>
                    <Form.List name="speed_plan_rules">
                      {(fields, { add, remove }) => (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          {fields.map((field) => (
                            <Card key={field.key} size="small">
                              <div className="grid-rule">
                                <Form.Item name={[field.name, 'days']} label={t('speedDays')}>
                                  <Input placeholder="1,2,3,4,5 (Mon=1..Sun=7)" />
                                </Form.Item>
                                <Form.Item name={[field.name, 'start']} label={t('speedStart')}>
                                  <Input placeholder="09:00" />
                                </Form.Item>
                                <Form.Item name={[field.name, 'end']} label={t('speedEnd')}>
                                  <Input placeholder="18:00" />
                                </Form.Item>
                                <Form.Item name={[field.name, 'limit']} label={t('speedLimit')}>
                                  <Input placeholder="0 / 2M / 10M" />
                                </Form.Item>
                              </div>
                              <Button danger onClick={() => remove(field.name)}>
                                {t('removeRule')}
                              </Button>
                            </Card>
                          ))}
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() =>
                              add({
                                days: '',
                                start: '',
                                end: '',
                                limit: '0',
                              })
                            }
                          >
                            {t('addRule')}
                          </Button>
                        </Space>
                      )}
                    </Form.List>
                    <Form.Item name="speed_plan" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="auto_delete_control_files"
                      label={t('autoDeleteControlFiles')}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item name="auto_clear_completed_days" label={t('autoClearCompletedDays')}>
                      <InputNumber min={0} max={3650} style={{ width: '100%' }} />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>{isMac ? t('trayPrefsMac') : t('trayPrefs')}</Typography.Title>
                    <div className="grid-2">
                      <Form.Item name="start_minimized" label={t('startMinimized')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item
                        name="minimize_to_tray"
                        label={isMac ? t('minimizeToTrayMac') : t('minimizeToTray')}
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      {isMac && (
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: -8 }}>
                          {t('trayRecoverHintMac')}
                        </Typography.Text>
                      )}
                      {isMac && (
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                          {t('trayDisabledMac')}
                        </Typography.Text>
                      )}
                      <Form.Item name="notify_on_complete" label={t('notifyOnComplete')} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="post_complete_action" label={t('postCompleteAction')}>
                        <Select
                          options={[
                            { label: t('postCompleteNone'), value: 'none' },
                            { label: t('postCompleteOpenDir'), value: 'open_dir' },
                            { label: t('postCompleteOpenFile'), value: 'open_file' },
                          ]}
                        />
                      </Form.Item>
                    </div>
                    <Space style={{ marginBottom: 8 }}>
                      <Button onClick={resetUiLayout}>{t('resetUiLayout')}</Button>
                      <Button danger onClick={resetSettingsToDefaults}>{t('resetSettingsDefaults')}</Button>
                    </Space>

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
                                <Form.Item
                                  name={[field.name, 'subdir_by_domain']}
                                  label={t('subdirByDomain')}
                                  valuePropName="checked"
                                >
                                  <Switch />
                                </Form.Item>
                                <Form.Item
                                  name={[field.name, 'subdir_by_date']}
                                  label={t('subdirByDate')}
                                  valuePropName="checked"
                                >
                                  <Switch />
                                </Form.Item>
                              </div>
                              <Button danger onClick={() => remove(field.name)}>
                                {t('removeRule')}
                              </Button>
                            </Card>
                          ))}
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() =>
                              add({
                                enabled: true,
                                matcher: 'ext',
                                subdir_by_domain: false,
                                subdir_by_date: false,
                              })
                            }
                          >
                            {t('addRule')}
                          </Button>
                        </Space>
                      )}
                    </Form.List>
                    <Divider />
                    <Typography.Title level={5}>{t('categoryRulesTitle')}</Typography.Title>
                    <Form.List name="category_rules">
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
                                <Form.Item name={[field.name, 'category']} label={t('categoryName')}>
                                  <Input placeholder="video / docs / work" />
                                </Form.Item>
                              </div>
                              <Button danger onClick={() => remove(field.name)}>
                                {t('removeRule')}
                              </Button>
                            </Card>
                          ))}
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() =>
                              add({
                                enabled: true,
                                matcher: 'ext',
                                category: '',
                              })
                            }
                          >
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
                    <Card size="small" title={t('startupSelfCheck')}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Typography.Text>
                          aria2: <Typography.Text code>{startupSummary?.aria2_bin_path || '-'}</Typography.Text>
                        </Typography.Text>
                        <Typography.Text>
                          {t('aria2PathSource')}:{' '}
                          <Typography.Text code>
                            {startupSummary?.aria2_path_source === 'manual'
                              ? t('aria2SourceManual')
                              : startupSummary?.aria2_path_source === 'bundled'
                                ? t('aria2SourceBundled')
                                : t('aria2SourceSystem')}
                          </Typography.Text>
                        </Typography.Text>
                        <Space wrap>
                          <Tag color={startupSummary?.aria2_bin_exists ? 'green' : 'red'}>
                            bin {startupSummary?.aria2_bin_exists ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.aria2_bin_executable ? 'green' : 'red'}>
                            exec {startupSummary?.aria2_bin_executable ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.download_dir_exists ? 'green' : 'red'}>
                            dir {startupSummary?.download_dir_exists ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.download_dir_writable ? 'green' : 'red'}>
                            writable {startupSummary?.download_dir_writable ? t('statusOk') : t('statusFail')}
                          </Tag>
                          <Tag color={startupSummary?.rpc_ready ? 'green' : 'orange'}>
                            rpc {startupSummary?.rpc_ready ? t('statusOk') : t('statusFail')}
                          </Tag>
                        </Space>
                        <Typography.Text>
                          download dir:{' '}
                          <Typography.Text code>{startupSummary?.download_dir || '-'}</Typography.Text>
                        </Typography.Text>
                        <Typography.Text>
                          rpc endpoint:{' '}
                          <Typography.Text code>{startupSummary?.rpc_endpoint || '-'}</Typography.Text>
                        </Typography.Text>
                      </Space>
                    </Card>
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
      </div>
    </Card>
  )
}
