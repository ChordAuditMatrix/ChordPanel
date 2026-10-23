import { reactive } from 'vue'
import { parseNodeDetail, type NodeDetail } from './types'

/**
 * On-demand node detail loader.
 *
 * The list route is the only polled source; a detail request is issued only
 * when a row is opened, deduplicated while in flight, reused for a short TTL
 * and cancelled logically when the caller switches nodes. The REST client does
 * not expose an AbortSignal here, so cancellation discards a late response
 * instead of aborting the socket.
 */

export const NODE_DETAIL_TTL_MS = 30_000
export const NODE_DETAIL_MAX_AGE_MS = 10 * 60_000

export type NodeDetailStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface NodeDetailEntry {
  status: NodeDetailStatus
  /** Last successfully parsed detail; kept while a refresh is running or fails. */
  detail: NodeDetail | null
  /** Epoch milliseconds of the last successful load; 0 when never loaded. */
  loadedAt: number
  error: unknown
}

export type NodeDetailFetcher = (nodeId: string) => Promise<unknown>

export interface NodeDetailLoader {
  entries: Record<string, NodeDetailEntry>
  load: (nodeId: string, options?: { force?: boolean; now?: number }) => Promise<NodeDetailEntry | undefined>
  cancel: (nodeId: string) => void
  invalidate: (nodeId: string) => void
  prune: (now?: number, maxAgeMs?: number) => void
}

export function isNodeDetailFresh(loadedAt: number, now: number, ttlMs = NODE_DETAIL_TTL_MS): boolean {
  return loadedAt > 0 && now >= loadedAt && now - loadedAt < ttlMs
}

export function createNodeDetailLoader(
  fetcher: NodeDetailFetcher,
  options: { ttlMs?: number; maxAgeMs?: number } = {},
): NodeDetailLoader {
  const ttlMs = options.ttlMs ?? NODE_DETAIL_TTL_MS
  const maxAgeMs = options.maxAgeMs ?? NODE_DETAIL_MAX_AGE_MS
  const entries = reactive<Record<string, NodeDetailEntry>>({})
  const epochs = new Map<string, number>()
  const inflight = new Map<string, Promise<NodeDetailEntry | undefined>>()

  function cancel(nodeId: string) {
    epochs.set(nodeId, (epochs.get(nodeId) ?? 0) + 1)
    inflight.delete(nodeId)
    const entry = entries[nodeId]
    if (entry?.status === 'loading') {
      entries[nodeId] = {
        status: entry.detail ? 'ready' : 'idle',
        detail: entry.detail,
        loadedAt: entry.loadedAt,
        error: null,
      }
    }
  }

  function load(nodeId: string, loadOptions: { force?: boolean; now?: number } = {}): Promise<NodeDetailEntry | undefined> {
    const now = loadOptions.now ?? Date.now()
    const existing = entries[nodeId]
    if (!loadOptions.force && existing?.detail && isNodeDetailFresh(existing.loadedAt, now, ttlMs)) {
      return Promise.resolve(existing)
    }
    const pending = inflight.get(nodeId)
    if (pending) return pending

    const epoch = (epochs.get(nodeId) ?? 0) + 1
    epochs.set(nodeId, epoch)
    const previous = existing?.detail ?? null
    entries[nodeId] = { status: 'loading', detail: previous, loadedAt: existing?.loadedAt ?? 0, error: null }

    const request: Promise<NodeDetailEntry | undefined> = Promise.resolve()
      .then(() => fetcher(nodeId))
      .then(value => {
        if (epochs.get(nodeId) !== epoch) return entries[nodeId]
        const detail = parseNodeDetail(value)
        if (!detail) throw new TypeError('Invalid node detail response')
        entries[nodeId] = { status: 'ready', detail, loadedAt: Date.now(), error: null }
        return entries[nodeId]
      })
      .catch(error => {
        if (epochs.get(nodeId) !== epoch) return entries[nodeId]
        entries[nodeId] = { status: 'error', detail: previous, loadedAt: existing?.loadedAt ?? 0, error }
        return entries[nodeId]
      })
      .finally(() => {
        if (inflight.get(nodeId) === request) inflight.delete(nodeId)
      })

    inflight.set(nodeId, request)
    return request
  }

  function invalidate(nodeId: string) {
    cancel(nodeId)
    delete entries[nodeId]
  }

  function prune(now = Date.now(), maxAge = maxAgeMs) {
    for (const [nodeId, entry] of Object.entries(entries)) {
      if (entry.status === 'loading') continue
      if (entry.detail === null || entry.loadedAt === 0 || now - entry.loadedAt > maxAge) delete entries[nodeId]
    }
  }

  return { entries, load, cancel, invalidate, prune }
}
