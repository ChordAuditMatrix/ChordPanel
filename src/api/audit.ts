import api from './request'

export interface AuditTagRequest {
  /** Omitted/blank -> the backend selects the data owner's audit algorithm. */
  algorithmId?: string
  dataOwnerId: string
  blockStart: number
  blockCount: number
  blockSize?: number
}

export interface AuditChallengeRequest {
  initiatorId: string
  dataOwnerId: string
  /** Omitted/blank -> backend picks the algorithm automatically. */
  algorithmId?: string
  params?: Record<string, unknown>
}

export interface BlockLayout {
  totalBlocks: number
  totalUnits: number
  blockSize: number
}

export interface TaggedRange {
  blockStart: number
  blockCount: number
  algorithmId: string
  tagCount: number
}

// Generate tags; blank algorithmId -> backend automatic selection (/v1/audit/tags)
export function generateTags(data: AuditTagRequest, initiatorId?: string) {
  const algorithmId = data.algorithmId?.trim() ?? ''
  const url = algorithmId ? `/v1/audit/algorithms/${algorithmId}/tags` : '/v1/audit/tags'
  return api.post(url, {
    request: { initiatorId: initiatorId || '1', dataOwnerId: data.dataOwnerId },
    params: { blockStart: data.blockStart, blockCount: data.blockCount, blockSize: data.blockSize ?? 1024 },
  })
}

// Initiate a challenge-proof audit.
// The dedicated algorithmId is authoritative: it is stripped from opaque params,
// then re-injected only when explicitly selected. Otherwise the field stays
// truly absent so the backend selects the algorithm automatically.
export function challengeProof(data: AuditChallengeRequest) {
  const params: Record<string, unknown> = { ...(data.params ?? {}) }
  delete params.algorithmId
  const algorithmId = data.algorithmId?.trim() ?? ''
  if (algorithmId) params.algorithmId = algorithmId
  return api.post('/v1/audit/challenge-proof', {
    request: { initiatorId: data.initiatorId, dataOwnerId: data.dataOwnerId },
    params,
  })
}

// Get block layout overview
export function getBlockLayout(ownerId: string, blockSize?: number) {
  return api.get(`/v1/audit-data/${ownerId}/blocks`, { params: { blockSize } })
}

// Get tagged ranges
export function getTaggedRanges(ownerId: string, algorithmId: string, initiatorId = '1') {
  return api.get(`/v1/audit-data/${ownerId}/tagged-ranges`, { params: { algorithmId, initiatorId } })
}
