import { describe, expect, it } from 'vitest'

import {
  detectAddSource,
  fmtBytes,
  fmtEta,
  i18nFormat,
  parseErr,
  statusColor,
} from './format'

describe('parseErr', () => {
  it('prefers the error message when available', () => {
    expect(parseErr(new Error('boom'))).toBe('boom')
  })

  it('falls back to stringifying unknown values', () => {
    expect(parseErr(404)).toBe('404')
    expect(parseErr({ reason: 'bad' })).toBe('[object Object]')
  })
})

describe('fmtBytes', () => {
  it('formats zero and negative values as 0 B', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(-12)).toBe('0 B')
  })

  it('formats values across units', () => {
    expect(fmtBytes(1)).toBe('1 B')
    expect(fmtBytes(1024)).toBe('1.0 KB')
    expect(fmtBytes(1024 * 1024 * 5.2)).toBe('5.2 MB')
  })
})

describe('fmtEta', () => {
  it('returns fallback when speed is unavailable', () => {
    expect(fmtEta(100, 0, '-')).toBe('-')
  })

  it('formats seconds, minutes, and hours', () => {
    expect(fmtEta(1, 10, '-')).toBe('1s')
    expect(fmtEta(125, 1, '-')).toBe('2m 5s')
    expect(fmtEta(7200, 1, '-')).toBe('2h 0m')
  })
})

describe('i18nFormat', () => {
  it('replaces placeholder tokens', () => {
    expect(i18nFormat('Imported {tasks} tasks and {files} files', { tasks: 3, files: 8 })).toBe(
      'Imported 3 tasks and 8 files',
    )
  })
})

describe('detectAddSource', () => {
  it('detects magnet links and urls', () => {
    expect(detectAddSource(' magnet:?xt=urn:btih:abc ')).toEqual({
      kind: 'magnet',
      value: 'magnet:?xt=urn:btih:abc',
    })
    expect(detectAddSource('https://example.com/file.zip')).toEqual({
      kind: 'url',
      value: 'https://example.com/file.zip',
    })
    expect(detectAddSource('FTPS://example.com/file.zip')).toEqual({
      kind: 'url',
      value: 'FTPS://example.com/file.zip',
    })
  })

  it('returns null for unsupported input', () => {
    expect(detectAddSource('')).toBeNull()
    expect(detectAddSource('file:///tmp/test.zip')).toBeNull()
  })
})

describe('statusColor', () => {
  it('maps known statuses to tags and falls back to default', () => {
    expect(statusColor('active')).toBe('processing')
    expect(statusColor('paused')).toBe('warning')
    expect(statusColor('completed')).toBe('success')
    expect(statusColor('error')).toBe('error')
    expect(statusColor('metadata')).toBe('purple')
    expect(statusColor('queued')).toBe('default')
  })
})
