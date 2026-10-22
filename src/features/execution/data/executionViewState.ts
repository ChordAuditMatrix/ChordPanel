/**
 * Pure presentation state for the execution sequence/topology views and replay.
 * Every action returns a new state object: it only touches the fields it owns, so a view switch
 * cannot drop a manual selection, and a selection cannot move the replay pointer.
 * Replay order is Admin recording order (`recordedAtMs`), never the source event clock.
 */

export type ExecutionViewMode = 'sequence' | 'topology'

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1

export interface ExecutionViewState {
  viewMode: ExecutionViewMode
  /** True while the views track the newest source facts instead of a manual selection. */
  followLatest: boolean
  selectedStageId: string | null
  selectedObservationId: string | null
  /** null means live: replay is not pinned to any observation. */
  replayObservationId: string | null
  playbackSpeed: PlaybackSpeed
  isPlaying: boolean
}

/** The minimum a replayable fact must expose. Extra fields pass through untouched. */
export interface ReplayObservation {
  observationId: string
  recordedAtMs: number
}

export function normalizePlaybackSpeed(value: unknown): PlaybackSpeed {
  for (const speed of PLAYBACK_SPEEDS) if (value === speed) return speed
  return DEFAULT_PLAYBACK_SPEED
}

export function createExecutionViewState(overrides: Partial<ExecutionViewState> = {}): ExecutionViewState {
  return {
    viewMode: overrides.viewMode === 'topology' ? 'topology' : 'sequence',
    followLatest: overrides.followLatest ?? true,
    selectedStageId: overrides.selectedStageId ?? null,
    selectedObservationId: overrides.selectedObservationId ?? null,
    replayObservationId: overrides.replayObservationId ?? null,
    playbackSpeed: normalizePlaybackSpeed(overrides.playbackSpeed),
    isPlaying: overrides.isPlaying ?? false,
  }
}

/** Switching views is a presentation change only. */
export function setViewMode(state: ExecutionViewState, viewMode: ExecutionViewMode): ExecutionViewState {
  return { ...state, viewMode }
}

/** A manual stage pick leaves the follow mode and stops playback, but keeps the replay pointer. */
export function selectStage(state: ExecutionViewState, stageId: string | null): ExecutionViewState {
  return { ...state, selectedStageId: stageId, followLatest: false, isPlaying: false }
}

/** Selecting an observation also selects its stage and stops playback; the replay pointer stays put. */
export function selectObservation(
  state: ExecutionViewState,
  observationId: string,
  stageId: string | null = null,
): ExecutionViewState {
  return {
    ...state,
    selectedObservationId: observationId,
    selectedStageId: stageId,
    followLatest: false,
    isPlaying: false,
  }
}

/** Return to following the newest facts; manual selection and the replay pointer are retained. */
export function followLatest(state: ExecutionViewState): ExecutionViewState {
  return { ...state, followLatest: true, isPlaying: false }
}

/**
 * Pin replay to an observation (paused), or pass null to return to live/all events.
 * Only real IDs supplied by the caller are accepted; nothing is invented here.
 */
export function setReplayObservation(state: ExecutionViewState, observationId: string | null): ExecutionViewState {
  if (observationId === null) {
    return { ...state, replayObservationId: null, followLatest: true, isPlaying: false }
  }
  return { ...state, replayObservationId: observationId, followLatest: false, isPlaying: false }
}

export function setPlaybackSpeed(state: ExecutionViewState, speed: unknown): ExecutionViewState {
  return { ...state, playbackSpeed: normalizePlaybackSpeed(speed) }
}

function compareObservations(left: ReplayObservation, right: ReplayObservation): number {
  if (left.recordedAtMs !== right.recordedAtMs) return left.recordedAtMs < right.recordedAtMs ? -1 : 1
  if (left.observationId === right.observationId) return 0
  return left.observationId < right.observationId ? -1 : 1
}

/** Deterministic replay order: Admin recording time, then observation ID. */
export function sortReplayObservations<T extends ReplayObservation>(observations: readonly T[]): T[] {
  return [...observations].sort(compareObservations)
}

/** -1 means live (no pointer) or a pointer that is not part of the loaded facts. */
function pointerIndex(state: ExecutionViewState, sorted: readonly ReplayObservation[]): number {
  if (state.replayObservationId === null) return -1
  return sorted.findIndex(observation => observation.observationId === state.replayObservationId)
}

/**
 * Live starts at the first event; an existing pointer resumes from where it is.
 * Playback only runs when another event follows the pointer.
 */
export function startReplay<T extends ReplayObservation>(
  state: ExecutionViewState,
  observations: readonly T[],
): ExecutionViewState {
  const sorted = sortReplayObservations(observations)
  if (sorted.length === 0) return { ...state, isPlaying: false }
  const index = pointerIndex(state, sorted)
  const startIndex = index < 0 ? 0 : index
  return {
    ...state,
    replayObservationId: sorted[startIndex].observationId,
    followLatest: false,
    isPlaying: startIndex < sorted.length - 1,
  }
}

/**
 * Move exactly one event forward. The final event pauses playback; there is no loop back to the start.
 */
export function advanceReplay<T extends ReplayObservation>(
  state: ExecutionViewState,
  observations: readonly T[],
): ExecutionViewState {
  const sorted = sortReplayObservations(observations)
  if (sorted.length === 0) return { ...state, isPlaying: false }
  const nextIndex = Math.min(pointerIndex(state, sorted) + 1, sorted.length - 1)
  const atEnd = nextIndex === sorted.length - 1
  return {
    ...state,
    replayObservationId: sorted[nextIndex].observationId,
    followLatest: false,
    isPlaying: atEnd ? false : state.isPlaying,
  }
}

/** Manual stepping by one bounded event; always pauses. */
export function stepReplay<T extends ReplayObservation>(
  state: ExecutionViewState,
  observations: readonly T[],
  delta: number,
): ExecutionViewState {
  const sorted = sortReplayObservations(observations)
  if (sorted.length === 0) return { ...state, isPlaying: false }
  if (!Number.isFinite(delta) || delta === 0) return { ...state, isPlaying: false }
  const step = delta > 0 ? 1 : -1
  const index = pointerIndex(state, sorted)
  const base = index < 0 ? (step > 0 ? -1 : 0) : index
  const target = Math.min(Math.max(base + step, 0), sorted.length - 1)
  return {
    ...state,
    replayObservationId: sorted[target].observationId,
    followLatest: false,
    isPlaying: false,
  }
}

/**
 * Live returns every event; a pinned replay returns the prefix through the pinned event.
 * An unknown pointer yields nothing so a stale selection cannot masquerade as live data.
 */
export function getVisibleReplayObservations<T extends ReplayObservation>(
  state: ExecutionViewState,
  observations: readonly T[],
): T[] {
  const sorted = sortReplayObservations(observations)
  if (state.replayObservationId === null) return sorted
  const index = sorted.findIndex(observation => observation.observationId === state.replayObservationId)
  return index < 0 ? [] : sorted.slice(0, index + 1)
}
