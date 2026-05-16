import type { Task } from '../types'

type QueryToken =
  | { kind: 'term'; value: string }
  | { kind: 'field'; key: string; value: string }

type SizeOperator = '>' | '>=' | '<' | '<=' | '='

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 ** 2,
  m: 1024 ** 2,
  gb: 1024 ** 3,
  g: 1024 ** 3,
  tb: 1024 ** 4,
  t: 1024 ** 4,
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'ts', 'm3u8', 'mpd'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'opus'])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'bz2'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'])

export function matchesTaskQuery(task: Task, rawQuery: string): boolean {
  const tokens = parseTaskQuery(rawQuery)
  if (tokens.length === 0) return true
  return tokens.every((token) => matchToken(task, token))
}

export function parseTaskQuery(rawQuery: string): QueryToken[] {
  return splitQuery(rawQuery)
    .map((part) => {
      const index = part.indexOf(':')
      if (index > 0) {
        const key = part.slice(0, index).trim().toLowerCase()
        const value = unquote(part.slice(index + 1).trim()).toLowerCase()
        if (key && value) return { kind: 'field' as const, key, value }
      }
      return { kind: 'term' as const, value: unquote(part).toLowerCase() }
    })
    .filter((token) => token.value.length > 0)
}

function matchToken(task: Task, token: QueryToken): boolean {
  if (token.kind === 'term') {
    return searchableText(task).includes(token.value)
  }
  if (token.key === 'status') return String(task.status || '').toLowerCase() === token.value
  if (token.key === 'category') return String(task.category || '').trim().toLowerCase() === token.value
  if (token.key === 'domain' || token.key === 'host') return taskDomain(task).includes(token.value)
  if (token.key === 'type' || token.key === 'kind') return taskMatchesType(task, token.value)
  if (token.key === 'size') return taskMatchesSize(task, token.value)
  return searchableText(task).includes(`${token.key}:${token.value}`)
}

function searchableText(task: Task): string {
  return [
    task.id,
    task.aria2_gid,
    task.name,
    task.source,
    task.save_dir,
    task.category,
    task.status,
    task.task_type,
    task.health,
    task.error_code,
    task.error_message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function taskDomain(task: Task): string {
  try {
    return new URL(task.source).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function taskMatchesType(task: Task, value: string): boolean {
  const taskType = String(task.task_type || '').toLowerCase()
  if (taskType === value) return true
  const ext = taskExtension(task)
  if (!ext) return false
  if (value === 'video') return VIDEO_EXTENSIONS.has(ext)
  if (value === 'audio') return AUDIO_EXTENSIONS.has(ext)
  if (value === 'archive') return ARCHIVE_EXTENSIONS.has(ext)
  if (value === 'image') return IMAGE_EXTENSIONS.has(ext)
  return ext === value.replace(/^\./, '')
}

function taskExtension(task: Task): string {
  const candidate = String(task.name || task.source || '')
  const path = candidate.split(/[?#]/, 1)[0] || ''
  const match = /\.([a-z0-9]{2,8})$/i.exec(path)
  return match ? match[1].toLowerCase() : ''
}

function taskMatchesSize(task: Task, value: string): boolean {
  const parsed = parseSizeExpression(value)
  if (!parsed) return false
  const actual = Number(task.total_length || task.completed_length || 0)
  if (!Number.isFinite(actual)) return false
  const [operator, expected] = parsed
  if (operator === '>') return actual > expected
  if (operator === '>=') return actual >= expected
  if (operator === '<') return actual < expected
  if (operator === '<=') return actual <= expected
  return actual === expected
}

function parseSizeExpression(value: string): [SizeOperator, number] | null {
  const match = /^(>=|<=|>|<|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*([a-z]*)$/i.exec(value.trim())
  if (!match) return null
  const operator = (match[1] || '=') as SizeOperator
  const amount = Number(match[2])
  const unit = (match[3] || 'b').toLowerCase()
  const multiplier = SIZE_UNITS[unit]
  if (!Number.isFinite(amount) || !multiplier) return null
  return [operator, amount * multiplier]
}

function splitQuery(rawQuery: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of rawQuery.trim()) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      current += char
      continue
    }
    if (char === quote) {
      quote = null
      current += char
      continue
    }
    if (/\s/.test(char) && quote === null) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
