import type { TraceExecutionKind, TraceSourceComponent } from '@/api/trace'
import type {
  ConfirmedDispatchPacket,
  ExecutionCommunicationProjection,
  PeerStageEventType,
} from '@/features/execution/data/executionCommunication'
import type { ExecutionStage } from '@/features/execution/data/executionStages'

export type SequenceLane = Extract<TraceSourceComponent, 'Admin' | 'Audit' | 'Storage'>

export interface ChallengeFlow {
  /** Internal stage lane; absent when the stage sends work to another role. */
  lane?: SequenceLane
  from?: SequenceLane
  to?: SequenceLane
  /** `execution.sequenceChart.ops.<opKey>`. */
  opKey: string
}

/**
 * Fixed business flow of a challenge-proof Job, in presentation order. These
 * are the prototype's stage semantics, never observed traffic.
 */
export const CHALLENGE_FLOW: Readonly<Record<string, ChallengeFlow>> = {
  algorithmSelection: { lane: 'Admin', opKey: 'algorithmSelection' },
  tagRange: { from: 'Admin', to: 'Storage', opKey: 'tagRange' },
  sampling: { lane: 'Admin', opKey: 'sampling' },
  dispatch: { from: 'Admin', to: 'Audit', opKey: 'dispatch' },
  challengeGeneration: { lane: 'Audit', opKey: 'challengeGeneration' },
  challengeDelivery: { from: 'Audit', to: 'Storage', opKey: 'challengeDelivery' },
  proofGeneration: { lane: 'Storage', opKey: 'proofGeneration' },
  proofReturn: { from: 'Storage', to: 'Audit', opKey: 'proofReturn' },
  proofVerification: { lane: 'Audit', opKey: 'proofVerification' },
  settlement: { from: 'Audit', to: 'Admin', opKey: 'settlement' },
}

/**
 * A confirmed dispatch selects its stage by the fixed role route alone: every
 * TaskDispatchReq originates from Admin, and each Admin route names exactly one
 * challenge-proof stage, so a stage observation is not required to state where
 * an exact packet went.
 */
export function challengeDispatchStage(
  from: SequenceLane,
  to: SequenceLane,
): string | null {
  if (from !== 'Admin' || from === to) return null
  for (const [stageId, flow] of Object.entries(CHALLENGE_FLOW)) {
    if (flow.from === from && flow.to === to) return stageId
  }
  return null
}

/** Only observed worker facts and exact packet/peer roles vote. Ties abstain. */
export function projectSequenceRoles(
  communication: Pick<ExecutionCommunicationProjection, 'localStages' | 'confirmedPackets' | 'peerCorrelations'>,
): Map<string, SequenceLane> {
  const votes = new Map<string, Set<SequenceLane>>()
  const add = (nodeId: string | null, component: SequenceLane | null) => {
    if (!nodeId || !component) return
    const bucket = votes.get(nodeId)
    if (bucket) bucket.add(component)
    else votes.set(nodeId, new Set([component]))
  }

  for (const local of communication.localStages) add(local.nodeId, local.component)
  for (const packet of communication.confirmedPackets) add(packet.fromNodeId, 'Admin')
  for (const peer of communication.peerCorrelations) {
    const direction = peer.direction
    if (!direction) continue
    if (direction.eventType === 'ChallengeDeliveredToStorage') {
      add(direction.fromNodeId, 'Audit')
      add(direction.toNodeId, 'Storage')
    } else {
      add(direction.fromNodeId, 'Storage')
      add(direction.toNodeId, 'Audit')
    }
  }

  const roles = new Map<string, SequenceLane>()
  for (const [nodeId, components] of votes) {
    if (components.size !== 1) continue
    const [component] = components
    if (component) roles.set(nodeId, component)
  }
  return roles
}

export interface DispatchPlacement {
  /** Confirmed dispatches per business stage, in input order. */
  stagePackets: Map<string, ConfirmedDispatchPacket[]>
  /** Identity verification's dispatch relation; never a stage. */
  identityDispatchPackets: ConfirmedDispatchPacket[]
  /** Every packet the canvas draws, so none is reported as unassigned. */
  placedActivityIds: Set<string>
}

/**
 * Place confirmed dispatches on the row that names their exact role route.
 * Identity verification dispatches Admin → Audit once per Job, so that packet
 * belongs to the dispatch relation row rather than a Worker stage.
 */
export function placeConfirmedDispatches(
  kind: TraceExecutionKind | null,
  roles: ReadonlyMap<string, SequenceLane>,
  packets: readonly ConfirmedDispatchPacket[],
): DispatchPlacement {
  const stagePackets = new Map<string, ConfirmedDispatchPacket[]>()
  const identityDispatchPackets: ConfirmedDispatchPacket[] = []
  const placedActivityIds = new Set<string>()

  for (const packet of packets) {
    const from = roles.get(packet.fromNodeId)
    const to = roles.get(packet.toNodeId)
    if (!from || !to || from === to) continue

    if (kind === 'identityVerification') {
      if (from !== 'Admin' || to !== 'Audit') continue
      identityDispatchPackets.push(packet)
      placedActivityIds.add(packet.activityId)
      continue
    }

    if (kind !== 'challengeProof') continue
    const stageId = challengeDispatchStage(from, to)
    if (!stageId) continue
    const bucket = stagePackets.get(stageId)
    if (bucket) bucket.push(packet)
    else stagePackets.set(stageId, [packet])
    placedActivityIds.add(packet.activityId)
  }

  return { stagePackets, identityDispatchPackets, placedActivityIds }
}

/**
 * Match a confirmed protocol dispatch to one stage using only exact references
 * in the same namespace. Stages already contain observations scoped to the
 * active Job; time, role and identifier similarity are never used.
 */
export function matchingDispatchPacketEvidence(
  stage: Pick<ExecutionStage, 'id' | 'evidence'>,
  packet: Pick<ConfirmedDispatchPacket, 'packetId' | 'requestId' | 'taskId'>,
): ExecutionStage['evidence'][number] | null {
  for (const evidence of stage.evidence) {
    if (evidence.source.quality !== 'observed') continue

    const comparisons: [string | null, string | null][] = [
      [evidence.refs.packetId, packet.packetId],
      [evidence.refs.requestId, packet.requestId],
      [evidence.refs.taskId, packet.taskId],
    ]
    let comparableCount = 0
    let mismatch = false
    for (const [left, right] of comparisons) {
      if (left === null || left === '' || right === null || right === '') continue
      comparableCount += 1
      if (left !== right) mismatch = true
    }
    if (comparableCount > 0 && !mismatch) return evidence
  }
  return null
}

/** A packet joins a stage only when its exact evidence identifies one stage. */
export function matchDispatchPacketStage(
  stages: readonly Pick<ExecutionStage, 'id' | 'evidence'>[],
  packet: Pick<ConfirmedDispatchPacket, 'packetId' | 'requestId' | 'taskId'>,
): string | null {
  let matchedStageId: string | null = null
  for (const stage of stages) {
    if (!matchingDispatchPacketEvidence(stage, packet)) continue
    if (matchedStageId !== null && matchedStageId !== stage.id) return null
    matchedStageId = stage.id
  }
  return matchedStageId
}

/** A peer event is assigned only to its named challenge stage. */
export function peerEventMatchesStage(
  stageId: string,
  eventType: PeerStageEventType,
): boolean {
  return (stageId === 'challengeDelivery' && eventType === 'ChallengeDeliveredToStorage')
    || (stageId === 'proofReturn' && eventType === 'ProofReturnedToAudit')
}
