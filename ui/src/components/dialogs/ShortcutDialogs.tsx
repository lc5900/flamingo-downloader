import type React from 'react'
import { Modal, Space, Typography, Input } from 'antd'

export interface ShortcutEditorDialogProps {
  t: (k: string) => string
  shortcutEditorOpen: boolean
  setShortcutEditorOpen: (v: boolean) => void
  setShortcutEditingAction: (v: string | null) => void
  applyShortcutEditor: () => void
  shortcutEditingAction: string | null
  displayShortcut: (s: any) => string
  shortcutDraft: Record<string, any>
  shortcutCaptured: any
  shortcutConflictAction: string | null
  shortcutLabelMap: Map<string, string>
  i18nFormat: (str: string, vars: Record<string, string>) => string
}

export const ShortcutEditorDialog: React.FC<ShortcutEditorDialogProps> = ({
  t,
  shortcutEditorOpen,
  setShortcutEditorOpen,
  setShortcutEditingAction,
  applyShortcutEditor,
  shortcutEditingAction,
  displayShortcut,
  shortcutDraft,
  shortcutCaptured,
  shortcutConflictAction,
  shortcutLabelMap,
  i18nFormat,
}) => {
  return (
    <Modal
      title={t('shortcutEditTitle')}
      open={shortcutEditorOpen}
      onCancel={() => {
        setShortcutEditorOpen(false)
        setShortcutEditingAction(null)
      }}
      onOk={applyShortcutEditor}
      okText={t('save')}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Typography.Text>
          {t('shortcutCurrent')}:{' '}
          <Typography.Text code>
            {shortcutEditingAction
              ? displayShortcut(shortcutDraft[shortcutEditingAction]) || '-'
              : '-'}
          </Typography.Text>
        </Typography.Text>
        <Typography.Text>
          {t('shortcutNew')}:{' '}
          <Typography.Text code>
            {displayShortcut(shortcutCaptured) || t('shortcutPress')}
          </Typography.Text>
        </Typography.Text>
        {shortcutConflictAction && (
          <Typography.Text type="warning">
            {i18nFormat(t('shortcutConflictWith'), {
              action: shortcutLabelMap.get(shortcutConflictAction) || shortcutConflictAction,
            })}
          </Typography.Text>
        )}
        <Typography.Text type="secondary">{t('shortcutRecording')}</Typography.Text>
      </Space>
    </Modal>
  )
}

export interface ShortcutCheatsheetDialogProps {
  t: (k: string) => string
  shortcutHelpOpen: boolean
  setShortcutHelpOpen: (v: boolean) => void
  shortcutHelpQuery: string
  setShortcutHelpQuery: (v: string) => void
  filteredShortcutItems: { key: string; label: string }[]
  displayShortcut: (s: any) => string
  shortcutDraft: Record<string, any>
}

export const ShortcutCheatsheetDialog: React.FC<ShortcutCheatsheetDialogProps> = ({
  t,
  shortcutHelpOpen,
  setShortcutHelpOpen,
  shortcutHelpQuery,
  setShortcutHelpQuery,
  filteredShortcutItems,
  displayShortcut,
  shortcutDraft,
}) => {
  return (
    <Modal
      title={t('shortcutCheatsheet')}
      open={shortcutHelpOpen}
      onCancel={() => setShortcutHelpOpen(false)}
      footer={null}
      width={680}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Input
          allowClear
          value={shortcutHelpQuery}
          onChange={(e) => setShortcutHelpQuery(e.target.value)}
          placeholder={t('shortcutSearchPlaceholder')}
        />
        <div className="shortcut-help-list">
          {filteredShortcutItems.map((item) => (
            <div key={item.key} className="shortcut-help-row">
              <Typography.Text>{item.label}</Typography.Text>
              <Typography.Text code>
                {displayShortcut(shortcutDraft[item.key]) || '-'}
              </Typography.Text>
            </div>
          ))}
        </div>
      </Space>
    </Modal>
  )
}
