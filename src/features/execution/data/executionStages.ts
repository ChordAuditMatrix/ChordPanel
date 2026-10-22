import type {
  TraceExecutionKind,
  TraceObservation,
  TraceObservationEventType,
  TraceObservationMetrics,
  TraceObservationOutcome,
  TraceSourceComponent,
  TraceSourceQuality,
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
      events: ['TagPartGenerationStarted', 'TagWindowGenerated', 'TagWindowFailed', 'TagWindowCancelled'],
    },
    { id: 'storage', events: ['TagDumpDispatched', 'TagDumpAccounted'] },
    { id: 'settlement', events: ['TagPartCompleted', 'TagGenerationFinalized'] },
  ],
  identityVerification: [
    { id: 'dispatch', events: ['IdentityDispatchAccepted'] },
    { id: 'verification', events: ['IdentityVerificationCompleted'] },
  ],
  other: [],
  maintenance: [{ id: 'recovery', events: ['MaintenanceRecoveryRequested', 'MaintenanceRecoveryRefused'] }],
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
      labelKey: `execution.stages.${kind}.${definition.id}`,
      status: evidence.length > 0 ? ('observed' as const) : ('notObserved' as const),
      evidence,
      hasFailureEvidence: evidence.some(
        (row) => FAILURE_EVENTS[row.eventType] === true || (!!row.outcome && FAILURE_OUTCOMES[row.outcome] === true),
      ),
    }
  })

  return { kind, stages, latestObservedStageId }
}
