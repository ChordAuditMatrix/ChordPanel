import { ref, readonly } from 'vue'

// Global singleton: cross-page shared job tracking state
// Any page can call trackJob(jobId, jobType) to add; JobProgressDrawer watches and polls

const pendingAdd = ref<{ jobId: string; jobType?: string } | null>(null)

/**
 * Add a job to the tracking list (triggers global JobProgressDrawer to add and open)
 */
export function trackJob(jobId: string, jobType?: string) {
  pendingAdd.value = { jobId, jobType, }
  // Clear so that the next identical jobId still triggers the watch
  setTimeout(() => { pendingAdd.value = null }, 0)
}

export function useJobTracking() {
  return { pendingAdd: readonly(pendingAdd) }
}
