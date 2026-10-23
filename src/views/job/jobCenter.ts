import { parseJobStatusMessage } from '@/api/job'
import { jobStatusTagType, type JobStatusTagType } from '@/utils/jobStatus'
import { jobStatusLabel } from '@/utils/statusLabels'

type Translate = (key: string) => string

export interface JobStatDefinition {
  key: 'total' | 'running' | 'succeeded' | 'failed'
  labelKey: string
  /** `null` requests the unfiltered Job total. */
  status: 'Running' | 'Succeeded' | 'Failed' | null
}

/**
 * Global counters the Job API can prove. Cancellation is not a JobStatus: the
 * backend records it as Failed + errorCode=Cancelled, so it stays inside Failed.
 */
export const JOB_STATS: readonly JobStatDefinition[] = [
  { key: 'total', labelKey: 'job.workbench.statTotal', status: null },
  { key: 'running', labelKey: 'job.workbench.statRunning', status: 'Running' },
  { key: 'succeeded', labelKey: 'job.workbench.statSucceeded', status: 'Succeeded' },
  { key: 'failed', labelKey: 'job.workbench.statFailed', status: 'Failed' },
]

export type JobStatKey = JobStatDefinition['key']

export function jobStatusPresentation(
  status: string | null | undefined,
  recovering: boolean,
  t: Translate,
): { type: JobStatusTagType; label: string } {
  return {
    type: recovering ? 'warning' : jobStatusTagType(status),
    label: recovering ? t('job.statusRecovering') : jobStatusLabel(status, t),
  }
}
const MAX_STATUS_MESSAGE_SUMMARY_LENGTH = 72
const STATUS_MESSAGE_SUMMARY_SUFFIX_LENGTH = 30

/** Summarizes string-valued JSON fields without relying on any field names. */
export function summarizeJobStatusMessage(message: string): string {
  const parsed = parseJobStatusMessage(message)
  const entries = parsed && !Array.isArray(parsed) ? Object.entries(parsed) : []
  const content = entries.length > 0 && entries.every(([, value]) => typeof value === 'string')
    ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
    : message
  const summary = content.replace(/\s+/g, ' ').trim()
  if (summary.length <= MAX_STATUS_MESSAGE_SUMMARY_LENGTH) return summary
  const suffix = summary.slice(-STATUS_MESSAGE_SUMMARY_SUFFIX_LENGTH).trimStart()
  const prefixLength = MAX_STATUS_MESSAGE_SUMMARY_LENGTH - suffix.length - 3
  const prefix = summary.slice(0, prefixLength).trimEnd()
  return `${prefix} … ${suffix}`
}

export type JobNavigationAction = 'execution' | 'details' | 'report'

export function jobNavigationContent(action: JobNavigationAction): { labelKey: string; helpKey: string } {
  switch (action) {
    case 'execution':
      return { labelKey: 'job.workbench.action.execution', helpKey: 'job.workbench.action.executionHelp' }
    case 'details':
      return { labelKey: 'job.workbench.action.details', helpKey: 'job.workbench.action.detailsHelp' }
    case 'report':
      return { labelKey: 'job.workbench.action.report', helpKey: 'job.workbench.action.reportHelp' }
  }
}

/** Keeps a requested page inside the server-reported range after filters change. */
export function clampJobPage(requestedPage: number, total: number, pageSize: number): number {
  const safePage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.max(1, Math.floor(pageSize)) : 1
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const lastPage = Math.max(1, Math.ceil(safeTotal / safePageSize))
  return Math.min(Math.max(1, safePage), lastPage)
}

/** Normalizes `?jobId=` so the same drawer can be opened from global tracking. */
export function readJobIdQuery(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) return item.trim()
  }
  return ''
}
