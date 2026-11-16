import { computed, ref, watch, type ComputedRef } from 'vue'
import type { TraceGraphStreamName } from '@/api/trace'
import {
  projectTraceGraph,
  type TraceGraphProjection,
} from '@/features/execution/data/traceGraphProjection'
import type {
  TraceGraphReadOutcome,
  TraceGraphState,
} from '@/features/execution/data/traceGraphModel'
import {
  resolveExecutionFlowIdentity,
  type ExecutionFlowIdentity,
} from '@/features/execution/data/executionFlowIdentity'

export interface ExecutionJobGraphSession {
  loadGraphFirstPage(): Promise<TraceGraphReadOutcome>
  loadGraphMore(stream: TraceGraphStreamName): Promise<TraceGraphReadOutcome>
  refreshGraph(): Promise<TraceGraphReadOutcome>
}

export interface ExecutionJobGraphInput {
  jobId: ComputedRef<string | null>
  jobDetail: ComputedRef<{ flowId?: string | null } | null>
  /** Job detail is in flight; the flow identity is still unknown. */
  jobDetailLoading?: ComputedRef<boolean>
  /** Job detail request failed; the flow identity is still unknown. */
  jobDetailFailed?: ComputedRef<boolean>
  graph: TraceGraphState
  session: ExecutionJobGraphSession
  openRelatedJob(jobId: string): void
}

/**
 * On-demand Job graph surface.
 *
 * No graph page is read until the user opens the graph view. The flow identity
 * comes from the Job's own durable `flowId`; a detail that is loading, failed or
 * absent leaves the identity unknown, and only a loaded detail without a
 * `flowId` proves that the Job has no flow. Loading is bounded and never
 * repeated while a page is already in flight or loaded.
 *
 * The read stamps state what actually happened: a request advances them only
 * when it applied a response for the Job that is still selected. A failed
 * request, a request the next Job superseded and a request with nothing left to
 * read settle without fresh facts and keep the previous stamps. They are
 * cleared when the Job or its graph identity changes; a graph that was already
 * loaded before this composable ran has no known load time, so its first
 * observed read is reported as a refresh rather than a load.
 */
export function useExecutionJobGraph(input: ExecutionJobGraphInput) {
  const graphVisible = ref(false)
  const graphProjection = computed<TraceGraphProjection>(() => projectTraceGraph(input.graph))
  const flowIdentity = computed<ExecutionFlowIdentity>(() => resolveExecutionFlowIdentity({
    jobDetail: input.jobDetail.value,
    detailLoading: input.jobDetailLoading?.value ?? false,
    detailFailed: input.jobDetailFailed?.value ?? false,
  }))
  const flowGraphId = computed<string | null>(() =>
    flowIdentity.value.kind === 'flow' ? flowIdentity.value.flowId : null)

  const graphLoadedAtMs = ref<number | null>(null)
  const graphRefreshedAtMs = ref<number | null>(null)
  const graphReadAtMs = computed<number | null>(() =>
    graphRefreshedAtMs.value ?? graphLoadedAtMs.value)
  /** The Job whose graph the current stamps describe; `null` before any stamp. */
  let stampedJobId: string | null = null

  /**
   * Applies one settled request to the stamps.
   *
   * Only a request that applied a response for the Job still selected may move a
   * timestamp; anything else would claim a read this panel never performed.
   * `loadedBefore` is the state observed when the request started, so a read of
   * a graph that was already current is a refresh and never invents a load time.
   */
  function applyGraphRead(
    requestedJobId: string,
    outcome: TraceGraphReadOutcome,
    loadedBefore: boolean,
  ): void {
    if (outcome.kind !== 'read') return
    if (input.jobId.value !== requestedJobId) return
    if (input.graph.jobId !== requestedJobId) return
    if (stampedJobId !== requestedJobId) {
      stampedJobId = requestedJobId
      graphLoadedAtMs.value = null
      graphRefreshedAtMs.value = null
    }
    if (!loadedBefore && graphLoadedAtMs.value === null) {
      graphLoadedAtMs.value = Date.now()
      return
    }
    graphRefreshedAtMs.value = Date.now()
  }

  async function loadJobGraph(): Promise<void> {
    const requestedJobId = input.jobId.value
    if (!requestedJobId || input.graph.loading) return
    // A graph loaded for an earlier Job must not suppress this Job's first page.
    if (input.graph.loaded && input.graph.jobId === requestedJobId) return
    const outcome = await input.session.loadGraphFirstPage()
    // Nothing was loaded for this Job before the call: this read is its load.
    applyGraphRead(requestedJobId, outcome, false)
  }

  function showJobGraph(): void {
    graphVisible.value = true
    void loadJobGraph()
  }

  function loadGraphStream(stream: TraceGraphStreamName): void {
    const requestedJobId = input.jobId.value
    if (!requestedJobId) return
    const loadedBefore = input.graph.loaded && input.graph.jobId === requestedJobId
    void input.session.loadGraphMore(stream).then((outcome) => {
      applyGraphRead(requestedJobId, outcome, loadedBefore)
    })
  }

  function refreshJobGraph(): void {
    const requestedJobId = input.jobId.value
    if (!requestedJobId) return
    const loadedBefore = input.graph.loaded && input.graph.jobId === requestedJobId
    void input.session.refreshGraph().then((outcome) => {
      applyGraphRead(requestedJobId, outcome, loadedBefore)
    })
  }

  function openRelatedJob(relatedJobId: string): void {
    if (!relatedJobId) return
    input.openRelatedJob(relatedJobId)
  }

  /** A Job change closes the graph; the next explicit open starts a fresh page. */
  function resetJobGraph(): void {
    graphVisible.value = false
    stampedJobId = null
    graphLoadedAtMs.value = null
    graphRefreshedAtMs.value = null
  }

  return {
    graphVisible,
    graphProjection,
    flowIdentity,
    flowGraphId,
    graphLoadedAtMs,
    graphRefreshedAtMs,
    graphReadAtMs,
    loadJobGraph,
    showJobGraph,
    loadGraphStream,
    refreshJobGraph,
    openRelatedJob,
    resetJobGraph,
  }
}

export interface GraphDeepLinkInput {
  /** Job currently selected by the route; `null` before the route supplies one. */
  jobId: ComputedRef<string | null>
  /** Exact `?graph=1` display flag, not a graph request parameter. */
  requested: ComputedRef<boolean>
  /** Opens the graph view and starts its first bounded page. */
  showGraph(): void
}

/**
 * Opens the graph view for a deep link once a Job identity exists.
 *
 * The flag is checked again when the Job changes, so a direct `?graph=1`
 * navigation still opens the new Job's graph after its state reset. Leaving the
 * flag does not issue a new read; the normal graph button remains the explicit
 * path.
 */
export function useGraphDeepLink(input: GraphDeepLinkInput): void {
  watch([input.jobId, input.requested], ([jobId, requested]) => {
    if (!jobId || !requested) return
    input.showGraph()
  }, { immediate: true })
}
