import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createProjectVite } from './shared/viteHarness.mjs'

const vite = await createProjectVite()

after(async () => { await vite.close() })

const {
  SEQUENCE_CHALLENGE_LANES,
  SEQUENCE_IDENTITY_LANES,
  placeSequencePeers,
  projectSequenceRows,
  sequenceDispatchGeometry,
  sequenceFlowMidX,
  sequenceFlowPath,
  sequenceLaneX,
  sequencePeerDirection,
  sequencePeerResponsePath,
  sequenceTargetMarkerX,
  sequenceTravelDistance,
  sequenceTravelDurationMs,
  sequenceTravelStyle,
} = await vite.ssrLoadModule('/src/features/execution/data/executionSequenceLayout.ts')

const roles = new Map([
  ['admin-1', 'Admin'],
  ['audit-1', 'Audit'],
  ['storage-1', 'Storage'],
])

function stage(id, overrides = {}) {
  return {
    id,
    index: 0,
    labelKey: `execution.stages.challengeProof.${id}`,
    status: 'notObserved',
    evidence: [],
    hasFailureEvidence: false,
    ...overrides,
  }
}

function evidence(overrides = {}) {
  return {
    observationId: 'obs-1',
    eventType: 'ChallengeMaterialGenerated',
    source: { component: 'Audit', nodeId: 'audit-1', quality: 'observed' },
    refs: {},
    ...overrides,
  }
}

function packet(overrides = {}) {
  return {
    kind: 'confirmedPacket',
    activityId: 'packet-1',
    jobId: 'job-1',
    fromNodeId: 'admin-1',
    toNodeId: 'audit-1',
    ...overrides,
  }
}

function peer(activityId, directionValue, overrides = {}) {
  return {
    kind: 'peerCorrelation',
    activityId,
    jobId: 'job-1',
    originNodeId: directionValue?.fromNodeId ?? null,
    nodeId: directionValue?.toNodeId ?? null,
    direction: directionValue,
    ...overrides,
  }
}

function direction(fromNodeId, toNodeId, eventType = 'ChallengeDeliveredToStorage') {
  return { observationId: `obs-${eventType}`, eventType, fromNodeId, toNodeId }
}

function projectRows({ kind = 'challengeProof', stages, stagePackets = new Map(), peers = [], ...options }) {
  return projectSequenceRows({
    kind,
    stages,
    dispatchPlacement: { stagePackets },
    peers,
    ...options,
  })
}

test('lane positions use the wider identity canvas without moving challenge lanes', () => {
  assert.deepEqual(SEQUENCE_CHALLENGE_LANES.map(lane => lane.centerX), [100, 300, 500])
  assert.deepEqual(SEQUENCE_IDENTITY_LANES.map(lane => lane.centerX), [150, 450])
  assert.equal(sequenceLaneX('challengeProof', 'Admin'), 100)
  assert.equal(sequenceLaneX('challengeProof', 'Audit'), 300)
  assert.equal(sequenceLaneX('challengeProof', 'Storage'), 500)
  assert.equal(sequenceLaneX('identityVerification', 'Admin'), 150)
  assert.equal(sequenceLaneX('identityVerification', 'Audit'), 450)
  assert.equal(sequenceLaneX('identityVerification', 'Storage'), 500)
})

test('flow geometry stops at the target arrowhead and derives presentation travel', () => {
  assert.equal(sequenceTargetMarkerX('challengeProof', 'Admin', 'Audit'), 286)
  assert.equal(sequenceTravelDistance('challengeProof', 'Admin', 'Audit'), 186)
  assert.equal(sequenceTravelDurationMs(186), 743)
  assert.equal(sequenceFlowPath('challengeProof', 'Admin', 'Audit', 22), 'M 100 22 L 286 22')
  assert.equal(sequenceFlowMidX('challengeProof', 'Admin', 'Audit'), 200)
  assert.deepEqual(sequenceTravelStyle('challengeProof', 'Admin', 'Audit'), {
    '--travel-distance': '186px',
    '--travel-duration': '743ms',
  })

  assert.equal(sequenceTargetMarkerX('challengeProof', 'Storage', 'Admin'), 114)
  assert.equal(sequenceTravelDistance('challengeProof', 'Storage', 'Admin'), -386)
  assert.equal(sequenceTravelDurationMs(-386), 983)
  assert.equal(sequenceFlowPath('challengeProof', 'Storage', 'Admin', 42), 'M 500 42 L 114 42')
  assert.equal(
    sequencePeerResponsePath('challengeProof', 'Storage', 'Admin'),
    'M 114 33 L 123 42 L 114 51 L 105 42 Z',
  )

  assert.equal(sequenceFlowPath('challengeProof', null, 'Audit', 22), '')
  assert.equal(sequencePeerResponsePath('challengeProof', 'Admin', null), '')
  assert.deepEqual(sequenceTravelStyle('challengeProof', null, 'Audit'), {
    '--travel-distance': '0px',
    '--travel-duration': '520ms',
  })
})

test('identity dispatch geometry uses the observed relation endpoints', () => {
  assert.deepEqual(sequenceDispatchGeometry('identityVerification'), {
    adminX: 150,
    auditX: 450,
    markerX: 436,
    distance: 286,
    durationMs: 863,
    path: 'M 150 22 L 436 22',
    travelStyle: {
      '--travel-distance': '286px',
      '--travel-duration': '863ms',
    },
    labelX: 300,
  })
})

test('peer placement needs an exact direction and resolved distinct roles', () => {
  const delivered = peer('peer-delivery', direction('audit-1', 'storage-1'))
  const returned = peer('peer-return', direction('storage-1', 'audit-1', 'ProofReturnedToAudit'))
  const selfDirected = peer('peer-self', direction('audit-1', 'audit-1'))
  const unresolved = peer('peer-unknown', direction('unknown-1', 'audit-1'))
  const undirected = peer('peer-undirected', null)

  assert.equal(sequencePeerDirection(selfDirected), null)
  assert.equal(sequencePeerDirection(undirected), null)
  assert.equal(sequencePeerDirection(delivered).eventType, 'ChallengeDeliveredToStorage')

  const placed = placeSequencePeers(
    [delivered, returned, selfDirected, unresolved, undirected],
    roles,
  )
  assert.deepEqual(placed.map(item => ({
    activityId: item.peer.activityId,
    from: item.from,
    to: item.to,
  })), [
    { activityId: 'peer-delivery', from: 'Audit', to: 'Storage' },
    { activityId: 'peer-return', from: 'Storage', to: 'Audit' },
  ])
})

test('challenge rows keep fixed lanes and place only named peer directions', () => {
  const deliveredPeer = peer('peer-delivery', direction('audit-1', 'storage-1'))
  const returnedPeer = peer('peer-return', direction('storage-1', 'audit-1', 'ProofReturnedToAudit'))
  const peers = placeSequencePeers([deliveredPeer, returnedPeer], roles)

  const rows = projectRows({
    stages: [
      stage('algorithmSelection', {
        index: 0,
        evidence: [evidence()],
      }),
      stage('dispatch', { index: 3 }),
      stage('challengeDelivery', { index: 5 }),
      stage('proofReturn', { index: 7 }),
      stage('settlement', { index: 9 }),
      stage('customStage', { index: 10 }),
    ],
    stagePackets: new Map([['dispatch', [packet()]]]),
    peers,
    selectedStageId: 'dispatch',
  })

  const [selection, dispatch, delivery, proofReturn, settlement, custom] = rows
  assert.equal(selection.lane, 'Admin')
  assert.equal(selection.flowLabelKey, 'execution.sequenceChart.ops.algorithmSelection')
  assert.equal(selection.internal, 'observed')
  assert.equal(selection.fromLane, null)
  assert.equal(selection.evidenceCount, 1)

  assert.equal(dispatch.lane, null)
  assert.equal(dispatch.fromLane, 'Admin')
  assert.equal(dispatch.toLane, 'Audit')
  assert.equal(dispatch.confirmed.length, 1)
  assert.equal(dispatch.selected, true)

  assert.deepEqual(delivery.directedPeers.map(item => item.peer.activityId), ['peer-delivery'])
  assert.deepEqual(proofReturn.directedPeers.map(item => item.peer.activityId), ['peer-return'])
  assert.equal(delivery.fromLane, 'Audit')
  assert.equal(delivery.toLane, 'Storage')
  assert.equal(settlement.fromLane, 'Audit')
  assert.equal(settlement.toLane, 'Admin')

  assert.equal(custom.flowLabelKey, null)
  assert.equal(custom.lane, null)
  assert.equal(custom.internal, null)
})

test('motion flags follow the incoming activity without inventing a duration claim', () => {
  const [packetRow] = projectRows({
    stages: [stage('dispatch')],
    stagePackets: new Map([['dispatch', [packet()]]]),
    animationActivityId: 'packet-1',
  })
  assert.equal(packetRow.animatedPacket, true)
  assert.equal(packetRow.cueFocus, true)
  assert.equal(packetRow.motionLoop, false)

  const [loopingPacket] = projectRows({
    stages: [stage('dispatch')],
    stagePackets: new Map([['dispatch', [packet()]]]),
    loopActivityIds: ['packet-1'],
  })
  assert.equal(loopingPacket.animatedPacket, true)
  assert.equal(loopingPacket.motionLoop, true)
  assert.equal(loopingPacket.cueFocus, true)

  const deliveredPeer = peer('peer-delivery', direction('audit-1', 'storage-1'))
  const [peerRow] = projectRows({
    stages: [stage('challengeDelivery')],
    peers: placeSequencePeers([deliveredPeer], roles),
    animationActivityId: 'peer-delivery',
  })
  assert.equal(peerRow.animatedPeer, true)
  assert.equal(peerRow.animatedPacket, false)
  assert.equal(peerRow.cueFocus, true)

  const adminEvidence = evidence({
    source: { component: 'Admin', nodeId: 'admin-1', quality: 'observed' },
  })
  const [internalRow] = projectRows({
    stages: [stage('algorithmSelection', { evidence: [adminEvidence] })],
    activeLocalStage: { observationId: 'obs-1' },
  })
  assert.equal(internalRow.animatedInternal, true)
  assert.equal(internalRow.cueFocus, true)

  const [unrelatedInternal] = projectRows({
    stages: [stage('algorithmSelection', { evidence: [adminEvidence] })],
    activeLocalStage: { observationId: 'obs-other' },
  })
  assert.equal(unrelatedInternal.animatedInternal, false)
  assert.equal(unrelatedInternal.cueFocus, false)
})

test('identity rows carry an Admin conclusion without turning it into a worker lane', () => {
  const rows = projectRows({
    kind: 'identityVerification',
    stages: [
      stage('ownersResolved', {
        evidence: [evidence({ observationId: 'obs-owners' })],
      }),
      stage('verification', {
        evidence: [
          evidence({
            observationId: 'obs-conclusion',
            eventType: 'IdentityVerificationCompleted',
            source: { component: 'Admin', nodeId: 'admin-1', quality: 'reconstructed' },
          }),
        ],
      }),
    ],
    selectedStageId: 'verification',
  })

  const [owners, verification] = rows
  assert.equal(owners.lane, 'Audit')
  assert.equal(owners.internal, 'observed')
  assert.equal(owners.flowLabelKey, null)
  assert.equal(owners.adminConclusion, false)

  assert.equal(verification.lane, null)
  assert.equal(verification.internal, null)
  assert.equal(verification.adminConclusion, true)
  assert.equal(verification.selected, true)
})
