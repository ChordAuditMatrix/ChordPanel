import api from './request'

export interface AuditTagRequest {
  /** Omitted/blank -> the backend selects the data owner's audit algorithm. */
  algorithmId?: string
  dataOwnerId: string
  blockStart: number
  blockCount: number
}

export interface AuditChallengeRequest {
  initiatorId: string
  dataOwnerId: string
  /** Omitted/blank -> backend picks the algorithm automatically. */
  algorithmId?: string
  params?: Record<string, unknown>
}

// 202 payload of the asynchronous layout route; poll statusUrl until the Job
// reaches a terminal state, then read the layout from the Job metadata.
export interface LayoutJobAccepted {
  jobId: string
  statusUrl: string
}

// One range exactly as the controller serializes it: only blockStart/blockCount.
// The resolved algorithmId is a single top-level response field, not per range.
export interface TaggedRange {
  blockStart: number
  blockCount: number
}

export interface TaggedRangesResponse {
  /** Algorithm actually used by the query (resolved by the backend in automatic mode). */
  algorithmId: string
  ranges: TaggedRange[]
}

// Generate tags; blank algorithmId -> backend automatic selection (/v1/audit/tags)
export function generateTags(data: AuditTagRequest, initiatorId?: string) {
  const algorithmId = data.algorithmId?.trim() ?? ''
  const url = algorithmId ? `/v1/audit/algorithms/${encodeURIComponent(algorithmId)}/tags` : '/v1/audit/tags'
  return api.post(url, {
    request: { initiatorId: initiatorId || '1', dataOwnerId: data.dataOwnerId },
    params: { blockStart: data.blockStart, blockCount: data.blockCount },
  })
}

// Initiate a challenge-proof audit.
// Algorithm ID is controlled by the dedicated selection field. blockCount is
// derived from the validated Storage range and overwritten by the backend.
export function challengeProof(data: AuditChallengeRequest) {
  const params: Record<string, unknown> = { ...(data.params ?? {}) }
  delete params.algorithmId
  delete params.blockCount
  const algorithmId = data.algorithmId?.trim() ?? ''
  if (algorithmId) params.algorithmId = algorithmId
  return api.post('/v1/audit/challenge-proof', {
    request: { initiatorId: data.initiatorId, dataOwnerId: data.dataOwnerId },
    params,
  })
}

// Enqueue block-layout planning as a background Job (no request body).
// The 202 answer only carries the Job to poll through GET /v1/jobs/{jobId};
// layout totals arrive in that Job's metadata once it succeeds.
export function createLayoutJob(ownerId: string): Promise<LayoutJobAccepted> {
  return api.post(`/v1/audit-data/${encodeURIComponent(ownerId)}/layout-jobs`)
}

// Get tagged ranges.
// algorithmId is optional: when omitted/blank the parameter is left out entirely
// so the backend automatically selects the data owner's audit algorithm and
// reports the id it actually used in the response.
export function getTaggedRanges(ownerId: string, algorithmId?: string, initiatorId = '1') {
  const params: Record<string, unknown> = { initiatorId }
  const id = algorithmId?.trim()
  if (id) params.algorithmId = id
  return api.get(`/v1/audit-data/${encodeURIComponent(ownerId)}/tagged-ranges`, { params })
}
