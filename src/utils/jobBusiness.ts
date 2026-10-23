import { jobTypeLabel } from '@/utils/jobType'

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Exact `metadata.auditOperation` tokens written by the Admin business flows.
 * A generic `jobType` (for example Audit) never selects one of these on its own.
 */
const OPERATION_KEYS: Record<string, string> = {
  TagGeneration: 'job.workbench.operation.tagGeneration',
  Regeneration: 'job.workbench.operation.regeneration',
  ChallengeProof: 'job.workbench.operation.challengeProof',
  IdentityVerification: 'job.workbench.operation.identityVerification',
  Maintenance: 'job.workbench.operation.maintenance',
}

const CANONICAL_JOB_TYPES: Record<string, true> = {
  Audit: true,
  Query: true,
  Storage: true,
  Replication: true,
}

export type JobOperation =
  | { state: 'known'; token: string; labelKey: string }
  | { state: 'unknown'; token: string }
  | { state: 'absent' }

/** Reads the published business-operation vocabulary, never a jobType guess. */
export function jobOperation(metadata: Record<string, unknown> | null | undefined): JobOperation {
  const raw = metadata?.auditOperation
  const token = typeof raw === 'string' ? raw : ''
  if (token === '') return { state: 'absent' }
  const labelKey = OPERATION_KEYS[token]
  return labelKey ? { state: 'known', token, labelKey } : { state: 'unknown', token }
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

export function isCancelledJob(job: { errorCode?: string | null } | null | undefined): boolean {
  return job?.errorCode === 'Cancelled'
}

/** True only for the four JobType values the backend enum publishes. */
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
  { key: 'auditTableOperation', labelKey: 'job.workbench.object.auditTableOperation' },
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
