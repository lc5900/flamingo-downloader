export function parseErr(err: unknown): string {
  return String((err as Error)?.message || err)
}

export function fmtBytes(n: number): string {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let value = n
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

export function fmtEta(remainingBytes: number, speedBytesPerSec: number, fallback: string): string {
  if (remainingBytes <= 0) return '0s'
  if (speedBytesPerSec <= 0) return fallback
  const total = Math.floor(remainingBytes / speedBytesPerSec)
  if (total <= 0) return '1s'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function fmtDateTime(ts?: number): string {
  if (!ts || ts <= 0) return '-'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export function fmtTime(ts?: number): string {
  if (!ts || ts <= 0) return '-'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString()
}

export function i18nFormat(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

export function detectAddSource(text: string): { kind: 'url' | 'magnet'; value: string } | null {
  const v = String(text || '').trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower.startsWith('magnet:?')) return { kind: 'magnet', value: v }
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('ftp://') ||
    lower.startsWith('ftps://')
  ) {
    return { kind: 'url', value: v }
  }
  return null
}

export function statusColor(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'active') return 'processing'
  if (s === 'paused') return 'warning'
  if (s === 'completed') return 'success'
  if (s === 'error') return 'error'
  if (s === 'metadata') return 'purple'
  return 'default'
}
