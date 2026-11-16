import type { TraceFlowGraphJobEdge, TraceFlowGraphJobNode } from '@/api/trace'
import { graphCanvasEdgePath } from './graphCanvasGeometry'

/**
 * Layered layout of one accumulated flow page set.
 *
 * Parent edges come only from the backend's `parentEdges` rows: a `parentJobId`
 * whose parent is on another page produces no edge, even when both Jobs are now
 * loaded, because the backend never stated that relation for this page pair.
 */

export const FLOW_CANVAS_NODE_WIDTH = 208
export const FLOW_CANVAS_NODE_HEIGHT = 72

const COLUMN_GAP = 44
const ROW_GAP = 26
const PADDING = 16

export interface TraceFlowGraphCanvasNode {
  readonly jobId: string
  readonly node: TraceFlowGraphJobNode
  readonly depth: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** `parentJobId` names no Job of the loaded pages. */
  readonly parentOutsideLoadedPages: boolean
  /**
   * Both Jobs are loaded, but this page pair never returned a parent edge.
   * The node stays a root; no cross-page relation is synthesized.
   */
  readonly parentLoadedWithoutPageEdge: boolean
}

export interface TraceFlowGraphCanvasEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly fromRef: TraceFlowGraphJobEdge['from']
  readonly toRef: TraceFlowGraphJobEdge['to']
  readonly path: string
}

export interface TraceFlowGraphCanvasLayout {
  readonly nodes: readonly TraceFlowGraphCanvasNode[]
  readonly edges: readonly TraceFlowGraphCanvasEdge[]
  readonly width: number
  readonly height: number
  readonly depthCount: number
  readonly parentOutsideLoadedCount: number
  readonly parentLoadedWithoutPageEdgeCount: number
  /** Backend edges whose endpoints are not both loaded; never drawn. */
  readonly skippedEdgeCount: number
}

export function layoutTraceFlowGraphCanvas(
  jobNodes: readonly TraceFlowGraphJobNode[],
  parentEdges: readonly TraceFlowGraphJobEdge[],
): TraceFlowGraphCanvasLayout {
  const byJobId = new Map<string, TraceFlowGraphJobNode>()
  for (const node of jobNodes) byJobId.set(node.jobId, node)

  const jobIdByNodeId = new Map<string, string>()
  for (const node of jobNodes) {
    jobIdByNodeId.set(node.nodeId, node.jobId)
    jobIdByNodeId.set(`job:${node.jobId}`, node.jobId)
  }

  interface ResolvedEdge {
    edge: TraceFlowGraphJobEdge
    from: string
    to: string
  }
  const edges: ResolvedEdge[] = []
  let skippedEdgeCount = 0
  for (const edge of parentEdges) {
    const from = jobIdByNodeId.get(edge.from.ref)
    const to = jobIdByNodeId.get(edge.to.ref)
    if (!from || !to || from === to) {
      skippedEdgeCount += 1
      continue
    }
    edges.push({ edge, from, to })
  }

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, number>()
  const parents = new Map<string, Set<string>>()
  for (const node of jobNodes) {
    outgoing.set(node.jobId, [])
    incoming.set(node.jobId, 0)
    parents.set(node.jobId, new Set())
  }
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to)
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    parents.get(edge.to)?.add(edge.from)
  }

  const depth = new Map<string, number>()
  const queue: string[] = []
  for (const node of jobNodes) {
    if ((incoming.get(node.jobId) ?? 0) === 0) {
      depth.set(node.jobId, 0)
      queue.push(node.jobId)
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const jobId = queue[index]
    const currentDepth = depth.get(jobId) ?? 0
    for (const child of outgoing.get(jobId) ?? []) {
      depth.set(child, Math.max(depth.get(child) ?? 0, currentDepth + 1))
      const remaining = (incoming.get(child) ?? 0) - 1
      incoming.set(child, remaining)
      if (remaining === 0) queue.push(child)
    }
  }
  // Parent cycles are not a documented relation, but a malformed page must not
  // make the layout drop nodes: they stay visible in the first column.
  for (const node of jobNodes) {
    if (!depth.has(node.jobId)) depth.set(node.jobId, 0)
  }

  const maxDepth = Math.max(0, ...depth.values())
  const columns: TraceFlowGraphJobNode[][] = Array.from({ length: maxDepth + 1 }, () => [])
  const inputIndex = new Map<string, number>()
  jobNodes.forEach((node, index) => {
    inputIndex.set(node.jobId, index)
    columns[depth.get(node.jobId) ?? 0].push(node)
  })

  const rowOf = new Map<string, number>()
  const placed = new Map<string, TraceFlowGraphCanvasNode>()
  const ordered: TraceFlowGraphCanvasNode[] = []
  columns.forEach((column, columnDepth) => {
    column.sort((left, right) => {
      const leftParents = parents.get(left.jobId) ?? new Set<string>()
      const rightParents = parents.get(right.jobId) ?? new Set<string>()
      const leftRow = leftParents.size
        ? Math.min(...[...leftParents].map(parent => rowOf.get(parent) ?? Number.MAX_SAFE_INTEGER))
        : Number.MAX_SAFE_INTEGER
      const rightRow = rightParents.size
        ? Math.min(...[...rightParents].map(parent => rowOf.get(parent) ?? Number.MAX_SAFE_INTEGER))
        : Number.MAX_SAFE_INTEGER
      if (leftRow !== rightRow) return leftRow < rightRow ? -1 : 1
      return (inputIndex.get(left.jobId) ?? 0) - (inputIndex.get(right.jobId) ?? 0)
    })
    column.forEach((node, row) => {
      rowOf.set(node.jobId, row)
      const nodeHasParent = node.parentJobId !== null
      const parentLoaded = node.parentJobId !== null && byJobId.has(node.parentJobId)
      const hasPageEdge = edges.some(edge => edge.to === node.jobId)
      const canvasNode: TraceFlowGraphCanvasNode = {
        jobId: node.jobId,
        node,
        depth: columnDepth,
        x: PADDING + columnDepth * (FLOW_CANVAS_NODE_WIDTH + COLUMN_GAP),
        y: PADDING + row * (FLOW_CANVAS_NODE_HEIGHT + ROW_GAP),
        width: FLOW_CANVAS_NODE_WIDTH,
        height: FLOW_CANVAS_NODE_HEIGHT,
        parentOutsideLoadedPages: nodeHasParent && !parentLoaded,
        parentLoadedWithoutPageEdge: parentLoaded && !hasPageEdge,
      }
      placed.set(node.jobId, canvasNode)
      ordered.push(canvasNode)
    })
  })

  const canvasEdges: TraceFlowGraphCanvasEdge[] = []
  for (const resolved of edges) {
    const from = placed.get(resolved.from)
    const to = placed.get(resolved.to)
    if (!from || !to) {
      skippedEdgeCount += 1
      continue
    }
    canvasEdges.push({
      id: `flowEdge:${resolved.from}>${resolved.to}`,
      from: resolved.from,
      to: resolved.to,
      fromRef: resolved.edge.from,
      toRef: resolved.edge.to,
      path: graphCanvasEdgePath(from, to).path,
    })
  }

  const maxRows = Math.max(0, ...columns.map(column => column.length))
  const width = maxRows === 0
    ? 0
    : PADDING * 2 + (maxDepth + 1) * FLOW_CANVAS_NODE_WIDTH + maxDepth * COLUMN_GAP
  const height = maxRows === 0
    ? 0
    : PADDING * 2 + maxRows * FLOW_CANVAS_NODE_HEIGHT + (maxRows - 1) * ROW_GAP

  return {
    nodes: ordered,
    edges: canvasEdges,
    width,
    height,
    depthCount: maxDepth + 1,
    parentOutsideLoadedCount: ordered.filter(node => node.parentOutsideLoadedPages).length,
    parentLoadedWithoutPageEdgeCount:
      ordered.filter(node => node.parentLoadedWithoutPageEdge).length,
    skippedEdgeCount,
  }
}
