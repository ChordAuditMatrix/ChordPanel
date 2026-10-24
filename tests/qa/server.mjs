/**
 * Loopback-only fixture API used by `npm run qa:fixtures`.
 *
 * Design constraints (see README.md for the user-facing version):
 *
 * - Read-only. Every non-GET/HEAD request answers 501 `qa_read_only`; no request
 *   can mutate the fixture set or pretend to mutate backend state.
 * - Trace routes serve *recorded* responses from `tests/fixtures/observability`.
 *   The only permitted transformations are paging, filtering and the documented
 *   `includeWindows` projection of existing facts. A resource that was never
 *   captured answers 501 `trace_resource_not_captured`; a Job outside the fixture
 *   set answers 404 `job_not_found`.
 * - Non-telemetry surfaces answer from `fixtures/synthetic/base.json` and are
 *   labelled `X-ChordPanel-QA-Source: synthetic`.
 * - Every response carries `Cache-Control: no-store` plus `X-ChordPanel-QA*`
 *   provenance headers so a fixture response can never be mistaken for live
 *   backend output.
 */

import { createServer } from 'node:http'
import { availableResources, buildDerivedSummaryEnvelope } from './traceFixtures.mjs'

export const QA_HEADER = 'X-ChordPanel-QA'
export const QA_SOURCE_HEADER = 'X-ChordPanel-QA-Source'
export const QA_SCENARIO_HEADER = 'X-ChordPanel-QA-Scenario'
export const QA_FIXTURE_HEADER = 'X-ChordPanel-QA-Fixture'
export const QA_CAPTURED_QUERY_HEADER = 'X-ChordPanel-QA-Captured-Query'
export const QA_PROJECTION_HEADER = 'X-ChordPanel-QA-Projection'

const TRACE_ROUTE = /^\/v1\/jobs\/([^/]+)\/trace(?:\/(observations|parts|links|protocol))?$/
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 1000

function formatQuery(query) {
  const entries = Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== null)
  if (entries.length === 0) return '-'
  return entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join('&')
}

function toInt(raw, fallback, min, max) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/** `'/api/v1/nodes'` and `'/v1/nodes'` both resolve to `'/v1/nodes'`. */
function normalizePath(pathname) {
  if (pathname === '/api') return '/'
  if (pathname.startsWith('/api/')) return pathname.slice(4)
  return pathname
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function writeBody(res, method, status, body, headers) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(payload)),
    'Cache-Control': 'no-store',
    [QA_HEADER]: 'fixtures',
    ...headers,
  })
  if (method === 'HEAD') {
    res.end()
    return
  }
  res.end(payload)
}

/**
 * @param {object} options
 * @param {{ jobs: Map<string, any> }} options.registry Output of `loadTraceRegistry`.
 * @param {any} options.synthetic Parsed `fixtures/synthetic/base.json`.
 * @param {string | (() => string)} [options.appOrigin] Vite origin used for links in the QA index.
 * @param {(line: string) => void} [options.logger]
 */
export function createQaServer({ registry, synthetic, appOrigin = 'http://localhost:5173', logger = () => {} }) {
  const knownJobs = [...registry.jobs.keys()]
  const resolveAppOrigin = typeof appOrigin === 'function' ? appOrigin : () => appOrigin

  /** @type {import('node:http').Server} */
  const server = createServer((req, res) => {
    const startedAt = Date.now()
    res.on('finish', () => {
      logger(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - startedAt}ms)`)
    })
    try {
      handle(req, res)
    } catch (cause) {
      logger(`internal error: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`)
      if (!res.headersSent) {
        writeBody(res, req.method ?? 'GET', 500, {
          error: 'qa_internal_error',
          message: 'The QA fixture server failed while answering this request.',
          detail: cause instanceof Error ? cause.message : String(cause),
        }, { [QA_SOURCE_HEADER]: 'error' })
      } else {
        res.end()
      }
    }
  })

  server.on('listening', () => {
    const address = server.address()
    logger(`[qa] fixture API listening on http://127.0.0.1:${address && typeof address === 'object' ? address.port : '?'}`)
  })

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  function handle(req, res) {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const referer = req.headers.referer
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const host = (req.headers.host ?? '').toLowerCase()
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])

    const base = { res, method, source: 'none', scenario: null, fixture: null }

    // DNS-rebinding guard: the fixture server must only answer its own loopback names.
    if (!allowedHosts.has(host)) {
      return sendError({ ...base, source: 'error' }, 403, 'qa_loopback_only',
        'The QA fixture server only answers 127.0.0.1 / localhost.', `Received Host: ${host || '(none)'}`)
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return sendError({ ...base, source: 'read-only' }, 501, 'qa_read_only',
        'The QA fixture server is read-only; write endpoints are not implemented.',
        `${method} ${url.pathname} was rejected without touching any state.`)
    }

    const path = normalizePath(url.pathname)

    if (path === '/qa' || path === '/qa/') return sendIndex(res, method, url)
    if (path === '/qa/health') {
      return writeBody(res, method, 200, {
        ok: true,
        mode: 'fixtures',
        liveBackend: false,
        jobs: knownJobs,
        scenarios: [...registry.jobs.values()].flatMap(entry =>
          [...entry.views.values()].map(view => ({
            id: view.id,
            label: view.label,
            jobId: entry.jobId,
            landing: view.landing,
            resources: availableResources(view),
          })),
        ),
      }, { [QA_SOURCE_HEADER]: 'meta' })
    }

    const traceMatch = TRACE_ROUTE.exec(path)
    if (traceMatch) {
      return serveTrace(base, decodeURIComponent(traceMatch[1]), traceMatch[2] ?? 'summary', url.searchParams, referer)
    }

    return serveSynthetic(base, path, url.searchParams, referer)
  }
  function selectScenarioView(entry, referer) {
    const fallback = entry.views?.get(entry.scenarioId) ?? entry
    if (typeof referer !== 'string') return fallback
    try {
      const viewId = new URL(referer).searchParams.get('qaView')
      return (viewId && entry.views?.get(viewId)) || fallback
    } catch {
      return fallback
    }
  }

  function sendError(base, status, code, message, detail) {
    const { res, method } = base
    writeBody(res, method, status, {
      error: code,
      message,
      detail: detail ?? '',
    }, {
      [QA_SOURCE_HEADER]: base.source ?? 'error',
      ...(base.scenario ? { [QA_SCENARIO_HEADER]: base.scenario } : {}),
      ...(base.fixture ? { [QA_FIXTURE_HEADER]: base.fixture } : {}),
    })
  }

  function sendCaptured(base, body, extra = {}) {
    const { res, method } = base
    writeBody(res, method, 200, body, {
      [QA_SOURCE_HEADER]: base.source,
      ...(base.scenario ? { [QA_SCENARIO_HEADER]: base.scenario } : {}),
      ...(base.fixture ? { [QA_FIXTURE_HEADER]: base.fixture } : {}),
      ...(base.capturedQuery ? { [QA_CAPTURED_QUERY_HEADER]: base.capturedQuery } : {}),
      ...(base.projection ? { [QA_PROJECTION_HEADER]: base.projection } : {}),
      ...extra,
    })
  }

  function sendSynthetic(base, body, extra = {}) {
    const { res, method } = base
    writeBody(res, method, 200, body, {
      [QA_SOURCE_HEADER]: 'synthetic',
      [QA_FIXTURE_HEADER]: base.fixture ?? 'fixtures/synthetic/base.json',
      ...(base.scenario ? { [QA_SCENARIO_HEADER]: base.scenario } : {}),
      ...(base.projection ? { [QA_PROJECTION_HEADER]: base.projection } : {}),
      ...extra,
    })
  }

  // ── Trace routes ──────────────────────────────────────────────────────────

  function serveTrace(base, jobId, resource, query, referer) {
    const entry = registry.jobs.get(jobId)
    if (!entry) {
      return sendError({ ...base, source: 'error' }, 404, 'job_not_found',
        `Job ${jobId} is not part of the local QA fixture set.`,
        `Known fixture Jobs: ${knownJobs.join(', ') || 'none'}`)
    }

    const view = selectScenarioView(entry, referer)
    const capture = view.resources[resource]
    if (!capture) {
      return sendError({ ...base, source: 'fixture-missing', scenario: view.id }, 501,
        'trace_resource_not_captured',
        `No ${resource} capture exists for Job ${jobId}; the QA server does not invent trace facts.`,
        `Available resources for this view: ${availableResources(view).join(', ') || 'none'}`)
    }

    const provenance = {
      ...base,
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
        provenance.source = 'synthetic-visual-summary'
        provenance.fixture = 'derived-envelope+synthetic-identity-summary'
        provenance.projection = 'qa-derived-synthetic-identity-summary'
        return sendCaptured(provenance, buildDerivedSummaryEnvelope(jobId, {
          syntheticIdentitySummary: true,
        }))
      }
      if (capture.syntheticIdentityScope !== null) {
        provenance.source = 'synthetic-visual-summary'
        provenance.fixture = 'derived-envelope+synthetic-identity-scope'
        provenance.projection = 'qa-derived-synthetic-identity-scope'
        return sendCaptured(provenance, buildDerivedSummaryEnvelope(jobId, {
          syntheticIdentityScope: capture.syntheticIdentityScope,
        }))
      }
      if (capture.syntheticChallengeRunning) {
        provenance.source = 'synthetic-visual-summary'
        provenance.fixture = 'derived-envelope+synthetic-challenge-running'
        provenance.projection = 'qa-derived-synthetic-challenge-running'
        return sendCaptured(provenance, buildDerivedSummaryEnvelope(jobId, {
          syntheticChallengeRunning: true,
        }))
      }
      if (capture.syntheticTagGenerationProgress) {
        provenance.source = 'synthetic-visual-summary'
        provenance.fixture = 'derived-envelope+synthetic-tag-generation-progress'
        provenance.projection = 'qa-derived-synthetic-tag-generation-progress'
        return sendCaptured(provenance, buildDerivedSummaryEnvelope(jobId, {
          syntheticTagGenerationProgress: true,
        }))
      }
      provenance.projection = 'qa-derived-null-fields'
      return sendCaptured(provenance, buildDerivedSummaryEnvelope(jobId))
    }

    if (capture.kind === 'synthetic') return sendCaptured(provenance, capture.body)
    if (resource === 'summary') return sendCaptured(provenance, capture.body)
    if (resource === 'observations') return serveObservationPage(provenance, capture, query)
    if (resource === 'protocol') return serveProtocolPage(provenance, capture, query)
    return servePagedTraceResource(provenance, capture, resource, query)
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
        return sendError(base, 501, 'trace_cursor_not_captured',
          'Only the captured cursor page exists in the fixture set.',
          `Requested cursor is not the captured continuation of ${base.fixture}.`)
      }
      return sendCaptured({ ...base, projection: 'captured-cursor-tail' }, {
        ...body,
        items: [],
        hasMore: false,
        nextCursor: null,
      })
    }

    // Narrowing an eventual-consistency cursor page is not supported: the fixture
    // has no continuation that would let the client reach the remaining rows.
    const requestedPageSize = query.get('pageSize')
    if (requestedPageSize !== null && requestedPageSize !== '') {
      const pageSize = toInt(requestedPageSize, items.length, 1, MAX_PAGE_SIZE)
      if (pageSize < items.length) {
        return sendError(base, 501, 'trace_page_size_not_captured',
          'The capture holds a single cursor page; it cannot be re-paged smaller.',
          `Captured rows: ${items.length}, requested pageSize: ${pageSize}.`)
      }
    }

    if (filterKind === 'observation') {
      const missed = unsupportedObservationFilter(query, capturedQuery)
      if (missed) {
        return sendError(base, 501, 'trace_filter_not_captured',
          `The captured observation page was not filtered by ${missed.key}.`,
          `Captured query: ${formatQuery(capturedQuery)}.`)
      }
      const projection = capturedQuery.category
        ? `captured-filter=category:${capturedQuery.category}`
        : 'verbatim'
      return sendCaptured({ ...base, projection }, body)
    }

    if (messageTypes === null || messageTypes === '') return sendCaptured(base, body)

    const wanted = new Set(messageTypes.split(',').map(value => value.trim()).filter(Boolean))
    const filtered = items.filter(item => wanted.has(item?.messageType))
    return sendCaptured({ ...base, projection: `filter=messageTypes:${[...wanted].sort().join('|')}` }, {
      ...body,
      items: filtered,
      hasMore: false,
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
    let projections = []
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
      return sendError(base, 501, 'trace_page_not_captured',
        `Only page 1 of this ${resource} capture exists.`,
        `Captured rows: ${capturedItems.length}, declared total: ${total}.`)
    }

    const effectiveTotal = nodeIdFilter === null ? total : items.length
    const start = (page - 1) * pageSize
    let pageItems = items.slice(start, start + pageSize)
    const hasMore = start + pageItems.length < effectiveTotal

    if (!complete && pageSize < capturedItems.length) {
      // The captured page is not the whole set; re-paging it would hide rows.
      return sendError(base, 501, 'trace_page_size_not_captured',
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

    if (unchanged) return sendCaptured(base, body)

    const projected = {
      ...body,
      items: pageItems,
      total: effectiveTotal,
      page,
      pageSize,
      hasMore,
    }
    return sendCaptured({ ...base, projection: projections.join('+') || 'repaged' }, projected)
  }

  // ── Synthetic (non-telemetry) routes ──────────────────────────────────────

  function serveSynthetic(base, path, query, referer) {
    const syntheticBase = { ...base, fixture: 'fixtures/synthetic/base.json' }

    if (path === '/v1/system/status') {
      return sendSynthetic(syntheticBase, synthetic.systemStatus)
    }

    if (path === '/v1/nodes') {
      return sendSynthetic(syntheticBase, pageOf(synthetic.nodes, query))
    }

    if (/^\/v1\/nodes\/[^/]+\/protocol-events$/.test(path)) {
      return sendError(
        { ...syntheticBase, source: 'fixture-missing' },
        501,
        'protocol_events_not_captured',
        'Node-level protocol-event records are not included in the checked-in fixture set.',
        'Trace protocol captures are a different API resource and are not substituted here.',
      )
    }

    const nodeDetail = /^\/v1\/nodes\/([^/]+)$/.exec(path)
    if (nodeDetail) {
      const nodeId = decodeURIComponent(nodeDetail[1])
      const detail = synthetic.nodeDetails?.[nodeId]
      if (!detail) {
        return sendError({ ...syntheticBase, source: 'synthetic' }, 404, 'node_not_found',
          `Node ${nodeId} is not part of the synthetic QA node set.`,
          `Known nodes: ${Object.keys(synthetic.nodeDetails ?? {}).join(', ')}`)
      }
      return sendSynthetic(syntheticBase, detail)
    }

    if (path === '/v1/jobs') {
      const rows = sortJobs(filterJobs(synthetic.jobs, query), query).map(jobSummaryOf)
      return sendSynthetic(syntheticBase, pageOf(rows, query))
    }

    if (path === '/v1/jobs/aggregate') {
      return sendError({ ...syntheticBase, source: 'synthetic' }, 501, 'qa_route_not_implemented',
        'The QA fixture server does not implement Job aggregation.',
        'The frontend does not call /v1/jobs/aggregate.')
    }

    const jobTasks = /^\/v1\/jobs\/([^/]+)\/tasks$/.exec(path)
    if (jobTasks) {
      const jobId = decodeURIComponent(jobTasks[1])
      const entry = registry.jobs.get(jobId)
      const view = entry ? selectScenarioView(entry, referer) : null
      const taskBase = view ? { ...syntheticBase, scenario: view.id } : syntheticBase
      const tasks = synthetic.tasks?.[jobId]
      if (!tasks || view?.tasksUnavailable === true) {
        if (entry) {
          return sendError({ ...taskBase, source: 'fixture-missing' }, 501, 'tasks_not_captured',
            `No Task response is configured for QA Trace Job ${jobId}.`,
            'This QA scenario provides no Task response; the server will not synthesize Task IDs or statuses.')
        }
        return sendError({ ...taskBase, source: 'synthetic' }, 404, 'job_not_found',
          `Job ${jobId} has no synthetic task list.`,
          `Known Jobs: ${Object.keys(synthetic.tasks ?? {}).join(', ')}`)
      }
      const sorted = [...tasks].sort((left, right) => (left.submittedAtMs ?? 0) - (right.submittedAtMs ?? 0))
      return sendSynthetic(taskBase, pageOf(sorted, query))
    }

    const jobDetailMatch = /^\/v1\/jobs\/([^/]+)$/.exec(path)
    if (jobDetailMatch) {
      const jobId = decodeURIComponent(jobDetailMatch[1])
      const job = synthetic.jobs.find(candidate => candidate.jobId === jobId)
      if (!job) {
        return sendError({ ...syntheticBase, source: 'synthetic' }, 404, 'job_not_found',
          `Job ${jobId} is not part of the synthetic QA job set.`,
          `Known Jobs: ${synthetic.jobs.map(candidate => candidate.jobId).join(', ')}`)
      }
      const entry = registry.jobs.get(jobId)
      const view = entry ? selectScenarioView(entry, referer) : null
      const jobDetail = {
        ...job,
        status: view?.jobStatus ?? job.status ?? null,
        history: Array.isArray(job.history) ? job.history : [],
      }
      const hasSyntheticIdentityDetails = view?.resources.summary?.syntheticIdentitySummary === true
      if (hasSyntheticIdentityDetails) {
        jobDetail.metadata = {
          ...jobDetail.metadata,
          _rootHash: 'qa-root-hash-visual-only-371f5280',
        }
      }
      if (view?.jobStatus === 'Running') {
        jobDetail.status = 'Running'
        jobDetail.endedAtMs = null
        jobDetail.totalDurationMs = null
        jobDetail.history = jobDetail.history.filter(item => item.status === 'Pending' || item.status === 'Running')
      } else if (view?.jobStatus) {
        jobDetail.status = view.jobStatus
      }
      if (view?.tasksUnavailable === true) delete jobDetail.taskIds
      return sendSynthetic(
        {
          ...syntheticBase,
          scenario: view?.id ?? null,
          ...(hasSyntheticIdentityDetails
            ? {
                fixture: 'synthetic-identity-summary-preview',
                projection: 'qa-synthetic-identity-details',
              }
            : {}),
        },
        jobDetail,
      )
    }


    if (path === '/v1/users') {
      return sendSynthetic(syntheticBase, pageOf(sortUsers(synthetic.users, query), query))
    }

    const userDetail = /^\/v1\/users\/([^/]+)$/.exec(path)
    if (userDetail) {
      const userId = decodeURIComponent(userDetail[1])
      const user = synthetic.users.find(candidate => candidate.userId === userId)
      if (!user) {
        return sendError({ ...syntheticBase, source: 'synthetic' }, 404, 'user_not_found',
          `User ${userId} is not part of the synthetic QA user set.`,
          `Known users: ${synthetic.users.map(candidate => candidate.userId).join(', ')}`)
      }
      return sendSynthetic(syntheticBase, user)
    }

    if (path === '/v1/algorithms/strategies') {
      return sendSynthetic(syntheticBase, pageOf(synthetic.strategies, query))
    }

    if (path === '/v1/algorithms/profiles') {
      const type = query.get('type')
      const purpose = query.get('purpose')
      const profiles = synthetic.profiles.filter(profile =>
        (!type || profile.algorithmType === type) && (!purpose || profile.purpose === purpose))
      return sendSynthetic(syntheticBase, pageOf(profiles, query))
    }

    const profileBindings = /^\/v1\/algorithms\/profiles\/([^/]+)\/bindings$/.exec(path)
    if (profileBindings) {
      const algorithmId = decodeURIComponent(profileBindings[1])
      const bindings = synthetic.bindings.filter(binding => binding.algorithmId === algorithmId)
      return sendSynthetic(syntheticBase, pageOf(bindings, query))
    }

    if (path === '/v1/algorithms/bindings') {
      const algorithmName = query.get('algorithmName')
      const userId = query.get('userId')
      const algorithmIds = new Set(
        synthetic.profiles
          .filter(profile => !algorithmName || profile.algorithmName === algorithmName)
          .map(profile => profile.algorithmId),
      )
      const bindings = synthetic.bindings.filter(binding =>
        algorithmIds.has(binding.algorithmId) && (!userId || binding.userId === userId))
      return sendSynthetic(syntheticBase, pageOf(bindings, query))
    }

    if (path === '/v1/audit-tables') {
      const status = query.get('status')
      const tableName = query.get('tableName')?.trim().toLowerCase()
      const tables = synthetic.auditTables.filter(table =>
        (!status || table.status === status)
        && (!tableName || table.tableName.toLowerCase().includes(tableName)))
      return sendSynthetic(syntheticBase, pageOf(tables, query))
    }

    const auditTable = /^\/v1\/audit-tables\/([^/]+)$/.exec(path)
    if (auditTable) {
      const tableId = decodeURIComponent(auditTable[1])
      const table = synthetic.auditTables.find(candidate => candidate.tableId === tableId)
      if (!table) {
        return sendError({ ...syntheticBase, source: 'synthetic' }, 404, 'audit_table_not_found',
          `Audit table ${tableId} is not part of the synthetic QA table set.`,
          `Known tables: ${synthetic.auditTables.map(candidate => candidate.tableId).join(', ')}`)
      }
      return sendSynthetic(syntheticBase, table)
    }
    const taggedRangesMatch = /^\/v1\/audit-data\/([^/]+)\/tagged-ranges$/.exec(path)
    if (taggedRangesMatch) {
      const ownerId = decodeURIComponent(taggedRangesMatch[1])
      const owner = synthetic.taggedRanges?.[ownerId]
      if (!owner) {
        return sendError({ ...syntheticBase, source: 'synthetic' }, 404,
          'qa_owner_not_in_fixture',
          `Owner ${ownerId} has no synthetic tagged-range visual fixture.`,
          `Fixture owners: ${Object.keys(synthetic.taggedRanges ?? {}).join(', ')}`)
      }

      const algorithmId = query.get('algorithmId')?.trim() || owner.defaultAlgorithmId
      const ranges = owner.rangesByAlgorithmId?.[algorithmId]
      if (!Array.isArray(ranges)) {
        return sendError({ ...syntheticBase, source: 'synthetic' }, 404,
          'qa_algorithm_not_in_fixture',
          `Algorithm ${algorithmId} has no synthetic tagged-range visual fixture for owner ${ownerId}.`,
          `Fixture algorithms: ${Object.keys(owner.rangesByAlgorithmId ?? {}).join(', ')}`)
      }

      return sendSynthetic(syntheticBase, { algorithmId, ranges }, {
        [QA_PROJECTION_HEADER]: 'synthetic-visual',
      })
    }


    return sendError({ ...syntheticBase, source: 'synthetic' }, 501, 'qa_route_not_implemented',
      'The QA fixture server does not implement this route.',
      `${base.method} ${path} is outside the fixture surface; see tests/qa/README.md.`)
  }

  function sendIndex(res, method, url) {
    const appBase = resolveAppOrigin().replace(/\/+$/, '')
    const scenarioRows = [...registry.jobs.values()].flatMap(entry =>
      [...entry.views.values()].map(view => {
        const resources = availableResources(view).join(', ')
        const href = `${appBase}${view.landing ?? `/executions/${entry.jobId}`}`
        return `<tr>
          <td><code>${escapeHtml(view.id)}</code><br><span>${escapeHtml(view.label ?? '')}</span></td>
          <td><code>${escapeHtml(entry.jobId)}</code></td>
          <td>${escapeHtml(resources)}</td>
          <td><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></td>
        </tr>`
      }),
    ).join('\n')

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ChordPanel QA fixtures</title>
<style>
  body { font: 14px/1.6 -apple-system, system-ui, sans-serif; margin: 32px; color: #1d1d1f; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .warn { border: 1px solid #c99700; background: #fff8e1; padding: 10px 12px; border-radius: 8px; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e5ea; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6e6e73; }
  code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  p { max-width: 78ch; }
</style>
</head>
<body>
<h1>ChordPanel QA fixture API</h1>
<p>Loopback-only fixture server · <code>${escapeHtml(url.origin)}</code></p>
<div class="warn">
  <strong>LOCAL FIXTURES · NOT A LIVE BACKEND</strong><br>
  Captured Trace exchanges replay from <code>tests/fixtures/observability/</code>. Synthetic Summary and
  Part views are labeled per row; the TagGeneration 4/3/1 Part states are static UI fixtures, not live
  concurrency or backend facts. The challenge animation view reuses its exact recorded Observations,
  Links and Protocol packets; only Summary UI context and the Job detail status are synthetic.
  Non-telemetry routes answer synthetic visual data. Write endpoints answer <code>501 qa_read_only</code>;
  nothing here touches ChordAuditMatrix.
</div>
<table>
  <thead><tr><th>Scenario</th><th>Job</th><th>Available Trace resources</th><th>Execution page</th></tr></thead>
  <tbody>${scenarioRows}</tbody>
</table>
<p>Machine readable inventory: <a href="/qa/health"><code>/qa/health</code></a>.
Trace responses carry <code>X-ChordPanel-QA-Scenario</code>; alternate views are selected by the app page's
<code>qaView</code> referrer. Every response carries <code>X-ChordPanel-QA</code> and
<code>X-ChordPanel-QA-Source</code>.</p>
</body>
</html>`

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(html)),
      'Cache-Control': 'no-store',
      [QA_HEADER]: 'fixtures',
      [QA_SOURCE_HEADER]: 'meta',
    })
    if (method === 'HEAD') {
      res.end()
      return
    }
    res.end(html)
  }

  return server
}

// ── Synthetic helpers ────────────────────────────────────────────────────────

function pageOf(items, query, pageSizeDefault = DEFAULT_PAGE_SIZE) {
  const page = toInt(query.get('page'), 1, 1, 1e6)
  const pageSize = toInt(query.get('pageSize'), pageSizeDefault, 1, MAX_PAGE_SIZE)
  const total = items.length
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  }
}

/** The list route returns `JobSummary`; history/task ids stay on the detail route. */
function jobSummaryOf(job) {
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    status: job.status,
    errorCode: job.errorCode,
    statusMessage: job.statusMessage,
    dataOwner: job.dataOwner,
    initiator: job.initiator,
    createdAtMs: job.createdAtMs,
    startedAtMs: job.startedAtMs,
    endedAtMs: job.endedAtMs,
    totalDurationMs: job.totalDurationMs,
  }
}

function filterJobs(jobs, query) {
  const status = query.get('status')
  const jobType = query.get('jobType')
  const owner = query.get('dataOwnerUserId')
  const metadataFilters = []
  for (const [key, value] of query) {
    if (key.startsWith('metadata.')) metadataFilters.push([key.slice('metadata.'.length), value])
  }
  return jobs.filter(job => {
    if (status && String(job.status).toLowerCase() !== status.toLowerCase()) return false
    if (jobType && job.jobType !== jobType) return false
    if (owner && job.dataOwner?.userId !== owner) return false
    for (const [key, value] of metadataFilters) {
      if (String(job.metadata?.[key] ?? '') !== value) return false
    }
    return true
  })
}

function sortJobs(jobs, query) {
  const ascending = query.get('ascending') !== 'false'
  const sorted = [...jobs].sort((left, right) => (left.createdAtMs ?? 0) - (right.createdAtMs ?? 0))
  return ascending ? sorted : sorted.reverse()
}

function sortUsers(users, query) {
  const sortBy = query.get('sortBy') === 'updatedAtMs' ? 'updatedAtMs' : 'createdAtMs'
  const ascending = query.get('ascending') === 'true'
  const sorted = [...users].sort((left, right) => (left[sortBy] ?? 0) - (right[sortBy] ?? 0))
  return ascending ? sorted : sorted.reverse()
}

