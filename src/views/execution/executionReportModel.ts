import type { TraceObservation, TraceSummary } from '@/api/trace'

export function reportAlgorithmEvidence(
  summary: TraceSummary | null,
  observations: readonly TraceObservation[],
) {
  const selection = summary?.algorithmSelection ?? null
  if (!summary || !selection) return { selection: null, observation: null }

  const observation = observations.find(item =>
    item.jobId === summary.jobId
    && item.eventType === 'AlgorithmSelectionResolved'
    && item.refs.algorithmId === selection.algorithmId,
  ) ?? null

  return { selection, observation }
}
