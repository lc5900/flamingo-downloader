import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'dist', 'assets')
if (!fs.existsSync(root)) {
  console.error(`[bundle-size] dist assets not found: ${root}`)
  process.exit(1)
}

const rules = [
  { key: 'antd-vendor', re: /^antd-vendor-.*\.js$/, maxBytes: 950_000 },
  { key: 'react-vendor', re: /^react-vendor-.*\.js$/, maxBytes: 260_000 },
  { key: 'main-js', re: /^main-.*\.js$/, maxBytes: 180_000 },
  { key: 'main-css', re: /^main-.*\.css$/, maxBytes: 35_000 },
  { key: 'tauri-vendor', re: /^tauri-vendor-.*\.js$/, maxBytes: 30_000 },
]

const files = fs.readdirSync(root)
const report = []
let hasError = false

for (const rule of rules) {
  const matched = files.find((name) => rule.re.test(name))
  if (!matched) {
    report.push({
      key: rule.key,
      file: null,
      bytes: null,
      maxBytes: rule.maxBytes,
      status: 'missing',
    })
    hasError = true
    continue
  }
  const fp = path.join(root, matched)
  const bytes = fs.statSync(fp).size
  const status = bytes <= rule.maxBytes ? 'ok' : 'over'
  if (status !== 'ok') hasError = true
  report.push({
    key: rule.key,
    file: matched,
    bytes,
    maxBytes: rule.maxBytes,
    status,
  })
}

const totalJs = files
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.statSync(path.join(root, name)).size)
  .reduce((a, b) => a + b, 0)

const summary = {
  generatedAt: new Date().toISOString(),
  totalJsBytes: totalJs,
  totalJsMaxBytes: 1_700_000,
  totalJsStatus: totalJs <= 1_700_000 ? 'ok' : 'over',
  report,
}
if (summary.totalJsStatus !== 'ok') hasError = true

const outPath = path.resolve(process.cwd(), 'dist', 'bundle-size-report.json')
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2))

console.log('[bundle-size] report:')
for (const row of report) {
  console.log(
    ` - ${row.key}: ${row.file || 'missing'} | ${row.bytes ?? '-'} / ${row.maxBytes} | ${row.status}`,
  )
}
console.log(
  ` - total-js: ${summary.totalJsBytes} / ${summary.totalJsMaxBytes} | ${summary.totalJsStatus}`,
)
console.log(`[bundle-size] wrote ${outPath}`)

if (hasError) {
  process.exit(1)
}
