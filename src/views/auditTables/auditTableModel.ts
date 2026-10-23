/**
 * Pure projections for the audit-table registry workbench.
 *
 * These helpers only restate fields the registry contract already returns:
 * they never invent a historical event, a validation result or a hash
 * algorithm the current record does not carry.
 */
import type { AuditTable, AuditTableAddressingMode, AuditTableStatus } from '@/api/auditTables'

/** Fingerprint head/tail kept by the compact display. */
export const FINGERPRINT_SHORT_HEAD = 12
export const FINGERPRINT_SHORT_TAIL = 6
/** Values at or below this length are already short enough to print whole. */
export const FINGERPRINT_SHORT_MAX = 24

export interface SchemaFingerprintView {
  /** The registered value, trimmed; what copy and the expanded view use. */
  raw: string
  /** Compact display of the opaque fingerprint value. */
  short: string
}

function shortenFingerprint(value: string): string {
  if (value.length <= FINGERPRINT_SHORT_MAX) return value
  return `${value.slice(0, FINGERPRINT_SHORT_HEAD)}…${value.slice(-FINGERPRINT_SHORT_TAIL)}`
}

/**
 * Compacts the registered fingerprint without inferring an algorithm or
 * parsing a format that the current API contract does not define.
 */
export function describeSchemaFingerprint(raw: unknown): SchemaFingerprintView {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return { raw: value, short: value ? shortenFingerprint(value) : '' }
}

export interface AuditTableCapabilities {
  /** Re-inspect the live table without changing its addressing mode. */
  validate: boolean
  /** Change the mode; refused once retired, invalid or locked by ownership. */
  editAddressing: boolean
  /** Permanently retire the mapping; identifiers stay reserved. */
  retire: boolean
}

/**
 * Actions the registry contract permits for the current record.
 *
 * `validate` is refused only for retired mappings; `addressing` is refused for
 * retired, invalid and locked mappings; `retire` is refused once retired.
 */
export function auditTableCapabilities(table: Pick<AuditTable, 'status' | 'addressingModeLocked'>): AuditTableCapabilities {
  return {
    validate: table.status !== 'retired',
    editAddressing: table.status !== 'retired' && table.status !== 'invalid' && !table.addressingModeLocked,
    retire: table.status !== 'retired',
  }
}

/**
 * i18n key of the sentence that explains the current addressing-mode rule.
 * Retired and invalid records outrank the ownership lock because they are the
 * reason the backend refuses a mode change first.
 */
export function auditTableAddressingNoteKey(table: Pick<AuditTable, 'status' | 'addressingModeLocked'>): string {
  if (table.status === 'retired') return 'auditTables.workbench.addressing.retired'
  if (table.status === 'invalid') return 'auditTables.workbench.addressing.invalid'
  if (table.addressingModeLocked) return 'auditTables.addressingModeLocked'
  return 'auditTables.addressingModeEditable'
}

export type AuditTableLifecycleState = 'complete' | 'current' | 'pending' | 'attention' | 'blocked' | 'muted'
export type AuditTableLifecycleStepKey = 'registration' | 'schema' | 'addressing' | 'validation' | 'retirement'

export interface AuditTableLifecycleStep {
  key: AuditTableLifecycleStepKey
  state: AuditTableLifecycleState
  /** Full i18n key of the step explanation. */
  detailKey: string
  detailParams: Record<string, string | number>
}

const LIFECYCLE_KEY_PREFIX = 'auditTables.workbench.lifecycle.steps'

function lifecycleStep(
  key: AuditTableLifecycleStepKey,
  state: AuditTableLifecycleState,
  detail: string,
  detailParams: Record<string, string | number> = {},
): AuditTableLifecycleStep {
  return { key, state, detailKey: `${LIFECYCLE_KEY_PREFIX}.${key}.${detail}`, detailParams }
}

function addressingState(status: AuditTableStatus, locked: boolean): AuditTableLifecycleState {
  if (status === 'retired') return 'muted'
  if (locked) return 'complete'
  if (status === 'invalid') return 'blocked'
  if (status === 'pending') return 'current'
  return 'complete'
}

function addressingDetail(status: AuditTableStatus, locked: boolean): string {
  if (status === 'retired') return 'retired'
  if (locked) return 'locked'
  if (status === 'invalid') return 'blocked'
  return 'editable'
}

function validationState(status: AuditTableStatus): AuditTableLifecycleState {
  switch (status) {
    case 'active': return 'complete'
    case 'pending': return 'pending'
    case 'invalid': return 'attention'
    case 'retired': return 'muted'
  }
}

/**
 * Explains the mapping lifecycle from the current registry record only.
 *
 * Steps run registration → schema → addressing → validation → retirement.
 * The returned states describe what the record says now; they are not a
 * replay of stored events, which the API does not expose.
 */
export function buildAuditTableLifecycle(table: AuditTable): AuditTableLifecycleStep[] {
  const addressingMode: AuditTableAddressingMode = table.addressingMode
  return [
    lifecycleStep('registration', 'complete', 'recorded', { id: table.tableId }),
    lifecycleStep('schema', 'complete', 'revision', { revision: table.schemaRevision }),
    lifecycleStep('addressing', addressingState(table.status, table.addressingModeLocked), addressingDetail(table.status, table.addressingModeLocked), { mode: addressingMode }),
    lifecycleStep('validation', validationState(table.status), table.status),
    lifecycleStep('retirement', table.status === 'retired' ? 'current' : 'pending', table.status === 'retired' ? 'retired' : 'open'),
  ]
}

/** i18n key of the one-line explanation of the current registry status. */
export function auditTableStatusDescriptionKey(status: AuditTableStatus): string {
  return `auditTables.workbench.detail.stateDescriptions.${status}`
}

export type RegistryLifecycleStageKey = 'uninitialized' | 'bootstrapping' | 'ready'
export type RegistryLifecycleStageState = 'complete' | 'current' | 'pending' | 'unknown'

export interface RegistryLifecycleStep {
  key: RegistryLifecycleStageKey
  state: RegistryLifecycleStageState
}

export interface RegistryLifecycleInput {
  registryState: 'unknown' | 'uninitialized' | 'initialized'
  bootstrapJobActive: boolean
}

/**
 * Registry-level lifecycle: uninitialized → bootstrapping → ready.
 *
 * The published registry outranks a stale bootstrap snapshot, so a tracked Job
 * that still reports Running after the registry became readable cannot claim
 * that initialization is still in progress.
 */
export function buildRegistryLifecycle(input: RegistryLifecycleInput): RegistryLifecycleStep[] {
  const stages: RegistryLifecycleStageKey[] = ['uninitialized', 'bootstrapping', 'ready']
  if (input.registryState === 'initialized') {
    return stages.map((key, index) => ({ key, state: index === stages.length - 1 ? 'current' : 'complete' }))
  }
  if (input.bootstrapJobActive) {
    return stages.map((key, index) => ({ key, state: index === 1 ? 'current' : index === 0 ? 'complete' : 'pending' }))
  }
  if (input.registryState === 'uninitialized') {
    return stages.map((key, index) => ({ key, state: index === 0 ? 'current' : 'pending' }))
  }
  return stages.map(key => ({ key, state: 'unknown' }))
}
