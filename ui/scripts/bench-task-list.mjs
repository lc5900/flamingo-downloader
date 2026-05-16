import { performance } from 'node:perf_hooks'

const taskCount = Number(process.env.TASK_BENCH_COUNT || 5000)
const iterations = Number(process.env.TASK_BENCH_ITERATIONS || 20)
const statuses = ['active', 'paused', 'queued', 'completed', 'error', 'metadata']
const categories = ['media', 'archive', 'docs', 'software', 'uncategorized']
const domains = ['cdn.example.com', 'mirror.example.org', 'media.example.net', 'files.example.io']

const tasks = Array.from({ length: taskCount }, (_, index) => {
  const status = statuses[index % statuses.length]
  const domain = domains[index % domains.length]
  const ext = index % 7 === 0 ? 'm3u8' : index % 5 === 0 ? 'zip' : 'bin'
  const total = (index % 2000) * 1024 * 1024
  return {
    id: `task-${index}`,
    source: `https://${domain}/downloads/file-${index}.${ext}`,
    name: `file-${index}.${ext}`,
    status,
    category: categories[index % categories.length],
    total_length: total,
    completed_length: status === 'completed' ? total : Math.floor(total / 2),
    download_speed: (index % 100) * 1024,
    updated_at: 1_700_000_000 + index,
  }
})

function matchesQuery(task, query) {
  const parts = query.toLowerCase().split(/\s+/).filter(Boolean)
  return parts.every((part) => {
    const [key, value] = part.includes(':') ? part.split(/:(.*)/s, 2) : ['', part]
    if (key === 'status') return task.status === value
    if (key === 'category') return task.category === value
    if (key === 'domain') return task.source.includes(value)
    if (key === 'size') return task.total_length > 1024 ** 3
    return `${task.id} ${task.name} ${task.source}`.toLowerCase().includes(value)
  })
}

function runListPass() {
  const filtered = tasks
    .filter((task) => task.status !== 'completed')
    .filter((task) => matchesQuery(task, 'status:error domain:example size:>1GB'))
    .sort((a, b) => b.download_speed - a.download_speed || b.updated_at - a.updated_at)
  const selected = new Set(filtered.slice(0, 200).map((task) => task.id))
  const visibleSelected = filtered.filter((task) => selected.has(task.id)).length
  const virtualWindow = filtered.slice(120, 220).map((task) => task.id)
  return { filtered: filtered.length, visibleSelected, virtualRows: virtualWindow.length }
}

const start = performance.now()
let last = null
for (let i = 0; i < iterations; i += 1) {
  last = runListPass()
}
const elapsedMs = performance.now() - start
const avgMs = elapsedMs / iterations
const budgetMs = Number(process.env.TASK_BENCH_BUDGET_MS || 35)
const report = {
  taskCount,
  iterations,
  avgMs: Number(avgMs.toFixed(2)),
  budgetMs,
  last,
}

console.log(`[task-list-bench] ${JSON.stringify(report)}`)
if (avgMs > budgetMs) {
  console.error(`[task-list-bench] average ${avgMs.toFixed(2)}ms exceeded budget ${budgetMs}ms`)
  process.exit(1)
}
