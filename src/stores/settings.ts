import { ref, watch } from 'vue'

export interface AppSettings {
  backendUrl: string
  pollInterval: number // ms
}

const STORAGE_KEY = 'chord-panel-settings'

const defaultSettings: AppSettings = {
  backendUrl: 'http://127.0.0.1:8080',
  pollInterval: 5000,
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...defaultSettings, ...parsed }
    }
  } catch {
    // ignore
  }
  return { ...defaultSettings }
}

const settings = ref<AppSettings>(loadSettings())

watch(settings, (val) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  } catch {
    // ignore
  }
}, { deep: true })

// Global connection state
const backendOnline = ref(false)

export function useSettings() {
  return {
    settings,
    backendOnline,
  }
}
