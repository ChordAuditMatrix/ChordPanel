import type { TraceCoverageState } from '@/api/trace'
import { isProtocolEvidenceUnavailable } from '@/features/execution/data/executionCommunication'
import type {
  ExecutionDisplayProjection,
  ExecutionDisplayStatus,
} from '@/features/execution/data/executionDisplayProjection'
import type { MotionCue } from '@/features/execution/data/executionMotion'
import type { ExecutionViewMode, ExecutionViewState } from '@/features/execution/data/executionViewState'

/**
 * Pure page-level guards for the execution view.
 *
 * Each guard states one invariant that the live/replay page must keep while its
 * presentation pieces are extracted into dedicated composables:
 * - Live focus follows the newest recorded fact; replay focus follows the user.
 * - A motion cue may only borrow the focus while the page follows live facts.
 * - Graph, sequence and topology are mutually exclusive views at any moment.
 */

export const MOTION_CUE_HOLD_MS = 1_400
export const REDUCED_MOTION_CUE_HOLD_MS = 240

/** Replay is historical only while the user has stepped off the live tail. */
export function deriveHistoricalReplay(state: Pick<ExecutionViewState, 'followLatest' | 'replayObservationId'>): boolean {
  return !state.followLatest && state.replayObservationId !== null
}

export interface SequenceStageIdInput {
  followLatest: boolean
  selectedStageId: string | null
  activeCueStageId: string | null
  focusStageId: string | null
  latestObservedStageId: string | null
  latestProjectedStageId: string | null
}

/**
 * Live mode owns the focus: a temporary cue wins over the display focus, which
 * wins over the newest observed stage. Replay mode never promotes a live fact.
 */
export function resolveSequenceStageId(input: SequenceStageIdInput): string | null {
  if (!input.followLatest) return input.selectedStageId
  return input.activeCueStageId
    ?? input.focusStageId
    ?? input.latestObservedStageId
    ?? input.latestProjectedStageId
}

export interface SelectedObservationIdInput {
  followLatest: boolean
  isPlaying: boolean
  replayObservationId: string | null
  selectedObservationId: string | null
  latestObservationId: string | null
}

/** The selected observation always exists in the visible prefix. */
export function resolveSelectedObservationId(input: SelectedObservationIdInput): string | null {
  if (input.followLatest) return input.latestObservationId
  if (input.isPlaying) return input.replayObservationId
  return input.selectedObservationId
}

export interface TopologyActivitySelectionInput {
  followLatest: boolean
  isPlaying: boolean
  liveActivityId: string | null
  replayActivityId: string | null
  selectedActivityId: string | null
}

/** Topology selection mirrors the sequence rule: live tail, playback, then user. */
export function resolveTopologySelectedActivityId(
  input: TopologyActivitySelectionInput,
): string | null {
  if (input.followLatest) return input.liveActivityId
  if (input.isPlaying) return input.replayActivityId
  return input.selectedActivityId
}

export interface ViewPressedStates {
  sequence: boolean
  topology: boolean
  graph: boolean
}

/**
 * Pressed state is exclusive: opening the graph must release both canvas
 * buttons, and returning to sequence/topology must release the graph button.
 */
export function resolveViewPressedStates(
  viewMode: ExecutionViewMode,
  graphVisible: boolean,
): ViewPressedStates {
  return {
    sequence: !graphVisible && viewMode === 'sequence',
    topology: !graphVisible && viewMode === 'topology',
    graph: graphVisible,
  }
}

/** A cue may steer the page only while following live facts. */
export function canPresentMotionCue(followLatest: boolean, visibilityState: string): boolean {
  return followLatest && visibilityState !== 'hidden'
}

/** Reduced motion shortens the cue borrow; it never removes the recorded cue. */
export function motionCueHoldMs(reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_MOTION_CUE_HOLD_MS : MOTION_CUE_HOLD_MS
}

/** Stage edge motion marks an executing Job; replay and finished Jobs stay still. */
export function shouldLoopStageMotion(
  isHistoricalReplay: boolean,
  jobStatus: string | null,
): boolean {
  return !isHistoricalReplay && jobStatus === 'Running'
}

/**
 * Borrow the display focus for one cue without inventing a stage or a fact.
 * Cues without a stage cannot move the focus.
 */
export function applyMotionCueFocus(
  projection: ExecutionDisplayProjection,
  cue: MotionCue | null,
  followLatest: boolean,
): ExecutionDisplayProjection {
  if (!followLatest || !cue?.stageId) return projection
  return {
    ...projection,
    focus: {
      stageId: cue.stageId,
      observationId: cue.observationId,
      partIndex: cue.partIndex,
      windowIndex: cue.windowIndex,
      source: cue.kind === 'failure' ? 'failure' : 'observation',
    },
  }
}

/** Unknown stages render as unreported, never as observed. */
export function resolveDisplayStatus(
  facts: readonly { stageId: string; status: ExecutionDisplayStatus }[],
  stageId: string,
): ExecutionDisplayStatus {
  for (const fact of facts) {
    if (fact.stageId === stageId) return fact.status
  }
  return 'unknown'
}

/** The newest projected stage that carries a recorded status, skipping unknowns. */
export function resolveLatestProjectedStageId(
  facts: readonly { stageId: string; status: ExecutionDisplayStatus }[],
): string | null {
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    if (facts[index].status !== 'unknown') return facts[index].stageId
  }
  return null
}

export interface ProtocolEvidenceAvailabilityInput {
  /** At least one protocol read has completed. */
  loaded: boolean
  /**
   * A later poll may fail after a successful read. The page's normal
   * resource-error path renders that failure; it must not erase the coverage
   * the successful read already established, so this guard does not use it.
   */
  requestError: unknown | null
  summaryCoverage: TraceCoverageState | null | undefined
  pageCoverage: readonly (TraceCoverageState | null)[]
}

/**
 * The last known protocol coverage stays authoritative while a later request
 * error is displayed separately. Only a resource that never loaded has no
 * known coverage to report.
 */
export function resolveProtocolEvidenceUnavailable(input: ProtocolEvidenceAvailabilityInput): boolean {
  if (!input.loaded) return false
  return isProtocolEvidenceUnavailable(input.summaryCoverage, input.pageCoverage)
}
