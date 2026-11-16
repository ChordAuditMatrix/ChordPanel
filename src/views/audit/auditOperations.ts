/**
 * Operator-action page model.
 *
 * The new audit-data, maintenance and material-GC routes all accept strict
 * request shapes and answer before the work is done. These pure helpers keep
 * the validation the page performs before a request (and the facts it may
 * claim from an answer) testable without mounting a component.
 */

import type { SourceChangeTuple } from '@/api/auditData'

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface OperationFact {
  labelKey: string
  value: string
  mono?: boolean
}

export const MAX_SOURCE_CHANGE_TUPLES = 40_000
export const MAX_SOURCE_CHANGE_TUPLE_PAYLOAD_BYTES = 8_000_000
export const MAX_SOURCE_CHANGE_NOTIFICATION_ID_BYTES = 512
export const MAX_SOURCE_CHANGE_OWNER_ID_BYTES = 512
export const MAX_SOURCE_CHANGE_ID_BYTES = 1024
export const SOURCE_CHANGE_TUPLE_OVERHEAD_BYTES = 96
export const MAX_MAINTENANCE_SELECTION_VALUES = 4096
export const MAX_MAINTENANCE_RANGE_TEXT_BYTES = 4096 * 43 + 'ranges-v1:'.length
export const MAX_UINT64 = 18_446_744_073_709_551_615n
export const MAX_PERSISTABLE_TABLE_ID = 9_223_372_036_854_775_807n
export const MAX_COLUMN_ID = 0xffff_ffff

const FORBIDDEN_SOURCE_CHANGE_FIELDS = ['dataLength', 'modifiedAt', 'payload', 'ownershipVersion']

export interface OperationFactSource {
  [key: string]: unknown
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

function decimalText(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value
  return null
}

export type SourceChangeTupleParse =
  | { ok: true; tuples: SourceChangeTuple[] | undefined; wholeFile: boolean; payloadBytes: number }
  | { ok: false; errorKey: string; errorParams?: Record<string, string> }

/**
 * Parse the optional `params.tuples` textarea.
 *
 * Empty input means "impact unknown": the request omits `tuples` and the
 * backend rebuilds the whole file. Every submitted entry is validated against
 * the wire model (persistable uint64 tableId, string rowId, unsigned columnId)
 * and the documented cardinality/payload budgets. Server-owned fields are
 * refused instead of silently dropped, exactly as the backend does.
 */
export function parseSourceChangeTuples(text: string): SourceChangeTupleParse {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, tuples: undefined, wholeFile: true, payloadBytes: 0 }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false, errorKey: 'audit.workbench.sourceChange.errors.invalidJson' }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, errorKey: 'audit.workbench.sourceChange.errors.notArray' }
  }
  if (parsed.length > MAX_SOURCE_CHANGE_TUPLES) {
    return {
      ok: false,
      errorKey: 'audit.workbench.sourceChange.errors.tooManyTuples',
      errorParams: { max: String(MAX_SOURCE_CHANGE_TUPLES) },
    }
  }
  if (parsed.length === 0) return { ok: true, tuples: undefined, wholeFile: true, payloadBytes: 0 }

  const tuples: SourceChangeTuple[] = []
  let payloadBytes = 0
  for (const [index, entry] of parsed.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.entryNotObject',
        errorParams: { index: String(index + 1) },
      }
    }
    const record = entry as Record<string, unknown>
    const forbidden = FORBIDDEN_SOURCE_CHANGE_FIELDS.find(field => field in record)
    if (forbidden) {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.forbiddenField',
        errorParams: { index: String(index + 1), field: forbidden },
      }
    }
    const tableId = decimalText(record.tableId)
    if (tableId === null || BigInt(tableId) > MAX_PERSISTABLE_TABLE_ID) {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.tableId',
        errorParams: { index: String(index + 1) },
      }
    }
    if (typeof record.rowId !== 'string') {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.rowId',
        errorParams: { index: String(index + 1) },
      }
    }
    const columnId = record.columnId
    if (typeof columnId !== 'number' || !Number.isInteger(columnId) || columnId < 0 || columnId > MAX_COLUMN_ID) {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.columnId',
        errorParams: { index: String(index + 1) },
      }
    }
    tuples.push({ tableId, rowId: record.rowId, columnId })
    payloadBytes += SOURCE_CHANGE_TUPLE_OVERHEAD_BYTES + utf8Bytes(record.rowId)
    if (payloadBytes > MAX_SOURCE_CHANGE_TUPLE_PAYLOAD_BYTES) {
      return {
        ok: false,
        errorKey: 'audit.workbench.sourceChange.errors.payloadTooLarge',
        errorParams: { max: String(MAX_SOURCE_CHANGE_TUPLE_PAYLOAD_BYTES) },
      }
    }
  }
  return { ok: true, tuples, wholeFile: false, payloadBytes }
}

/** Validate the durable `(ownerId, notificationId)` identity before admission. */
export function sourceChangeIdentityError(ownerId: string, notificationId: string): string | null {
  const owner = ownerId.trim()
  const notification = notificationId.trim()
  if (!owner) return 'audit.workbench.sourceChange.errors.ownerRequired'
  if (!notification) return 'audit.workbench.sourceChange.errors.notificationIdRequired'
  if (utf8Bytes(owner) > MAX_SOURCE_CHANGE_OWNER_ID_BYTES) {
    return 'audit.workbench.sourceChange.errors.ownerTooLong'
  }
  if (utf8Bytes(notification) > MAX_SOURCE_CHANGE_NOTIFICATION_ID_BYTES) {
    return 'audit.workbench.sourceChange.errors.notificationIdTooLong'
  }
  // The durable outbox key is `<ownerId>\x1f<notificationId>`.
  if (utf8Bytes(`${owner}\x1f${notification}`) > MAX_SOURCE_CHANGE_ID_BYTES) {
    return 'audit.workbench.sourceChange.errors.identityTooLong'
  }
  return null
}

export type BlockSelectionParse =
  | { ok: true; blockIndices: number[] }
  | { ok: false; errorKey: string; errorParams?: Record<string, string> }

/** Parse the legacy 1-based `params.blockIndices` array from operator text. */
export function parseBlockIndices(text: string): BlockSelectionParse {
  const tokens = text.trim().split(/[\s,]+/)
  if (tokens.length === 0 || tokens.some(token => token === '')) {
    return { ok: false, errorKey: 'audit.workbench.maintenance.errors.indicesEmpty' }
  }
  if (tokens.length > MAX_MAINTENANCE_SELECTION_VALUES) {
    return {
      ok: false,
      errorKey: 'audit.workbench.maintenance.errors.indicesTooMany',
      errorParams: { max: String(MAX_MAINTENANCE_SELECTION_VALUES) },
    }
  }
  const blockIndices: number[] = []
  for (const token of tokens) {
    if (!/^[1-9]\d*$/.test(token)) {
      return {
        ok: false,
        errorKey: 'audit.workbench.maintenance.errors.indexInvalid',
        errorParams: { value: token },
      }
    }
    const index = Number(token)
    if (!Number.isSafeInteger(index)) {
      return {
        ok: false,
        errorKey: 'audit.workbench.maintenance.errors.indexUnrepresentable',
        errorParams: { value: token },
      }
    }
    blockIndices.push(index)
  }
  return { ok: true, blockIndices }
}

export type BlockRangesParse =
  | { ok: true; blockRanges: string }
  | { ok: false; errorKey: string; errorParams?: Record<string, string> }

/**
 * Validate the canonical `ranges-v1:<first>+<count>[,...]` text.
 *
 * The backend accepts only canonical ascending, non-overlapping, non-adjacent
 * (already merged) ranges; sending anything else would answer 400, so the page
 * checks the same shape before it dispatches an operator action.
 */
export function parseBlockRanges(text: string): BlockRangesParse {
  const encoded = text.trim()
  if (!encoded) return { ok: false, errorKey: 'audit.workbench.maintenance.errors.rangesEmpty' }
  if (utf8Bytes(encoded) > MAX_MAINTENANCE_RANGE_TEXT_BYTES) {
    return { ok: false, errorKey: 'audit.workbench.maintenance.errors.rangesTooLong' }
  }
  const prefix = 'ranges-v1:'
  if (!encoded.startsWith(prefix)) {
    return { ok: false, errorKey: 'audit.workbench.maintenance.errors.rangesPrefix' }
  }
  const body = encoded.slice(prefix.length)
  if (!body) return { ok: false, errorKey: 'audit.workbench.maintenance.errors.rangesEmpty' }
  const tokens = body.split(',')
  if (tokens.length > MAX_MAINTENANCE_SELECTION_VALUES || tokens.some(token => token === '')) {
    return {
      ok: false,
      errorKey: tokens.length > MAX_MAINTENANCE_SELECTION_VALUES
        ? 'audit.workbench.maintenance.errors.rangesTooMany'
        : 'audit.workbench.maintenance.errors.rangesMalformed',
      ...(tokens.length > MAX_MAINTENANCE_SELECTION_VALUES
        ? { errorParams: { max: String(MAX_MAINTENANCE_SELECTION_VALUES) } }
        : {}),
    }
  }
  let previousEnd = 0n
  for (const [index, token] of tokens.entries()) {
    const parts = token.split('+')
    if (parts.length !== 2 || !/^[1-9]\d*$/.test(parts[0]) || !/^[1-9]\d*$/.test(parts[1])) {
      return {
        ok: false,
        errorKey: 'audit.workbench.maintenance.errors.rangesMalformed',
        errorParams: { value: token },
      }
    }
    const first = BigInt(parts[0])
    const count = BigInt(parts[1])
    if (first > MAX_UINT64 || count > MAX_UINT64 || first + count > MAX_UINT64) {
      return {
        ok: false,
        errorKey: 'audit.workbench.maintenance.errors.rangesUnrepresentable',
        errorParams: { value: token },
      }
    }
    if (index > 0 && first <= previousEnd) {
      return {
        ok: false,
        errorKey: first === previousEnd
          ? 'audit.workbench.maintenance.errors.rangesUnmerged'
          : 'audit.workbench.maintenance.errors.rangesOverlap',
        errorParams: { value: token },
      }
    }
    previousEnd = first + count
  }
  // Valid text already is the canonical text; it is sent verbatim.
  return { ok: true, blockRanges: encoded }
}

function pushFact(facts: OperationFact[], labelKey: string, value: unknown, mono = false) {
  if (typeof value === 'string' && value.trim() === '') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return
  } else if (typeof value !== 'string') {
    return
  }
  facts.push({ labelKey, value: String(value), mono })
}

function booleanLabel(value: unknown, t: Translate): string | null {
  if (typeof value !== 'boolean') return null
  return value ? t('common.yes') : t('common.no')
}

/** Facts of the 202 source-change admission answer. */
export function sourceChangeFacts(result: OperationFactSource, _t: Translate): OperationFact[] {
  const facts: OperationFact[] = []
  pushFact(facts, 'audit.workbench.operations.facts.jobId', result.jobId, true)
  pushFact(facts, 'audit.workbench.operations.facts.statusUrl', result.statusUrl, true)
  return facts
}

/** Facts of the 200 drift-baseline decision answer. */
export function driftApprovalFacts(result: OperationFactSource, _t: Translate): OperationFact[] {
  const facts: OperationFact[] = []
  pushFact(facts, 'audit.workbench.operations.facts.ownerId', result.ownerId, true)
  pushFact(facts, 'audit.workbench.operations.facts.recoveryId', result.recoveryId, true)
  pushFact(facts, 'audit.workbench.operations.facts.driftRevision', result.driftRevision)
  pushFact(facts, 'audit.workbench.operations.facts.baselineDecision', result.baselineDecision)
  return facts
}

/** Facts of the 202 maintenance dispatch answer. */
export function maintenanceFacts(result: OperationFactSource, t: Translate): OperationFact[] {
  const facts: OperationFact[] = []
  pushFact(facts, 'audit.workbench.operations.facts.jobId', result.jobId, true)
  pushFact(facts, 'audit.workbench.operations.facts.algorithmId', result.algorithmId, true)
  pushFact(facts, 'audit.workbench.operations.facts.fileId', result.fileId, true)
  const op = typeof result.maintenanceOp === 'string' ? result.maintenanceOp : ''
  const opKey = op === 'Update'
    ? 'audit.workbench.maintenance.ops.update'
    : op === 'Insert'
      ? 'audit.workbench.maintenance.ops.insert'
      : op === 'Delete'
        ? 'audit.workbench.maintenance.ops.delete'
        : ''
  pushFact(facts, 'audit.workbench.operations.facts.maintenanceOp', opKey ? t(opKey) : op)
  pushFact(facts, 'audit.workbench.operations.facts.dispatchStatus', result.status)
  pushFact(facts, 'audit.workbench.operations.facts.dispatchMessage', result.message)
  return facts
}

/** Facts of one bounded 200 material-GC pass report. */
export function materialGcPassFacts(result: OperationFactSource, t: Translate): OperationFact[] {
  const facts: OperationFact[] = []
  pushFact(facts, 'audit.workbench.materialGc.facts.versionsExamined', result.versionsExamined)
  pushFact(facts, 'audit.workbench.materialGc.facts.versionsRetired', result.versionsRetired)
  const moreWork = booleanLabel(result.moreWorkPending, t)
  if (moreWork !== null) {
    pushFact(facts, 'audit.workbench.materialGc.facts.moreWorkPending', moreWork)
  }
  const cursor = typeof result.nextLifecycleCursor === 'string' && result.nextLifecycleCursor.trim() !== ''
    ? result.nextLifecycleCursor
    : t('common.notAvailable')
  pushFact(facts, 'audit.workbench.materialGc.facts.nextLifecycleCursor', cursor, true)
  return facts
}

export interface MaterialGcReportRow {
  ownerId: string
  algorithmId: string
  versionId: string
  jobId: string
  step: string
  outcome: string
  detail: string
}

/** Diagnostic report rows of a pass answer, in the order the backend sent them. */
export function materialGcReportRows(result: OperationFactSource): MaterialGcReportRow[] {
  if (!Array.isArray(result.reports)) return []
  const rows: MaterialGcReportRow[] = []
  for (const entry of result.reports) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const text = (value: unknown): string => typeof value === 'string' ? value : ''
    rows.push({
      ownerId: text(record.ownerId),
      algorithmId: text(record.algorithmId),
      versionId: text(record.versionId),
      jobId: text(record.jobId),
      step: text(record.step),
      outcome: text(record.outcome),
      detail: text(record.detail),
    })
  }
  return rows
}

/** Facts of the 202/200 material-GC re-arm answer. */
export function materialGcRearmFacts(result: OperationFactSource, t: Translate): OperationFact[] {
  const facts: OperationFact[] = []
  const outcome = typeof result.outcome === 'string' ? result.outcome : ''
  const outcomeLabel = outcome === 'Created'
    ? t('audit.workbench.materialGc.rearmOutcomes.created')
    : outcome === 'AlreadyActive'
      ? t('audit.workbench.materialGc.rearmOutcomes.alreadyActive')
      : outcome === 'Blocked'
        ? t('audit.workbench.materialGc.rearmOutcomes.blocked')
        : outcome
  pushFact(facts, 'audit.workbench.operations.facts.outcome', outcomeLabel)
  pushFact(facts, 'audit.workbench.operations.facts.jobId', result.jobId, true)
  pushFact(facts, 'audit.workbench.operations.facts.anchorJobId', result.anchorJobId, true)
  pushFact(facts, 'audit.workbench.operations.facts.detail', result.detail)
  return facts
}

/** Backend error message when present, otherwise the raw error text. */
export function operationErrorMessage(error: unknown): string {
  const responseMessage = (error as { response?: { data?: { message?: unknown } } } | null)
    ?.response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage.trim() !== '') return responseMessage
  if (error instanceof Error) return error.message
  return String(error)
}
