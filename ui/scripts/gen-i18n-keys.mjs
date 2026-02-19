import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../src/i18n')
const outPath = path.resolve(__dirname, '../src/i18n/keys.ts')
const enPath = path.join(root, 'en-US.json')

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const keys = Object.keys(en).sort()

const body = `export const I18N_KEYS = ${JSON.stringify(keys, null, 2)} as const\n\nexport type I18nKey = typeof I18N_KEYS[number]\n`
fs.writeFileSync(outPath, body)
console.log(`generated ${outPath} with ${keys.length} keys`)
