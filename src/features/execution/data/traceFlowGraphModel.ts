import type {
  TraceCoverageReason,
  TraceCoverageState,
  TraceFlowGraphJobEdge,
  TraceFlowGraphJobNode,
  TraceFlowGraphQuery,
  TraceFlowGraphResponse,
  TraceRequestOptions,
  TraceUint64,
} from '@/api/trace'
import { isTraceCancellation } from './traceCancellation'
import { traceGraphPageSize } from './traceGraphPaging'

/** Network dependency of one flow graph page reader. */
export interface TraceFlowGraphClient {
  getFlowTraceGraph(
    flowId: string,
    params: TraceFlowGraphQuery,
    options?: TraceRequestOptions,
  ): Promise<TraceFlowGraphResponse>
}

export interface TraceFlowGraphState {
  flowId: string | null
  loaded: boolean
  loading: boolean
  error: unknown | null
  jobNodes: TraceFlowGraphJobNode[]
  parentEdges: TraceFlowGraphJobEdge[]
  coverage: TraceCoverageState | null
  reasons: TraceCoverageReason[]
  hasMore: boolean
  nextCursor: string | null
  /** `returned` of the last page; the route never publishes a total. */
  lastReturned: TraceUint64 | null
}

export function createTraceFlowGraphState(flowId: string | null = null): TraceFlowGraphState {
  return {
    flowId,
    loaded: false,
    loading: false,
    error: null,
    jobNodes: [],
    parentEdges: [],
    coverage: null,
    reasons: [],
    hasMore: false,
    nextCursor: null,
    lastReturned: null,
  }
}

export interface TraceFlowGraphModelOptions {
  silent?: boolean
  /** Job-node bound, integer in `[1, 200]`. Default 200. */
  pageSize?: number
}

/**
 * What one flow request actually did. A settled promise is not a read: a flow
 * switch supersedes the request (`stale`), a flow with no next position has
 * nothing to read (`skipped`), and a failed request (`failed`) leaves the last
 * page in place. Only `read` applied a response to the current flow.
 */
export type TraceFlowGraphReadOutcome =
  | { readonly kind: 'read' }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'stale' }
  | { readonly kind: 'failed'; readonly error: unknown }

/** The explicit surface of a flow reader; unsupported actions are not names. */
export interface TraceFlowGraphModel {
  readonly state: TraceFlowGraphState
  setFlowId(flowId: string | null): void
  load(): Promise<TraceFlowGraphReadOutcome>
  loadMore(): Promise<TraceFlowGraphReadOutcome>
  dispose(): void
}

/**
 * Cursor pager of one typed flow's Job nodes. Pages are explicit: `load` reads
 * the first page of the flow and `loadMore` reads the position after the last
 * returned Job, so a caller controls how many bounded pages it asks for. A flow
 * page is never a Job graph: it carries no Task, Part, Observation, Activity or
 * Link row, and each Job's detail stays on its own route.
 *
 * A reader resolves with what it did rather than with nothing: settlement alone
 * cannot tell an applied page from a superseded, empty or failed request, and a
 * caller that reports freshness must not guess.
 */
export function createTraceFlowGraphModel(
  client: TraceFlowGraphClient,
  state = createTraceFlowGraphState(),
  options: TraceFlowGraphModelOptions = {},
): TraceFlowGraphModel {
  const pageSize = traceGraphPageSize(options.pageSize)
  let revision = 0
  let controller = new AbortController()
  let disposed = false
  let flight: Promise<TraceFlowGraphReadOutcome> | null = null

  function requestOptions(signal: AbortSignal): TraceRequestOptions {
    return options.silent === true ? { signal, silent: true } : { signal }
  }

  function isCurrent(expectedRevision: number, flowId: string): boolean {
    return !disposed && revision === expectedRevision && state.flowId === flowId
  }

  function setFlowId(flowId: string | null) {
    if (state.flowId === flowId) return
    revision += 1
    controller.abort()
    controller = new AbortController()
    flight = null
    Object.assign(state, createTraceFlowGraphState(flowId))
  }

  function mergePage(page: TraceFlowGraphResponse, append: boolean) {
    const byJob = new Map<string, TraceFlowGraphJobNode>()
    if (append) for (const node of state.jobNodes) byJob.set(node.jobId, node)
    for (const node of page.jobNodes) byJob.set(node.jobId, node)
    state.jobNodes = [...byJob.values()]

    const byEdge = new Map<string, TraceFlowGraphJobEdge>()
    if (append) {
      for (const edge of state.parentEdges) byEdge.set(`${edge.from.ref}>${edge.to.ref}`, edge)
    }
    for (const edge of page.parentEdges) byEdge.set(`${edge.from.ref}>${edge.to.ref}`, edge)
    state.parentEdges = [...byEdge.values()]

    state.coverage = page.coverage
    state.reasons = page.reasons
    state.hasMore = page.hasMore
    state.nextCursor = page.nextCursor
    state.lastReturned = page.returned
    state.loaded = true
  }

  function read(append: boolean): Promise<TraceFlowGraphReadOutcome> {
    if (flight) return flight
    const flowId = state.flowId
    if (!flowId || disposed) return Promise.resolve<TraceFlowGraphReadOutcome>({ kind: 'skipped' })
    if (append && (!state.hasMore || !state.nextCursor)) {
      return Promise.resolve<TraceFlowGraphReadOutcome>({ kind: 'skipped' })
    }
    const expectedRevision = revision

    state.loading = true
    state.error = null
    const cursor = append ? state.nextCursor ?? undefined : undefined

    let request: Promise<TraceFlowGraphReadOutcome>
    request = client.getFlowTraceGraph(flowId, { pageSize, jobCursor: cursor }, requestOptions(controller.signal)).then((page): TraceFlowGraphReadOutcome => {
      if (!isCurrent(expectedRevision, flowId)) return { kind: 'stale' }
      mergePage(page, append)
      return { kind: 'read' }
    }).catch((error: unknown): TraceFlowGraphReadOutcome => {
      if (!isCurrent(expectedRevision, flowId)) return { kind: 'stale' }
      if (!isTraceCancellation(error)) state.error = error
      return { kind: 'failed', error }
    }).finally(() => {
      if (isCurrent(expectedRevision, flowId)) state.loading = false
      if (flight === request) flight = null
    })
    flight = request
    return request
  }

  /** Reads the first bounded page of the flow and replaces the loaded page set. */
  function load(): Promise<TraceFlowGraphReadOutcome> {
    return read(false)
  }

  /** Reads the next bounded page; a no-op at the end of the flow. */
  function loadMore(): Promise<TraceFlowGraphReadOutcome> {
    return read(true)
  }

  function dispose() {
    disposed = true
    revision += 1
    controller.abort()
    flight = null
  }

  return {
    state,
    setFlowId,
    load,
    loadMore,
    dispose,
  }
}
