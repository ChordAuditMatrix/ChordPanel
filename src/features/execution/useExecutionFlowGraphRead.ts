import { ref, type ComputedRef } from 'vue'
import type {
  TraceFlowGraphReadOutcome,
  TraceFlowGraphState,
} from '@/features/execution/data/traceFlowGraphModel'

export interface ExecutionFlowGraphReadInput {
  /** Flow identity the panel currently renders; `null` when no flow is known. */
  flowId: ComputedRef<string | null>
  /** The flow slice the panel reads; its identity is the last applied flow. */
  graph: TraceFlowGraphState
}

/**
 * Read timestamps of one flow panel.
 *
 * A request advances them only when it applied a page for the flow that is
 * still current: a failed load, a flow with no next page and a request the next
 * flow superseded all settle without fresh facts, so reporting them as a read
 * would claim a moment this panel never saw. The first stamped read is the
 * load; a later one is the refresh.
 */
export function useExecutionFlowGraphRead(input: ExecutionFlowGraphReadInput) {
  const loadedAtMs = ref<number | null>(null)
  const refreshedAtMs = ref<number | null>(null)
  /** The flow the current stamps describe; `null` before any stamp. */
  let stampedFlowId: string | null = null

  function applyRead(requestedFlowId: string, outcome: TraceFlowGraphReadOutcome): void {
    if (outcome.kind !== 'read') return
    if (input.flowId.value !== requestedFlowId) return
    if (input.graph.flowId !== requestedFlowId) return
    if (stampedFlowId !== requestedFlowId) {
      stampedFlowId = requestedFlowId
      loadedAtMs.value = null
      refreshedAtMs.value = null
    }
    if (loadedAtMs.value === null) loadedAtMs.value = Date.now()
    else refreshedAtMs.value = Date.now()
  }

  /** A flow change drops the stamps; the next read is the new flow's load. */
  function resetRead(): void {
    stampedFlowId = null
    loadedAtMs.value = null
    refreshedAtMs.value = null
  }

  return { loadedAtMs, refreshedAtMs, applyRead, resetRead }
}
