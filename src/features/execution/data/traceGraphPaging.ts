/** Bound applied to every graph stream unless the caller names a smaller one. */
export const TRACE_GRAPH_PAGE_SIZE = 200

/**
 * Page bound of one graph stream. The route accepts `[1, 200]` and answers a
 * malformed bound with `400`, so the models refuse it before building a request.
 * This check is local on purpose: the readers stay independent of the HTTP layer.
 */
export function traceGraphPageSize(value: number | undefined): number {
  if (value === undefined) return TRACE_GRAPH_PAGE_SIZE
  if (!Number.isSafeInteger(value) || value < 1 || value > TRACE_GRAPH_PAGE_SIZE) {
    throw new RangeError(`pageSize must be an integer in [1, ${TRACE_GRAPH_PAGE_SIZE}]`)
  }
  return value
}
