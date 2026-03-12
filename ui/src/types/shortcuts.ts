export type ShortcutAction =
  | 'new_download'
  | 'focus_search'
  | 'refresh_list'
  | 'open_settings'
  | 'open_logs'
  | 'toggle_theme'
  | 'pause_all'
  | 'resume_all'
  | 'retry_failed'
  | 'switch_downloading'
  | 'switch_downloaded'

export type ShortcutBindings = Record<ShortcutAction, string>

export type ShortcutItem = {
  key: ShortcutAction
  label: string
}
