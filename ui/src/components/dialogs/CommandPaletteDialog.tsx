import type React from 'react'
import { Input, List, Modal, Space, Tag, Typography } from 'antd'

export type CommandPaletteItem = {
  key: string
  label: string
  keywords?: string[]
  shortcut?: string
  disabled?: boolean
  run: () => void | Promise<void>
}

interface CommandPaletteDialogProps {
  open: boolean
  query: string
  items: CommandPaletteItem[]
  t: (k: string) => string
  onQueryChange: (value: string) => void
  onClose: () => void
}

export const CommandPaletteDialog: React.FC<CommandPaletteDialogProps> = ({
  open,
  query,
  items,
  t,
  onQueryChange,
  onClose,
}) => {
  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = normalizedQuery
    ? items.filter((item) =>
        [item.label, ...(item.keywords || [])]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : items

  const runItem = async (item: CommandPaletteItem) => {
    if (item.disabled) return
    onClose()
    await item.run()
  }

  return (
    <Modal
      title={t('commandPalette')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      className="command-palette-modal"
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) onQueryChange('')
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          className="command-palette-search"
          autoFocus
          allowClear
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filteredItems[0] && !filteredItems[0].disabled) {
              event.preventDefault()
              void runItem(filteredItems[0])
            }
          }}
          placeholder={t('commandPalettePlaceholder')}
        />
        <List
          size="small"
          dataSource={filteredItems}
          locale={{ emptyText: t('commandPaletteEmpty') }}
          renderItem={(item) => (
            <List.Item
              className={item.disabled ? 'command-palette-item disabled' : 'command-palette-item'}
              onClick={() => void runItem(item)}
            >
              <Space direction="vertical" size={2}>
                <Typography.Text disabled={item.disabled}>{item.label}</Typography.Text>
                {!!item.keywords?.length && (
                  <Typography.Text type="secondary">{item.keywords.slice(0, 3).join(' / ')}</Typography.Text>
                )}
              </Space>
              {item.shortcut && <Tag>{item.shortcut}</Tag>}
            </List.Item>
          )}
        />
      </Space>
    </Modal>
  )
}
