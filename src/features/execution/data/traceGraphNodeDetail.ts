import type {
  TraceCoverageState,
  TraceGraphProvenance,
  TraceLinkConfidence,
} from '@/api/trace'
import type {
  TraceGraphCanvasEdgeBasis,
  TraceGraphCanvasEdgeEvidence,
  TraceGraphCanvasEdgeFamily,
  TraceGraphCanvasFoldedEdge,
  TraceGraphCanvasLayout,
  TraceGraphCanvasNode,
  TraceGraphCanvasNodeKind,
  TraceGraphCanvasNodeResolution,
  TraceGraphCanvasUnresolvedEdge,
} from './traceGraphCanvasLayout'
import type { TraceGraphProjectedNode } from './traceGraphProjection'

/**
 * Read-only description of one selected canvas node.
 *
 * The description answers exactly four questions the reader can act on: which
 * backend evidence states this node (source), what that evidence says about its
 * state, which drawn relations name it, and which existing evidence list holds
 * the same row. A relation is never upgraded: a Part's task field stays a
 * reference, and a relation the reader folded stays folded rather than becoming
 * unresolved.
 */

/** Existing evidence surfaces a node row can be located in. */
export type TraceGraphEvidenceTarget = 'task' | 'part' | 'activity'

export interface TraceGraphNodeRelation {
  readonly edgeId: string
  readonly direction: 'incoming' | 'outgoing'
  readonly family: TraceGraphCanvasEdgeFamily
  readonly evidence: TraceGraphCanvasEdgeEvidence
  readonly basis: TraceGraphCanvasEdgeBasis
  readonly persistedLink: boolean
  readonly otherNodeId: string
  readonly otherKind: TraceGraphCanvasNodeKind
  readonly otherIdentity: string | null
  readonly otherResolution: TraceGraphCanvasNodeResolution
  readonly linkKey: string | null
  readonly pageKey: string | null
  readonly confidence: TraceLinkConfidence | null
  readonly coverage: TraceCoverageState | null
}

export interface TraceGraphNodeDetail {
  readonly node: TraceGraphCanvasNode
  readonly identity: string | null
  readonly relations: readonly TraceGraphNodeRelation[]
  readonly incomingCount: number
  readonly outgoingCount: number
  /** Relations naming this node's reference that the drawing could not resolve. */
  readonly unresolvedRelations: readonly TraceGraphCanvasUnresolvedEdge[]
  /** Relations that name this node and were folded away by its own group. */
  readonly foldedRelations: readonly TraceGraphCanvasFoldedEdge[]
  /** Provenance field of the last response that states this node's state. */
  readonly provenanceField: string | null
  readonly provenanceValue: string | null
  readonly evidenceTarget: TraceGraphEvidenceTarget | null
  /** Stable row key of the existing evidence list; `null` without a target. */
  readonly evidenceKey: string | null
}

const EVIDENCE_TARGET: Partial<Record<TraceGraphCanvasNodeKind, TraceGraphEvidenceTarget>> = {
  task: 'task',
  part: 'part',
  activity: 'activity',
}

const PROVENANCE_FIELD: Partial<Record<TraceGraphCanvasNodeKind, string>> = {
  job: 'jobStatus',
  task: 'taskStatus',
  part: 'parts',
  activity: 'activities',
}

/**
 * Row key of the matching evidence list. Task rows are keyed by their reference
 * index, Part rows by their node identity, Activity rows by page and activity
 * identity, so two pages stating the same activity never collapse into one row.
 */
export function traceGraphEvidenceKey(node: TraceGraphProjectedNode): string | null {
  switch (node.kind) {
    case 'task':
      return `task:${node.task.referenceIndex}`
    case 'part':
      return `part:${node.part.nodeId}`
    case 'activity':
      return `activity:${node.pageKey}:${node.activity.nodeId}`
    case 'job':
      return null
  }
}

/** The evidence row a canvas node can jump to; endpoint-only nodes have none. */
export function traceGraphNodeEvidenceKey(
  node: TraceGraphCanvasNode,
): { target: TraceGraphEvidenceTarget; key: string } | null {
  const projected = node.projected
  if (!projected) return null
  const target = EVIDENCE_TARGET[node.kind]
  const key = traceGraphEvidenceKey(projected)
  if (!target || !key) return null
  return { target, key }
}

export function describeTraceGraphNode(
  layout: TraceGraphCanvasLayout,
  nodeId: string,
  provenance: TraceGraphProvenance | null = null,
): TraceGraphNodeDetail | null {
  const node = layout.nodes.find(candidate => candidate.id === nodeId)
  if (!node) return null

  const nodeById = new Map(layout.nodes.map(candidate => [candidate.id, candidate]))
  const relations: TraceGraphNodeRelation[] = []
  for (const edge of layout.edges) {
    const outgoing = edge.from === nodeId
    const incoming = edge.to === nodeId
    if (!outgoing && !incoming) continue
    const otherId = outgoing ? edge.to : edge.from
    const other = nodeById.get(otherId)
    if (!other) continue
    relations.push({
      edgeId: edge.id,
      direction: outgoing ? 'outgoing' : 'incoming',
      family: edge.family,
      evidence: edge.evidence,
      basis: edge.basis,
      persistedLink: edge.persistedLink,
      otherNodeId: otherId,
      otherKind: other.kind,
      otherIdentity: other.ref?.ref ?? null,
      otherResolution: other.resolution,
      linkKey: edge.linkKey,
      pageKey: edge.pageKey,
      confidence: edge.confidence,
      coverage: edge.coverage,
    })
  }

  const reference = node.ref?.ref ?? null
  const unresolvedRelations = reference === null
    ? []
    : layout.unresolvedEdges.filter(edge =>
      edge.fromRef.ref === reference || edge.toRef?.ref === reference)
  const foldedRelations = reference === null
    ? []
    : layout.foldedEdges.filter(edge =>
      edge.fromRef.ref === reference || edge.toRef?.ref === reference)

  const field = PROVENANCE_FIELD[node.kind] ?? null
  const value = field && provenance
    ? (provenance as unknown as Record<string, unknown>)[field]
    : null
  const evidence = traceGraphNodeEvidenceKey(node)

  return {
    node,
    identity: node.ref?.ref ?? null,
    relations,
    incomingCount: relations.filter(relation => relation.direction === 'incoming').length,
    outgoingCount: relations.filter(relation => relation.direction === 'outgoing').length,
    unresolvedRelations,
    foldedRelations,
    provenanceField: field,
    provenanceValue: typeof value === 'string' ? value : null,
    evidenceTarget: evidence?.target ?? null,
    evidenceKey: evidence?.key ?? null,
  }
}
