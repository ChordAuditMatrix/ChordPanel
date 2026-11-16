import type {
  TraceCoverageState,
  TraceGraphRef,
  TraceGraphRefKind,
  TraceLinkConfidence,
} from '@/api/trace'
import {
  graphCanvasRadialEdgePath,
  type GraphCanvasBox,
} from './graphCanvasGeometry'
import type {
  TraceGraphProjectedEdge,
  TraceGraphProjectedNode,
  TraceGraphProjection,
} from './traceGraphProjection'

/**
 * Node/edge geometry of the Job execution graph.
 *
 * Positions are derived from the evidence relations the backend stated, not
 * from the row family:
 * - The Job is the anchor of the canvas. Every drawn node is placed on the ring
 *   of its shortest relation distance from the Job, so one hop of proven
 *   evidence is one ring.
 * - Within a ring, the order follows the angular position of the node's
 *   relations on the inner ring, so a relation stays short and crossings stay
 *   rare.
 * - A node no drawn relation reaches keeps the outermost ring and is reported as
 *   relation-isolated; it is never connected by guesswork.
 *
 * The layout never invents a business fact. Drawn nodes are exactly the
 * projection's typed nodes plus explicit endpoint kinds the backend named in an
 * edge. A relation whose endpoint the loaded pages do not carry is not drawn at
 * all: it keeps its raw references in `unresolvedEdges` and gets no placeholder
 * node and no line. Folded evidence families contribute no node, no line and no
 * placeholder either; their relations are reported as folded, not as unresolved.
 */

export const TRACE_GRAPH_CANVAS_NODE_WIDTH = 208
export const TRACE_GRAPH_CANVAS_NODE_HEIGHT = 58

const MIN_RING_RADIUS = 168
const RING_GAP = 62
/** Minimum arc length one node needs on its ring, in pixels. */
const RING_ARC_PER_NODE = TRACE_GRAPH_CANVAS_NODE_WIDTH + 34
const RING_START_ANGLE = -Math.PI / 2
const CANVAS_PADDING = 24

/** Row families of the Job graph; a family is a filter, not a position. */
export const TRACE_GRAPH_CANVAS_LANE_ORDER = [
  'notification',
  'job',
  'task',
  'part',
  'activity',
  'endpoint',
] as const

export type TraceGraphCanvasLane = typeof TRACE_GRAPH_CANVAS_LANE_ORDER[number]

export type TraceGraphCanvasNodeKind = TraceGraphRefKind | 'unknown'

/** Only rows and explicit edge endpoints are drawn; unresolved refs stay listed. */
export type TraceGraphCanvasNodeResolution = 'loaded' | 'endpointOnly'

export type TraceGraphCanvasUnresolvedReason =
  | 'targetMissing'
  | 'endpointNotLoaded'
  | 'ambiguousReference'

export interface TraceGraphCanvasNode extends GraphCanvasBox {
  readonly id: string
  readonly lane: TraceGraphCanvasLane
  readonly kind: TraceGraphCanvasNodeKind
  readonly ref: TraceGraphRef | null
  readonly resolution: TraceGraphCanvasNodeResolution
  /** The projection row this node renders; `null` for edge-stated endpoints. */
  readonly projected: TraceGraphProjectedNode | null
  /** Activity rows are page-scoped; every other row keeps `null`. */
  readonly pageKey: string | null
  /** Shortest drawn-relation distance from the delegation anchor. */
  readonly ring: number
  /** Number of drawn relations naming this node. */
  readonly degree: number
}

export type TraceGraphCanvasEdgeFamily =
  | 'link'
  | 'notificationTrigger'
  | 'activityParent'
  | 'partTaskRef'

/** Whether the drawn relation is stored, or reconstructed by the backend. */
export type TraceGraphCanvasEdgeEvidence = 'persisted' | 'derived'

export type TraceGraphCanvasEdgeBasis =
  | 'executionLink'
  | 'persistedProcessingJobAssociation'
  | 'persistedObservationParent'
  | 'partGenerateTaskId'

export interface TraceGraphCanvasEdge {
  readonly id: string
  readonly family: TraceGraphCanvasEdgeFamily
  readonly evidence: TraceGraphCanvasEdgeEvidence
  /** True only for a persisted `ExecutionLink` row. */
  readonly persistedLink: boolean
  readonly basis: TraceGraphCanvasEdgeBasis
  readonly from: string
  readonly to: string
  readonly fromRef: TraceGraphRef
  /** `null` when the backend proved no target identity at all. */
  readonly toRef: TraceGraphRef | null
  readonly pageKey: string | null
  readonly linkKey: string | null
  readonly confidence: TraceLinkConfidence | null
  readonly coverage: TraceCoverageState | null
  readonly path: string
}

/**
 * One backend relation that cannot be drawn because an endpoint has no loaded
 * node and no explicit endpoint kind. It keeps the raw reference and is listed,
 * never turned into a placeholder node or a line.
 */
export interface TraceGraphCanvasUnresolvedEdge {
  readonly id: string
  readonly family: TraceGraphCanvasEdgeFamily
  readonly basis: TraceGraphCanvasEdgeBasis
  readonly fromRef: TraceGraphRef
  readonly toRef: TraceGraphRef | null
  readonly pageKey: string | null
  readonly linkKey: string | null
  readonly confidence: TraceLinkConfidence | null
  readonly coverage: TraceCoverageState | null
  readonly reason: TraceGraphCanvasUnresolvedReason
}

/**
 * A relation a reader folded away. The relation is still proven by the backend;
 * only the drawing omits it, so it is reported instead of being dropped or
 * relabelled as unresolved.
 */
export interface TraceGraphCanvasFoldedEdge {
  readonly id: string
  readonly family: TraceGraphCanvasEdgeFamily
  readonly basis: TraceGraphCanvasEdgeBasis
  readonly fromRef: TraceGraphRef
  readonly toRef: TraceGraphRef | null
  readonly pageKey: string | null
  readonly linkKey: string | null
  readonly confidence: TraceLinkConfidence | null
  readonly coverage: TraceCoverageState | null
  /** The folded evidence family that hid this relation. */
  readonly foldedGroup: TraceGraphCanvasGroupKind
}

/** One relation-distance ring, with the nodes the drawing placed on it. */
export interface TraceGraphCanvasRing {
  readonly ring: number
  /** Radius from the delegation centre, in canvas pixels. */
  readonly radius: number
  readonly centerX: number
  readonly centerY: number
  readonly nodeIds: readonly string[]
}

/** Evidence families a reader may fold; a folded family draws nothing. */
export type TraceGraphCanvasGroupKind = 'task' | 'part' | 'activity'

export const TRACE_GRAPH_CANVAS_GROUP_ORDER: readonly TraceGraphCanvasGroupKind[] = [
  'task',
  'part',
  'activity',
]

export interface TraceGraphCanvasGroup {
  readonly kind: TraceGraphCanvasGroupKind
  readonly lane: TraceGraphCanvasLane
  /** Rows the loaded pages state for this family, drawn or not. */
  readonly nodeCount: number
  readonly drawnNodeCount: number
  readonly collapsed: boolean
  /** Relations of this family that name a drawn node. */
  readonly drawnEdgeCount: number
}

/**
 * The Job identity that anchors the canvas. Task, Part and Activity rows are its
 * delegation's evidence; endpoints are identities only named by a relation.
 */
export interface TraceGraphCanvasDelegation {
  readonly jobNodeId: string | null
  readonly jobId: string | null
  readonly taskNodeCount: number
  readonly partNodeCount: number
  readonly activityNodeCount: number
  readonly endpointNodeCount: number
}

export type TraceGraphCanvasFamilyCounts = Record<TraceGraphCanvasEdgeFamily, number>

export interface TraceGraphCanvasLayoutOptions {
  /** Folded evidence families; their nodes and incident relations are not drawn. */
  readonly collapsed?: readonly TraceGraphCanvasGroupKind[]
}

export interface TraceGraphCanvasLayout {
  readonly nodes: readonly TraceGraphCanvasNode[]
  readonly edges: readonly TraceGraphCanvasEdge[]
  readonly unresolvedEdges: readonly TraceGraphCanvasUnresolvedEdge[]
  readonly foldedEdges: readonly TraceGraphCanvasFoldedEdge[]
  readonly rings: readonly TraceGraphCanvasRing[]
  readonly groups: readonly TraceGraphCanvasGroup[]
  readonly delegation: TraceGraphCanvasDelegation
  readonly collapsedGroups: readonly TraceGraphCanvasGroupKind[]
  /** Node the distance rings are measured from; `null` for an empty drawing. */
  readonly anchorNodeId: string | null
  /** Drawn nodes no drawn relation reaches, excluding the anchor. */
  readonly isolatedNodeIds: readonly string[]
  readonly width: number
  readonly height: number
  readonly loadedNodeCount: number
  readonly endpointNodeCount: number
  readonly unresolvedEdgeCount: number
  readonly foldedEdgeCount: number
  readonly familyCounts: TraceGraphCanvasFamilyCounts
}

export const TRACE_GRAPH_CANVAS_FAMILY_ORDER: readonly TraceGraphCanvasEdgeFamily[] = [
  'link',
  'notificationTrigger',
  'activityParent',
  'partTaskRef',
]

export const TRACE_GRAPH_CANVAS_FAMILY_EVIDENCE: Record<
  TraceGraphCanvasEdgeFamily,
  TraceGraphCanvasEdgeEvidence
> = {
  link: 'persisted',
  notificationTrigger: 'persisted',
  activityParent: 'derived',
  partTaskRef: 'persisted',
}

const ENDPOINT_ONLY_KINDS: readonly TraceGraphRefKind[] = [
  'notification',
  'packet',
  'peer',
  'request',
  'node',
]

const LANE_GROUP_KIND: Partial<Record<TraceGraphCanvasLane, TraceGraphCanvasGroupKind>> = {
  task: 'task',
  part: 'part',
  activity: 'activity',
}

const KIND_ORDER: readonly TraceGraphCanvasNodeKind[] = [
  'job',
  'task',
  'part',
  'activity',
  'notification',
  'request',
  'packet',
  'peer',
  'node',
  'unknown',
]

function refKey(ref: TraceGraphRef): string {
  return `${ref.kind}\u0000${ref.ref}`
}

interface MutableNode extends GraphCanvasBox {
  id: string
  lane: TraceGraphCanvasLane
  kind: TraceGraphCanvasNodeKind
  ref: TraceGraphRef | null
  resolution: TraceGraphCanvasNodeResolution
  projected: TraceGraphProjectedNode | null
  pageKey: string | null
  ring: number
  degree: number
}

interface EdgeDraft {
  id: string
  family: TraceGraphCanvasEdgeFamily
  persistedLink: boolean
  basis: TraceGraphCanvasEdgeBasis
  from: string
  to: string
  fromRef: TraceGraphRef
  toRef: TraceGraphRef | null
  pageKey: string | null
  linkKey: string | null
  confidence: TraceLinkConfidence | null
  coverage: TraceCoverageState | null
}

interface EndpointResolution {
  /** `null` when no drawn node may stand for this endpoint. */
  nodeId: string | null
  /** An explicit endpoint kind the backend named; no loaded row carries it. */
  endpointRef: TraceGraphRef | null
  unresolved: TraceGraphCanvasUnresolvedReason | null
}

function loadedNodeId(node: TraceGraphProjectedNode): string {
  switch (node.kind) {
    case 'job':
      return `row:job:${node.job.nodeId}`
    case 'task':
      return `row:task:${node.task.referenceIndex}`
    case 'part':
      return `row:part:${node.part.nodeId}`
    case 'activity':
      return `row:activity:${node.pageKey}:${node.activity.nodeId}`
  }
}

function laneForLoadedNode(node: TraceGraphProjectedNode): TraceGraphCanvasLane {
  switch (node.kind) {
    case 'job':
      return 'job'
    case 'task':
      return 'task'
    case 'part':
      return 'part'
    case 'activity':
      return 'activity'
  }
}

function projectedEdgeBasis(edge: TraceGraphProjectedEdge): TraceGraphCanvasEdgeBasis {
  switch (edge.kind) {
    case 'link':
      return 'executionLink'
    case 'notificationTrigger':
      return 'persistedProcessingJobAssociation'
    case 'activityParent':
      return 'persistedObservationParent'
  }
}

function groupKindForLane(lane: TraceGraphCanvasLane): TraceGraphCanvasGroupKind | null {
  return LANE_GROUP_KIND[lane] ?? null
}

/**
 * Builds every drawn node and relation of the Job graph canvas. Loaded rows keep
 * their projection identity; repeated Task references stay separate rows, and an
 * edge that names a repeated identity stays unresolved instead of picking one.
 */
export function layoutTraceGraphCanvas(
  projection: TraceGraphProjection,
  options: TraceGraphCanvasLayoutOptions = {},
): TraceGraphCanvasLayout {
  const nodes: MutableNode[] = []
  const nodeById = new Map<string, MutableNode>()
  const nodesByRef = new Map<string, MutableNode[]>()
  const activityByPage = new Map<string, MutableNode>()
  const partNodeIds = new Map<string, string>()
  const collapsedGroups = TRACE_GRAPH_CANVAS_GROUP_ORDER
    .filter(kind => (options.collapsed ?? []).includes(kind))
  const collapsedSet = new Set<TraceGraphCanvasGroupKind>(collapsedGroups)

  function register(node: MutableNode) {
    nodes.push(node)
    nodeById.set(node.id, node)
    if (node.ref) {
      const key = refKey(node.ref)
      const list = nodesByRef.get(key)
      if (list) list.push(node)
      else nodesByRef.set(key, [node])
      if (node.kind === 'activity' && node.pageKey !== null) {
        activityByPage.set(`${refKey(node.ref)}\u0000${node.pageKey}`, node)
      }
    }
  }

  for (const node of projection.nodes) {
    const ref: TraceGraphRef | null = node.ref
    // A Job/Task/Part row without a typed identity keeps the row visible but
    // gains no synthetic reference.
    const mutable: MutableNode = {
      id: loadedNodeId(node),
      lane: laneForLoadedNode(node),
      kind: node.kind,
      ref,
      resolution: 'loaded',
      projected: node,
      pageKey: node.kind === 'activity' ? node.pageKey : null,
      x: 0,
      y: 0,
      width: TRACE_GRAPH_CANVAS_NODE_WIDTH,
      height: TRACE_GRAPH_CANVAS_NODE_HEIGHT,
      ring: 0,
      degree: 0,
    }
    register(mutable)
    if (node.kind === 'part') partNodeIds.set(node.part.nodeId, mutable.id)
  }

  const foldedNodeIds = new Set<string>()
  for (const node of nodes) {
    const groupKind = groupKindForLane(node.lane)
    if (groupKind !== null && collapsedSet.has(groupKind)) foldedNodeIds.add(node.id)
  }

  function endpointNode(ref: TraceGraphRef): MutableNode {
    const id = `endpoint:${ref.kind}:${ref.ref}`
    const existing = nodeById.get(id)
    if (existing) return existing
    const node: MutableNode = {
      id,
      lane: ref.kind === 'notification' ? 'notification' : 'endpoint',
      kind: ref.kind,
      ref,
      resolution: 'endpointOnly',
      projected: null,
      pageKey: null,
      x: 0,
      y: 0,
      width: TRACE_GRAPH_CANVAS_NODE_WIDTH,
      height: TRACE_GRAPH_CANVAS_NODE_HEIGHT,
      ring: 0,
      degree: 0,
    }
    register(node)
    return node
  }

  /**
   * Resolves one backend endpoint. Activity endpoints prefer the exact page
   * that stated the edge; every other identity must be unique among loaded rows.
   * A missing or ambiguous identity resolves to no node at all. An explicit
   * endpoint kind is only materialised when the relation is actually drawn, so a
   * folded group leaves no orphan endpoint behind.
   */
  function resolveEndpoint(ref: TraceGraphRef, pageKey: string | null): EndpointResolution {
    if (ref.kind === 'activity' && pageKey !== null) {
      const pageNode = activityByPage.get(`${refKey(ref)}\u0000${pageKey}`)
      if (pageNode) return { nodeId: pageNode.id, endpointRef: null, unresolved: null }
    }
    const candidates = nodesByRef.get(refKey(ref)) ?? []
    if (candidates.length === 1) {
      return { nodeId: candidates[0].id, endpointRef: null, unresolved: null }
    }
    if (candidates.length > 1) {
      return { nodeId: null, endpointRef: null, unresolved: 'ambiguousReference' }
    }
    if (ENDPOINT_ONLY_KINDS.includes(ref.kind)) {
      return { nodeId: `endpoint:${ref.kind}:${ref.ref}`, endpointRef: ref, unresolved: null }
    }
    return { nodeId: null, endpointRef: null, unresolved: 'endpointNotLoaded' }
  }

  const drafts: EdgeDraft[] = []
  const unresolvedEdges: TraceGraphCanvasUnresolvedEdge[] = []
  const foldedEdges: TraceGraphCanvasFoldedEdge[] = []

  /** The folded family that hides this endpoint, or `null` when it is drawn. */
  function foldedGroupOf(resolution: EndpointResolution): TraceGraphCanvasGroupKind | null {
    if (resolution.nodeId === null) return null
    if (!foldedNodeIds.has(resolution.nodeId)) return null
    const node = nodeById.get(resolution.nodeId)
    if (!node) return null
    const groupKind = groupKindForLane(node.lane)
    return groupKind !== null && collapsedSet.has(groupKind) ? groupKind : null
  }

  function materialize(resolution: EndpointResolution): string {
    if (resolution.endpointRef) return endpointNode(resolution.endpointRef).id
    if (resolution.nodeId === null) {
      throw new Error('graph canvas endpoint resolved to no node')
    }
    return resolution.nodeId
  }

  function addResolvedEdge(
    edge: TraceGraphProjectedEdge,
    from: EndpointResolution,
    to: EndpointResolution,
  ) {
    const family: TraceGraphCanvasEdgeFamily = edge.kind
    const basis = projectedEdgeBasis(edge)
    if (from.nodeId === null || to.nodeId === null) {
      unresolvedEdges.push({
        id: edge.id,
        family,
        basis,
        fromRef: edge.from,
        toRef: edge.to,
        pageKey: edge.pageKey,
        linkKey: edge.linkKey,
        confidence: edge.confidence,
        coverage: edge.coverage,
        reason: from.unresolved ?? to.unresolved ?? 'endpointNotLoaded',
      })
      return
    }
    const foldedGroup = foldedGroupOf(from) ?? foldedGroupOf(to)
    if (foldedGroup !== null) {
      foldedEdges.push({
        id: edge.id,
        family,
        basis,
        fromRef: edge.from,
        toRef: edge.to,
        pageKey: edge.pageKey,
        linkKey: edge.linkKey,
        confidence: edge.confidence,
        coverage: edge.coverage,
        foldedGroup,
      })
      return
    }
    drafts.push({
      id: edge.id,
      family,
      persistedLink: edge.persistedLink,
      basis,
      from: materialize(from),
      to: materialize(to),
      fromRef: edge.from,
      toRef: edge.to,
      pageKey: edge.pageKey,
      linkKey: edge.linkKey,
      confidence: edge.confidence,
      coverage: edge.coverage,
    })
  }

  function addProjectedEdge(edge: TraceGraphProjectedEdge) {
    const from = resolveEndpoint(edge.from, edge.pageKey)
    const to = edge.to === null
      ? { nodeId: null, endpointRef: null, unresolved: 'targetMissing' as const }
      : resolveEndpoint(edge.to, edge.pageKey)
    addResolvedEdge(edge, from, to)
  }

  for (const edge of projection.edges) addProjectedEdge(edge)

  // A Part's persisted `generateTaskId` is a real Task reference, not a Link
  // row. The edge states only that reference; it never upgrades to Link proof.
  for (const node of projection.nodes) {
    if (node.kind !== 'part' || node.part.generateTaskRef === null) continue
    const fromId = partNodeIds.get(node.part.nodeId)
    const partRef = node.ref
    if (!fromId || !partRef) continue
    const target = resolveEndpoint(node.part.generateTaskRef, null)
    const source: EndpointResolution = { nodeId: fromId, endpointRef: null, unresolved: null }
    const id = `partTask:${node.part.nodeId}`
    if (target.nodeId === null) {
      unresolvedEdges.push({
        id,
        family: 'partTaskRef',
        basis: 'partGenerateTaskId',
        fromRef: partRef,
        toRef: node.part.generateTaskRef,
        pageKey: null,
        linkKey: null,
        confidence: null,
        coverage: null,
        reason: target.unresolved ?? 'endpointNotLoaded',
      })
      continue
    }
    const foldedGroup = foldedGroupOf(source) ?? foldedGroupOf(target)
    if (foldedGroup !== null) {
      foldedEdges.push({
        id,
        family: 'partTaskRef',
        basis: 'partGenerateTaskId',
        fromRef: partRef,
        toRef: node.part.generateTaskRef,
        pageKey: null,
        linkKey: null,
        confidence: null,
        coverage: null,
        foldedGroup,
      })
      continue
    }
    drafts.push({
      id,
      family: 'partTaskRef',
      persistedLink: false,
      basis: 'partGenerateTaskId',
      from: materialize(source),
      to: materialize(target),
      fromRef: partRef,
      toRef: node.part.generateTaskRef,
      pageKey: null,
      linkKey: null,
      confidence: null,
      coverage: null,
    })
  }

  const drawnNodes = nodes.filter(node => !foldedNodeIds.has(node.id))
  const drawnById = new Map(drawnNodes.map(node => [node.id, node]))
  const neighbors = new Map<string, Set<string>>()
  for (const node of drawnNodes) neighbors.set(node.id, new Set())
  for (const draft of drafts) {
    neighbors.get(draft.from)?.add(draft.to)
    neighbors.get(draft.to)?.add(draft.from)
  }
  for (const node of drawnNodes) node.degree = neighbors.get(node.id)?.size ?? 0

  const anchor = resolveAnchor(drawnNodes)
  if (anchor) {
    // Breadth-first over the drawn relations only: a relation the pages never
    // stated cannot move a node closer to the delegation.
    const distance = new Map<string, number>([[anchor.id, 0]])
    const queue = [anchor.id]
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]
      const nextDistance = (distance.get(current) ?? 0) + 1
      for (const neighbor of neighbors.get(current) ?? []) {
        if (distance.has(neighbor)) continue
        distance.set(neighbor, nextDistance)
        queue.push(neighbor)
      }
    }
    const maxReached = Math.max(0, ...distance.values())
    for (const node of drawnNodes) {
      node.ring = distance.get(node.id) ?? maxReached + 1
    }
  }

  const placement = placeRings(drawnNodes, neighbors)

  const rings: TraceGraphCanvasRing[] = []
  const ringNumbers = [...new Set(drawnNodes.map(node => node.ring))].sort((a, b) => a - b)
  for (const ring of ringNumbers) {
    rings.push({
      ring,
      radius: placement.radiusByRing.get(ring) ?? 0,
      centerX: placement.centerX,
      centerY: placement.centerY,
      nodeIds: drawnNodes.filter(node => node.ring === ring).map(node => node.id),
    })
  }

  const width = drawnNodes.length === 0
    ? 0
    : Math.max(...drawnNodes.map(node => node.x + node.width)) + CANVAS_PADDING
  const height = drawnNodes.length === 0
    ? 0
    : Math.max(...drawnNodes.map(node => node.y + node.height)) + CANVAS_PADDING

  const familyCounts: TraceGraphCanvasFamilyCounts = {
    link: 0,
    notificationTrigger: 0,
    activityParent: 0,
    partTaskRef: 0,
  }
  const edges: TraceGraphCanvasEdge[] = drafts.map((draft) => {
    familyCounts[draft.family] += 1
    const from = drawnById.get(draft.from)
    const to = drawnById.get(draft.to)
    if (!from || !to) throw new Error(`graph canvas edge ${draft.id} has no drawn endpoint`)
    return {
      id: draft.id,
      family: draft.family,
      evidence: TRACE_GRAPH_CANVAS_FAMILY_EVIDENCE[draft.family],
      persistedLink: draft.persistedLink,
      basis: draft.basis,
      from: draft.from,
      to: draft.to,
      fromRef: draft.fromRef,
      toRef: draft.toRef,
      pageKey: draft.pageKey,
      linkKey: draft.linkKey,
      confidence: draft.confidence,
      coverage: draft.coverage,
      path: graphCanvasRadialEdgePath(from, to).path,
    }
  })
  for (const edge of unresolvedEdges) familyCounts[edge.family] += 1

  const groups: TraceGraphCanvasGroup[] = TRACE_GRAPH_CANVAS_GROUP_ORDER.map((kind) => {
    const familyNodes = nodes.filter(node => groupKindForLane(node.lane) === kind)
    const drawnNodeIds = new Set(
      familyNodes.filter(node => !foldedNodeIds.has(node.id)).map(node => node.id),
    )
    const drawnEdgeCount = edges.filter(edge =>
      drawnNodeIds.has(edge.from) || drawnNodeIds.has(edge.to)).length
    return {
      kind,
      lane: kind,
      nodeCount: familyNodes.length,
      drawnNodeCount: drawnNodeIds.size,
      collapsed: collapsedSet.has(kind),
      drawnEdgeCount,
    }
  })

  let delegationJobNodeId: string | null = null
  let delegationJobId: string | null = null
  const anchorRow = anchor?.projected
  if (anchor && anchorRow && anchorRow.kind === 'job' && anchor.lane === 'job') {
    delegationJobNodeId = anchor.id
    delegationJobId = anchorRow.job.jobId
  }
  const delegation: TraceGraphCanvasDelegation = {
    jobNodeId: delegationJobNodeId,
    jobId: delegationJobId,
    taskNodeCount: nodes.filter(node => node.lane === 'task').length,
    partNodeCount: nodes.filter(node => node.lane === 'part').length,
    activityNodeCount: nodes.filter(node => node.lane === 'activity').length,
    endpointNodeCount: drawnNodes.filter(node => node.resolution === 'endpointOnly').length,
  }

  const isolatedNodeIds = drawnNodes
    .filter(node => node.degree === 0 && node.id !== anchor?.id)
    .map(node => node.id)

  return {
    nodes: drawnNodes,
    edges,
    unresolvedEdges,
    foldedEdges,
    rings,
    groups,
    delegation,
    collapsedGroups,
    anchorNodeId: anchor?.id ?? null,
    isolatedNodeIds,
    width,
    height,
    loadedNodeCount: drawnNodes.filter(node => node.resolution === 'loaded').length,
    endpointNodeCount: drawnNodes.filter(node => node.resolution === 'endpointOnly').length,
    unresolvedEdgeCount: unresolvedEdges.length,
    foldedEdgeCount: foldedEdges.length,
    familyCounts,
  }
}

/**
 * The Job row anchors the drawing. Without one (a projection of relations only),
 * the most connected row anchors it; a page set with a single row anchors on it.
 */
function resolveAnchor(drawnNodes: MutableNode[]): MutableNode | null {
  const jobRow = drawnNodes.find(node => node.lane === 'job' && node.projected?.kind === 'job')
  if (jobRow) return jobRow
  let best: MutableNode | null = null
  for (const node of drawnNodes) {
    if (!best || node.degree > best.degree) best = node
  }
  return best
}

interface RingPlacement {
  readonly radiusByRing: ReadonlyMap<number, number>
  readonly centerX: number
  readonly centerY: number
}

function kindRank(kind: TraceGraphCanvasNodeKind): number {
  const index = KIND_ORDER.indexOf(kind)
  return index === -1 ? KIND_ORDER.length : index
}

/**
 * Places the drawn nodes on their relation-distance rings, then shifts the whole
 * drawing into the canvas.
 *
 * A ring is as wide as its own arc needs and always one gap outside the previous
 * ring, so an inner node never sits behind an outer one. The order inside a ring
 * follows the circular mean of the node's inner-ring neighbours; a node with no
 * inner neighbour goes last in its ring. Nothing here reads a row family: only
 * the drawn relations and their distances decide a position.
 */
function placeRings(
  drawnNodes: MutableNode[],
  neighbors: ReadonlyMap<string, Set<string>>,
): RingPlacement {
  const radiusByRing = new Map<number, number>()
  if (drawnNodes.length === 0) {
    return { radiusByRing, centerX: 0, centerY: 0 }
  }
  const maxRing = Math.max(...drawnNodes.map(node => node.ring))
  let previousRadius = 0
  for (let ring = 0; ring <= maxRing; ring += 1) {
    const count = drawnNodes.filter(node => node.ring === ring).length
    if (count === 0) continue
    if (ring === 0) {
      radiusByRing.set(0, 0)
      continue
    }
    const arcRadius = (count * RING_ARC_PER_NODE) / (2 * Math.PI)
    const radius = Math.max(previousRadius + RING_GAP, MIN_RING_RADIUS, arcRadius)
    radiusByRing.set(ring, radius)
    previousRadius = radius
  }

  const angleOf = new Map<string, number>()
  for (let ring = 0; ring <= maxRing; ring += 1) {
    const ringNodes = drawnNodes.filter(node => node.ring === ring)
    if (ringNodes.length === 0) continue
    const radius = radiusByRing.get(ring) ?? 0
    if (ring === 0) {
      for (const node of ringNodes) {
        node.x = -node.width / 2
        node.y = -node.height / 2
        angleOf.set(node.id, 0)
      }
      continue
    }
    const idealAngle = new Map<string, number>()
    for (const node of ringNodes) {
      let sinSum = 0
      let cosSum = 0
      let innerCount = 0
      for (const neighborId of neighbors.get(node.id) ?? []) {
        const angle = angleOf.get(neighborId)
        if (angle === undefined) continue
        sinSum += Math.sin(angle)
        cosSum += Math.cos(angle)
        innerCount += 1
      }
      idealAngle.set(node.id, innerCount === 0
        ? Number.POSITIVE_INFINITY
        : Math.atan2(sinSum / innerCount, cosSum / innerCount))
    }
    const ordered = [...ringNodes].sort((left, right) => {
      const leftIdeal = idealAngle.get(left.id) ?? Number.POSITIVE_INFINITY
      const rightIdeal = idealAngle.get(right.id) ?? Number.POSITIVE_INFINITY
      if (leftIdeal !== rightIdeal) return leftIdeal < rightIdeal ? -1 : 1
      const kindDelta = kindRank(left.kind) - kindRank(right.kind)
      if (kindDelta !== 0) return kindDelta
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
    const step = (2 * Math.PI) / ordered.length
    // Odd rings start half a step off, so a child never hides its parent.
    const phase = RING_START_ANGLE + (ring % 2 === 0 ? 0 : step / 2)
    ordered.forEach((node, index) => {
      const angle = phase + index * step
      node.x = radius * Math.cos(angle) - node.width / 2
      node.y = radius * Math.sin(angle) - node.height / 2
      angleOf.set(node.id, angle)
    })
  }

  const minX = Math.min(...drawnNodes.map(node => node.x))
  const minY = Math.min(...drawnNodes.map(node => node.y))
  const shiftX = CANVAS_PADDING - minX
  const shiftY = CANVAS_PADDING - minY
  for (const node of drawnNodes) {
    node.x += shiftX
    node.y += shiftY
  }

  // The drawing is centred on the anchor origin, so the shift is its centre.
  return { radiusByRing, centerX: shiftX, centerY: shiftY }
}
