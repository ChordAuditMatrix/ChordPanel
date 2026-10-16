import type { PageRequest, PageResponse } from './pagination'
import { fetchAllPages } from './pagination'
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

export function getStrategies(params?: PageRequest): Promise<PageResponse<AlgorithmStrategy>> {
  return api.get('/v1/algorithms/strategies', { params })
}

/**
 * Get the list of algorithm type options (filtered by purpose).
 * Returns a deduplicated array of algorithmType values for use in dropdown selectors.
 */
export async function listAlgorithmTypes(purpose?: string): Promise<string[]> {
  const items = await fetchAllPages(getStrategies)
  const filtered = purpose ? items.filter(s => s.purpose === purpose) : items
  return Array.from(new Set(filtered.map(s => s.algorithmType)))
}

export function getProfiles(params?: PageRequest & { type?: string; purpose?: string }): Promise<PageResponse<AlgorithmProfile>> {
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

export interface ProfileBinding {
  userId: string
  userName?: string
  algorithmId?: string
  algorithmName?: string
}

export function listProfileBindings(algorithmId: string, params?: PageRequest): Promise<PageResponse<ProfileBinding>> {
  return api.get(`/v1/algorithms/profiles/${algorithmId}/bindings`, { params })
}

export interface AlgorithmBindingSummary {
  algorithmId: string
  algorithmVersion: number
  purpose: string
  userId: string
}

export function getBindings(
  algorithmName: string,
  userId: string,
  params?: PageRequest,
): Promise<PageResponse<AlgorithmBindingSummary>> {
  return api.get('/v1/algorithms/bindings', { params: { ...params, algorithmName, userId } })
}
