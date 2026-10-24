import { computed, onMounted, onUnmounted, reactive, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { getTraceLinks, getTraceObservations, getTraceParts, getTraceProtocol, getTraceSummary } from '@/api/trace'
import { useSettings } from '@/stores/settings'
import { isJobRecovering, isTerminalJob, useJobTracking } from '@/stores/jobTracking'
import {
  createTraceSessionModel,
  createTraceSessionState,
  tracePollingIntervals,
  type TracePollingIntervals,
  type TraceSessionClient,
  type TraceSessionPollSelection,
} from './traceSessionModel'

const TASK_PAGE_SIZE = 100

const traceClient: TraceSessionClient = {
  getTraceSummary,
  getTraceObservations,
  getTraceParts,
  getTraceLinks,
  getTraceProtocol,
}

export interface TraceSessionOptions {
  /** Keep truthy for background surfaces: no global error modal. */
  silent?: boolean
  /** Default preserves the single global cadence; execution surfaces opt into resource-specific polling. */
  pollingProfile?: 'global' | 'adaptive'
  /** Resource subset for compact Trace-driven surfaces that do not render Parts or network details. */
  resourceProfile?: 'full' | 'stageRail'
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
  const resourceProfile = options.resourceProfile ?? 'full'
  const initialSelection: TraceSessionPollSelection | undefined = resourceProfile === 'stageRail'
    ? { summary: true, observations: true }
    : undefined
  const model = createTraceSessionModel(traceClient, state, {
    silent: options.silent === true,
    initialSelection,
  })
  const tracking = useJobTracking()
  const adaptivePolling = options.pollingProfile === 'adaptive'
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

  const allPollResources = ['summary', 'observations', 'parts', 'links', 'protocol'] as const
  type PollResource = (typeof allPollResources)[number]
  const pollResources: readonly PollResource[] = resourceProfile === 'stageRail'
    ? ['summary', 'observations']
    : allPollResources
  const lastPollAt: Record<PollResource, number> = {
    summary: 0,
    observations: 0,
    parts: 0,
    links: 0,
    protocol: 0,
  }
  const pollFailures: Record<PollResource, number> = {
    summary: 0,
    observations: 0,
    parts: 0,
    links: 0,
    protocol: 0,
  }
  let releaseJob: (() => void) | null = null
  let pollingTimer: number | null = null
  let activePollJobId: string | null = null
  let activePollPromise: Promise<void> | null = null
  let immediatePollQueued = false
  let finalSyncJobId: string | null = null
  let finalSyncsRemaining = 0
  let mounted = false

  const traceJobTerminal = computed(() => {
    const job = jobSnapshot.value
    if (isJobRecovering(job)) return false
    if (isTerminalJob(job)) return true
    const traceJob = state.summary.data?.job
    return traceJob?.status === 'Succeeded'
      || traceJob?.status === 'Failed'
      || traceJob?.errorCode === 'Cancelled'
  })

  function clearPollingTimer() {
    if (pollingTimer !== null && typeof window !== 'undefined') window.clearTimeout(pollingTimer)
    pollingTimer = null
  }

  function currentPollIntervals(): TracePollingIntervals {
    const configuredInterval = settings.value.pollInterval
    if (!adaptivePolling) {
      return {
        summary: configuredInterval,
        observations: configuredInterval,
        parts: configuredInterval,
        links: configuredInterval,
        protocol: configuredInterval,
      }
    }
    return tracePollingIntervals(
      configuredInterval,
      state.summary.data?.executionKind === 'tagGeneration',
    )
  }

  function retryDelayFor(resource: PollResource, intervals: TracePollingIntervals): number {
    const interval = intervals[resource]
    return adaptivePolling
      ? Math.max(interval, Math.min(60_000, interval * (2 ** pollFailures[resource])))
      : interval
  }

  function recordInitialPollTimes() {
    const now = Date.now()
    for (const resource of pollResources) {
      lastPollAt[resource] = now
      pollFailures[resource] = state[resource].error ? 1 : 0
    }
  }

  function scheduleNextPoll() {
    clearPollingTimer()
    const id = currentJobId.value
    if (
      !mounted
      || !id
      || !state.initialLoaded
      || (adaptivePolling && (
        typeof document === 'undefined'
        || document.visibilityState !== 'visible'
      ))
      || activePollJobId === id
    ) return
    if (adaptivePolling && traceJobTerminal.value) {
      if (finalSyncsRemaining === 0) return
      pollingTimer = window.setTimeout(() => {
        pollingTimer = null
        const activeId = currentJobId.value
        if (activeId) void runPollCycle(activeId)
      }, 1_000)
      return
    }
    const intervals = currentPollIntervals()
    const now = Date.now()
    let nextAt = Number.POSITIVE_INFINITY
    for (const resource of pollResources) {
      nextAt = Math.min(nextAt, lastPollAt[resource] + retryDelayFor(resource, intervals))
    }
    pollingTimer = window.setTimeout(() => {
      pollingTimer = null
      const activeId = currentJobId.value
      if (activeId) void runPollCycle(activeId)
    }, Math.max(0, nextAt - now))
  }

  function runPollCycle(id: string, forceAll = false): Promise<void> {
    if (
      !mounted
      || currentJobId.value !== id
      || !state.initialLoaded
      || (adaptivePolling && (
        typeof document === 'undefined'
        || document.visibilityState !== 'visible'
      ))
    ) return Promise.resolve()
    if (activePollJobId === id) {
      if (forceAll) immediatePollQueued = true
      return activePollPromise ?? Promise.resolve()
    }

    const intervals = currentPollIntervals()
    const terminalPass = adaptivePolling && traceJobTerminal.value && finalSyncsRemaining > 0
    const now = Date.now()
    const selected = forceAll || terminalPass
      ? [...pollResources]
      : pollResources.filter(resource => now >= lastPollAt[resource] + retryDelayFor(resource, intervals))
    if (selected.length === 0) {
      scheduleNextPoll()
      return Promise.resolve()
    }

    const fullResync = terminalPass && finalSyncsRemaining === 1
    if (terminalPass) finalSyncsRemaining -= 1
    const selection: TraceSessionPollSelection = {
      summary: selected.includes('summary'),
      observations: selected.includes('observations'),
      parts: selected.includes('parts'),
      links: selected.includes('links'),
      protocol: selected.includes('protocol'),
      fullResync,
    }
    activePollJobId = id
    clearPollingTimer()
    const request = model.poll(selection).then((result) => {
      const completedAt = Date.now()
      for (const resource of selected) {
        lastPollAt[resource] = completedAt
        pollFailures[resource] = state[resource].error
          ? Math.min(5, pollFailures[resource] + 1)
          : 0
      }
      if (result.partsRefreshed && !selected.includes('parts')) {
        lastPollAt.parts = completedAt
        pollFailures.parts = state.parts.error ? Math.min(5, pollFailures.parts + 1) : 0
      }
    }).catch(() => {
      const failedAt = Date.now()
      for (const resource of selected) {
        lastPollAt[resource] = failedAt
        pollFailures[resource] = Math.min(5, pollFailures[resource] + 1)
      }
    }).finally(() => {
      if (activePollJobId !== id) return
      activePollJobId = null
      activePollPromise = null
      if (!mounted || currentJobId.value !== id) return
      if (immediatePollQueued) {
        immediatePollQueued = false
        void runPollCycle(id, true)
        return
      }
      scheduleNextPoll()
    })
    activePollPromise = request
    return request
  }

  function startFinalSync(id: string) {
    if (
      !adaptivePolling
      || !mounted
      || !state.initialLoaded
      || finalSyncJobId === id
    ) return
    finalSyncJobId = id
    finalSyncsRemaining = 3
    void runPollCycle(id, true)
  }

  function pollNow() {
    const id = currentJobId.value
    return id ? runPollCycle(id, true) : Promise.resolve()
  }

  watch(currentJobId, (id) => {
    clearPollingTimer()
    finalSyncJobId = null
    finalSyncsRemaining = 0
    immediatePollQueued = false
    for (const resource of pollResources) {
      lastPollAt[resource] = 0
      pollFailures[resource] = 0
    }
    releaseJob?.()
    releaseJob = null
    model.setJobId(id)
    if (!id) return

    // Set the execution page's task size before subscribing so the store's first
    // request uses the selected page instead of briefly loading its drawer default.
    tracking.setTaskPage(id, 1, TASK_PAGE_SIZE)
    releaseJob = tracking.subscribeJob(id)
    void model.loadInitial(id).finally(() => {
      if (currentJobId.value !== id || !state.initialLoaded) return
      recordInitialPollTimes()
      if (!mounted) return
      if (adaptivePolling && traceJobTerminal.value) startFinalSync(id)
      else scheduleNextPoll()
    })
  }, { immediate: true })

  watch(traceJobTerminal, (terminal) => {
    const id = currentJobId.value
    if (!id || !state.initialLoaded) return
    if (terminal && adaptivePolling) {
      startFinalSync(id)
      return
    }
    if (!terminal && finalSyncJobId === id) {
      finalSyncJobId = null
      finalSyncsRemaining = 0
    }
    scheduleNextPoll()
  })

  watch(
    [() => settings.value.pollInterval, () => state.summary.data?.executionKind],
    scheduleNextPoll,
  )

  function handleVisibilityChange() {
    if (!adaptivePolling) return
    if (document.visibilityState === 'hidden') {
      clearPollingTimer()
      return
    }
    const id = currentJobId.value
    if (id && state.initialLoaded) void runPollCycle(id, true)
    else scheduleNextPoll()
  }

  onMounted(() => {
    mounted = true
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const id = currentJobId.value
    if (!id || !state.initialLoaded) return
    if (adaptivePolling && traceJobTerminal.value) startFinalSync(id)
    else scheduleNextPoll()
  })

  async function reload() {
    const id = currentJobId.value
    if (!id) return
    await model.loadInitial(id)
    if (currentJobId.value !== id || !mounted) return
    recordInitialPollTimes()
    if (adaptivePolling && traceJobTerminal.value) startFinalSync(id)
    else scheduleNextPoll()
  }

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
    mounted = false
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    clearPollingTimer()
    immediatePollQueued = false
    activePollJobId = null
    activePollPromise = null
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
    poll: pollNow,
    resyncObservations: () => model.poll({
      summary: false,
      observations: true,
      parts: resourceProfile !== 'stageRail',
      links: false,
      protocol: false,
      fullResync: true,
    }),
    loadPartWindows: model.loadPartWindows,
    reload,
  }
}
