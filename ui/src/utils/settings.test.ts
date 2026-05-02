import { describe, expect, it } from 'vitest'

import {
  buildSpeedPlanPreset,
  inferSpeedPlanMode,
  normalizeSpeedPlanRules,
  normalizeThemeMode,
  parseTaskOptionPresets,
  validateSpeedPlanRules,
} from './settings'

describe('normalizeThemeMode', () => {
  it('accepts supported theme modes and falls back to system', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('unknown')).toBe('system')
  })
})

describe('speed plan helpers', () => {
  it('normalizes rule fields and drops empty limits', () => {
    expect(
      normalizeSpeedPlanRules([
        { days: ' 1,2 ', start: ' 09:00 ', end: ' 18:00 ', limit: ' 2M ' },
        { days: '', start: '', end: '', limit: ' ' },
      ]),
    ).toEqual([{ days: '1,2', start: '09:00', end: '18:00', limit: '2M' }])
  })

  it('detects built-in preset modes', () => {
    expect(inferSpeedPlanMode(buildSpeedPlanPreset('off'))).toBe('off')
    expect(inferSpeedPlanMode(buildSpeedPlanPreset('workday_limited'))).toBe(
      'workday_limited',
    )
    expect(inferSpeedPlanMode(buildSpeedPlanPreset('night_boost'))).toBe('night_boost')
    expect(inferSpeedPlanMode([{ days: '', start: '', end: '', limit: '5M' }])).toBe('manual')
  })

  it('validates malformed rules', () => {
    expect(validateSpeedPlanRules([{ limit: '' }])).toBe('limit')
    expect(validateSpeedPlanRules([{ start: '9:00', limit: '1M' }])).toBe('start')
    expect(validateSpeedPlanRules([{ end: '9:00', limit: '1M' }])).toBe('end')
    expect(validateSpeedPlanRules([{ start: '18:00', end: '09:00', limit: '1M' }])).toBe(
      'range',
    )
    expect(validateSpeedPlanRules([{ days: '0,8', limit: '1M' }])).toBe('days')
    expect(validateSpeedPlanRules([{ days: '1,2,3', start: '09:00', end: '18:00', limit: '1M' }])).toBeNull()
  })
})

describe('parseTaskOptionPresets', () => {
  it('parses, trims, and filters supported preset entries', () => {
    expect(
      parseTaskOptionPresets(`[
        {"name":" Video ","task_type":"http","options":{"out":"a.mp4","category":" media "}},
        {"name":"bad","task_type":"other","options":{}},
        {"name":"","task_type":"torrent","options":{}}
      ]`),
    ).toEqual([
      {
        name: 'Video',
        task_type: 'http',
        options: { out: 'a.mp4', category: 'media' },
      },
    ])
  })

  it('returns an empty array for invalid payloads', () => {
    expect(parseTaskOptionPresets('nope')).toEqual([])
    expect(parseTaskOptionPresets({})).toEqual([])
  })
})
