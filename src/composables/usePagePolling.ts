import { onMounted, onUnmounted, watch } from 'vue'
import { useSettings } from '@/stores/settings'

/**
 * Global page polling mechanism.
 *
 * Install once in AppLayout via setupGlobalPolling(() => route.path).
 * Per page: const { register } = usePagePolling(); register(fetchData, route.path)
 *
 * Features:
 * - Only the active route's handlers are polled; switching routes auto-pauses others
 * - Interval follows settings.pollInterval; changing the setting takes effect immediately
 */
type FetchFn = () => void | Promise<void>

const handlers = new Map<string, Set<FetchFn>>()
let globalTimer: ReturnType<typeof setInterval> | null = null
let currentInterval = 0
let activeRoute = ''

function tick() {
  const set = handlers.get(activeRoute)
  if (!set) return
  set.forEach(fn => {
    try { fn() } catch (e) { console.error('[polling] handler error', e) }
  })
}

function ensureTimer() {
  const { settings } = useSettings()
  if (globalTimer && currentInterval === settings.value.pollInterval) return
  if (globalTimer) clearInterval(globalTimer)
  currentInterval = settings.value.pollInterval
  globalTimer = setInterval(tick, currentInterval)
}

/** Call once in AppLayout setup */
export function setupGlobalPolling(getRoutePath: () => string) {
  const { settings } = useSettings()
  watch(() => settings.value.pollInterval, () => { ensureTimer(); tick() })
  watch(getRoutePath, (p) => { activeRoute = p; tick() }, { immediate: true })
  onMounted(() => { ensureTimer() })
  onUnmounted(() => { if (globalTimer) { clearInterval(globalTimer); globalTimer = null } })
}

export function usePagePolling() {
  const { settings } = useSettings()

  function register(fetchFn: FetchFn, routePath: string) {
    if (!handlers.has(routePath)) handlers.set(routePath, new Set())
    handlers.get(routePath)!.add(fetchFn)
    ensureTimer()
    activeRoute = routePath
    fetchFn()
    watch(() => settings.value.pollInterval, () => { ensureTimer() })
    onUnmounted(() => { handlers.get(routePath)?.delete(fetchFn) })
  }

  return { register }
}
