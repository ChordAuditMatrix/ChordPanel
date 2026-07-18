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

export function getProtocolEvents(nodeId: string, params?: {
  page?: number; pageSize?: number;
  requestId?: string; correlationId?: string;
  fromNodeId?: string; toNodeId?: string;
  traceId?: string; tenantId?: string;
  fromTimeMs?: number; toTimeMs?: number;
  messageTypes?: string; ascending?: boolean;
}) {
  return api.get(`/v1/nodes/${nodeId}/protocol-events`, { params })
}
