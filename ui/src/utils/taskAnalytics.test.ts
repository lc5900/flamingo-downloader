import { describe, expect, it } from 'vitest'

import type { Task } from '../types'
import { buildTaskAnalytics, topEntries } from './taskAnalytics'

const task = (partial: Partial<Task>): Task => ({
  id: partial.id || 'task',
  source: partial.source || 'https://example.com/file.bin',
  status: partial.status || 'completed',
  total_length: partial.total_length || 0,
  completed_length: partial.completed_length || 0,
  download_speed: 0,
  category: partial.category,
  name: partial.name,
})

describe('buildTaskAnalytics', () => {
  it('aggregates status, category, domain, and size buckets', () => {
    const summary = buildTaskAnalytics([
      task({ id: '1', source: 'https://a.example/movie.mp4', category: 'media', total_length: 2 * 1024 ** 3 }),
      task({ id: '2', source: 'https://a.example/readme.txt', category: '', total_length: 20 * 1024 ** 2 }),
      task({ id: '3', source: 'magnet:?xt=urn:btih:abc', status: 'error', total_length: 12 * 1024 ** 3 }),
    ])

    expect(summary.total).toBe(3)
    expect(summary.statusCounts).toEqual({ completed: 2, error: 1 })
    expect(summary.categoryCounts).toEqual({ media: 1, uncategorized: 2 })
    expect(summary.domainCounts).toEqual({ 'a.example': 2 })
    expect(summary.sizeBuckets).toEqual({ small: 1, medium: 0, large: 1, huge: 1 })
  })
})

describe('topEntries', () => {
  it('sorts by count and then key', () => {
    expect(topEntries({ b: 2, c: 3, a: 2 }, 2)).toEqual([
      ['c', 3],
      ['a', 2],
    ])
  })
})
