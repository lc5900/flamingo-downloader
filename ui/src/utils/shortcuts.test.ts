import { describe, expect, it } from 'vitest'

import {
  eventMatchesShortcut,
  formatShortcutForDisplayWithMode,
  normalizeShortcut,
} from './shortcuts'

describe('normalizeShortcut', () => {
  it('normalizes modifier aliases and key casing', () => {
    expect(normalizeShortcut('ctrl+shift+r')).toBe('CmdOrCtrl+Shift+R')
    expect(normalizeShortcut('meta+option+t')).toBe('CmdOrCtrl+Alt+T')
    expect(normalizeShortcut('space')).toBe('Space')
  })

  it('returns empty for invalid input', () => {
    expect(normalizeShortcut('')).toBe('')
    expect(normalizeShortcut('   ')).toBe('')
  })
})

describe('eventMatchesShortcut', () => {
  it('matches keyboard event against normalized shortcut', () => {
    const evt = {
      key: 'r',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
    } as unknown as KeyboardEvent
    expect(eventMatchesShortcut(evt, 'CmdOrCtrl+Shift+R')).toBe(true)
    expect(eventMatchesShortcut(evt, 'CmdOrCtrl+R')).toBe(false)
  })
})

describe('formatShortcutForDisplayWithMode', () => {
  it('renders symbols on macOS when symbol mode is enabled', () => {
    expect(formatShortcutForDisplayWithMode('CmdOrCtrl+Shift+R', true, 'symbol')).toBe('⌘+⇧+R')
    expect(formatShortcutForDisplayWithMode('CmdOrCtrl+Shift+R', true, 'text')).toBe(
      'Cmd+Shift+R',
    )
  })
})
