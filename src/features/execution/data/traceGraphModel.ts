import type {
  TraceCoverageState,
  TraceGraphActivityEdge,
  TraceGraphActivityNode,
  TraceGraphCoverage,
  TraceGraphEdge,
  TraceGraphJobNode,
  TraceGraphPartNode,
  TraceGraphProvenance,
  TraceGraphQuery,
  TraceGraphResponse,
  TraceGraphStreamName,
  TraceGraphStreamPage,
  TraceGraphTaskNode,
  TraceGraphTriggerEdge,
  TraceObservation,
  TraceRequestOptions,
  TraceUint64,
} from '@/api/trace'
import { isTraceCancellation } from './traceCancellation'
import { TRACE_GRAPH_PAGE_SIZE, traceGraphPageSize } from './traceGraphPaging'

/** The six independent streams of one graph response, in contract order. */
export const TRACE_GRAPH_STREAM_NAMES: readonly TraceGraphStreamName[] = [
  'tasks',
  'parts',
  'observations',
  'activities',
  'edges',
  'triggers',
]

type TraceGraphCursorKey =
  | 'taskCursor'
  | 'partCursor'
  | 'observationCursor'
  | 'activityCursor'
  | 'edgeCursor'
  | 'triggerCursor'

const TRACE_GRAPH_CURSOR_KEYS: Record<TraceGraphStreamName, TraceGraphCursorKey> = {
  tasks: 'taskCursor',
  parts: 'partCursor',
  observations: 'observationCursor',
  activities: 'activityCursor',
  edges: 'edgeCursor',
  triggers: 'triggerCursor',
}

/**
 * Streams whose stored rows can be replaced later. Their cursor is not a
 * no-loss watermark, so a refresh re-reads them from their first page; the
 * append-only streams are continued from their own last position instead.
 * Notification triggers are mutable: a retry of the same notification rewrites
 * `currentAttempt` on the earlier association row.
 */
const MUTABLE_GRAPH_STREAMS: Record<TraceGraphStreamName, boolean> = {
  tasks: true,
  parts: true,
  observations: false,
  activities: false,
  edges: false,
  triggers: true,
}

/** Position and coverage of one stream as last reported by the route. */
export interface TraceGraphStreamState {
  pageSize: number
  coverage: TraceCoverageState | null
  hasMore: boolean
  /** Position after the last returned row; a poll watermark may outlive `hasMore`. */
  nextCursor: string | null
  mutableSource: boolean
}

/**
 * Activity facts of exactly one read page. The route groups a span from the facts
 * of that page only and never reads ahead to finish it, so a page proves only
 * what its own facts state: two pages may each report the same span with a
 * different boundary, and a span may continue on the next page. The model keeps
 * every page separately instead of combining them into one "span state", because
 * such a combination would state more than the backend proved.
 */
export interface TraceGraphActivityPageState {
  /** `first`, or the activity-stream cursor this page was read at. */
  pageKey: string
  /** True when this is not the stream's first page, so spans may have earlier facts. */
  continued: boolean
  coverage: TraceCoverageState | null
  /** Activity nodes exactly as that page stated them. */
  nodes: TraceGraphActivityNode[]
  /** Derived parent edges of those nodes, exactly as that page stated them. */
  edges: TraceGraphActivityEdge[]
}

/**
 * Accumulated graph facts of one Job. Every array is merged by its documented
 * identity, so re-reading a page is idempotent and a later page never deletes an
 * earlier fact. Coverage and provenance are copied from the last response: they
 * describe what the streams could account for, never what a renderer hopes.
 */
export interface TraceGraphState {
  jobId: string | null
  loaded: boolean
  loading: boolean
  error: unknown | null
  schemaVersion: number | null
  cursorConsistency: string | null
  job: TraceGraphJobNode | null
  taskReferenceCount: TraceUint64 | null
  taskNodes: TraceGraphTaskNode[]
  partNodes: TraceGraphPartNode[]
  /** Per-page activity facts; never combined across pages. */
  activityPages: TraceGraphActivityPageState[]
  /** Graph-page observation facts; not the incremental observation feed. */
  observations: TraceObservation[]
  edges: TraceGraphEdge[]
  triggerEdges: TraceGraphTriggerEdge[]
  streams: Record<TraceGraphStreamName, TraceGraphStreamState>
  coverage: TraceGraphCoverage | null
  provenance: TraceGraphProvenance | null
}

function streamState(pageSize: number): TraceGraphStreamState {
  return {
    pageSize,
    coverage: null,
    hasMore: false,
    nextCursor: null,
    mutableSource: false,
  }
}

function streamsState(pageSize: number): Record<TraceGraphStreamName, TraceGraphStreamState> {
  return {
    tasks: streamState(pageSize),
    parts: streamState(pageSize),
    observations: streamState(pageSize),
    activities: streamState(pageSize),
    edges: streamState(pageSize),
    triggers: streamState(pageSize),
  }
}

export function createTraceGraphState(
  jobId: string | null = null,
  pageSize: number = TRACE_GRAPH_PAGE_SIZE,
): TraceGraphState {
  return {
    jobId,
    loaded: false,
    loading: false,
    error: null,
    schemaVersion: null,
    cursorConsistency: null,
    job: null,
    taskReferenceCount: null,
    taskNodes: [],
    partNodes: [],
    activityPages: [],
    observations: [],
    edges: [],
    triggerEdges: [],
    streams: streamsState(pageSize),
    coverage: null,
    provenance: null,
  }
}

/**
 * A `400` means a cursor no longer names a position the server can resume (other
 * Job, other stream, other bound, corrupted bytes or a shifted row). It is not a
 * transport failure callers should see: the model restarts that one stream.
 */
function isBadRequest(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const withResponse = error as { response?: { status?: unknown }; status?: unknown }
  return withResponse.response?.status === 400 || withResponse.status === 400
}

// ── Merge rules ──
//
// Each merge is keyed by the identity the backend documents for that row
// family. Immutable facts keep the first copy (a poll may re-deliver an
// observation); mutable rows (Task status, Part projection) take the latest
// read. Nothing is ever dropped because its event name or enum value is unknown.

function compareObservations(left: TraceObservation, right: TraceObservation): number {
  if (left.recordedAtMs !== right.recordedAtMs) return left.recordedAtMs < right.recordedAtMs ? -1 : 1
  if (left.observationId === right.observationId) return 0
  return left.observationId < right.observationId ? -1 : 1
}

/** Merge immutable observation facts by `observationId` and Admin recording order. */
export function mergeGraphObservations(
  existing: readonly TraceObservation[],
  incoming: readonly TraceObservation[],
): TraceObservation[] {
  const byId = new Map<string, TraceObservation>()
  for (const observation of existing) byId.set(observation.observationId, observation)
  for (const observation of incoming) {
    if (!byId.has(observation.observationId)) byId.set(observation.observationId, observation)
  }
  return [...byId.values()].sort(compareObservations)
}

/**
 * Merge Task nodes by `referenceIndex`, never by Task identity: a Job that
 * recorded the same identity twice keeps one node per recorded reference, and a
 * repeated status write replaces only that reference.
 */
export function mergeGraphTaskNodes(
  existing: readonly TraceGraphTaskNode[],
  incoming: readonly TraceGraphTaskNode[],
): TraceGraphTaskNode[] {
  const byReference = new Map<number, TraceGraphTaskNode>()
  for (const node of existing) byReference.set(node.referenceIndex, node)
  for (const node of incoming) byReference.set(node.referenceIndex, node)
  return [...byReference.values()].sort((left, right) => left.referenceIndex - right.referenceIndex)
}

/** Merge Part projections by `nodeId`; the latest stored projection wins. */
export function mergeGraphPartNodes(
  existing: readonly TraceGraphPartNode[],
  incoming: readonly TraceGraphPartNode[],
): TraceGraphPartNode[] {
  const byNode = new Map<string, TraceGraphPartNode>()
  for (const node of existing) byNode.set(node.nodeId, node)
  for (const node of incoming) byNode.set(node.nodeId, node)
  return [...byNode.values()].sort((left, right) => {
    if (left.partIndex !== right.partIndex) return left.partIndex - right.partIndex
    return (left.attempt ?? 0) - (right.attempt ?? 0)
  })
}

/**
 * Keep each read page's activity facts separately, keyed by the position the page
 * was read at. Re-reading one position replaces that page; two pages are never
 * combined into one span state, because a page proves only its own facts.
 */
export function mergeGraphActivityPages(
  existing: readonly TraceGraphActivityPageState[],
  incoming: TraceGraphActivityPageState,
): TraceGraphActivityPageState[] {
  const pages = new Map(existing.map(page => [page.pageKey, page]))
  pages.set(incoming.pageKey, incoming)
  return [...pages.values()]
}

/** Merge persisted Link rows by `linkKey`; the latest stored row wins. */
export function mergeGraphEdges(
  existing: readonly TraceGraphEdge[],
  incoming: readonly TraceGraphEdge[],
): TraceGraphEdge[] {
  const byKey = new Map<string, TraceGraphEdge>()
  for (const edge of existing) byKey.set(edge.linkKey, edge)
  for (const edge of incoming) byKey.set(edge.linkKey, edge)
  return [...byKey.values()].sort((left, right) => (left.linkKey < right.linkKey ? -1 : left.linkKey === right.linkKey ? 0 : 1))
}

/**
 * Merge notification trigger edges by their durable association identity
 * `(ownerId, notificationId, attempt)`. The newest read wins because only the
 * current read can state whether this Job is still the newest attempt.
 */
export function mergeGraphTriggerEdges(
  existing: readonly TraceGraphTriggerEdge[],
  incoming: readonly TraceGraphTriggerEdge[],
): TraceGraphTriggerEdge[] {
  const byKey = new Map<string, TraceGraphTriggerEdge>()
  const keyOf = (edge: TraceGraphTriggerEdge) => `${edge.ownerId}:${edge.notificationId}:${edge.attempt}`
  for (const edge of existing) byKey.set(keyOf(edge), edge)
  for (const edge of incoming) byKey.set(keyOf(edge), edge)
  return [...byKey.values()].sort((left, right) => {
    if (left.receivedAtMs !== right.receivedAtMs) {
      if (left.receivedAtMs === null) return 1
      if (right.receivedAtMs === null) return -1
      return left.receivedAtMs < right.receivedAtMs ? -1 : 1
    }
    if (left.notificationId !== right.notificationId) return left.notificationId < right.notificationId ? -1 : 1
    return left.attempt - right.attempt
  })
}

function projectStream(
  page: TraceGraphStreamPage,
  fallbackPageSize: number,
  mutableSource: boolean,
): TraceGraphStreamState {
  const bound = Number.parseInt(page.pageSize, 10)
  return {
    pageSize: Number.isSafeInteger(bound) && bound > 0 ? bound : fallbackPageSize,
    coverage: page.coverage,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    // The route states this per stream; the documented default is kept when an
    // older response omitted the field.
    mutableSource: typeof page.mutableSource === 'boolean' ? page.mutableSource : mutableSource,
  }
}

// ── Client and model ──

/** The single network dependency of a graph session. */
export interface TraceGraphClient {
  getTraceGraph(
    jobId: string,
    params: TraceGraphQuery,
    options?: TraceRequestOptions,
  ): Promise<TraceGraphResponse>
}

export interface TraceGraphModelOptions {
  /** Suppress the global API error modal; the promise still rejects. */
  silent?: boolean
  /** Bound applied to every stream, integer in `[1, 200]`. Default 200. */
  pageSize?: number
}

/**
 * What one graph request actually did. Settlement alone proves nothing, so a
 * caller that reports a read time must branch on this: a Job switch supersedes
 * a request (`stale`), a stream with no position left has nothing to read
 * (`skipped`), and a failed request (`failed`) leaves the last read in place.
 * Only `read` means at least one response was applied to the current Job.
 */
export type TraceGraphReadOutcome =
  | { readonly kind: 'read' }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'stale' }
  | { readonly kind: 'failed'; readonly error: unknown }

/** The explicit surface of a graph reader; unsupported actions are not names. */
export interface TraceGraphModel {
  readonly state: TraceGraphState
  setJobId(jobId: string | null): void
  loadFirstPage(): Promise<TraceGraphReadOutcome>
  loadMore(stream: TraceGraphStreamName): Promise<TraceGraphReadOutcome>
  refresh(): Promise<TraceGraphReadOutcome>
  dispose(): void
}

/**
 * Cursor-ledgered, page-stepped reader of one Job's execution graph.
 *
 * `loadFirstPage` reads one bounded page of every stream and stops: the first
 * screen never walks the whole graph. `loadMore(stream)` continues exactly one
 * stream, and `refresh` continues the append-only streams and re-reads the
 * mutable ones. Every request carries only positions the caller asked for, so a
 * rejected cursor is attributable to that stream and restarts only it.
 *
 * Every reader resolves with what it did rather than with nothing: a caller that
 * reports freshness must distinguish an applied response from a superseded,
 * empty or failed request, and only the model knows which of those happened.
 *
 * Network access stays behind `TraceGraphClient`, so paging, merge, coverage and
 * recovery behavior are testable without Vue, Axios or a live backend.
 */
export function createTraceGraphModel(
  client: TraceGraphClient,
  state = createTraceGraphState(),
  options: TraceGraphModelOptions = {},
): TraceGraphModel {
  const pageSize = traceGraphPageSize(options.pageSize)
  const allStreams = new Set<TraceGraphStreamName>(TRACE_GRAPH_STREAM_NAMES)
  let revision = 0
  let controller = new AbortController()
  let disposed = false
  let flight: Promise<TraceGraphReadOutcome> | null = null
  /** Counts applied responses, so a request can tell a read from a no-op. */
  let committedReads = 0

  function requestOptions(signal: AbortSignal): TraceRequestOptions {
    return options.silent === true ? { signal, silent: true } : { signal }
  }

  function isCurrent(expectedRevision: number, jobId: string): boolean {
    return !disposed && revision === expectedRevision && state.jobId === jobId
  }

  function setJobId(jobId: string | null) {
    if (state.jobId === jobId) return
    revision += 1
    controller.abort()
    controller = new AbortController()
    flight = null
    // Assigned in place so a Vue reactive proxy and the graph model keep one
    // state object across Job switches.
    Object.assign(state, createTraceGraphState(jobId, pageSize))
  }

  /**
   * Applies one response. Rows are merged only for the streams this request
   * actually read: a response always carries a first page of every stream, and
   * merging an unread stream would overwrite its stored position (and its
   * accumulated page facts) with a page the caller never asked for.
   */
  function commit(
    page: TraceGraphResponse,
    readStreams: ReadonlySet<TraceGraphStreamName>,
    activityPageKey: string,
  ) {
    state.schemaVersion = page.schemaVersion
    state.cursorConsistency = page.cursorConsistency
    state.job = page.job
    state.taskReferenceCount = page.taskReferenceCount
    if (readStreams.has('tasks')) state.taskNodes = mergeGraphTaskNodes(state.taskNodes, page.taskNodes)
    if (readStreams.has('parts')) state.partNodes = mergeGraphPartNodes(state.partNodes, page.partNodes)
    if (readStreams.has('observations')) {
      state.observations = mergeGraphObservations(state.observations, page.observations)
    }
    if (readStreams.has('activities')) {
      state.activityPages = mergeGraphActivityPages(state.activityPages, {
        pageKey: activityPageKey,
        continued: activityPageKey !== 'first',
        coverage: page.streams.activities.coverage,
        nodes: page.activityNodes,
        edges: page.activityEdges,
      })
    }
    if (readStreams.has('edges')) state.edges = mergeGraphEdges(state.edges, page.edges)
    if (readStreams.has('triggers')) {
      state.triggerEdges = mergeGraphTriggerEdges(state.triggerEdges, page.triggerEdges)
    }
    for (const name of TRACE_GRAPH_STREAM_NAMES) {
      if (readStreams.has(name)) {
        state.streams[name] = projectStream(page.streams[name], pageSize, MUTABLE_GRAPH_STREAMS[name])
      }
    }
    state.coverage = page.coverage
    state.provenance = page.provenance
    state.loaded = true
    committedReads += 1
  }

  /**
   * Reads one page of one stream. `fromStart` ignores the stored position and
   * reads the stream's first page; otherwise the stored cursor is sent. A `400`
   * on a sent cursor restarts only this stream, once: append-only rows already
   * read stay (they are immutable facts), while mutable rows are dropped because
   * their page positions can no longer be trusted.
   */
  async function readPage(
    jobId: string,
    expectedRevision: number,
    stream: TraceGraphStreamName,
    fromStart: boolean,
    allowRestart: boolean,
  ): Promise<void> {
    const sentCursor = fromStart ? undefined : state.streams[stream].nextCursor ?? undefined
    if (!fromStart && sentCursor === undefined) return
    const query: TraceGraphQuery = { pageSize }
    if (sentCursor !== undefined) query[TRACE_GRAPH_CURSOR_KEYS[stream]] = sentCursor
    const activityPageKey = stream === 'activities' ? sentCursor ?? 'first' : 'first'
    try {
      const page = await client.getTraceGraph(jobId, query, requestOptions(controller.signal))
      if (!isCurrent(expectedRevision, jobId)) return
      commit(page, new Set<TraceGraphStreamName>([stream]), activityPageKey)
    } catch (error: unknown) {
      if (!isCurrent(expectedRevision, jobId)) return
      if (!allowRestart || sentCursor === undefined || !isBadRequest(error)) throw error
      state.streams[stream] = {
        pageSize,
        coverage: state.streams[stream].coverage,
        hasMore: false,
        nextCursor: null,
        mutableSource: MUTABLE_GRAPH_STREAMS[stream],
      }
      if (stream === 'tasks') state.taskNodes = []
      if (stream === 'parts') state.partNodes = []
      if (stream === 'activities') {
        state.activityPages = state.activityPages.filter(page => page.pageKey === 'first')
      }
      await readPage(jobId, expectedRevision, stream, true, false)
    }
  }

  /**
   * Serializes graph work. Cursor attribution requires one known request shape at
   * a time, and serializing also keeps concurrent UI actions from interleaving
   * page commits.
   *
   * The resolved outcome explains the request, not just its settlement: rows are
   * counted as read only when this request applied a response for the revision
   * and Job it was started for.
   */
  function runExclusive(
    task: (jobId: string, expectedRevision: number) => Promise<void>,
  ): Promise<TraceGraphReadOutcome> {
    const jobId = state.jobId
    if (!jobId || disposed) return Promise.resolve<TraceGraphReadOutcome>({ kind: 'skipped' })
    const expectedRevision = revision
    const start: Promise<unknown> = flight ?? Promise.resolve()
    let request: Promise<TraceGraphReadOutcome>
    request = start.then(async (): Promise<TraceGraphReadOutcome> => {
      if (!isCurrent(expectedRevision, jobId)) return { kind: 'stale' }
      const committedBefore = committedReads
      state.loading = true
      state.error = null
      try {
        await task(jobId, expectedRevision)
        if (!isCurrent(expectedRevision, jobId)) return { kind: 'stale' }
        return committedReads === committedBefore ? { kind: 'skipped' } : { kind: 'read' }
      } catch (error: unknown) {
        if (!isCurrent(expectedRevision, jobId)) return { kind: 'stale' }
        if (!isTraceCancellation(error)) state.error = error
        return { kind: 'failed', error }
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.loading = false
      }
    })
    flight = request
    void request.then(() => {
      if (flight === request) flight = null
    })
    return request
  }

  /** One bounded page of every stream; this is the on-demand first screen. */
  function loadFirstPage(): Promise<TraceGraphReadOutcome> {
    return runExclusive(async (jobId, expectedRevision) => {
      const page = await client.getTraceGraph(jobId, { pageSize }, requestOptions(controller.signal))
      if (!isCurrent(expectedRevision, jobId)) return
      commit(page, allStreams, 'first')
    })
  }

  /** Continues exactly one stream from its own stored position. */
  function loadMore(stream: TraceGraphStreamName): Promise<TraceGraphReadOutcome> {
    return runExclusive(async (jobId, expectedRevision) => {
      if (!state.streams[stream].hasMore) return
      await readPage(jobId, expectedRevision, stream, false, true)
    })
  }

  /**
   * Reads what arrived since the last walk. Append-only streams continue from
   * their own cursor in one request; Task rows and Part projections are re-read
   * from their first page because they can be replaced without a new row.
   *
   * If that combined request is rejected, the cursor that caused it is not named
   * by the response, so each append-only stream is then probed by itself and only
   * the rejected one restarts. That path costs several requests but never resets
   * a healthy stream.
   */
  function refresh(): Promise<TraceGraphReadOutcome> {
    return runExclusive(async (jobId, expectedRevision) => {
      const appendOnly = TRACE_GRAPH_STREAM_NAMES.filter(name => !MUTABLE_GRAPH_STREAMS[name])
      const query: TraceGraphQuery = { pageSize }
      for (const name of appendOnly) {
        const cursor = state.streams[name].nextCursor
        if (cursor) query[TRACE_GRAPH_CURSOR_KEYS[name]] = cursor
      }
      try {
        const page = await client.getTraceGraph(jobId, query, requestOptions(controller.signal))
        if (!isCurrent(expectedRevision, jobId)) return
        commit(page, allStreams, typeof query.activityCursor === 'string' ? query.activityCursor : 'first')
        return
      } catch (error: unknown) {
        if (!isCurrent(expectedRevision, jobId)) return
        if (!isBadRequest(error)) throw error
      }
      for (const name of appendOnly) await readPage(jobId, expectedRevision, name, false, true)
      await readPage(jobId, expectedRevision, 'tasks', true, false)
      await readPage(jobId, expectedRevision, 'parts', true, false)
    })
  }

  function dispose() {
    disposed = true
    revision += 1
    controller.abort()
    flight = null
  }

  return {
    state,
    setJobId,
    loadFirstPage,
    loadMore,
    refresh,
    dispose,
  }
}
