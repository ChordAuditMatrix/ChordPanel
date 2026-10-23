import type { ExecutionCommunicationActivity } from '@/features/execution/data/executionCommunication'

export interface TopologyActivityLabels {
  kind: string
  proofAccepted: string
  challengeDelivered: string
}

export interface TopologyActivityPresentation {
  summary: {
    kind: string
    path: string
  }
  technical: {
    activityId: string
  }
}

export function presentTopologyActivity(
  activity: ExecutionCommunicationActivity,
  labels: TopologyActivityLabels,
): TopologyActivityPresentation {
  let path: string
  if (activity.kind === 'localStage') {
    path = `${activity.component} · ${activity.nodeId}`
  } else if (activity.kind === 'peerCorrelation') {
    if (!activity.direction) {
      path = `${activity.originNodeId} ↔ ${activity.nodeId}`
    } else {
      const directionLabel = activity.direction.eventType === 'ProofReturnedToAudit'
        ? labels.proofAccepted
        : labels.challengeDelivered
      path = `${activity.direction.fromNodeId} → ${activity.direction.toNodeId} · ${directionLabel}`
    }
  } else {
    path = `${activity.messageType} · ${activity.fromNodeId} → ${activity.toNodeId}`
  }

  return {
    summary: { kind: labels.kind, path },
    technical: { activityId: activity.activityId },
  }
}
