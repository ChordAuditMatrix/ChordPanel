import { onUnmounted, type Ref } from 'vue'
import type { TraceObservation } from '@/api/trace'
import {
  advanceReplay,
  followLatest as followLatestState,
  setPlaybackSpeed,
  setPlaybackTempo,
  setReplayObservation,
  sortReplayObservations,
  startReplay,
  stepReplay,
  type ExecutionViewState,
  type PlaybackSpeed,
} from './data/executionViewState'

const RECORDED_REPLAY_TICK_MS = 250
const COMPACT_DEMO_TICK_MS = 80
const COMPACT_DEMO_STEP_MS = 1_500

/**
 * Compact mode advances one recorded observation per presentation interval;
 * recorded mode follows Admin recording-time gaps. Neither cadence is network
 * latency.
 */
export function useExecutionReplay(
  observations: Readonly<Ref<readonly TraceObservation[]>>,
  state: Ref<ExecutionViewState>,
) {
  let timer: number | null = null
  let anchorPerformanceMs = 0
  let anchorRecordedAtMs = 0
  let anchorSpeed: PlaybackSpeed = state.value.playbackSpeed

  const ordered = () => sortReplayObservations(observations.value)

  function stopTimer() {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  function currentPointerIndex(items: readonly TraceObservation[]): number {
    const id = state.value.replayObservationId
    return id === null ? -1 : items.findIndex(item => item.observationId === id)
  }

  function anchorAtCurrent(items: readonly TraceObservation[]) {
    const index = currentPointerIndex(items)
    if (index < 0 || !items[index]) return false
    anchorPerformanceMs = performance.now()
    anchorRecordedAtMs = items[index].recordedAtMs
    anchorSpeed = state.value.playbackSpeed
    return true
  }

  function tick() {
    if (!state.value.isPlaying) {
      stopTimer()
      return
    }

    const items = ordered()
    const currentIndex = currentPointerIndex(items)
    if (currentIndex < 0) {
      stopTimer()
      state.value = { ...state.value, isPlaying: false }
      return
    }

    if (state.value.playbackTempo === 'compact') {
      const intervalMs = COMPACT_DEMO_STEP_MS / state.value.playbackSpeed
      const elapsed = performance.now() - anchorPerformanceMs
      const steps = Math.floor(elapsed / intervalMs)
      if (steps < 1) return
      let next = state.value
      for (let index = 0; index < steps && next.isPlaying; index += 1) {
        next = advanceReplay(next, items)
      }
      state.value = next
      anchorPerformanceMs += steps * intervalMs
      if (!next.isPlaying) stopTimer()
      return
    }

    const targetRecordedAtMs = anchorRecordedAtMs
      + (performance.now() - anchorPerformanceMs) * anchorSpeed
    let targetIndex = currentIndex
    while (
      targetIndex + 1 < items.length
      && items[targetIndex + 1].recordedAtMs <= targetRecordedAtMs
    ) {
      targetIndex += 1
    }

    if (targetIndex === currentIndex) return
    const atEnd = targetIndex === items.length - 1
    state.value = {
      ...state.value,
      replayObservationId: items[targetIndex].observationId,
      isPlaying: !atEnd,
    }
    if (atEnd) stopTimer()
  }

  function startTimer() {
    stopTimer()
    const interval = state.value.playbackTempo === 'compact'
      ? COMPACT_DEMO_TICK_MS
      : RECORDED_REPLAY_TICK_MS
    timer = window.setInterval(tick, interval)
  }

  function play() {
    const items = ordered()
    state.value = startReplay(state.value, items)
    if (!state.value.isPlaying) {
      stopTimer()
      return
    }
    if (!anchorAtCurrent(items)) {
      state.value = { ...state.value, isPlaying: false }
      stopTimer()
      return
    }
    startTimer()
  }

  function pause() {
    stopTimer()
    state.value = { ...state.value, isPlaying: false }
  }

  function seek(observationId: string | null) {
    stopTimer()
    state.value = setReplayObservation(state.value, observationId)
  }

  function step(delta: number) {
    stopTimer()
    state.value = stepReplay(state.value, ordered(), delta)
  }

  function changeSpeed(speed: unknown) {
    state.value = setPlaybackSpeed(state.value, speed)
    if (state.value.isPlaying) {
      if (anchorAtCurrent(ordered())) startTimer()
      else pause()
    }
  }

  function changeTempo(tempo: unknown) {
    state.value = setPlaybackTempo(state.value, tempo)
    if (state.value.isPlaying) {
      if (anchorAtCurrent(ordered())) startTimer()
      else pause()
    }
  }

  function followLatest() {
    stopTimer()
    state.value = followLatestState(state.value)
  }

  onUnmounted(stopTimer)

  return { play, pause, seek, step, changeSpeed, changeTempo, followLatest }
}
