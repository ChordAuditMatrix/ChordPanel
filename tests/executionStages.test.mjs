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

const { projectExecutionStages } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionStages.ts',
)

const challengeFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/challenge-verified-true-observations.json'),
  'utf8',
))
const challengeObservations = challengeFixture.response.body.items

const CHALLENGE_STAGES = [
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
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      attempt: null,
    },
    eventTimeMs: null,
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

test('challenge proof fixture projects the nine fixed presentation stages in order', () => {
  const projection = projectExecutionStages('challengeProof', challengeObservations)

  assert.equal(projection.kind, 'challengeProof')
  assert.deepEqual(projection.stages.map((stage) => stage.id), CHALLENGE_STAGES)
  assert.deepEqual(projection.stages.map((stage) => stage.index), [0, 1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(
    projection.stages.map((stage) => stage.labelKey),
    CHALLENGE_STAGES.map((id) => `execution.stages.challengeProof.${id}`),
  )
  assert.deepEqual(
    projection.stages.filter((stage) => stage.status === 'observed').map((stage) => stage.id),
    ['tagRange', 'sampling', 'challengeGeneration', 'proofGeneration', 'proofVerification', 'settlement'],
  )
  // No dispatch/delivery/return events exist in the source facts, so the stages
  // between evidenced ones stay notObserved instead of being inferred.
  for (const id of ['dispatch', 'challengeDelivery', 'proofReturn']) {
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
  assert.equal(stageById(windowFailed, 'generation').status, 'observed')
  assert.equal(stageById(windowFailed, 'generation').hasFailureEvidence, true)

  const cancelled = projectExecutionStages('tagGeneration', [
    observation('TagWindowCancelled', { outcome: 'cancelled' }),
  ])
  assert.equal(stageById(cancelled, 'generation').hasFailureEvidence, true)

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
    observation('IdentityDispatchAccepted'),
    observation('IdentityVerificationCompleted'),
    // Events from another kind are not evidence here.
    observation('ProofVerificationCompleted'),
  ])
  assert.deepEqual(
    identityProjection.stages.map((stage) => stage.id),
    ['dispatch', 'verification'],
  )
  assert.deepEqual(
    identityProjection.stages.map((stage) => stage.evidence.length),
    [1, 1],
  )
  assert.equal(identityProjection.latestObservedStageId, 'verification')
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
