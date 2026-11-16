import type { CSSProperties } from 'vue'
import type { TraceExecutionKind } from '@/api/trace'
import type {
  ConfirmedDispatchPacket,
  PeerCorrelationHint,
  PeerStageDirection,
} from '@/features/execution/data/executionCommunication'
import type { ExecutionStage } from '@/features/execution/data/executionStages'
import {
  CHALLENGE_FLOW,
  peerEventMatchesStage,
  type DispatchPlacement,
  type SequenceLane,
} from '@/features/execution/data/executionSequence'

/**
 * Pure layout and row projection for the evidence-backed sequence canvas.
 *
 * A row exists only for a projected execution stage; lanes, flow endpoints and
 * peer placement come from fixed business roles and exact observed evidence.
 * Travel durations are presentation only and derive from the drawn segment, so
 * no motion implies a measured interval.
 */

export interface SequenceLaneDefinition {
  id: SequenceLane
  centerX: number
  labelKey: string
}

export const SEQUENCE_CHALLENGE_LANES: readonly SequenceLaneDefinition[] = [
  { id: 'Admin', centerX: 100, labelKey: 'execution.topology.admin' },
  { id: 'Audit', centerX: 300, labelKey: 'execution.topology.audit' },
  { id: 'Storage', centerX: 500, labelKey: 'execution.topology.storage' },
]

export const SEQUENCE_IDENTITY_LANES: readonly SequenceLaneDefinition[] = [
  { id: 'Admin', centerX: 150, labelKey: 'execution.topology.admin' },
  { id: 'Audit', centerX: 450, labelKey: 'execution.topology.audit' },
]

export const SEQUENCE_LANE_X: Readonly<Record<SequenceLane, number>> = {
  Admin: 100,
  Audit: 300,
  Storage: 500,
}

/** Horizontal gap kept between a lane centre and the arrowhead marker. */
export const SEQUENCE_PACKET_MARKER_INSET = 14

const TRAVEL_BASE_MS = 520
const TRAVEL_MAX_MS = 1_000
const TRAVEL_MS_PER_UNIT = 1.2

/**
 * Identity verification spreads its two lanes wider than the challenge canvas,
 * so relation rows and dispatch geometry read the identity positions.
 */
export function sequenceLaneX(kind: TraceExecutionKind | null, lane: SequenceLane): number {
  if (kind === 'identityVerification') {
    const identityLane = SEQUENCE_IDENTITY_LANES.find(item => item.id === lane)
    if (identityLane) return identityLane.centerX
  }
  return SEQUENCE_LANE_X[lane]
}

export function sequenceDirectionSign(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
): 1 | -1 {
  if (!from || !to) return 1
  return sequenceLaneX(kind, to) > sequenceLaneX(kind, from) ? 1 : -1
}

/** Exact point where the confirmed arrowhead stops short of the target lane. */
export function sequenceTargetMarkerX(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
): number {
  if (!to) return 0
  return sequenceLaneX(kind, to) - sequenceDirectionSign(kind, from, to) * SEQUENCE_PACKET_MARKER_INSET
}

export function sequenceTravelDistance(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
): number {
  if (!from || !to) return 0
  return sequenceTargetMarkerX(kind, from, to) - sequenceLaneX(kind, from)
}

export function sequenceTravelDurationMs(distance: number): number {
  return Math.min(TRAVEL_MAX_MS, Math.round(TRAVEL_BASE_MS + Math.abs(distance) * TRAVEL_MS_PER_UNIT))
}

export function sequenceFlowMidX(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
): number {
  if (!from || !to) return 0
  return (sequenceLaneX(kind, from) + sequenceLaneX(kind, to)) / 2
}

export function sequenceFlowPath(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
  y: number,
): string {
  if (!from || !to) return ''
  return `M ${sequenceLaneX(kind, from)} ${y} L ${sequenceTargetMarkerX(kind, from, to)} ${y}`
}

export interface SequenceTravelStyle extends CSSProperties {
  '--travel-distance': string
  '--travel-duration': string
}

/**
 * Geometry for one observed activity only. The token covers the exact drawn
 * segment once; the duration follows the segment length so short hops stay
 * visible without becoming decoration.
 */
export function sequenceTravelStyle(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
): SequenceTravelStyle {
  return {
    '--travel-distance': `${sequenceTravelDistance(kind, from, to)}px`,
    '--travel-duration': `${sequenceTravelDurationMs(sequenceTravelDistance(kind, from, to))}ms`,
  }
}

export interface SequenceDispatchGeometry {
  adminX: number
  auditX: number
  /** Arrowhead stop for the identity dispatch relation. */
  markerX: number
  distance: number
  durationMs: number
  path: string
  travelStyle: SequenceTravelStyle
  /** Centre of the dispatch relation label. */
  labelX: number
}

/**
 * The dispatch relation row draws the packet only at its exact observed
 * endpoints: Admin lane to the Audit arrowhead inset.
 */
export function sequenceDispatchGeometry(kind: TraceExecutionKind | null): SequenceDispatchGeometry {
  const adminX = sequenceLaneX(kind, 'Admin')
  const auditX = sequenceLaneX(kind, 'Audit')
  const markerX = auditX - SEQUENCE_PACKET_MARKER_INSET
  const distance = markerX - adminX
  const durationMs = sequenceTravelDurationMs(distance)
  return {
    adminX,
    auditX,
    markerX,
    distance,
    durationMs,
    path: `M ${adminX} 22 L ${markerX} 22`,
    travelStyle: {
      '--travel-distance': `${distance}px`,
      '--travel-duration': `${durationMs}ms`,
    },
    labelX: (adminX + auditX) / 2,
  }
}

/** Peer acceptance is drawn as a link diamond, never as a packet token. */
export function sequencePeerResponsePath(
  kind: TraceExecutionKind | null,
  from: SequenceLane | null | undefined,
  to: SequenceLane | null | undefined,
): string {
  if (!from || !to) return ''
  const x = sequenceTargetMarkerX(kind, from, to)
  return `M ${x} 33 L ${x + 9} 42 L ${x} 51 L ${x - 9} 42 Z`
}

/** A peer direction exists only when both endpoints differ and were observed. */
export function sequencePeerDirection(
  peer: Pick<PeerCorrelationHint, 'direction'>,
): PeerStageDirection | null {
  const direction = peer.direction
  if (!direction || direction.fromNodeId === direction.toNodeId) return null
  return direction
}

export interface PlacedSequencePeer {
  peer: PeerCorrelationHint
  from: SequenceLane
  to: SequenceLane
}

/**
 * Peers keep their exact observed endpoints and resolve to fixed roles; an
 * unresolved role or an endpoint collapse stays out of the canvas.
 */
export function placeSequencePeers(
  peers: readonly PeerCorrelationHint[],
  roles: ReadonlyMap<string, SequenceLane>,
): PlacedSequencePeer[] {
  const placed: PlacedSequencePeer[] = []
  for (const peer of peers) {
    const direction = sequencePeerDirection(peer)
    if (!direction) continue
    const from = roles.get(direction.fromNodeId)
    const to = roles.get(direction.toNodeId)
    if (!from || !to || from === to) continue
    placed.push({ peer, from, to })
  }
  return placed
}

export type SequenceInternalState = 'observed' | 'reconstructed' | 'logical'

export interface SequenceRow {
  stage: ExecutionStage
  /** `execution.sequenceChart.ops.<opKey>` when the stage follows a fixed flow. */
  flowLabelKey: string | null
  lane: SequenceLane | null
  fromLane: SequenceLane | null
  toLane: SequenceLane | null
  confirmed: ConfirmedDispatchPacket[]
  directedPeers: PlacedSequencePeer[]
  internal: SequenceInternalState | null
  evidenceCount: number
  animatedPacket: boolean
  animatedPeer: boolean
  animatedInternal: boolean
  motionLoop: boolean
  cueFocus: boolean
  selected: boolean
  adminConclusion: boolean
}

export interface SequenceRowProjectionInput {
  kind: TraceExecutionKind | null
  stages: readonly ExecutionStage[]
  dispatchPlacement: Pick<DispatchPlacement, 'stagePackets'>
  peers: readonly PlacedSequencePeer[]
  animationActivityId?: string | null
  loopActivityIds?: readonly string[]
  selectedStageId?: string | null
  activeLocalStage?: { observationId: string } | null
}

/**
 * Project stage rows without translating labels. A confirmed dispatch keeps
 * its fixed role row even when no stage observation exists; a peer direction
 * joins only its named challenge stage. Identity verification's Admin
 * conclusion stays a reconstructed annotation, never a worker stage.
 */
export function projectSequenceRows(
  input: SequenceRowProjectionInput,
): SequenceRow[] {
  const isIdentity = input.kind === 'identityVerification'
  const animationActivityId = input.animationActivityId ?? null
  const loopActivityIds = input.loopActivityIds ?? []
  const activeLocalStage = input.activeLocalStage ?? null

  return input.stages.map(stage => {
    const flow = input.kind === 'challengeProof' ? CHALLENGE_FLOW[stage.id] : undefined
    const workerObservedAudit = stage.evidence.some(evidence =>
      evidence.source.component === 'Audit' && evidence.source.quality === 'observed',
    )
    const adminConclusion = isIdentity && stage.id === 'verification'
      && stage.evidence.some(evidence =>
        evidence.eventType === 'IdentityVerificationCompleted'
        && evidence.source.component === 'Admin'
        && evidence.source.quality === 'reconstructed',
      )
    const lane = isIdentity
      ? (workerObservedAudit ? 'Audit' : null)
      : flow?.lane ?? null
    const fromLane = flow?.from ?? null
    const toLane = flow?.to ?? null
    const confirmed = input.dispatchPlacement.stagePackets.get(stage.id) ?? []
    const directedPeers = fromLane && toLane
      ? input.peers.filter(item => {
        const direction = item.peer.direction
        return item.from === fromLane
          && item.to === toLane
          && direction !== null
          && peerEventMatchesStage(stage.id, direction.eventType)
      })
      : []
    const animatedInternal = Boolean(lane && activeLocalStage
      && stage.evidence.some(evidence =>
        evidence.observationId === activeLocalStage.observationId
        && evidence.source.component === lane,
      ))

    // A lane-bearing row always renders as observed: challenge internal stages
    // own a fixed lane, and identity rows gain one only from observed Audit
    // evidence. A row without a lane carries no internal computation block.
    const internal: SequenceInternalState | null = lane ? 'observed' : null

    const loopingPacket = confirmed.some(item => loopActivityIds.includes(item.activityId))
    const loopingPeer = directedPeers.some(item => loopActivityIds.includes(item.peer.activityId))
    const animatedPacket = Boolean(animationActivityId)
      && confirmed.some(item => item.activityId === animationActivityId)
    const animatedPeer = Boolean(animationActivityId)
      && directedPeers.some(item => item.peer.activityId === animationActivityId)

    return {
      stage,
      flowLabelKey: flow ? `execution.sequenceChart.ops.${flow.opKey}` : null,
      lane,
      fromLane,
      toLane,
      confirmed,
      directedPeers,
      internal,
      evidenceCount: stage.evidence.length,
      animatedPacket: animatedPacket || loopingPacket,
      animatedPeer: animatedPeer || loopingPeer,
      animatedInternal,
      motionLoop: loopingPacket || loopingPeer,
      cueFocus: animatedPacket || animatedPeer || animatedInternal || loopingPacket || loopingPeer,
      selected: stage.id === input.selectedStageId,
      adminConclusion,
    }
  })
}
