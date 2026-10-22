import { computed, onMounted, onUnmounted, reactive, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { getTraceLinks, getTraceObservations, getTraceParts, getTraceProtocol, getTraceSummary } from '@/api/trace'
import { useSettings } from '@/stores/settings'
import { isJobRecovering, useJobTracking } from '@/stores/jobTracking'
import { createTraceSessionModel, createTraceSessionState, type TraceSessionClient } from './traceSessionModel'

const TASK_PAGE_SIZE = 100

const traceClient: TraceSessionClient = {
  getTraceSummary,
  getTraceObservations,
  getTraceParts,
  getTraceLinks,
  getTraceProtocol,
}

export interface TraceSessionOptions {
  /** Keep truthy for background surfaces (dashboard): no global error modal. */
  silent?: boolean
}

/**
 * Vue lifecycle adapter for one Job execution session. Trace facts live in the
 * dedicated model; business Job/Task state comes from the existing shared
 * jobTracking store so the execution page and progress drawer cannot disagree.
 */
export function useTraceSession(
  jobId: MaybeRefOrGetter<string | null | undefined>,
  options: TraceSessionOptions = {},
) {
  const state = reactive(createTraceSessionState())
  const model = createTraceSessionModel(traceClient, state, { silent: options.silent === true })
  const tracking = useJobTracking()
  const { settings } = useSettings()
  const currentJobId = computed(() => {
    const value = toValue(jobId)
    return typeof value === 'string' && value.length > 0 ? value : null
  })

  const jobSnapshot = computed(() => {
    const id = currentJobId.value
    return id ? tracking.snapshots[id] ?? null : null
  })
  const jobDetail = computed(() => jobSnapshot.value?.detailLoaded ? jobSnapshot.value : null)
  const jobDetailLoading = computed(() => Boolean(jobSnapshot.value && !jobSnapshot.value.detailLoaded && !jobSnapshot.value.detailLoadFailed))
  const jobDetailFailed = computed(() => jobSnapshot.value?.detailLoadFailed === true)
  const recovering = computed(() => isJobRecovering(jobSnapshot.value))
  const tasks = computed(() => {
    const id = currentJobId.value
    return id ? tracking.taskSnapshots[id] ?? [] : []
  })
  const taskPage = computed(() => {
    const id = currentJobId.value
    return id ? tracking.taskPages[id] ?? null : null
  })

  let releaseJob: (() => void) | null = null
  let pollingTimer: number | null = null

  watch(currentJobId, (id) => {
    releaseJob?.()
    releaseJob = null
    model.setJobId(id)
    if (!id) return

    // Set the execution page's task size before subscribing so the store's first
    // request uses the selected page instead of briefly loading its drawer default.
    tracking.setTaskPage(id, 1, TASK_PAGE_SIZE)
    releaseJob = tracking.subscribeJob(id)
    void model.loadInitial(id)
  }, { immediate: true })

  function restartPolling() {
    window.clearInterval(pollingTimer ?? undefined)
    pollingTimer = window.setInterval(() => { void model.poll() }, settings.value.pollInterval)
  }

  watch(() => settings.value.pollInterval, restartPolling)
  onMounted(restartPolling)

  function setTaskPage(page: number, pageSize = TASK_PAGE_SIZE, sortOrder?: 'ascend' | 'descend') {
    const id = currentJobId.value
    if (id) tracking.setTaskPage(id, page, pageSize, sortOrder)
  }

  function retryTaskPage() {
    const id = currentJobId.value
    if (id) return tracking.retryTaskPage(id)
    return Promise.resolve()
  }

  onUnmounted(() => {
    window.clearInterval(pollingTimer ?? undefined)
    pollingTimer = null
    releaseJob?.()
    releaseJob = null
    model.dispose()
  })

  return {
    state,
    job: jobSnapshot,
    jobDetail,
    jobDetailLoading,
    jobDetailFailed,
    recovering,
    tasks,
    taskPage,
    setTaskPage,
    retryTaskPage,
    poll: model.poll,
    resyncObservations: () => model.refreshObservations(true),
    loadPartWindows: model.loadPartWindows,
    reload: () => model.loadInitial(currentJobId.value),
  }
}
