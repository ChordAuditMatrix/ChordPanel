import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const {
  executionCommunicationActivityForObservation,
  executionCommunicationActivities,
  projectExecutionCommunication,
  restrictCommunicationEvidenceToReplayPrefix,
} = await vite.ssrLoadModule('/src/features/execution/data/executionCommunication.ts')

const challengeObservationsFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/challenge-verified-true-observations.json'),
  'utf8',
))
const protocolFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/protocol-linked-packets.json'),
  'utf8',
))
const realChallengeObservations = challengeObservationsFixture.response.body.items
const realChallengeJobId = realChallengeObservations[0].jobId
const identityObservationsFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/identity-observations-371f5280.json'),
  'utf8',
))
const identityLinksFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/identity-links-371f5280.json'),
  'utf8',
))
const identityObservations = identityObservationsFixture.response.body.items
const identityLinks = identityLinksFixture.response.body.items
const identityJobId = identityObservations[0].jobId



const JOB_ID = 'job-1'

function link(overrides = {}) {
  return {
    jobId: JOB_ID,
    linkKey: 'link-dispatch',
    linkKind: 'protocolPacket',
    matchBasis: 'packetCorrelation',
    confidence: 'exact',
    sourceQuality: 'observed',
    sourceRef: 'link:dispatch',
    taskId: 'task-1',
    nodeId: 'Audit-1',
    originNodeId: null,
    requestId: 'request-1',
    dispatchPacketId: 'dispatch-packet-1',
    correlationId: null,
    peerConversationId: null,
    operationId: null,
    relatedJobId: null,
    attempt: null,
    observedAtMs: 1_000,
    ...overrides,
  }
}

function packet(overrides = {}) {
  return {
    nodeId: 'Audit-1',
    packetId: 'dispatch-packet-1',
    messageType: 'TaskDispatchReq',
    sourceRef: 'packet:Audit-1:dispatch-packet-1',
    timestampMs: 990,
    authenticatedNodeId: 'Audit-1',
    fromNodeId: 'admin-node',
    toNodeId: 'Audit-1',
    correlationId: 'request-1',
    direction: 'outbound',
    matchBasis: 'packetCorrelation',
    confidence: 'exact',
    sourceQuality: 'observed',
    ...overrides,
  }
}

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    observationId: 'observation-1',
    executionTraceId: 'job:job-1',
    jobId: JOB_ID,
    eventType: 'ChallengeMaterialGenerated',
    category: 'challenge',
    phase: 'generate',
    source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    refs: {
      taskId: 'task-1',
      requestId: 'request-1',
      challengeCorrelationId: null,
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      attempt: null,
    },
    eventTimeMs: 995,
    recordedAtMs: 1_000,
    metrics: {},
    coverage: 'complete',
    outcome: 'succeeded',
    job: null,
    ...overrides,
  }
}

function peerLink(overrides = {}) {
  return link({
    linkKey: 'link-peer',
    linkKind: 'peerCorrelation',
    matchBasis: 'peerCorrelation',
    nodeId: 'Storage-1',
    originNodeId: 'Audit-1',
    requestId: 'request-peer',
    peerConversationId: 'conversation-1',
    dispatchPacketId: 'dispatch-packet-peer',
    sourceRef: 'link:peer',
    ...overrides,
  })
}

function peerObservation(overrides = {}) {
  const eventType = overrides.eventType ?? 'ChallengeDeliveredToStorage'
  return observation({
    observationId: 'observation-peer',
    eventType,
    source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    refs: {
      taskId: null,
      requestId: 'request-peer',
      challengeCorrelationId: 'conversation-1',
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      attempt: null,
    },
    ...overrides,
  })
}

function project({ links = [], observations = [], protocolEvents = [], activeJobId = JOB_ID } = {}) {
  return projectExecutionCommunication({
    activeJobId,
    links,
    observations,
    protocolEvents,
  })
}

test('historical communication evidence cannot leak beyond its observation prefix', () => {
  const currentObservation = observation()
  const futureDispatch = link({
    linkKey: 'link-future',
    sourceRef: 'link:future',
    taskId: 'task-future',
    requestId: 'request-future',
    dispatchPacketId: 'dispatch-packet-future',
  })
  const futurePacket = packet({
    packetId: 'dispatch-packet-future',
    sourceRef: 'packet:future',
    correlationId: 'request-future',
  })
  const packetEvidence = restrictCommunicationEvidenceToReplayPrefix(
    JOB_ID,
    [currentObservation],
    [link(), futureDispatch],
    [packet(), futurePacket],
  )
  assert.deepEqual(packetEvidence.links.map(item => item.linkKey), ['link-dispatch'])
  assert.deepEqual(packetEvidence.protocolEvents.map(item => item.packetId), ['dispatch-packet-1'])

  const peerEvidence = restrictCommunicationEvidenceToReplayPrefix(
    JOB_ID,
    [peerObservation()],
    [
      peerLink(),
      peerLink({
        linkKey: 'link-peer-future',
        peerConversationId: 'conversation-future',
      }),
    ],
    [],
  )
  assert.deepEqual(peerEvidence.links.map(item => item.linkKey), ['link-peer'])
})

test('an exact TaskDispatchReq packet matching the link identity is confirmed', () => {
  const projection = project({ links: [link()], protocolEvents: [packet()] })
  assert.equal(projection.confirmedPackets.length, 1)
  const item = projection.confirmedPackets[0]
  assert.equal(item.kind, 'confirmedPacket')
  assert.equal(item.jobId, JOB_ID)
  assert.equal(item.messageType, 'TaskDispatchReq')
  assert.equal(item.nodeId, 'Audit-1')
  assert.equal(item.fromNodeId, 'admin-node')
  assert.equal(item.toNodeId, 'Audit-1')
  // Reference namespaces stay distinct even though packetId and dispatchPacketId
  // carry the same exact id.
  assert.equal(item.packetId, 'dispatch-packet-1')
  assert.equal(item.dispatchPacketId, 'dispatch-packet-1')
  assert.equal(item.requestId, 'request-1')
  assert.equal(item.taskId, 'task-1')
  assert.equal(item.packetSourceRef, 'packet:Audit-1:dispatch-packet-1')
  assert.equal(item.linkSourceRef, 'link:dispatch')
  assert.equal(item.observedAtMs, 1_000)
  assert.equal(item.packetTimestampMs, 990)
})

test('a dispatch link without a matching exact packet is never confirmed', () => {
  const cases = [
    { name: 'missing dispatchPacketId', links: [link({ dispatchPacketId: null })] },
    { name: 'missing node identity', links: [link({ nodeId: null })] },
    { name: 'packet id mismatch', links: [link({ dispatchPacketId: 'other-packet' })] },
    { name: 'link node differs from packet node', links: [link({ nodeId: 'Storage-1' })] },
    { name: 'packet node differs from link node', protocolEvents: [packet({ nodeId: 'Storage-1' })] },
    { name: 'packet target differs from link node', protocolEvents: [packet({ toNodeId: 'Storage-1' })] },
    { name: 'reconstructed link', links: [link({ sourceQuality: 'reconstructed' })] },
    { name: 'partial confidence link', links: [link({ confidence: 'partial' })] },
    { name: 'TaskBook dispatch is not packet evidence', links: [link({ linkKind: 'taskDispatch', matchBasis: 'taskBook' })] },
  ]
  for (const item of cases) {
    const projection = project({
      links: item.links ?? [link()],
      protocolEvents: item.protocolEvents ?? [packet()],
    })
    assert.equal(projection.confirmedPackets.length, 0, item.name)
  }
})

test('a packet that is inbound, reconstructed, partial or not a TaskDispatchReq is rejected', () => {
  const packets = [
    packet({ direction: 'inbound' }),
    packet({ direction: 'unknown' }),
    packet({ sourceQuality: 'reconstructed' }),
    packet({ confidence: 'partial' }),
    packet({ matchBasis: 'requestId' }),
    packet({ messageType: 'NodeToNodeReq' }),
    packet({ messageType: 'TaskDispatchAck' }),
    packet({ fromNodeId: null }),
    packet({ toNodeId: null }),
    packet({ fromNodeId: 'Audit-1', toNodeId: 'Audit-1' }),
  ]
  for (const candidate of packets) {
    const projection = project({ links: [link()], protocolEvents: [candidate] })
    assert.equal(projection.confirmedPackets.length, 0, JSON.stringify(candidate))
  }
})

test('stale PascalCase link and packet enums never confirm a packet', () => {
  const staleLinks = [
    link({ linkKind: 'TaskDispatch' }),
    link({ matchBasis: 'PacketCorrelation' }),
    link({ confidence: 'Exact' }),
    link({ sourceQuality: 'Observed' }),
  ]
  for (const candidate of staleLinks) {
    const projection = project({ links: [candidate], protocolEvents: [packet()] })
    assert.equal(projection.confirmedPackets.length, 0, JSON.stringify(candidate))
  }
  const stalePackets = [
    packet({ confidence: 'Exact' }),
    packet({ matchBasis: 'PacketCorrelation' }),
    packet({ sourceQuality: 'Observed' }),
  ]
  for (const candidate of stalePackets) {
    const projection = project({ links: [link()], protocolEvents: [candidate] })
    assert.equal(projection.confirmedPackets.length, 0, JSON.stringify(candidate))
  }
})

test('a PeerCorrelation link without a matching stage fact remains undirected', () => {
  const projection = project({ links: [peerLink()] })
  assert.equal(projection.peerCorrelations.length, 1)
  const item = projection.peerCorrelations[0]
  assert.equal(item.kind, 'peerCorrelation')
  assert.equal(item.linkKind, 'peerCorrelation')
  assert.equal(item.originNodeId, 'Audit-1')
  assert.equal(item.nodeId, 'Storage-1')
  assert.equal(item.direction, null)
  assert.equal(item.requestId, 'request-peer')
  assert.equal(item.peerConversationId, 'conversation-1')
  assert.equal(item.dispatchPacketId, 'dispatch-packet-peer')
  assert.equal('fromNodeId' in item, false)
  assert.equal('toNodeId' in item, false)
  assert.equal('packetId' in item, false)
})

test('peer direction requires one exact Audit acceptance matching request and challenge', () => {
  const challenge = peerObservation({
    observationId: 'challenge-delivered',
    eventType: 'ChallengeDeliveredToStorage',
  })
  const proofReturn = peerObservation({
    observationId: 'proof-returned',
    eventType: 'ProofReturnedToAudit',
  })
  const projection = project({ links: [peerLink()], observations: [challenge, proofReturn] })
  assert.deepEqual(
    projection.peerCorrelations.map(item => [
      item.direction?.eventType,
      item.direction?.fromNodeId,
      item.direction?.toNodeId,
      item.direction?.observationId,
    ]),
    [
      ['ChallengeDeliveredToStorage', 'Audit-1', 'Storage-1', 'challenge-delivered'],
      ['ProofReturnedToAudit', 'Storage-1', 'Audit-1', 'proof-returned'],
    ],
  )
  assert.equal('packetId' in projection.peerCorrelations[0], false)

  const invalidEvidence = [
    peerObservation({ refs: { ...peerObservation().refs, requestId: 'other-request' } }),
    peerObservation({ refs: { ...peerObservation().refs, challengeCorrelationId: 'other-challenge' } }),
    peerObservation({ refs: { ...peerObservation().refs, challengeCorrelationId: null } }),
    peerObservation({ source: { component: 'Storage', nodeId: 'Storage-1', quality: 'observed' } }),
    peerObservation({ source: { component: 'Audit', nodeId: 'Audit-2', quality: 'observed' } }),
    peerObservation({ source: { component: 'Audit', nodeId: 'Audit-1', quality: 'reconstructed' } }),
  ]
  for (const evidence of invalidEvidence) {
    const result = project({ links: [peerLink()], observations: [evidence] })
    assert.equal(result.peerCorrelations.length, 1)
    assert.equal(result.peerCorrelations[0].direction, null)
  }

  const ambiguous = project({
    links: [peerLink(), peerLink({ linkKey: 'link-peer-2' })],
    observations: [proofReturn],
  })
  assert.equal(ambiguous.peerCorrelations.length, 2)
  assert.ok(ambiguous.peerCorrelations.every(item => item.direction === null))
})

test('concurrent peer requests with distinct challenge ids never cross-link proof acceptance', () => {
  const firstLink = peerLink({
    requestId: 'shared-request',
    peerConversationId: 'challenge-a',
  })
  const secondLink = peerLink({
    linkKey: 'link-peer-2',
    nodeId: 'Storage-2',
    originNodeId: 'Audit-2',
    requestId: 'shared-request',
    peerConversationId: 'challenge-b',
  })
  const firstReturn = peerObservation({
    observationId: 'proof-return-a',
    eventType: 'ProofReturnedToAudit',
    source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    refs: {
      ...peerObservation().refs,
      requestId: 'shared-request',
      challengeCorrelationId: 'challenge-a',
    },
  })
  const secondReturn = peerObservation({
    observationId: 'proof-return-b',
    eventType: 'ProofReturnedToAudit',
    source: { component: 'Audit', nodeId: 'Audit-2', quality: 'observed' },
    refs: {
      ...peerObservation().refs,
      requestId: 'shared-request',
      challengeCorrelationId: 'challenge-b',
    },
  })

  const projection = project({
    links: [firstLink, secondLink],
    observations: [firstReturn, secondReturn],
  })
  assert.deepEqual(
    projection.peerCorrelations.map(item => [
      item.linkKey,
      item.direction?.observationId,
      item.direction?.fromNodeId,
      item.direction?.toNodeId,
    ]),
    [
      ['link-peer', 'proof-return-a', 'Storage-1', 'Audit-1'],
      ['link-peer-2', 'proof-return-b', 'Storage-2', 'Audit-2'],
    ],
  )
})

test('invalid peer endpoint links are rejected; optional references do not erase a relation', () => {
  const cases = [
    { name: 'missing link key', changes: { linkKey: '' } },
    { name: 'missing origin node', changes: { originNodeId: null } },
    { name: 'missing target node', changes: { nodeId: null } },
    { name: 'self relationship', changes: { originNodeId: 'Storage-1' } },
    { name: 'stale PascalCase kind', changes: { linkKind: 'PeerCorrelation' } },
    { name: 'wrong basis', changes: { matchBasis: 'requestId' } },
    { name: 'partial confidence', changes: { confidence: 'partial' } },
    { name: 'reconstructed link', changes: { sourceQuality: 'reconstructed' } },
    { name: 'other job', changes: { jobId: 'job-2' } },
  ]
  for (const item of cases) {
    const projection = project({ links: [peerLink(item.changes)] })
    assert.equal(projection.peerCorrelations.length, 0, item.name)
  }

  const sparse = project({
    links: [peerLink({ requestId: null, peerConversationId: null, dispatchPacketId: null })],
  })
  assert.equal(sparse.peerCorrelations.length, 1)
  assert.equal(sparse.peerCorrelations[0].direction, null)

  const unlinkedReturn = project({
    observations: [peerObservation({ eventType: 'ProofReturnedToAudit' })],
  })
  assert.equal(unlinkedReturn.peerCorrelations.length, 0)
})


test('observation activity matching uses packetId, never a shared taskId', () => {
  const dispatchObservation = observation({
    observationId: 'dispatch-observation',
    eventType: 'RemoteDispatchRecorded',
    refs: { ...observation().refs, packetId: 'dispatch-packet-1' },
  })
  const proofObservation = observation({
    observationId: 'proof-observation',
    eventType: 'ProofGenerationStarted',
    source: { component: 'Storage', nodeId: 'Storage-1', quality: 'observed' },
    refs: { ...observation().refs, packetId: 'another-packet' },
  })
  const projection = project({
    links: [link()],
    observations: [dispatchObservation, proofObservation],
    protocolEvents: [packet()],
  })
  const activities = executionCommunicationActivities(projection)

  assert.equal(
    executionCommunicationActivityForObservation(dispatchObservation, activities)?.packetId,
    'dispatch-packet-1',
  )
  assert.equal(
    executionCommunicationActivityForObservation(proofObservation, activities)?.kind,
    'localStage',
  )
  assert.equal(
    executionCommunicationActivityForObservation(
      observation({
        observationId: 'unrelated-observation',
        refs: { ...observation().refs, packetId: null },
      }),
      activities,
    ),
    null,
  )
})


test('local worker stages highlight only the recorded observed node', () => {
  const observations = [
    observation({ observationId: 'audit-material' }),
    observation({
      observationId: 'storage-started',
      eventType: 'ProofGenerationStarted',
      source: { component: 'Storage', nodeId: 'Storage-1', quality: 'observed' },
    }),
    observation({
      observationId: 'storage-completed',
      eventType: 'ProofGenerationCompleted',
      source: { component: 'Storage', nodeId: 'Storage-1', quality: 'observed' },
    }),
    observation({
      observationId: 'audit-verified',
      eventType: 'ProofVerificationCompleted',
      source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    }),
    observation({
      observationId: 'identity-owners-resolved',
      eventType: 'IdentityOwnersResolved',
      source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    }),
    observation({
      observationId: 'identity-evidence-validated',
      eventType: 'IdentityEvidenceValidated',
      source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    }),
    observation({
      observationId: 'identity-algorithm-resolved',
      eventType: 'IdentityAlgorithmResolved',
      source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    }),
    observation({
      observationId: 'identity-signatures-aggregated',
      eventType: 'IdentitySignaturesAggregated',
      source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    }),
    observation({
      observationId: 'identity-verified',
      eventType: 'IdentityVerificationCompleted',
      source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    }),
  ]
  const projection = project({ observations })

  assert.deepEqual(
    projection.localStages.map(item => [item.eventType, item.component, item.nodeId]),
    [
      ['ChallengeMaterialGenerated', 'Audit', 'Audit-1'],
      ['ProofGenerationStarted', 'Storage', 'Storage-1'],
      ['ProofGenerationCompleted', 'Storage', 'Storage-1'],
      ['ProofVerificationCompleted', 'Audit', 'Audit-1'],
      ['IdentityOwnersResolved', 'Audit', 'Audit-1'],
      ['IdentityEvidenceValidated', 'Audit', 'Audit-1'],
      ['IdentityAlgorithmResolved', 'Audit', 'Audit-1'],
      ['IdentitySignaturesAggregated', 'Audit', 'Audit-1'],
      ['IdentityVerificationCompleted', 'Audit', 'Audit-1'],
    ],
  )
  assert.equal(projection.localStages[0].observationId, 'audit-material')
  assert.equal(projection.localStages[2].refs.requestId, 'request-1')
})

test('recorded identity worker observations highlight only their observed Audit node', () => {
  const projection = projectExecutionCommunication({
    activeJobId: identityJobId,
    links: identityLinks,
    observations: identityObservations,
    protocolEvents: [],
  })
  const identityEvents = projection.localStages
    .filter(item => item.eventType.startsWith('Identity'))

  assert.deepEqual(
    identityEvents.map(item => item.eventType).sort(),
    [
      'IdentityAlgorithmResolved',
      'IdentityEvidenceValidated',
      'IdentityOwnersResolved',
      'IdentitySignaturesAggregated',
      'IdentityVerificationCompleted',
    ].sort(),
  )
  assert.ok(identityEvents.every(item => item.component === 'Audit' && item.nodeId === 'Audit-1'))
  assert.equal(projection.confirmedPackets.length, 0)
})

test('local highlights reject reconstructed facts, wrong components, missing nodes and other events', () => {
  const cases = [
    { name: 'reconstructed quality', observation: observation({ source: { component: 'Audit', nodeId: 'Audit-1', quality: 'reconstructed' } }) },
    { name: 'missing component', observation: observation({ source: { component: null, nodeId: 'Audit-1', quality: 'observed' } }) },
    { name: 'missing node id', observation: observation({ source: { component: 'Audit', nodeId: null, quality: 'observed' } }) },
    { name: 'wrong component for material', observation: observation({ source: { component: 'Storage', nodeId: 'Storage-1', quality: 'observed' } }) },
    { name: 'wrong component for proof', observation: observation({ eventType: 'ProofGenerationStarted', source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' } }) },
    { name: 'non-local event', observation: observation({ eventType: 'ChallengeDeliveredToStorage' }) },
    { name: 'identity completion from non-Audit node', observation: observation({ eventType: 'IdentityVerificationCompleted', source: { component: 'Storage', nodeId: 'Storage-2', quality: 'observed' } }) },
    { name: 'other job', observation: observation({ jobId: 'job-2' }) },
  ]
  for (const item of cases) {
    const projection = project({ observations: [item.observation] })
    assert.equal(projection.localStages.length, 0, item.name)
  }
})

test('duplicate links and observations collapse onto one stable activity each', () => {
  const projection = project({
    links: [link(), link(), peerLink(), peerLink()],
    protocolEvents: [packet(), packet()],
    observations: [
      observation(),
      observation(),
      peerObservation(),
      peerObservation(),
      observation({ eventType: 'ProofVerificationCompleted', observationId: 'observation-verified' }),
      observation({ eventType: 'ProofVerificationCompleted', observationId: 'observation-verified' }),
    ],
  })

  assert.equal(projection.confirmedPackets.length, 1)
  assert.equal(projection.peerCorrelations.length, 1)
  assert.equal(projection.localStages.length, 2)

  const activities = executionCommunicationActivities(projection)
  assert.equal(activities.length, 4)
  assert.equal(new Set(activities.map(item => item.activityId)).size, 4)
})

test('every item stays associated with the active job', () => {
  const projection = project({
    links: [link({ jobId: 'job-2' }), peerLink()],
    protocolEvents: [packet()],
    observations: [observation(), peerObservation()],
  })
  assert.equal(projection.jobId, JOB_ID)
  assert.equal(projection.confirmedPackets.length, 0)
  assert.equal(projection.peerCorrelations.length, 1)
  assert.equal(projection.localStages.length, 1)

  const blank = project({ activeJobId: '', links: [link()], protocolEvents: [packet()], observations: [observation()] })
  assert.deepEqual(blank, {
    jobId: '',
    confirmedPackets: [],
    peerCorrelations: [],
    localStages: [],
  })
})

test('backend packet and observation fixtures join only through an exact ProtocolPacket link', () => {
  const packetFixture = protocolFixture.response.body.items.find(item => item.nodeId === 'Storage-1')
  const queryObservation = realChallengeObservations.find(
    item => item.source.component === 'Admin' && item.source.nodeId === 'Storage-1' && item.refs.taskId,
  )
  assert.ok(packetFixture)
  assert.ok(queryObservation)

  const realLink = link({
    jobId: realChallengeJobId,
    linkKey: 'fixture-exact-storage-dispatch',
    nodeId: packetFixture.nodeId,
    taskId: queryObservation.refs.taskId,
    requestId: queryObservation.refs.requestId,
    dispatchPacketId: packetFixture.packetId,
  })
  const projection = project({
    activeJobId: realChallengeJobId,
    links: [realLink],
    observations: realChallengeObservations,
    protocolEvents: [packetFixture],
  })

  assert.equal(projection.confirmedPackets.length, 1)
  assert.equal(projection.confirmedPackets[0].packetId, packetFixture.packetId)
  assert.equal(projection.confirmedPackets[0].dispatchPacketId, realLink.dispatchPacketId)
  assert.equal(projection.confirmedPackets[0].requestId, realLink.requestId)
  assert.equal(projection.confirmedPackets[0].taskId, realLink.taskId)
  assert.ok(projection.localStages.some(item => item.eventType === 'ProofGenerationStarted'))
})
