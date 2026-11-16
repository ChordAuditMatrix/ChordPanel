/**
 * True for the cancellation-shaped errors an aborted read rejects with: a
 * `DOMException` named `AbortError`, the Axios `CanceledError`, or a raw
 * `ERR_CANCELED` code. A replaced or disposed session never shows these as
 * resource failures, so every Trace reader shares this one check.
 */
export function isTraceCancellation(error: unknown): boolean {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError')) return true
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ERR_CANCELED'
}
