import type { ConfirmedDispatchPacket, PeerStageEventType } from '@/features/execution/data/executionCommunication'
import type { ExecutionStage } from '@/features/execution/data/executionStages'

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
