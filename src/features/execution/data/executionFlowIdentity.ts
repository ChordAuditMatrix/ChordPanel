/**
 * Flow identity of the current Job, as four distinct states.
 *
 * The Job's durable `flowId` is read from the Job detail. A missing detail is not
 * the same fact as a detail that failed, and neither is the same fact as a loaded
 * detail whose `flowId` is empty. Only the last state proves that the Job has no
 * flow; the first two leave the identity unknown and must never render a "no
 * flow" statement.
 */

export type ExecutionFlowIdentity =
  | { readonly kind: 'detailLoading' }
  | { readonly kind: 'detailError' }
  | { readonly kind: 'detailMissing' }
  | { readonly kind: 'noFlow' }
  | { readonly kind: 'flow'; readonly flowId: string }

export interface ExecutionFlowIdentityInput {
  /** Loaded Job detail; `null` when no detail has been read. */
  readonly jobDetail: { readonly flowId?: string | null } | null
  readonly detailLoading: boolean
  /** The detail request failed; the flow identity stays unknown. */
  readonly detailFailed: boolean
}

export function resolveExecutionFlowIdentity(
  input: ExecutionFlowIdentityInput,
): ExecutionFlowIdentity {
  if (input.detailLoading) return { kind: 'detailLoading' }
  if (input.detailFailed) return { kind: 'detailError' }
  if (!input.jobDetail) return { kind: 'detailMissing' }
  const flowId = input.jobDetail.flowId
  if (typeof flowId !== 'string' || flowId.trim() === '') return { kind: 'noFlow' }
  return { kind: 'flow', flowId: flowId.trim() }
}
