import type { JobTarget } from '@/api/job'
import { jobTypeLabel } from '@/utils/jobType'

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Exact stable `JobOperation` tokens published by the backend enum. A generic
 * `jobType` never selects one of these on its own.
 */
const OPERATION_KEYS: Record<string, string> = {
  AlgorithmInitialize: 'job.workbench.operation.algorithmInitialize',
  AlgorithmUserBind: 'job.workbench.operation.algorithmUserBind',
  TagGeneration: 'job.workbench.operation.tagGeneration',
  TagRegeneration: 'job.workbench.operation.regeneration',
  ChallengeProof: 'job.workbench.operation.challengeProof',
  IdentityVerification: 'job.workbench.operation.identityVerification',
  DynamicMaintenance: 'job.workbench.operation.maintenance',
  AuditTableBootstrap: 'job.workbench.operation.auditTableBootstrap',
  SourceChange: 'job.workbench.operation.sourceChange',
  LayoutPlanning: 'job.workbench.operation.layoutPlanning',
  TagRangeQuery: 'job.workbench.operation.tagRangeQuery',
  GenerateProof: 'job.workbench.operation.generateProof',
  GenerateRangeProof: 'job.workbench.operation.generateRangeProof',
  VerifyProof: 'job.workbench.operation.verifyProof',
  VerifyRangeProof: 'job.workbench.operation.verifyRangeProof',
  VerifyCell: 'job.workbench.operation.verifyCell',
  OwnershipAddCells: 'job.workbench.operation.ownershipAddCells',
  OwnershipRemoveCells: 'job.workbench.operation.ownershipRemoveCells',
  OwnershipMoveCells: 'job.workbench.operation.ownershipMoveCells',
  OwnershipQueryCells: 'job.workbench.operation.ownershipQueryCells',
  OwnershipImportCells: 'job.workbench.operation.ownershipImportCells',
  OwnershipExportCells: 'job.workbench.operation.ownershipExportCells',
  OwnershipCreateTree: 'job.workbench.operation.ownershipCreateTree',
  OwnershipDeleteTree: 'job.workbench.operation.ownershipDeleteTree',
  ResignRootHash: 'job.workbench.operation.resignRootHash',
  SignatureStorage: 'job.workbench.operation.signatureStorage',
  MaterialGc: 'job.workbench.operation.materialGc',
}

/** Queryable operation vocabulary; `Unspecified` is a document state, not an action. */
export const JOB_OPERATION_OPTIONS: ReadonlyArray<{ token: string; labelKey: string }> =
  Object.entries(OPERATION_KEYS).map(([token, labelKey]) => ({ token, labelKey }))

const CANONICAL_JOB_TYPES: Record<string, true> = {
  Audit: true,
  Query: true,
  Storage: true,
  System: true,
  Replication: true,
}

export type JobOperation =
  | { state: 'known'; token: string; labelKey: string }
  | { state: 'unknown'; token: string }
  | { state: 'absent' }

/**
 * Reads only the typed `jobOperation` field. A historical Job without one is
 * reported absent; metadata is never consulted to reconstruct an identity.
 */
export function jobOperation(job: { jobOperation?: string | null } | null | undefined): JobOperation {
  const raw = job?.jobOperation
  if (typeof raw !== 'string' || raw === '') return { state: 'absent' }
  const labelKey = OPERATION_KEYS[raw]
  return labelKey ? { state: 'known', token: raw, labelKey } : { state: 'unknown', token: raw }
}

export function jobOperationLabel(operation: JobOperation, t: Translate): string | null {
  return operation.state === 'known' ? t(operation.labelKey) : null
}

/** Reads only an explicitly persisted verification result; false is not a Job failure. */
export function jobVerification(metadata: Record<string, unknown> | null | undefined): boolean | null {
  const value = metadata?.verified
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return null
}
/** A cryptographic verdict requires an Audit Job and an exact typed operation. */
export function jobHasCryptographicVerification(
  job: { jobType?: string | null; jobOperation?: string | null } | null | undefined,
): boolean {
  if (job?.jobType !== 'Audit') return false
  const operation = jobOperation(job)
  return operation.state === 'known'
    && (operation.token === 'ChallengeProof' || operation.token === 'IdentityVerification')
}

/**
 * Formats the persisted target without inventing missing ids. An unknown
 * future kind stays visible verbatim instead of being relabeled.
 */
export function formatJobTarget(
  target: JobTarget | null | undefined,
  t: Translate,
): string | null {
  if (!target) return null
  const ownerId = typeof target.ownerId === 'string' ? target.ownerId : ''
  const algorithmId = typeof target.algorithmId === 'string' ? target.algorithmId : ''
  const kindLabels: Record<string, string> = {
    System: t('job.workbench.target.system'),
    Owner: t('job.workbench.target.owner'),
    Algorithm: t('job.workbench.target.algorithm'),
    OwnerAlgorithm: t('job.workbench.target.ownerAlgorithm'),
  }
  const kind = kindLabels[target.kind] ?? target.kind
  const ids = [ownerId, algorithmId].filter(Boolean)
  return ids.length ? `${kind}: ${ids.join(' / ')}` : kind
}

export function isCancelledJob(job: { errorCode?: string | null } | null | undefined): boolean {
  return job?.errorCode === 'Cancelled'
}

/** True only for the JobType values the backend enum publishes. */
export function isCanonicalJobType(jobType: string | null | undefined): boolean {
  return typeof jobType === 'string' && CANONICAL_JOB_TYPES[jobType] === true
}

export function jobTypeBusinessLabel(jobType: string, t: Translate, detailLoaded = false): string {
  if (isCanonicalJobType(jobType)) return jobTypeLabel(jobType, t)
  if (detailLoaded && jobType) return jobType
  return t('job.workbench.global.typePending')
}

const OBJECT_FIELDS: ReadonlyArray<{ key: string; labelKey: string }> = [
  { key: 'tableId', labelKey: 'job.workbench.object.table' },
  { key: 'tableIds', labelKey: 'job.workbench.object.tables' },
  { key: 'tableIdFrom', labelKey: 'job.workbench.object.tableFrom' },
  { key: 'tableIdTo', labelKey: 'job.workbench.object.tableTo' },
  { key: 'rowId', labelKey: 'job.workbench.object.row' },
  { key: 'rowIdFrom', labelKey: 'job.workbench.object.rowFrom' },
  { key: 'rowIdTo', labelKey: 'job.workbench.object.rowTo' },
  { key: 'columnId', labelKey: 'job.workbench.object.column' },
  { key: 'algorithmId', labelKey: 'job.workbench.object.algorithm' },
  { key: 'verifyType', labelKey: 'job.workbench.object.scope' },
  { key: 'operationId', labelKey: 'job.workbench.object.operationId' },
  { key: 'sourceMaintenanceJobId', labelKey: 'job.workbench.object.maintenanceJob' },
]

export interface JobBusinessObject {
  key: string
  labelKey: string
  value: string
  valueSource?: 'currentCatalog'
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function objectText(value: unknown): string {
  const scalar = scalarText(value)
  if (scalar) return scalar
  if (!Array.isArray(value)) return ''
  return value.map(scalarText).filter(Boolean).join(', ')
}

/**
 * Business-object IDs come only from allowlisted metadata keys. Algorithm names
 * are enriched by an exact-ID match against the current catalog and remain
 * labeled as current-catalog data, not as a historical Job snapshot.
 */
export function jobBusinessObjects(
  metadata: Record<string, unknown> | null | undefined,
  algorithmNamesById?: ReadonlyMap<string, string>,
): JobBusinessObject[] {
  if (!metadata) return []
  const objects: JobBusinessObject[] = []
  for (const field of OBJECT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(metadata, field.key)) continue
    const value = objectText(metadata[field.key])
    if (!value) continue
    const catalogName = field.key === 'algorithmId' ? algorithmNamesById?.get(value)?.trim() : undefined
    objects.push({
      key: field.key,
      labelKey: field.labelKey,
      value: catalogName ? `${catalogName} (${value})` : value,
      ...(catalogName ? { valueSource: 'currentCatalog' as const } : {}),
    })
  }
  return objects
}

const ERROR_KEYS: Record<string, string> = {
  Cancelled: 'job.workbench.errorCode.Cancelled',
  InternalError: 'job.workbench.errorCode.InternalError',
  Timeout: 'job.workbench.errorCode.Timeout',
  NotFound: 'job.workbench.errorCode.NotFound',
  InvalidInput: 'job.workbench.errorCode.InvalidInput',
}

/** `None` and empty mean no error; unknown codes stay verbatim instead of being renamed. */
export function jobErrorLabel(errorCode: string | null | undefined, t: Translate): string | null {
  if (!errorCode || errorCode === 'None') return null
  const key = ERROR_KEYS[errorCode]
  return key ? t(key) : errorCode
}

/** Backend duration is 0 until a Job ends, so zero is missing rather than instant. */
export function formatJobDuration(totalDurationMs: number | null | undefined): string {
  if (typeof totalDurationMs !== 'number' || !Number.isFinite(totalDurationMs) || totalDurationMs <= 0) {
    return '-'
  }
  return `${totalDurationMs} ms`
}
