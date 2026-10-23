import type {
  TraceLink,
  TraceObservation,
  TraceObservationEventType,
  TraceProtocolEvent,
  TraceSourceComponent,
} from '@/api/trace'

/**
 * Project persisted Job Links, observations and protocol headers into scoped
 * communication evidence. No activity is inferred from event order, timestamps
 * or shared identifiers alone.
 *
 *  - `confirmedPacket` requires an exact `protocolPacket` Link and a persisted
 *    outbound `TaskDispatchReq` with the same packet identity.
 *  - `peerCorrelation` preserves exact relationship endpoints; direction
 *    requires one matching observed stage fact and never invents a packet id.
 *  - `localStage` is an observed Worker fact on a named node. Reconstructed
 *    events never highlight a node.
 *
 * Protocol DTOs carry no `jobId`; the caller supplies the active Job id for
 * them, while Links and Observations must match that id themselves.
 */

/** Stage events that may highlight the node that produced them. */
export type LocalStageEventType =
  | 'ChallengeMaterialGenerated'
  | 'ProofGenerationStarted'
  | 'ProofGenerationCompleted'
  | 'ProofVerificationCompleted'
  | 'IdentityOwnersResolved'
  | 'IdentityEvidenceValidated'
  | 'IdentityAlgorithmResolved'
  | 'IdentitySignaturesAggregated'
  | 'IdentityVerificationCompleted'

export interface ConfirmedDispatchPacket {
  kind: 'confirmedPacket'
  /** Stable, deduplicated activity id. */
  activityId: string
  jobId: string
  /** Link identity (`linkKey` and persisted `sourceRef`). */
  linkKey: string
  linkSourceRef: string
  matchBasis: 'packetCorrelation'
  confidence: 'exact'
  sourceQuality: 'observed'
  /** Persisted packet identity. */
  packetSourceRef: string
  messageType: 'TaskDispatchReq'
  /** Node that recorded the packet; equals the dispatch target. */
  nodeId: string
  fromNodeId: string
  toNodeId: string
  /** Four distinct reference namespaces, kept apart on purpose. */
  dispatchPacketId: string
  packetId: string
  requestId: string | null
  taskId: string | null
  observedAtMs: number | null
  packetTimestampMs: number | null
}

export type PeerStageEventType = 'ChallengeDeliveredToStorage' | 'ProofReturnedToAudit'

export interface PeerStageDirection {
  observationId: string
  eventType: PeerStageEventType
  fromNodeId: string
  toNodeId: string
  recordedAtMs: number
  eventTimeMs: number | null
}

export interface PeerCorrelationHint {
  kind: 'peerCorrelation'
  activityId: string
  jobId: string
  linkKind: 'peerCorrelation'
  linkKey: string
  linkSourceRef: string
  matchBasis: 'peerCorrelation'
  confidence: 'exact'
  sourceQuality: 'observed'
  /** The persisted relationship endpoints; these do not establish direction. */
  originNodeId: string
  nodeId: string
  /** Link identities remain distinct; this is not a protocol `packetId`. */
  requestId: string | null
  peerConversationId: string | null
  dispatchPacketId: string | null
  observedAtMs: number | null
  /** Direction exists only when one exact link matches one observed stage fact. */
  direction: PeerStageDirection | null
}


export interface LocalStageHighlight {
  kind: 'localStage'
  activityId: string
  jobId: string
  observationId: string
  eventType: LocalStageEventType
  sourceQuality: 'observed'
  /** Component exactly as recorded (`Audit`/`Storage`, or the actual source). */
  component: TraceSourceComponent
  nodeId: string
  refs: TraceObservation['refs']
  recordedAtMs: number
  eventTimeMs: number | null
}

export type ExecutionCommunicationActivity =
  | ConfirmedDispatchPacket
  | PeerCorrelationHint
  | LocalStageHighlight

export interface ExecutionCommunicationProjection {
  /** The active job id every item below is associated with. */
  jobId: string
  /** Exact TaskDispatchReq packets, in link input order. */
  confirmedPackets: ConfirmedDispatchPacket[]
  /** Exact peer relationships or event-backed directional hints. */
  peerCorrelations: PeerCorrelationHint[]
  /** Local worker stage highlights, in observation input order. */
  localStages: LocalStageHighlight[]

}

export interface ExecutionCommunicationInput {
  activeJobId: string
  links: readonly TraceLink[]
  observations: readonly TraceObservation[]
  /** The protocol DTO has no `jobId`; all items are scoped to `activeJobId`. */
  protocolEvents: readonly TraceProtocolEvent[]
}

const LOCAL_STAGE_COMPONENTS: Record<LocalStageEventType, TraceSourceComponent> = {
  ChallengeMaterialGenerated: 'Audit',
  ProofGenerationStarted: 'Storage',
  ProofGenerationCompleted: 'Storage',
  ProofVerificationCompleted: 'Audit',
  IdentityOwnersResolved: 'Audit',
  IdentityEvidenceValidated: 'Audit',
  IdentityAlgorithmResolved: 'Audit',
  IdentitySignaturesAggregated: 'Audit',
  IdentityVerificationCompleted: 'Audit',
}

function isFilled(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isLocalStageEventType(value: TraceObservationEventType): value is LocalStageEventType {
  return Object.prototype.hasOwnProperty.call(LOCAL_STAGE_COMPONENTS, value)
}


/** Index persisted packets by their own `packetId`; order is preserved. */
function indexPackets(
  events: readonly TraceProtocolEvent[],
): Map<string, TraceProtocolEvent[]> {
  const byPacketId = new Map<string, TraceProtocolEvent[]>()
  for (const event of events) {
    if (!isFilled(event.packetId)) continue
    const bucket = byPacketId.get(event.packetId)
    if (bucket) bucket.push(event)
    else byPacketId.set(event.packetId, [event])
  }
  return byPacketId
}

function isConfirmedDispatchLink(link: TraceLink): boolean {
  return link.linkKind === 'protocolPacket'
    && link.matchBasis === 'packetCorrelation'
    && link.confidence === 'exact'
    && link.sourceQuality === 'observed'
}

function isConfirmedPeerLink(link: TraceLink): boolean {
  return link.linkKind === 'peerCorrelation'
    && link.matchBasis === 'peerCorrelation'
    && link.confidence === 'exact'
    && link.sourceQuality === 'observed'
}

interface ExactDispatchIdentity {
  packet: TraceProtocolEvent
  dispatchPacketId: string
  linkNodeId: string
  fromNodeId: string
  toNodeId: string
}

/**
 * Select the one packet that carries the exact same identity as the link.
 * Timestamps, correlation ids, nearby times and `jobId` equality are never
 * consulted.
 */
function selectDispatchPacket(
  link: TraceLink,
  packetsByPacketId: Map<string, TraceProtocolEvent[]>,
): ExactDispatchIdentity | null {
  const dispatchPacketId = link.dispatchPacketId
  const linkNodeId = link.nodeId
  if (!isFilled(dispatchPacketId) || !isFilled(linkNodeId)) return null

  for (const packet of packetsByPacketId.get(dispatchPacketId) ?? []) {
    if (packet.messageType !== 'TaskDispatchReq') continue
    if (packet.confidence !== 'exact') continue
    if (packet.matchBasis !== 'packetCorrelation') continue
    if (packet.sourceQuality !== 'observed') continue
    if (packet.direction !== 'outbound') continue
    if (packet.authenticatedNodeId !== linkNodeId) continue
    const fromNodeId = packet.fromNodeId
    const toNodeId = packet.toNodeId
    if (!isFilled(fromNodeId) || !isFilled(toNodeId)) continue
    if (fromNodeId === toNodeId) continue
    if (packet.packetId !== dispatchPacketId) continue
    if (packet.nodeId !== linkNodeId) continue
    if (toNodeId !== linkNodeId) continue
    return { packet, dispatchPacketId, linkNodeId, fromNodeId, toNodeId }
  }
  return null
}
function localStageComponent(
  eventType: LocalStageEventType,
  component: TraceSourceComponent | null,
): TraceSourceComponent | null {
  if (component === null) return null
  const expected = LOCAL_STAGE_COMPONENTS[eventType]
  return component === expected ? component : null
}


function peerStageDirection(
  link: TraceLink,
  observation: TraceObservation,
): PeerStageDirection | null {
  if (observation.jobId !== link.jobId) return null
  if (!isFilled(link.requestId) || observation.refs.requestId !== link.requestId) return null
  if (
    !isFilled(link.peerConversationId)
    || observation.refs.challengeCorrelationId !== link.peerConversationId
  ) return null
  if (observation.source.quality !== 'observed') return null
  if (observation.source.component !== 'Audit' || observation.source.nodeId !== link.originNodeId) return null

  if (observation.eventType === 'ChallengeDeliveredToStorage') {
    return {
      observationId: observation.observationId,
      eventType: observation.eventType,
      fromNodeId: link.originNodeId!,
      toNodeId: link.nodeId!,
      recordedAtMs: observation.recordedAtMs,
      eventTimeMs: observation.eventTimeMs,
    }
  }

  if (observation.eventType === 'ProofReturnedToAudit') {
    return {
      observationId: observation.observationId,
      eventType: observation.eventType,
      fromNodeId: link.nodeId!,
      toNodeId: link.originNodeId!,
      recordedAtMs: observation.recordedAtMs,
      eventTimeMs: observation.eventTimeMs,
    }
  }

  return null
}

function selectPeerDirections(
  link: TraceLink,
  candidateLinks: readonly TraceLink[],
  observations: readonly TraceObservation[],
): PeerStageDirection[] {
  const directions: PeerStageDirection[] = []
  for (const observation of observations) {
    const direction = peerStageDirection(link, observation)
    if (!direction) continue

    let matchingLinks = 0
    for (const candidate of candidateLinks) {
      if (peerStageDirection(candidate, observation)) matchingLinks += 1
      if (matchingLinks > 1) break
    }
    if (matchingLinks === 1) directions.push(direction)
  }
  return directions
}


/**
 * Project persisted links, observations and protocol headers into evidence
 * activities. Duplicate inputs collapse on their stable activity id; the first
 * occurrence wins and input order is preserved.
 */
/**
 * Restrict packet/peer evidence to identities present in a historical
 * observation prefix. Links and protocol DTOs have no shared recording clock,
 * so replay must not expose their future tail by timestamp.
 */
export function restrictCommunicationEvidenceToReplayPrefix(
  activeJobId: string,
  observations: readonly TraceObservation[],
  links: readonly TraceLink[],
  protocolEvents: readonly TraceProtocolEvent[],
): Pick<ExecutionCommunicationInput, 'links' | 'protocolEvents'> {
  const visiblePacketIds = new Set<string>()
  const visibleRequestIds = new Set<string>()
  const visibleTaskIds = new Set<string>()
  const scopedObservations = observations.filter(observation => observation.jobId === activeJobId)

  for (const observation of scopedObservations) {
    if (isFilled(observation.refs.packetId)) visiblePacketIds.add(observation.refs.packetId)
    if (isFilled(observation.refs.requestId)) visibleRequestIds.add(observation.refs.requestId)
    if (isFilled(observation.refs.taskId)) visibleTaskIds.add(observation.refs.taskId)
  }

  const replayLinks = links.filter((link) => {
    if (link.jobId !== activeJobId) return false
    if (isConfirmedDispatchLink(link)) {
      return (isFilled(link.dispatchPacketId) && visiblePacketIds.has(link.dispatchPacketId))
        || (isFilled(link.requestId) && visibleRequestIds.has(link.requestId))
        || (isFilled(link.taskId) && visibleTaskIds.has(link.taskId))
    }
    if (!isConfirmedPeerLink(link)) return false
    return scopedObservations.some(observation => peerStageDirection(link, observation) !== null)
  })

  const dispatchPacketIds = new Set(
    replayLinks
      .filter(isConfirmedDispatchLink)
      .map(link => link.dispatchPacketId)
      .filter(isFilled),
  )
  return {
    links: replayLinks,
    protocolEvents: protocolEvents.filter(event => dispatchPacketIds.has(event.packetId)),
  }
}

export function projectExecutionCommunication(
  input: ExecutionCommunicationInput,
): ExecutionCommunicationProjection {
  const jobId = input.activeJobId
  const projection: ExecutionCommunicationProjection = {
    jobId,
    confirmedPackets: [],
    peerCorrelations: [],
    localStages: [],
  }
  if (!isFilled(jobId)) return projection

  const seen = new Set<string>()
  const packetsByPacketId = indexPackets(input.protocolEvents)
  const peerLinksByRequestId = new Map<string, TraceLink[]>()
  for (const link of input.links) {
    if (link.jobId !== jobId || !isConfirmedPeerLink(link)) continue
    if (!isFilled(link.linkKey)) continue

    if (!isFilled(link.originNodeId) || !isFilled(link.nodeId) || link.originNodeId === link.nodeId) continue
    if (!isFilled(link.requestId)) continue
    const links = peerLinksByRequestId.get(link.requestId) ?? []
    if (links.some(existing => existing.linkKey === link.linkKey)) continue

    links.push(link)
    peerLinksByRequestId.set(link.requestId, links)
  }

  const observationsByRequestId = new Map<string, TraceObservation[]>()
  for (const observation of input.observations) {
    if (observation.jobId !== jobId || !isFilled(observation.refs.requestId)) continue
    const observations = observationsByRequestId.get(observation.refs.requestId) ?? []
    observations.push(observation)
    observationsByRequestId.set(observation.refs.requestId, observations)
  }


  for (const link of input.links) {
    if (link.jobId !== jobId) continue
    if (!isFilled(link.linkKey)) continue

    if (isConfirmedDispatchLink(link)) {
      const exact = selectDispatchPacket(link, packetsByPacketId)
      if (!exact) continue
      const packet = exact.packet
      const activityId = `confirmedPacket:${link.linkKey}:${packet.packetId}:${packet.nodeId}`
      if (seen.has(activityId)) continue
      seen.add(activityId)
      projection.confirmedPackets.push({
        kind: 'confirmedPacket',
        activityId,
        jobId,
        linkKey: link.linkKey,
        linkSourceRef: link.sourceRef,
        packetSourceRef: packet.sourceRef,
        messageType: 'TaskDispatchReq',
        nodeId: exact.linkNodeId,
        matchBasis: 'packetCorrelation',
        confidence: 'exact',
        sourceQuality: 'observed',
        fromNodeId: exact.fromNodeId,
        toNodeId: exact.toNodeId,
        dispatchPacketId: exact.dispatchPacketId,
        packetId: packet.packetId,
        requestId: link.requestId,
        taskId: link.taskId,
        observedAtMs: link.observedAtMs,
        packetTimestampMs: packet.timestampMs,
      })
      continue
    }

    if (!isConfirmedPeerLink(link)) continue
    const originNodeId = link.originNodeId
    const nodeId = link.nodeId
    if (!isFilled(originNodeId) || !isFilled(nodeId) || originNodeId === nodeId) continue

    const requestId = isFilled(link.requestId) ? link.requestId : null
    const peerConversationId = isFilled(link.peerConversationId) ? link.peerConversationId : null
    const dispatchPacketId = isFilled(link.dispatchPacketId) ? link.dispatchPacketId : null
    const candidateLinks = requestId === null ? [] : peerLinksByRequestId.get(requestId) ?? []
    const peerObservations = requestId === null ? [] : observationsByRequestId.get(requestId) ?? []
    const directions = selectPeerDirections(link, candidateLinks, peerObservations)

    const items: (PeerStageDirection | null)[] = directions.length ? directions : [null]
    for (const direction of items) {
      const activityId = direction
        ? `peerCorrelation:${link.linkKey}:${direction.observationId}`
        : `peerCorrelation:${link.linkKey}:relationship`
      if (seen.has(activityId)) continue
      seen.add(activityId)
      projection.peerCorrelations.push({
        kind: 'peerCorrelation',
        activityId,
        jobId,
        linkKind: 'peerCorrelation',
        linkKey: link.linkKey,
        linkSourceRef: link.sourceRef,
        originNodeId,
        matchBasis: 'peerCorrelation',
        confidence: 'exact',
        sourceQuality: 'observed',
        nodeId,
        requestId,
        peerConversationId,
        dispatchPacketId,
        observedAtMs: link.observedAtMs,
        direction,
      })
    }
  }



  for (const observation of input.observations) {
    if (observation.jobId !== jobId) continue
    if (!isLocalStageEventType(observation.eventType)) continue
    // Reconstructed facts never highlight a node: only observed worker facts do.
    if (observation.source.quality !== 'observed') continue
    const nodeId = observation.source.nodeId
    if (!isFilled(nodeId)) continue
    const component = localStageComponent(observation.eventType, observation.source.component)
    if (component === null) continue
    const activityId = `localStage:${observation.observationId}`
    if (seen.has(activityId)) continue
    seen.add(activityId)
    projection.localStages.push({
      kind: 'localStage',
      activityId,
      jobId,
      observationId: observation.observationId,
      eventType: observation.eventType,
      component,
      sourceQuality: 'observed',
      nodeId,
      refs: observation.refs,
      recordedAtMs: observation.recordedAtMs,
      eventTimeMs: observation.eventTimeMs,
    })
  }

  return projection
}

/** Stable display order: confirmed packets, peer relations, then local stages. */
export function executionCommunicationActivities(
  projection: ExecutionCommunicationProjection,
): ExecutionCommunicationActivity[] {
  return [
    ...projection.confirmedPackets,
    ...projection.peerCorrelations,
    ...projection.localStages,
  ]
}
/**
 * Match an Observation to only the communication evidence it identifies
 * exactly. `taskId` is intentionally not a packet identity.
 */
export function executionCommunicationActivityForObservation(
  observation: Pick<TraceObservation, 'observationId' | 'refs'> | null | undefined,
  activities: readonly ExecutionCommunicationActivity[],
): ExecutionCommunicationActivity | null {
  if (!observation) return null
  return activities.find((activity) => {
    if (activity.kind === 'confirmedPacket') {
      return isFilled(observation.refs.packetId)
        && activity.packetId === observation.refs.packetId
    }
    if (activity.kind === 'peerCorrelation') {
      return activity.direction?.observationId === observation.observationId
    }
    return activity.observationId === observation.observationId
  }) ?? null
}
