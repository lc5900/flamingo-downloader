import { describe, expect, it } from 'vitest'

import type { Task } from '../types'
import { matchesTaskQuery, parseTaskQuery } from './taskQuery'

const baseTask: Task = {
  id: 'task-1',
  task_type: 'http',
  source: 'https://cdn.example.com/media/movie.m3u8?token=secret',
  name: 'Movie 1080p.m3u8',
  status: 'error',
  save_dir: 'D:/Downloads/Video',
  category: 'media',
  total_length: 2 * 1024 ** 3,
  completed_length: 512 * 1024 ** 2,
  download_speed: 0,
  health: 'url_expired',
  error_message: 'expired manifest',
}

describe('parseTaskQuery', () => {
  it('parses plain terms, fields, and quoted values', () => {
    expect(parseTaskQuery('movie status:error category:"media archive"')).toEqual([
      { kind: 'term', value: 'movie' },
      { kind: 'field', key: 'status', value: 'error' },
      { kind: 'field', key: 'category', value: 'media archive' },
    ])
  })
})

describe('matchesTaskQuery', () => {
  it('keeps plain text search behavior', () => {
    expect(matchesTaskQuery(baseTask, 'movie expired')).toBe(true)
    expect(matchesTaskQuery(baseTask, 'linux iso')).toBe(false)
  })

  it('matches status, category, domain, and media type filters', () => {
    expect(matchesTaskQuery(baseTask, 'status:error category:media domain:example.com type:video')).toBe(true)
    expect(matchesTaskQuery(baseTask, 'status:completed')).toBe(false)
    expect(matchesTaskQuery(baseTask, 'type:archive')).toBe(false)
  })

  it('matches size comparisons with human units', () => {
    expect(matchesTaskQuery(baseTask, 'size:>1GB')).toBe(true)
    expect(matchesTaskQuery(baseTask, 'size:<=2GB')).toBe(true)
    expect(matchesTaskQuery(baseTask, 'size:<1GB')).toBe(false)
  })
})
