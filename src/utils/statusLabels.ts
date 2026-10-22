type Translate = (key: string) => string

const JOB_STATUS_KEYS: Record<string, string> = {
  Pending: 'job.statusPending',
  Running: 'job.statusRunning',
  Succeeded: 'job.statusSucceeded',
  Failed: 'job.statusFailed',
}

const TASK_STATUS_KEYS: Record<string, string> = {
  Pending: 'execution.taskStatus.pending',
  Accepted: 'execution.taskStatus.accepted',
  Rejected: 'execution.taskStatus.rejected',
  Running: 'execution.taskStatus.running',
  Succeeded: 'execution.taskStatus.succeeded',
  Failed: 'execution.taskStatus.failed',
  Cancelled: 'execution.taskStatus.cancelled',
  TimedOut: 'execution.taskStatus.timedOut',
}

const PART_STATUS_KEYS: Record<string, string> = {
  planned: 'execution.tagGeneration.states.planned',
  running: 'execution.tagGeneration.states.running',
  generating: 'execution.tagGeneration.states.generating',
  generated: 'execution.tagGeneration.states.generated',
  persisted: 'execution.tagGeneration.states.persisted',
  completed: 'execution.tagGeneration.states.completed',
  failed: 'execution.tagGeneration.states.failed',
  cancelled: 'execution.tagGeneration.states.cancelled',
}

const EXECUTION_KIND_KEYS: Record<string, string> = {
  tagGeneration: 'execution.kinds.tagGeneration',
  challengeProof: 'execution.kinds.challengeProof',
  identityVerification: 'execution.kinds.identityVerification',
  other: 'execution.kinds.other',
  maintenance: 'execution.kinds.maintenance',
}

const COVERAGE_STATE_KEYS: Record<string, string> = {
  complete: 'execution.coverageState.complete',
  partial: 'execution.coverageState.partial',
  unavailable: 'execution.coverageState.unavailable',
  expired: 'execution.coverageState.expired',
  notInstrumented: 'execution.coverageState.notInstrumented',
}

const COVERAGE_REASON_KEYS: Record<string, string> = {
  ProtocolEventRetentionCutoff: 'execution.coverageReasons.ProtocolEventRetentionCutoff',
  TaskBookTerminalPruning: 'execution.coverageReasons.TaskBookTerminalPruning',
  TaskHistoryUnavailable: 'execution.coverageReasons.TaskHistoryUnavailable',
  WorkerTelemetryDisabled: 'execution.coverageReasons.WorkerTelemetryDisabled',
  WorkerStageNotInstrumented: 'execution.coverageReasons.WorkerStageNotInstrumented',
  PeerCorrelationUnavailable: 'execution.coverageReasons.PeerCorrelationUnavailable',
  NodeIdentityUnverified: 'execution.coverageReasons.NodeIdentityUnverified',
  ObservationQueueSaturated: 'execution.coverageReasons.ObservationQueueSaturated',
  ObservationWriteFailed: 'execution.coverageReasons.ObservationWriteFailed',
  SourceRecordUnavailable: 'execution.coverageReasons.SourceRecordUnavailable',
  ClockSkewDetected: 'execution.coverageReasons.ClockSkewDetected',
  TraceReconstructed: 'execution.coverageReasons.TraceReconstructed',
  JobMetadataIncomplete: 'execution.coverageReasons.JobMetadataIncomplete',
  ProtocolPacketUnavailable: 'execution.coverageReasons.ProtocolPacketUnavailable',
  DispatchAcknowledgementUnverified: 'execution.coverageReasons.DispatchAcknowledgementUnverified',
}
const MAINTENANCE_RECOVERY_KEYS: Record<string, string> = {
  Requested: 'execution.maintenance.states.requested',
  RecoveryBlocked: 'execution.maintenance.states.recoveryBlocked',
  CleanupPending: 'execution.maintenance.states.cleanupPending',
  Unknown: 'execution.maintenance.states.unknown',
}

function statusLabel(
  status: string | null | undefined,
  keys: Record<string, string>,
  t: Translate,
): string {
  if (status == null || status === '') return t('execution.notAvailable')
  const key = keys[status]
  return key ? t(key) : status
}

export function jobStatusLabel(status: string | null | undefined, t: Translate): string {
  return statusLabel(status, JOB_STATUS_KEYS, t)
}

export function taskStatusLabel(status: string | null | undefined, t: Translate): string {
  return statusLabel(status, TASK_STATUS_KEYS, t)
}

export function tracePartStatusLabel(status: string | null | undefined, t: Translate): string {
  return statusLabel(status, PART_STATUS_KEYS, t)
}

export function executionKindLabel(kind: string | null | undefined, t: Translate): string {
  return statusLabel(kind, EXECUTION_KIND_KEYS, t)
}

export function coverageStateLabel(status: string | null | undefined, t: Translate): string {
  return statusLabel(status, COVERAGE_STATE_KEYS, t)
}

export function coverageReasonLabel(reason: string, t: Translate): string {
  return statusLabel(reason, COVERAGE_REASON_KEYS, t)
}
export function maintenanceRecoveryLabel(state: string | null | undefined, t: Translate): string {
  if (state == null) return t('execution.notAvailable')
  if (state === '') return t('execution.maintenance.noRecovery')
  return statusLabel(state, MAINTENANCE_RECOVERY_KEYS, t)
}
