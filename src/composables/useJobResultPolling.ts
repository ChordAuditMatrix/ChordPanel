import { onUnmounted } from 'vue'
import { getJobDetail } from '@/api/job'
import { useSettings } from '@/stores/settings'

const TERMINAL = ['succeeded', 'failed', 'canceled', 'cancelled']

export function isTerminalStatus(status?: string): boolean {
  return TERMINAL.includes((status || '').toLowerCase())
}

/**
 * Keep a submitted async job's result card fresh while the page stays mounted.
 * Polls getJobDetail on the user's poll interval, stops on terminal status or
 * when the page unmounts (leave the page → no updates, as requested).
 */
export function useJobResultPolling() {
  const { settings } = useSettings()
  const timers = new Map<string, ReturnType<typeof setInterval>>()

  function pollJobResult(jobId: string, onUpdate: (detail: any) => void) {
    stopPolling(jobId)
    const timer = setInterval(async () => {
      try {
        const detail: any = await getJobDetail(jobId)
        onUpdate(detail)
        if (isTerminalStatus(detail?.status)) stopPolling(jobId)
      } catch {
        // backend unreachable — keep polling, the result card stays as-is
      }
    }, settings.value.pollInterval)
    timers.set(jobId, timer)
  }

  function stopPolling(jobId?: string) {
    if (jobId) {
      const t = timers.get(jobId)
      if (t) {
        clearInterval(t)
        timers.delete(jobId)
      }
      return
    }
    timers.forEach(t => clearInterval(t))
    timers.clear()
  }

  onUnmounted(() => stopPolling())

  return { pollJobResult, stopPolling }
}
