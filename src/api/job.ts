import api from './request'

export interface JobSummary {
  jobId: string
  jobType: string
  dataOwner?: { userId: string; userName: string }
  initiator?: { userId: string; userName: string }
  status: string
  errorCode?: string
  statusMessage?: string
  metadata?: Record<string, unknown>
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
  return api.get('/v1/jobs', { params })
}

export function getJobDetail(jobId: string) {
  return api.get(`/v1/jobs/${jobId}`)
}

export function cancelJob(jobId: string, initiatorId?: string) {
  return api.post(`/v1/jobs/${jobId}/cancel`, {
    request: { initiatorId: initiatorId || '1' },
  })
}

export function getJobTasks(jobId: string, params?: { page?: number; pageSize?: number }) {
  return api.get(`/v1/jobs/${jobId}/tasks`, { params })
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
