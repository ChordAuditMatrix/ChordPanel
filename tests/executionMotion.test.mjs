import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

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
  createMotionCues,
  createMotionCueQueue,
  enqueueMotionCues,
  takeNextMotionCue,
} = await vite.ssrLoadModule('/src/features/execution/data/executionMotion.ts')
const { projectExecutionStages } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionStages.ts',
)
const { projectExecutionCommunication } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionCommunication.ts',
)
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
const identityContext = {
  summary: {
    jobId: identityJobId,
    executionKind: 'identityVerification',
    references: { verifyType: 'cell' },
  },
  links: identityLinks,
}

const JOB_ID = 'job-motion-1'

function observation(eventType, overrides = {}) {
  const base = {
    schemaVersion: 1,
    observationId: `obs-${eventType}`,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
    eventType,
    category: 'challenge',
    phase: 'verify',
    source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
    refs: {
      taskId: null,
      requestId: 'request-1',
      challengeCorrelationId: 'challenge-1',
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      attempt: null,
    },
    eventTimeMs: null,
    recordedAtMs: 1,
    metrics: {},
    coverage: 'complete',
    outcome: null,
    job: null,
  }
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...overrides.source },
    refs: { ...base.refs, ...overrides.refs },
  }
}

function peerLink(overrides = {}) {
  return {
    jobId: JOB_ID,
    linkKey: 'peer-link-1',
    linkKind: 'peerCorrelation',
    matchBasis: 'peerCorrelation',
    confidence: 'exact',
    sourceQuality: 'observed',
    sourceRef: 'link:peer-1',
    taskId: 'task-1',
    nodeId: 'Storage-1',
    originNodeId: 'Audit-1',
    requestId: 'request-1',
    dispatchPacketId: null,
    correlationId: null,
    peerConversationId: 'challenge-1',
    operationId: null,
    relatedJobId: null,
    attempt: null,
    observedAtMs: 1,
    ...overrides,
  }
}

function emptyCommunication() {
  return { jobId: JOB_ID, confirmedPackets: [], peerCorrelations: [], localStages: [] }
}

test('MotionCue links only real packets, exact peer acceptance and source-backed worker facts', () => {
  const returned = observation('ProofReturnedToAudit', {
    observationId: 'proof-return-observation',
    source: { component: 'Audit', nodeId: 'Audit-1', quality: 'observed' },
  })
  const peerProjection = projectExecutionCommunication({
    activeJobId: JOB_ID,
    links: [peerLink()],
    observations: [returned],
    protocolEvents: [],
  })
  const peerStages = projectExecutionStages('challengeProof', [returned])
  const peerCue = createMotionCues([returned], peerStages.stages, peerProjection)[0]
  assert.equal(peerCue.kind, 'peer')
  assert.equal(peerCue.observationId, 'proof-return-observation')
  assert.equal(peerCue.activityId, peerProjection.peerCorrelations[0].activityId)
  assert.equal(peerCue.sourceQuality, 'observed')
  assert.equal('packetId' in peerCue, false)

  const worker = observation('ProofGenerationStarted', {
    observationId: 'proof-generation-started',
    source: { component: 'Storage', nodeId: 'Storage-1', quality: 'observed' },
  })
  const workerProjection = projectExecutionCommunication({
    activeJobId: JOB_ID,
    links: [],
    observations: [worker],
    protocolEvents: [],
  })
  const workerStages = projectExecutionStages('challengeProof', [worker])
  const workerCue = createMotionCues([worker], workerStages.stages, workerProjection)[0]
  assert.equal(workerCue.kind, 'worker')
  assert.equal(workerCue.nodeId, 'Storage-1')

  const reconstructed = observation('ProofGenerationCompleted', {
    observationId: 'reconstructed-completion',
    source: { component: 'Storage', nodeId: 'Storage-1', quality: 'reconstructed' },
  })
  const reconstructedStages = projectExecutionStages('challengeProof', [reconstructed])
  const reconstructedCue = createMotionCues([reconstructed], reconstructedStages.stages, emptyCommunication())[0]
  assert.equal(reconstructedCue.kind, 'reconstructed')
  assert.equal(reconstructedCue.sourceQuality, 'reconstructed')
})

test('recorded identity Worker stages create only local Audit activity cues', () => {
  const stages = projectExecutionStages('identityVerification', identityObservations, identityContext)
  const communication = projectExecutionCommunication({
    activeJobId: identityJobId,
    links: identityLinks,
    observations: identityObservations,
    protocolEvents: [],
  })
  const cues = createMotionCues(identityObservations, stages.stages, communication)
  const workerCues = cues.filter(cue => cue.kind === 'worker')

  assert.deepEqual(
    workerCues.map(cue => cue.eventType).sort(),
    [
      'IdentityAlgorithmResolved',
      'IdentityEvidenceValidated',
      'IdentityOwnersResolved',
      'IdentitySignaturesAggregated',
      'IdentityVerificationCompleted',
    ].sort(),
  )
  assert.ok(workerCues.every(cue => cue.component === 'Audit' && cue.nodeId === 'Audit-1'))
  assert.equal(cues.find(cue => cue.sourceQuality === 'reconstructed')?.kind, 'reconstructed')
  assert.equal(communication.confirmedPackets.length, 0)
})
test('bounded cue queue aggregates overflow, deduplicates queued facts and retains failures', () => {
  const routine = Array.from({ length: 7 }, (_, index) => ({
    id: `cue-${index}`,
    observationId: `obs-${index}`,
    eventType: 'TagWindowGenerated',
    stageId: 'generation',
    activityId: null,
    kind: 'window',
    sourceQuality: 'observed',
    nodeId: null,
    partIndex: index,
    windowIndex: 0,
  }))
  const initial = createMotionCueQueue()
  const bounded = enqueueMotionCues(initial, routine, 4)
  assert.equal(bounded.items.length, 4)
  assert.deepEqual(bounded.items.map(cue => cue.observationId), ['obs-3', 'obs-4', 'obs-5', 'obs-6'])
  assert.equal(bounded.aggregatedCount, 3)

  const withFailure = enqueueMotionCues(bounded, [routine[6], {
    ...routine[7 % routine.length],
    id: 'cue-failure',
    observationId: 'obs-failure',
    eventType: 'TagWindowFailed',
    kind: 'failure',
  }], 4)
  assert.equal(withFailure.items.length, 4)
  assert.equal(withFailure.items.filter(cue => cue.observationId === 'obs-6').length, 1)
  assert.equal(withFailure.items.some(cue => cue.kind === 'failure'), true)
  assert.equal(withFailure.aggregatedCount, 4)
})
test('cue scheduler removes one visual cue without changing the fact aggregate', () => {
  const queue = enqueueMotionCues(createMotionCueQueue(), [
    { id: 'one', observationId: 'one' },
    { id: 'two', observationId: 'two' },
  ], 1)
  const first = takeNextMotionCue(queue)
  assert.equal(first.cue?.id, 'two')
  assert.deepEqual(first.queue.items, [])
  assert.equal(first.queue.aggregatedCount, 1)
  const empty = takeNextMotionCue(first.queue)
  assert.equal(empty.cue, null)
})
