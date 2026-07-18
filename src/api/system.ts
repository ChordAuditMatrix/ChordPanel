import api from './request'

// GET /api/v1/system/status (silent: no error modal, used for health check only)
export function getSystemStatus() {
  return api.get('/v1/system/status', { _silent: true } as any)
}

// GET /api/v1/nodes
export function getNodes(params?: { page?: number; pageSize?: number }) {
  return api.get('/v1/nodes', { params })
}

// GET /api/v1/nodes/{nodeId}
export function getNodeDetail(nodeId: string) {
  return api.get(`/v1/nodes/${nodeId}`)
}

// POST /api/v1/nodes/{nodeId}/drain
export function drainNode(nodeId: string, params?: { reason?: string; allowPeerRequests?: boolean }) {
  return api.post(`/v1/nodes/${nodeId}/drain`, {
    request: { initiatorId: '1' },
    params: params || {},
  })
}

// POST /api/v1/nodes/{nodeId}/resume
export function resumeNode(nodeId: string, params?: { reason?: string }) {
  return api.post(`/v1/nodes/${nodeId}/resume`, {
    request: { initiatorId: '1' },
    params: params || {},
  })
}
