import type { TraceCoverageState, TraceSummary, TraceUint64 } from '@/api/trace'

export type AuditSubmissionKind = 'tagGeneration' | 'challengeProof'
export type TagProgressKey = 'plannedPartCount' | 'completedPartCount' | 'plannedBlockCount' | 'generatedBlockCount' | 'persistedCount' | 'storageAccountedTagCount'

export interface CompactAuditSubmissionSummary {
  workerStageCoverage: TraceCoverageState | null
  verificationVerdict: boolean | null
  tagProgress: Array<{ key: TagProgressKey; value: TraceUint64 }>
}

const TAG_PROGRESS_KEYS: readonly TagProgressKey[] = [
  'plannedPartCount',
  'completedPartCount',
  'plannedBlockCount',
  'generatedBlockCount',
  'persistedCount',
  'storageAccountedTagCount',
]

/** Project only matching Trace facts; null values stay unavailable and counts stay decimal strings. */
export function projectAuditSubmissionSummary(
  jobId: string,
  kind: AuditSubmissionKind,
  summary: TraceSummary | null,
): CompactAuditSubmissionSummary | null {
  if (!summary || summary.jobId !== jobId || summary.executionKind !== kind) return null

  const tagProgress = kind === 'tagGeneration'
    ? TAG_PROGRESS_KEYS.flatMap(key => {
      const value = summary.progress[key]
      return value === null ? [] : [{ key, value }]
    })
    : []

  return {
    workerStageCoverage: summary.coverage.workerStages,
    verificationVerdict: kind === 'challengeProof' ? summary.references.verified : null,
    tagProgress,
  }
}
