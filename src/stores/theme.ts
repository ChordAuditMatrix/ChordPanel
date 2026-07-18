import { ref, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalTheme } from 'naive-ui'

const isDark = ref(false)

function detectTheme() {
  if (window.matchMedia) {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
}

detectTheme()

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    isDark.value = e.matches
  })
}

const theme = ref<GlobalTheme | null>(null)

watch(isDark, (dark) => {
  theme.value = dark ? darkTheme : null
}, { immediate: true })

export function useTheme() {
  return { isDark, theme }
}
