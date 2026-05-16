import type { Task } from '../types'

export type TaskAnalytics = {
  total: number
  statusCounts: Record<string, number>
  categoryCounts: Record<string, number>
  domainCounts: Record<string, number>
  sizeBuckets: Record<'small' | 'medium' | 'large' | 'huge', number>
  totalBytes: number
}

export function buildTaskAnalytics(tasks: Task[]): TaskAnalytics {
  const summary: TaskAnalytics = {
    total: tasks.length,
    statusCounts: {},
    categoryCounts: {},
    domainCounts: {},
    sizeBuckets: { small: 0, medium: 0, large: 0, huge: 0 },
    totalBytes: 0,
  }
  for (const task of tasks) {
    increment(summary.statusCounts, String(task.status || 'unknown').toLowerCase())
    increment(summary.categoryCounts, String(task.category || '').trim() || 'uncategorized')
    const domain = taskDomain(task.source)
    if (domain) increment(summary.domainCounts, domain)
    const size = Number(task.total_length || task.completed_length || 0)
    if (Number.isFinite(size) && size > 0) {
      summary.totalBytes += size
      incrementSizeBucket(summary.sizeBuckets, size)
    }
  }
  return summary
}

export function topEntries(counts: Record<string, number>, limit = 3): Array<[string, number]> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1
}

function incrementSizeBucket(target: TaskAnalytics['sizeBuckets'], bytes: number) {
  if (bytes >= 10 * 1024 ** 3) {
    target.huge += 1
  } else if (bytes >= 1024 ** 3) {
    target.large += 1
  } else if (bytes >= 100 * 1024 ** 2) {
    target.medium += 1
  } else {
    target.small += 1
  }
}

function taskDomain(source: string): string {
  try {
    return new URL(source).hostname.toLowerCase()
  } catch {
    return ''
  }
}
