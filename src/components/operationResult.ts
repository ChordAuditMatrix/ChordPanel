/**
 * Shared operator-result model for Audit and Ownership workbenches.
 *
 * These helpers keep outcome classification and the immutable submitted-target
 * snapshot testable without mounting a component. Nothing here stores state:
 * panels capture a snapshot before awaiting a request and pass it down.
 */

export type OperationOutcomeKind =
  | 'succeeded'
  | 'accepted'
  | 'existing'
  | 'not-retried'
  | 'blocked'
  | 'unknown'
  | 'failed'

export interface ResultFact {
  readonly labelKey: string
  readonly value: string
  readonly mono?: boolean
  /** Secondary text, e.g. a resolved user name for an owner id. */
  readonly note?: string
}

export interface ResultFactGroup {
  readonly key: string
  readonly titleKey?: string
  readonly facts: readonly ResultFact[]
}

export interface OperationSubmissionField {
  readonly labelKey: string
  readonly value: string
  readonly mono?: boolean
}

/**
 * The exact request target captured when the panel submits.
 *
 * Callers freeze the object before awaiting so late form edits cannot rewrite
 * what the result surface claims was sent.
 */
export interface OperationSubmissionSnapshot {
  readonly fields: readonly OperationSubmissionField[]
  readonly submittedAt?: string
  readonly requestId?: string
  readonly traceId?: string
}

/** Return a frozen copy so later edits to the caller's object cannot leak in. */
export function freezeSubmissionSnapshot(
  snapshot: OperationSubmissionSnapshot,
): OperationSubmissionSnapshot {
  return Object.freeze({
    ...snapshot,
    fields: Object.freeze(snapshot.fields.map(field => Object.freeze({ ...field }))),
  })
}

export const OPERATION_OUTCOME_LABEL_KEYS: Readonly<Record<OperationOutcomeKind, string>> = Object.freeze({
  succeeded: 'operationResult.outcome.succeeded',
  accepted: 'operationResult.outcome.accepted',
  existing: 'operationResult.outcome.existing',
  'not-retried': 'operationResult.outcome.notRetried',
  blocked: 'operationResult.outcome.blocked',
  unknown: 'operationResult.outcome.unknown',
  failed: 'operationResult.outcome.failed',
})

export type OperationOutcomeTone = 'success' | 'info' | 'warning' | 'error' | 'default'

export function operationOutcomeTone(kind: OperationOutcomeKind): OperationOutcomeTone {
  switch (kind) {
    case 'succeeded': return 'success'
    case 'accepted': return 'info'
    case 'existing': return 'info'
    case 'not-retried': return 'default'
    case 'blocked': return 'warning'
    case 'failed': return 'error'
    default: return 'default'
  }
}

function resultRecord(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  return result as Record<string, unknown>
}

function nonEmptyText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Fields only a completed synchronous operation can answer with.
 *
 * Each one is the work itself: a proof verdict, a committed root hash, an
 * applied decision. Pagination and listing envelope fields (`total`, `cells`)
 * describe what was read, so they never prove that anything happened.
 */
function hasCompletedWorkEvidence(record: Record<string, unknown>): boolean {
  const committed = [
    'proof', 'proofType', 'rootHash', 'sourceRootHash', 'targetRootHash',
    'rootNodeId', 'layers', 'baselineDecision',
  ].some(key => record[key] !== undefined && record[key] !== null)
  if (committed) return true
  if (typeof record.valid === 'boolean' || typeof record.deleted === 'boolean') return true
  return nonEmptyText(record.verdict) !== ''
}

/**
 * Classify a successful HTTP answer without inventing outcomes.
 *
 * Explicit markers win, and a durable `jobId` means the work is asynchronous
 * (accepted) unless the payload also carries the finished work itself. Being a
 * non-empty object proves nothing: without a completed-work field or an
 * explicit success marker the answer stays unknown, so a listing envelope
 * (`total`, `cells`) never reads as success. A primitive or empty payload is
 * unknown, a real request error is always a failure, and panels can override
 * the result with an explicit `outcome` when the backend distinguishes states
 * this cannot.
 */
export function classifyOperationOutcome(result: unknown, error = ''): OperationOutcomeKind | null {
  if (nonEmptyText(error)) return 'failed'
  if (result === undefined || result === null) return null
  const record = resultRecord(result)
  if (!record) return 'unknown'
  if (Object.keys(record).length === 0) return 'unknown'

  if (record.retried === false) return 'not-retried'
  if (record.retried === true) return 'succeeded'

  const outcome = nonEmptyText(record.outcome)
  const status = nonEmptyText(record.status)
  if (/^already/i.test(outcome) || /^already/i.test(status) || record.alreadyExists === true) {
    return 'existing'
  }
  if (/^blocked$/i.test(outcome) || record.blocked === true) return 'blocked'
  if (/not.?retr/i.test(outcome) || /not.?retr/i.test(status)) return 'not-retried'
  if (record.accepted === true || status === 'Accepted' || record.httpStatus === 202) {
    return 'accepted'
  }
  // A completed proof or mutation answer may carry a tracking jobId; the
  // payload itself is the result, so it is not a pending dispatch envelope.
  if (hasCompletedWorkEvidence(record)) return 'succeeded'
  if (nonEmptyText(record.jobId)) return 'accepted'
  if (/^(created|updated|deleted|applied|approved|succeeded|success|ok)$/i.test(outcome)) {
    return 'succeeded'
  }
  if (/^(completed|succeeded|success|ok)$/i.test(status)) return 'succeeded'
  return 'unknown'
}

/** Trace id echoed by the answer, when the panel did not capture one at submit. */
export function resultTraceId(result: unknown): string {
  const record = resultRecord(result)
  return record ? nonEmptyText(record.traceId) : ''
}

/** Request/correlation id echoed by the answer, when the panel did not capture one. */
export function resultRequestId(result: unknown): string {
  const record = resultRecord(result)
  if (!record) return ''
  return nonEmptyText(record.requestId) || nonEmptyText(record.correlationId)
}
