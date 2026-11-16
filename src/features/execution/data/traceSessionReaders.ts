import type {
  TraceCoverageReason,
  TraceCoverageState,
  TraceLink,
  TraceLinksPage,
  TracePart,
  TracePartsPage,
  TraceProtocolEvent,
  TraceProtocolPage,
  TraceRequestOptions,
} from '@/api/trace'

/** Page bound of the sequential Trace readers. */
export const TRACE_PAGE_SIZE = 200

/**
 * Network contracts of the sequential resources, each narrowed to the single
 * route a reader uses. The session client composes these, so a reader can be
 * exercised with a stub that answers one route and nothing else.
 */
export interface TracePartsReader {
  getTraceParts(
    jobId: string,
    params: { page: number; pageSize: number; includeWindows: boolean },
    options?: TraceRequestOptions,
  ): Promise<TracePartsPage>
}

export interface TraceLinksReader {
  getTraceLinks(
    jobId: string,
    params: { page: number; pageSize: number },
    options?: TraceRequestOptions,
  ): Promise<TraceLinksPage>
}

export interface TraceProtocolReader {
  getTraceProtocol(
    jobId: string,
    params: { cursor?: string; pageSize: number },
    options?: TraceRequestOptions,
  ): Promise<TraceProtocolPage>
}

/**
 * One multi-page read of the Part stream. `items` is what those pages returned,
 * in page order; coverage stays per page because the route publishes it per page
 * and a later page says nothing about an earlier one.
 */
export interface TracePartsRead {
  readonly items: readonly TracePart[]
  coverageByPage: Record<number, TraceCoverageState | null>
  lastPage: number
  hasMore: boolean
  total: number
}

export interface TraceLinksRead {
  readonly items: readonly TraceLink[]
  lastPage: number
  hasMore: boolean
  total: number
}

/** Coverage of the cursor page that reported it; never merged into one state. */
export interface TraceProtocolPageCoverage {
  cursor: string | null
  coverage: TraceCoverageState | null
  reasons: TraceCoverageReason[]
}

export interface TraceProtocolRead {
  readonly items: readonly TraceProtocolEvent[]
  pageCoverage: TraceProtocolPageCoverage[]
  pages: number
  hasMore: boolean
  nextCursor: string | null
}

/**
 * Reads the Part stream from `fromPage` through `lastPage` (or until the route
 * reports no further row). A page that claims `hasMore` but returns no row is an
 * inconsistent answer, so the read fails instead of looping; the caller keeps
 * the rows it already held.
 */
export async function readPartsPages(
  client: TracePartsReader,
  jobId: string,
  options: TraceRequestOptions,
  fromPage: number,
  lastPage: number | null,
): Promise<TracePartsRead> {
  const items: TracePart[] = []
  const coverageByPage: Record<number, TraceCoverageState | null> = {}
  let page = fromPage
  let hasMore = false
  let total = 0
  while (true) {
    const result = await client.getTraceParts(jobId, { page, pageSize: TRACE_PAGE_SIZE, includeWindows: false }, options)
    items.push(...result.items)
    coverageByPage[page] = result.coverage
    hasMore = result.hasMore
    total = result.total
    if ((lastPage !== null && page >= lastPage) || !result.hasMore) break
    if (result.items.length === 0) throw new Error('Trace part page ended while hasMore was true')
    page += 1
  }
  return { items, coverageByPage, lastPage: page, hasMore, total }
}

/** Reads the Link stream with the same page bound as {@link readPartsPages}. */
export async function readLinksPages(
  client: TraceLinksReader,
  jobId: string,
  options: TraceRequestOptions,
  fromPage: number,
  lastPage: number | null,
): Promise<TraceLinksRead> {
  const items: TraceLink[] = []
  let page = fromPage
  let hasMore = false
  let total = 0
  while (true) {
    const result = await client.getTraceLinks(jobId, { page, pageSize: TRACE_PAGE_SIZE }, options)
    items.push(...result.items)
    hasMore = result.hasMore
    total = result.total
    if ((lastPage !== null && page >= lastPage) || !result.hasMore) break
    if (result.items.length === 0) throw new Error('Trace link page ended while hasMore was true')
    page += 1
  }
  return { items, lastPage: page, hasMore, total }
}

/**
 * Reads the protocol join from its first page in cursor order. A cursor chain
 * cannot be resumed from a middle position, so every read starts at page 1 and
 * `maxPages` bounds how deep one call goes. A page that claims `hasMore` without
 * a cursor, or repeats the cursor it was read at, proves nothing new and fails.
 */
export async function readProtocolFromStart(
  client: TraceProtocolReader,
  jobId: string,
  options: TraceRequestOptions,
  toEnd: boolean,
  maxPages: number | null = null,
): Promise<TraceProtocolRead> {
  const events: TraceProtocolEvent[] = []
  const pageCoverage: TraceProtocolPageCoverage[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  let hasMore = false
  let pages = 0
  let nextCursor: string | null = null
  while (true) {
    const pageCursor = cursor ?? null
    const result = await client.getTraceProtocol(jobId, { cursor, pageSize: TRACE_PAGE_SIZE }, options)
    pages += 1
    events.push(...result.items)
    pageCoverage.push({ cursor: pageCursor, coverage: result.coverage, reasons: result.reasons })
    hasMore = result.hasMore
    nextCursor = result.nextCursor
    if (result.hasMore && !result.nextCursor) {
      throw new Error('Trace protocol page hasMore without nextCursor')
    }
    if (!toEnd || !result.hasMore) return { items: events, pageCoverage, pages, hasMore, nextCursor }
    if (maxPages !== null && pages >= maxPages) return { items: events, pageCoverage, pages, hasMore, nextCursor }
    if (cursors.has(result.nextCursor as string)) throw new Error('Trace protocol cursor did not advance')
    cursors.add(result.nextCursor as string)
    cursor = result.nextCursor as string
  }
}
