/**
 * Transport-level helpers shared by the QA fixture server and its route modules.
 *
 * Route modules never touch `res`; they return response descriptors (see
 * `response.mjs`). Everything that formats a query string, clamps a bound or
 * writes a body lives here so the provenance headers stay identical on every
 * route.
 */

export const QA_HEADER = 'X-ChordPanel-QA'
export const QA_SOURCE_HEADER = 'X-ChordPanel-QA-Source'
export const QA_SCENARIO_HEADER = 'X-ChordPanel-QA-Scenario'
export const QA_FIXTURE_HEADER = 'X-ChordPanel-QA-Fixture'
export const QA_CAPTURED_QUERY_HEADER = 'X-ChordPanel-QA-Captured-Query'
export const QA_PROJECTION_HEADER = 'X-ChordPanel-QA-Projection'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 1000
/** Largest bound the trace and graph routes accept (`[1, 200]`). */
export const MAX_TRACE_PAGE_SIZE = 200

export function formatQuery(query) {
  const entries = Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== null)
  if (entries.length === 0) return '-'
  return entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join('&')
}

export function toInt(raw, fallback, min, max) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/** `'/api/v1/nodes'` and `'/v1/nodes'` both resolve to `'/v1/nodes'`. */
export function normalizePath(pathname) {
  if (pathname === '/api') return '/'
  if (pathname.startsWith('/api/')) return pathname.slice(4)
  return pathname
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Write one JSON body with the headers every QA response must carry. */
export function writeBody(res, method, status, body, headers) {
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
