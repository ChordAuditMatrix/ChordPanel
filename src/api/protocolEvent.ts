import type { PageRequest, PageResponse } from './pagination'
import api from './request'

export interface ProtocolEvent {
  packetId: string
  correlationId?: string
  fromNodeId: string
  toNodeId: string
  messageType: string
  statusCode?: number
  statusMessage?: string
  traceId?: string
  tenantId?: string
  timestampMs: number
  version?: number
  payload?: Record<string, unknown>
  authExt?: Record<string, unknown>
}
export type ProtocolEventPage = PageResponse<ProtocolEvent>

export function getProtocolEvents(nodeId: string, params?: PageRequest & {
  requestId?: string
  correlationId?: string
  fromNodeId?: string
  toNodeId?: string
  traceId?: string
  tenantId?: string
  fromTimeMs?: number
  toTimeMs?: number
  messageTypes?: string
  ascending?: boolean
}): Promise<ProtocolEventPage> {
  return api.get(`/v1/nodes/${encodeURIComponent(nodeId)}/protocol-events`, { params })
}
