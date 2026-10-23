import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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

const { projectExecutionStages, projectIdentityTaskRelations, projectIdentityWorkerStageFacts } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionStages.ts',
)

const challengeFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/challenge-verified-true-observations.json'),
  'utf8',
))
const challengeObservations = challengeFixture.response.body.items
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
const identityTaskDispatchLink = identityLinks.find((link) => link.linkKind === 'taskDispatch')
const identityJobId = identityObservations[0].jobId
// The matching Summary was not captured; this minimal test-only context is not a backend fixture.
const identityContext = {
  summary: {
    jobId: identityJobId,
    executionKind: 'identityVerification',
    references: { verifyType: 'cell' },
  },
  links: identityLinks,
}

const IDENTITY_STAGES = [
  'ownersResolved',
  'evidenceValidated',
  'algorithmResolved',
  'signaturesAggregated',
  'verification',
]


const CHALLENGE_STAGES = [
  'algorithmSelection',
  'tagRange',
  'sampling',
  'dispatch',
  'challengeGeneration',
  'challengeDelivery',
  'proofGeneration',
  'proofReturn',
  'proofVerification',
  'settlement',
]

let nextObservation = 0

function observation(eventType, overrides = {}) {
  const observationId = overrides.observationId ?? `obs-${String(nextObservation++).padStart(4, '0')}`
  return {
    schemaVersion: 1,
    observationId,
    executionTraceId: 'job-fixture',
    jobId: 'job-fixture',
    eventType,
    category: null,
    phase: null,
    source: { component: 'Admin', nodeId: null, quality: 'observed' },
    refs: {
      taskId: null,
      requestId: null,
      challengeCorrelationId: null,
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      attempt: null,
    },
    recordedAtMs: 0,
    metrics: {},
    coverage: null,
    outcome: null,
    job: null,
    ...overrides,
  }
}

function stageById(projection, id) {
  return projection.stages.find((stage) => stage.id === id)
}

test('challenge proof fixture projects ten presentation stages including algorithm provenance', () => {
  const projection = projectExecutionStages('challengeProof', challengeObservations)

  assert.equal(projection.kind, 'challengeProof')
  assert.deepEqual(projection.stages.map((stage) => stage.id), CHALLENGE_STAGES)
  assert.deepEqual(projection.stages.map((stage) => stage.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(
    projection.stages.map((stage) => stage.labelKey),
    CHALLENGE_STAGES.map((id) => `execution.stages.challengeProof.${id}`),
  )
  assert.deepEqual(
    projection.stages.filter((stage) => stage.status === 'observed').map((stage) => stage.id),
    ['tagRange', 'sampling', 'challengeGeneration', 'proofGeneration', 'proofVerification', 'settlement'],
  )
  // The fixture has no algorithm selection observation; its summary snapshot is separate evidence.
  for (const id of ['algorithmSelection', 'dispatch', 'challengeDelivery', 'proofReturn']) {
    const stage = stageById(projection, id)
    assert.equal(stage.status, 'notObserved')
    assert.deepEqual(stage.evidence, [])
  }
  assert.equal(projection.latestObservedStageId, 'settlement')

  const tagRange = stageById(projection, 'tagRange')
  assert.equal(tagRange.evidence.length, 1)
  assert.equal(tagRange.evidence[0].eventType, 'ChallengeTagRangesQueried')
  assert.equal(tagRange.evidence[0].observationId, '1088fffd-bcaf-4431-84b8-ea9fa51185e8')
  assert.equal(tagRange.evidence[0].recordedAtMs, 1792589818312)
  assert.equal(tagRange.evidence[0].eventTimeMs, 1792589818281)
  assert.deepEqual(tagRange.evidence[0].source, {
    component: 'Admin',
    nodeId: 'Storage-1',
    quality: 'observed',
  })
  assert.deepEqual(tagRange.evidence[0].metrics, { blockCount: '4', tagCount: '4' })
})

test('AlgorithmSelectionResolved belongs to the Admin algorithm-selection stage', () => {
  const selected = observation('AlgorithmSelectionResolved', {
    observationId: 'algorithm-selection',
    source: { component: 'Admin', nodeId: 'admin-1', quality: 'observed' },
    refs: { algorithmId: 'algorithm-7' },
    recordedAtMs: 1_000,
  })
  const projection = projectExecutionStages('challengeProof', [selected])
  const stage = stageById(projection, 'algorithmSelection')
  assert.equal(stage.status, 'observed')
  assert.equal(stage.evidence[0].observationId, 'algorithm-selection')
  assert.equal(stage.evidence[0].refs.algorithmId, 'algorithm-7')
  assert.equal(projection.latestObservedStageId, 'algorithmSelection')
})

test('a late early-stage event is evidenced without regressing latestObservedStageId', () => {
  const lateDelivery = observation('ChallengeDeliveredToStorage', {
    observationId: 'zz-late-delivery',
    recordedAtMs: 1792589999999,
    eventTimeMs: 1792589999990,
  })
  const projection = projectExecutionStages('challengeProof', [...challengeObservations, lateDelivery])

  const delivery = stageById(projection, 'challengeDelivery')
  assert.equal(delivery.status, 'observed')
  assert.equal(delivery.evidence[0].observationId, 'zz-late-delivery')
  // Highest evidenced index wins, not the greatest timestamp.
  assert.equal(projection.latestObservedStageId, 'settlement')
})


test('a single early-stage observation alone does not claim later stages', () => {
  const projection = projectExecutionStages('challengeProof', [
    observation('ChallengeSamplingDecided', { recordedAtMs: 10 }),
  ])

  assert.equal(projection.latestObservedStageId, 'sampling')
  assert.equal(stageById(projection, 'tagRange').status, 'notObserved')
  assert.equal(stageById(projection, 'dispatch').status, 'notObserved')
  assert.equal(stageById(projection, 'settlement').status, 'notObserved')
})

test('evidence orders by Admin recordedAtMs then observationId', () => {
  const projection = projectExecutionStages('challengeProof', [
    observation('ProofGenerationCompleted', { observationId: 'b', recordedAtMs: 500 }),
    observation('ProofGenerationStarted', { observationId: 'c', recordedAtMs: 500 }),
    observation('ProofGenerationStarted', { observationId: 'a', recordedAtMs: 500 }),
    observation('ProofGenerationStarted', { observationId: 'z', recordedAtMs: 100 }),
  ])

  const rows = stageById(projection, 'proofGeneration').evidence
  assert.deepEqual(
    rows.map((row) => `${row.recordedAtMs}:${row.observationId}:${row.eventType}`),
    [
      '100:z:ProofGenerationStarted',
      '500:a:ProofGenerationStarted',
      '500:b:ProofGenerationCompleted',
      '500:c:ProofGenerationStarted',
    ],
  )
  assert.equal(projection.latestObservedStageId, 'proofGeneration')
})

test('duplicate observation ids are evidenced once', () => {
  const duplicate = observation('ProofVerificationCompleted', { observationId: 'dup', recordedAtMs: 1 })
  const projection = projectExecutionStages('challengeProof', [duplicate, { ...duplicate }])

  const rows = stageById(projection, 'proofVerification').evidence
  assert.equal(rows.length, 1)
  assert.equal(rows[0].observationId, 'dup')
})

test('failure and refusal are reported only from explicit failure facts', () => {
  const explicitFailure = projectExecutionStages('challengeProof', [
    observation('ProofGenerationCompleted', { outcome: 'failed', recordedAtMs: 1 }),
  ])
  assert.equal(stageById(explicitFailure, 'proofGeneration').hasFailureEvidence, true)
  assert.equal(stageById(explicitFailure, 'proofGeneration').status, 'observed')
  assert.deepEqual(
    explicitFailure.stages.filter((stage) => stage.hasFailureEvidence).map((stage) => stage.id),
    ['proofGeneration'],
  )

  for (const outcome of ['cancelled', 'timedOut']) {
    const projection = projectExecutionStages('challengeProof', [
      observation('ProofGenerationStarted', { outcome }),
    ])
    assert.equal(stageById(projection, 'proofGeneration').hasFailureEvidence, true, outcome)
  }

  const succeeded = projectExecutionStages('challengeProof', [
    observation('ProofVerificationCompleted', { outcome: 'succeeded' }),
  ])
  assert.equal(succeeded.stages.some((stage) => stage.hasFailureEvidence), false)

  const windowFailed = projectExecutionStages('tagGeneration', [
    observation('TagWindowFailed', { outcome: null }),
  ])
  assert.equal(stageById(windowFailed, 'storage').status, 'observed')
  assert.equal(stageById(windowFailed, 'storage').hasFailureEvidence, true)

  const cancelled = projectExecutionStages('tagGeneration', [
    observation('TagWindowCancelled', { outcome: 'cancelled' }),
  ])
  assert.equal(stageById(cancelled, 'storage').hasFailureEvidence, true)

  const requested = projectExecutionStages('maintenance', [
    observation('MaintenanceRecoveryRequested', { outcome: null }),
  ])
  assert.equal(stageById(requested, 'recovery').status, 'observed')
  assert.equal(stageById(requested, 'recovery').hasFailureEvidence, false)

  const refused = projectExecutionStages('maintenance', [
    observation('MaintenanceRecoveryRequested', { recordedAtMs: 1 }),
    observation('MaintenanceRecoveryRefused', { recordedAtMs: 2 }),
  ])
  assert.equal(stageById(refused, 'recovery').hasFailureEvidence, true)
  assert.deepEqual(
    stageById(refused, 'recovery').evidence.map((row) => row.eventType),
    ['MaintenanceRecoveryRequested', 'MaintenanceRecoveryRefused'],
  )
})

test('tag generation and identity verification map their own fixed stages', () => {
  const tagProjection = projectExecutionStages('tagGeneration', [
    observation('TagLayoutPlanningStarted', { recordedAtMs: 1 }),
    observation('TagLayoutPlanned', { recordedAtMs: 2 }),
    observation('TagRangeQueryDispatched'),
    observation('TagRangeQueryCompleted'),
    observation('TagGenerationPlanCommitted'),
    observation('TagPartGenerationStarted'),
    observation('TagWindowGenerated'),
    observation('TagDumpDispatched'),
    observation('TagPartCompleted'),
  ])
  assert.deepEqual(
    tagProjection.stages.map((stage) => stage.id),
    ['layout', 'plan', 'generation', 'storage', 'settlement'],
  )
  assert.deepEqual(
    tagProjection.stages.map((stage) => stage.labelKey),
    [
      'execution.stages.tagGeneration.layout',
      'execution.stages.tagGeneration.plan',
      'execution.stages.tagGeneration.generation',
      'execution.stages.tagGeneration.storage',
      'execution.stages.tagGeneration.settlement',
    ],
  )
  assert.deepEqual(
    stageById(tagProjection, 'plan').evidence.map((row) => row.eventType),
    ['TagRangeQueryDispatched', 'TagRangeQueryCompleted', 'TagGenerationPlanCommitted'],
  )
  assert.deepEqual(
    stageById(tagProjection, 'layout').evidence.map((row) => row.eventType),
    ['TagLayoutPlanningStarted', 'TagLayoutPlanned'],
  )
  assert.equal(stageById(tagProjection, 'storage').evidence.length, 1)
  assert.equal(tagProjection.latestObservedStageId, 'settlement')

  const identityProjection = projectExecutionStages('identityVerification', [
    ...identityObservations,
    observation('IdentityDispatchAccepted'),
    observation('ProofVerificationCompleted'),
  ], identityContext)
  assert.deepEqual(identityProjection.stages.map((stage) => stage.id), IDENTITY_STAGES)
  assert.deepEqual(
    identityProjection.stages.map((stage) => stage.labelKey),
    IDENTITY_STAGES.map((stageId) => `identity.workbench.stage.${stageId}`),
  )
  assert.deepEqual(
    identityProjection.stages.map((stage) => stage.evidence.map((row) => row.eventType)),
    [
      ['IdentityOwnersResolved'],
      ['IdentityEvidenceValidated'],
      ['IdentityAlgorithmResolved'],
      ['IdentitySignaturesAggregated'],
      ['IdentityVerificationCompleted', 'IdentityVerificationCompleted'],
    ],
  )
  assert.deepEqual(identityProjection.stages.map((stage) => stage.status), Array(5).fill('observed'))
  assert.equal(identityProjection.latestObservedStageId, 'verification')
  assert.equal(identityProjection.stages[0].evidence[0].source.component, 'Audit')
  assert.equal(identityProjection.stages[0].evidence[0].metrics.ownerCount, '1')
  assert.equal(identityProjection.stages[2].evidence[0].refs.algorithmType, 'SM9Noncert')
  assert.equal(identityProjection.stages[3].evidence[0].metrics.signatureCount, '1')
  assert.equal(identityProjection.stages[3].evidence[0].metrics.signatureCount, identityProjection.stages[3].evidence[0].metrics.ownerCount)
  assert.deepEqual(
    identityProjection.stages[4].evidence.map((row) => row.source.quality),
    ['reconstructed', 'observed'],
  )
  assert.equal(
    projectExecutionStages('identityVerification', identityObservations).stages
      .every((stage) => stage.status === 'notObserved'),
    true,
  )
})
test('identity dispatch and settlement are exact Link relations, not Worker Observations', () => {
  const fullProjection = projectExecutionStages('identityVerification', identityObservations, identityContext)
  const fullRelations = projectIdentityTaskRelations(identityJobId, fullProjection.stages, identityLinks)
  assert.equal(fullRelations.dispatchLink?.linkKind, 'taskDispatch')
  assert.equal(fullRelations.dispatchLink?.nodeAction, 'IdentityVerification')
  assert.equal(fullRelations.settlementLink?.linkKind, 'taskCompletion')
  assert.equal(fullRelations.settlementLink?.matchBasis, 'requestId')

  const beforeObservedCompletion = identityObservations.filter(row =>
    row.eventType !== 'IdentityVerificationCompleted' || row.source.quality !== 'observed',
  )
  const earlierProjection = projectExecutionStages('identityVerification', beforeObservedCompletion, identityContext)
  const earlierRelations = projectIdentityTaskRelations(identityJobId, earlierProjection.stages, identityLinks)
  assert.ok(earlierRelations.dispatchLink)
  assert.equal(earlierRelations.settlementLink, null)

  const noCompletionLink = projectIdentityTaskRelations(
    identityJobId,
    fullProjection.stages,
    identityLinks.filter(link => link.linkKind !== 'taskCompletion'),
  )
  assert.equal(noCompletionLink.settlementLink, null)
})
test('Admin reconstructed completion remains separate from Audit Worker evidence', () => {
  const reconstructedCompletion = identityObservations.find(row =>
    row.eventType === 'IdentityVerificationCompleted'
    && row.source.component === 'Admin'
    && row.source.quality === 'reconstructed',
  )
  const observedCompletion = identityObservations.find(row =>
    row.eventType === 'IdentityVerificationCompleted'
    && row.source.component === 'Audit'
    && row.source.quality === 'observed',
  )
  assert.ok(reconstructedCompletion)
  assert.ok(observedCompletion)

  const reconstructedOnly = projectExecutionStages(
    'identityVerification',
    [reconstructedCompletion],
    identityContext,
  )
  const reconstructedFact = projectIdentityWorkerStageFacts(reconstructedOnly.stages)
    .find(row => row.stage.id === 'verification')
  assert.equal(reconstructedFact?.workerEvidenceCount, 0)
  assert.equal(reconstructedFact?.hasReconstructedConclusion, true)

  const completed = projectExecutionStages(
    'identityVerification',
    [reconstructedCompletion, observedCompletion],
    identityContext,
  )
  const completedFact = projectIdentityWorkerStageFacts(completed.stages)
    .find(row => row.stage.id === 'verification')
  assert.equal(completedFact?.workerEvidenceCount, 1)
  assert.equal(completedFact?.hasReconstructedConclusion, true)
})

test('identity worker stages require exact Audit scope, TaskBook action and valid counters', () => {
  assert.ok(identityTaskDispatchLink)
  const ownerEvent = identityObservations.find((row) => row.eventType === 'IdentityOwnersResolved')
  const evidenceEvent = identityObservations.find((row) => row.eventType === 'IdentityEvidenceValidated')
  const signatureEvent = identityObservations.find((row) => row.eventType === 'IdentitySignaturesAggregated')
  assert.ok(ownerEvent)
  assert.ok(evidenceEvent)
  assert.ok(signatureEvent)

  const ownerStage = (event, context = identityContext) =>
    stageById(projectExecutionStages('identityVerification', [event], context), 'ownersResolved')
  assert.equal(
    ownerStage({ ...ownerEvent, metrics: { ownerCount: '0' } }).status,
    'observed',
    'zero owners is valid at the owners-resolved boundary',
  )
  assert.equal(
    stageById(projectExecutionStages('identityVerification', [
      { ...evidenceEvent, metrics: { ownerCount: '0' } },
    ], identityContext), 'evidenceValidated').status,
    'notObserved',
    'later identity stages require a positive owner count',
  )
  assert.equal(
    stageById(projectExecutionStages('identityVerification', [
      { ...signatureEvent, metrics: { ownerCount: '1', signatureCount: '2' } },
    ], identityContext), 'signaturesAggregated').status,
    'notObserved',
    'aggregated signatures must equal the owner count',
  )
  assert.equal(
    ownerStage({ ...ownerEvent, source: { ...ownerEvent.source, component: 'Storage' } }).status,
    'notObserved',
  )
  assert.equal(
    ownerStage(ownerEvent, {
      ...identityContext,
      summary: { ...identityContext.summary, references: { verifyType: 'row' } },
    }).status,
    'notObserved',
  )
  assert.equal(
    ownerStage(ownerEvent, {
      ...identityContext,
      links: identityLinks.filter((link) => link.linkKind !== 'taskDispatch'),
    }).status,
    'notObserved',
  )
  assert.equal(
    ownerStage(ownerEvent, {
      ...identityContext,
      links: [...identityLinks, identityTaskDispatchLink],
    }).status,
    'notObserved',
    'ambiguous TaskBook dispatch evidence does not establish the action',
  )
})


test('unknown, other and missing kinds fabricate no stages', () => {
  const observations = [
    observation('ProofVerificationCompleted'),
    observation('IdentityVerificationCompleted'),
  ]

  for (const kind of ['other', 'unrecognizedKind', '', null, undefined]) {
    const projection = projectExecutionStages(kind, observations)
    assert.deepEqual(projection.stages, [], String(kind))
    assert.equal(projection.latestObservedStageId, null, String(kind))
  }
})

test('job status, coverage and verification are not inferred into stages', () => {
  const projection = projectExecutionStages('challengeProof', [
    observation('JobStatusObserved', {
      job: { status: 'succeeded', errorCode: 'none', statusSequence: '7' },
      coverage: 'complete',
      outcome: 'succeeded',
    }),
    observation('ExecutionTraceSettled', { coverage: 'complete' }),
  ])

  assert.deepEqual(projection.stages.map((stage) => stage.status), CHALLENGE_STAGES.map(() => 'notObserved'))
  assert.equal(projection.stages.every((stage) => stage.evidence.length === 0), true)
  assert.equal(projection.latestObservedStageId, null)
})
