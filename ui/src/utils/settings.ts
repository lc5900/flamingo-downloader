import type { AddPresetTaskType, TaskOptionPreset, ThemeMode } from '../types'

export type SpeedPlanRuleInput = {
  days?: string
  start?: string
  end?: string
  limit?: string
}

export type SpeedPlanMode = 'manual' | 'off' | 'workday_limited' | 'night_boost'

const SPEED_PLAN_PRESETS: Record<Exclude<SpeedPlanMode, 'manual'>, SpeedPlanRuleInput[]> = {
  off: [{ days: '', start: '', end: '', limit: '0' }],
  workday_limited: [
    { days: '1,2,3,4,5', start: '09:00', end: '18:00', limit: '2M' },
    { days: '', start: '', end: '', limit: '0' },
  ],
  night_boost: [
    { days: '1,2,3,4,5', start: '09:00', end: '23:00', limit: '1M' },
    { days: '6,7', start: '10:00', end: '23:00', limit: '2M' },
    { days: '', start: '', end: '', limit: '0' },
  ],
}

export function normalizeThemeMode(v: unknown): ThemeMode {
  const x = String(v || '').toLowerCase()
  if (x === 'light' || x === 'dark') return x
  return 'system'
}

export function normalizeSpeedPlanRules(input: unknown): SpeedPlanRuleInput[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as SpeedPlanRuleInput
      return {
        days: String(row.days || '').trim(),
        start: String(row.start || '').trim(),
        end: String(row.end || '').trim(),
        limit: String(row.limit || '').trim(),
      }
    })
    .filter((row) => row.limit)
}

export function buildSpeedPlanPreset(mode: SpeedPlanMode): SpeedPlanRuleInput[] {
  if (mode === 'manual') return []
  return SPEED_PLAN_PRESETS[mode].map((row) => ({ ...row }))
}

export function inferSpeedPlanMode(rules: SpeedPlanRuleInput[]): SpeedPlanMode {
  const normalized = JSON.stringify(normalizeSpeedPlanRules(rules))
  if (normalized === JSON.stringify(normalizeSpeedPlanRules(buildSpeedPlanPreset('off')))) {
    return 'off'
  }
  if (
    normalized ===
    JSON.stringify(normalizeSpeedPlanRules(buildSpeedPlanPreset('workday_limited')))
  ) {
    return 'workday_limited'
  }
  if (normalized === JSON.stringify(normalizeSpeedPlanRules(buildSpeedPlanPreset('night_boost')))) {
    return 'night_boost'
  }
  return 'manual'
}

export function validateSpeedPlanRules(rules: SpeedPlanRuleInput[]): string | null {
  const timeRe = /^\d{2}:\d{2}$/
  const validDay = (value: string) => {
    const parts = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (parts.length === 0) return true
    return parts.every((p) => {
      const n = Number(p)
      return Number.isInteger(n) && n >= 1 && n <= 7
    })
  }

  for (const row of rules) {
    const start = String(row.start || '').trim()
    const end = String(row.end || '').trim()
    const days = String(row.days || '').trim()
    const limit = String(row.limit || '').trim()
    if (!limit) return 'limit'
    if (start && !timeRe.test(start)) return 'start'
    if (end && !timeRe.test(end)) return 'end'
    if (start && end && start >= end) return 'range'
    if (days && !validDay(days)) return 'days'
  }
  return null
}

export function parseTaskOptionPresets(raw: unknown): TaskOptionPreset[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const preset = item as TaskOptionPreset
        const taskType = String(preset.task_type || '') as AddPresetTaskType
        const options =
          preset.options && typeof preset.options === 'object' ? preset.options : {}
        return {
          name: String(preset.name || '').trim(),
          task_type: taskType,
          options: {
            ...options,
            category: String(options.category || '').trim() || null,
          },
        }
      })
      .filter(
        (item) =>
          item.name &&
          (item.task_type === 'http' ||
            item.task_type === 'magnet' ||
            item.task_type === 'torrent'),
      )
  } catch {
    return []
  }
}
