import type { StrategyKindFact } from './algorithmWorkbench'

type Translate = (key: string) => string

const PURPOSE_KEYS: Record<string, string> = {
  Audit: 'algorithm.workbench.purposeAudit',
  Identity: 'algorithm.workbench.purposeIdentity',
}

const KIND_KEYS: Record<string, string> = {
  Static: 'algorithm.workbench.kindAuditStatic',
  Dynamic: 'algorithm.workbench.kindAuditDynamic',
  Online: 'algorithm.workbench.kindIdentityOnline',
  Offline: 'algorithm.workbench.kindIdentityOffline',
}

const KIND_EXPLANATION_KEYS: Record<string, string> = {
  Static: 'algorithm.workbench.kindAuditStaticHint',
  Dynamic: 'algorithm.workbench.kindAuditDynamicHint',
  Online: 'algorithm.workbench.kindIdentityOnlineHint',
  Offline: 'algorithm.workbench.kindIdentityOfflineHint',
}

const CAPABILITY_KEYS: Record<string, string> = {
  BatchVerify: 'algorithm.workbench.capabilityBatchVerify',
  // Audit capability for identity-based cryptography; it does not mean Identity purpose.
  IdentityAuthentication: 'algorithm.workbench.capabilityIdentityAuthentication',
  DynamicUpdate: 'algorithm.workbench.capabilityDynamicUpdate',
}

const PARTY_KEYS: Record<string, string> = {
  Public: 'algorithm.workbench.maintenancePartyPublic',
  TPA: 'algorithm.workbench.maintenancePartyTPA',
  CSP: 'algorithm.workbench.maintenancePartyCSP',
  User: 'algorithm.workbench.maintenancePartyUser',
  Shared: 'algorithm.workbench.maintenancePartyShared',
  None: 'algorithm.workbench.maintenancePartyNone',
}

export function strategyPurposeLabel(purpose: string, t: Translate): string {
  const key = PURPOSE_KEYS[purpose]
  return key ? t(key) : purpose
}

/** Localized kind label; an unknown or mismatched kind never gets a taxonomy label. */
export function strategyKindLabel(kind: StrategyKindFact, t: Translate): string {
  const key = kind.kind ? KIND_KEYS[kind.kind] : undefined
  return key ? t(key) : t('algorithm.workbench.kindUnknown')
}

export function strategyKindExplanation(kind: StrategyKindFact, t: Translate): string {
  const key = kind.kind ? KIND_EXPLANATION_KEYS[kind.kind] : undefined
  return key ? t(key) : t('algorithm.workbench.kindUnknownHint')
}

export function capabilityNameLabel(name: string, t: Translate): string {
  const key = CAPABILITY_KEYS[name]
  return key ? t(key) : name
}

export function stateMaintenancePartyLabel(party: string, t: Translate): string {
  const key = PARTY_KEYS[party]
  return key ? t(key) : party
}
