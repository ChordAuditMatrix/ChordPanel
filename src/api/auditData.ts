import { LosslessNumber, stringify as stringifyLossless } from 'lossless-json'
import api from './request'

/** One cell named by an external source-change notification. */
export interface SourceChangeTuple {
  /** Persistable int64 table id; sent as exact decimal text when it is a string. */
  tableId: string | number
  rowId: string
  columnId: number
}

/** 202 payload: the notification and its Job are durable; work continues asynchronously. */
export interface SourceChangeAccepted {
  jobId: string
  statusUrl: string
}

export interface DriftBaselineApproval {
  ownerId: string
  recoveryId: string
  driftRevision: number
  baselineDecision: string
}

const MAX_PERSISTABLE_TABLE_ID = 9_223_372_036_854_775_807n
const losslessNumberStringifier = [{
  test: (value: unknown) => value instanceof LosslessNumber,
  stringify: (value: unknown) => (value as LosslessNumber).toString(),
}]

function exactTableId(value: unknown): LosslessNumber {
  const text = value instanceof LosslessNumber
    ? value.toString()
    : typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? String(value)
        : ''
  if (!/^(0|[1-9]\d*)$/.test(text) || BigInt(text) > MAX_PERSISTABLE_TABLE_ID) {
    throw new TypeError('Source-change tableId must be an exact persistable positive integer')
  }
  return new LosslessNumber(text)
}

// The tuple list is one durable payload: table ids must keep their exact
// decimal value, so the request is serialized with lossless-json exactly like
// the ownership APIs.
const sourceChangeRequestConfig = {
  transformRequest: [(data: unknown) => stringifyLossless(data, (key, value) => {
    if (key !== 'tableId') return value
    return Array.isArray(value) ? value.map(exactTableId) : exactTableId(value)
  }, undefined, losslessNumberStringifier)],
}

/**
 * Durably admit an external MySQL writer's source-change notification.
 *
 * `tuples` omitted or empty means "impact unknown": the backend rebuilds the
 * whole file layout. The same `(ownerId, notificationId)` with the same
 * normalized payload always answers 202 with the same Job; a different payload
 * answers 409 SourceChangeConflict.
 */
export function createSourceChangeJob(
  ownerId: string,
  notificationId: string,
  tuples?: SourceChangeTuple[],
  initiatorId = '1',
): Promise<SourceChangeAccepted> {
  const params: Record<string, unknown> = { notificationId: notificationId.trim() }
  if (tuples && tuples.length > 0) params.tuples = tuples
  return api.post(`/v1/audit-data/${encodeURIComponent(ownerId.trim())}/source-change-jobs`, {
    request: { initiatorId: initiatorId.trim() || '1' },
    params,
  }, sourceChangeRequestConfig)
}

/**
 * Record an operator decision for one exact owner recovery and drift revision.
 *
 * This changes the baseline decision only. It does not clear the owner's
 * isolation or claim that recovery work completed; the durable worker proceeds
 * asynchronously after the decision is recorded.
 */
export function approveSourceDriftBaseline(
  ownerId: string,
  recoveryId: string,
  driftRevision: number,
  initiatorId: string,
): Promise<DriftBaselineApproval> {
  if (!Number.isSafeInteger(driftRevision) || driftRevision <= 0) {
    throw new TypeError('driftRevision must be a positive safe integer')
  }
  return api.post(
    `/v1/audit-data/${encodeURIComponent(ownerId.trim())}/source-drift-recoveries/${encodeURIComponent(recoveryId.trim())}/approve-baseline`,
    {
      request: { initiatorId: initiatorId.trim() },
      params: { driftRevision },
    },
  )
}
