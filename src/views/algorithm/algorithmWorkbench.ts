import type { AlgorithmProfile, AlgorithmStrategy } from '@/api/algorithm'
import type { SessionJobLink } from './types'


/**
 * Audit capability bit values as documented by
 * `ChordAuditMatrixLib/interfaces/audit/messages/capabilities.h`.
 * Bits outside this map are still carried by the mask but have no name.
 */
export const AUDIT_CAPABILITY_BITS: Record<string, number> = {
  BatchVerify: 1,
  IdentityAuthentication: 2,
  DynamicUpdate: 4,
}

/** Ascending bit order, matching the order in which the backend names them. */
const CAPABILITY_ORDER = Object.entries(AUDIT_CAPABILITY_BITS).sort((left, right) => left[1] - right[1])
const DOCUMENTED_CAPABILITY_MASK = CAPABILITY_ORDER.reduce((mask, [, bit]) => mask | bit, 0)

const AUDIT_STRATEGY_KINDS: Record<string, true> = { Static: true, Dynamic: true }
const IDENTITY_STRATEGY_KINDS: Record<string, true> = { Online: true, Offline: true }

function isAuditStrategyKind(value: string): value is 'Static' | 'Dynamic' {
  return Object.prototype.hasOwnProperty.call(AUDIT_STRATEGY_KINDS, value)
}

function isIdentityStrategyKind(value: string): value is 'Online' | 'Offline' {
  return Object.prototype.hasOwnProperty.call(IDENTITY_STRATEGY_KINDS, value)
}

export type StrategyKind = 'Static' | 'Dynamic' | 'Online' | 'Offline'
export type StrategyKindAxis = 'audit' | 'identity' | 'unknown'

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export interface CapabilityMaskDecoding {
  /** `null` when the plugin did not report a usable mask. */
  mask: number | null
  /** Documented capability names carried by the mask, in ascending bit order. */
  names: string[]
  /** Set bits without a documented capability name, in ascending bit order. */
  unnamedBits: number[]
}

/**
 * Decode the raw capability mask. A missing or malformed mask stays unknown
 * (`mask: null`); only an actual reported `0` means zero capabilities.
 * Names are never inferred from the algorithm type or profile name.
 */
export function decodeCapabilityMask(value: unknown): CapabilityMaskDecoding {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
    return { mask: null, names: [], unnamedBits: [] }
  }
  const unsigned = value >>> 0
  const names: string[] = []
  const unnamedBits: number[] = []
  for (const [name, bit] of CAPABILITY_ORDER) {
    if ((unsigned & bit) !== 0) names.push(name)
  }
  const remaining = unsigned & ~DOCUMENTED_CAPABILITY_MASK
  for (let bit = 1; bit <= 0x80000000; bit *= 2) {
    if ((remaining & bit) !== 0) unnamedBits.push(bit)
  }
  return { mask: unsigned, names, unnamedBits }
}

export type CapabilityState = 'unknown' | 'none' | 'declared'

export interface StrategyCapabilityFact {
  state: CapabilityState
  /** Reported mask; `null` when unreported. */
  mask: number | null
  names: string[]
  unnamedBits: number[]
}

/**
 * Combine the reported mask with the backend-decoded name list.
 *
 * - Unreported mask with no names and no name list → `unknown`.
 * - Reported `0` mask (or an explicitly empty name list) → `none`, an explicit
 *   zero-capability claim.
 * - Any set bit or reported name → `declared`.
 *
 * A name list that is present but empty is itself a declaration; a missing
 * list (`null`) stays unknown. The name union keeps a name the mask decode does
 * not explain instead of dropping either side of a contract mismatch.
 */
export function resolveStrategyCapabilities(
  strategy: Pick<AlgorithmStrategy, 'capabilities' | 'capabilitiesMask'>,
): StrategyCapabilityFact {
  const decoding = decodeCapabilityMask(strategy.capabilitiesMask)
  const rawNames = strategy.capabilities
  const namesReported = Array.isArray(rawNames)
  const reported = Array.isArray(rawNames)
    ? Array.from(new Set(rawNames.filter((name): name is string => nonEmptyText(name) !== null)))
    : []
  const names = [...decoding.names, ...reported.filter(name => !decoding.names.includes(name))]
  let state: CapabilityState
  if (decoding.mask === null) {
    if (names.length > 0) state = 'declared'
    else state = namesReported ? 'none' : 'unknown'
  } else {
    state = decoding.mask === 0 && names.length === 0 ? 'none' : 'declared'
  }
  return { state, mask: decoding.mask, names, unnamedBits: decoding.unnamedBits }
}

export interface StrategyKindFact {
  /** Kind string exactly as reported; `null` when absent or empty. */
  raw: string | null
  /** Which purpose taxonomy the kind belongs to. */
  axis: StrategyKindAxis
  /** Normalized kind, only when purpose and kind agree. */
  kind: StrategyKind | null
}

/**
 * Classify a strategy kind against its purpose. The kind is never guessed from
 * the algorithm type name: a kind that does not belong to the purpose taxonomy
 * stays `unknown` and keeps the raw value visible.
 */
export function classifyStrategyKind(purpose: unknown, strategyKind: unknown): StrategyKindFact {
  const raw = nonEmptyText(strategyKind)
  if (raw === null) return { raw: null, axis: 'unknown', kind: null }
  if (purpose === 'Audit' && isAuditStrategyKind(raw)) return { raw, axis: 'audit', kind: raw }
  if (purpose === 'Identity' && isIdentityStrategyKind(raw)) return { raw, axis: 'identity', kind: raw }
  return { raw, axis: 'unknown', kind: null }
}

export interface StrategyView {
  algorithmType: string
  purpose: string
  /** Plugin version string; `null` when the plugin did not report one. */
  pluginVersion: string | null
  kind: StrategyKindFact
  capabilities: StrategyCapabilityFact
  /** Raw `StateMaintenanceParty` name; only applies to Dynamic audit strategies. */
  maintenanceParty: string | null
  maintenancePartyApplies: boolean
}

export function describeStrategy(strategy: AlgorithmStrategy): StrategyView {
  const kind = classifyStrategyKind(strategy.purpose, strategy.strategyKind)
  const maintenancePartyApplies = kind.kind === 'Dynamic'
  return {
    algorithmType: strategy.algorithmType,
    purpose: strategy.purpose,
    pluginVersion: nonEmptyText(strategy.version),
    kind,
    capabilities: resolveStrategyCapabilities(strategy),
    maintenanceParty: maintenancePartyApplies ? nonEmptyText(strategy.stateMaintenanceParty) : null,
    maintenancePartyApplies,
  }
}

export interface ProfileVersionFacts {
  /** Profile parameter version from the profile response. */
  profileVersion: number | null
  /** Plugin version from the matching strategy; a separate fact. */
  pluginVersion: string | null
}

/**
 * Keep the two version facts apart: the profile version is a number that the
 * profile carries, the plugin version is a string reported by the strategy.
 * Neither is derived from the other.
 */
export function describeProfileVersions(profileVersion: unknown, strategyVersion: unknown): ProfileVersionFacts {
  return {
    profileVersion: typeof profileVersion === 'number' && Number.isInteger(profileVersion) && profileVersion >= 0
      ? profileVersion
      : null,
    pluginVersion: nonEmptyText(strategyVersion),
  }
}

/**
 * Per-type profile counts, only when the fetched profiles provably cover the
 * server total. A partial or filtered page yields `null` (unknown) instead of
 * an understated count.
 */
export function countProfilesByType(profiles: readonly AlgorithmProfile[], total: unknown): Map<string, number> | null {
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) return null
  if (profiles.length !== total) return null
  const counts = new Map<string, number>()
  const profileIds = new Set<string>()
  for (const profile of profiles) {
    const type = nonEmptyText(profile.algorithmType)
    if (type === null || !profile.algorithmId || profileIds.has(profile.algorithmId)) return null
    profileIds.add(profile.algorithmId)
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  if (profileIds.size !== total) return null
  return counts
}

/** Return only API-returned operation jobs tied to this exact profile ID. */
export function jobsForProfile(
  jobs: readonly SessionJobLink[],
  algorithmId: string | null | undefined,
): SessionJobLink[] {
  if (!algorithmId) return []
  return jobs
    .filter(job => job.algorithmId === algorithmId)
    .sort((left, right) => right.recordedAtMs - left.recordedAtMs)
}


/** Exact, case-sensitive match; the backend never resolves types case-insensitively. */
export function findStrategyByType(
  strategies: readonly AlgorithmStrategy[],
  algorithmType: string | null | undefined,
): AlgorithmStrategy | null {
  if (!algorithmType) return null
  return strategies.find(strategy => strategy.algorithmType === algorithmType) ?? null
}

export interface StrategyFilter {
  purpose?: string | null
  query?: string
}

export function filterStrategies(
  strategies: readonly AlgorithmStrategy[],
  filter: StrategyFilter = {},
): AlgorithmStrategy[] {
  const query = filter.query?.trim().toLowerCase() ?? ''
  return strategies.filter(strategy =>
    (!filter.purpose || strategy.purpose === filter.purpose)
    && (query.length === 0 || strategy.algorithmType.toLowerCase().includes(query)),
  )
}
