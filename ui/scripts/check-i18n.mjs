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

if (missingInZh.length || missingInEn.length) {
  console.error('i18n key mismatch detected')
  if (missingInZh.length) {
    console.error(`Missing in zh-CN (${missingInZh.length}):`)
    console.error(missingInZh.join('\n'))
  }
  if (missingInEn.length) {
    console.error(`Missing in en-US (${missingInEn.length}):`)
    console.error(missingInEn.join('\n'))
  }
  process.exit(1)
}

console.log(`i18n key check passed: ${enKeys.size} keys`) 
