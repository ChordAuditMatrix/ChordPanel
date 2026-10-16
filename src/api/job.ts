import { LosslessNumber, parse as parseLossless } from 'lossless-json'
import api from './request'
const TABLE_ID_FIELDS: Record<string, true> = { tableId: true, tableIdFrom: true, tableIdTo: true }
const TABLE_ID_ARRAY_FIELDS: Record<string, true> = { tableIds: true, allTableIds: true }

function normalizeJobNumbers(value: unknown, key = '', tableIdArray = false): unknown {
  if (value instanceof LosslessNumber) {
    return tableIdArray || Object.prototype.hasOwnProperty.call(TABLE_ID_FIELDS, key) ? value.toString() : Number(value.toString())
  }
  if (Array.isArray(value)) return value.map(item => normalizeJobNumbers(item, key, tableIdArray))
  if (!value || typeof value !== 'object') return value
  const normalized: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    normalized[childKey] = normalizeJobNumbers(childValue, childKey, Object.prototype.hasOwnProperty.call(TABLE_ID_ARRAY_FIELDS, childKey))
  }
  return normalized
}

export function parseJobJsonWithExactTableIds(text: string): unknown {
  const parsed = parseLossless(text, undefined, { parseNumber: value => new LosslessNumber(value) })
  return normalizeJobNumbers(parsed)
}

function transformJobResponse(data: unknown): unknown {
  if (typeof data !== 'string' || data.length === 0) return data
  try { return parseJobJsonWithExactTableIds(data) }
  catch { return data }
}

const jobResponseConfig = { transformResponse: [transformJobResponse] }
export function parseJobStatusMessage(message: string | undefined): Record<string, unknown> | unknown[] | null {
  if (!message) return null
  const trimmed = message.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed = parseJobJsonWithExactTableIds(trimmed)
    if (Array.isArray(parsed)) return parsed
    return parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export interface JobSummary {
  jobId: string
  jobType: string
  dataOwner?: { userId: string; userName: string }
  initiator?: { userId: string; userName: string }
  status: string
  errorCode?: string
  statusMessage?: string
  metadata?: Record<string, unknown>
  recoveryRequested?: boolean
  maintenanceRecovery?: string
  createdAtMs: number
  startedAtMs?: number
  endedAtMs?: number
  totalDurationMs?: number
}

export interface JobHistoryEntry {
  sequence: number
  status: string
  statusMessage?: string
  errorCode?: string
  switchedAtMs?: number
  totalDurationMs?: number
}

export interface TaskSummary {
  taskId: string
  jobId: string
  taskType: string
  taskSubType?: string
  priority?: number
  status: string
  statusMessage?: string
  createdAtMs?: number
  submittedAtMs?: number
  startedAtMs?: number
  completedAtMs?: number
}

export interface JobDetail extends JobSummary {
  history?: JobHistoryEntry[]
  taskIds?: string[]
  metadata?: Record<string, unknown>
}

export function getJobs(params?: {
  page?: number; pageSize?: number; jobType?: string;
  dataOwnerUserId?: string; status?: string;
}) {
  return api.get('/v1/jobs', { params, ...jobResponseConfig })
}

export function getJobDetail(jobId: string) {
  return api.get(`/v1/jobs/${jobId}`, jobResponseConfig)
}

export function cancelJob(jobId: string, initiatorId?: string) {
  return api.post(`/v1/jobs/${jobId}/cancel`, {
    request: { initiatorId: initiatorId || '1' },
  })
}

export function getJobTasks(jobId: string, params?: { page?: number; pageSize?: number }) {
  return api.get(`/v1/jobs/${jobId}/tasks`, { params, ...jobResponseConfig })
}

export interface AggregateMetricsParams {
  metric: string
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max'
  groupBy?: string
  jobType?: string
  dataOwnerUserId?: string
  status?: string
  /** Additional metadata filters: metadata.<key>=<value> */
  metadata?: Record<string, string>
}

export function aggregateJobs(params: AggregateMetricsParams) {
  const qs: Record<string, string> = { metric: params.metric, operation: params.operation }
  if (params.groupBy) qs.groupBy = params.groupBy
  if (params.jobType) qs.jobType = params.jobType
  if (params.dataOwnerUserId) qs.dataOwnerUserId = params.dataOwnerUserId
  if (params.status) qs.status = params.status
  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      qs[`metadata.${key}`] = value
    }
  }
  return api.get('/v1/jobs/aggregate', { params: qs })
}
