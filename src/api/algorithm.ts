import api from './request'

export interface AlgorithmStrategy {
  algorithmType: string
  purpose: string
  version: number
}

export interface AlgorithmProfile {
  algorithmId: string
  algorithmType: string
  algorithmName: string
  version: number
  purpose: string
  jobId?: string
}

export function getStrategies(params?: { page?: number; pageSize?: number }) {
  return api.get('/v1/algorithms/strategies', { params })
}

/**
 * Get the list of algorithm type options (filtered by purpose).
 * Returns a deduplicated array of algorithmType values for use in dropdown selectors.
 */
export async function listAlgorithmTypes(purpose?: string): Promise<string[]> {
  const res: any = await getStrategies({ pageSize: 1000 })
  const items: AlgorithmStrategy[] = (res?.items ?? []) as AlgorithmStrategy[]
  const filtered = purpose ? items.filter(s => s.purpose === purpose) : items
  // deduplicate
  return Array.from(new Set(filtered.map(s => s.algorithmType)))
}

export function getProfiles(params?: { page?: number; pageSize?: number; type?: string; purpose?: string }) {
  return api.get('/v1/algorithms/profiles', { params })
}

export function initProfile(algorithmType: string, algorithmName: string, params?: Record<string, unknown>, initiatorId?: string) {
  return api.post('/v1/algorithms/profiles', {
    request: { initiatorId: initiatorId || '1', algorithmType, algorithmName },
    params: params || {},
  })
}

export function deinitProfile(algorithmId: string, initiatorId?: string) {
  return api.post(`/v1/algorithms/profiles/${algorithmId}/deinitialize`, {
    request: { initiatorId: initiatorId || '1' },
  })
}

export function bindUser(algorithmId: string, userId: string, initiatorId?: string) {
  return api.post(`/v1/algorithms/profiles/${algorithmId}/bindings`, {
    request: { initiatorId: initiatorId || '1' },
    params: { userId },
  })
}

export function unbindUser(algorithmId: string, userId: string) {
  return api.delete(`/v1/algorithms/profiles/${algorithmId}/bindings/${userId}`)
}

/**
 * List all user bindings of an algorithm profile.
 * Returns { items: [{ userId, userName?, algorithmId, algorithmName }] }.
 */
export function listProfileBindings(algorithmId: string) {
  return api.get(`/v1/algorithms/profiles/${algorithmId}/bindings`)
}

export function getBindings(algorithmName: string, userId: string) {
  return api.get('/v1/algorithms/bindings', { params: { algorithmName, userId } })
}
