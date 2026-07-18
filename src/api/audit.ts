import api from './request'

export interface AuditTagRequest {
  algorithmId: string
  dataOwnerId: string
  blockStart: number
  blockCount: number
  blockSize?: number
}

export interface AuditChallengeRequest {
  initiatorId: string
  dataOwnerId: string
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

// Generate tags
export function generateTags(algorithmId: string, data: AuditTagRequest, initiatorId?: string) {
  return api.post(`/v1/audit/algorithms/${algorithmId}/tags`, {
    request: { initiatorId: initiatorId || '1', dataOwnerId: data.dataOwnerId },
    params: { blockStart: data.blockStart, blockCount: data.blockCount, blockSize: data.blockSize ?? 1024 },
  })
}

// Initiate a challenge-proof audit
export function challengeProof(data: AuditChallengeRequest) {
  return api.post('/v1/audit/challenge-proof', {
    request: { initiatorId: data.initiatorId, dataOwnerId: data.dataOwnerId },
    params: data.params || {},
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
