/**
 * Response descriptors returned by the route modules.
 *
 * A route module decides *what* a request answers and which provenance it
 * carries; `server.mjs` decides how that becomes an HTTP response. Keeping the
 * two apart makes cursor, coverage and 404/501 behavior testable without
 * opening a socket.
 */

/**
 * @typedef {object} JsonResponse
 * @property {'json'} kind
 * @property {number} status
 * @property {any} body
 * @property {string} source `X-ChordPanel-QA-Source` value.
 * @property {string | null} [scenario] `X-ChordPanel-QA-Scenario` value.
 * @property {string | null} [fixture] `X-ChordPanel-QA-Fixture` value.
 * @property {string | null} [capturedQuery] `X-ChordPanel-QA-Captured-Query` value.
 * @property {string | null} [projection] `X-ChordPanel-QA-Projection` value.
 */

/** @returns {JsonResponse} */
export function jsonResponse({
  status = 200,
  body,
  source,
  scenario = null,
  fixture = null,
  capturedQuery = null,
  projection = null,
}) {
  return { kind: 'json', status, body, source, scenario, fixture, capturedQuery, projection }
}

/** @returns {JsonResponse} */
export function errorResponse({
  status,
  source,
  code,
  message,
  detail = '',
  scenario = null,
  fixture = null,
  projection = null,
}) {
  return jsonResponse({
    status,
    body: { error: code, message, detail },
    source,
    scenario,
    fixture,
    projection,
  })
}
