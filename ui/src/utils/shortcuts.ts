export type ShortcutDisplayMode = 'text' | 'symbol'

export function normalizeShortcut(input: string): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return ''
  const mods = new Set(parts.map((p) => p.toLowerCase()))
  const out: string[] = []
  if (
    mods.has('cmdorctrl') ||
    mods.has('cmd') ||
    mods.has('meta') ||
    mods.has('ctrl') ||
    mods.has('control')
  ) {
    out.push('CmdOrCtrl')
  }
  if (mods.has('shift')) out.push('Shift')
  if (mods.has('alt') || mods.has('option')) out.push('Alt')
  const base = parts.find((p) => {
    const low = p.toLowerCase()
    return ![
      'cmdorctrl',
      'cmd',
      'meta',
      'ctrl',
      'control',
      'shift',
      'alt',
      'option',
    ].includes(low)
  })
  if (base) {
    if (base.length === 1) out.push(base.toUpperCase())
    else if (base.toLowerCase() === 'space') out.push('Space')
    else out.push(base)
  }
  return out.join('+')
}

function parseKeyFromEvent(e: KeyboardEvent): string {
  const key = String(e.key || '').trim()
  if (!key) return ''
  if (key === ' ') return 'Space'
  if (key === 'Esc') return 'Escape'
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function shortcutFromKeyboardEvent(e: KeyboardEvent): string {
  const key = parseKeyFromEvent(e)
  if (!key) return ''
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return ''
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(key)
  return normalizeShortcut(parts.join('+'))
}

export function eventMatchesShortcut(e: KeyboardEvent, binding: string): boolean {
  const normalized = normalizeShortcut(binding)
  if (!normalized) return false
  return shortcutFromKeyboardEvent(e) === normalized
}

export function formatShortcutForDisplayWithMode(
  shortcut: string,
  isMac: boolean,
  mode: ShortcutDisplayMode,
): string {
  const s = normalizeShortcut(shortcut)
  if (!s) return ''
  return s
    .split('+')
    .map((part) => {
      if (part === 'CmdOrCtrl') {
        if (isMac && mode === 'symbol') return '⌘'
        return isMac ? 'Cmd' : 'Ctrl'
      }
      if (part === 'Shift') {
        if (isMac && mode === 'symbol') return '⇧'
        return 'Shift'
      }
      if (part === 'Alt') {
        if (isMac && mode === 'symbol') return '⌥'
        return isMac ? 'Option' : 'Alt'
      }
      return part
    })
    .join('+')
}
