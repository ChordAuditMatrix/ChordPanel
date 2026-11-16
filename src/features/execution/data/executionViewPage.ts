import type {
  TraceAlgorithmSelection,
  TraceExecutionKind,
  TraceObservation,
  TraceObservationMetricKey,
  TraceSourceComponent,
  TraceSummary,
  TraceSummaryProgress,
} from '@/api/trace'
import type { ExecutionCommunicationProjection } from '@/features/execution/data/executionCommunication'
import { projectExecutionMetricSummary } from '@/features/execution/data/executionDisplayProjection'
import type {
  ExecutionStage,
  ExecutionStageEvidence,
} from '@/features/execution/data/executionStages'

/**
 * Pure page-level projections for the execution view.
 *
 * Algorithm identity comes from the newest visible exact observation first,
 * never from an older summary snapshot when replay has already shown a newer
 * selection. Stage metrics keep the latest fact per key in observation order
 * and interpret business meanings through the shared display projection.
 */

interface RecordedFact {
  recordedAtMs: number
  observationId: string
}

function laterFact<T extends RecordedFact>(current: T | null, candidate: T): T {
  if (!current) return candidate
  if (candidate.recordedAtMs > current.recordedAtMs) return candidate
  if (
    candidate.recordedAtMs === current.recordedAtMs
    && candidate.observationId > current.observationId
  ) return candidate
  return current
}

/** Newest `AlgorithmSelectionResolved` fact in the visible replay prefix. */
export function latestAlgorithmSelectionObservation(
  observations: readonly TraceObservation[],
): TraceObservation | null {
  let latest: TraceObservation | null = null
  for (const observation of observations) {
    if (observation.eventType !== 'AlgorithmSelectionResolved') continue
    latest = laterFact(latest, observation)
  }
  return latest
}

/** Newest identity worker algorithm fact; ties abstain to the later observation id. */
export function latestIdentityAlgorithmEvidence(
  stages: readonly ExecutionStage[],
): ExecutionStageEvidence | null {
  let latest: ExecutionStageEvidence | null = null
  for (const stage of stages) {
    if (stage.id !== 'algorithmResolved' && stage.id !== 'signaturesAggregated') continue
    for (const evidence of stage.evidence) latest = laterFact(latest, evidence)
  }
  return latest
}

function identityAlgorithmId(evidence: ExecutionStageEvidence | null): string | null {
  const algorithmId = evidence?.refs.algorithmId
  return typeof algorithmId === 'string' && algorithmId.trim() !== ''
    ? algorithmId.trim()
    : null
}

/**
 * Merge the observed identity algorithm fact with a matching summary snapshot.
 * The observed fact owns id/type; the snapshot may fill name and versions.
 */
export function projectIdentityAlgorithmSelection(
  evidence: ExecutionStageEvidence | null,
  summarySelection: TraceAlgorithmSelection | null,
): TraceAlgorithmSelection | null {
  const algorithmId = identityAlgorithmId(evidence)
  if (!evidence || !algorithmId) return null
  const matchingSummary = summarySelection?.algorithmId === algorithmId ? summarySelection : null
  return {
    mode: matchingSummary?.mode ?? null,
    algorithmId,
    algorithmName: matchingSummary?.algorithmName ?? null,
    algorithmType: evidence.refs.algorithmType ?? matchingSummary?.algorithmType ?? null,
    purpose: 'Identity',
    profileVersion: matchingSummary?.profileVersion ?? null,
    strategyVersion: matchingSummary?.strategyVersion ?? null,
    strategyKind: matchingSummary?.strategyKind ?? null,
    capabilitiesMask: null,
    capabilities: null,
    stateMaintenanceParty: null,
    selectedAtMs: matchingSummary?.selectedAtMs ?? null,
  }
}

export interface AlgorithmSelectionPageInput {
  isHistoricalReplay: boolean
  summary: Pick<TraceSummary, 'executionKind' | 'algorithmSelection' | 'references'> | null
  observations: readonly TraceObservation[]
  stages: readonly ExecutionStage[]
}

export interface AlgorithmSelectionPageProjection {
  /** Newest exact selection observation; its presence suppresses the snapshot in replay. */
  observationEvidence: TraceObservation | null
  identityEvidence: ExecutionStageEvidence | null
  snapshotSelection: TraceAlgorithmSelection | null
  identitySelection: TraceAlgorithmSelection | null
  displayedSelection: TraceAlgorithmSelection | null
  displayedAlgorithmId: string | null
}

export function projectAlgorithmSelectionPage(
  input: AlgorithmSelectionPageInput,
): AlgorithmSelectionPageProjection {
  const observationEvidence = latestAlgorithmSelectionObservation(input.observations)
  const snapshotSelection = input.isHistoricalReplay && observationEvidence === null
    ? null
    : input.summary?.algorithmSelection ?? null
  const identityEvidence = input.summary?.executionKind === 'identityVerification'
    ? latestIdentityAlgorithmEvidence(input.stages)
    : null
  const identitySelection = projectIdentityAlgorithmSelection(identityEvidence, snapshotSelection)
  const summaryAlgorithmId = input.isHistoricalReplay
    ? null
    : input.summary?.references.algorithmId ?? null
  const selectionId = snapshotSelection?.algorithmId
    ?? observationEvidence?.refs.algorithmId
    ?? summaryAlgorithmId
    ?? null

  return {
    observationEvidence,
    identityEvidence,
    snapshotSelection,
    identitySelection,
    displayedSelection: identitySelection ?? snapshotSelection,
    displayedAlgorithmId: identitySelection?.algorithmId ?? selectionId,
  }
}

export interface StageMetricFact {
  key: string
  /** Exact count string for business metrics; `null` for root-hash presence. */
  value: string | null
  rootHashPresent: boolean | null
  recordedAtMs: number
  eventType: TraceObservation['eventType']
  sourceComponent: TraceSourceComponent | null
  sourceNodeId: string | null
  partIndex: number | null
  windowIndex: number | null
}

/**
 * Keep the latest instance of each metric in observation order, then order the
 * visible rows by recording time. `verifiedCount` stays out of this list: it is
 * rendered as the verification verdict, not as a business metric row.
 */
export function projectStageMetricFacts(
  kind: TraceExecutionKind | null,
  observations: readonly TraceObservation[],
): StageMetricFact[] {
  const latestByKey = new Map<string, StageMetricFact>()
  for (const observation of observations) {
    for (const [key, value] of Object.entries(observation.metrics)) {
      if (typeof value !== 'string' || value === '') continue
      const metric = projectExecutionMetricSummary(
        kind,
        observation.eventType,
        key as TraceObservationMetricKey,
        value,
      )
      if (!metric || metric.kind === 'verifiedCount') continue
      latestByKey.set(key, {
        key,
        value: metric.kind === 'rootHashPresence' ? null : metric.value,
        rootHashPresent: metric.kind === 'rootHashPresence' ? metric.present : null,
        recordedAtMs: observation.recordedAtMs,
        eventType: observation.eventType,
        sourceComponent: observation.source.component,
        sourceNodeId: observation.source.nodeId,
        partIndex: observation.refs.partIndex,
        windowIndex: observation.refs.windowIndex,
      })
    }
  }
  return [...latestByKey.values()].sort((left, right) =>
    right.recordedAtMs - left.recordedAtMs || left.key.localeCompare(right.key),
  )
}

export function hasTagSnapshotProgress(
  progress: Partial<TraceSummaryProgress> | null | undefined,
): boolean {
  if (!progress) return false
  return [
    progress.plannedPartCount,
    progress.completedPartCount,
    progress.plannedBlockCount,
    progress.generatedBlockCount,
    progress.storageAccountedTagCount,
    progress.persistedCount,
    progress.duplicateCount,
    progress.replacedCount,
  ].some(value => value !== null && value !== undefined)
}

export type StageDataEmptyState =
  | 'algorithmSelectionSummary'
  | 'metricsUnavailable'
  | 'metricsInEvidence'
  | 'noMetrics'
  | 'noEvidence'

export interface StageDataEmptyStateInput {
  kind: TraceExecutionKind | null
  stageId: string | null
  observationCount: number
  hasMetricValues: boolean
  hasAlgorithmSelectionSnapshot: boolean
  partCount: number
  hasTagSnapshotProgress: boolean
}

/** Explain missing stage metrics without inventing a measurement. */
export function resolveStageDataEmptyState(
  input: StageDataEmptyStateInput,
): StageDataEmptyState {
  if (input.stageId === 'algorithmSelection' && input.hasAlgorithmSelectionSnapshot) {
    return 'algorithmSelectionSummary'
  }
  if (
    input.kind === 'tagGeneration'
    && (input.stageId === 'generation' || input.stageId === 'storage')
    && input.observationCount === 0
    && (input.partCount > 0 || input.hasTagSnapshotProgress)
  ) {
    return 'metricsUnavailable'
  }
  if (input.hasMetricValues) return 'metricsInEvidence'
  return input.observationCount ? 'noMetrics' : 'noEvidence'
}

export interface TopologyRoleNodeIdsInput {
  confirmedPackets: ExecutionCommunicationProjection['confirmedPackets']
  peerCorrelations: ExecutionCommunicationProjection['peerCorrelations']
  auditNodeId?: string | null
  storageNodeId?: string | null
}

/**
 * Job metadata fills each role first; a confirmed dispatch supplies Admin, and
 * a peer relationship supplies only the roles metadata left empty.
 */
export function projectTopologyRoleNodeIds(
  input: TopologyRoleNodeIdsInput,
): Partial<Record<TraceSourceComponent, string | null>> {
  const peer = input.peerCorrelations[0]
  const packet = input.confirmedPackets[0]
  return {
    Admin: packet?.fromNodeId ?? null,
    Audit: input.auditNodeId ?? peer?.originNodeId ?? null,
    Storage: input.storageNodeId ?? peer?.nodeId ?? null,
  }
}
