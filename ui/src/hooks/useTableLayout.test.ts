import { describe, expect, it } from 'vitest'

import { defaultLayoutFor, sanitizeLayoutForSection } from './useTableLayout'

describe('defaultLayoutFor', () => {
  it('returns a defensive copy', () => {
    const layout = defaultLayoutFor('downloading')
    layout.columnOrder.push('fake')
    layout.hiddenColumns.push('name')
    layout.columnWidths.progress = 999

    expect(defaultLayoutFor('downloading').columnOrder).not.toContain('fake')
    expect(defaultLayoutFor('downloading').hiddenColumns).not.toContain('name')
    expect(defaultLayoutFor('downloading').columnWidths.progress).toBe(108)
  })
})

describe('sanitizeLayoutForSection', () => {
  it('clamps widths and removes unsupported columns', () => {
    const sanitized = sanitizeLayoutForSection('downloading', {
      columnWidths: {
        progress: 10,
        speed: 999,
      },
      columnOrder: ['speed', 'invalid', 'name'],
      hiddenColumns: ['status', 'invalid'],
      density: 'large',
    })

    expect(sanitized.columnWidths.progress).toBe(88)
    expect(sanitized.columnWidths.speed).toBe(140)
    expect(sanitized.columnOrder).toEqual(['speed', 'name', 'progress', 'eta', 'status', 'actions'])
    expect(sanitized.hiddenColumns).toEqual(['status'])
    expect(sanitized.density).toBe('large')
  })

  it('falls back to defaults for invalid payloads', () => {
    expect(sanitizeLayoutForSection('downloaded', null)).toEqual(defaultLayoutFor('downloaded'))
    expect(
      sanitizeLayoutForSection('downloaded', {
        density: 'huge',
        columnWidths: { completed_at: 'bad' },
      }),
    ).toEqual(defaultLayoutFor('downloaded'))
  })
})
