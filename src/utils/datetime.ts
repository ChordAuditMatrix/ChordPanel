import { currentLocaleRef } from '@/stores/i18n'

/**
 * Locale-aware date-time formatting for render-time display.
 *
 * - absent / zero values render as '-'
 * - numeric values (and numeric strings) are treated as epoch milliseconds
 * - otherwise the value is parsed as a date; unparseable strings are returned as-is
 * - valid values use the active locale (zh-CN / en-US) with a 24-hour clock
 */
export function formatDateTime(value?: number | string | null): string {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') {
    return '-'
  }

  const locale = currentLocaleRef.value === 'en' ? 'en-US' : 'zh-CN'

  let ms: number
  if (typeof value === 'number') {
    ms = value
  } else {
    const trimmed = value.trim()
    const numeric = Number(trimmed)
    if (trimmed !== '' && Number.isFinite(numeric)) {
      ms = numeric
    } else {
      const parsed = new Date(value)
      if (isNaN(parsed.getTime())) return value
      ms = parsed.getTime()
    }
  }

  const date = new Date(ms)
  if (isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '-'
  }
  return date.toLocaleString(locale, { hour12: false })
}
