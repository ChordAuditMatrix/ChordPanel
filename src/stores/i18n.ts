import { ref, computed } from 'vue'
import zhCN from '@/locales/zh-CN'
import en from '@/locales/en'

export type LocaleKey = 'zh-CN' | 'en'

export const LOCALES: { key: LocaleKey; label: string; shortLabel: string }[] = [
  { key: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { key: 'en', label: 'English', shortLabel: 'EN' },
]

const STORAGE_KEY = 'chord-panel-locale'

function loadLocale(): LocaleKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'zh-CN' || v === 'en') return v
  } catch { /* ignore */ }
  return 'zh-CN'
}

const currentLocale = ref<LocaleKey>(loadLocale())

const messages: Record<LocaleKey, any> = {
  'zh-CN': zhCN,
  en,
}

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

/**
 * Translation function.
 *   t('menu.dashboard')
 *   t('app.backendOffline', { url: 'http://...' })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = messages[currentLocale.value] || zhCN
  let val = getByPath(dict, key)
  if (val == null) {
    // Fall back to Chinese
    val = getByPath(zhCN, key)
  }
  if (val == null) return key
  if (params && typeof val === 'string') {
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  }
  return val as string
}

export function useI18n() {
  const locale = computed({
    get: () => currentLocale.value,
    set: (v: LocaleKey) => {
      currentLocale.value = v
      try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
    },
  })

  function setLocale(v: LocaleKey) {
    locale.value = v
  }

  return { locale, setLocale, t }
}

export const currentLocaleRef = currentLocale
