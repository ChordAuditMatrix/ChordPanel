import type {
  TraceObservation,
  TraceObservationEventType,
  TraceSourceComponent,
  TraceSourceQuality,
} from '@/api/trace'
import {
  executionCommunicationActivities,
  executionCommunicationActivityForObservation,
  type ExecutionCommunicationProjection,
} from '@/features/execution/data/executionCommunication'
import type { ExecutionStage } from '@/features/execution/data/executionStages'

export type MotionCueKind =
  | 'packet'
  | 'peer'
  | 'worker'
  | 'window'
  | 'part'
  | 'stage'
  | 'failure'
  | 'reconstructed'
  | 'observation'

/** Temporary presentation intent. The observation ID remains the sole fact identity. */
export interface MotionCue {
  id: string
  observationId: string
  eventType: TraceObservationEventType
  stageId: string | null
  activityId: string | null
  kind: MotionCueKind
  sourceQuality: TraceSourceQuality | null
  component: TraceSourceComponent | null
  nodeId: string | null
  partIndex: number | null
  windowIndex: number | null
}

export interface MotionCueQueue {
  /** Bounded visual intents; the Observation store remains the complete fact log. */
  items: MotionCue[]
  /** Number of presentation cues coalesced when the bounded queue overflowed. */
  aggregatedCount: number
}

export const MAX_MOTION_CUES = 32

const FAILURE_OUTCOMES: Record<string, true> = {
  failed: true,
  cancelled: true,
  timedOut: true,
}

const FAILURE_EVENTS: Record<string, true> = {
  TagWindowFailed: true,
  MaintenanceRecoveryRefused: true,
}

function isFailure(observation: TraceObservation): boolean {
  return FAILURE_EVENTS[observation.eventType] === true
    || (!!observation.outcome && FAILURE_OUTCOMES[observation.outcome] === true)
}

/** Map only recorded observations to animation intent; no cue creates a new fact. */
export function createMotionCues(
  observations: readonly TraceObservation[],
  stages: readonly ExecutionStage[],
  communication: ExecutionCommunicationProjection,
): MotionCue[] {
  const stageByObservationId = new Map<string, string>()
  for (const stage of stages) {
    for (const evidence of stage.evidence) stageByObservationId.set(evidence.observationId, stage.id)
  }

  const communicationItems = executionCommunicationActivities(communication)
  const peerByObservationId = new Map<string, ExecutionCommunicationProjection['peerCorrelations'][number]>()
  for (const peer of communication.peerCorrelations) {
    if (peer.direction) peerByObservationId.set(peer.direction.observationId, peer)
  }

  const seen = new Set<string>()
  const cues: MotionCue[] = []
  for (const observation of observations) {
    if (seen.has(observation.observationId)) continue
    seen.add(observation.observationId)

    const peer = peerByObservationId.get(observation.observationId)
    const activity = peer ?? executionCommunicationActivityForObservation(observation, communicationItems)
    let kind: MotionCueKind
    if (isFailure(observation)) kind = 'failure'
    else if (observation.source.quality === 'reconstructed') kind = 'reconstructed'
    else if (activity?.kind === 'confirmedPacket') kind = 'packet'
    else if (activity?.kind === 'peerCorrelation') kind = 'peer'
    else if (activity?.kind === 'localStage') kind = 'worker'
    else if (observation.refs.windowIndex !== null) kind = 'window'
    else if (observation.refs.partIndex !== null) kind = 'part'
    else if (stageByObservationId.has(observation.observationId)) kind = 'stage'
    else kind = 'observation'

    cues.push({
      id: observation.observationId,
      observationId: observation.observationId,
      eventType: observation.eventType,
      stageId: stageByObservationId.get(observation.observationId) ?? null,
      activityId: activity?.activityId ?? null,
      kind,
      sourceQuality: observation.source.quality,
      component: observation.source.component,
      nodeId: observation.source.nodeId,
      partIndex: observation.refs.partIndex,
      windowIndex: observation.refs.windowIndex,
    })
  }
  return cues
}

export function createMotionCueQueue(): MotionCueQueue {
  return { items: [], aggregatedCount: 0 }
}

/**
 * Keep the newest bounded cue window, retaining failures ahead of routine work.
 * Overflow changes only the visual queue; source observations are never removed.
 */
export function enqueueMotionCues(
  queue: MotionCueQueue,
  incoming: readonly MotionCue[],
  capacity = MAX_MOTION_CUES,
): MotionCueQueue {
  const limit = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : MAX_MOTION_CUES
  const items = queue.items.slice()
  const seen = new Set(items.map(cue => cue.id))
  let aggregatedCount = queue.aggregatedCount

  for (const cue of incoming) {
    if (seen.has(cue.id)) continue
    seen.add(cue.id)
    items.push(cue)
    if (items.length > limit) {
      const routineIndex = items.findIndex(item => item.kind !== 'failure')
      items.splice(routineIndex >= 0 ? routineIndex : 0, 1)
      aggregatedCount += 1
    }
  }

  return { items, aggregatedCount }
}

export function takeNextMotionCue(queue: MotionCueQueue): {
  cue: MotionCue | null
  queue: MotionCueQueue
} {
  const cue = queue.items[0] ?? null
  return cue
    ? { cue, queue: { ...queue, items: queue.items.slice(1) } }
    : { cue: null, queue }
}
