import { ref, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalTheme } from 'naive-ui'

const THEME_STORAGE_KEY = 'chord-panel-theme'
export type ThemePreference = 'light' | 'dark' | null

export function resolveThemePreference(preference: ThemePreference, systemPrefersDark: boolean): boolean {
  return preference === 'dark' || (preference === null && systemPrefersDark)
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
const systemPrefersDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false
const isDark = ref(resolveThemePreference(preference.value, systemPrefersDark))

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (preference.value === null) isDark.value = event.matches
  })
}

const theme = ref<GlobalTheme | null>(null)

watch(isDark, (dark) => {
  theme.value = dark ? darkTheme : null
}, { immediate: true })

function setTheme(dark: boolean) {
  preference.value = dark ? 'dark' : 'light'
  isDark.value = dark
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference.value)
  } catch {
    /* Storage blocked — the in-memory theme still works. */
  }
}

function toggleTheme() {
  setTheme(!isDark.value)
}

export function useTheme() {
  return { isDark, theme, setTheme, toggleTheme }
}
