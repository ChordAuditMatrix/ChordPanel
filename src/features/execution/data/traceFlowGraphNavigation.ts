import type { TraceFlowGraphJobEdge, TraceFlowGraphJobNode } from '@/api/trace'

/**
 * Parent/child navigation of the flow Job graph.
 *
 * Two different facts are kept apart on purpose:
 * - `parentJobId` is a persisted field of the child Job. It names the parent and
 *   stays usable for navigation even when the parent is not on a loaded page.
 * - a `parentEdges` row is the relation the backend returned for this page pair.
 *   Only such a row is drawn by the canvas.
 *
 * Navigation lists children from the persisted field of loaded child Jobs and
 * marks which of them also carry a returned relation. A child outside the loaded
 * pages cannot be enumerated: the route publishes no total, so the UI must say
 * the set is bounded by the pages read, never that no other child exists.
 */

export interface TraceFlowGraphNodeNavigation {
  readonly jobId: string
  readonly parentJobId: string | null
  /** The named parent is one of the loaded Job nodes. */
  readonly parentLoaded: boolean
  /** A returned parent relation names this Job as its target. */
  readonly parentRelationProven: boolean
  /** Loaded Jobs whose persisted field names this Job as their parent. */
  readonly childJobIds: readonly string[]
  /** Children that also carry a returned parent relation on the loaded pages. */
  readonly childRelationJobIds: readonly string[]
  /** Children listed from the persisted field only; no line is drawn for them. */
  readonly childFieldOnlyJobIds: readonly string[]
}

export interface TraceFlowGraphNavigation {
  readonly nodes: readonly TraceFlowGraphNodeNavigation[]
  /** Jobs of this page set that name a parent outside the loaded pages. */
  readonly parentOutsideLoadedCount: number
}

/**
 * Builds navigation for the accumulated page set. `parentEdges` is indexed by
 * its `from`/`to` references exactly as the backend returned them; an edge naming
 * an unloaded Job adds no navigation beyond what the persisted field states.
 */
export function buildTraceFlowGraphNavigation(
  jobNodes: readonly TraceFlowGraphJobNode[],
  parentEdges: readonly TraceFlowGraphJobEdge[],
): TraceFlowGraphNavigation {
  const jobIdByRef = new Map<string, string>()
  for (const node of jobNodes) {
    jobIdByRef.set(node.nodeId, node.jobId)
    jobIdByRef.set(`job:${node.jobId}`, node.jobId)
  }
  const loaded = new Set(jobNodes.map(node => node.jobId))
  const resolvedEdges: { from: string; to: string }[] = []
  for (const edge of parentEdges) {
    const from = jobIdByRef.get(edge.from.ref)
    const to = jobIdByRef.get(edge.to.ref)
    if (!from || !to || from === to) continue
    resolvedEdges.push({ from, to })
  }

  const children = new Map<string, string[]>()
  const edgeChildren = new Map<string, string[]>()
  for (const node of jobNodes) {
    children.set(node.jobId, [])
    edgeChildren.set(node.jobId, [])
  }
  for (const node of jobNodes) {
    if (node.parentJobId === null || !loaded.has(node.parentJobId)) continue
    children.get(node.parentJobId)?.push(node.jobId)
  }
  for (const edge of resolvedEdges) {
    edgeChildren.get(edge.from)?.push(edge.to)
  }

  const nodes: TraceFlowGraphNodeNavigation[] = jobNodes.map((node) => {
    const childJobIds = children.get(node.jobId) ?? []
    const childRelationJobIds = edgeChildren.get(node.jobId) ?? []
    const proven = new Set(childRelationJobIds)
    return {
      jobId: node.jobId,
      parentJobId: node.parentJobId,
      parentLoaded: node.parentJobId !== null && loaded.has(node.parentJobId),
      parentRelationProven: resolvedEdges.some(edge => edge.to === node.jobId),
      childJobIds,
      childRelationJobIds,
      childFieldOnlyJobIds: childJobIds.filter(childId => !proven.has(childId)),
    }
  })

  return {
    nodes,
    parentOutsideLoadedCount: nodes.filter(node =>
      node.parentJobId !== null && !node.parentLoaded).length,
  }
}

/** One Job's navigation facts, or `null` when the Job is not on a loaded page. */
export function findTraceFlowGraphNodeNavigation(
  navigation: TraceFlowGraphNavigation,
  jobId: string,
): TraceFlowGraphNodeNavigation | null {
  return navigation.nodes.find(node => node.jobId === jobId) ?? null
}
