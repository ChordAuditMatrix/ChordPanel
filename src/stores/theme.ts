import { ref, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalTheme } from 'naive-ui'

const THEME_STORAGE_KEY = 'chord-panel-theme'
export type ThemePreference = 'light' | 'dark' | null

export function resolveThemePreference(preference: ThemePreference, systemPrefersDark: boolean): boolean {
  return preference === 'dark' || (preference === null && systemPrefersDark)
}

export function resolveSystemThemeChange(
  preference: ThemePreference,
  systemPrefersDark: boolean,
  currentTheme: boolean,
): boolean {
  return preference === null ? systemPrefersDark : currentTheme
}

function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

const preference = ref<ThemePreference>(readThemePreference())
const systemPreferenceQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null
const systemPrefersDark = ref(systemPreferenceQuery?.matches ?? false)
const isDark = ref(resolveThemePreference(preference.value, systemPrefersDark.value))

systemPreferenceQuery?.addEventListener('change', (event) => {
  systemPrefersDark.value = event.matches
  isDark.value = resolveSystemThemeChange(preference.value, event.matches, isDark.value)
})

const theme = ref<GlobalTheme | null>(null)

watch(isDark, (dark) => {
  theme.value = dark ? darkTheme : null
}, { immediate: true })

function setThemePreference(next: ThemePreference) {
  preference.value = next
  isDark.value = resolveThemePreference(next, systemPrefersDark.value)
  if (typeof window === 'undefined') return
  try {
    if (next === null) window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    /* Storage blocked — the in-memory theme still works. */
  }
}

export function useTheme() {
  return { isDark, theme, preference, setThemePreference }
}
