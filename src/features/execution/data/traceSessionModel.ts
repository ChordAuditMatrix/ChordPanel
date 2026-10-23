import type {
  TraceCoverageReason,
  TraceCoverageState,
  TraceLink,
  TraceLinksPage,
  TraceObservation,
  TraceObservationsPage,
  TracePart,
  TracePartsPage,
  TraceProtocolEvent,
  TraceProtocolPage,
  TraceRequestOptions,
  TraceSummary,
} from '@/api/trace'

const TRACE_PAGE_SIZE = 200

export interface TraceResource<T> {
  data: T | null
  loaded: boolean
  loading: boolean
  error: unknown | null
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
  /** Per-page source coverage; no aggregate state is inferred from loaded rows. */
  partsPageCoverage: Record<number, TraceCoverageState | null>
  partsWindowLoading: Record<number, boolean>
  partsWindowErrors: Record<number, unknown | null>
  links: TraceResource<TraceLink[]>
  protocol: TraceResource<TraceProtocolEvent[]>
  /** Protocol coverage/reasons stay tied to the cursor page that returned them. */
  protocolPageCoverage: Array<{
    cursor: string | null
    coverage: TraceCoverageState | null
    reasons: TraceCoverageReason[]
  }>
}

export interface TraceSessionClient {
  getTraceSummary(jobId: string, options?: TraceRequestOptions): Promise<TraceSummary>
  getTraceObservations(jobId: string, params: { cursor?: string; pageSize: number }, options?: TraceRequestOptions): Promise<TraceObservationsPage>
  getTraceParts(jobId: string, params: { page: number; pageSize: number; includeWindows: boolean }, options?: TraceRequestOptions): Promise<TracePartsPage>
  getTraceLinks(jobId: string, params: { page: number; pageSize: number }, options?: TraceRequestOptions): Promise<TraceLinksPage>
  getTraceProtocol(jobId: string, params: { cursor?: string; pageSize: number }, options?: TraceRequestOptions): Promise<TraceProtocolPage>
}

type ResourceKey = 'summary' | 'parts' | 'links' | 'protocol'


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
    partsPageCoverage: {},
    partsWindowLoading: {},
    partsWindowErrors: {},
    links: resource<TraceLink[]>(),
    protocol: resource<TraceProtocolEvent[]>(),
    protocolPageCoverage: [],
  }
}

function isCancellation(error: unknown): boolean {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError')) return true
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ERR_CANCELED'
}

/** Merge immutable Observation facts by their durable identity and Admin recording order. */
export function mergeObservations(
  existing: readonly TraceObservation[],
  incoming: readonly TraceObservation[],
): TraceObservation[] {
  const byId = new Map<string, TraceObservation>()
  for (const observation of existing) byId.set(observation.observationId, observation)
  for (const observation of incoming) {
    if (!byId.has(observation.observationId)) byId.set(observation.observationId, observation)
  }
  return [...byId.values()].sort((left, right) => {
    if (left.recordedAtMs !== right.recordedAtMs) return left.recordedAtMs < right.recordedAtMs ? -1 : 1
    if (left.observationId === right.observationId) return 0
    return left.observationId < right.observationId ? -1 : 1
  })
}

function partKey(part: TracePart): string {
  return `${part.partIndex}:${part.attempt ?? ''}`
}

function preserveLoadedWindows(next: TracePart[], previous: readonly TracePart[]): TracePart[] {
  const oldParts = new Map(previous.map(part => [partKey(part), part]))
  return next.map(part => {
    const old = oldParts.get(partKey(part))
    return old?.windows !== undefined && part.windows === undefined
      ? { ...part, windows: old.windows }
      : part
  })
}

function mergePartPage(existing: readonly TracePart[], incoming: readonly TracePart[]): TracePart[] {
  const parts = new Map(existing.map(part => [partKey(part), part]))
  for (const part of incoming) {
    const old = parts.get(partKey(part))
    parts.set(partKey(part), old?.windows !== undefined && part.windows === undefined
      ? { ...part, windows: old.windows }
      : part)
  }
  return [...parts.values()].sort((left, right) => {
    if (left.partIndex !== right.partIndex) return left.partIndex - right.partIndex
    return (left.attempt ?? 0) - (right.attempt ?? 0)
  })
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const unique = new Map<string, T>()
  for (const item of items) unique.set(keyOf(item), item)
  return [...unique.values()]
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
  protocol?: boolean
  /** A bounded cursor recovery scan; existing rows and replay identity are preserved. */
  fullResync?: boolean
}

export interface TraceSessionPollResult {
  partsRefreshed: boolean
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
}

/**
 * Source-backed execution data with single-flight page readers and an eventual-cursor ledger.
 * Network access stays behind TraceSessionClient so cursor, error and late-row behavior can be
 * exercised independently from Vue lifecycle and Axios.
 */
export function createTraceSessionModel(
  client: TraceSessionClient,
  state = createTraceSessionState(),
  options: TraceSessionModelOptions = {},
) {
  /** Request options shared by every loader; `silent` never alters error propagation. */
  function requestOptions(signal: AbortSignal): TraceRequestOptions {
    return options.silent === true ? { signal, silent: true } : { signal }
  }

  const resourceFlights = new Map<ResourceKey, Promise<void>>()
  const pendingResourceRefreshes = new Set<ResourceKey>()
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
    partWindowFlights.clear()
    initialFlight = null
    observationFlight = null
    queuedFullResync = false
    disposed = false
    Object.assign(state, createTraceSessionState(jobId))
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
      if (isCurrent(expectedRevision, jobId) && !isCancellation(error)) target.error = error
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


  function loadParts(): Promise<void> {
    return loadResource('parts', async (jobId, signal) => {
      const parts: TracePart[] = []
      const coverageByPage: Record<number, TraceCoverageState | null> = {}
      let page = 1
      while (true) {
        const result = await client.getTraceParts(jobId, { page, pageSize: TRACE_PAGE_SIZE, includeWindows: false }, requestOptions(signal))
        parts.push(...result.items)
        coverageByPage[page] = result.coverage
        if (!result.hasMore) break
        if (result.items.length === 0) throw new Error('Trace part page ended while hasMore was true')
        page += 1
      }
      return { items: parts, coverageByPage }
    }, result => preserveLoadedWindows(result.items, state.parts.data ?? []), result => {
      state.partsPageCoverage = result.coverageByPage
    })
  }

  function loadLinks(): Promise<void> {
    return loadResource('links', async (jobId, signal) => {
      const links: TraceLink[] = []
      let page = 1
      while (true) {
        const result = await client.getTraceLinks(jobId, { page, pageSize: TRACE_PAGE_SIZE }, requestOptions(signal))
        links.push(...result.items)
        if (!result.hasMore) break
        if (result.items.length === 0) throw new Error('Trace link page ended while hasMore was true')
        page += 1
      }
      return links
    }, links => uniqueBy(links, link => link.linkKey))
  }

  function loadProtocol(): Promise<void> {
    return loadResource('protocol', async (jobId, signal) => {
      const events: TraceProtocolEvent[] = []
      const pageCoverage: TraceSessionState['protocolPageCoverage'] = []
      let cursor: string | undefined
      const cursors = new Set<string>()
      while (true) {
        const pageCursor = cursor ?? null
        const result = await client.getTraceProtocol(jobId, { cursor, pageSize: TRACE_PAGE_SIZE }, requestOptions(signal))
        events.push(...result.items)
        pageCoverage.push({ cursor: pageCursor, coverage: result.coverage, reasons: result.reasons })
        if (!result.hasMore) break
        if (!result.nextCursor) throw new Error('Trace protocol page hasMore without nextCursor')
        if (cursors.has(result.nextCursor)) throw new Error('Trace protocol cursor did not advance')
        cursors.add(result.nextCursor)
        cursor = result.nextCursor
      }
      return { items: events, pageCoverage }
    }, result => uniqueBy(result.items, event => `${event.nodeId}:${event.packetId}`), result => {
      state.protocolPageCoverage = result.pageCoverage
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
      if (isCurrent(expectedRevision, jobId) && !isCancellation(error)) resourceState.error = error
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
    const request = Promise.all([
      loadSummary(),
      refreshObservations(true).then(() => undefined),
      loadParts(),
      loadLinks(),
      loadProtocol(),
    ]).then(() => {
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
      if (isCurrent(expectedRevision, jobId) && !isCancellation(error)) state.partsWindowErrors[page] = error
    }).finally(() => {
      if (isCurrent(expectedRevision, jobId)) state.partsWindowLoading[page] = false
      if (partWindowFlights.get(page) === request) partWindowFlights.delete(page)
    })
    partWindowFlights.set(page, request)
    return request
  }

  async function poll(selection?: TraceSessionPollSelection): Promise<TraceSessionPollResult> {
    if (!state.jobId || disposed) return { partsRefreshed: false }
    if (!state.initialLoaded) {
      await loadInitial()
      return { partsRefreshed: true }
    }
    const refreshes: Promise<unknown>[] = []
    const refreshAll = selection === undefined
    if (refreshAll || selection?.summary === true) refreshes.push(loadSummary())
    const freshPromise = refreshAll || selection?.observations === true
      ? refreshObservations(selection?.fullResync === true)
      : Promise.resolve([] as TraceObservation[])
    refreshes.push(freshPromise)
    if (refreshAll || selection?.links === true) refreshes.push(loadLinks())
    if (refreshAll || selection?.protocol === true) refreshes.push(loadProtocol())
    await Promise.all(refreshes)
    const fresh = await freshPromise
    const partsRefreshed = refreshAll
      || selection?.parts === true
      || fresh.some(observation => PART_EVENTS[observation.eventType] === true)
    if (partsRefreshed) await loadParts()
    return { partsRefreshed }
  }

  function dispose() {
    disposed = true
    revision += 1
    controller.abort()
    resourceFlights.clear()
    partWindowFlights.clear()
    queuedFullResync = false
    pendingResourceRefreshes.clear()
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
    dispose,
  }
}
