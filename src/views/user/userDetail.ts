import type { User } from '@/api/user'
import type { AlgorithmBindingSummary } from '@/api/algorithm'
import type { JobSummary } from '@/api/job'

/**
 * Boundary helpers for the user workbench. Each relation uses its owning API,
 * and userId is matched only where the API explicitly exposes that field.
 */


export interface UserBindingPage {
  items: AlgorithmBindingSummary[]
  total: number
  totalPages: number
}

/** Parse only bindings whose userId exactly matches the selected identity. */
export function readUserBindingPage(value: unknown, userId: string): UserBindingPage | null {
  if (value === null || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return null

  const items: AlgorithmBindingSummary[] = []
  const seen = new Set<string>()
  for (const item of value.items) {
    if (item === null || typeof item !== 'object' || !('userId' in item) || item.userId !== userId) continue
    if (!('algorithmId' in item) || typeof item.algorithmId !== 'string' || seen.has(item.algorithmId)) continue
    if (!('algorithmVersion' in item) || typeof item.algorithmVersion !== 'number') continue
    if (!('purpose' in item) || typeof item.purpose !== 'string') continue
    seen.add(item.algorithmId)
    items.push({
      userId,
      algorithmId: item.algorithmId,
      algorithmVersion: item.algorithmVersion,
      purpose: item.purpose,
    })
  }

  const total = 'total' in value && typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total >= 0
    ? value.total
    : null
  if (total === null) return null
  const totalPages = 'totalPages' in value && typeof value.totalPages === 'number'
    && Number.isSafeInteger(value.totalPages) && value.totalPages > 0
    ? value.totalPages
    : (total === 0 ? 0 : Math.ceil(total / USER_BINDING_PAGE_SIZE))
  return { items, total, totalPages }
}

export const USER_BINDING_PAGE_SIZE = 100

export function readUserDetail(value: unknown): User | null {
  if (value === null || typeof value !== 'object') return null
  if (!('userId' in value) || typeof value.userId !== 'string' || value.userId.length === 0) return null
  if (!('userName' in value) || typeof value.userName !== 'string') return null
  if (!('createdAtMs' in value) || typeof value.createdAtMs !== 'number') return null
  if (!('updatedAtMs' in value) || typeof value.updatedAtMs !== 'number') return null
  return {
    userId: value.userId,
    userName: value.userName,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
  }
}



export interface UserJobPage {
  items: JobSummary[]
  total: number
}

function isJobSummary(value: unknown): value is JobSummary {
  if (value === null || typeof value !== 'object') return false
  return 'jobId' in value && typeof value.jobId === 'string'
    && 'jobType' in value && typeof value.jobType === 'string'
    && 'status' in value && typeof value.status === 'string'
    && 'createdAtMs' in value && typeof value.createdAtMs === 'number'
}

export function readUserJobPage(value: unknown): UserJobPage | null {
  if (value === null || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return null
  const items = value.items.filter((item): item is JobSummary => isJobSummary(item))
  const total = 'total' in value && typeof value.total === 'number' && Number.isFinite(value.total)
    ? value.total
    : items.length
  return { items, total }
}

export type SearchCoverage = 'complete' | 'partial' | 'unknown'

/**
 * Local catalog search is only trustworthy when the loaded reference directory
 * covers the server total. Anything else must be labelled as partial.
 */
export function compareSearchCoverage(loaded: number, serverTotal: number | null): SearchCoverage {
  if (serverTotal === null || !Number.isFinite(serverTotal) || serverTotal < 0) return 'unknown'
  return loaded >= serverTotal ? 'complete' : 'partial'
}
