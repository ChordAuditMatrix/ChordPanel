import type {
  TraceExecutionKind,
  TraceIdentityScope,
  TraceLink,
  TraceObservation,
  TraceObservationEventType,
  TraceObservationMetrics,
  TraceObservationOutcome,
  TraceSourceComponent,
  TraceSourceQuality,
  TraceSummary,
} from '@/api/trace'

/**
 * Presentation-stage projection over already-loaded observations.
 *
 * Each stage is evidenced only by the events listed in `STAGE_DEFINITIONS`;
 * a stage without those events stays `notObserved` even when later stages are
 * evidenced. Job status, verification result and coverage are separate facts
 * and are intentionally not accepted or inferred here.
 */

export interface ExecutionStageEvidence {
  observationId: string
  eventType: TraceObservationEventType
  /** Source attribution kept exactly as recorded. */
  source: {
    component: TraceSourceComponent | null
    nodeId: string | null
    quality: TraceSourceQuality | null
  }
  refs: TraceObservation['refs']
  eventTimeMs: number | null
  recordedAtMs: number
  metrics: TraceObservationMetrics
  outcome: TraceObservationOutcome | null
}

export interface ExecutionStage {
  /** Stable stage id, unique within one execution kind. */
  id: string
  /** Position in the kind's fixed presentation order. */
  index: number
  /** `execution.stages.<kind>.<stageId>`. */
  labelKey: string
  /** Event evidence only; never an inferred completion. */
  status: 'observed' | 'notObserved'
  /** Ordered by Admin `recordedAtMs`, then `observationId`. */
  evidence: ExecutionStageEvidence[]
  /** Only from an explicit failure/refusal fact on this stage's events. */
  hasFailureEvidence: boolean
}

export interface ExecutionStageProjection {
  kind: TraceExecutionKind
  /** Fixed presentation order for the kind; empty when the kind is unknown. */
  stages: ExecutionStage[]
  /**
   * Highest stage index carrying any evidence. Never derived from wall-clock or
   * source timestamps, so a late early-stage event cannot regress the focus.
   */
  latestObservedStageId: string | null
}

interface StageDefinition {
  readonly id: string
  readonly events: readonly TraceObservationEventType[]
}

const STAGE_DEFINITIONS: Record<TraceExecutionKind, readonly StageDefinition[]> = {
  challengeProof: [
    { id: 'algorithmSelection', events: ['AlgorithmSelectionResolved'] },
    { id: 'tagRange', events: ['ChallengeTagRangesQueried'] },
    { id: 'sampling', events: ['ChallengeSamplingDecided'] },
    { id: 'dispatch', events: ['ChallengeDispatchAccepted'] },
    { id: 'challengeGeneration', events: ['ChallengeMaterialGenerated'] },
    { id: 'challengeDelivery', events: ['ChallengeDeliveredToStorage'] },
    { id: 'proofGeneration', events: ['ProofGenerationStarted', 'ProofGenerationCompleted'] },
    { id: 'proofReturn', events: ['ProofReturnedToAudit'] },
    { id: 'proofVerification', events: ['ProofVerificationCompleted'] },
    { id: 'settlement', events: ['ChallengeJobCompleted'] },
  ],
  tagGeneration: [
    { id: 'layout', events: ['TagLayoutPlanningStarted', 'TagLayoutPlanned'] },
    {
      id: 'plan',
      events: ['TagRangeQueryDispatched', 'TagRangeQueryCompleted', 'TagGenerationPlanCommitted'],
    },
    {
      id: 'generation',
      events: ['TagPartGenerationStarted', 'TagWindowGenerated', 'TagPartCompleted'],
    },
    {
      id: 'storage',
      events: ['TagDumpDispatched', 'TagDumpAccounted', 'TagWindowFailed', 'TagWindowCancelled'],
    },
    { id: 'settlement', events: ['TagGenerationFinalized'] },
  ],
  identityVerification: [
    { id: 'ownersResolved', events: ['IdentityOwnersResolved'] },
    { id: 'evidenceValidated', events: ['IdentityEvidenceValidated'] },
    { id: 'algorithmResolved', events: ['IdentityAlgorithmResolved'] },
    { id: 'signaturesAggregated', events: ['IdentitySignaturesAggregated'] },
    { id: 'verification', events: ['IdentityVerificationCompleted'] },
  ],
  other: [],
  maintenance: [{ id: 'recovery', events: ['MaintenanceRecoveryRequested', 'MaintenanceRecoveryRefused'] }],
}

export interface ExecutionStageContext {
  /** Immutable Job facts used to validate identity scope. */
  summary?: TraceSummary | null
  /** Exact durable TaskBook relations used to validate Audit worker evidence. */
  links?: readonly TraceLink[]
}

const IDENTITY_WORKER_EVENTS = new Set<TraceObservationEventType>([
  'IdentityOwnersResolved',
  'IdentityEvidenceValidated',
  'IdentityAlgorithmResolved',
  'IdentitySignaturesAggregated',
])
const IDENTITY_ALGORITHM_EVENTS = new Set<TraceObservationEventType>([
  'IdentityAlgorithmResolved',
  'IdentitySignaturesAggregated',
])
const UINT64_MAX_DECIMAL = '18446744073709551615'
const UINT64_PATTERN = /^(0|[1-9][0-9]*)$/

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isUint64(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > UINT64_MAX_DECIMAL.length) return false
  if (!UINT64_PATTERN.test(value)) return false
  return value.length < UINT64_MAX_DECIMAL.length || value <= UINT64_MAX_DECIMAL
}

type IdentityTraceSummary = TraceSummary & {
  references: TraceSummary['references'] & { verifyType: TraceIdentityScope }
}

function hasIdentityJobContext(
  observation: TraceObservation,
  context: ExecutionStageContext,
): context is ExecutionStageContext & { summary: IdentityTraceSummary } {
  const summary = context.summary
  return summary?.jobId === observation.jobId
    && summary.executionKind === 'identityVerification'
    && !!summary.references.verifyType
}

function uniqueIdentityTaskBookLink(
  jobId: string,
  taskId: string | null,
  requestId: string | null,
  nodeId: string | null,
  links: readonly TraceLink[],
): TraceLink | null {
  if (!isNonEmpty(taskId) || !isNonEmpty(requestId) || !isNonEmpty(nodeId)) return null
  let match: TraceLink | null = null
  for (const link of links) {
    if (
      link.jobId !== jobId
      || link.linkKind !== 'taskDispatch'
      || link.matchBasis !== 'taskBook'
      || link.confidence !== 'exact'
      || link.sourceQuality !== 'observed'
      || link.nodeAction !== 'IdentityVerification'
      || link.taskId !== taskId
      || link.requestId !== requestId
      || link.nodeId !== nodeId
    ) continue
    if (match) return null
    match = link
  }
  return match
}

function uniqueIdentityTaskCompletionLink(
  jobId: string,
  taskId: string | null,
  requestId: string | null,
  nodeId: string | null,
  links: readonly TraceLink[],
): TraceLink | null {
  if (!isNonEmpty(taskId) || !isNonEmpty(requestId) || !isNonEmpty(nodeId)) return null
  let match: TraceLink | null = null
  for (const link of links) {
    if (
      link.jobId !== jobId
      || link.linkKind !== 'taskCompletion'
      || link.matchBasis !== 'requestId'
      || link.confidence !== 'exact'
      || link.sourceQuality !== 'observed'
      || link.taskId !== taskId
      || link.requestId !== requestId
      || link.nodeId !== nodeId
    ) continue
    if (match) return null
    match = link
  }
  return match
}

function hasExactIdentityTaskDispatch(
  observation: TraceObservation,
  links: readonly TraceLink[],
): boolean {
  return uniqueIdentityTaskBookLink(
    observation.jobId,
    observation.refs.taskId,
    observation.refs.requestId,
    observation.source.nodeId,
    links,
  ) !== null
}

function hasValidIdentityWorkerObservation(
  observation: TraceObservation,
  context: ExecutionStageContext,
): boolean {
  if (!hasIdentityJobContext(observation, context)) return false
  const { summary, links = [] } = context
  const { refs, metrics } = observation
  const allowsAlgorithm = IDENTITY_ALGORITHM_EVENTS.has(observation.eventType)
  const ownerCount = metrics.ownerCount
  if (
    observation.category !== 'identity'
    || observation.phase !== 'verify'
    || observation.source.component !== 'Audit'
    || observation.source.quality !== 'observed'
    || !isNonEmpty(observation.source.nodeId)
    || !Number.isSafeInteger(observation.eventTimeMs)
    || observation.eventTimeMs === null
    || refs.identityScope !== summary.references.verifyType
    || !isNonEmpty(refs.packetId)
    || refs.challengeCorrelationId != null
    || refs.operationId !== null
    || refs.partIndex !== null
    || refs.windowIndex !== null
    || refs.attempt !== null
    || observation.outcome !== null
    || observation.job !== null
    || !isUint64(ownerCount)
    || (observation.eventType !== 'IdentityOwnersResolved' && ownerCount === '0')
    || Object.keys(metrics).some(key => key !== 'ownerCount' && key !== 'signatureCount')
    || (allowsAlgorithm && !isNonEmpty(refs.algorithmId))
    || (!allowsAlgorithm && (refs.algorithmId !== null || refs.algorithmType != null))
    || !hasExactIdentityTaskDispatch(observation, links)
  ) {
    return false
  }

  const signatureCount = metrics.signatureCount
  if (observation.eventType === 'IdentitySignaturesAggregated') {
    return isUint64(signatureCount) && signatureCount !== '0' && signatureCount === ownerCount
  }
  return signatureCount === undefined
}

function hasValidIdentityCompletionObservation(
  observation: TraceObservation,
  context: ExecutionStageContext,
): boolean {
  if (
    !hasIdentityJobContext(observation, context)
    || observation.category !== 'identity'
    || observation.phase !== 'verify'
  ) return false

  const scope = observation.refs.identityScope
  if (scope != null && scope !== context.summary.references.verifyType) return false
  if (observation.source.quality === 'reconstructed') {
    return observation.source.component === 'Admin'
  }
  return observation.source.quality === 'observed'
    && observation.source.component === 'Audit'
    && isNonEmpty(observation.source.nodeId)
    && Number.isSafeInteger(observation.eventTimeMs)
    && observation.eventTimeMs !== null
    && isNonEmpty(observation.refs.packetId)
    && hasExactIdentityTaskDispatch(observation, context.links ?? [])
}

function isValidIdentityStageObservation(
  observation: TraceObservation,
  context: ExecutionStageContext,
): boolean {
  if (IDENTITY_WORKER_EVENTS.has(observation.eventType)) {
    return hasValidIdentityWorkerObservation(observation, context)
  }
  if (observation.eventType === 'IdentityVerificationCompleted') {
    return hasValidIdentityCompletionObservation(observation, context)
  }
  return false
}
const FAILURE_OUTCOMES: Record<string, true> = { failed: true, cancelled: true, timedOut: true }

/** Refusal/failure is only signalled by these explicit events. */
const FAILURE_EVENTS: Record<string, true> = {
  TagWindowFailed: true,
  MaintenanceRecoveryRefused: true,
}

function compareEvidence(a: ExecutionStageEvidence, b: ExecutionStageEvidence): number {
  if (a.recordedAtMs !== b.recordedAtMs) return a.recordedAtMs - b.recordedAtMs
  if (a.observationId === b.observationId) return 0
  return a.observationId < b.observationId ? -1 : 1
}

function toEvidence(observation: TraceObservation): ExecutionStageEvidence {
  return {
    observationId: observation.observationId,
    eventType: observation.eventType,
    source: {
      component: observation.source.component,
      nodeId: observation.source.nodeId,
      quality: observation.source.quality,
    },
    refs: observation.refs,
    eventTimeMs: observation.eventTimeMs,
    recordedAtMs: observation.recordedAtMs,
    metrics: observation.metrics,
    outcome: observation.outcome,
  }
}

export function projectExecutionStages(
  kind: TraceExecutionKind | null | undefined,
  observations: readonly TraceObservation[],
  context: ExecutionStageContext = {},
): ExecutionStageProjection {
  const definitions = kind ? STAGE_DEFINITIONS[kind] : undefined
  if (!kind || !definitions) return { kind: kind ?? 'other', stages: [], latestObservedStageId: null }

  // Only events named by a stage of this kind are stage evidence.
  const stageIndexByEvent: Partial<Record<TraceObservationEventType, number>> = {}
  definitions.forEach((definition, index) => {
    for (const eventType of definition.events) stageIndexByEvent[eventType] = index
  })

  const evidenceByStage: ExecutionStageEvidence[][] = definitions.map(() => [])
  const seenObservations = new Set<string>()
  for (const observation of observations) {
    const index = stageIndexByEvent[observation.eventType]
    if (index === undefined) continue
    if (kind === 'identityVerification' && !isValidIdentityStageObservation(observation, context)) continue
    if (seenObservations.has(observation.observationId)) continue
    seenObservations.add(observation.observationId)
    evidenceByStage[index].push(toEvidence(observation))
  }

  let latestObservedStageId: string | null = null
  const stages = definitions.map((definition, index) => {
    const evidence = evidenceByStage[index]
    evidence.sort(compareEvidence)
    if (evidence.length > 0) latestObservedStageId = definition.id
    return {
      id: definition.id,
      index,
      labelKey: kind === 'identityVerification'
        ? `identity.workbench.stage.${definition.id}`
        : `execution.stages.${kind}.${definition.id}`,
      status: evidence.length > 0 ? ('observed' as const) : ('notObserved' as const),
      evidence,
      hasFailureEvidence: evidence.some(
        (row) => FAILURE_EVENTS[row.eventType] === true || (!!row.outcome && FAILURE_OUTCOMES[row.outcome] === true),
      ),
    }
  })

  return { kind, stages, latestObservedStageId }
}

/** Worker completion is Audit-observed evidence; Admin reconstruction stays a separate conclusion. */
export interface IdentityWorkerStageFact {
  stage: ExecutionStage
  workerEvidenceCount: number
  hasReconstructedConclusion: boolean
}

export function projectIdentityWorkerStageFacts(
  stages: readonly ExecutionStage[],
): IdentityWorkerStageFact[] {
  return stages.map(stage => {
    let workerEvidenceCount = 0
    let hasReconstructedConclusion = false
    for (const evidence of stage.evidence) {
      if (evidence.source.component === 'Audit' && evidence.source.quality === 'observed') {
        workerEvidenceCount += 1
      }
      if (
        stage.id === 'verification'
        && evidence.eventType === 'IdentityVerificationCompleted'
        && evidence.source.component === 'Admin'
        && evidence.source.quality === 'reconstructed'
      ) {
        hasReconstructedConclusion = true
      }
    }
    return { stage, workerEvidenceCount, hasReconstructedConclusion }
  })
}
export type IdentityVerificationVerdict = 'verified' | 'notVerified' | 'unknown'

export interface IdentityVerificationConclusion {
  verified: boolean | null
  verdict: IdentityVerificationVerdict
}

/** The business verdict comes only from this Job's Trace Summary, never dispatch or Job status. */
export function projectIdentityVerificationConclusion(
  summary: TraceSummary | null,
  jobId: string | null,
): IdentityVerificationConclusion {
  const value = summary?.jobId === jobId && jobId !== null
    ? summary.references.verified
    : null
  const verified = value === true || value === false ? value : null
  return {
    verified,
    verdict: verified === true ? 'verified' : verified === false ? 'notVerified' : 'unknown',
  }
}


/** Relationship facts surrounding the five Worker Observations; neither is an Observation stage. */
export interface IdentityTaskRelations {
  dispatchLink: TraceLink | null
  settlementLink: TraceLink | null
}

export function projectIdentityTaskRelations(
  jobId: string,
  stages: readonly ExecutionStage[],
  links: readonly TraceLink[],
): IdentityTaskRelations {
  const evidence = stages.flatMap(stage => stage.evidence).find(row =>
    row.source.component === 'Audit'
    && row.source.quality === 'observed'
    && (IDENTITY_WORKER_EVENTS.has(row.eventType) || row.eventType === 'IdentityVerificationCompleted'),
  )
  const dispatchLink = evidence
    ? uniqueIdentityTaskBookLink(jobId, evidence.refs.taskId, evidence.refs.requestId, evidence.source.nodeId, links)
    : null

  const completion = stages.find(stage => stage.id === 'verification')?.evidence.find(row =>
    row.eventType === 'IdentityVerificationCompleted'
    && row.source.component === 'Audit'
    && row.source.quality === 'observed',
  )
  const settlementLink = completion
    ? uniqueIdentityTaskCompletionLink(jobId, completion.refs.taskId, completion.refs.requestId, completion.source.nodeId, links)
    : null

  return { dispatchLink, settlementLink }
}
