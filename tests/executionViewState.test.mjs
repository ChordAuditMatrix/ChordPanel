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

const viewState = await vite.ssrLoadModule('/src/features/execution/data/executionViewState.ts')
const {
  DEFAULT_PLAYBACK_TEMPO,
  PLAYBACK_SPEEDS,
  advanceReplay,
  createExecutionViewState,
  followLatest,
  getVisibleReplayObservations,
  normalizePlaybackSpeed,
  normalizePlaybackTempo,
  selectObservation,
  selectStage,
  setPlaybackSpeed,
  setPlaybackTempo,
  setReplayObservation,
  setViewMode,
  sortReplayObservations,
  startReplay,
  stepReplay,
} = viewState

/** Recorded order disagrees with the source event clock on purpose. */
const observations = [
  { observationId: 'obs-c', recordedAtMs: 3000, eventTimeMs: 100, stageId: 'stage-3' },
  { observationId: 'obs-a', recordedAtMs: 1000, eventTimeMs: 300, stageId: 'stage-1' },
  { observationId: 'obs-d', recordedAtMs: 3000, eventTimeMs: 50, stageId: 'stage-4' },
  { observationId: 'obs-b', recordedAtMs: 2000, eventTimeMs: 200, stageId: 'stage-2' },
]

const ordered = ['obs-a', 'obs-b', 'obs-c', 'obs-d']
const ids = items => items.map(item => item.observationId)

function replayState() {
  return createExecutionViewState({ playbackSpeed: 2, isPlaying: true, replayObservationId: 'obs-b' })
}

test('initial state follows the newest facts in sequence mode, live and paused', () => {
  const state = createExecutionViewState()
  assert.equal(state.viewMode, 'sequence')
  assert.equal(state.followLatest, true)
  assert.equal(state.selectedStageId, null)
  assert.equal(state.selectedObservationId, null)
  assert.equal(state.replayObservationId, null)
  assert.equal(state.playbackSpeed, 1)
  assert.equal(state.isPlaying, false)
})

test('switching view mode preserves selection, replay pointer, follow mode, speed and play state', () => {
  const state = {
    ...replayState(),
    selectedStageId: 'stage-2',
    selectedObservationId: 'obs-b',
  }

  const topology = setViewMode(state, 'topology')
  assert.equal(topology.viewMode, 'topology')
  assert.deepEqual({ ...topology, viewMode: 'sequence' }, state)

  const sequence = setViewMode(topology, 'sequence')
  assert.equal(sequence.viewMode, 'sequence')
  assert.deepEqual(sequence, state)
})

test('a manual stage pick stops following and playback but keeps observation and replay position', () => {
  const state = { ...replayState(), selectedObservationId: 'obs-b' }
  const next = selectStage(state, 'stage-2')

  assert.equal(next.selectedStageId, 'stage-2')
  assert.equal(next.followLatest, false)
  assert.equal(next.isPlaying, false)
  assert.equal(next.selectedObservationId, 'obs-b')
  assert.equal(next.replayObservationId, 'obs-b')
  assert.equal(next.playbackSpeed, 2)

  const cleared = selectStage(next, null)
  assert.equal(cleared.selectedStageId, null)
  assert.equal(cleared.selectedObservationId, 'obs-b')
  assert.equal(cleared.replayObservationId, 'obs-b')
})

test('selecting an observation sets its stage, stops playback and never moves the replay pointer', () => {
  const state = { ...createExecutionViewState(), replayObservationId: 'obs-a', isPlaying: true }
  const next = selectObservation(state, 'obs-c', 'stage-3')

  assert.equal(next.selectedObservationId, 'obs-c')
  assert.equal(next.selectedStageId, 'stage-3')
  assert.equal(next.followLatest, false)
  assert.equal(next.isPlaying, false)
  assert.equal(next.replayObservationId, 'obs-a')
  assert.equal(next.viewMode, 'sequence')

  const withoutStage = selectObservation(next, 'obs-d')
  assert.equal(withoutStage.selectedStageId, null)
  assert.equal(withoutStage.selectedObservationId, 'obs-d')
})

test('following latest pauses playback and retains both the manual selection and the replay pointer', () => {
  const state = {
    ...selectObservation(selectStage(replayState(), 'stage-2'), 'obs-b', 'stage-2'),
    isPlaying: true,
  }
  const next = followLatest(state)

  assert.equal(next.followLatest, true)
  assert.equal(next.isPlaying, false)
  assert.equal(next.selectedStageId, 'stage-2')
  assert.equal(next.selectedObservationId, 'obs-b')
  assert.equal(next.replayObservationId, 'obs-b')
  assert.equal(next.playbackSpeed, 2)
  assert.equal(next.viewMode, 'sequence')
})

test('a real replay pointer pins and pauses, while null returns to live following', () => {
  const pinned = setReplayObservation(createExecutionViewState({ isPlaying: true }), 'obs-c')
  assert.equal(pinned.replayObservationId, 'obs-c')
  assert.equal(pinned.followLatest, false)
  assert.equal(pinned.isPlaying, false)

  const live = setReplayObservation({ ...pinned, isPlaying: true }, null)
  assert.equal(live.replayObservationId, null)
  assert.equal(live.followLatest, true)
  assert.equal(live.isPlaying, false)
})

test('replay order uses Admin recordedAtMs then observationId, ignoring the source event clock', () => {
  assert.deepEqual(ids(sortReplayObservations(observations)), ordered)
  assert.deepEqual(ids(sortReplayObservations([...observations].reverse())), ordered)

  const ties = [
    { observationId: 'obs-z', recordedAtMs: 500, eventTimeMs: 1 },
    { observationId: 'obs-m', recordedAtMs: 500, eventTimeMs: 2 },
    { observationId: 'obs-y', recordedAtMs: 400, eventTimeMs: 3 },
  ]
  assert.deepEqual(ids(sortReplayObservations(ties)), ['obs-y', 'obs-m', 'obs-z'])
})

test('startReplay stays paused with no events and never invents an id', () => {
  const state = replayState()
  const next = startReplay(state, [])
  assert.equal(next.replayObservationId, 'obs-b')
  assert.equal(next.isPlaying, false)
  assert.equal(next.followLatest, state.followLatest)

  const live = startReplay(createExecutionViewState(), [])
  assert.equal(live.replayObservationId, null)
  assert.equal(live.isPlaying, false)
})

test('startReplay from live plays the first event and stops following', () => {
  const state = createExecutionViewState({ selectedStageId: 'stage-1', selectedObservationId: 'obs-a' })
  const next = startReplay(state, observations)

  assert.equal(next.replayObservationId, 'obs-a')
  assert.equal(next.followLatest, false)
  assert.equal(next.isPlaying, true)
  assert.equal(next.selectedStageId, 'stage-1')
  assert.equal(next.selectedObservationId, 'obs-a')
})

test('startReplay resumes at the existing pointer, and a pointer on the last event stays paused', () => {
  const resumed = startReplay({ ...replayState(), isPlaying: false }, observations)
  assert.equal(resumed.replayObservationId, 'obs-b')
  assert.equal(resumed.followLatest, false)
  assert.equal(resumed.isPlaying, true)

  const atEnd = startReplay(createExecutionViewState({ replayObservationId: 'obs-d' }), observations)
  assert.equal(atEnd.replayObservationId, 'obs-d')
  assert.equal(atEnd.isPlaying, false)
  assert.equal(atEnd.followLatest, false)
})

test('a single event cannot start playback', () => {
  const next = startReplay(createExecutionViewState(), [observations[1]])
  assert.equal(next.replayObservationId, 'obs-a')
  assert.equal(next.isPlaying, false)
})

test('advanceReplay moves exactly one event and pauses on the last one without looping', () => {
  const first = advanceReplay(createExecutionViewState(), observations)
  assert.equal(first.replayObservationId, 'obs-a')
  assert.equal(first.followLatest, false)
  assert.equal(first.isPlaying, false)

  const middle = advanceReplay(createExecutionViewState({ replayObservationId: 'obs-a', isPlaying: true }), observations)
  assert.equal(middle.replayObservationId, 'obs-b')
  assert.equal(middle.isPlaying, true)

  const last = advanceReplay(createExecutionViewState({ replayObservationId: 'obs-c', isPlaying: true }), observations)
  assert.equal(last.replayObservationId, 'obs-d')
  assert.equal(last.isPlaying, false)

  const beyond = advanceReplay({ ...last, isPlaying: true }, observations)
  assert.equal(beyond.replayObservationId, 'obs-d')
  assert.equal(beyond.isPlaying, false)
})

test('advanceReplay with no events stays paused and keeps the pointer', () => {
  const next = advanceReplay(replayState(), [])
  assert.equal(next.replayObservationId, 'obs-b')
  assert.equal(next.isPlaying, false)
})

test('stepReplay moves one bounded event in either direction and pauses', () => {
  const forward = stepReplay(replayState(), observations, 1)
  assert.equal(forward.replayObservationId, 'obs-c')
  assert.equal(forward.isPlaying, false)
  assert.equal(forward.followLatest, false)

  const backward = stepReplay(replayState(), observations, -1)
  assert.equal(backward.replayObservationId, 'obs-a')
  assert.equal(backward.isPlaying, false)

  const start = stepReplay(createExecutionViewState({ replayObservationId: 'obs-a', isPlaying: true }), observations, -1)
  assert.equal(start.replayObservationId, 'obs-a')
  assert.equal(start.isPlaying, false)

  const end = stepReplay(createExecutionViewState({ replayObservationId: 'obs-d', isPlaying: true }), observations, 1)
  assert.equal(end.replayObservationId, 'obs-d')
  assert.equal(end.isPlaying, false)

  const liveBack = stepReplay(createExecutionViewState(), observations, -1)
  assert.equal(liveBack.replayObservationId, 'obs-a')
})

test('visible replay observations are the full list when live and the prefix when pinned', () => {
  assert.deepEqual(ids(getVisibleReplayObservations(createExecutionViewState(), observations)), ordered)
  assert.deepEqual(
    ids(getVisibleReplayObservations(createExecutionViewState({ replayObservationId: 'obs-c' }), observations)),
    ['obs-a', 'obs-b', 'obs-c'],
  )
  assert.deepEqual(
    ids(getVisibleReplayObservations(createExecutionViewState({ replayObservationId: 'obs-d' }), observations)),
    ordered,
  )
})

test('an unknown replay pointer exposes nothing instead of pretending to be live', () => {
  const visible = getVisibleReplayObservations(createExecutionViewState({ replayObservationId: 'obs-missing' }), observations)
  assert.deepEqual(visible, [])
})

test('playback speed accepts only the fixed values and falls back to 1 for NaN or unknown input', () => {
  assert.deepEqual([...PLAYBACK_SPEEDS], [0.5, 1, 2, 4])
  for (const speed of PLAYBACK_SPEEDS) {
    assert.equal(normalizePlaybackSpeed(speed), speed)
    assert.equal(setPlaybackSpeed(createExecutionViewState(), speed).playbackSpeed, speed)
  }
  for (const invalid of [Number.NaN, 3, 0, -1, null, undefined, '2', Number.POSITIVE_INFINITY]) {
    assert.equal(normalizePlaybackSpeed(invalid), 1)
    assert.equal(createExecutionViewState({ playbackSpeed: invalid }).playbackSpeed, 1)
  }

  const changed = setPlaybackSpeed(replayState(), 4)
  assert.equal(changed.playbackSpeed, 4)
  assert.equal(changed.isPlaying, true)
  assert.equal(changed.replayObservationId, 'obs-b')
})
test('compact demonstration tempo is the default and recorded timing stays optional', () => {
  assert.equal(DEFAULT_PLAYBACK_TEMPO, 'compact')
  assert.equal(createExecutionViewState().playbackTempo, 'compact')
  assert.equal(normalizePlaybackTempo('recorded'), 'recorded')
  assert.equal(normalizePlaybackTempo('unexpected'), 'compact')
  assert.equal(setPlaybackTempo(replayState(), 'recorded').playbackTempo, 'recorded')
})
