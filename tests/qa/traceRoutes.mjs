/**
 * Trace routes: recorded Summary / Observations / Parts / Links / Protocol.
 *
 * Every answer is either a recorded body (optionally paged, filtered or
 * projected as documented in README.md) or an explicit 404/501. The route
 * returns a response descriptor; it never writes to a socket.
 */

import { buildDerivedSummaryEnvelope } from './derivedSummary.mjs'
import { formatQuery, toInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './httpUtils.mjs'
import { errorResponse, jsonResponse } from './response.mjs'
import { availableResources } from './traceFixtures.mjs'
import { selectScenarioView } from './scenarioViews.mjs'

const TRACE_REQUEST_PATH = /^\/v1\/jobs\/([^/]+)\/trace(?:\/(observations|parts|links|protocol))?$/

/**
 * Match one trace resource path.
 * @param {string} path Normalized path.
 * @returns {{ jobId: string, resource: string } | null}
 */
export function matchTraceRequestPath(path) {
  const match = TRACE_REQUEST_PATH.exec(path)
  if (!match) return null
  return { jobId: decodeURIComponent(match[1]), resource: match[2] ?? 'summary' }
}

export function unknownJobResponse(jobId, knownJobs) {
  return errorResponse({
    status: 404,
    source: 'error',
    code: 'job_not_found',
    message: `Job ${jobId} is not part of the local QA fixture set.`,
    detail: `Known fixture Jobs: ${knownJobs.join(', ') || 'none'}`,
  })
}

/**
 * @param {object} args
 * @param {{ jobs: Map<string, any> }} args.registry
 * @param {string} args.jobId
 * @param {string} args.resource
 * @param {URLSearchParams} args.query
 * @param {string | undefined} args.referer
 */
export function routeTraceRequest({ registry, jobId, resource, query, referer }) {
  const entry = registry.jobs.get(jobId)
  if (!entry) return unknownJobResponse(jobId, [...registry.jobs.keys()])

  const view = selectScenarioView(entry, referer)
  const capture = view.resources[resource]
  if (!capture) {
    return errorResponse({
      status: 501,
      source: 'fixture-missing',
      code: 'trace_resource_not_captured',
      scenario: view.id,
      message: `No ${resource} capture exists for Job ${jobId}; the QA server does not invent trace facts.`,
      detail: `Available resources for this view: ${availableResources(view).join(', ') || 'none'}`,
    })
  }

  const provenance = {
    scenario: view.id,
    source: capture.kind === 'derived'
      ? 'derived-summary'
      : capture.kind === 'synthetic'
        ? 'synthetic-visual-part'
        : `fixture:${capture.origin}`,
    fixture: capture.kind === 'derived' ? 'derived-envelope' : capture.file,
    capturedQuery: capture.kind === 'capture' ? formatQuery(capture.request.query) : null,
    projection: capture.kind === 'capture' ? 'verbatim' : 'qa-synthetic-static-part',
  }

  if (capture.kind === 'derived') {
    if (capture.syntheticIdentitySummary) {
      return jsonResponse({
        ...provenance,
        source: 'synthetic-visual-summary',
        fixture: 'derived-envelope+synthetic-identity-summary',
        projection: 'qa-derived-synthetic-identity-summary',
        body: buildDerivedSummaryEnvelope(jobId, { syntheticIdentitySummary: true }),
      })
    }
    if (capture.syntheticIdentityScope !== null) {
      return jsonResponse({
        ...provenance,
        source: 'synthetic-visual-summary',
        fixture: 'derived-envelope+synthetic-identity-scope',
        projection: 'qa-derived-synthetic-identity-scope',
        body: buildDerivedSummaryEnvelope(jobId, {
          syntheticIdentityScope: capture.syntheticIdentityScope,
        }),
      })
    }
    if (capture.syntheticChallengeRunning) {
      return jsonResponse({
        ...provenance,
        source: 'synthetic-visual-summary',
        fixture: 'derived-envelope+synthetic-challenge-running',
        projection: 'qa-derived-synthetic-challenge-running',
        body: buildDerivedSummaryEnvelope(jobId, { syntheticChallengeRunning: true }),
      })
    }
    if (capture.syntheticTagGenerationProgress) {
      return jsonResponse({
        ...provenance,
        source: 'synthetic-visual-summary',
        fixture: 'derived-envelope+synthetic-tag-generation-progress',
        projection: 'qa-derived-synthetic-tag-generation-progress',
        body: buildDerivedSummaryEnvelope(jobId, { syntheticTagGenerationProgress: true }),
      })
    }
    return jsonResponse({
      ...provenance,
      projection: 'qa-derived-null-fields',
      body: buildDerivedSummaryEnvelope(jobId),
    })
  }

  if (capture.kind === 'synthetic') return jsonResponse({ ...provenance, body: capture.body })
  if (resource === 'summary') return jsonResponse({ ...provenance, body: capture.body })
  if (resource === 'observations') return serveObservationPage(provenance, capture, query)
  if (resource === 'protocol') return serveProtocolPage(provenance, capture, query)
  return servePagedTraceResource(provenance, capture, resource, query)
}

function captureError(base, code, message, detail, status = 501) {
  return errorResponse({
    status,
    source: base.source,
    code,
    message,
    detail,
    scenario: base.scenario,
    fixture: base.fixture,
  })
}

/** Cursor paged observation capture: only the captured page (and its tail) exists. */
function serveObservationPage(base, capture, query) {
  return serveCursorCapture({ base, capture, query, filterKind: 'observation' })
}

function serveProtocolPage(base, capture, query) {
  return serveCursorCapture({
    base,
    capture,
    query,
    filterKind: 'protocol',
    messageTypes: query.get('messageTypes'),
  })
}

function serveCursorCapture({ base, capture, query, filterKind, messageTypes }) {
  const body = capture.body
  const items = Array.isArray(body.items) ? body.items : []
  const capturedQuery = capture.request.query ?? {}

  // A cursor the capture never produced cannot be answered truthfully.
  const requestedCursor = query.get('cursor')
  if (requestedCursor !== null && requestedCursor !== '') {
    if (requestedCursor !== (body.nextCursor ?? null)) {
      return captureError(base, 'trace_cursor_not_captured',
        'Only the captured cursor page exists in the fixture set.',
        `Requested cursor is not the captured continuation of ${base.fixture}.`)
    }
    return jsonResponse({
      ...base,
      projection: 'captured-cursor-tail',
      body: {
        ...body,
        items: [],
        hasMore: false,
        nextCursor: null,
      },
    })
  }

  // Narrowing an eventual-consistency cursor page is not supported: the fixture
  // has no continuation that would let the client reach the remaining rows.
  const requestedPageSize = query.get('pageSize')
  if (requestedPageSize !== null && requestedPageSize !== '') {
    const pageSize = toInt(requestedPageSize, items.length, 1, MAX_PAGE_SIZE)
    if (pageSize < items.length) {
      return captureError(base, 'trace_page_size_not_captured',
        'The capture holds a single cursor page; it cannot be re-paged smaller.',
        `Captured rows: ${items.length}, requested pageSize: ${pageSize}.`)
    }
  }

  if (filterKind === 'observation') {
    const missed = unsupportedObservationFilter(query, capturedQuery)
    if (missed) {
      return captureError(base, 'trace_filter_not_captured',
        `The captured observation page was not filtered by ${missed.key}.`,
        `Captured query: ${formatQuery(capturedQuery)}.`)
    }
    const projection = capturedQuery.category
      ? `captured-filter=category:${capturedQuery.category}`
      : 'verbatim'
    return jsonResponse({ ...base, projection, body })
  }

  if (messageTypes === null || messageTypes === '') return jsonResponse({ ...base, body })

  const wanted = new Set(messageTypes.split(',').map(value => value.trim()).filter(Boolean))
  const filtered = items.filter(item => wanted.has(item?.messageType))
  return jsonResponse({
    ...base,
    projection: `filter=messageTypes:${[...wanted].sort().join('|')}`,
    body: {
      ...body,
      items: filtered,
      hasMore: false,
    },
  })
}

/**
 * The capture may itself be filtered (`category=challenge`). Serving it for a
 * different filter would present a narrowed set as a complete one, so only the
 * captured filter (or none) is accepted.
 */
function unsupportedObservationFilter(query, capturedQuery) {
  const category = query.get('category')
  if (category !== null && category !== '' && category !== capturedQuery.category) {
    return { key: 'category', requested: category, captured: capturedQuery.category ?? null }
  }
  if (query.get('partIndex') !== null && query.get('partIndex') !== '') {
    return { key: 'partIndex', requested: query.get('partIndex'), captured: null }
  }
  return null
}

/** Page-numbered capture (parts / links): paging and filtering over captured rows. */
function servePagedTraceResource(base, capture, resource, query) {
  const body = capture.body
  const capturedItems = Array.isArray(body.items) ? body.items : []
  const total = typeof body.total === 'number' ? body.total : capturedItems.length
  const complete = total === capturedItems.length

  let items = capturedItems
  const projections = []
  let nodeIdFilter = null

  if (resource === 'links') {
    const nodeId = query.get('nodeId')
    if (nodeId !== null && nodeId !== '') {
      nodeIdFilter = nodeId
      items = items.filter(item => item?.nodeId === nodeId)
      projections.push(`filter=nodeId:${nodeId}`)
    }
  }

  const page = toInt(query.get('page'), body.page ?? 1, 1, 1e6)
  const pageSize = toInt(query.get('pageSize'), body.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

  if (!complete && page > 1) {
    return captureError(base, 'trace_page_not_captured',
      `Only page 1 of this ${resource} capture exists.`,
      `Captured rows: ${capturedItems.length}, declared total: ${total}.`)
  }

  const effectiveTotal = nodeIdFilter === null ? total : items.length
  const start = (page - 1) * pageSize
  let pageItems = items.slice(start, start + pageSize)
  const hasMore = start + pageItems.length < effectiveTotal

  if (!complete && pageSize < capturedItems.length) {
    // The captured page is not the whole set; re-paging it would hide rows.
    return captureError(base, 'trace_page_size_not_captured',
      'Only the captured page of this capture exists; it cannot be re-paged smaller.',
      `Captured rows: ${capturedItems.length}, declared total: ${total}, requested pageSize: ${pageSize}.`)
  }

  if (resource === 'parts') {
    const includeWindows = query.get('includeWindows') === 'true'
    if (!includeWindows && pageItems.some(item => item && typeof item === 'object' && 'windows' in item)) {
      // Contract: `windows` is omitted (not empty) unless the caller asked for it.
      pageItems = pageItems.map(item => {
        if (!item || typeof item !== 'object' || !('windows' in item)) return item
        const { windows, ...rest } = item
        void windows
        return rest
      })
      projections.push('windows-omitted')
    }
  }

  const unchanged = page === (body.page ?? 1)
    && pageSize === (body.pageSize ?? DEFAULT_PAGE_SIZE)
    && pageItems.length === capturedItems.length
    && projections.length === 0

  if (unchanged) return jsonResponse({ ...base, body })

  return jsonResponse({
    ...base,
    projection: projections.join('+') || 'repaged',
    body: {
      ...body,
      items: pageItems,
      total: effectiveTotal,
      page,
      pageSize,
      hasMore,
    },
  })
}
