import { reactive, readonly, ref, shallowReadonly, watch } from 'vue'
import { getJobDetail, getJobTasks, type JobDetail, type JobSummary, type TaskSummary } from '@/api/job'
import { useSettings } from '@/stores/settings'

export type TrackedJob = JobDetail & {
  snapshotLoaded?: boolean
  detailLoaded?: boolean
  detailLoadFailed?: boolean
}

const snapshots = reactive<Record<string, TrackedJob>>({})
const taskSnapshots = reactive<Record<string, TaskSummary[]>>({})
const loadedTaskSnapshots = new Set<string>()
const trackedIds = ref<string[]>([])
const subscribers = new Map<string, number>()
const detailRequests = new Map<string, Promise<void>>()
const taskRequests = new Map<string, Promise<void>>()
const requestEpochs = new Map<string, number>()
const pendingTaskRefreshes = new Set<string>()
const { settings } = useSettings()
function cleanupRequestEpoch(jobId: string) {
  if (!trackedIds.value.includes(jobId) && !subscribers.has(jobId) && !detailRequests.has(jobId) && !taskRequests.has(jobId)) {
    requestEpochs.delete(jobId)
  }
}
export function isJobRecovering(job: JobSummary | null | undefined): boolean {
  return job?.recoveryRequested === true || job?.maintenanceRecovery === 'Requested'
}

export function isTerminalJob(job: JobSummary | null | undefined): boolean {
  if (!job || isJobRecovering(job)) return false
  const status = job.status?.toLowerCase()
  return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'cancelled'
}

function mergeSnapshot(incoming: JobSummary | JobDetail, detailLoaded = false) {
  const old = snapshots[incoming.jobId]
  snapshots[incoming.jobId] = {
    ...(old ?? {}),
    ...incoming,
    snapshotLoaded: true,
    detailLoaded: detailLoaded || old?.detailLoaded === true,
  } as TrackedJob
}

export function trackJob(jobId: string, jobType?: string) {
  if (!snapshots[jobId]) {
    snapshots[jobId] = { jobId, jobType: jobType ?? '', status: 'Pending', createdAtMs: Date.now(), snapshotLoaded: false }
  } else if (jobType && !snapshots[jobId].jobType) {
    snapshots[jobId] = { ...snapshots[jobId], jobType }
  }
  if (!trackedIds.value.includes(jobId)) trackedIds.value = [jobId, ...trackedIds.value]
  void refreshJob(jobId)
  restartTimer()
}

export function publishJobSnapshots(jobs: JobSummary[]) {
  for (const job of jobs) {
    if (!trackedIds.value.includes(job.jobId) && !subscribers.has(job.jobId)) continue
    const current = snapshots[job.jobId]
    if (current && isTerminalJob(current) && !isJobRecovering(job) && !isTerminalJob(job)) continue
    const statusChanged = current && (
      current.status.toLowerCase() !== job.status.toLowerCase()
      || isJobRecovering(current) !== isJobRecovering(job)
    )
    if (statusChanged) {
      requestEpochs.set(job.jobId, (requestEpochs.get(job.jobId) ?? 0) + 1)
      current.detailLoaded = false
      loadedTaskSnapshots.delete(job.jobId)
    }
    mergeSnapshot(job)
    if (statusChanged) {
      if (subscribers.has(job.jobId)) void refreshTasks(job.jobId, true)
      void refreshJob(job.jobId)
    }
  }
  restartTimer()
}

export function removeTrackedJob(jobId: string) {
  const job = snapshots[jobId]
  if (!isTerminalJob(job) && isJobRecovering(job)) return
  trackedIds.value = trackedIds.value.filter(id => id !== jobId)
  requestEpochs.set(jobId, (requestEpochs.get(jobId) ?? 0) + 1)
  if (!subscribers.has(jobId)) {
    delete snapshots[jobId]
    delete taskSnapshots[jobId]
    loadedTaskSnapshots.delete(jobId)
    pendingTaskRefreshes.delete(jobId)
  }
  cleanupRequestEpoch(jobId)
  restartTimer()
}

export function clearCompletedJobs() {
  for (const jobId of [...trackedIds.value]) {
    if (isTerminalJob(snapshots[jobId])) removeTrackedJob(jobId)
  }
}

export function subscribeJob(jobId: string): () => void {
  if (!snapshots[jobId]) snapshots[jobId] = { jobId, jobType: '', status: 'Pending', createdAtMs: Date.now(), snapshotLoaded: false }
  subscribers.set(jobId, (subscribers.get(jobId) ?? 0) + 1)
  void refreshJob(jobId)
  void refreshTasks(jobId)
  restartTimer()
  let released = false
  return () => {
    if (released) return
    released = true
    const count = subscribers.get(jobId) ?? 0
    if (count <= 1) subscribers.delete(jobId)
    else subscribers.set(jobId, count - 1)
    if (!subscribers.has(jobId) && !trackedIds.value.includes(jobId)) {
      requestEpochs.set(jobId, (requestEpochs.get(jobId) ?? 0) + 1)
      delete snapshots[jobId]
      delete taskSnapshots[jobId]
      loadedTaskSnapshots.delete(jobId)
      pendingTaskRefreshes.delete(jobId)
    }
    cleanupRequestEpoch(jobId)
    restartTimer()
  }
}
function refreshJob(jobId: string): Promise<void> {
  if (detailRequests.has(jobId)) return detailRequests.get(jobId)!
  if (snapshots[jobId]?.detailLoaded && isTerminalJob(snapshots[jobId])) return Promise.resolve()
  const epoch = requestEpochs.get(jobId) ?? 0
  const request = getJobDetail(jobId).then(response => {
    if (epoch !== (requestEpochs.get(jobId) ?? 0)) return
    const current = snapshots[jobId]
    if (!current || (!trackedIds.value.includes(jobId) && !subscribers.has(jobId))) return
    const detail = response as unknown as JobDetail
    const statusChanged = current.status.toLowerCase() !== detail.status.toLowerCase()
      || isJobRecovering(current) !== isJobRecovering(detail)
    if (statusChanged) {
      requestEpochs.set(jobId, (requestEpochs.get(jobId) ?? 0) + 1)
      loadedTaskSnapshots.delete(jobId)
    }
    mergeSnapshot(detail, true)
    snapshots[jobId].detailLoadFailed = false
    if (statusChanged && subscribers.has(jobId)) void refreshTasks(jobId, true)
    restartTimer()
  }).catch(() => {
    if (epoch !== (requestEpochs.get(jobId) ?? 0)) return
    const current = snapshots[jobId]
    if (!current || (!trackedIds.value.includes(jobId) && !subscribers.has(jobId))) return
    current.detailLoadFailed = true
  }).finally(() => {
    detailRequests.delete(jobId)
    cleanupRequestEpoch(jobId)
    restartTimer()
  })
  detailRequests.set(jobId, request)
  return request
}

function readTaskItems(response: unknown): TaskSummary[] {
  if (!response || typeof response !== 'object' || !('items' in response) || !Array.isArray(response.items)) return []
  return response.items as TaskSummary[]
}

function refreshTasks(jobId: string, force = false): Promise<void> {
  if (!subscribers.has(jobId)) return Promise.resolve()
  if (!force && loadedTaskSnapshots.has(jobId) && isTerminalJob(snapshots[jobId])) return Promise.resolve()
  if (taskRequests.has(jobId)) {
    if (force) pendingTaskRefreshes.add(jobId)
    return taskRequests.get(jobId)!
  }
  const epoch = requestEpochs.get(jobId) ?? 0
  const request = getJobTasks(jobId, { pageSize: 100 }).then(response => {
    if (epoch === (requestEpochs.get(jobId) ?? 0) && subscribers.has(jobId)) {
      taskSnapshots[jobId] = readTaskItems(response)
      loadedTaskSnapshots.add(jobId)
    }
  }).catch(() => {}).finally(() => {
    taskRequests.delete(jobId)
    if (pendingTaskRefreshes.delete(jobId) && subscribers.has(jobId)) void refreshTasks(jobId)
    cleanupRequestEpoch(jobId)
    restartTimer()
  })
  taskRequests.set(jobId, request)
  return request
}

async function poll() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const ids = new Set([...trackedIds.value, ...subscribers.keys()])
  await Promise.all([...ids].map(async (jobId) => {
    await refreshJob(jobId)
    if (subscribers.has(jobId)) await refreshTasks(jobId)
  }))
}

let timer: ReturnType<typeof setInterval> | undefined
let currentInterval = 0

function hasActiveJobs() {
  const jobIds = new Set([...trackedIds.value, ...subscribers.keys()])
  return [...jobIds].some(jobId => !snapshots[jobId]?.detailLoaded || !isTerminalJob(snapshots[jobId]))
}

function restartTimer() {
  if (!hasActiveJobs()) {
    clearInterval(timer)
    timer = undefined
    currentInterval = 0
    return
  }
  if (timer && currentInterval === settings.value.pollInterval) return
  clearInterval(timer)
  currentInterval = settings.value.pollInterval
  timer = setInterval(() => { void poll() }, currentInterval)
}

watch(() => settings.value.pollInterval, restartTimer)
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void poll()
})

export function useJobTracking() {
  return {
    snapshots: shallowReadonly(snapshots),
    taskSnapshots: shallowReadonly(taskSnapshots),
    trackedIds: readonly(trackedIds),
    trackJob,
    publishJobSnapshots,
    removeTrackedJob,
    clearCompletedJobs,
    subscribeJob,
  }
}
