/**
 * Page session for dynamic maintenance and deployment-level material GC.
 *
 * The Audit workbench unmounts inactive tab panes, so component-local refs
 * would lose a running pass, its report and the continuation cursor whenever
 * the operator switches tabs. This module is the single page-scoped owner of
 * that state; it is not a second business store and it does not duplicate the
 * Job tracker or the backend's durable state.
 */

import { reactive } from 'vue'
import type {
  AuditMaintenanceAccepted,
  AuditMaintenanceOp,
  MaterialGcPassResult,
  MaterialGcRearmResult,
} from '@/api/audit'
import type {
  GcPassTarget,
  MaintenanceAlgorithmMode,
  MaintenanceSelectionMode,
  MaintenanceTarget,
  OperationFailure,
  OperationOutcomeKind,
  OperationSubmissionSnapshot,
  RearmPrefill,
  RearmTarget,
} from './auditMaintenance'

export interface OperationAttempt<T> {
  readonly target: MaintenanceTarget | GcPassTarget | RearmTarget
  readonly submission: OperationSubmissionSnapshot
  readonly httpStatus: number
  readonly result: T
  readonly outcome: OperationOutcomeKind
  readonly businessKey: string
  readonly receivedAt: string
}

export interface OperationFailureState {
  readonly submission: OperationSubmissionSnapshot
  readonly failure: OperationFailure
  readonly businessKey: string
  readonly receivedAt: string
}

export type OperationStatus = 'idle' | 'running' | 'succeeded' | 'failed'
export type PassStatus = OperationStatus | 'unknown'

export interface MaintenanceFormState {
  operatorId: string
  algorithmMode: MaintenanceAlgorithmMode
  algorithmId: string
  operation: AuditMaintenanceOp
  selectionMode: MaintenanceSelectionMode
  indicesText: string
  rangesText: string
  status: OperationStatus
  pendingSubmission: OperationSubmissionSnapshot | null
  attempt: OperationAttempt<AuditMaintenanceAccepted> | null
  failure: OperationFailureState | null
}

export interface GcPassState {
  status: PassStatus
  round: number
  startedAt: string | null
  runningCursor: string | null
  stopRequested: boolean
  pendingSubmission: OperationSubmissionSnapshot | null
  attempt: OperationAttempt<MaterialGcPassResult> | null
  failure: OperationFailureState | null
}

export interface GcRearmFormState {
  ownerId: string
  algorithmId: string
  versionId: string
  prefill: RearmPrefill | null
  status: OperationStatus
  pendingSubmission: OperationSubmissionSnapshot | null
  attempt: OperationAttempt<MaterialGcRearmResult> | null
  failure: OperationFailureState | null
}

export interface AuditMaintenanceSessionState {
  maintenance: MaintenanceFormState
  gc: {
    operatorId: string
    cursor: string
    pass: GcPassState
    rearm: GcRearmFormState
  }
}

function createSessionState(): AuditMaintenanceSessionState {
  return {
    maintenance: {
      operatorId: '1',
      algorithmMode: 'automatic',
      algorithmId: '',
      operation: 'Update',
      selectionMode: 'indices',
      indicesText: '',
      rangesText: '',
      status: 'idle',
      pendingSubmission: null,
      attempt: null,
      failure: null,
    },
    gc: {
      operatorId: '1',
      cursor: '',
      pass: {
        status: 'idle',
        round: 0,
        startedAt: null,
        runningCursor: null,
        stopRequested: false,
        pendingSubmission: null,
        attempt: null,
        failure: null,
      },
      rearm: {
        ownerId: '',
        algorithmId: '',
        versionId: '',
        prefill: null,
        status: 'idle',
        pendingSubmission: null,
        attempt: null,
        failure: null,
      },
    },
  }
}

export const auditMaintenanceSession = reactive<AuditMaintenanceSessionState>(createSessionState())

/** Restore the initial state; intended for focused tests and explicit resets. */
export function resetAuditMaintenanceSession(): void {
  Object.assign(auditMaintenanceSession, createSessionState())
}
