/**
 * A bound owner as shown in the UI: the backend returns identifiers only, so
 * the user name is resolved from the reference catalog when available.
 */
export interface BoundUser {
  userId: string
  userName?: string
}

/**
 * A Job reference this browser session received from an algorithm operation
 * response (`POST profiles` init or `POST profiles/{id}/bindings`). It is not a
 * fabricated history: only job ids the API actually returned are listed.
 */
export interface SessionJobLink {
  jobId: string
  algorithmId: string
  kind: 'init' | 'bind'
  /** Admin clock when this session received the job reference. */
  recordedAtMs: number
}

/**
 * One row of the unified binding search. The API returns identifiers and the
 * bound profile version only; names are resolved from the reference catalogs.
 */
export interface BindingRowView {
  algorithmId: string
  userId: string
  /** Profile version the keys were generated against. */
  algorithmVersion: number
  purpose: string
  userName?: string
  algorithmName?: string
}
