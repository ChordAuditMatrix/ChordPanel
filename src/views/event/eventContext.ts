import type { ProtocolEvent } from '@/api/protocolEvent'

/**
 * Pure projection helpers for the protocol event workbench.
 *
 * The node-scoped `/v1/nodes/{nodeId}/protocol-events` route returns a narrow
 * envelope without a transport `direction` or `authenticatedNodeId`, so this
 * module never derives a direction from `fromNodeId`/`toNodeId`. Job/Task
 * references are read only from explicit top-level payload fields; nothing is
 * inferred from similar-looking strings or timestamps.
 */

export interface EventPage {
  items: ProtocolEvent[]
  total: number
}

export function isProtocolEvent(value: unknown): value is ProtocolEvent {
  if (value === null || typeof value !== 'object') return false
  return 'packetId' in value && typeof value.packetId === 'string'
    && 'fromNodeId' in value && typeof value.fromNodeId === 'string'
    && 'toNodeId' in value && typeof value.toNodeId === 'string'
    && 'messageType' in value && typeof value.messageType === 'string'
    && 'timestampMs' in value && typeof value.timestampMs === 'number'
}

export function readEventPage(value: unknown): EventPage {
  if (value === null || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) {
    throw new TypeError('Invalid protocol event page response')
  }
  const items = value.items.filter((item): item is ProtocolEvent => isProtocolEvent(item))
  const total = 'total' in value && typeof value.total === 'number' && Number.isFinite(value.total)
    ? value.total
    : items.length
  return { items, total }
}

export interface EventFilterDraft {
  nodeId: string
  fromNodeId: string
  toNodeId: string
  messageTypes: string
  correlationId: string
  requestId: string
  traceId: string
}

export interface EventFilters {
  nodeId: string
  fromNodeId?: string
  toNodeId?: string
  messageTypes?: string
  correlationId?: string
  requestId?: string
  traceId?: string
}

/** Comma separated message types are normalized so `A, B ,` and `A,B` query the same set. */
export function normalizeMessageTypes(value: string): string | undefined {
  const types = value.split(',').map(type => type.trim()).filter(type => type.length > 0)
  return types.length > 0 ? types.join(',') : undefined
}

/** Empty draft fields are omitted so the request only carries applied constraints. */
export function normalizeEventFilters(draft: EventFilterDraft): EventFilters | null {
  const nodeId = draft.nodeId.trim()
  if (!nodeId) return null
  const optional = (value: string): string | undefined => value.trim() || undefined
  return {
    nodeId,
    fromNodeId: optional(draft.fromNodeId),
    toNodeId: optional(draft.toNodeId),
    messageTypes: normalizeMessageTypes(draft.messageTypes),
    correlationId: optional(draft.correlationId),
    requestId: optional(draft.requestId),
    traceId: optional(draft.traceId),
  }
}

const FILTER_KEYS: readonly (keyof EventFilters)[] = [
  'nodeId', 'fromNodeId', 'toNodeId', 'messageTypes', 'correlationId', 'requestId', 'traceId',
]

export function sameEventFilters(a: EventFilters | null, b: EventFilters | null): boolean {
  if (!a || !b) return a === b
  return FILTER_KEYS.every(key => (a[key] ?? '') === (b[key] ?? ''))
}

export type EventDirection = 'inbound' | 'outbound' | 'unknown'

/**
 * Direction is displayed only when the payload carries a transport-level
 * `direction`. The legacy node-scoped route does not expose it, so every event
 * from that route stays `unknown` instead of being inferred from endpoints.
 */
export function eventDirection(value: unknown): EventDirection {
  if (value === null || typeof value !== 'object' || !('direction' in value)) return 'unknown'
  const direction = value.direction
  return direction === 'inbound' || direction === 'outbound' ? direction : 'unknown'
}

export interface ExactEventReferences {
  jobId: string
  taskId: string
}

/** Reads only explicit top-level `jobId`/`taskId` fields from payload/authExt. */
export function extractExactReferences(event: ProtocolEvent): ExactEventReferences {
  const references: ExactEventReferences = { jobId: '', taskId: '' }
  for (const container of [event.payload, event.authExt]) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue
    for (const key of ['jobId', 'taskId'] as const) {
      if (references[key]) continue
      const value: unknown = container[key]
      if (typeof value === 'string' && value.trim().length > 0) references[key] = value.trim()
    }
  }
  return references
}

/** Builds a correlation mini-sequence only from rows already loaded for the table page. */
export function eventsForCorrelationOnPage(
  events: readonly ProtocolEvent[],
  correlationId: string | undefined,
): ProtocolEvent[] {
  if (!correlationId) return []
  return events
    .filter(event => event.correlationId === correlationId)
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs)
}

