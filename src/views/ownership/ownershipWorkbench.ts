import { LosslessNumber, stringify as stringifyLossless } from 'lossless-json'
import { parseOwnershipJson } from '@/api/ownership'

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface SummaryFact {
  labelKey: string
  value: string
  mono?: boolean
}

export interface OwnershipPathInput {
  ownerId: string
  tableId?: string
  tableName?: string
  tableScope?: boolean
  rowId?: string
  columnId?: string
}

export interface OwnershipPathSegment {
  key: 'owner' | 'table' | 'row' | 'cell'
  label: string
  value: string
  raw: string
  copyable: boolean
  mono: boolean
  missing: boolean
}

export type ProofParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reasonKey: string }

const ROW_ID_KEYS: Record<string, true> = { rowId: true, rid: true, rowIdFrom: true, rowIdTo: true }
const PENDING_TABLE = '[object Object]'

/** Exact scalar text. LosslessNumber keeps its digits; objects never stringify to junk. */
function scalarText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const text = String(value)
    return text === PENDING_TABLE ? '' : text
  }
  return ''
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

function pushFact(facts: SummaryFact[], labelKey: string, value: string, mono = false) {
  if (value === '') return
  facts.push({ labelKey, value, mono })
}

function pushField(facts: SummaryFact[], source: Record<string, unknown>, field: string, labelKey: string, mono = false) {
  if (!hasValue(source[field])) return
  pushFact(facts, labelKey, scalarText(source[field]), mono)
}

/** Row ids are exact text: an empty row id is a real target, not a missing field. */
function pushRowId(facts: SummaryFact[], source: Record<string, unknown>, field: string, labelKey: string) {
  const value = source[field]
  if (typeof value !== 'string') return
  facts.push({ labelKey, value: value === '' ? '""' : value, mono: true })
}

function booleanLabel(value: unknown, t: Translate): string {
  if (value === true || value === 'true') return t('common.yes')
  if (value === false || value === 'false') return t('common.no')
  return ''
}

function proofTypeLabel(value: string, t: Translate): string {
  if (value === 'membership') return t('ownership.membership')
  if (value === 'non-membership') return t('ownership.nonMembership')
  return value
}

/** Readable summary of a membership / non-membership proof response. */
export function proofSummaryFacts(result: Record<string, unknown>, t: Translate): SummaryFact[] {
  const facts: SummaryFact[] = []
  const proofType = scalarText(result.proofType)
  if (proofType) facts.push({ labelKey: 'ownership.proofType', value: proofTypeLabel(proofType, t) })
  pushField(facts, result, 'ownerId', 'ownership.ownerId', true)
  pushField(facts, result, 'tableId', 'ownership.tableId', true)
  pushRowId(facts, result, 'rowId', 'ownership.rowId')
  pushField(facts, result, 'columnId', 'ownership.columnId', true)

  const layers = Array.isArray(result.layers) ? result.layers : null
  const allColumnIds = Array.isArray(result.allColumnIds) ? result.allColumnIds : null
  if (allColumnIds) {
    facts.push({ labelKey: 'ownership.workbench.proof.summaryColumns', value: String(allColumnIds.length) })
    const targetColumn = scalarText(result.columnId)
    if (targetColumn !== '') {
      const present = allColumnIds.some(columnId => scalarText(columnId) === targetColumn)
      facts.push({
        labelKey: 'ownership.workbench.proof.summaryTargetPresent',
        value: present ? t('common.yes') : t('common.no'),
      })
    }
  }
  if (layers) {
    facts.push({ labelKey: 'ownership.workbench.proof.summaryLayerCount', value: String(layers.length) })
    const reachesRoot = layers.some(layer => Boolean(layer) && typeof layer === 'object'
      && (layer as Record<string, unknown>).isRootLayer === true)
    if (layers.length > 0) {
      facts.push({
        labelKey: 'ownership.workbench.proof.summaryRootLayer',
        value: reachesRoot ? t('common.yes') : t('common.no'),
      })
    }
  }

  pushField(facts, result, 'missingDimension', 'ownership.workbench.proof.summaryMissingDimension')
  if (Array.isArray(result.targetKeys) && result.targetKeys.length > 0) {
    facts.push({ labelKey: 'ownership.workbench.proof.summaryNumericKeys', value: String(result.targetKeys.length) })
  }
  if (Array.isArray(result.targetStringKeys) && result.targetStringKeys.length > 0) {
    facts.push({ labelKey: 'ownership.workbench.proof.summaryStringKeys', value: String(result.targetStringKeys.length) })
  }
  if (typeof result.targetIsOidRoot === 'boolean') {
    facts.push({
      labelKey: 'ownership.workbench.proof.summaryOidRoot',
      value: result.targetIsOidRoot ? t('common.yes') : t('common.no'),
    })
  }
  if (Array.isArray(result.targetChildHashes) && result.targetChildHashes.length > 0) {
    facts.push({ labelKey: 'ownership.workbench.proof.summaryChildHashes', value: String(result.targetChildHashes.length) })
  }

  return facts
}

export type VerificationVerdict = 'valid' | 'invalid' | 'unknown'

function verdictValue(value: unknown): VerificationVerdict {
  if (value === true || value === 'true') return 'valid'
  if (value === false || value === 'false') return 'invalid'
  return 'unknown'
}

export function verificationVerdict(result: Record<string, unknown> | null | undefined): VerificationVerdict {
  if (!result) return 'unknown'
  if (result.valid === true) return 'valid'
  if (result.valid === false) return 'invalid'
  return 'unknown'
}

/** Identity members echoed inside a submitted proof. Row ids stay exact text. */
export function proofIdentityFacts(proof: Record<string, unknown>): SummaryFact[] {
  const facts: SummaryFact[] = []
  pushField(facts, proof, 'ownerId', 'ownership.ownerId', true)
  pushField(facts, proof, 'tableId', 'ownership.tableId', true)
  pushRowId(facts, proof, 'rowId', 'ownership.rowId')
  pushField(facts, proof, 'columnId', 'ownership.columnId', true)
  pushField(facts, proof, 'tableIdFrom', 'ownership.tableIdFrom', true)
  pushField(facts, proof, 'tableIdTo', 'ownership.tableIdTo', true)
  pushRowId(facts, proof, 'rowIdFrom', 'ownership.rowIdFrom')
  pushRowId(facts, proof, 'rowIdTo', 'ownership.rowIdTo')
  return facts
}

export interface JobOutcomeSource {
  status?: string
  metadata?: Record<string, unknown>
}

/** Facts the job itself recorded. Nothing is shown until the job returns metadata. */
export function jobMetadataFacts(job: JobOutcomeSource | null | undefined, t: Translate): SummaryFact[] {
  const metadata = job?.metadata
  if (!metadata) return []
  const facts: SummaryFact[] = []
  pushField(facts, metadata, 'cellsImported', 'ownership.workbench.jobMeta.cellsImported')
  pushField(facts, metadata, 'cellCount', 'ownership.workbench.jobMeta.cellCount')
  const overwrite = booleanLabel(metadata.overwrite, t)
  if (overwrite) facts.push({ labelKey: 'ownership.workbench.jobMeta.overwrite', value: overwrite })
  pushField(facts, metadata, 'tableIdFrom', 'ownership.workbench.jobMeta.tableFrom', true)
  pushField(facts, metadata, 'tableIdTo', 'ownership.workbench.jobMeta.tableTo', true)
  pushField(facts, metadata, 'rowIdFrom', 'ownership.workbench.jobMeta.rowFrom', true)
  pushField(facts, metadata, 'rowIdTo', 'ownership.workbench.jobMeta.rowTo', true)

  const deleted = booleanLabel(metadata.deleted, t)
  if (deleted) facts.push({ labelKey: 'ownership.workbench.jobMeta.treeDeleted', value: deleted })

  // Job metadata keeps the range verdict as the string "true"/"false".
  const verdict = verdictValue(metadata._verificationResult ?? metadata.valid)
  if (verdict === 'valid') facts.push({ labelKey: 'ownership.workbench.jobMeta.verdict', value: t('ownership.workbench.verify.valid') })
  else if (verdict === 'invalid') facts.push({ labelKey: 'ownership.workbench.jobMeta.verdict', value: t('ownership.workbench.verify.invalid') })

  const rootHash = scalarText(metadata._rootHash) || scalarText(metadata.rootHash)
  if (rootHash) facts.push({ labelKey: 'ownership.workbench.jobMeta.rootHash', value: rootHash, mono: true })

  if (hasValue(metadata._allTableIds)) {
    const tableCount = exactArrayLength(metadata._allTableIds)
    if (tableCount !== null) facts.push({ labelKey: 'ownership.workbench.jobMeta.tableCount', value: String(tableCount) })
  }
  if (hasValue(metadata._rangeProof)) {
    facts.push({ labelKey: 'ownership.workbench.jobMeta.rangeProofReady', value: t('common.yes') })
  }
  pushField(facts, metadata, 'error', 'ownership.workbench.jobMeta.error')
  return facts
}

function exactArrayLength(value: unknown): number | null {
  if (Array.isArray(value)) return value.length
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.length : null
  } catch {
    return null
  }
}

export type CellMutation = 'add' | 'remove' | 'move'
export type BulkOperation = 'import' | 'export'
export type TreeOperation = 'create' | 'delete'

export function cellMutationFacts(result: Record<string, unknown>, operation: CellMutation): SummaryFact[] {
  const facts: SummaryFact[] = []
  if (operation === 'move') {
    pushField(facts, result, 'sourceOwnerId', 'ownership.workbench.mutation.sourceOwner', true)
    pushField(facts, result, 'targetOwnerId', 'ownership.workbench.mutation.targetOwner', true)
    pushField(facts, result, 'cellsMoved', 'ownership.workbench.mutation.submittedCells')
    pushField(facts, result, 'sourceRootHash', 'ownership.workbench.mutation.sourceRootHash', true)
    pushField(facts, result, 'targetRootHash', 'ownership.workbench.mutation.targetRootHash', true)
    return facts
  }
  pushField(facts, result, 'ownerId', 'ownership.mutation.owner', true)
  if (operation === 'add') pushField(facts, result, 'cellsAdded', 'ownership.workbench.mutation.submittedCells')
  else pushField(facts, result, 'cellsRemoved', 'ownership.workbench.mutation.submittedCells')
  pushField(facts, result, 'rootHash', 'ownership.workbench.mutation.rootHash', true)
  return facts
}

export function treeFacts(result: Record<string, unknown>, operation: TreeOperation, t: Translate): SummaryFact[] {
  const facts: SummaryFact[] = []
  pushField(facts, result, 'ownerId', 'ownership.mutation.owner', true)
  if (operation === 'create') {
    pushField(facts, result, 'rootHash', 'ownership.workbench.mutation.rootHash', true)
    pushField(facts, result, 'rootNodeId', 'ownership.workbench.mutation.rootNodeId', true)
    return facts
  }
  const deleted = booleanLabel(result.deleted, t)
  if (deleted) facts.push({ labelKey: 'ownership.workbench.mutation.deleted', value: deleted })
  return facts
}

export function treeDeleteNotice(result: Record<string, unknown> | null): string | null {
  return result?.deleted === false ? 'ownership.workbench.manage.deleteNoTree' : null
}

export function asyncOperationFacts(result: Record<string, unknown>): SummaryFact[] {
  const facts: SummaryFact[] = []
  pushField(facts, result, 'ownerId', 'ownership.mutation.owner', true)
  return facts
}

export function resultJobId(result: unknown): string | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const jobId = (result as Record<string, unknown>).jobId
  return typeof jobId === 'string' && jobId !== '' ? jobId : null
}

/** Route used by ownership results to open the exact backend-returned Job. */
export function ownershipJobPath(jobId: string): string {
  return `/executions/${encodeURIComponent(jobId)}`
}

/** Backend error message when present, otherwise the raw error text. */
export function requestErrorMessage(error: unknown): string {
  const detail = error as { response?: { data?: { message?: string; error?: string } } }
  return detail?.response?.data?.message || detail?.response?.data?.error || String(error)
}

export function ownershipPathSegments(input: OwnershipPathInput, t: Translate): OwnershipPathSegment[] {
  const tableId = input.tableId?.trim() ?? ''
  const tableName = input.tableName?.trim() ?? ''
  const hasOwner = Boolean(input.ownerId.trim())
  let tableValue = ''
  if (tableId) tableValue = tableName ? `${tableName} · ${tableId}` : tableId
  else if (hasOwner && !input.tableScope) tableValue = t('ownership.workbench.query.allTables')
  const tableMissing = !tableId && (!hasOwner || Boolean(input.tableScope))

  return [
    {
      key: 'owner',
      label: t('ownership.workbench.query.ownerPath'),
      value: input.ownerId.trim() || t('ownership.workbench.query.notSelected'),
      raw: input.ownerId.trim(),
      copyable: hasOwner,
      mono: true,
      missing: !hasOwner,
    },
    {
      key: 'table',
      label: t('ownership.workbench.query.tablePath'),
      value: tableValue || t('ownership.workbench.query.notSelected'),
      raw: tableId,
      copyable: Boolean(tableId),
      mono: !tableName,
      missing: tableMissing,
    },
    {
      key: 'row',
      label: t('ownership.workbench.query.rowPath'),
      value: input.rowId === undefined
        ? t('ownership.workbench.query.notSelected')
        : input.rowId === '' ? '""' : input.rowId,
      raw: input.rowId ?? '',
      copyable: input.rowId !== undefined && input.rowId !== '',
      mono: true,
      missing: input.rowId === undefined,
    },
    {
      key: 'cell',
      label: t('ownership.workbench.query.cellPath'),
      value: input.columnId ?? t('ownership.workbench.query.notSelected'),
      raw: input.columnId ?? '',
      copyable: input.columnId !== undefined,
      mono: true,
      missing: input.columnId === undefined,
    },
  ]
}

/** Canonical ASCII path for clipboard use; values stay unambiguous. */
export function ownershipPathText(input: OwnershipPathInput): string {
  const parts = [`ownerId=${input.ownerId.trim()}`]
  if (input.tableId) parts.push(`tableId=${input.tableId}`)
  if (input.rowId !== undefined) parts.push(`rowId=${JSON.stringify(input.rowId)}`)
  if (input.columnId !== undefined) parts.push(`columnId=${input.columnId}`)
  return parts.join('; ')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function findNonStringRowId(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(findNonStringRowId)
  if (!isPlainObject(value)) return false
  return Object.entries(value).some(([key, item]) => (ROW_ID_KEYS[key] === true && typeof item !== 'string')
    || findNonStringRowId(item))
}

/** Parse proof text exactly, then check only the shape this page submits. */
export function parseProofInput(text: string): ProofParseResult {
  if (text.trim() === '') return { ok: false, reasonKey: 'ownership.workbench.verify.emptyInput' }
  let parsed: unknown
  try {
    parsed = parseOwnershipJson(text)
  } catch {
    return { ok: false, reasonKey: 'ownership.workbench.verify.invalidJson' }
  }
  if (!isPlainObject(parsed)) return { ok: false, reasonKey: 'ownership.workbench.verify.notObject' }
  if (findNonStringRowId(parsed)) return { ok: false, reasonKey: 'ownership.workbench.verify.rowIdNotString' }
  return { ok: true, value: parsed }
}

const losslessNumberStringifiers = [{
  test: (value: unknown) => value instanceof LosslessNumber,
  stringify: (value: unknown) => (value as LosslessNumber).toString(),
}]

/** JSON text for evidence display and local download; numeric literals keep their digits. */
export function exactJsonText(value: unknown): string {
  try {
    return stringifyLossless(value, undefined, 2, losslessNumberStringifiers) ?? ''
  } catch {
    return String(value)
  }
}

export function fileSizeLabel(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    return false
  }
  return false
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
