/**
 * Availability of the two bounded execution-graph routes.
 *
 * The graph is optional evidence, not a mandatory Trace resource. A server that
 * never captured a graph answers `501 trace_resource_not_captured`, and a flow
 * identity outside its graph scenario answers `404 flow_not_found`. Those are
 * "not provided" answers: rendering them as an empty graph would claim that no
 * execution happened, and inventing rows would claim evidence the server never
 * returned.
 */

export type GraphUnavailableCode =
  | 'trace_resource_not_captured'
  | 'flow_not_found'

export interface GraphUnavailable {
  readonly code: GraphUnavailableCode
  readonly message: string | null
  readonly detail: string | null
}


function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

function isGraphUnavailableCode(value: string | null): value is GraphUnavailableCode {
  return value === 'trace_resource_not_captured' || value === 'flow_not_found'
}

/**
 * Exact `?graph=1` display flag used by the QA demo deep link. It is not a
 * graph request parameter; any other value leaves the view on-demand.
 */
export function isGraphViewRequested(query: unknown): boolean {
  return asRecord(query)?.graph === '1'
}

/**
 * Reads the documented "this data was not provided" error shape:
 * `{ response: { data: { error, message, detail } } }`.
 *
 * Only the two named codes qualify. A transport failure, a `400` cursor error
 * or any other `501` stays a normal error and is rendered without the
 * not-provided explanation.
 */
export function readGraphUnavailable(error: unknown): GraphUnavailable | null {
  const response = asRecord(asRecord(error)?.response)
  const body = asRecord(response?.data)
  const code = asText(body?.error)
  if (!isGraphUnavailableCode(code)) return null
  return {
    code,
    message: asText(body?.message),
    detail: asText(body?.detail),
  }
}

