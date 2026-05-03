import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'dist', 'assets')
if (!fs.existsSync(root)) {
  console.error(`[bundle-size] dist assets not found: ${root}`)
  process.exit(1)
}

const splitRules = [
  { key: 'antd-vendor', re: /^antd-vendor-.*\.js$/, maxBytes: 880_000 },
  { key: 'ant-icons-vendor', re: /^ant-icons-vendor-.*\.js$/, maxBytes: 40_000 },
  { key: 'react-vendor', re: /^react-vendor-.*\.js$/, maxBytes: 260_000 },
  { key: 'tauri-vendor', re: /^tauri-vendor-.*\.js$/, maxBytes: 30_000 },
]

const files = fs.readdirSync(root)
const report = []
let hasError = false
const indexHtmlPath = path.resolve(process.cwd(), 'dist', 'index.html')
const indexHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf8') : ''

function fileSize(name) {
  return fs.statSync(path.join(root, name)).size
}

function firstMatch(re) {
  const match = indexHtml.match(re)
  return match?.[1] || null
}

const entryJs = firstMatch(/<script[^>]+src="\/assets\/([^"]+\.js)"/i)
const entryCss = firstMatch(/<link[^>]+href="\/assets\/([^"]+\.css)"/i)
const hasSplitVendors = splitRules.some((rule) => files.some((name) => rule.re.test(name)))

if (hasSplitVendors) {
  for (const rule of splitRules) {
    const matched = files.filter((name) => rule.re.test(name))
    if (matched.length === 0) {
      report.push({
        key: rule.key,
        files: [],
        bytes: null,
        maxBytes: rule.maxBytes,
        status: 'missing',
      })
      hasError = true
      continue
    }
    const bytes = matched.map((name) => fileSize(name)).reduce((a, b) => a + b, 0)
    const status = bytes <= rule.maxBytes ? 'ok' : 'over'
    if (status !== 'ok') hasError = true
    report.push({
      key: rule.key,
      files: matched,
      bytes,
      maxBytes: rule.maxBytes,
      status,
    })
  }
} else {
  for (const rule of splitRules) {
    report.push({
      key: rule.key,
      files: [],
      bytes: null,
      maxBytes: rule.maxBytes,
      status: 'not-applicable',
    })
  }
}

for (const rule of [
  { key: 'main-js', file: entryJs, maxBytes: hasSplitVendors ? 150_000 : 1_300_000 },
  { key: 'main-css', file: entryCss, maxBytes: 35_000 },
]) {
  if (!rule.file || !files.includes(rule.file)) {
    report.push({
      key: rule.key,
      files: [],
      bytes: null,
      maxBytes: rule.maxBytes,
      status: 'missing',
    })
    hasError = true
    continue
  }
  const bytes = fileSize(rule.file)
  const status = bytes <= rule.maxBytes ? 'ok' : 'over'
  if (status !== 'ok') hasError = true
  report.push({
    key: rule.key,
    files: [rule.file],
    bytes,
    maxBytes: rule.maxBytes,
    status,
  })
}

const totalJs = files
  .filter((name) => name.endsWith('.js'))
  .map((name) => fileSize(name))
  .reduce((a, b) => a + b, 0)

const summary = {
  generatedAt: new Date().toISOString(),
  totalJsBytes: totalJs,
  totalJsMaxBytes: 1_600_000,
  totalJsStatus: totalJs <= 1_600_000 ? 'ok' : 'over',
  report,
}
if (summary.totalJsStatus !== 'ok') hasError = true

const outPath = path.resolve(process.cwd(), 'dist', 'bundle-size-report.json')
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2))

console.log('[bundle-size] report:')
for (const row of report) {
  console.log(
    ` - ${row.key}: ${row.files?.join(', ') || 'missing'} | ${row.bytes ?? '-'} / ${row.maxBytes} | ${row.status}`,
  )
}
console.log(
  ` - total-js: ${summary.totalJsBytes} / ${summary.totalJsMaxBytes} | ${summary.totalJsStatus}`,
)
console.log(`[bundle-size] wrote ${outPath}`)

if (hasError) {
  process.exit(1)
}
