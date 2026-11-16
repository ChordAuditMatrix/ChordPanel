/**
 * Recovery-flow page model.
 *
 * Two audit/data operations share the same safety rules: the operator reviews
 * one frozen target, confirms the exact object and revision, and the result is
 * kept next to that snapshot rather than the current form values.
 *
 * A drift recovery or ownership refresh report may prefill the operator form,
 * but only when the report names the same owner. Recovery ids are opaque: this
 * module never derives a revision (or anything else) from their text, and it
 * never synthesizes a pending-work list when no report is available.
 */

import type { SourceChangeTuple } from '@/api/auditData'
import {
  MAX_COLUMN_ID,
  MAX_PERSISTABLE_TABLE_ID,
  MAX_SOURCE_CHANGE_TUPLES,
  MAX_SOURCE_CHANGE_TUPLE_PAYLOAD_BYTES,
  SOURCE_CHANGE_TUPLE_OVERHEAD_BYTES,
  sourceChangeIdentityError,
} from '@/views/audit/auditOperations'

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface RecoveryFact {
  labelKey: string
  value: string
  mono?: boolean
}

/** Native input attributes used to tie a field error to its input. */
export interface RecoveryInputAriaProps {
  'aria-label'?: string
  'aria-invalid'?: 'true' | 'false'
  'aria-describedby'?: string
}

export interface RecoveryIssue {
  errorKey: string
  errorParams?: Record<string, string>
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function trimmedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text === '' ? null : text
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

export function createRequestRef(prefix: string, entropy?: string): string {
  const token = entropy?.trim()
    || globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}:${token}`
}

/* ------------------------------------------------------------------------- */
/* Source-change cells and explicit scope                                    */
/* ------------------------------------------------------------------------- */

export type SourceChangeScope = 'cells' | 'whole-file'

export interface SourceChangeCellDraft {
  /** Stable local row key; never sent to the backend. */
  key: string
  tableId: string
  rowId: string
  columnId: number | null
}

let cellDraftSequence = 0

export function createSourceChangeCellDraft(): SourceChangeCellDraft {
  cellDraftSequence += 1
  return {
    key: `source-cell-${Date.now().toString(36)}-${cellDraftSequence}`,
    tableId: '',
    rowId: '',
    columnId: null,
  }
}

export type SourceChangeCellField = 'tableId' | 'rowId' | 'columnId'

/** Validate one field of one structured cell row. */
export function sourceChangeCellFieldError(
  draft: SourceChangeCellDraft,
  field: SourceChangeCellField,
): RecoveryIssue | null {
  if (field === 'tableId') {
    const tableId = draft.tableId.trim()
    if (!/^(0|[1-9]\d*)$/.test(tableId) || BigInt(tableId) > MAX_PERSISTABLE_TABLE_ID) {
      return { errorKey: 'audit.workbench.sourceChange.errors.tableId' }
    }
    return null
  }
  if (field === 'rowId') {
    return draft.rowId.trim() === ''
      ? { errorKey: 'audit.workbench.sourceChange.errors.rowId' }
      : null
  }
  const columnId = draft.columnId
  if (
    typeof columnId !== 'number'
    || !Number.isInteger(columnId)
    || columnId < 0
    || columnId > MAX_COLUMN_ID
  ) {
    return { errorKey: 'audit.workbench.sourceChange.errors.columnId' }
  }
  return null
}

/** First invalid field of one row, ready for a row-level message. */
export function sourceChangeCellError(
  draft: SourceChangeCellDraft,
  index: number,
): RecoveryIssue | null {
  for (const field of ['tableId', 'rowId', 'columnId'] as const) {
    const issue = sourceChangeCellFieldError(draft, field)
    if (issue) {
      return { ...issue, errorParams: { index: String(index + 1) } }
    }
  }
  return null
}

export function sourceChangeCellHasContent(draft: SourceChangeCellDraft): boolean {
  return draft.tableId.trim() !== ''
    || draft.rowId !== ''
    || draft.columnId !== null
}

export type SourceChangeCellsParse =
  | { ok: true; tuples: SourceChangeTuple[]; payloadBytes: number }
  | { ok: false; errorKey: string; errorParams?: Record<string, string> }

/**
 * Convert the structured rows to the exact wire tuples.
 *
 * An empty row list is an error here: whole-file rebuilds are a separate,
 * explicit scope and are never inferred from an empty list.
 */
export function sourceChangeCellsToTuples(
  drafts: readonly SourceChangeCellDraft[],
): SourceChangeCellsParse {
  if (drafts.length === 0) {
    return { ok: false, errorKey: 'recovery.scope.cellsEmpty' }
  }
  if (drafts.length > MAX_SOURCE_CHANGE_TUPLES) {
    return {
      ok: false,
      errorKey: 'audit.workbench.sourceChange.errors.tooManyTuples',
      errorParams: { max: String(MAX_SOURCE_CHANGE_TUPLES) },
    }
  }
  const tuples: SourceChangeTuple[] = []
  let payloadBytes = 0
  for (const [index, draft] of drafts.entries()) {
    const issue = sourceChangeCellError(draft, index)
    if (issue) return { ok: false, ...issue }
    tuples.push({
      tableId: draft.tableId.trim(),
      rowId: draft.rowId,
      columnId: draft.columnId as number,
    })
    payloadBytes += SOURCE_CHANGE_TUPLE_OVERHEAD_BYTES + utf8Bytes(draft.rowId)
    if (payloadBytes > MAX_SOURCE_CHANGE_TUPLE_PAYLOAD_BYTES) {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.payloadTooLarge',
        errorParams: { max: String(MAX_SOURCE_CHANGE_TUPLE_PAYLOAD_BYTES) },
      }
    }
  }
  return { ok: true, tuples, payloadBytes }
}

export interface SourceChangeTargetSnapshot {
  readonly kind: 'source-change'
  readonly ownerId: string
  readonly operatorId: string
  readonly notificationId: string
  readonly scope: SourceChangeScope
  /** Empty for an explicitly chosen whole-file rebuild. */
  readonly tuples: readonly SourceChangeTuple[]
  readonly tupleCount: number
  readonly payloadBytes: number
  readonly requestRef: string
  readonly capturedAt: string
}

export interface SourceChangeSnapshotInput {
  ownerId: string
  operatorId: string
  notificationId: string
  scope: SourceChangeScope | null
  cells: readonly SourceChangeCellDraft[]
  capturedAt?: string
  requestRef?: string
}

export type SnapshotBuild<T> =
  | { ok: true; snapshot: T }
  | { ok: false; errorKey: string; errorParams?: Record<string, string> }

export function createSourceChangeSnapshot(
  input: SourceChangeSnapshotInput,
): SnapshotBuild<SourceChangeTargetSnapshot> {
  const ownerId = input.ownerId.trim()
  const operatorId = input.operatorId.trim()
  const notificationId = input.notificationId.trim()
  const scope = input.scope
  const identityError = sourceChangeIdentityError(ownerId, notificationId)
  if (identityError) return { ok: false, errorKey: identityError }
  if (!operatorId) {
    return { ok: false, errorKey: 'audit.workbench.operations.operatorRequired' }
  }
  if (scope === null) {
    return { ok: false, errorKey: 'recovery.scope.required' }
  }

  let tuples: SourceChangeTuple[] = []
  let payloadBytes = 0
  if (scope === 'cells') {
    const parsed = sourceChangeCellsToTuples(input.cells)
    if (!parsed.ok) return parsed
    tuples = parsed.tuples
    payloadBytes = parsed.payloadBytes
  }

  const snapshot: SourceChangeTargetSnapshot = {
    kind: 'source-change',
    ownerId,
    operatorId,
    notificationId,
    scope,
    tuples,
    tupleCount: tuples.length,
    payloadBytes,
    requestRef: input.requestRef?.trim() || createRequestRef('source-change'),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  }
  return { ok: true, snapshot: freezeDeep(snapshot) }
}

/* ------------------------------------------------------------------------- */
/* Drift and refresh targets                                                 */
/* ------------------------------------------------------------------------- */

export interface RecoveryOrigin {
  readonly kind: 'manual' | 'report'
  readonly reportSource: string | null
  readonly reportRef: string | null
  readonly reportedAt: string | null
}

export function manualOrigin(): RecoveryOrigin {
  return freezeDeep<RecoveryOrigin>({
    kind: 'manual',
    reportSource: null,
    reportRef: null,
    reportedAt: null,
  })
}

function originFromReport(report: {
  sourceLabel: string | null
  reportRef: string | null
  reportedAt: string | null
}): RecoveryOrigin {
  return freezeDeep<RecoveryOrigin>({
    kind: 'report',
    reportSource: report.sourceLabel,
    reportRef: report.reportRef,
    reportedAt: report.reportedAt,
  })
}

export interface DriftTargetSnapshot {
  readonly kind: 'drift-approval'
  readonly ownerId: string
  readonly operatorId: string
  readonly recoveryId: string
  readonly driftRevision: number
  readonly origin: RecoveryOrigin
  readonly requestRef: string
  readonly capturedAt: string
}

export interface DriftSnapshotInput {
  ownerId: string
  operatorId: string
  recoveryId: string
  driftRevision: number | null
  origin?: RecoveryOrigin
  capturedAt?: string
  requestRef?: string
}

export function createDriftTargetSnapshot(
  input: DriftSnapshotInput,
): SnapshotBuild<DriftTargetSnapshot> {
  const ownerId = input.ownerId.trim()
  const operatorId = input.operatorId.trim()
  const recoveryId = input.recoveryId.trim()
  if (!ownerId) return { ok: false, errorKey: 'audit.selectOwnerWarn' }
  if (!operatorId) {
    return { ok: false, errorKey: 'audit.workbench.operations.operatorRequired' }
  }
  if (!recoveryId) {
    return { ok: false, errorKey: 'audit.workbench.drift.recoveryRequired' }
  }
  const driftRevision = input.driftRevision
  if (
    typeof driftRevision !== 'number'
    || !Number.isSafeInteger(driftRevision)
    || driftRevision <= 0
  ) {
    return { ok: false, errorKey: 'audit.workbench.drift.revisionRequired' }
  }

  const snapshot: DriftTargetSnapshot = {
    kind: 'drift-approval',
    ownerId,
    operatorId,
    recoveryId,
    driftRevision,
    origin: input.origin ?? manualOrigin(),
    requestRef: input.requestRef?.trim() || createRequestRef('drift-approval'),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  }
  return { ok: true, snapshot: freezeDeep(snapshot) }
}

export interface RefreshTargetSnapshot {
  readonly kind: 'refresh-retry'
  readonly ownerId: string
  readonly operatorId: string
  readonly pendingRevision: number
  readonly reason: string
  readonly origin: RecoveryOrigin
  readonly requestRef: string
  readonly capturedAt: string
}

export interface RefreshSnapshotInput {
  ownerId: string
  operatorId: string
  pendingRevision: number | null
  reason: string
  origin?: RecoveryOrigin
  capturedAt?: string
  requestRef?: string
}

export function createRefreshTargetSnapshot(
  input: RefreshSnapshotInput,
): SnapshotBuild<RefreshTargetSnapshot> {
  const ownerId = input.ownerId.trim()
  const operatorId = input.operatorId.trim()
  const reason = input.reason.trim()
  if (!ownerId) return { ok: false, errorKey: 'ownership.fillOwnerId' }
  if (!operatorId) {
    return { ok: false, errorKey: 'audit.workbench.operations.operatorRequired' }
  }
  const pendingRevision = input.pendingRevision
  if (
    typeof pendingRevision !== 'number'
    || !Number.isSafeInteger(pendingRevision)
    || pendingRevision < 0
  ) {
    return { ok: false, errorKey: 'ownership.workbench.refresh.revisionRequired' }
  }
  if (!reason) {
    return { ok: false, errorKey: 'ownership.workbench.refresh.reasonRequired' }
  }

  const snapshot: RefreshTargetSnapshot = {
    kind: 'refresh-retry',
    ownerId,
    operatorId,
    pendingRevision,
    reason,
    origin: input.origin ?? manualOrigin(),
    requestRef: input.requestRef?.trim() || createRequestRef('refresh-retry'),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  }
  return { ok: true, snapshot: freezeDeep(snapshot) }
}

/* ------------------------------------------------------------------------- */
/* Report intake (same-source prefill)                                       */
/* ------------------------------------------------------------------------- */

export interface DriftRecoveryReport {
  readonly kind: 'source-drift'
  readonly ownerId: string
  readonly recoveryId: string
  readonly driftRevision: number
  readonly sourceLabel: string | null
  readonly reportRef: string | null
  readonly reportedAt: string | null
}

export interface RefreshFailureReport {
  readonly kind: 'ownership-refresh'
  readonly ownerId: string
  readonly pendingRevision: number
  readonly sourceLabel: string | null
  readonly reportRef: string | null
  readonly reportedAt: string | null
}

export type RecoveryReport = DriftRecoveryReport | RefreshFailureReport

export type RecoveryReportStatus = 'missing' | 'invalid' | 'owner-mismatch' | 'available'

export interface RecoveryReportPlan<T extends RecoveryReport> {
  readonly status: RecoveryReportStatus
  readonly report: T | null
}

export type DriftRecoveryReportParse =
  | { ok: true; report: DriftRecoveryReport }
  | { ok: false }

/**
 * Validate a drift report handed in by an owning surface.
 *
 * `recoveryId` is kept as one opaque token. The revision must be present as its
 * own field; it is never derived from the id text.
 */
export function normalizeDriftRecoveryReport(input: unknown): DriftRecoveryReportParse {
  if (!isPlainRecord(input)) return { ok: false }
  if ('kind' in input && input.kind !== 'source-drift') return { ok: false }
  const ownerId = trimmedText(input.ownerId)
  const recoveryId = trimmedText(input.recoveryId)
  const driftRevision = input.driftRevision
  if (!ownerId || !recoveryId) return { ok: false }
  if (
    typeof driftRevision !== 'number'
    || !Number.isSafeInteger(driftRevision)
    || driftRevision <= 0
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    report: freezeDeep<DriftRecoveryReport>({
      kind: 'source-drift',
      ownerId,
      recoveryId,
      driftRevision,
      sourceLabel: trimmedText(input.sourceLabel),
      reportRef: trimmedText(input.reportRef),
      reportedAt: trimmedText(input.reportedAt),
    }),
  }
}

export type RefreshFailureReportParse =
  | { ok: true; report: RefreshFailureReport }
  | { ok: false }

export function normalizeRefreshFailureReport(input: unknown): RefreshFailureReportParse {
  if (!isPlainRecord(input)) return { ok: false }
  if ('kind' in input && input.kind !== 'ownership-refresh') return { ok: false }
  const ownerId = trimmedText(input.ownerId)
  const pendingRevision = input.pendingRevision
  if (!ownerId) return { ok: false }
  if (
    typeof pendingRevision !== 'number'
    || !Number.isSafeInteger(pendingRevision)
    || pendingRevision < 0
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    report: freezeDeep<RefreshFailureReport>({
      kind: 'ownership-refresh',
      ownerId,
      pendingRevision,
      sourceLabel: trimmedText(input.sourceLabel),
      reportRef: trimmedText(input.reportRef),
      reportedAt: trimmedText(input.reportedAt),
    }),
  }
}

function planReport<T extends RecoveryReport>(
  report: T | null,
  ownerId: string,
): RecoveryReportPlan<T> {
  if (!report) return { status: 'missing', report: null }
  const currentOwner = ownerId.trim()
  if (currentOwner && report.ownerId !== currentOwner) {
    return { status: 'owner-mismatch', report }
  }
  return { status: 'available', report }
}

export function planDriftReportPrefill(
  input: unknown,
  ownerId: string,
): RecoveryReportPlan<DriftRecoveryReport> {
  const parsed = normalizeDriftRecoveryReport(input)
  if (!parsed.ok) {
    return { status: input == null ? 'missing' : 'invalid', report: null }
  }
  return planReport(parsed.report, ownerId)
}

export function planRefreshReportPrefill(
  input: unknown,
  ownerId: string,
): RecoveryReportPlan<RefreshFailureReport> {
  const parsed = normalizeRefreshFailureReport(input)
  if (!parsed.ok) {
    return { status: input == null ? 'missing' : 'invalid', report: null }
  }
  return planReport(parsed.report, ownerId)
}

export function driftReportMatches(
  report: DriftRecoveryReport,
  ownerId: string,
  recoveryId: string,
  driftRevision: number | null,
): boolean {
  return report.ownerId === ownerId.trim()
    && report.recoveryId === recoveryId.trim()
    && report.driftRevision === driftRevision
}

export function refreshReportMatches(
  report: RefreshFailureReport,
  ownerId: string,
  pendingRevision: number | null,
): boolean {
  return report.ownerId === ownerId.trim()
    && report.pendingRevision === pendingRevision
}

export function originFromDriftReport(report: DriftRecoveryReport): RecoveryOrigin {
  return originFromReport(report)
}

export function originFromRefreshReport(report: RefreshFailureReport): RecoveryOrigin {
  return originFromReport(report)
}

/* ------------------------------------------------------------------------- */
/* Review, consequences and submissions                                      */
/* ------------------------------------------------------------------------- */

function pushFact(
  facts: RecoveryFact[],
  labelKey: string,
  value: string | null,
  mono = false,
) {
  if (value === null || value.trim() === '') return
  facts.push({ labelKey, value, mono })
}

function pushOrigin(facts: RecoveryFact[], origin: RecoveryOrigin, t: Translate) {
  facts.push({
    labelKey: 'recovery.snapshot.origin',
    value: t(origin.kind === 'report' ? 'recovery.snapshot.originReport' : 'recovery.snapshot.originManual'),
  })
  pushFact(facts, 'recovery.snapshot.reportSource', origin.reportSource)
  pushFact(facts, 'recovery.snapshot.reportRef', origin.reportRef, true)
  pushFact(facts, 'recovery.snapshot.reportedAt', origin.reportedAt)
}

export function sourceChangeSnapshotFacts(
  snapshot: SourceChangeTargetSnapshot,
  t: Translate,
): RecoveryFact[] {
  const facts: RecoveryFact[] = []
  pushFact(facts, 'audit.ownerId', snapshot.ownerId, true)
  pushFact(facts, 'audit.workbench.operations.operator', snapshot.operatorId, true)
  pushFact(facts, 'audit.workbench.sourceChange.notificationId', snapshot.notificationId, true)
  facts.push({
    labelKey: 'recovery.snapshot.scope',
    value: t(snapshot.scope === 'whole-file' ? 'recovery.scope.wholeFile' : 'recovery.scope.cells'),
  })
  if (snapshot.scope === 'cells') {
    pushFact(facts, 'recovery.scope.cellCount', String(snapshot.tupleCount))
    pushFact(facts, 'recovery.scope.payloadBytes', String(snapshot.payloadBytes))
  }
  pushFact(facts, 'recovery.snapshot.requestRef', snapshot.requestRef, true)
  pushFact(facts, 'recovery.snapshot.capturedAt', snapshot.capturedAt, true)
  return facts
}

export function driftSnapshotFacts(
  snapshot: DriftTargetSnapshot,
  t: Translate,
): RecoveryFact[] {
  const facts: RecoveryFact[] = []
  pushFact(facts, 'audit.ownerId', snapshot.ownerId, true)
  pushFact(facts, 'audit.workbench.operations.operator', snapshot.operatorId, true)
  pushFact(facts, 'audit.workbench.drift.recoveryId', snapshot.recoveryId, true)
  pushFact(facts, 'audit.workbench.drift.driftRevision', String(snapshot.driftRevision))
  pushOrigin(facts, snapshot.origin, t)
  pushFact(facts, 'recovery.snapshot.requestRef', snapshot.requestRef, true)
  pushFact(facts, 'recovery.snapshot.capturedAt', snapshot.capturedAt, true)
  return facts
}

export function refreshSnapshotFacts(
  snapshot: RefreshTargetSnapshot,
  t: Translate,
): RecoveryFact[] {
  const facts: RecoveryFact[] = []
  pushFact(facts, 'ownership.ownerId', snapshot.ownerId, true)
  pushFact(facts, 'audit.workbench.operations.operator', snapshot.operatorId, true)
  pushFact(
    facts,
    'ownership.workbench.refresh.pendingRevision',
    String(snapshot.pendingRevision),
  )
  pushFact(facts, 'ownership.workbench.refresh.reason', snapshot.reason)
  pushOrigin(facts, snapshot.origin, t)
  pushFact(facts, 'recovery.snapshot.requestRef', snapshot.requestRef, true)
  pushFact(facts, 'recovery.snapshot.capturedAt', snapshot.capturedAt, true)
  return facts
}

export function sourceChangeConsequenceKeys(
  snapshot: SourceChangeTargetSnapshot,
): string[] {
  return [
    snapshot.scope === 'whole-file'
      ? 'recovery.confirm.sourceWholeFile'
      : 'recovery.confirm.sourceCells',
    'recovery.confirm.sourceAsync',
    'recovery.confirm.sourceIdempotency',
  ]
}

export function driftConsequenceKeys(): string[] {
  return [
    'recovery.confirm.driftDecision',
    'recovery.confirm.driftIsolation',
    'recovery.confirm.driftAsync',
    'recovery.confirm.driftConflict',
  ]
}

export function refreshConsequenceKeys(): string[] {
  return [
    'recovery.confirm.refreshRearm',
    'recovery.confirm.refreshNoMutation',
    'recovery.confirm.refreshNotAutomatic',
    'recovery.confirm.refreshNeutralFalse',
  ]
}

export type RefreshRetryOutcomeKind = 'succeeded' | 'not-retried' | 'unknown'

export interface RefreshRetryOutcome {
  readonly kind: RefreshRetryOutcomeKind
  readonly headlineKey: string
}

/**
 * Classify the retry answer without turning `retried: false` into a failure.
 * The result surface uses the kind for tone; the headline stays descriptive.
 */
export function classifyRefreshRetry(
  result: Record<string, unknown> | null | undefined,
): RefreshRetryOutcome | null {
  if (!result) return null
  if (result.retried === true) {
    return { kind: 'succeeded', headlineKey: 'ownership.workbench.refresh.retried' }
  }
  if (result.retried === false) {
    return { kind: 'not-retried', headlineKey: 'ownership.workbench.refresh.notRetried' }
  }
  return { kind: 'unknown', headlineKey: 'recovery.refresh.outcomeUnknown' }
}

export const SOURCE_CHANGE_CONFIRM_TITLE_KEY = 'recovery.confirm.sourceTitle'
export const DRIFT_CONFIRM_TITLE_KEY = 'recovery.confirm.driftTitle'
export const REFRESH_CONFIRM_TITLE_KEY = 'recovery.confirm.refreshTitle'
export const SOURCE_CHANGE_ACK_KEY = 'recovery.confirm.ackSource'
export const DRIFT_ACK_KEY = 'recovery.confirm.ackDrift'
export const REFRESH_ACK_KEY = 'recovery.confirm.ackRefresh'

/** Submission fields exclude the request ref/time; the result surface renders them. */
export interface RecoverySubmission {
  readonly fields: readonly RecoveryFact[]
  readonly submittedAt: string
  readonly requestId: string
}

function submissionFromFacts(
  facts: readonly RecoveryFact[],
  snapshot: { capturedAt: string; requestRef: string },
): RecoverySubmission {
  return Object.freeze({
    fields: Object.freeze(
      facts.filter(fact =>
        fact.labelKey !== 'recovery.snapshot.requestRef'
        && fact.labelKey !== 'recovery.snapshot.capturedAt'),
    ),
    submittedAt: snapshot.capturedAt,
    requestId: snapshot.requestRef,
  })
}

export function sourceChangeSubmission(
  snapshot: SourceChangeTargetSnapshot,
  t: Translate,
): RecoverySubmission {
  return submissionFromFacts(sourceChangeSnapshotFacts(snapshot, t), snapshot)
}

export function driftSubmission(
  snapshot: DriftTargetSnapshot,
  t: Translate,
): RecoverySubmission {
  return submissionFromFacts(driftSnapshotFacts(snapshot, t), snapshot)
}

export function refreshSubmission(
  snapshot: RefreshTargetSnapshot,
  t: Translate,
): RecoverySubmission {
  return submissionFromFacts(refreshSnapshotFacts(snapshot, t), snapshot)
}
