import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import type { TraceObservation } from '@/api/trace'
import {
  executionCommunicationActivityForObservation,
  type ExecutionCommunicationActivity,
} from '@/features/execution/data/executionCommunication'
import {
  createMotionCueQueue,
  enqueueMotionCues,
  takeNextMotionCue,
  type MotionCue,
} from '@/features/execution/data/executionMotion'
import { canPresentMotionCue, motionCueHoldMs } from '@/features/execution/data/executionPageGuards'

export interface ExecutionMotionCuesInput {
  jobId: ComputedRef<string | null>
  observations: ComputedRef<readonly TraceObservation[]>
  observationsLoaded: ComputedRef<boolean>
  followLatest: ComputedRef<boolean>
  /** Cues from the shared display projection; queueing never mutates facts. */
  cues: ComputedRef<readonly MotionCue[]>
  activities: ComputedRef<readonly ExecutionCommunicationActivity[]>
  /** Pause playback when the tab hides; the page owns the replay clock. */
  onHidden?(): void
}

/**
 * Page-level motion queue for newly recorded observations.
 *
 * Only the live tail animates: replay, hidden tabs and reduced-motion users keep
 * the same recorded facts without borrowing focus. The queue is bounded and its
 * overflow counter is presentation metadata, never an observation substitute.
 */
export function useExecutionMotionCues(input: ExecutionMotionCuesInput) {
  const motionCueQueue = ref(createMotionCueQueue())
  const activeMotionCue = ref<MotionCue | null>(null)
  const animationActivityId = ref<string | null>(null)
  const liveActivityId = ref<string | null>(null)
  const aggregatedCount = computed(() => motionCueQueue.value.aggregatedCount)

  let motionCueTimer: number | null = null
  let observationsHydrated = false
  const seenObservationIds = new Set<string>()

  function activityForObservation(observationId: string | null): ExecutionCommunicationActivity | null {
    if (!observationId) return null
    const observation = input.observations.value.find(item => item.observationId === observationId)
    return executionCommunicationActivityForObservation(observation, input.activities.value)
  }

  function stopMotionCueTimer(): void {
    if (motionCueTimer !== null) window.clearTimeout(motionCueTimer)
    motionCueTimer = null
  }

  function resetMotionCueState(): void {
    stopMotionCueTimer()
    motionCueQueue.value = createMotionCueQueue()
    activeMotionCue.value = null
    animationActivityId.value = null
    liveActivityId.value = null
  }

  function resetForJobChange(): void {
    resetMotionCueState()
    observationsHydrated = false
    seenObservationIds.clear()
  }

  function scheduleActiveMotionCueEnd(): void {
    if (
      !activeMotionCue.value
      || motionCueTimer !== null
      || document.visibilityState === 'hidden'
    ) return
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    motionCueTimer = window.setTimeout(() => {
      motionCueTimer = null
      activeMotionCue.value = null
      animationActivityId.value = null
      if (input.followLatest.value) presentNextMotionCue()
    }, motionCueHoldMs(reducedMotion))
  }

  function presentNextMotionCue(): void {
    if (!canPresentMotionCue(input.followLatest.value, document.visibilityState)) return
    if (activeMotionCue.value) {
      animationActivityId.value = activeMotionCue.value.activityId
      liveActivityId.value = activeMotionCue.value.activityId
      scheduleActiveMotionCueEnd()
      return
    }
    const next = takeNextMotionCue(motionCueQueue.value)
    motionCueQueue.value = next.queue
    if (!next.cue) {
      animationActivityId.value = null
      liveActivityId.value = null
      return
    }
    activeMotionCue.value = next.cue
    animationActivityId.value = next.cue.activityId
    liveActivityId.value = next.cue.activityId
    scheduleActiveMotionCueEnd()
  }

  function handlePageVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      input.onHidden?.()
      stopMotionCueTimer()
      animationActivityId.value = null
      return
    }
    presentNextMotionCue()
  }

  watch(
    [
      input.jobId,
      input.observationsLoaded,
      input.observations,
      input.activities,
      input.followLatest,
    ],
    ([activeJobId, loaded, items, , followLatest], previous) => {
      if (activeJobId !== previous?.[0]) {
        resetForJobChange()
        return
      }
      if (!activeJobId || !loaded) return
      const currentItems = items ?? []
      if (!observationsHydrated) {
        for (const observation of currentItems) seenObservationIds.add(observation.observationId)
        observationsHydrated = true
        const latest = currentItems[currentItems.length - 1]
        liveActivityId.value = activityForObservation(latest?.observationId ?? null)?.activityId ?? null
        return
      }

      const incoming: string[] = []
      for (const observation of currentItems) {
        if (seenObservationIds.has(observation.observationId)) continue
        seenObservationIds.add(observation.observationId)
        incoming.push(observation.observationId)
      }
      if (!followLatest) return
      if (incoming.length === 0) {
        if (!activeMotionCue.value) {
          const latest = currentItems[currentItems.length - 1]
          liveActivityId.value = activityForObservation(latest?.observationId ?? null)?.activityId ?? null
        }
        return
      }

      const incomingIds = new Set(incoming)
      const cues = input.cues.value.filter(cue => incomingIds.has(cue.observationId))
      motionCueQueue.value = enqueueMotionCues(motionCueQueue.value, cues)
      presentNextMotionCue()
    },
    { flush: 'post' },
  )

  onMounted(() => document.addEventListener('visibilitychange', handlePageVisibilityChange))
  onUnmounted(() => {
    stopMotionCueTimer()
    document.removeEventListener('visibilitychange', handlePageVisibilityChange)
  })

  return {
    motionCueQueue,
    aggregatedCount,
    activeMotionCue,
    animationActivityId,
    liveActivityId,
    activityForObservation,
    presentNextMotionCue,
    resetMotionCueState,
    resetForJobChange,
  }
}
