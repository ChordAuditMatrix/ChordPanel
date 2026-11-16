/**
 * Dynamic maintenance and deployment-level material-GC operator model.
 *
 * These helpers keep the page's contract decisions testable without mounting a
 * component: 1-based selection preview and canonicalization, immutable target
 * snapshots, actual HTTP/business outcome classification, cursor continuation,
 * report-row re-arm prefill and owner-bound Audit algorithm bindings.
 */

import type {
  AuditMaintenanceOp,
  MaterialGcPassResult,
  MaterialGcRearmResult,
} from '@/api/audit'
import type {
  OperationOutcomeKind,
  OperationSubmissionField,
  OperationSubmissionSnapshot,
} from '@/components/operationResult'
import {
  parseBlockIndices,
  parseBlockRanges,
  type BlockRangesParse,
  type BlockSelectionParse,
  type OperationFact,
  type Translate,
} from './auditOperations'

export type {
  OperationOutcomeKind,
  OperationSubmissionField,
  OperationSubmissionSnapshot,
}

export type MaintenanceAlgorithmMode = 'automatic' | 'explicit'
export type MaintenanceSelectionMode = 'indices' | 'ranges'

function freezeFields(fields: readonly OperationSubmissionField[]): readonly OperationSubmissionField[] {
  return Object.freeze(fields.map(field => Object.freeze({ ...field })))
}

/** Capture the submitted target once, before the request is awaited. */
export function buildOperationSubmission(
  fields: readonly OperationSubmissionField[],
  submittedAt = new Date().toISOString(),
): OperationSubmissionSnapshot {
  return Object.freeze({ fields: freezeFields(fields), submittedAt })
}

// ---------------------------------------------------------------------------
// 1-based block selection and preview
// ---------------------------------------------------------------------------

export interface BlockRangeSpan {
  readonly first: bigint
  readonly count: bigint
}

export interface BlockSelectionPreview {
  readonly mode: MaintenanceSelectionMode
  /** Canonical `ranges-v1:` text, also used as the preview of the union. */
  readonly canonicalRanges: string
  readonly blockCountText: string
  readonly rangeCount: number
  readonly firstBlockText: string
  readonly lastBlockText: string
  /** Raw 1-based indices for the compact chip preview (indices mode only). */
  readonly indices: readonly number[]
  /** The input was sorted/de-duplicated before this canonical preview. */
  readonly normalized: boolean
  readonly inputValueCount: number
}

export interface BlockSelection {
  readonly preview: BlockSelectionPreview
  /** Exactly one of these is sent, matching the chosen editor. */
  readonly blockIndices?: readonly number[]
  readonly blockRanges?: string
}

export type BlockSelectionBuild =
  | { ok: true; selection: BlockSelection }
  | { ok: false; errorKey: string; errorParams?: Record<string, string> }

function rangesFromIndices(indices: readonly number[]): BlockRangeSpan[] {
  const spans: { first: bigint; count: bigint }[] = []
  for (const index of indices) {
    const value = BigInt(index)
    const previous = spans[spans.length - 1]
    if (previous && previous.first + previous.count === value) {
      previous.count += 1n
    } else {
      spans.push({ first: value, count: 1n })
    }
  }
  return spans
}

function encodeRanges(spans: readonly BlockRangeSpan[]): string {
  return `ranges-v1:${spans.map(span => `${span.first}+${span.count}`).join(',')}`
}

function previewFromSpans(
  mode: MaintenanceSelectionMode,
  spans: readonly BlockRangeSpan[],
  indices: readonly number[],
  normalized: boolean,
  inputValueCount: number,
): BlockSelectionPreview {
  let blockCount = 0n
  let first: bigint | null = null
  let last: bigint | null = null
  for (const span of spans) {
    blockCount += span.count
    if (first === null) first = span.first
    last = span.first + span.count - 1n
  }
  return Object.freeze({
    mode,
    canonicalRanges: encodeRanges(spans),
    blockCountText: blockCount.toString(),
    rangeCount: spans.length,
    firstBlockText: first === null ? '' : first.toString(),
    lastBlockText: last === null ? '' : last.toString(),
    indices: Object.freeze([...indices]),
    normalized,
    inputValueCount,
  })
}

/** Build the exact selection that will be sent, plus a 1-based preview. */
export function buildBlockSelection(
  mode: MaintenanceSelectionMode,
  indicesText: string,
  rangesText: string,
): BlockSelectionBuild {
  if (mode === 'indices') {
    const parsed: BlockSelectionParse = parseBlockIndices(indicesText)
    if (!parsed.ok) return parsed
    const input = parsed.blockIndices
    const ordered = [...new Set(input)].sort((left, right) => left - right)
    const normalized = ordered.length !== input.length
      || ordered.some((value, index) => value !== input[index])
    const spans = rangesFromIndices(ordered)
    return {
      ok: true,
      selection: Object.freeze({
        preview: previewFromSpans('indices', spans, ordered, normalized, input.length),
        blockIndices: Object.freeze([...input]),
      }),
    }
  }

  const parsed: BlockRangesParse = parseBlockRanges(rangesText)
  if (!parsed.ok) return parsed
  const spans: BlockRangeSpan[] = []
  for (const token of parsed.blockRanges.slice('ranges-v1:'.length).split(',')) {
    const [first, count] = token.split('+')
    spans.push({ first: BigInt(first), count: BigInt(count) })
  }
  return {
    ok: true,
    selection: Object.freeze({
      preview: previewFromSpans('ranges', spans, [], false, spans.length),
      blockRanges: parsed.blockRanges,
    }),
  }
}

// ---------------------------------------------------------------------------
// Immutable maintenance target + snapshot fields
// ---------------------------------------------------------------------------

export interface MaintenanceTarget {
  readonly ownerId: string
  readonly operatorId: string
  readonly algorithmMode: MaintenanceAlgorithmMode
  readonly requestedAlgorithmId: string
  readonly operation: AuditMaintenanceOp
  readonly selectionMode: MaintenanceSelectionMode
  readonly canonicalRanges: string
  readonly blockCountText: string
  readonly rangeCount: number
  readonly firstBlockText: string
  readonly lastBlockText: string
  readonly blockIndices?: readonly number[]
  readonly blockRanges?: string
}

export function buildMaintenanceTarget(input: {
  ownerId: string
  operatorId: string
  algorithmMode: MaintenanceAlgorithmMode
  requestedAlgorithmId: string
  operation: AuditMaintenanceOp
  selection: BlockSelection
}): MaintenanceTarget {
  const preview = input.selection.preview
  return Object.freeze({
    ownerId: input.ownerId.trim(),
    operatorId: input.operatorId.trim(),
    algorithmMode: input.algorithmMode,
    requestedAlgorithmId: input.requestedAlgorithmId.trim(),
    operation: input.operation,
    selectionMode: preview.mode,
    canonicalRanges: preview.canonicalRanges,
    blockCountText: preview.blockCountText,
    rangeCount: preview.rangeCount,
    firstBlockText: preview.firstBlockText,
    lastBlockText: preview.lastBlockText,
    ...(input.selection.blockIndices ? { blockIndices: Object.freeze([...input.selection.blockIndices]) } : {}),
    ...(input.selection.blockRanges ? { blockRanges: input.selection.blockRanges } : {}),
  })
}

export function maintenanceSelectionForRequest(
  target: MaintenanceTarget,
): { blockIndices: number[] } | { blockRanges: string } {
  if (target.blockRanges !== undefined) return { blockRanges: target.blockRanges }
  return { blockIndices: [...(target.blockIndices ?? [])] }
}

function operationLabel(operation: AuditMaintenanceOp, t: Translate): string {
  const key = operation === 'Update'
    ? 'audit.workbench.maintenance.ops.update'
    : operation === 'Insert'
      ? 'audit.workbench.maintenance.ops.insert'
      : 'audit.workbench.maintenance.ops.delete'
  return t(key)
}

/** The exact target shown in the confirmation dialog and the result snapshot. */
export function maintenanceTargetFields(
  target: MaintenanceTarget,
  t: Translate,
): OperationSubmissionField[] {
  const algorithmValue = target.algorithmMode === 'automatic'
    ? t('audit.workbench.maintenance.algorithmAutomaticShort')
    : target.requestedAlgorithmId
  return [
    { labelKey: 'audit.ownerId', value: target.ownerId, mono: true },
    { labelKey: 'audit.workbench.operations.operator', value: target.operatorId, mono: true },
    { labelKey: 'audit.workbench.maintenance.algorithmMode', value: t(
      target.algorithmMode === 'automatic'
        ? 'audit.workbench.maintenance.algorithmAutomatic'
        : 'audit.workbench.maintenance.algorithmExplicit',
    ) },
    { labelKey: 'audit.workbench.operations.facts.algorithmId', value: algorithmValue, mono: target.algorithmMode === 'explicit' },
    { labelKey: 'audit.workbench.maintenance.operation', value: operationLabel(target.operation, t) },
    { labelKey: 'audit.workbench.maintenance.selection', value: t(
      target.selectionMode === 'indices'
        ? 'audit.workbench.maintenance.selectionIndices'
        : 'audit.workbench.maintenance.selectionRanges',
    ) },
    { labelKey: 'audit.workbench.maintenance.previewFirst', value: target.firstBlockText },
    { labelKey: 'audit.workbench.maintenance.previewLast', value: target.lastBlockText },
    { labelKey: 'audit.workbench.maintenance.previewBlocks', value: target.blockCountText },
    { labelKey: 'audit.workbench.maintenance.previewRanges', value: String(target.rangeCount) },
    { labelKey: 'audit.workbench.maintenance.previewCanonical', value: target.canonicalRanges, mono: true },
  ]
}

export function maintenanceTargetFacts(
  target: MaintenanceTarget,
  t: Translate,
): OperationFact[] {
  return maintenanceTargetFields(target, t).map(field => ({
    labelKey: field.labelKey,
    value: field.value,
    ...(field.mono ? { mono: true } : {}),
  }))
}

export function maintenanceConsequenceKeys(target: MaintenanceTarget): string[] {
  return [
    'audit.workbench.maintenance.impactState',
    'audit.workbench.maintenance.impactJob',
    'audit.workbench.maintenance.impactStatic',
    'audit.workbench.maintenance.consequencePending',
    ...(target.algorithmMode === 'automatic'
      ? ['audit.workbench.maintenance.consequenceAutomatic']
      : []),
  ]
}

// ---------------------------------------------------------------------------
// HTTP / business semantics
// ---------------------------------------------------------------------------

export type OperationFailureKind = 'http' | 'canceled' | 'timeout' | 'network' | 'unknown'

export interface OperationFailure {
  readonly kind: OperationFailureKind
  readonly httpStatus: number | null
  readonly code: string
  readonly message: string
  readonly detail: string
}

function nonEmptyText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function freezeFailure(failure: OperationFailure): OperationFailure {
  return Object.freeze(failure)
}

/** Classify a rejected request without losing the actual HTTP/business answer. */
export function readOperationFailure(error: unknown): OperationFailure {
  const candidate = error as {
    code?: unknown
    name?: unknown
    message?: unknown
    __CANCEL__?: unknown
    response?: {
      status?: unknown
      statusText?: unknown
      data?: unknown
    }
  } | null
  const body = candidate?.response?.data
  const record = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null
  const bodyMessage = record ? nonEmptyText(record.message) : nonEmptyText(body)
  const bodyDetail = record ? nonEmptyText(record.detail) : ''
  const bodyCode = record
    ? nonEmptyText(record.error) || nonEmptyText(record.code)
    : ''
  const status = candidate?.response?.status
  const httpStatus = typeof status === 'number' && Number.isInteger(status) ? status : null
  const message = bodyMessage
    || nonEmptyText(candidate?.message)
    || nonEmptyText(candidate?.response?.statusText)
    || String(error ?? '')
  const code = bodyCode || nonEmptyText(candidate?.response?.statusText)
  const axiosCode = nonEmptyText(candidate?.code)

  if (axiosCode === 'ERR_CANCELED' || candidate?.__CANCEL__ === true || candidate?.name === 'CanceledError') {
    return freezeFailure({ kind: 'canceled', httpStatus, code, message, detail: bodyDetail })
  }
  if (httpStatus !== null) {
    return freezeFailure({ kind: 'http', httpStatus, code, message, detail: bodyDetail })
  }
  if (axiosCode === 'ECONNABORTED' || axiosCode === 'ETIMEDOUT') {
    return freezeFailure({ kind: 'timeout', httpStatus: null, code, message, detail: bodyDetail })
  }
  if (axiosCode === 'ERR_NETWORK') {
    return freezeFailure({ kind: 'network', httpStatus: null, code, message, detail: bodyDetail })
  }
  return freezeFailure({ kind: 'unknown', httpStatus: null, code, message, detail: bodyDetail })
}

export interface BusinessOutcome {
  readonly outcome: OperationOutcomeKind
  readonly businessKey: string
  readonly unexpectedStatus: boolean
}

function freezeOutcome(outcome: BusinessOutcome): BusinessOutcome {
  return Object.freeze(outcome)
}

/** Semantics of a successful maintenance 202 answer. */
export function maintenanceSuccessOutcome(httpStatus: number): BusinessOutcome {
  if (httpStatus === 202) {
    return freezeOutcome({
      outcome: 'accepted',
      businessKey: 'audit.workbench.maintenance.businessAccepted',
      unexpectedStatus: false,
    })
  }
  return freezeOutcome({
    outcome: 'succeeded',
    businessKey: 'audit.workbench.maintenance.businessUnexpectedStatus',
    unexpectedStatus: true,
  })
}

/** Semantics of a successful material-GC pass answer (200 is the contract). */
export function materialGcPassSuccessOutcome(httpStatus: number): BusinessOutcome {
  if (httpStatus === 200) {
    return freezeOutcome({
      outcome: 'succeeded',
      businessKey: 'audit.workbench.materialGc.businessPass',
      unexpectedStatus: false,
    })
  }
  return freezeOutcome({
    outcome: 'succeeded',
    businessKey: 'audit.workbench.materialGc.businessPassUnexpectedStatus',
    unexpectedStatus: true,
  })
}

/** Semantics of a successful re-arm answer: Created is 202, replay is 200. */
export function rearmSuccessOutcome(
  httpStatus: number,
  result: MaterialGcRearmResult,
): BusinessOutcome {
  if (result.outcome === 'AlreadyActive') {
    return freezeOutcome({
      outcome: 'existing',
      businessKey: 'audit.workbench.materialGc.businessAlreadyActive',
      unexpectedStatus: httpStatus !== 200,
    })
  }
  if (result.outcome === 'Created') {
    return freezeOutcome({
      outcome: 'accepted',
      businessKey: 'audit.workbench.materialGc.businessCreated',
      unexpectedStatus: httpStatus !== 202,
    })
  }
  return freezeOutcome({
    outcome: 'not-retried',
    businessKey: 'audit.workbench.materialGc.businessRearmOther',
    unexpectedStatus: httpStatus !== 200 && httpStatus !== 202,
  })
}

/** Business meaning of a definite HTTP rejection; never infer success. */
export function failureBusinessKey(failure: OperationFailure, action: 'maintenance' | 'pass' | 'rearm'): string {
  if (failure.kind === 'canceled') {
    return action === 'pass'
      ? 'audit.workbench.materialGc.businessStoppedUnknown'
      : 'audit.workbench.operations.businessUnknown'
  }
  if (failure.kind === 'timeout' || failure.kind === 'network' || failure.kind === 'unknown') {
    return action === 'pass'
      ? 'audit.workbench.materialGc.businessUnknown'
      : 'audit.workbench.operations.businessUnknown'
  }
  if (action === 'pass' && failure.httpStatus === 409 && failure.code === 'MaterialGcPassInProgress') {
    return 'audit.workbench.materialGc.businessPassInProgress'
  }
  if (action === 'rearm' && failure.httpStatus === 409 && failure.code === 'MaterialGcRearmBlocked') {
    return 'audit.workbench.materialGc.businessRearmBlocked'
  }
  if ((action === 'pass' || action === 'rearm') && failure.httpStatus === 409 && failure.code === 'MaterialGcOperatorBusy') {
    return 'audit.workbench.materialGc.businessOperatorBusy'
  }
  if (action === 'rearm' && failure.httpStatus === 503) {
    return 'audit.workbench.materialGc.businessUnavailable'
  }
  return action === 'maintenance'
    ? 'audit.workbench.maintenance.businessFailed'
    : action === 'rearm'
      ? 'audit.workbench.materialGc.businessRearmFailed'
      : 'audit.workbench.materialGc.businessPassFailed'
}

/** Facts shared by every completed attempt: real status + business semantics. */
export function operationFacts(
  httpStatus: number,
  businessKey: string,
  t: Translate,
): OperationFact[] {
  return [
    { labelKey: 'audit.workbench.operations.facts.httpStatus', value: String(httpStatus) },
    { labelKey: 'audit.workbench.operations.facts.businessSemantics', value: t(businessKey) },
  ]
}

export function failureFacts(failure: OperationFailure, businessKey: string, t: Translate): OperationFact[] {
  const facts: OperationFact[] = [
    { labelKey: 'audit.workbench.operations.facts.businessSemantics', value: t(businessKey) },
  ]
  if (failure.httpStatus !== null) {
    facts.push({ labelKey: 'audit.workbench.operations.facts.httpStatus', value: String(failure.httpStatus) })
  }
  if (failure.code) {
    facts.push({ labelKey: 'audit.workbench.operations.facts.errorCode', value: failure.code, mono: true })
  }
  if (failure.detail) {
    facts.push({ labelKey: 'audit.workbench.operations.facts.detail', value: failure.detail })
  }
  return facts
}

// ---------------------------------------------------------------------------
// Deployment-level GC: targets, pass continuation, re-arm prefill
// ---------------------------------------------------------------------------

export interface GcPassTarget {
  readonly operatorId: string
  readonly cursor: string | null
}

export function buildGcPassTarget(operatorId: string, cursor: string): GcPassTarget {
  const trimmed = cursor.trim()
  return Object.freeze({ operatorId: operatorId.trim(), cursor: trimmed === '' ? null : trimmed })
}

export function gcPassTargetFields(target: GcPassTarget, t: Translate): OperationSubmissionField[] {
  return [
    { labelKey: 'audit.workbench.materialGc.operator', value: target.operatorId, mono: true },
    {
      labelKey: 'audit.workbench.materialGc.passCursorTarget',
      value: target.cursor ?? t('audit.workbench.materialGc.cursorFirstRow'),
      mono: target.cursor !== null,
    },
  ]
}

export interface RearmTarget {
  readonly ownerId: string
  readonly algorithmId: string
  readonly versionId: string
  readonly operatorId: string
  readonly prefilledFromReport: boolean
  readonly sourceJobId: string
}

export function buildRearmTarget(input: {
  ownerId: string
  algorithmId: string
  versionId: string
  operatorId: string
  prefilledFromReport?: boolean
  sourceJobId?: string
}): RearmTarget {
  return Object.freeze({
    ownerId: input.ownerId.trim(),
    algorithmId: input.algorithmId.trim(),
    versionId: input.versionId.trim(),
    operatorId: input.operatorId.trim(),
    prefilledFromReport: input.prefilledFromReport === true,
    sourceJobId: (input.sourceJobId ?? '').trim(),
  })
}

export function rearmTargetFields(target: RearmTarget, t: Translate): OperationSubmissionField[] {
  return [
    { labelKey: 'audit.ownerId', value: target.ownerId, mono: true },
    { labelKey: 'audit.workbench.operations.facts.algorithmId', value: target.algorithmId, mono: true },
    { labelKey: 'audit.workbench.materialGc.versionId', value: target.versionId, mono: true },
    { labelKey: 'audit.workbench.materialGc.operator', value: target.operatorId, mono: true },
    {
      labelKey: 'audit.workbench.materialGc.rearmSource',
      value: target.prefilledFromReport
        ? t('audit.workbench.materialGc.rearmSourceReport')
        : t('audit.workbench.materialGc.rearmSourceManual'),
    },
    ...(target.sourceJobId
      ? [{ labelKey: 'audit.workbench.operations.facts.anchorJobId', value: target.sourceJobId, mono: true }]
      : []),
  ]
}

export interface GcContinuation {
  readonly moreWorkPending: boolean
  readonly cursor: string | null
  readonly canContinue: boolean
}

/** Cursor continuation is a new manual request, never an automatic replay. */
export function materialGcContinuation(result: MaterialGcPassResult | null | undefined): GcContinuation {
  if (!result) return Object.freeze({ moreWorkPending: false, cursor: null, canContinue: false })
  const cursor = typeof result.nextLifecycleCursor === 'string' && result.nextLifecycleCursor.trim() !== ''
    ? result.nextLifecycleCursor.trim()
    : null
  return Object.freeze({
    moreWorkPending: result.moreWorkPending === true,
    cursor,
    canContinue: result.moreWorkPending === true && cursor !== null,
  })
}

export interface RearmPrefill {
  readonly ownerId: string
  readonly algorithmId: string
  readonly versionId: string
  readonly sourceJobId: string
}

/** Prefill only the exact identities the report row carries. */
export function rearmPrefillFromReport(row: {
  ownerId?: unknown
  algorithmId?: unknown
  versionId?: unknown
  jobId?: unknown
}): RearmPrefill | null {
  const ownerId = nonEmptyText(row.ownerId)
  const algorithmId = nonEmptyText(row.algorithmId)
  const versionId = nonEmptyText(row.versionId)
  if (!ownerId || !algorithmId || !versionId) return null
  return Object.freeze({
    ownerId,
    algorithmId,
    versionId,
    sourceJobId: nonEmptyText(row.jobId),
  })
}

export function rearmPrefillFields(prefill: RearmPrefill, t: Translate): OperationSubmissionField[] {
  return [
    { labelKey: 'audit.ownerId', value: prefill.ownerId, mono: true },
    { labelKey: 'audit.workbench.operations.facts.algorithmId', value: prefill.algorithmId, mono: true },
    { labelKey: 'audit.workbench.materialGc.versionId', value: prefill.versionId, mono: true },
    {
      labelKey: 'audit.workbench.materialGc.rearmSource',
      value: t('audit.workbench.materialGc.rearmSourceReport'),
    },
    ...(prefill.sourceJobId
      ? [{ labelKey: 'audit.workbench.operations.facts.anchorJobId', value: prefill.sourceJobId, mono: true }]
      : []),
  ]
}

/** The second GC step is always explicit, even after a successful re-arm. */
export function rearmNextStepKey(result: MaterialGcRearmResult | null | undefined): string | null {
  if (!result) return null
  if (result.outcome === 'Created' || result.outcome === 'AlreadyActive') {
    return 'audit.workbench.materialGc.nextStepAfterRearm'
  }
  return 'audit.workbench.materialGc.rearmBlockedNextStep'
}

// ---------------------------------------------------------------------------
// Owner-bound Audit algorithm bindings
// ---------------------------------------------------------------------------

export interface OwnerAuditBinding {
  readonly algorithmId: string
  readonly algorithmVersion: number | null
}

export interface OwnerAuditBindingPage {
  readonly items: readonly OwnerAuditBinding[]
  readonly total: number
  readonly totalPages: number
}

/**
 * Read `GET /v1/algorithms/bindings?userId=...&purpose=Audit`.
 * The backend filters by exact user and purpose; this also refuses rows that
 * name another owner so a stale/misrouted page can never widen the selection.
 */
export function readOwnerAuditBindingPage(
  response: unknown,
  ownerId: string,
): OwnerAuditBindingPage | null {
  if (response === null || typeof response !== 'object') return null
  const record = response as Record<string, unknown>
  if (!Array.isArray(record.items)) return null
  const owner = ownerId.trim()
  if (!owner) return null
  const seen = new Set<string>()
  const items: OwnerAuditBinding[] = []
  for (const entry of record.items) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const binding = entry as Record<string, unknown>
    if (binding.purpose !== 'Audit') continue
    if (binding.userId !== owner) continue
    if (typeof binding.algorithmId !== 'string' || binding.algorithmId.trim() === '') continue
    const algorithmId = binding.algorithmId.trim()
    if (seen.has(algorithmId)) continue
    seen.add(algorithmId)
    const version = binding.algorithmVersion
    items.push(Object.freeze({
      algorithmId,
      algorithmVersion: typeof version === 'number' && Number.isFinite(version) ? version : null,
    }))
  }
  const total = typeof record.total === 'number' && Number.isFinite(record.total) ? record.total : items.length
  const totalPages = typeof record.totalPages === 'number' && Number.isFinite(record.totalPages)
    ? record.totalPages
    : items.length > 0
      ? 1
      : 0
  return Object.freeze({ items: Object.freeze(items), total, totalPages })
}
