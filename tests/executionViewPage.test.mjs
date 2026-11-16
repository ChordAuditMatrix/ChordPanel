import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createProjectVite } from './shared/viteHarness.mjs'

const vite = await createProjectVite()

after(async () => { await vite.close() })

const {
  hasTagSnapshotProgress,
  latestAlgorithmSelectionObservation,
  projectAlgorithmSelectionPage,
  projectIdentityAlgorithmSelection,
  projectStageMetricFacts,
  projectTopologyRoleNodeIds,
  resolveStageDataEmptyState,
} = await vite.ssrLoadModule('/src/features/execution/data/executionViewPage.ts')

function observation(overrides = {}) {
  const base = {
    observationId: 'obs-1',
    eventType: 'AlgorithmSelectionResolved',
    recordedAtMs: 1,
    source: { component: 'Admin', nodeId: null, quality: 'observed' },
    refs: {
      algorithmId: null,
      algorithmType: null,
      partIndex: null,
      windowIndex: null,
    },
    metrics: {},
  }
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...overrides.source },
    refs: { ...base.refs, ...overrides.refs },
    metrics: { ...overrides.metrics },
  }
}

function stage(id, evidence = []) {
  return {
    id,
    index: 0,
    labelKey: `execution.stages.identityVerification.${id}`,
    status: 'notObserved',
    evidence,
    hasFailureEvidence: false,
  }
}

function identityEvidence(overrides = {}) {
  return {
    observationId: 'obs-identity',
    eventType: 'IdentityAlgorithmResolved',
    recordedAtMs: 10,
    source: { component: 'Audit', nodeId: 'audit-1', quality: 'observed' },
    refs: { algorithmId: 'alg-1', algorithmType: 'rsa' },
    ...overrides,
  }
}

function summary(overrides = {}) {
  return {
    executionKind: 'challengeProof',
    algorithmSelection: null,
    references: { algorithmId: null },
    ...overrides,
  }
}

function summarySelection(algorithmId, overrides = {}) {
  return {
    mode: 'profile',
    algorithmId,
    algorithmName: null,
    algorithmType: null,
    purpose: null,
    profileVersion: null,
    strategyVersion: null,
    strategyKind: null,
    capabilitiesMask: null,
    capabilities: null,
    stateMaintenanceParty: null,
    selectedAtMs: null,
    ...overrides,
  }
}

test('the newest selection observation wins by record time and then observation id', () => {
  const older = observation({ observationId: 'obs-a', recordedAtMs: 10 })
  const tieLaterId = observation({ observationId: 'obs-z', recordedAtMs: 20 })
  const tieEarlierId = observation({ observationId: 'obs-b', recordedAtMs: 20 })
  const nonSelection = observation({
    observationId: 'obs-later',
    recordedAtMs: 99,
    eventType: 'TagLayoutPlanned',
  })

  assert.equal(
    latestAlgorithmSelectionObservation([older, tieLaterId, tieEarlierId, nonSelection]).observationId,
    'obs-z',
  )

  const page = projectAlgorithmSelectionPage({
    isHistoricalReplay: false,
    summary: summary({
      algorithmSelection: summarySelection('summary-alg', { algorithmName: 'Summary' }),
    }),
    observations: [older, tieLaterId, tieEarlierId, nonSelection],
    stages: [],
  })
  assert.equal(page.observationEvidence.observationId, 'obs-z')
  assert.equal(page.snapshotSelection.algorithmId, 'summary-alg')
  // The immutable summary snapshot still owns live algorithm selection.
  assert.equal(page.displayedAlgorithmId, 'summary-alg')
})

test('replay suppresses the summary snapshot only while no selection observation is visible', () => {
  const visible = observation({
    observationId: 'obs-visible',
    recordedAtMs: 30,
    refs: { algorithmId: 'observed-alg' },
  })
  const withVisibleObservation = projectAlgorithmSelectionPage({
    isHistoricalReplay: true,
    summary: summary({
      algorithmSelection: summarySelection('summary-alg'),
      references: { algorithmId: 'summary-alg' },
    }),
    observations: [visible],
    stages: [],
  })
  assert.equal(withVisibleObservation.observationEvidence.observationId, 'obs-visible')
  assert.equal(withVisibleObservation.snapshotSelection.algorithmId, 'summary-alg')
  // Preserved behavior: the immutable snapshot stays authoritative once an
  // exact replay observation is visible.
  assert.equal(withVisibleObservation.displayedAlgorithmId, 'summary-alg')

  const earlyReplayPrefix = projectAlgorithmSelectionPage({
    isHistoricalReplay: true,
    summary: summary({
      algorithmSelection: summarySelection('summary-alg'),
      references: { algorithmId: 'summary-alg' },
    }),
    observations: [],
    stages: [],
  })
  assert.equal(earlyReplayPrefix.observationEvidence, null)
  assert.equal(earlyReplayPrefix.snapshotSelection, null)
  assert.equal(earlyReplayPrefix.displayedAlgorithmId, null)
})

test('identity selection merges the observed algorithm fact with a matching summary', () => {
  const evidence = identityEvidence({ refs: { algorithmId: ' alg-1 ', algorithmType: 'rsa' } })
  const merged = projectIdentityAlgorithmSelection(
    evidence,
    summarySelection('alg-1', {
      algorithmName: 'RSA Profile',
      algorithmType: 'summary-type',
      profileVersion: 3,
      strategyVersion: 'strategy-1',
      strategyKind: 'profile',
      selectedAtMs: 50,
    }),
  )

  assert.deepEqual(merged, {
    mode: 'profile',
    algorithmId: 'alg-1',
    algorithmName: 'RSA Profile',
    algorithmType: 'rsa',
    purpose: 'Identity',
    profileVersion: 3,
    strategyVersion: 'strategy-1',
    strategyKind: 'profile',
    capabilitiesMask: null,
    capabilities: null,
    stateMaintenanceParty: null,
    selectedAtMs: 50,
  })

  assert.equal(projectIdentityAlgorithmSelection(identityEvidence({ refs: { algorithmId: '  ' } }), null), null)
  const mismatchedSummary = projectIdentityAlgorithmSelection(identityEvidence({
    refs: { algorithmId: 'alg-2', algorithmType: null },
  }), summarySelection('alg-1'))
  assert.equal(mismatchedSummary.algorithmId, 'alg-2')
  assert.equal(mismatchedSummary.algorithmName, null)
  assert.equal(mismatchedSummary.algorithmType, null)
})

test('identity page evidence only applies to identity verification jobs', () => {
  const identityStage = stage('algorithmResolved', [
    identityEvidence({ observationId: 'obs-old', recordedAtMs: 10 }),
    identityEvidence({ observationId: 'obs-new', recordedAtMs: 20 }),
  ])

  const page = projectAlgorithmSelectionPage({
    isHistoricalReplay: false,
    summary: summary({ executionKind: 'identityVerification' }),
    observations: [],
    stages: [identityStage],
  })
  assert.equal(page.identityEvidence.observationId, 'obs-new')
  assert.equal(page.displayedSelection.algorithmId, 'alg-1')

  const challenge = projectAlgorithmSelectionPage({
    isHistoricalReplay: false,
    summary: summary({ executionKind: 'challengeProof' }),
    observations: [],
    stages: [identityStage],
  })
  assert.equal(challenge.identityEvidence, null)
  assert.equal(challenge.identitySelection, null)
})

test('stage metric facts keep the latest value per key and ignore verified counts', () => {
  const rows = projectStageMetricFacts('challengeProof', [
    observation({
      eventType: 'ChallengeTagRangesQueried',
      recordedAtMs: 100,
      refs: { partIndex: 0 },
      metrics: { unitCount: '5', verifiedCount: '1', blockCount: 'not-a-count' },
    }),
    observation({
      eventType: 'ChallengeSamplingDecided',
      recordedAtMs: 200,
      refs: { windowIndex: 1 },
      metrics: { unitCount: '7', verifiedCount: '2' },
    }),
  ])

  assert.deepEqual(rows.map(row => row.key), ['unitCount'])
  assert.equal(rows[0].value, '7')
  assert.equal(rows[0].recordedAtMs, 200)
  assert.equal(rows[0].partIndex, null)
  assert.equal(rows[0].windowIndex, 1)

  const identityRows = projectStageMetricFacts('identityVerification', [
    observation({
      eventType: 'IdentityVerificationCompleted',
      recordedAtMs: 300,
      metrics: { rootHashPresentCount: '1', verifiedCount: '1', ownerCount: '4' },
    }),
  ])
  const rootHash = identityRows.find(row => row.key === 'rootHashPresentCount')
  const ownerCount = identityRows.find(row => row.key === 'ownerCount')
  assert.equal(rootHash.value, null)
  assert.equal(rootHash.rootHashPresent, true)
  assert.equal(ownerCount.value, '4')
  assert.equal(identityRows.some(row => row.key === 'verifiedCount'), false)
})

test('stage empty states name the available evidence without inventing metrics', () => {
  const base = {
    kind: 'challengeProof',
    stageId: 'proofGeneration',
    observationCount: 0,
    hasMetricValues: false,
    hasAlgorithmSelectionSnapshot: false,
    partCount: 0,
    hasTagSnapshotProgress: false,
  }

  assert.equal(resolveStageDataEmptyState({
    ...base,
    stageId: 'algorithmSelection',
    hasAlgorithmSelectionSnapshot: true,
  }), 'algorithmSelectionSummary')
  assert.equal(resolveStageDataEmptyState({
    ...base,
    kind: 'tagGeneration',
    stageId: 'generation',
    partCount: 1,
  }), 'metricsUnavailable')
  assert.equal(resolveStageDataEmptyState({
    ...base,
    observationCount: 2,
    hasMetricValues: true,
  }), 'metricsInEvidence')
  assert.equal(resolveStageDataEmptyState({
    ...base,
    observationCount: 2,
  }), 'noMetrics')
  assert.equal(resolveStageDataEmptyState(base), 'noEvidence')
})

test('tag snapshot progress requires at least one recorded counter', () => {
  assert.equal(hasTagSnapshotProgress(null), false)
  assert.equal(hasTagSnapshotProgress({}), false)
  assert.equal(hasTagSnapshotProgress({
    plannedPartCount: null,
    completedPartCount: null,
    plannedBlockCount: null,
    generatedBlockCount: null,
    storageAccountedTagCount: null,
    persistedCount: null,
    duplicateCount: null,
    replacedCount: null,
  }), false)
  assert.equal(hasTagSnapshotProgress({ persistedCount: '0' }), true)
})

test('topology role ids let Job metadata win while packets and peers fill missing roles', () => {
  assert.deepEqual(projectTopologyRoleNodeIds({
    confirmedPackets: [{ fromNodeId: 'admin-packet' }],
    peerCorrelations: [{ originNodeId: 'audit-peer', nodeId: 'storage-peer' }],
    auditNodeId: 'audit-meta',
    storageNodeId: null,
  }), {
    Admin: 'admin-packet',
    Audit: 'audit-meta',
    Storage: 'storage-peer',
  })

  assert.deepEqual(projectTopologyRoleNodeIds({
    confirmedPackets: [],
    peerCorrelations: [],
  }), {
    Admin: null,
    Audit: null,
    Storage: null,
  })
})
