/**
 * Actions for the maintenance/GC session.
 *
 * The controller owns the in-flight pass controller, so unmounting the tab
 * cannot cancel or lose the wait: only the explicit "stop waiting" action
 * aborts the local request, and its outcome is reported as unknown.
 */

import {
  maintainAudit,
  rearmMaterialGcVersion,
  runMaterialGcPass,
  type AuditHttpResult,
  type AuditMaintenanceAccepted,
  type MaterialGcPassResult,
  type MaterialGcRearmResult,
} from '@/api/audit'
import { trackJob } from '@/stores/jobTracking'
import {
  failureBusinessKey,
  maintenanceSelectionForRequest,
  maintenanceSuccessOutcome,
  materialGcPassSuccessOutcome,
  materialGcContinuation,
  readOperationFailure,
  rearmSuccessOutcome,
  type GcPassTarget,
  type MaintenanceTarget,
  type OperationSubmissionSnapshot,
  type RearmTarget,
} from './auditMaintenance'
import {
  auditMaintenanceSession,
  type OperationAttempt,
  type OperationFailureState,
} from './auditMaintenanceSession'

export type MaintenanceActionResult<T> =
  | { ok: true; attempt: OperationAttempt<T> }
  | { ok: false; failure: OperationFailureState }
  | { ok: false; busy: true }

let passController: AbortController | null = null

function attemptOf<T>(
  target: MaintenanceTarget | GcPassTarget | RearmTarget,
  submission: OperationSubmissionSnapshot,
  response: AuditHttpResult<T>,
  outcome: OperationAttempt<T>['outcome'],
  businessKey: string,
): OperationAttempt<T> {
  return Object.freeze({
    target,
    submission,
    httpStatus: response.httpStatus,
    result: response.data,
    outcome,
    businessKey,
    receivedAt: new Date().toISOString(),
  })
}

function failureOf(
  submission: OperationSubmissionSnapshot,
  error: unknown,
  action: 'maintenance' | 'pass' | 'rearm',
): OperationFailureState {
  const failure = readOperationFailure(error)
  return Object.freeze({
    submission,
    failure,
    businessKey: failureBusinessKey(failure, action),
    receivedAt: new Date().toISOString(),
  })
}

function trackAcceptedJob(jobId: unknown): void {
  if (typeof jobId === 'string' && jobId.trim() !== '') trackJob(jobId.trim(), 'Audit')
}

export async function submitMaintenance(
  target: MaintenanceTarget,
  submission: OperationSubmissionSnapshot,
): Promise<MaintenanceActionResult<AuditMaintenanceAccepted>> {
  const state = auditMaintenanceSession.maintenance
  if (state.status === 'running') return { ok: false, busy: true }
  state.status = 'running'
  state.pendingSubmission = submission
  state.failure = null
  try {
    const selection = maintenanceSelectionForRequest(target)
    const response = await maintainAudit({
      dataOwnerId: target.ownerId,
      algorithmId: target.algorithmMode === 'explicit' ? target.requestedAlgorithmId : undefined,
      maintenanceOp: target.operation,
      ...selection,
    }, target.operatorId)
    const business = maintenanceSuccessOutcome(response.httpStatus)
    const attempt = attemptOf(target, submission, response, business.outcome, business.businessKey)
    state.attempt = attempt
    state.status = 'succeeded'
    state.pendingSubmission = null
    trackAcceptedJob(response.data?.jobId)
    return { ok: true, attempt }
  } catch (error) {
    const failure = failureOf(submission, error, 'maintenance')
    state.failure = failure
    state.status = 'failed'
    state.pendingSubmission = null
    return { ok: false, failure }
  }
}

export async function runGcPass(
  target: GcPassTarget,
  submission: OperationSubmissionSnapshot,
): Promise<MaintenanceActionResult<MaterialGcPassResult>> {
  const state = auditMaintenanceSession.gc.pass
  if (state.status === 'running') return { ok: false, busy: true }

  const controller = new AbortController()
  passController = controller
  state.status = 'running'
  state.startedAt = new Date().toISOString()
  state.runningCursor = target.cursor
  state.stopRequested = false
  state.pendingSubmission = submission
  state.failure = null

  try {
    const response = await runMaterialGcPass(
      target.cursor ?? undefined,
      target.operatorId,
      { signal: controller.signal },
    )
    const business = materialGcPassSuccessOutcome(response.httpStatus)
    const attempt = attemptOf(target, submission, response, business.outcome, business.businessKey)
    state.attempt = attempt
    state.round += 1
    state.status = 'succeeded'
    state.pendingSubmission = null
    // Persist the next continuation position. Filling the cursor never starts
    // another pass; the operator still has to press "continue scanning".
    const continuation = materialGcContinuation(response.data)
    auditMaintenanceSession.gc.cursor = continuation.cursor ?? ''
    return { ok: true, attempt }
  } catch (error) {
    const failure = failureOf(submission, error, 'pass')
    state.failure = failure
    state.pendingSubmission = null
    state.status = failure.failure.kind === 'http' ? 'failed' : 'unknown'
    return { ok: false, failure }
  } finally {
    if (passController === controller) passController = null
    state.stopRequested = false
    state.runningCursor = null
  }
}

/**
 * Abort only this browser's wait. The pass is idempotent per contract, but the
 * UI must still say "unknown" and must never auto-send it again.
 */
export function stopGcPassWait(): boolean {
  const state = auditMaintenanceSession.gc.pass
  if (state.status !== 'running' || !passController) return false
  state.stopRequested = true
  passController.abort()
  return true
}

export async function submitGcRearm(
  target: RearmTarget,
  submission: OperationSubmissionSnapshot,
): Promise<MaintenanceActionResult<MaterialGcRearmResult>> {
  const state = auditMaintenanceSession.gc.rearm
  if (state.status === 'running') return { ok: false, busy: true }
  state.status = 'running'
  state.pendingSubmission = submission
  state.failure = null
  try {
    const response = await rearmMaterialGcVersion(
      target.ownerId,
      target.algorithmId,
      target.versionId,
      target.operatorId,
    )
    const business = rearmSuccessOutcome(response.httpStatus, response.data)
    const attempt = attemptOf(target, submission, response, business.outcome, business.businessKey)
    state.attempt = attempt
    state.status = 'succeeded'
    state.pendingSubmission = null
    trackAcceptedJob(response.data?.jobId)
    return { ok: true, attempt }
  } catch (error) {
    const failure = failureOf(submission, error, 'rearm')
    state.failure = failure
    state.status = 'failed'
    state.pendingSubmission = null
    return { ok: false, failure }
  }
}
