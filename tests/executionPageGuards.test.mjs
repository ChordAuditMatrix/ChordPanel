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

const {
  applyMotionCueFocus,
  canPresentMotionCue,
  deriveHistoricalReplay,
  MOTION_CUE_HOLD_MS,
  motionCueHoldMs,
  REDUCED_MOTION_CUE_HOLD_MS,
  resolveDisplayStatus,
  resolveLatestProjectedStageId,
  resolveProtocolEvidenceUnavailable,
  resolveSelectedObservationId,
  resolveSequenceStageId,
  resolveTopologySelectedActivityId,
  resolveViewPressedStates,
  shouldLoopStageMotion,
} = await vite.ssrLoadModule('/src/features/execution/data/executionPageGuards.ts')

function projection() {
  return {
    facts: {
      stages: [],
      parts: [],
      progress: {},
      isReplay: false,
      finalSnapshotAvailable: false,
      storageNodeId: null,
    },
    focus: {
      stageId: 'focus-stage',
      observationId: 'focus-observation',
      partIndex: null,
      windowIndex: null,
      source: 'observation',
    },
    cues: [],
  }
}

function cue(overrides = {}) {
  return {
    id: 'cue-1',
    observationId: 'obs-1',
    eventType: 'TagLayoutPlanned',
    stageId: 'generation',
    activityId: 'activity-1',
    kind: 'stage',
    sourceQuality: 'observed',
    component: 'Audit',
    nodeId: 'audit-1',
    partIndex: 2,
    windowIndex: 4,
    ...overrides,
  }
}

test('replay is historical only after stepping off the live tail', () => {
  assert.equal(deriveHistoricalReplay({ followLatest: true, replayObservationId: 'obs-9' }), false)
  assert.equal(deriveHistoricalReplay({ followLatest: false, replayObservationId: null }), false)
  assert.equal(deriveHistoricalReplay({ followLatest: false, replayObservationId: 'obs-9' }), true)
})

test('live stage focus follows cue, display focus, observed and projected stages in that order', () => {
  const live = {
    followLatest: true,
    selectedStageId: 'selected',
    activeCueStageId: 'cue',
    focusStageId: 'focus',
    latestObservedStageId: 'observed',
    latestProjectedStageId: 'projected',
  }
  assert.equal(resolveSequenceStageId(live), 'cue')
  assert.equal(resolveSequenceStageId({ ...live, activeCueStageId: null }), 'focus')
  assert.equal(resolveSequenceStageId({ ...live, activeCueStageId: null, focusStageId: null }), 'observed')
  assert.equal(resolveSequenceStageId({
    ...live,
    activeCueStageId: null,
    focusStageId: null,
    latestObservedStageId: null,
  }), 'projected')
  // Replay never promotes a live cue or fact over the user's selection.
  assert.equal(resolveSequenceStageId({ ...live, followLatest: false }), 'selected')
  assert.equal(resolveSequenceStageId({ ...live, followLatest: false, selectedStageId: null }), null)
})

test('selected observation stays in the visible prefix for live, playback and pause', () => {
  const base = {
    followLatest: false,
    isPlaying: false,
    replayObservationId: 'pointer',
    selectedObservationId: 'selected',
    latestObservationId: 'latest',
  }
  assert.equal(resolveSelectedObservationId({ ...base, followLatest: true }), 'latest')
  assert.equal(resolveSelectedObservationId({ ...base, isPlaying: true }), 'pointer')
  assert.equal(resolveSelectedObservationId(base), 'selected')
  assert.equal(resolveSelectedObservationId({ ...base, followLatest: true, latestObservationId: null }), null)
})

test('topology selection mirrors the live tail, playback pointer and user choice', () => {
  const base = {
    followLatest: false,
    isPlaying: false,
    liveActivityId: 'live',
    replayActivityId: 'replay',
    selectedActivityId: 'selected',
  }
  assert.equal(resolveTopologySelectedActivityId({ ...base, followLatest: true }), 'live')
  assert.equal(resolveTopologySelectedActivityId({ ...base, isPlaying: true }), 'replay')
  assert.equal(resolveTopologySelectedActivityId(base), 'selected')
})

test('sequence, topology and graph announce exactly one current view', () => {
  assert.deepEqual(resolveViewPressedStates('sequence', false), {
    sequence: true,
    topology: false,
    graph: false,
  })
  assert.deepEqual(resolveViewPressedStates('topology', false), {
    sequence: false,
    topology: true,
    graph: false,
  })
  // Opening the graph releases both canvas buttons.
  assert.deepEqual(resolveViewPressedStates('sequence', true), {
    sequence: false,
    topology: false,
    graph: true,
  })
  assert.deepEqual(resolveViewPressedStates('topology', true), {
    sequence: false,
    topology: false,
    graph: true,
  })
  for (const viewMode of ['sequence', 'topology']) {
    for (const graphVisible of [false, true]) {
      const pressed = Object.values(resolveViewPressedStates(viewMode, graphVisible))
      assert.equal(pressed.filter(Boolean).length, 1)
    }
  }
})

test('motion cues never steer replay, hidden tabs or reduced-motion timing', () => {
  assert.equal(canPresentMotionCue(true, 'visible'), true)
  assert.equal(canPresentMotionCue(false, 'visible'), false)
  assert.equal(canPresentMotionCue(true, 'hidden'), false)
  assert.equal(motionCueHoldMs(false), MOTION_CUE_HOLD_MS)
  assert.equal(motionCueHoldMs(true), REDUCED_MOTION_CUE_HOLD_MS)
  assert.equal(MOTION_CUE_HOLD_MS, 1400)
  assert.equal(REDUCED_MOTION_CUE_HOLD_MS, 240)
})

test('stage edge motion loops only for an executing Job outside replay', () => {
  assert.equal(shouldLoopStageMotion(false, 'Running'), true)
  assert.equal(shouldLoopStageMotion(false, 'Succeeded'), false)
  assert.equal(shouldLoopStageMotion(false, null), false)
  assert.equal(shouldLoopStageMotion(true, 'Running'), false)
})

test('a cue borrows focus only while following live facts, without inventing a stage', () => {
  const original = projection()
  assert.equal(applyMotionCueFocus(original, cue(), false), original)
  assert.equal(applyMotionCueFocus(original, cue({ stageId: null }), true), original)
  assert.equal(applyMotionCueFocus(original, null, true), original)

  const focused = applyMotionCueFocus(original, cue(), true)
  assert.notEqual(focused, original)
  assert.deepEqual(focused.focus, {
    stageId: 'generation',
    observationId: 'obs-1',
    partIndex: 2,
    windowIndex: 4,
    source: 'observation',
  })
  assert.deepEqual(original.focus, projection().focus)

  const failed = applyMotionCueFocus(original, cue({ kind: 'failure' }), true)
  assert.equal(failed.focus.source, 'failure')
})

test('a later protocol request failure keeps the last known unavailable coverage', () => {
  const knownUnavailable = {
    loaded: true,
    summaryCoverage: null,
    pageCoverage: ['notInstrumented'],
  }
  assert.equal(resolveProtocolEvidenceUnavailable({ ...knownUnavailable, requestError: null }), true)
  assert.equal(
    resolveProtocolEvidenceUnavailable({ ...knownUnavailable, requestError: new Error('protocol poll failed') }),
    true,
  )
  assert.equal(resolveProtocolEvidenceUnavailable({
    loaded: false,
    requestError: new Error('first load failed'),
    summaryCoverage: null,
    pageCoverage: [],
  }), false)
})

test('display status and latest projected stage skip unknown facts', () => {
  const facts = [
    { stageId: 'generation', status: 'unknown' },
    { stageId: 'storage', status: 'completed' },
    { stageId: 'verification', status: 'active' },
    { stageId: 'settlement', status: 'unknown' },
  ]
  assert.equal(resolveDisplayStatus(facts, 'storage'), 'completed')
  assert.equal(resolveDisplayStatus(facts, 'missing'), 'unknown')
  assert.equal(resolveLatestProjectedStageId(facts), 'verification')
  assert.equal(resolveLatestProjectedStageId(facts.slice(0, 2)), 'storage')
  assert.equal(resolveLatestProjectedStageId([]), null)
})
