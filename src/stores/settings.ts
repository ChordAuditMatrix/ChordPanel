import { ref, watch } from 'vue'

export interface AppSettings {
  /** Backend origin used by production builds; empty string means same-origin '/api'. */
  backendUrl: string
  pollInterval: number // ms
  /** Persisted storage schema version (storage metadata, not user-editable). */
  schemaVersion: number
}

const STORAGE_KEY = 'chord-panel-settings'

/** Version of the persisted storage payload; bump whenever a migration is added. */
const SETTINGS_SCHEMA_VERSION = 2

/** Backend URL that pre-refactor builds persisted by default. */
const LEGACY_DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080'

const defaultSettings: AppSettings = {
  backendUrl: '', // empty = same-origin '/api'
  pollInterval: 5000,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
}

/** Trim surrounding whitespace and drop trailing slashes (the '/api' suffix is appended per request). */
export function normalizeBackendUrl(raw: string): string {
  return (raw || '').trim().replace(/\/+$/, '')
}
/** API prefix shared by the request adapter and the connection-status display. */
export function resolveApiBaseUrl(backendUrl: string, isDev: boolean): string {
  if (isDev) return '/api'
  const origin = normalizeBackendUrl(backendUrl)
  return origin ? `${origin}/api` : '/api'
}

function persistSettings(val: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  } catch {
    // ignore (storage unavailable or full)
  }
}

function loadSettings(): AppSettings {
  let stored: Partial<AppSettings> | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch {
    // ignore malformed storage; fall back to defaults
  }

  const merged: AppSettings = { ...defaultSettings, ...stored }
  merged.backendUrl = typeof merged.backendUrl === 'string'
    ? normalizeBackendUrl(merged.backendUrl)
    : defaultSettings.backendUrl

  // v1 → v2: same-origin deployments no longer need a backend URL, so the old
  // saved default is migrated to ''. User-configured origins are preserved.
  const storedVersion = typeof stored?.schemaVersion === 'number' ? stored.schemaVersion : 0
  if (storedVersion < SETTINGS_SCHEMA_VERSION && merged.backendUrl === LEGACY_DEFAULT_BACKEND_URL) {
    merged.backendUrl = defaultSettings.backendUrl
  }
  merged.schemaVersion = SETTINGS_SCHEMA_VERSION

  return merged
}

const settings = ref<AppSettings>(loadSettings())

// Write the migrated/normalized payload back right away so legacy localStorage
// entries do not linger until the next change (the watcher only fires on change).
persistSettings(settings.value)

watch(settings, (val) => {
  persistSettings(val)
}, { deep: true })

// Global connection state
const backendOnline = ref(false)

export function useSettings() {
  return {
    settings,
    backendOnline,
  }
}
