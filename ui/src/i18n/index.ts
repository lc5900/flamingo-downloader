import enUS from './en-US.json'
import zhCN from './zh-CN.json'
import type { Locale } from '../types'
import type { I18nKey } from './keys'

export const I18N: Record<Locale, Record<I18nKey, string>> = {
  'en-US': enUS as Record<I18nKey, string>,
  'zh-CN': zhCN as Record<I18nKey, string>,
}

export function detectLocale(): Locale {
  const langs = Array.isArray(navigator.languages) ? navigator.languages : []
  for (const l of langs) {
    const x = String(l || '').toLowerCase()
    if (x.startsWith('zh')) return 'zh-CN'
    if (x.startsWith('en')) return 'en-US'
  }
  const single = String(navigator.language || '').toLowerCase()
  if (single.startsWith('zh')) return 'zh-CN'
  return 'en-US'
}
