import type { TraceObservation, TracePart } from '@/api/trace'

/**
 * Merge rules of the sequential Trace resources.
 *
 * These are pure row rules: they never read the network, the clock or the
 * session's read progress, so a caller can merge a page twice without changing
 * the outcome. Read progress (`partsPaging`, coverage per page, cursors) stays
 * with the session model.
 */

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

/** Durable identity of one Part row: its ordinal plus the attempt that produced it. */
function partKey(part: TracePart): string {
  return `${part.partIndex}:${part.attempt ?? ''}`
}

/**
 * Keep already-read Windows when a refresh omits them. `windows` is the only
 * field the route withholds unless `includeWindows` was requested, so replacing
 * a row must not silently forget a window read the session already paid for.
 */
export function preserveLoadedWindows(next: readonly TracePart[], previous: readonly TracePart[]): TracePart[] {
  const oldParts = new Map(previous.map(part => [partKey(part), part]))
  return next.map(part => {
    const old = oldParts.get(partKey(part))
    return old?.windows !== undefined && part.windows === undefined
      ? { ...part, windows: old.windows }
      : part
  })
}

/**
 * Merge one Part page into the held rows by `(partIndex, attempt)`; the latest
 * stored projection wins and a row keeps the Windows it already loaded.
 */
export function mergePartPage(existing: readonly TracePart[], incoming: readonly TracePart[]): TracePart[] {
  const parts = new Map<string, TracePart>()
  for (const part of existing) parts.set(partKey(part), part)
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

/**
 * Keep the last row per identity in read order. Link and protocol ledgers are
 * replaced by a re-read page, so a row repeated across pages is one row, not two.
 */
export function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const unique = new Map<string, T>()
  for (const item of items) unique.set(keyOf(item), item)
  return [...unique.values()]
}
