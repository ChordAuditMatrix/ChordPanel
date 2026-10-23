import type { PageRequest, PageResponse } from './pagination'
import api from './request'

/**
 * A registered algorithm strategy (audit strategy plugin or identity type).
 *
 * These are catalog descriptors reported by the backend from the loaded
 * plugin itself, not instance data:
 * - `version` is the plugin's own version **string** (e.g. `"1.0.0"`).
 *   The profile version on {@link AlgorithmProfile} is numeric and unrelated.
 * - `strategyKind` is the documented kind for the strategy's purpose:
 *   `"Static"` / `"Dynamic"` for Audit, `"Online"` / `"Offline"` for Identity.
 *   `null` means the backend could not report a kind.
 * - `capabilities` / `capabilitiesMask` carry the audit capability bits.
 *   `null` means "not reported"; a reported `0` mask with `[]` names is an
 *   explicit zero-capability declaration. Identity types report neither.
 * - `stateMaintenanceParty` exists only for Dynamic audit strategies; it is
 *   the `StateMaintenanceParty` enum name (`"TPA"`, `"CSP"`, ...).
 */
export interface AlgorithmStrategy {
  algorithmType: string
  /** Plugin version string; contrast `AlgorithmProfile.version`, which is numeric. */
  version: string
  purpose: string
  strategyKind: string | null
  /** Capability names decoded by the backend from `capabilitiesMask`. */
  capabilities: string[] | null
  /** Raw `uint32` capability mask; `null` when unreported. */
  capabilitiesMask: number | null
  /** Only meaningful for Dynamic audit strategies; `null` otherwise. */
  stateMaintenanceParty: string | null
}

/** An initialized algorithm profile (instance). */
export interface AlgorithmProfile {
  algorithmId: string
  algorithmType: string
  algorithmName: string
  /** Profile parameter version (number); never the plugin version string. */
  version: number
  purpose: string
}

export function getStrategies(params?: PageRequest): Promise<PageResponse<AlgorithmStrategy>> {
  return api.get('/v1/algorithms/strategies', { params })
}

export function getProfiles(params?: PageRequest & { type?: string; purpose?: string }): Promise<PageResponse<AlgorithmProfile>> {
  return api.get('/v1/algorithms/profiles', { params })
}

/** Result of `POST /v1/algorithms/profiles`. */
export interface ProfileInitialization {
  algorithmId: string
  algorithmType: string
  algorithmName: string
  version: number
  purpose: string
  /** Async Job created for the initialization (audit trail). */
  jobId: string
}

export function initProfile(
  algorithmType: string,
  algorithmName: string,
  params?: Record<string, unknown>,
  initiatorId?: string,
): Promise<ProfileInitialization> {
  return api.post('/v1/algorithms/profiles', {
    request: { initiatorId: initiatorId || '1', algorithmType, algorithmName },
    params: params || {},
  })
}

/** Result of `POST /v1/algorithms/profiles/{id}/deinitialize`. */
export interface ProfileDeinitialization {
  algorithmId: string
  algorithmType: string
  algorithmName: string
}

export function deinitProfile(algorithmId: string, initiatorId?: string): Promise<ProfileDeinitialization> {
  return api.post(`/v1/algorithms/profiles/${encodeURIComponent(algorithmId)}/deinitialize`, {
    request: { initiatorId: initiatorId || '1' },
  })
}

/** Result of `POST /v1/algorithms/profiles/{id}/bindings`. */
export interface UserBindingCreation {
  algorithmId: string
  userId: string
  /** Profile version the keys were generated against. */
  algorithmVersion: number
  purpose: string
  /** Async Job tracking the binding. */
  jobId: string
}

export function bindUser(algorithmId: string, userId: string, initiatorId?: string): Promise<UserBindingCreation> {
  return api.post(`/v1/algorithms/profiles/${encodeURIComponent(algorithmId)}/bindings`, {
    request: { initiatorId: initiatorId || '1' },
    params: { userId },
  })
}

/** Result of `DELETE /v1/algorithms/profiles/{id}/bindings/{userId}`. */
export interface UserBindingDeletion {
  algorithmId: string
  userId: string
  deleted: boolean
}

export function unbindUser(algorithmId: string, userId: string): Promise<UserBindingDeletion> {
  return api.delete(`/v1/algorithms/profiles/${encodeURIComponent(algorithmId)}/bindings/${encodeURIComponent(userId)}`)
}

/**
 * One owner binding of an algorithm profile.
 * The backend returns identifiers only; user names are resolved client-side.
 */
export interface ProfileBinding {
  algorithmId: string
  userId: string
  algorithmVersion: number
  purpose: string
}

export function listProfileBindings(algorithmId: string, params?: PageRequest): Promise<PageResponse<ProfileBinding>> {
  return api.get(`/v1/algorithms/profiles/${encodeURIComponent(algorithmId)}/bindings`, { params })
}

export interface AlgorithmBindingSummary {
  algorithmId: string
  algorithmVersion: number
  purpose: string
  userId: string
}

export interface BindingQuery extends PageRequest {
  algorithmId?: string
  algorithmName?: string
  userId?: string
  purpose?: string
}

/**
 * Unified binding search. Every filter is optional; `algorithmId` takes
 * precedence over `algorithmName` on the backend. Names and key material are
 * never included, so callers resolve user/profile names from the catalogs.
 */
export function getBindings(params?: BindingQuery): Promise<PageResponse<AlgorithmBindingSummary>> {
  return api.get('/v1/algorithms/bindings', { params })
}
