import axios from 'axios'
import { onMounted, onUnmounted, watch } from 'vue'
import { getSystemStatus } from '@/api/system'
import { useSettings } from '@/stores/settings'

/** Failed health checks required before the offline overlay appears. */
const OFFLINE_THRESHOLD = 5

/** A network-level failure (no answer at all) keeps the offline counter running. */
function isUnreachable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return true
  return !error.response || error.code === 'ERR_NETWORK' || error.response.status === 0
}

/**
 * Global backend health check.
 *
 * Marks the app offline once the backend is unreachable for several consecutive
 * polls; any answer (even an HTTP error status) means the backend is alive. Runs
 * for the lifetime of the component that installs it (the app shell).
 */
export function useBackendHealth() {
  const { settings, backendOnline } = useSettings()

  let timer: number | null = null
  let consecutiveFailures = 0

  async function checkHealth() {
    try {
      await getSystemStatus()
      consecutiveFailures = 0
      backendOnline.value = true
    } catch (error: unknown) {
      if (!isUnreachable(error)) {
        // The backend answered; an error status is a backend problem, not a connection one.
        consecutiveFailures = 0
        backendOnline.value = true
        return
      }
      consecutiveFailures++
      if (consecutiveFailures >= OFFLINE_THRESHOLD) {
        backendOnline.value = false
      }
    }
  }

  function stopHealthCheck() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function startHealthCheck() {
    stopHealthCheck()
    checkHealth()
    timer = window.setInterval(checkHealth, settings.value.pollInterval)
  }

  onMounted(startHealthCheck)
  onUnmounted(stopHealthCheck)
  watch([() => settings.value.pollInterval, () => settings.value.backendUrl], startHealthCheck)
}
