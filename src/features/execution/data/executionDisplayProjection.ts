import type { TaskSummary } from '@/api/job'
import type {
  TraceExecutionKind,
  TraceObservation,
  TraceObservationMetricKey,
  TracePart,
  TraceSummary,
  TraceUint64,
} from '@/api/trace'
import type { ExecutionCommunicationProjection } from '@/features/execution/data/executionCommunication'
import type { ExecutionStage } from '@/features/execution/data/executionStages'
import { createMotionCues, type MotionCue } from '@/features/execution/data/executionMotion'

export type ExecutionDisplayStatus = 'unknown' | 'snapshot' | 'observed' | 'active' | 'completed' | 'failed'
export type ExecutionDisplayMode = 'live' | 'replay'
export type ExecutionFocusSource = 'failure' | 'task' | 'part' | 'observation' | 'summary' | 'none'
export type ExecutionDisplaySource = 'summary' | 'part' | 'task' | 'observation' | null

export interface ExecutionStageDisplayFact {
  stageId: string
  status: ExecutionDisplayStatus
  source: ExecutionDisplaySource
  evidenceCount: number
  lastObservationId: string | null
  failureObservationId: string | null
}

export interface ExecutionWindowDisplayFact {
  windowIndex: number
  status: string
  taskId: string | null
  taskStatus: string | null
  generatedCount: TraceUint64 | null
  storageAccountedTagCount: TraceUint64 | null
}

export interface ExecutionPartDisplayFact {
  partIndex: number
  attempt: number | null
  status: string
  source: 'snapshot' | 'observation'
  plannedBlockCount: TraceUint64 | null
  generatedBlockCount: TraceUint64 | null
  storageAccountedTagCount: TraceUint64 | null
  generateTaskId: string | null
  generateTaskStatus: string | null
  windowsRequested: boolean | null
  windows: ExecutionWindowDisplayFact[]
  lastObservationId: string | null
}

export interface TagGenerationProgressFact {
  plannedPartCount: TraceUint64 | null
  completedPartCount: TraceUint64 | null
  plannedBlockCount: TraceUint64 | null
  generatedBlockCount: TraceUint64 | null
  storageAccountedTagCount: TraceUint64 | null
  calculationPercent: number | null
  storagePercent: number | null
  storageLagging: boolean | null
  source: 'summary' | 'observations' | 'unknown'
}

export interface ExecutionDisplayFocus {
  stageId: string | null
  observationId: string | null
  partIndex: number | null
  windowIndex: number | null
  source: ExecutionFocusSource
}

export interface ExecutionDisplayProjection {
  facts: {
    stages: ExecutionStageDisplayFact[]
    parts: ExecutionPartDisplayFact[]
    progress: TagGenerationProgressFact
    isReplay: boolean
    finalSnapshotAvailable: boolean
    storageNodeId: string | null
  }
  focus: ExecutionDisplayFocus
  cues: MotionCue[]
}

export interface ExecutionDisplayInput {
  activeJobId: string
  kind: TraceExecutionKind | null
  stages: readonly ExecutionStage[]
  observations: readonly TraceObservation[]
  summary: TraceSummary | null
  parts: readonly TracePart[]
  tasks: readonly TaskSummary[]
  /** Storage destination copied from this Job's Admin metadata, never inferred from node role. */
  storageNodeId: string | null
  communication: ExecutionCommunicationProjection
  mode: ExecutionDisplayMode
}

const UINT64_MAX = 18_446_744_073_709_551_615n
const DECIMAL_UINT64 = /^(0|[1-9][0-9]*)$/
const FAILURE_OUTCOMES: Record<string, true> = {
  failed: true,
  cancelled: true,
  timedOut: true,
}
const FAILURE_EVENTS: Record<string, true> = {
  TagWindowFailed: true,
  MaintenanceRecoveryRefused: true,
}
const COMPLETION_EVENTS: Record<string, Record<string, true>> = {
  challengeProof: {
    AlgorithmSelectionResolved: true,
    ChallengeTagRangesQueried: true,
    ChallengeSamplingDecided: true,
    ChallengeDispatchAccepted: true,
    ChallengeMaterialGenerated: true,
    ChallengeDeliveredToStorage: true,
    ProofGenerationCompleted: true,
    ProofReturnedToAudit: true,
    ProofVerificationCompleted: true,
    ChallengeJobCompleted: true,
  },
  tagGeneration: {
    TagLayoutPlanned: true,
    TagGenerationPlanCommitted: true,
    TagGenerationFinalized: true,
  },
  identityVerification: {
    IdentityDispatchAccepted: true,
    IdentityVerificationCompleted: true,
  },
}

function countValue(value: unknown): bigint | null {
  if (typeof value !== 'string' || !DECIMAL_UINT64.test(value)) return null
  try {
    const parsed = BigInt(value)
    return parsed <= UINT64_MAX ? parsed : null
  } catch {
    return null
  }
}

/** Return an exact two-decimal percentage, or null when the ratio is not sound. */
export function calculateProgressPercent(
  numerator: string | null | undefined,
  denominator: string | null | undefined,
): number | null {
  const count = countValue(numerator)
  const total = countValue(denominator)
  if (count === null || total === null || total === 0n || count > total) return null
  return Number((count * 10_000n + total / 2n) / total) / 100
}

function compareObservations(left: TraceObservation, right: TraceObservation): number {
  if (left.recordedAtMs !== right.recordedAtMs) return left.recordedAtMs < right.recordedAtMs ? -1 : 1
  if (left.observationId === right.observationId) return 0
  return left.observationId < right.observationId ? -1 : 1
}

function latestObservation(observations: readonly TraceObservation[]): TraceObservation | null {
  let latest: TraceObservation | null = null
  for (const observation of observations) {
    if (!latest || compareObservations(latest, observation) < 0) latest = observation
  }
  return latest
}

function taskStatus(task: TaskSummary | null | undefined): string | null {
  return task?.status ?? null
}

function normalizedStatus(status: string | null | undefined): string {
  return typeof status === 'string' ? status.toLowerCase() : ''
}

function isFailureObservation(observation: TraceObservation): boolean {
  return FAILURE_EVENTS[observation.eventType] === true
    || (!!observation.outcome && FAILURE_OUTCOMES[observation.outcome] === true)
}

function observationIsCompleted(stageId: string, evidence: ExecutionStage['evidence']): boolean {
  const completionEvents = COMPLETION_EVENTS[stageId]
  return evidence.some(row => completionEvents?.[row.eventType] === true)
}

function compareActiveCounts(
  planned: string | null,
  completed: string | null,
  coverage: string | null | undefined,
): boolean {
  const plan = countValue(planned)
  const done = countValue(completed)
  return coverage === 'complete' && plan !== null && done !== null && plan === done
}

function taskIndex(tasks: readonly TaskSummary[], activeJobId: string): Map<string, TaskSummary> {
  const byId = new Map<string, TaskSummary>()
  for (const task of tasks) {
    if (task.jobId === activeJobId) byId.set(task.taskId, task)
  }
  return byId
}

function snapshotParts(
  parts: readonly TracePart[],
  tasks: ReadonlyMap<string, TaskSummary>,
  activeJobId: string,
): ExecutionPartDisplayFact[] {
  return parts.flatMap((part) => {
    if (part.jobId !== activeJobId) return []
    const generateTask = part.generateTaskId ? tasks.get(part.generateTaskId) : undefined
    return [{
      partIndex: part.partIndex,
      attempt: part.attempt,
      status: part.status ?? 'unknown',
      source: 'snapshot' as const,
      plannedBlockCount: part.plannedBlockCount ?? null,
      generatedBlockCount: part.generatedBlockCount ?? null,
      storageAccountedTagCount: part.storageAccountedTagCount ?? null,
      generateTaskId: part.generateTaskId,
      generateTaskStatus: taskStatus(generateTask),
      windowsRequested: part.windows !== undefined,
      windows: (part.windows ?? []).map(window => ({
        windowIndex: window.windowIndex,
        status: window.state ?? 'unknown',
        taskId: window.tagDumpTaskId,
        taskStatus: taskStatus(window.tagDumpTaskId ? tasks.get(window.tagDumpTaskId) : undefined),
        generatedCount: null,
        storageAccountedTagCount: null,
      })),
      lastObservationId: null,
    }]
  })
}

interface MutableWindowFact extends ExecutionWindowDisplayFact {}
interface MutablePartFact extends Omit<ExecutionPartDisplayFact, 'windows'> {
  windowByIndex: Map<number, MutableWindowFact>
}

function observedParts(observations: readonly TraceObservation[]): ExecutionPartDisplayFact[] {
  const parts = new Map<number, MutablePartFact>()
  for (const observation of observations) {
    const partIndex = observation.refs.partIndex
    if (partIndex === null || !Number.isSafeInteger(partIndex) || partIndex < 0) continue
    let part = parts.get(partIndex)
    if (!part) {
      part = {
        partIndex,
        attempt: observation.refs.attempt,
        status: 'observed',
        source: 'observation',
        plannedBlockCount: null,
        generatedBlockCount: null,
        storageAccountedTagCount: null,
        generateTaskId: null,
        generateTaskStatus: null,
        windowsRequested: null,
        windowByIndex: new Map(),
        lastObservationId: observation.observationId,
      }
      parts.set(partIndex, part)
    }
    part.attempt = observation.refs.attempt ?? part.attempt
    part.lastObservationId = observation.observationId
    if (
      observation.refs.taskId
      && (
        observation.eventType === 'TagPartGenerationStarted'
        || observation.eventType === 'TagWindowGenerated'
        || observation.eventType === 'TagPartCompleted'
      )
    ) {
      part.generateTaskId = observation.refs.taskId
    }

    if (observation.eventType === 'TagPartGenerationStarted') part.status = 'running'
    if (observation.eventType === 'TagPartCompleted') part.status = 'completed'

    const windowIndex = observation.refs.windowIndex
    if (windowIndex === null || !Number.isSafeInteger(windowIndex) || windowIndex < 0) continue
    let window = part.windowByIndex.get(windowIndex)
    if (!window) {
      window = {
        windowIndex,
        status: 'unknown',
        taskId: null,
        taskStatus: null,
        generatedCount: null,
        storageAccountedTagCount: null,
      }
      part.windowByIndex.set(windowIndex, window)
    }
    if (
      observation.refs.taskId
      && (
        observation.eventType === 'TagDumpDispatched'
        || observation.eventType === 'TagDumpAccounted'
        || observation.eventType === 'TagWindowFailed'
        || observation.eventType === 'TagWindowCancelled'
      )
    ) {
      window.taskId = observation.refs.taskId
    }
    if (observation.eventType === 'TagWindowGenerated') {
      window.status = 'generated'
      window.generatedCount = observation.metrics.generatedCount ?? null
    } else if (observation.eventType === 'TagDumpDispatched') {
      window.status = 'dispatchRecorded'
    } else if (observation.eventType === 'TagDumpAccounted') {
      window.status = 'accounted'
      const accounted = sumMetricValues(observation, ['persistedCount', 'duplicateCount', 'replacedCount'])
      window.storageAccountedTagCount = accounted
    } else if (observation.eventType === 'TagWindowFailed') {
      window.status = 'failed'
    } else if (observation.eventType === 'TagWindowCancelled') {
      window.status = 'cancelled'
    }
  }

  return [...parts.values()].map((part) => {
    const { windowByIndex, ...fact } = part
    return {
      ...fact,
      windowsRequested: windowByIndex.size > 0 ? true : null,
      windows: [...windowByIndex.values()].sort((left, right) => left.windowIndex - right.windowIndex),
    }
  })
}

function sumMetricValues(
  observation: TraceObservation,
  keys: readonly ('persistedCount' | 'duplicateCount' | 'replacedCount')[],
): TraceUint64 | null {
  let total = 0n
  for (const key of keys) {
    const value = countValue(observation.metrics[key])
    if (value === null) return null
    total += value
    if (total > UINT64_MAX) return null
  }
  return total.toString()
}

function latestMetricObservation(
  observations: readonly TraceObservation[],
  eventType: TraceObservation['eventType'],
): TraceObservation | null {
  let latest: TraceObservation | null = null
  for (const observation of observations) {
    if (observation.eventType !== eventType) continue
    if (!latest || compareObservations(latest, observation) < 0) latest = observation
  }
  return latest
}

function sumWindowMetric(
  observations: readonly TraceObservation[],
  eventType: 'TagWindowGenerated' | 'TagDumpAccounted',
  metricKeys: readonly TraceObservationMetricKey[],
): TraceUint64 | null {
  const latestByWindow = new Map<string, TraceObservation>()
  let unkeyedEvent = false
  for (const observation of observations) {
    if (observation.eventType !== eventType) continue
    const partIndex = observation.refs.partIndex
    const windowIndex = observation.refs.windowIndex
    if (
      partIndex === null || windowIndex === null
      || !Number.isSafeInteger(partIndex) || !Number.isSafeInteger(windowIndex)
      || partIndex < 0 || windowIndex < 0
    ) {
      unkeyedEvent = true
      continue
    }
    const key = `${partIndex}:${windowIndex}`
    const previous = latestByWindow.get(key)
    if (!previous || compareObservations(previous, observation) < 0) latestByWindow.set(key, observation)
  }
  if (unkeyedEvent || latestByWindow.size === 0) return null

  let total = 0n
  for (const observation of latestByWindow.values()) {
    let windowTotal = 0n
    for (const key of metricKeys) {
      const value = countValue(observation.metrics[key])
      if (value === null) return null
      windowTotal += value
    }
    total += windowTotal
    if (total > UINT64_MAX) return null
  }
  return total.toString()
}


function summaryProgress(summary: TraceSummary): TagGenerationProgressFact {
  const progress = summary.progress
  return progressFacts(
    progress.plannedPartCount,
    progress.completedPartCount,
    progress.plannedBlockCount,
    progress.generatedBlockCount,
    progress.storageAccountedTagCount,
    'summary',
  )
}

function observationProgress(observations: readonly TraceObservation[]): TagGenerationProgressFact {
  const final = latestMetricObservation(observations, 'TagGenerationFinalized')
  const plan = latestMetricObservation(observations, 'TagGenerationPlanCommitted')
  const plannedBlockCount = countString(final?.metrics.totalBlockCount ?? plan?.metrics.totalBlockCount)
  const plannedPartCount = countString(final?.metrics.plannedPartCount ?? plan?.metrics.plannedPartCount)
  const completedPartCount = final
    ? countString(final.metrics.completedPartCount)
    : completedPartCountFromFacts(observations)
  const generatedBlockCount = final
    ? countString(final.metrics.generatedCount)
    : sumWindowMetric(observations, 'TagWindowGenerated', ['generatedCount'])
  const storageAccountedTagCount = final
    ? sumMetricValues(final, ['persistedCount', 'duplicateCount', 'replacedCount'])
    : sumWindowMetric(observations, 'TagDumpAccounted', ['persistedCount', 'duplicateCount', 'replacedCount'])
  const hasAnyCount = plannedBlockCount !== null
    || generatedBlockCount !== null
    || storageAccountedTagCount !== null
  return progressFacts(
    plannedPartCount,
    completedPartCount,
    plannedBlockCount,
    generatedBlockCount,
    storageAccountedTagCount,
    hasAnyCount ? 'observations' : 'unknown',
  )
}

function completedPartCountFromFacts(observations: readonly TraceObservation[]): TraceUint64 | null {
  const indexes = new Set<number>()
  for (const observation of observations) {
    if (observation.eventType !== 'TagPartCompleted') continue
    const index = observation.refs.partIndex
    if (index === null || !Number.isSafeInteger(index) || index < 0) return null
    indexes.add(index)
  }
  return indexes.size > 0 ? String(indexes.size) : null
}

function countString(value: unknown): TraceUint64 | null {
  return countValue(value) === null ? null : value as TraceUint64
}

function progressFacts(
  plannedPartCount: TraceUint64 | null,
  completedPartCount: TraceUint64 | null,
  plannedBlockCount: TraceUint64 | null,
  generatedBlockCount: TraceUint64 | null,
  storageAccountedTagCount: TraceUint64 | null,
  source: TagGenerationProgressFact['source'],
): TagGenerationProgressFact {
  const generated = countValue(generatedBlockCount)
  const accounted = countValue(storageAccountedTagCount)
  const storageLagging = generated === null || accounted === null || accounted > generated
    ? null
    : accounted < generated
  return {
    plannedPartCount,
    completedPartCount,
    plannedBlockCount,
    generatedBlockCount,
    storageAccountedTagCount,
    calculationPercent: calculateProgressPercent(generatedBlockCount, plannedBlockCount),
    storagePercent: calculateProgressPercent(storageAccountedTagCount, plannedBlockCount),
    storageLagging,
    source,
  }
}


function isOpenProofGeneration(
  observation: TraceObservation,
  observations: readonly TraceObservation[],
): boolean {
  if (
    observation.eventType !== 'ProofGenerationStarted'
    || observation.source.quality !== 'observed'
    || !observation.refs.requestId
    || !observation.refs.challengeCorrelationId
  ) return false
  return !observations.some(other =>
    other.eventType === 'ProofGenerationCompleted'
    && other.source.quality === 'observed'
    && other.refs.requestId === observation.refs.requestId
    && other.refs.challengeCorrelationId === observation.refs.challengeCorrelationId
    && compareObservations(observation, other) < 0,
  )
}

function activeObservationStages(
  observations: readonly TraceObservation[],
): Map<string, TraceObservation[]> {
  const openParts = new Map<number, TraceObservation>()
  const openProofs = new Map<string, TraceObservation>()
  let openLayout: TraceObservation | null = null
  for (const observation of observations) {
    if (observation.source.quality !== 'observed') continue
    if (observation.eventType === 'TagLayoutPlanningStarted') openLayout = observation
    if (observation.eventType === 'TagLayoutPlanned') openLayout = null
    if (observation.eventType === 'TagPartGenerationStarted' && observation.refs.partIndex !== null) {
      openParts.set(observation.refs.partIndex, observation)
    }
    if (observation.eventType === 'TagPartCompleted' && observation.refs.partIndex !== null) {
      openParts.delete(observation.refs.partIndex)
    }
    if (observation.eventType === 'TagGenerationFinalized') openParts.clear()
    if (observation.eventType === 'ProofGenerationStarted') {
      if (isOpenProofGeneration(observation, observations)) {
        openProofs.set(`${observation.refs.requestId}:${observation.refs.challengeCorrelationId}`, observation)
      }
    }
    if (observation.eventType === 'ProofGenerationCompleted') {
      const key = `${observation.refs.requestId}:${observation.refs.challengeCorrelationId}`
      openProofs.delete(key)
    }
  }

  const active = new Map<string, TraceObservation[]>()
  const add = (stageId: string, observation: TraceObservation) => {
    const list = active.get(stageId) ?? []
    list.push(observation)
    active.set(stageId, list)
  }
  if (openLayout) add('layout', openLayout)
  for (const observation of openParts.values()) add('generation', observation)
  for (const observation of openProofs.values()) add('proofGeneration', observation)
  return active
}


function activeSnapshotStages(
  parts: readonly ExecutionPartDisplayFact[],
): Map<string, { source: 'part' | 'task'; partIndex: number; windowIndex: number | null }[]> {
  const active = new Map<string, { source: 'part' | 'task'; partIndex: number; windowIndex: number | null }[]>()
  const add = (stageId: string, source: 'part' | 'task', partIndex: number, windowIndex: number | null) => {
    const list = active.get(stageId) ?? []
    list.push({ source, partIndex, windowIndex })
    active.set(stageId, list)
  }
  for (const part of parts) {
    if (part.status === 'running') add('generation', 'part', part.partIndex, null)
    if (normalizedStatus(part.generateTaskStatus) === 'running') add('generation', 'task', part.partIndex, null)
    for (const window of part.windows) {
      // REST "generating" conflates locally generated windows with registered TagDump Tasks.
      // Only a durable TagDump task identity supports the Storage lane.
      if (window.taskId !== null && (window.status === 'generating' || window.status === 'dispatchRecorded')) {
        add('storage', 'part', part.partIndex, window.windowIndex)
      }
      if (normalizedStatus(window.taskStatus) === 'running') add('storage', 'task', part.partIndex, window.windowIndex)
    }
  }
  return active
}

function stageFacts(
  stages: readonly ExecutionStage[],
  active: Map<string, TraceObservation[]>,
  snapshotActive: Map<string, { source: 'part' | 'task'; partIndex: number; windowIndex: number | null }[]>,
  progress: TagGenerationProgressFact,
  partsCoverage: string | null | undefined,
  hasAlgorithmSelectionSnapshot: boolean,
): ExecutionStageDisplayFact[] {
  const partsComplete = compareActiveCounts(progress.plannedPartCount, progress.completedPartCount, partsCoverage)
  return stages.map((stage) => {
    const failureEvidence = stage.evidence.filter(row =>
      FAILURE_EVENTS[row.eventType] === true
      || (!!row.outcome && FAILURE_OUTCOMES[row.outcome] === true),
    )
    const failureObservation = latestEvidence(failureEvidence)
    const activeObservation = latestObservation(active.get(stage.id) ?? [])
    const activeSource = snapshotActive.get(stage.id)?.[0]
    const summarySelection = stage.id === 'algorithmSelection' && hasAlgorithmSelectionSnapshot
    const completedByEvidence = observationIsCompleted(stage.id, stage.evidence)
    const completedByParts = partsComplete
      && (stage.id === 'generation' || stage.id === 'storage')
    const status: ExecutionDisplayStatus = failureObservation
      ? 'failed'
      : activeObservation || activeSource
        ? 'active'
        : completedByEvidence || completedByParts
          ? 'completed'
          : summarySelection
            ? 'snapshot'
            : stage.status === 'observed'
              ? 'observed'
              : 'unknown'
    const evidence = latestEvidence(stage.evidence)
    const source: ExecutionDisplaySource = failureObservation || activeObservation || evidence
      ? 'observation'
      : activeSource?.source ?? (completedByParts || summarySelection ? 'summary' : null)
    return {
      stageId: stage.id,
      status,
      source,
      evidenceCount: stage.evidence.length,
      lastObservationId: evidence?.observationId ?? null,
      failureObservationId: failureObservation?.observationId ?? null,
    }
  })
}

function latestEvidence<T extends { recordedAtMs: number; observationId: string }>(rows: readonly T[]): T | null {
  let latest: T | null = null
  for (const row of rows) {
    if (!latest || row.recordedAtMs > latest.recordedAtMs
      || (row.recordedAtMs === latest.recordedAtMs && row.observationId > latest.observationId)) {
      latest = row
    }
  }
  return latest
}

function chooseFocus(
  observations: readonly TraceObservation[],
  stages: readonly ExecutionStage[],
  activeObservationStageMap: Map<string, TraceObservation[]>,
  snapshotActive: Map<string, { source: 'part' | 'task'; partIndex: number; windowIndex: number | null }[]>,
  hasAlgorithmSelectionSnapshot: boolean,
): ExecutionDisplayFocus {
  const stageByObservationId = new Map<string, string>()
  for (const stage of stages) {
    for (const row of stage.evidence) stageByObservationId.set(row.observationId, stage.id)
  }
  const failures = observations.filter(isFailureObservation)
  const failure = latestEvidence(failures)
  if (failure) {
    return {
      stageId: stageByObservationId.get(failure.observationId) ?? null,
      observationId: failure.observationId,
      partIndex: failure.refs.partIndex,
      windowIndex: failure.refs.windowIndex,
      source: 'failure',
    }
  }

  const activeStageIds = new Set([...activeObservationStageMap.keys(), ...snapshotActive.keys()])
  const activeObservations = observations.filter(observation => {
    const stageId = stageByObservationId.get(observation.observationId)
    return stageId !== undefined && activeStageIds.has(stageId)
  })
  const latestActive = latestEvidence(activeObservations)
  if (latestActive) {
    return {
      stageId: stageByObservationId.get(latestActive.observationId) ?? null,
      observationId: latestActive.observationId,
      partIndex: latestActive.refs.partIndex,
      windowIndex: latestActive.refs.windowIndex,
      source: 'observation',
    }
  }

  if (activeStageIds.size === 1) {
    const stageId = [...activeStageIds][0]
    const snapshotSource = snapshotActive.get(stageId)?.[0]
    return {
      stageId,
      observationId: null,
      partIndex: snapshotSource?.partIndex ?? null,
      windowIndex: snapshotSource?.windowIndex ?? null,
      source: snapshotSource?.source ?? 'none',
    }
  }

  if (activeStageIds.size > 1) {
    // Concurrent snapshot work has no reliable event chronology; keep all active
    // facts and choose the earliest active stage only as a stable visual focus.
    const activeStage = stages.find(stage => snapshotActive.has(stage.id))
      ?? stages.find(stage => activeStageIds.has(stage.id))
    const snapshotSource = activeStage ? snapshotActive.get(activeStage.id)?.[0] : undefined
    return {
      stageId: activeStage?.id ?? null,
      observationId: null,
      partIndex: snapshotSource?.partIndex ?? null,
      windowIndex: snapshotSource?.windowIndex ?? null,
      source: snapshotSource?.source ?? 'none',
    }
  }

  const latest = latestEvidence(observations.filter(observation =>
    stageByObservationId.has(observation.observationId),
  ))
  if (latest) {
    return {
      stageId: stageByObservationId.get(latest.observationId) ?? null,
      observationId: latest.observationId,
      partIndex: latest.refs.partIndex,
      windowIndex: latest.refs.windowIndex,
      source: 'observation',
    }
  }
  if (hasAlgorithmSelectionSnapshot && stages.some(stage => stage.id === 'algorithmSelection')) {
    return {
      stageId: 'algorithmSelection',
      observationId: null,
      partIndex: null,
      windowIndex: null,
      source: 'summary',
    }
  }
  return { stageId: null, observationId: null, partIndex: null, windowIndex: null, source: 'none' }
}

function hasObservedStorageSelection(observations: readonly TraceObservation[], activeJobId: string): boolean {
  return observations.some(observation =>
    observation.jobId === activeJobId
    && (observation.eventType === 'TagGenerationPlanCommitted'
      || observation.eventType === 'TagGenerationFinalized')
    && observation.source.component === 'Admin'
    && observation.source.quality === 'observed',
  )
}

function selectedStorageNodeId(
  input: ExecutionDisplayInput,
  observations: readonly TraceObservation[],
  isReplay: boolean,
): string | null {
  if (input.kind !== 'tagGeneration') return null
  if (isReplay && !hasObservedStorageSelection(observations, input.activeJobId)) return null

  const candidates = new Set<string>()
  const add = (value: string | null | undefined) => {
    if (typeof value === 'string' && value.trim() !== '') candidates.add(value.trim())
  }
  add(input.storageNodeId)
  if (input.summary?.jobId === input.activeJobId) add(input.summary.references.storageNodeId)
  for (const observation of observations) {
    if (
      observation.jobId === input.activeJobId
      && (observation.eventType === 'TagGenerationPlanCommitted'
        || observation.eventType === 'TagGenerationFinalized')
      && observation.source.component === 'Admin'
      && observation.source.quality === 'observed'
    ) {
      add(observation.source.nodeId)
    }
  }
  return candidates.size === 1 ? candidates.values().next().value ?? null : null
}

export function projectExecutionDisplay(input: ExecutionDisplayInput): ExecutionDisplayProjection {
  const isReplay = input.mode === 'replay'
  const observations = input.observations.filter(observation => observation.jobId === input.activeJobId).slice().sort(compareObservations)
  const summary = !isReplay && input.summary?.jobId === input.activeJobId ? input.summary : null
  const hasAlgorithmSelectionSnapshot = typeof summary?.algorithmSelection?.algorithmId === 'string'
    && summary.algorithmSelection.algorithmId.trim() !== ''
  const tasks = isReplay ? [] : input.tasks.filter(task => task.jobId === input.activeJobId)
  const taskById = taskIndex(tasks, input.activeJobId)
  const parts = isReplay ? [] : input.parts.filter(part => part.jobId === input.activeJobId)
  const partFacts = isReplay ? observedParts(observations) : snapshotParts(parts, taskById, input.activeJobId)
  const progress = summary
    ? summaryProgress(summary)
    : observationProgress(observations)
  const openStages = activeObservationStages(observations)
  const snapshotStages = activeSnapshotStages(partFacts)
  const stages = stageFacts(
    input.stages,
    openStages,
    snapshotStages,
    progress,
    summary?.coverage.parts,
    hasAlgorithmSelectionSnapshot,
  )

  return {
    facts: {
      stages,
      parts: partFacts,
      progress,
      storageNodeId: selectedStorageNodeId(input, observations, isReplay),
      isReplay,
      finalSnapshotAvailable: isReplay && (
        input.summary?.jobId === input.activeJobId
        || input.parts.some(part => part.jobId === input.activeJobId)
        || input.tasks.some(task => task.jobId === input.activeJobId)
      ),
    },
    focus: chooseFocus(observations, input.stages, openStages, snapshotStages, hasAlgorithmSelectionSnapshot),
    cues: createMotionCues(observations, input.stages, input.communication),
  }
}
