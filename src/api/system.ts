import type { AxiosRequestConfig } from 'axios'
import type { PageRequest, PageResponse } from './pagination'
import api from './request'

/** Wire contract for GET /api/v1/system/status. Older servers may omit adminId. */
export interface SystemStatusResponse {
  admin: {
    adminId?: string | null
    cpuUsage?: number
    memoryUsage?: number
    totalMemoryKb?: number
    freeMemoryKb?: number
    load?: number
  }
  cluster: {
    totalNodes?: number
    availableNodes?: number
    unavailableNodes?: number
    drainingNodes?: number
    nodesByRole?: Record<string, number>
  }
  tasks: {
    activeTaskCount?: number
    maxConcurrentTasks?: number
    queueDepth?: number
    totalSubmitted?: number
    totalCompleted?: number
    totalRejected?: number
  }
  uptime?: string
  timestampMs?: number
}


function systemRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
}

function finiteSystemNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Parse the status snapshot without inventing missing counters or an Admin ID. */
export function parseSystemStatusResponse(value: unknown): SystemStatusResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid system status response')
  }
  const root = systemRecord(value)
  const admin = systemRecord(root.admin)
  const cluster = systemRecord(root.cluster)
  const tasks = systemRecord(root.tasks)
  const roles = systemRecord(cluster.nodesByRole)
  const adminId = typeof admin.adminId === 'string' && admin.adminId.trim().length > 0
    ? admin.adminId
    : undefined
  const timestampMs = finiteSystemNumber(root.timestampMs)
  const nodesByRole: Record<string, number> = {}
  for (const [role, count] of Object.entries(roles)) {
    const value = finiteSystemNumber(count)
    if (value !== undefined) nodesByRole[role] = value
  }

  return {
    admin: {
      adminId,
      cpuUsage: finiteSystemNumber(admin.cpuUsage),
      memoryUsage: finiteSystemNumber(admin.memoryUsage),
      totalMemoryKb: finiteSystemNumber(admin.totalMemoryKb),
      freeMemoryKb: finiteSystemNumber(admin.freeMemoryKb),
      load: finiteSystemNumber(admin.load),
    },
    cluster: {
      totalNodes: finiteSystemNumber(cluster.totalNodes),
      availableNodes: finiteSystemNumber(cluster.availableNodes),
      unavailableNodes: finiteSystemNumber(cluster.unavailableNodes),
      drainingNodes: finiteSystemNumber(cluster.drainingNodes),
      nodesByRole,
    },
    tasks: {
      activeTaskCount: finiteSystemNumber(tasks.activeTaskCount),
      maxConcurrentTasks: finiteSystemNumber(tasks.maxConcurrentTasks),
      queueDepth: finiteSystemNumber(tasks.queueDepth),
      totalSubmitted: finiteSystemNumber(tasks.totalSubmitted),
      totalCompleted: finiteSystemNumber(tasks.totalCompleted),
      totalRejected: finiteSystemNumber(tasks.totalRejected),
    },
    uptime: typeof root.uptime === 'string' && root.uptime.length > 0 ? root.uptime : undefined,
    timestampMs: timestampMs !== undefined && Number.isSafeInteger(timestampMs) && timestampMs > 0
      ? timestampMs
      : undefined,
  }
}

// GET /api/v1/system/status (silent: no error modal, used for health check and dashboard)
export function getSystemStatus(): Promise<SystemStatusResponse> {
  const config: AxiosRequestConfig & { _silent: true } = { _silent: true }
  return api.get('/v1/system/status', config)
}

export interface NodeSummary {
  nodeId: string
  nodeInstanceId?: string
  role?: string
  state?: string
  isAvailable?: boolean
  lastSeenAt?: number
}

// GET /api/v1/nodes
export function getNodes(params?: PageRequest): Promise<PageResponse<NodeSummary>> {
  return api.get('/v1/nodes', { params })
}

// GET /api/v1/nodes/{nodeId}
export function getNodeDetail(nodeId: string) {
  return api.get(`/v1/nodes/${encodeURIComponent(nodeId)}`)
}

// POST /api/v1/nodes/{nodeId}/drain
export function drainNode(nodeId: string, params?: { reason?: string; allowPeerRequests?: boolean }) {
  return api.post(`/v1/nodes/${encodeURIComponent(nodeId)}/drain`, {
    request: { initiatorId: '1' },
    params: params || {},
  })
}

// POST /api/v1/nodes/{nodeId}/resume
export function resumeNode(nodeId: string, params?: { reason?: string }) {
  return api.post(`/v1/nodes/${encodeURIComponent(nodeId)}/resume`, {
    request: { initiatorId: '1' },
    params: params || {},
  })
}
