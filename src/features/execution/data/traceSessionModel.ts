import type {
  TraceCoverageState,
  TraceGraphQuery,
  TraceGraphResponse,
  TraceGraphStreamName,
  TraceLink,
  TraceObservation,
  TraceObservationsPage,
  TracePart,
  TraceProtocolEvent,
  TraceRequestOptions,
  TraceSummary,
} from '@/api/trace'
import {
  createTraceGraphModel,
  createTraceGraphState,
  type TraceGraphReadOutcome,
  type TraceGraphState,
} from './traceGraphModel'
import { isTraceCancellation } from './traceCancellation'
import { mergeObservations, mergePartPage, preserveLoadedWindows, uniqueBy } from './traceSessionMerge'
import {
  TRACE_PAGE_SIZE,
  readLinksPages,
  readPartsPages,
  readProtocolFromStart,
  type TraceLinksReader,
  type TracePartsReader,
  type TraceProtocolPageCoverage,
  type TraceProtocolRead,
  type TraceProtocolReader,
} from './traceSessionReaders'

export interface TraceResource<T> {
  data: T | null
  loaded: boolean
  loading: boolean
  error: unknown | null
}

/**
 * Read progress of one paged Trace resource. `loaded` only means "the first page
 * is here"; `total`/`hasMore`/`complete` are the only authority on whether the
 * loaded rows are all the rows. A page count is never inferred from `data.length`.
 */
export interface TracePaging {
  /** 1-based page the next part/link continuation reads. */
  nextPage: number
  /** The server reported a later row that this session has not read. */
  hasMore: boolean
  /** Server-published total, or `null` when the route publishes none. */
  total: number | null
  /** At least one page was read and the server reported no further row. */
  complete: boolean
}

/** Protocol is cursor-paged and publishes no total. */
export interface TraceProtocolPaging extends TracePaging {
  /** Position after the last returned protocol page, or `null` before any page. */
  nextCursor: string | null
}

function paging(): TracePaging {
  return { nextPage: 1, hasMore: false, total: null, complete: false }
}

export interface TraceSessionState {
  jobId: string | null
  initialLoading: boolean
  initialLoaded: boolean
  resynchronizing: boolean
  observationCursor: string | null
  cursorConsistency: string | null
  summary: TraceResource<TraceSummary>
  observations: TraceResource<TraceObservation[]>
  parts: TraceResource<TracePart[]>
  /** Read progress of the Part stream; `parts.loaded` is only the first page. */
  partsPaging: TracePaging
  /** Per-page source coverage; no aggregate state is inferred from loaded rows. */
  partsPageCoverage: Record<number, TraceCoverageState | null>
  partsWindowLoading: Record<number, boolean>
  partsWindowErrors: Record<number, unknown | null>
  links: TraceResource<TraceLink[]>
  /** Read progress of the Link stream; the exact-link evidence may be truncated. */
  linksPaging: TracePaging
  protocol: TraceResource<TraceProtocolEvent[]>
  /** Read progress of the protocol join; the route publishes no total. */
  protocolPaging: TraceProtocolPaging
  /** Protocol coverage/reasons stay tied to the cursor page that returned them. */
  protocolPageCoverage: TraceProtocolPageCoverage[]
  /**
   * Execution-graph slice. It is a separate fact family: the graph route reads
   * its own bounded streams, so its coverage and cursors never stand for the
   * observation feed, the summary or the protocol join.
   */
  graph: TraceGraphState
}

export interface TraceSessionClient extends TracePartsReader, TraceLinksReader, TraceProtocolReader {
  getTraceSummary(jobId: string, options?: TraceRequestOptions): Promise<TraceSummary>
  getTraceObservations(jobId: string, params: { cursor?: string; pageSize: number }, options?: TraceRequestOptions): Promise<TraceObservationsPage>
  /**
   * Optional graph route. A session created without it has an unloaded graph
   * slice and makes no graph request, so existing callers stay unchanged.
   */
  getTraceGraph?(jobId: string, params: TraceGraphQuery, options?: TraceRequestOptions): Promise<TraceGraphResponse>
}

type ResourceKey = 'summary' | 'parts' | 'links' | 'protocol'

/**
 * A last page bound, resolved when the read actually starts. A refresh passes a
 * resolver so a run that the paging queue defers behind an in-flight continuation
 * covers the depth that continuation committed; capturing the bound at request
 * time would re-read the older prefix and drop the newly loaded page.
 */
type PageBound = number | null | (() => number | null)

function resource<T>(): TraceResource<T> {
  return { data: null, loaded: false, loading: false, error: null }
}

export function createTraceSessionState(jobId: string | null = null): TraceSessionState {
  return {
    jobId,
    initialLoading: false,
    initialLoaded: false,
    resynchronizing: false,
    observationCursor: null,
    cursorConsistency: null,
    summary: resource<TraceSummary>(),
    observations: resource<TraceObservation[]>(),
    parts: resource<TracePart[]>(),
    partsPaging: paging(),
    partsPageCoverage: {},
    partsWindowLoading: {},
    partsWindowErrors: {},
    links: resource<TraceLink[]>(),
    linksPaging: paging(),
    protocol: resource<TraceProtocolEvent[]>(),
    protocolPaging: { ...paging(), nextCursor: null },
    protocolPageCoverage: [],
    graph: createTraceGraphState(jobId),
  }
}

const PART_EVENTS: Record<string, true> = {
  TagGenerationPlanCommitted: true,
  TagPartGenerationStarted: true,
  TagWindowGenerated: true,
  TagWindowFailed: true,
  TagWindowCancelled: true,
  TagDumpDispatched: true,
  TagDumpAccounted: true,
  TagPartCompleted: true,
  TagGenerationFinalized: true,
}

export interface TraceSessionPollSelection {
  summary?: boolean
  observations?: boolean
  parts?: boolean
  links?: boolean
  /**
   * A protocol cursor chain cannot be resumed from the middle, so a normal poll
   * re-reads only the visible loaded depth. The join is read only when this flag
   * is set; with `fullResync` that read covers the whole join, and without it the
   * loaded depth. An observation-only resync leaves the join untouched.
   */
  protocol?: boolean
  /**
   * Opt-in graph refresh. It is never part of the default selection: the graph
   * walks several bounded streams per request, so a caller asks for it only
   * while a graph surface is visible.
   */
  graph?: boolean
  /** A bounded cursor recovery scan; existing rows and replay identity are preserved. */
  fullResync?: boolean
}

export interface TraceSessionPollResult {
  partsRefreshed: boolean
  /** True only when this poll refreshed the graph slice. */
  graphRefreshed: boolean
}

export interface TracePollingIntervals {
  summary: number
  observations: number
  parts: number
  links: number
  protocol: number
}

/** Trace refresh cadence is resource-specific; the existing preference scales this session only. */
export function tracePollingIntervals(
  configuredPollInterval: number,
  prioritizeParts: boolean,
): TracePollingIntervals {
  const configured = Number.isFinite(configuredPollInterval) && configuredPollInterval > 0
    ? configuredPollInterval
    : 5_000
  const scale = Math.max(1, configured / 5_000)
  const partsInterval = prioritizeParts ? 2_000 : 5_000
  return {
    summary: Math.max(1_000, Math.round(1_000 * scale)),
    observations: Math.max(1_000, Math.round(1_000 * scale)),
    parts: Math.max(partsInterval, Math.round(partsInterval * scale)),
    links: Math.max(3_000, Math.round(4_000 * scale)),
    protocol: Math.max(3_000, Math.round(4_000 * scale)),
  }
}

export interface TraceSessionModelOptions {
  /**
   * Suppress the global API error modal for every request this session makes.
   * Defaults to `false`; execution detail keeps the modal behavior.
   */
  silent?: boolean
  /** Initial resource subset; omitted resources stay unloaded until explicitly requested. */
  initialSelection?: TraceSessionPollSelection
  /**
   * `bounded` (default) reads one page per paged resource on the first screen and
   * continues only on demand; `complete` walks every page, which report and
   * export surfaces need before they publish a total or an empty state.
   */
  pageMode?: 'bounded' | 'complete'
}

/** The explicit surface of one session; unsupported reads are not names. */
export interface TraceSessionModel {
  readonly state: TraceSessionState
  setJobId(jobId: string | null): void
  loadInitial(jobId?: string | null): Promise<void>
  poll(selection?: TraceSessionPollSelection): Promise<TraceSessionPollResult>
  refreshObservations(fullResync?: boolean): Promise<TraceObservation[]>
  loadPartWindows(page: number): Promise<void>
  loadParts(): Promise<void>
  loadLinks(): Promise<void>
  loadProtocol(): Promise<void>
  /** Continues one paged resource by exactly one page. */
  loadMoreParts(): Promise<void>
  loadMoreLinks(): Promise<void>
  loadMoreProtocol(): Promise<void>
  /** Re-reads loaded pages; a poll never walks an unloaded tail. */
  refreshLoadedParts(): Promise<void>
  refreshLoadedLinks(): Promise<void>
  /** Bounded live refresh of the protocol join in its own cursor order. */
  refreshLoadedProtocol(): Promise<void>
  /** Reads every page; report and export surfaces must ask for this. */
  loadAllParts(): Promise<void>
  loadAllLinks(): Promise<void>
  loadAllProtocol(): Promise<void>
  /** One bounded page of every graph stream; the on-demand first screen. */
  loadGraphFirstPage(): Promise<TraceGraphReadOutcome>
  /** Continues exactly one graph stream from its own cursor. */
  loadGraphMore(stream: TraceGraphStreamName): Promise<TraceGraphReadOutcome>
  /** Continues append-only graph streams and re-reads the mutable ones. */
  refreshGraph(): Promise<TraceGraphReadOutcome>
  dispose(): void
}

/**
 * Source-backed execution data with single-flight page readers and an eventual-cursor ledger.
 * Network access stays behind TraceSessionClient so cursor, error and late-row behavior can be
 * exercised independently from Vue lifecycle and Axios. Page readers come from
 * `traceSessionReaders`, row merge rules from `traceSessionMerge`; this model owns
 * the one mutable state object, its read progress and its poll policy.
 */
export function createTraceSessionModel(
  client: TraceSessionClient,
  state = createTraceSessionState(),
  options: TraceSessionModelOptions = {},
): TraceSessionModel {
  /** Request options shared by every loader; `silent` never alters error propagation. */
  function requestOptions(signal: AbortSignal): TraceRequestOptions {
    return options.silent === true ? { signal, silent: true } : { signal }
  }

  // The graph is an optional slice: without a graph client the session keeps its
  // existing five resources and issues no graph request.
  const graphClient = client.getTraceGraph?.bind(client)
  const graphModel = graphClient === undefined
    ? null
    : createTraceGraphModel({ getTraceGraph: graphClient }, state.graph, {
        silent: options.silent === true,
      })

  const resourceFlights = new Map<ResourceKey, Promise<void>>()
  const pendingResourceRefreshes = new Set<ResourceKey>()
  const pageMode = options.pageMode ?? 'bounded'
  const pagingFlights = new Map<'parts' | 'links' | 'protocol', Promise<void>>()
  const pendingPagingRefreshes = new Set<'parts' | 'links' | 'protocol'>()
  const partWindowFlights = new Map<number, Promise<void>>()
  let revision = 0
  let controller = new AbortController()
  let initialFlight: Promise<void> | null = null
  let observationFlight: Promise<TraceObservation[]> | null = null
  let queuedFullResync = false
  let disposed = false

  function isCurrent(expectedRevision: number, jobId: string): boolean {
    return !disposed && revision === expectedRevision && state.jobId === jobId
  }

  function setJobId(jobId: string | null) {
    if (state.jobId === jobId) return
    revision += 1
    controller.abort()
    controller = new AbortController()
    resourceFlights.clear()
    pendingResourceRefreshes.clear()
    pagingFlights.clear()
    pendingPagingRefreshes.clear()
    partWindowFlights.clear()
    initialFlight = null
    observationFlight = null
    queuedFullResync = false
    disposed = false
    const next = createTraceSessionState(jobId)
    // The graph model holds its own state object; keeping that reference lets it
    // reset the same object in place for the new Job.
    if (graphModel) next.graph = state.graph
    Object.assign(state, next)
    graphModel?.setJobId(jobId)
  }

  function loadResource<T, Result>(
    key: ResourceKey,
    loader: (jobId: string, signal: AbortSignal) => Promise<Result>,
    project: (result: Result) => T,
    onLoaded?: (result: Result) => void,
  ): Promise<void> {
    const jobId = state.jobId
    if (!jobId || disposed) return Promise.resolve()

    const expectedRevision = revision
    const existing = resourceFlights.get(key)
    if (existing) {
      pendingResourceRefreshes.add(key)
      return existing.then(() => {
        if (!isCurrent(expectedRevision, jobId) || !pendingResourceRefreshes.delete(key)) return
        return loadResource(key, loader, project, onLoaded)
      })
    }

    const signal = controller.signal
    const target = state[key] as TraceResource<T>
    target.loading = true
    target.error = null

    let request: Promise<void>
    request = loader(jobId, signal).then((result) => {
      if (!isCurrent(expectedRevision, jobId)) return
      const data = project(result)
      onLoaded?.(result)
      target.data = data
      target.loaded = true
    }).catch((error: unknown) => {
      if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) target.error = error
    }).finally(() => {
      if (isCurrent(expectedRevision, jobId)) target.loading = false
      if (resourceFlights.get(key) === request) resourceFlights.delete(key)
    })
    resourceFlights.set(key, request)
    return request
  }

  function loadSummary(): Promise<void> {
    return loadResource('summary', (jobId, signal) => client.getTraceSummary(jobId, requestOptions(signal)), result => result)
  }

  /**
   * Chains one continuation per resource, and queues at most one follow-up run
   * when another read of the same resource is requested while one is in flight:
   * a slow first read must still end with the newer source state.
   */
  function trackPaging(
    key: 'parts' | 'links' | 'protocol',
    run: () => Promise<void>,
  ): Promise<void> {
    const existing = pagingFlights.get(key)
    if (existing) {
      pendingPagingRefreshes.add(key)
      return existing.then(() => {
        if (disposed || !pendingPagingRefreshes.delete(key)) return
        return trackPaging(key, run)
      })
    }
    let request: Promise<void>
    request = run().finally(() => {
      if (pagingFlights.get(key) === request) pagingFlights.delete(key)
    })
    pagingFlights.set(key, request)
    return request
  }

  function loadPartsPages(fromPage: number, lastPage: PageBound, merge: boolean): Promise<void> {
    return trackPaging('parts', async () => {
      const jobId = state.jobId
      if (!jobId || disposed) return
      const expectedRevision = revision
      const bound = typeof lastPage === 'function' ? lastPage() : lastPage
      state.parts.loading = true
      state.parts.error = null
      try {
        const read = await readPartsPages(client, jobId, requestOptions(controller.signal), fromPage, bound)
        if (!isCurrent(expectedRevision, jobId)) return
        // A continuation appends to what is already held; a first/refresh read
        // replaces the loaded prefix because Part projections are mutable rows.
        state.parts.data = merge
          ? mergePartPage(state.parts.data ?? [], read.items)
          : preserveLoadedWindows(read.items, state.parts.data ?? [])
        state.partsPageCoverage = merge
          ? { ...state.partsPageCoverage, ...read.coverageByPage }
          : read.coverageByPage
        state.parts.loaded = true
        state.partsPaging = {
          nextPage: read.lastPage + 1,
          hasMore: read.hasMore,
          total: read.total,
          complete: !read.hasMore,
        }
      } catch (error: unknown) {
        if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.parts.error = error
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.parts.loading = false
      }
    })
  }

  /** First page, or every page when the session was created in `complete` mode. */
  function loadParts(): Promise<void> {
    return loadPartsPages(1, pageMode === 'complete' ? null : 1, false)
  }

  /** Continues the Part stream by exactly one page. */
  function loadMoreParts(): Promise<void> {
    if (!state.parts.loaded) return loadParts()
    if (state.partsPaging.complete) return Promise.resolve()
    return loadPartsPages(state.partsPaging.nextPage, state.partsPaging.nextPage, true)
  }

  /**
   * Re-reads the pages this session already holds. A poll therefore costs the
   * loaded depth instead of the whole stream. The depth is resolved when the read
   * starts: a refresh queued behind `loadMoreParts` must include the page that
   * continuation just appended, or replacing the rows would discard it.
   */
  function refreshLoadedParts(): Promise<void> {
    return loadPartsPages(
      1,
      () => pageMode === 'complete' ? null : Math.max(1, state.partsPaging.nextPage - 1),
      false,
    )
  }

  /** Reads every Part page; a caller that publishes a total asks for this explicitly. */
  function loadAllParts(): Promise<void> {
    return loadPartsPages(1, null, false)
  }

  function loadLinksPages(fromPage: number, lastPage: PageBound, merge: boolean): Promise<void> {
    return trackPaging('links', async () => {
      const jobId = state.jobId
      if (!jobId || disposed) return
      const expectedRevision = revision
      const bound = typeof lastPage === 'function' ? lastPage() : lastPage
      state.links.loading = true
      state.links.error = null
      try {
        const read = await readLinksPages(client, jobId, requestOptions(controller.signal), fromPage, bound)
        if (!isCurrent(expectedRevision, jobId)) return
        state.links.data = uniqueBy(
          merge ? [...(state.links.data ?? []), ...read.items] : read.items,
          link => link.linkKey,
        )
        state.links.loaded = true
        state.linksPaging = {
          nextPage: read.lastPage + 1,
          hasMore: read.hasMore,
          total: read.total,
          complete: !read.hasMore,
        }
      } catch (error: unknown) {
        if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.links.error = error
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.links.loading = false
      }
    })
  }

  function loadLinks(): Promise<void> {
    return loadLinksPages(1, pageMode === 'complete' ? null : 1, false)
  }

  function loadMoreLinks(): Promise<void> {
    if (!state.links.loaded) return loadLinks()
    if (state.linksPaging.complete) return Promise.resolve()
    return loadLinksPages(state.linksPaging.nextPage, state.linksPaging.nextPage, true)
  }

  function refreshLoadedLinks(): Promise<void> {
    return loadLinksPages(
      1,
      () => pageMode === 'complete' ? null : Math.max(1, state.linksPaging.nextPage - 1),
      false,
    )
  }

  function loadAllLinks(): Promise<void> {
    return loadLinksPages(1, null, false)
  }

  function applyProtocolRead(read: TraceProtocolRead, append: boolean) {
    state.protocol.data = uniqueBy(
      append ? [...(state.protocol.data ?? []), ...read.items] : read.items,
      event => `${event.nodeId}:${event.packetId}`,
    )
    state.protocolPageCoverage = append
      ? [...state.protocolPageCoverage, ...read.pageCoverage]
      : read.pageCoverage
    state.protocol.loaded = true
    state.protocolPaging = {
      nextPage: append ? state.protocolPaging.nextPage + read.pages : read.pages + 1,
      hasMore: read.hasMore,
      total: null,
      complete: !read.hasMore,
      nextCursor: read.nextCursor,
    }
  }

  function loadProtocol(): Promise<void> {
    return trackPaging('protocol', async () => {
      const jobId = state.jobId
      if (!jobId || disposed) return
      const expectedRevision = revision
      state.protocol.loading = true
      state.protocol.error = null
      try {
        const read = await readProtocolFromStart(
          client,
          jobId,
          requestOptions(controller.signal),
          pageMode === 'complete',
        )
        if (!isCurrent(expectedRevision, jobId)) return
        applyProtocolRead(read, false)
      } catch (error: unknown) {
        if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.protocol.error = error
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.protocol.loading = false
      }
    })
  }

  /**
   * Continues the protocol join by one page. The last page's `nextCursor` is the
   * only supported position, so a bounded session never re-walks the join.
   */
  function loadMoreProtocol(): Promise<void> {
    if (!state.protocol.loaded) return loadProtocol()
    const cursor = state.protocolPaging.nextCursor
    if (state.protocolPaging.complete || cursor === null) return Promise.resolve()
    return trackPaging('protocol', async () => {
      const jobId = state.jobId
      if (!jobId || disposed) return
      const expectedRevision = revision
      state.protocol.loading = true
      state.protocol.error = null
      try {
        const result = await client.getTraceProtocol(jobId, { cursor, pageSize: TRACE_PAGE_SIZE }, requestOptions(controller.signal))
        if (!isCurrent(expectedRevision, jobId)) return
        if (result.hasMore && !result.nextCursor) {
          throw new Error('Trace protocol page hasMore without nextCursor')
        }
        if (result.nextCursor === cursor) throw new Error('Trace protocol cursor did not advance')
        applyProtocolRead({
          items: result.items,
          pageCoverage: [{ cursor, coverage: result.coverage, reasons: result.reasons }],
          pages: 1,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        }, true)
      } catch (error: unknown) {
        if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.protocol.error = error
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.protocol.loading = false
      }
    })
  }

  /**
   * Re-reads the protocol join up to the depth this session already shows, in the
   * backend's own cursor order, so a running Job keeps surfacing new facts without
   * an unbounded walk:
   *
   * - a partially loaded ledger re-reads exactly its loaded pages; the loaded
   *   depth is the user's pagination choice and is not silently extended;
   * - a first load that failed holds neither rows nor a cursor, so a poll starts
   *   the bounded chain over instead of leaving the surface in its error state;
   * - a previously complete ledger allows one extra page, which is what captures
   *   facts appended after the old end and keeps a live tail flowing one bounded
   *   page per refresh;
   * - the rebuilt list is deduplicated by `(nodeId, packetId)` and the ledger is
   *   replaced, never appended, so a page is not duplicated by re-reading it;
   * - a refresh that still reports `hasMore` leaves `complete=false`, so the view
   *   keeps saying that the join is truncated instead of presenting a prefix as
   *   the whole evidence set.
   */
  function refreshLoadedProtocol(): Promise<void> {
    // A first load that failed left neither rows nor a cursor. Re-reading page
    // one is the only way back, and a normal poll must attempt it: Parts and
    // Links already re-read page one on every poll, so a failed protocol load
    // would otherwise pin the surface to its error until the session is rebuilt.
    if (!state.protocol.loaded) {
      return state.protocol.error ? loadProtocol() : Promise.resolve()
    }
    return trackPaging('protocol', async () => {
      const jobId = state.jobId
      if (!jobId || disposed) return
      const expectedRevision = revision
      // The bound is resolved when the queue hands this run the turn: a refresh
      // queued behind `loadMoreProtocol` must include the page it appended, or
      // replacing the ledger would drop the rows the user just revealed.
      const loadedPages = Math.max(1, state.protocolPaging.nextPage - 1)
      const budget = pageMode === 'complete'
        ? null
        : state.protocolPaging.complete ? loadedPages + 1 : loadedPages
      state.protocol.loading = true
      state.protocol.error = null
      try {
        const read = await readProtocolFromStart(
          client,
          jobId,
          requestOptions(controller.signal),
          true,
          budget,
        )
        if (!isCurrent(expectedRevision, jobId)) return
        applyProtocolRead(read, false)
      } catch (error: unknown) {
        if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.protocol.error = error
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.protocol.loading = false
      }
    })
  }

  /** Reads the whole protocol join; the report/export surfaces ask for this. */
  function loadAllProtocol(): Promise<void> {
    return trackPaging('protocol', async () => {
      const jobId = state.jobId
      if (!jobId || disposed) return
      const expectedRevision = revision
      state.protocol.loading = true
      state.protocol.error = null
      try {
        const read = await readProtocolFromStart(
          client,
          jobId,
          requestOptions(controller.signal),
          true,
        )
        if (!isCurrent(expectedRevision, jobId)) return
        applyProtocolRead(read, false)
      } catch (error: unknown) {
        if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.protocol.error = error
      } finally {
        if (isCurrent(expectedRevision, jobId)) state.protocol.loading = false
      }
    })
  }

  async function pullObservationPages(fullResync: boolean): Promise<TraceObservation[]> {
    const jobId = state.jobId
    if (!jobId || disposed) return []

    const expectedRevision = revision
    const signal = controller.signal
    const resourceState = state.observations
    resourceState.loading = true
    resourceState.error = null
    if (fullResync) state.resynchronizing = true

    let cursor = fullResync ? undefined : state.observationCursor ?? undefined
    let committedCursor = state.observationCursor
    const pageCursors = new Set<string>()
    if (cursor) pageCursors.add(cursor)
    const fresh: TraceObservation[] = []

    try {
      while (isCurrent(expectedRevision, jobId)) {
        const page = await client.getTraceObservations(jobId, { cursor, pageSize: TRACE_PAGE_SIZE }, requestOptions(signal))
        if (!isCurrent(expectedRevision, jobId)) return []

        const existing = resourceState.data ?? []
        const existingIds = new Set(existing.map(item => item.observationId))
        const unseen = page.items.filter((item) => {
          if (existingIds.has(item.observationId)) return false
          existingIds.add(item.observationId)
          return true
        })
        resourceState.data = mergeObservations(existing, page.items)
        resourceState.loaded = true
        state.cursorConsistency = page.cursorConsistency
        if (!fullResync) fresh.push(...unseen)

        if (page.nextCursor) committedCursor = page.nextCursor
        if (!page.hasMore) {
          state.observationCursor = committedCursor
          return fresh
        }
        if (!page.nextCursor) throw new Error('Trace observation page hasMore without nextCursor')
        if (pageCursors.has(page.nextCursor)) throw new Error('Trace observation cursor did not advance')
        pageCursors.add(page.nextCursor)
        cursor = page.nextCursor
      }
    } catch (error: unknown) {
      if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) resourceState.error = error
    } finally {
      if (isCurrent(expectedRevision, jobId)) {
        resourceState.loading = false
        if (fullResync) state.resynchronizing = false
      }
    }
    return fresh
  }

  function refreshObservations(fullResync = false): Promise<TraceObservation[]> {
    if (fullResync) queuedFullResync = true
    if (observationFlight) return observationFlight

    const flight = (async () => {
      const allFresh: TraceObservation[] = []
      while (!disposed) {
        const shouldResync = queuedFullResync
        queuedFullResync = false
        allFresh.push(...await pullObservationPages(shouldResync))
        if (!queuedFullResync) break
      }
      return allFresh
    })()
    observationFlight = flight
    void flight.finally(() => {
      if (observationFlight === flight) observationFlight = null
    })
    return flight
  }

  async function loadInitial(jobId = state.jobId) {
    if (jobId !== state.jobId) setJobId(jobId)
    if (!state.jobId || disposed) return
    if (initialFlight) return initialFlight
    if (state.initialLoaded && ![
      state.summary.error,
      state.observations.error,
      state.parts.error,
      state.links.error,
      state.protocol.error,
    ].some(Boolean)) return

    const expectedRevision = revision
    state.initialLoading = true
    const initialRequests: Promise<unknown>[] = []
    const selection = options.initialSelection
    if (selection === undefined || selection.summary === true) initialRequests.push(loadSummary())
    if (selection === undefined || selection.observations === true) {
      initialRequests.push(refreshObservations(true).then(() => undefined))
    }
    if (selection === undefined || selection.parts === true) initialRequests.push(loadParts())
    if (selection === undefined || selection.links === true) initialRequests.push(loadLinks())
    if (selection === undefined || selection.protocol === true) initialRequests.push(loadProtocol())
    // The graph is opt-in even for the default selection: it costs one bounded
    // page per stream, and no existing full-profile surface renders it yet.
    if (selection?.graph === true) {
      initialRequests.push(graphModel ? graphModel.loadFirstPage() : Promise.resolve())
    }
    const request = Promise.all(initialRequests).then(() => {
      if (isCurrent(expectedRevision, state.jobId!)) state.initialLoaded = true
    }).finally(() => {
      if (isCurrent(expectedRevision, state.jobId!)) state.initialLoading = false
      if (initialFlight === request) initialFlight = null
    })
    initialFlight = request
    return request
  }

  async function loadPartWindows(page: number): Promise<void> {
    if (!Number.isSafeInteger(page) || page < 1) throw new RangeError('Trace part page must be a positive integer')
    const existing = partWindowFlights.get(page)
    if (existing) return existing
    const jobId = state.jobId
    if (!jobId || disposed) return
    const expectedRevision = revision
    const signal = controller.signal
    state.partsWindowLoading[page] = true
    state.partsWindowErrors[page] = null

    let request: Promise<void>
    request = client.getTraceParts(jobId, { page, pageSize: TRACE_PAGE_SIZE, includeWindows: true }, requestOptions(signal)).then((result) => {
      if (!isCurrent(expectedRevision, jobId)) return
      state.parts.data = mergePartPage(state.parts.data ?? [], result.items)
      state.partsPageCoverage = { ...state.partsPageCoverage, [page]: result.coverage }
      state.parts.loaded = true
    }).catch((error: unknown) => {
      if (isCurrent(expectedRevision, jobId) && !isTraceCancellation(error)) state.partsWindowErrors[page] = error
    }).finally(() => {
      if (isCurrent(expectedRevision, jobId)) state.partsWindowLoading[page] = false
      if (partWindowFlights.get(page) === request) partWindowFlights.delete(page)
    })
    partWindowFlights.set(page, request)
    return request
  }

  async function poll(selection?: TraceSessionPollSelection): Promise<TraceSessionPollResult> {
    if (!state.jobId || disposed) return { partsRefreshed: false, graphRefreshed: false }
    if (!state.initialLoaded) {
      await loadInitial()
      return { partsRefreshed: true, graphRefreshed: false }
    }
    const refreshes: Promise<unknown>[] = []
    const refreshAll = selection === undefined
    if (refreshAll || selection?.summary === true) refreshes.push(loadSummary())
    const freshPromise = refreshAll || selection?.observations === true
      ? refreshObservations(selection?.fullResync === true)
      : Promise.resolve([] as TraceObservation[])
    refreshes.push(freshPromise)
    if (refreshAll || selection?.links === true) refreshes.push(refreshLoadedLinks())
    // The protocol join follows its own selection, never `fullResync` alone: an
    // observation-only resync must not walk the join or change its visible depth.
    // A selected terminal resync still reads the whole join; a live poll re-reads
    // only the visible loaded depth in cursor order, because a cursor chain
    // cannot resume from the middle.
    if (refreshAll || selection?.protocol === true) {
      refreshes.push(selection?.fullResync === true ? loadAllProtocol() : refreshLoadedProtocol())
    }
    if (selection?.graph === true && graphModel) refreshes.push(graphModel.refresh())
    const graphRefreshed = selection?.graph === true && graphModel !== null
    await Promise.all(refreshes)
    const fresh = await freshPromise
    const partsRefreshed = refreshAll
      || selection?.parts === true
      || fresh.some(observation => PART_EVENTS[observation.eventType] === true)
    if (partsRefreshed) await refreshLoadedParts()
    return { partsRefreshed, graphRefreshed }
  }

  function dispose() {
    disposed = true
    revision += 1
    controller.abort()
    resourceFlights.clear()
    pagingFlights.clear()
    pendingPagingRefreshes.clear()
    partWindowFlights.clear()
    queuedFullResync = false
    pendingResourceRefreshes.clear()
    graphModel?.dispose()
  }

  return {
    state,
    setJobId,
    loadInitial,
    poll,
    refreshObservations,
    loadPartWindows,
    loadParts,
    loadLinks,
    loadProtocol,
    loadMoreParts,
    loadMoreLinks,
    loadMoreProtocol,
    refreshLoadedParts,
    refreshLoadedLinks,
    refreshLoadedProtocol,
    loadAllParts,
    loadAllLinks,
    loadAllProtocol,
    loadGraphFirstPage: (): Promise<TraceGraphReadOutcome> =>
      (graphModel ? graphModel.loadFirstPage() : Promise.resolve<TraceGraphReadOutcome>({ kind: 'skipped' })),
    loadGraphMore: (stream: TraceGraphStreamName): Promise<TraceGraphReadOutcome> =>
      (graphModel ? graphModel.loadMore(stream) : Promise.resolve<TraceGraphReadOutcome>({ kind: 'skipped' })),
    refreshGraph: (): Promise<TraceGraphReadOutcome> =>
      (graphModel ? graphModel.refresh() : Promise.resolve<TraceGraphReadOutcome>({ kind: 'skipped' })),
    dispose,
  }
}
