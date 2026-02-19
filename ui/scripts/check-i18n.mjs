import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../src/i18n')
const enPath = path.join(root, 'en-US.json')
const zhPath = path.join(root, 'zh-CN.json')

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'))

const enKeys = new Set(Object.keys(en))
const zhKeys = new Set(Object.keys(zh))

const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k))
const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k))

function extractPlaceholders(value) {
  const text = String(value || '')
  const matches = text.match(/\{[a-zA-Z0-9_]+\}/g) || []
  return Array.from(new Set(matches.map((x) => x.slice(1, -1)))).sort()
}

const placeholderMismatches = []
for (const key of [...enKeys].filter((k) => zhKeys.has(k))) {
  const enVars = extractPlaceholders(en[key])
  const zhVars = extractPlaceholders(zh[key])
  const same = enVars.length === zhVars.length && enVars.every((v, i) => v === zhVars[i])
  if (!same) {
    placeholderMismatches.push({ key, enVars, zhVars })
  }
}

if (missingInZh.length || missingInEn.length || placeholderMismatches.length) {
  console.error('i18n checks failed')
  if (missingInZh.length) {
    console.error(`Missing in zh-CN (${missingInZh.length}):`)
    console.error(missingInZh.join('\n'))
  }
  if (missingInEn.length) {
    console.error(`Missing in en-US (${missingInEn.length}):`)
    console.error(missingInEn.join('\n'))
  }
  if (placeholderMismatches.length) {
    console.error(`Placeholder mismatch (${placeholderMismatches.length}):`)
    for (const item of placeholderMismatches) {
      console.error(`${item.key}: en={${item.enVars.join(',')}} zh={${item.zhVars.join(',')}}`)
    }
  }
  process.exit(1)
}

console.log(`i18n key+placeholder checks passed: ${enKeys.size} keys`)
