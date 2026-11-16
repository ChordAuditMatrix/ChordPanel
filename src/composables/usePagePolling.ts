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
const inFlight = new Set<FetchFn>()
let globalTimer: ReturnType<typeof setInterval> | null = null
let currentInterval = 0
let activeRoute = ''

function invoke(fn: FetchFn) {
  if (inFlight.has(fn)) return
  inFlight.add(fn)
  Promise.resolve().then(fn)
    .catch(e => console.error('[polling] handler error', e))
    .finally(() => inFlight.delete(fn))
}

function tick() {
  if (typeof document !== 'undefined' && document.hidden) return
  handlers.get(activeRoute)?.forEach(invoke)
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
  const onVisibilityChange = () => { if (!document.hidden) tick() }
  onMounted(() => {
    ensureTimer()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (globalTimer) { clearInterval(globalTimer); globalTimer = null }
  })
}

export function usePagePolling() {
  const { settings } = useSettings()

  function register(fetchFn: FetchFn, routePath: string) {
    if (!handlers.has(routePath)) handlers.set(routePath, new Set())
    handlers.get(routePath)!.add(fetchFn)
    ensureTimer()
    activeRoute = routePath
    invoke(fetchFn)
    watch(() => settings.value.pollInterval, () => { ensureTimer() })
    onUnmounted(() => { handlers.get(routePath)?.delete(fetchFn) })
  }

  return { register }
}
