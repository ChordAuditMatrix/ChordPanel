import type { AxiosRequestConfig } from 'axios'
import api from './request'

/** Operator routes need the real status code: 202 means dispatched, not done. */
export interface AuditHttpResult<T> {
  httpStatus: number
  data: T
}

export interface AuditOperatorRequestOptions {
  /** Abort only the local wait; the server may already be executing the work. */
  signal?: AbortSignal
  /** `0` disables the client timeout. */
  timeoutMs?: number
}

/**
 * Operator maintenance/GC failures are rendered at the field that caused them,
 * with the real HTTP status and backend code, so they never open the blocking
 * global modal and never get collapsed into a generic timeout.
 */
function auditOperatorConfig(
  options: AuditOperatorRequestOptions | undefined,
  defaultTimeoutMs?: number,
): AxiosRequestConfig & { _silent: true; _includeStatus: true } {
  const config: AxiosRequestConfig & { _silent: true; _includeStatus: true } = {
    _silent: true,
    _includeStatus: true,
  }
  if (options?.signal) config.signal = options.signal
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs
  if (timeoutMs !== undefined) config.timeout = timeoutMs
  return config
}

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

export type AuditMaintenanceOp = 'Update' | 'Insert' | 'Delete'

export interface AuditMaintenanceRequest {
  /** Omitted/blank -> backend selects the owner's Audit algorithm automatically. */
  algorithmId?: string
  dataOwnerId: string
  maintenanceOp: AuditMaintenanceOp
  /** Legacy 1-based block selection; mutually exclusive with blockRanges. */
  blockIndices?: number[]
  /** Canonical ranges-v1:<first>+<count>[,...] text; mutually exclusive with blockIndices. */
  blockRanges?: string
}

// 202 payload: the maintenance Job was dispatched, not that the state changed.
export interface AuditMaintenanceAccepted {
  jobId: string
  algorithmId: string
  fileId: string
  maintenanceOp: string
  status: string
  message: string
}

/**
 * Dispatch dynamic PDP maintenance (Update / Insert / Delete).
 *
 * Exactly one of `blockIndices` or `blockRanges` is required. A blank
 * `algorithmId` uses the automatic route; a static algorithm answers 405 from
 * the backend. The 202 answer reports dispatch, never completion.
 */
export function maintainAudit(
  data: AuditMaintenanceRequest,
  initiatorId = '1',
  options?: AuditOperatorRequestOptions,
): Promise<AuditHttpResult<AuditMaintenanceAccepted>> {
  const hasIndices = data.blockIndices !== undefined
  const hasRanges = data.blockRanges !== undefined
  if (hasIndices === hasRanges) {
    throw new TypeError('Exactly one of blockIndices or blockRanges is required')
  }
  const params: Record<string, unknown> = { maintenanceOp: data.maintenanceOp }
  if (data.blockIndices !== undefined) params.blockIndices = data.blockIndices
  if (data.blockRanges !== undefined) params.blockRanges = data.blockRanges
  const algorithmId = data.algorithmId?.trim() ?? ''
  const url = algorithmId
    ? `/v1/audit/algorithms/${encodeURIComponent(algorithmId)}/maintenance`
    : '/v1/audit/maintenance'
  return api.post(url, {
    request: { initiatorId: initiatorId.trim() || '1', dataOwnerId: data.dataOwnerId.trim() },
    params,
  }, auditOperatorConfig(options)) as Promise<AuditHttpResult<AuditMaintenanceAccepted>>
}

export interface MaterialGcReport {
  ownerId: string
  algorithmId: string
  versionId: string
  jobId: string
  step: string
  outcome: string
  detail: string
}

// 200 payload of one bounded pass: evidence of what this call did, not proof of
// cluster-wide quiescence.
export interface MaterialGcPassResult {
  versionsExamined: number
  versionsRetired: number
  moreWorkPending: boolean
  nextLifecycleCursor: string | null
  reports: MaterialGcReport[]
}

/**
 * Run one bounded explicit material-GC pass.
 *
 * `afterVersionId` is the opaque cursor from a previous answer's
 * `nextLifecycleCursor`; absent starts at the first lifecycle row. The request
 * may wait for bounded remote steps; repeating it after a timeout is safe.
 */
export function runMaterialGcPass(
  afterVersionId?: string,
  initiatorId = '1',
  options?: AuditOperatorRequestOptions,
): Promise<AuditHttpResult<MaterialGcPassResult>> {
  const params: Record<string, unknown> = {}
  const cursor = afterVersionId?.trim()
  if (cursor) params.afterVersionId = cursor
  // The pass may wait for bounded remote steps (up to five minutes each); the
  // default 10 s axios timeout would misreport a still-running pass as failed.
  return api.post('/v1/audit/material-gc/run-pass', {
    request: { initiatorId: initiatorId.trim() || '1' },
    params,
  }, auditOperatorConfig(options, 0)) as Promise<AuditHttpResult<MaterialGcPassResult>>
}

export interface MaterialGcRearmResult {
  outcome: 'Created' | 'AlreadyActive' | 'Blocked' | string
  jobId: string
  anchorJobId: string
  detail: string
}

/**
 * Re-arm one failed material-GC obligation with a new Pending successor Job.
 *
 * Nothing starts automatically: the response only identifies the successor;
 * an explicit `runMaterialGcPass` call is required to execute it.
 */
export function rearmMaterialGcVersion(
  ownerId: string,
  algorithmId: string,
  versionId: string,
  initiatorId = '1',
  options?: AuditOperatorRequestOptions,
): Promise<AuditHttpResult<MaterialGcRearmResult>> {
  return api.post('/v1/audit/material-gc/rearm', {
    request: { initiatorId: initiatorId.trim() || '1' },
    params: {
      ownerId: ownerId.trim(),
      algorithmId: algorithmId.trim(),
      versionId: versionId.trim(),
    },
  }, auditOperatorConfig(options)) as Promise<AuditHttpResult<MaterialGcRearmResult>>
}
