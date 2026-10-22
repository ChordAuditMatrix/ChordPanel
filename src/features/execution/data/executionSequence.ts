import type { ConfirmedDispatchPacket, PeerStageEventType } from '@/features/execution/data/executionCommunication'
import type { ExecutionStage } from '@/features/execution/data/executionStages'

/**
 * A confirmed TaskDispatchReq belongs to the challenge-dispatch stage only when
 * an observed ChallengeDispatchAccepted fact shares an exact identifier in the
 * same namespace. Job id, packet id, request id and task id are never crossed.
 */
export function matchesChallengeDispatchPacket(
  stage: Pick<ExecutionStage, 'id' | 'evidence'>,
  packet: Pick<ConfirmedDispatchPacket, 'packetId' | 'requestId' | 'taskId'>,
): boolean {
  if (stage.id !== 'dispatch') return false

  for (const evidence of stage.evidence) {
    if (evidence.eventType !== 'ChallengeDispatchAccepted') continue
    if (evidence.source.quality !== 'observed') continue
    if (evidence.source.component !== 'Audit') continue


    const comparisons: [string | null, string | null][] = [
      [evidence.refs.packetId, packet.packetId],
      [evidence.refs.requestId, packet.requestId],
      [evidence.refs.taskId, packet.taskId],
    ]
    let comparableCount = 0
    let mismatch = false
    for (const [left, right] of comparisons) {
      if (left === null || right === null) continue
      comparableCount += 1
      if (left !== right) mismatch = true
    }
    if (comparableCount > 0 && !mismatch) return true
  }

  return false
}

/** A peer event is assigned only to its named presentation stage. */
export function peerEventMatchesStage(
  stageId: string,
  eventType: PeerStageEventType,
): boolean {
  return (stageId === 'challengeDelivery' && eventType === 'ChallengeDeliveredToStorage')
    || (stageId === 'proofReturn' && eventType === 'ProofReturnedToAudit')
}
