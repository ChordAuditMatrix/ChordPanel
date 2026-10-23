import assert from 'node:assert/strict'
import { after, test } from 'node:test'
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

const { projectExecutionDisplay, calculateProgressPercent } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionDisplayProjection.ts',
)
const { projectExecutionStages } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionStages.ts',
)

const JOB_ID = 'job-display-1'
const emptyCommunication = {
  jobId: JOB_ID,
  confirmedPackets: [],
  peerCorrelations: [],
  localStages: [],
}

function observation(eventType, overrides = {}) {
  const base = {
    schemaVersion: 1,
    observationId: `obs-${eventType}`,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
    eventType,
    category: 'part',
    phase: 'generate',
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

function summary(progress = {}) {
  return {
    schemaVersion: 1,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
    executionKind: 'tagGeneration',
    job: { status: 'Running', errorCode: 'None', createdAtMs: 1, endedAtMs: null },
    references: { verified: null, storageNodeId: null },
    progress: {
      plannedPartCount: null,
      completedPartCount: null,
      plannedBlockCount: null,
      generatedBlockCount: null,
      storageAccountedTagCount: null,
      persistedCount: null,
      duplicateCount: null,
      replacedCount: null,
      ...progress,
    },
    coverage: { job: 'complete', tasks: 'notInstrumented', parts: 'partial', protocol: 'notInstrumented', workerStages: 'notInstrumented', reasons: [] },
    observedAtMs: 1,
  }
}

function part(overrides = {}) {
  return {
    jobId: JOB_ID,
    partIndex: 0,
    attempt: null,
    ranges: [{ blockStart: '0', blockCount: '10' }],
    plannedBlockCount: '10',
    status: 'running',
    generateTaskId: 'generate-1',
    windows: [{ windowIndex: 0, blockStart: '0', blockCount: '10', state: 'generating', tagDumpTaskId: 'dump-1' }],
    generatedBlockCount: '8',
    storageAccountedTagCount: '4',
    updatedAtMs: 10,
    coverage: 'complete',
    ...overrides,
  }
}

function project({
  kind = 'tagGeneration',
  observations = [],
  summary: summaryValue = null,
  parts = [],
  tasks = [],
  storageNodeId = null,
  mode = 'live',
} = {}) {
  const stageProjection = projectExecutionStages(kind, observations)
  return {
    stageProjection,
    display: projectExecutionDisplay({
      activeJobId: JOB_ID,
      kind,
      stages: stageProjection.stages,
      observations,
      summary: summaryValue,
      parts,
      tasks,
      storageNodeId,
      communication: emptyCommunication,
      mode,
    }),
  }
}

function stageFact(display, stageId) {
  return display.facts.stages.find(stage => stage.stageId === stageId)
}

test('computation and Storage progress stay independent while Part and Window work overlaps', () => {
  const observations = [
    observation('TagPartGenerationStarted', {
      observationId: 'generation-started',
      recordedAtMs: 100,
      refs: { taskId: 'generate-1', partIndex: 0 },
    }),
    observation('TagDumpDispatched', {
      observationId: 'dump-dispatched',
      recordedAtMs: 110,
      refs: { taskId: 'dump-1', partIndex: 0, windowIndex: 0 },
    }),
  ]
  const { display } = project({
    observations,
    summary: summary({
      plannedPartCount: '1',
      completedPartCount: '0',
      plannedBlockCount: '10',
      generatedBlockCount: '8',
      storageAccountedTagCount: '4',
    }),
    parts: [part()],
    tasks: [
      { taskId: 'generate-1', jobId: JOB_ID, taskType: 'Audit', taskSubType: 'Generate', status: 'Running' },
      { taskId: 'dump-1', jobId: JOB_ID, taskType: 'Storage', taskSubType: '', status: 'Running' },
    ],
  })

  assert.equal(display.facts.progress.calculationPercent, 80)
  assert.equal(display.facts.progress.storagePercent, 40)
  assert.equal(display.facts.progress.storageLagging, true)
  assert.equal(stageFact(display, 'generation').status, 'active')
  assert.equal(stageFact(display, 'storage').status, 'active')
  assert.deepEqual(display.focus, {
    stageId: 'storage',
    observationId: 'dump-dispatched',
    partIndex: 0,
    windowIndex: 0,
    source: 'observation',
  })
  assert.equal(display.facts.parts[0].source, 'snapshot')
  assert.equal(display.facts.parts[0].windows[0].status, 'generating')
})

test('replay progress uses only observations through the pointer and hides final snapshots', () => {
  const observations = [
    observation('TagGenerationPlanCommitted', {
      observationId: 'plan-committed',
      recordedAtMs: 10,
      metrics: { totalBlockCount: '18446744073709551615', plannedPartCount: '2' },
    }),
    observation('TagPartGenerationStarted', {
      observationId: 'part-started',
      recordedAtMs: 20,
      refs: { taskId: 'generate-1', partIndex: 0 },
    }),
    observation('TagWindowGenerated', {
      observationId: 'window-generated',
      recordedAtMs: 30,
      refs: { taskId: 'generate-1', partIndex: 0, windowIndex: 0 },
      metrics: { generatedCount: '9007199254740993' },
    }),
  ]
  const finalSummary = summary({
    plannedPartCount: '2',
    completedPartCount: '2',
    plannedBlockCount: '10',
    generatedBlockCount: '10',
    storageAccountedTagCount: '10',
  })
  const finalParts = [part({ status: 'completed', generatedBlockCount: '10', storageAccountedTagCount: '10' }), part({ partIndex: 1, status: 'completed' })]
  const { display } = project({ observations, summary: finalSummary, parts: finalParts, mode: 'replay' })

  assert.equal(display.facts.isReplay, true)
  assert.equal(display.facts.progress.source, 'observations')
  assert.equal(display.facts.progress.plannedBlockCount, '18446744073709551615')
  assert.equal(display.facts.progress.generatedBlockCount, '9007199254740993')
  assert.equal(display.facts.progress.storageAccountedTagCount, null)
  assert.equal(display.facts.progress.calculationPercent, 0.05)
  assert.equal(display.facts.progress.storagePercent, null)
  assert.deepEqual(display.facts.parts.map(item => item.partIndex), [0])
  assert.equal(display.facts.parts[0].source, 'observation')
  assert.equal(display.facts.parts[0].status, 'running')
})

test('replay does not turn absent historical counters into zero or use future totals', () => {
  const observationList = [observation('TagPartGenerationStarted', {
    observationId: 'only-start',
    refs: { taskId: 'generate-1', partIndex: 0 },
  })]
  const { display } = project({
    observations: observationList,
    summary: summary({ plannedBlockCount: '10', generatedBlockCount: '10', storageAccountedTagCount: '10' }),
    parts: [part({ status: 'completed' })],
    mode: 'replay',
  })

  assert.equal(display.facts.progress.plannedBlockCount, null)
  assert.equal(display.facts.progress.generatedBlockCount, null)
  assert.equal(display.facts.progress.storageAccountedTagCount, null)
  assert.equal(display.facts.progress.calculationPercent, null)
  assert.equal(display.facts.progress.storagePercent, null)
  assert.equal(display.facts.parts[0].status, 'running')
})

test('source-backed focus follows recorded chronology instead of the highest stage index', () => {
  const observations = [
    observation('TagDumpDispatched', {
      observationId: 'earlier-storage',
      recordedAtMs: 10,
      refs: { taskId: 'dump-1', partIndex: 0, windowIndex: 0 },
    }),
    observation('TagPartGenerationStarted', {
      observationId: 'later-generation',
      recordedAtMs: 20,
      refs: { taskId: 'generate-1', partIndex: 1 },
    }),
  ]
  const { display, stageProjection } = project({ observations })
  assert.equal(stageProjection.latestObservedStageId, 'storage')
  assert.deepEqual(display.focus, {
    stageId: 'generation',
    observationId: 'later-generation',
    partIndex: 1,
    windowIndex: null,
    source: 'observation',
  })
})
test('REST generating windows need a TagDump task identity before the Storage stage is active', () => {
  const generatedOnly = project({
    parts: [part({
      windows: [{
        windowIndex: 0,
        blockStart: '0',
        blockCount: '10',
        state: 'generating',
        tagDumpTaskId: null,
      }],
    })],
  })
  assert.equal(stageFact(generatedOnly.display, 'generation').status, 'active')
  assert.equal(stageFact(generatedOnly.display, 'storage').status, 'unknown')
  assert.equal(generatedOnly.display.focus.stageId, 'generation')

  const dispatched = project({ parts: [part()] })
  assert.equal(stageFact(dispatched.display, 'generation').status, 'active')
  assert.equal(stageFact(dispatched.display, 'storage').status, 'active')
  assert.equal(dispatched.display.focus.stageId, 'generation')
})
test('replay separates local Generate task identity from remote TagDump task identity', () => {
  const observations = [
    observation('TagPartGenerationStarted', {
      observationId: 'generate-started',
      recordedAtMs: 1,
      refs: { taskId: 'generate-3', partIndex: 3 },
    }),
    observation('TagWindowGenerated', {
      observationId: 'window-generated',
      recordedAtMs: 2,
      refs: { taskId: 'generate-3', partIndex: 3, windowIndex: 0 },
      metrics: { generatedCount: '2' },
    }),
  ]
  const generated = project({ observations, mode: 'replay' }).display.facts.parts[0]
  assert.equal(generated.generateTaskId, 'generate-3')
  assert.equal(generated.windows[0].taskId, null)
  assert.equal(generated.windows[0].status, 'generated')

  const dispatched = project({
    observations: [
      ...observations,
      observation('TagDumpDispatched', {
        observationId: 'dump-dispatched',
        recordedAtMs: 3,
        refs: { taskId: 'dump-3', partIndex: 3, windowIndex: 0 },
      }),
    ],
    mode: 'replay',
  }).display.facts.parts[0]
  assert.equal(dispatched.generateTaskId, 'generate-3')
  assert.equal(dispatched.windows[0].taskId, 'dump-3')
  assert.equal(dispatched.windows[0].status, 'dispatchRecorded')
})
test('algorithm summary snapshot drives a source-labeled focus without masquerading as an event', () => {
  const algorithmSummary = {
    ...summary(),
    executionKind: 'challengeProof',
    references: { verified: true, storageNodeId: null, algorithmId: 'fixture-algorithm-id' },
    algorithmSelection: {
      algorithmId: 'fixture-algorithm-id',
      algorithmName: 'fixture algorithm name',
      algorithmType: 'DHTDynamic',
    },
  }
  const live = project({ kind: 'challengeProof', summary: algorithmSummary }).display
  assert.equal(stageFact(live, 'algorithmSelection').status, 'snapshot')
  assert.equal(stageFact(live, 'algorithmSelection').source, 'summary')
  assert.equal(stageFact(live, 'algorithmSelection').evidenceCount, 0)
  assert.equal(live.focus.stageId, 'algorithmSelection')
  assert.equal(live.focus.source, 'summary')

  const replayBeforeSelection = project({
    kind: 'challengeProof',
    summary: algorithmSummary,
    mode: 'replay',
  }).display
  assert.equal(stageFact(replayBeforeSelection, 'algorithmSelection').status, 'unknown')
  assert.equal(replayBeforeSelection.focus.stageId, null)

  const selectionObserved = project({
    kind: 'challengeProof',
    summary: algorithmSummary,
    observations: [observation('AlgorithmSelectionResolved', {
      observationId: 'algorithm-selection-observed',
      eventType: 'AlgorithmSelectionResolved',
      category: 'algorithm',
      phase: 'plan',
      refs: { algorithmId: 'fixture-algorithm-id' },
    })],
    mode: 'replay',
  }).display
  assert.equal(stageFact(selectionObserved, 'algorithmSelection').source, 'observation')
  assert.equal(selectionObserved.focus.stageId, 'algorithmSelection')
  assert.equal(selectionObserved.focus.source, 'observation')
})





test('failure evidence takes focus priority without changing Job or verification semantics', () => {
  const observations = [
    observation('TagWindowFailed', {
      observationId: 'window-failed',
      recordedAtMs: 10,
      outcome: 'failed',
      refs: { taskId: 'dump-1', partIndex: 1, windowIndex: 0 },
    }),
    observation('TagPartGenerationStarted', {
      observationId: 'other-part-started',
      recordedAtMs: 20,
      refs: { taskId: 'generate-1', partIndex: 0 },
    }),
  ]
  const { display } = project({ observations })
  assert.equal(stageFact(display, 'storage').status, 'failed')
  assert.equal(display.focus.observationId, 'window-failed')
  assert.equal(display.focus.source, 'failure')
})

test('Storage target uses Admin-selected Job facts and stays hidden before replayed plan evidence', () => {
  const plan = observation('TagGenerationPlanCommitted', {
    observationId: 'selected-storage-plan',
    source: { component: 'Admin', quality: 'observed' },
  })
  const beforePlan = project({
    storageNodeId: 'Storage-selected',
    summary: summary({}),
    mode: 'replay',
  })
  assert.equal(beforePlan.display.facts.storageNodeId, null)

  const atPlan = project({
    storageNodeId: 'Storage-selected',
    observations: [plan],
    mode: 'replay',
  })
  assert.equal(atPlan.display.facts.storageNodeId, 'Storage-selected')

  const conflictingSources = project({
    storageNodeId: 'Storage-selected',
    observations: [observation('TagGenerationFinalized', {
      source: { component: 'Admin', nodeId: 'Storage-other', quality: 'observed' },
    })],
  })
  assert.equal(conflictingSources.display.facts.storageNodeId, null)
})
test('progress percentages use exact uint64 arithmetic and return unknown for invalid ranges', () => {
  assert.equal(calculateProgressPercent('9007199254740993', '18446744073709551615'), 0.05)
  assert.equal(calculateProgressPercent('9007199254740993', '18014398509481986'), 50)
  assert.equal(calculateProgressPercent('8', '10'), 80)
  assert.equal(calculateProgressPercent('0', '10'), 0)
  assert.equal(calculateProgressPercent('1', '0'), null)
  assert.equal(calculateProgressPercent('11', '10'), null)
  assert.equal(calculateProgressPercent('18446744073709551616', '20'), null)
  assert.equal(calculateProgressPercent(null, '10'), null)
})
