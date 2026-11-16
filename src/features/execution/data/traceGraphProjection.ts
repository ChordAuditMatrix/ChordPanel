import type {
  TraceCoverageReason,
  TraceCoverageState,
  TraceGraphActivityNode,
  TraceGraphJobNode,
  TraceGraphPartNode,
  TraceGraphRef,
  TraceGraphStreamName,
  TraceGraphTaskNode,
  TraceLinkConfidence,
} from '@/api/trace'
import { TRACE_GRAPH_STREAM_NAMES, type TraceGraphState } from './traceGraphModel'

/**
 * Read-only render projection of the accumulated graph state.
 *
 * Business facts are never re-derived here: nodes are the backend's typed nodes
 * verbatim, and every edge states whether it came from the Link store or from a
 * derived association. The projection is a value, so every field is read-only;
 * the mutable source stays `TraceGraphState` in the model.
 */

/** Edge families a renderer may draw, kept apart by their evidence source. */
export type TraceGraphProjectedEdgeKind = 'link' | 'activityParent' | 'notificationTrigger'

export type TraceGraphProjectedNode =
  | { readonly kind: 'job'; readonly ref: TraceGraphRef | null; readonly job: TraceGraphJobNode }
  | { readonly kind: 'task'; readonly ref: TraceGraphRef | null; readonly task: TraceGraphTaskNode }
  | { readonly kind: 'part'; readonly ref: TraceGraphRef | null; readonly part: TraceGraphPartNode }
  | {
    readonly kind: 'activity'
    readonly ref: TraceGraphRef | null
    /** Position the page was read at; a node proves only that page's facts. */
    readonly pageKey: string
    readonly activity: TraceGraphActivityNode
  }

export interface TraceGraphProjectedEdge {
  /** Stable render key; unique inside one projection. */
  readonly id: string
  readonly kind: TraceGraphProjectedEdgeKind
  readonly from: TraceGraphRef
  /** `null` when the backend proved no target identity. */
  readonly to: TraceGraphRef | null
  /**
   * True only for a persisted `ExecutionLink` row. Activity parent edges and
   * notification triggers are derived associations and must not be shown as
   * stored Link evidence.
   */
  readonly persistedLink: boolean
  readonly confidence: TraceLinkConfidence | null
  /** Coverage of the stream that stated this edge. */
  readonly coverage: TraceCoverageState | null
  /** Persisted Link identity, or `null` for a derived edge. */
  readonly linkKey: string | null
  /** Activity page this edge came from, or `null` for Link and trigger edges. */
  readonly pageKey: string | null
}

/** One scope whose coverage is not `complete`, with the response's open reasons. */
export interface TraceGraphCoverageGap {
  readonly scope: TraceGraphStreamName | 'job'
  readonly coverage: TraceCoverageState | null
}

/** One page of activity facts, as a renderer should present it. */
export interface TraceGraphActivityPageSummary {
  readonly pageKey: string
  /** True when earlier facts of a span may sit on another page. */
  readonly continued: boolean
  readonly coverage: TraceCoverageState | null
  readonly nodeCount: number
  /** True when the activity stream has further pages, so the last page is not the span's end. */
  readonly hasMore: boolean
}

export interface TraceGraphProjection {
  readonly job: TraceGraphJobNode | null
  readonly nodes: readonly TraceGraphProjectedNode[]
  readonly edges: readonly TraceGraphProjectedEdge[]
  /** Every activity page separately; never collapsed into one span state. */
  readonly activityPages: readonly TraceGraphActivityPageSummary[]
  /** Only scopes that cannot claim completeness; `complete` scopes are omitted. */
  readonly gaps: readonly TraceGraphCoverageGap[]
  /** Closed coverage reasons of the last response, deduplicated by the backend. */
  readonly reasons: readonly TraceCoverageReason[]
  /** True only when every scope of the last response is `complete`. */
  readonly complete: boolean
}

/**
 * Turns the accumulated graph state into render rows without re-deriving any
 * business fact. An empty Task reference has no identity and keeps `ref: null`
 * instead of a synthetic locator. Activity rows stay page-scoped, so a span
 * whose facts cross a page boundary appears once per page instead of being
 * combined.
 */
export function projectTraceGraph(state: TraceGraphState): TraceGraphProjection {
  const nodes: TraceGraphProjectedNode[] = []
  if (state.job) {
    nodes.push({ kind: 'job', ref: { kind: 'job', ref: state.job.nodeId }, job: state.job })
  }
  for (const task of state.taskNodes) {
    nodes.push({
      kind: 'task',
      ref: task.nodeId === null ? null : { kind: 'task', ref: task.nodeId },
      task,
    })
  }
  for (const part of state.partNodes) {
    nodes.push({ kind: 'part', ref: { kind: 'part', ref: part.nodeId }, part })
  }

  const edges: TraceGraphProjectedEdge[] = []
  for (const edge of state.edges) {
    edges.push({
      id: `link:${edge.linkKey}`,
      kind: 'link',
      from: edge.from,
      to: edge.to,
      persistedLink: true,
      confidence: edge.confidence,
      coverage: state.coverage?.edges ?? state.streams.edges.coverage,
      linkKey: edge.linkKey,
      pageKey: null,
    })
  }

  const activityPages: TraceGraphActivityPageSummary[] = []
  for (const page of state.activityPages) {
    for (const node of page.nodes) {
      nodes.push({
        kind: 'activity',
        ref: { kind: 'activity', ref: node.nodeId },
        pageKey: page.pageKey,
        activity: node,
      })
    }
    for (const edge of page.edges) {
      edges.push({
        id: `activityParent:${page.pageKey}:${edge.from.ref}->${edge.to.ref}`,
        kind: 'activityParent',
        from: edge.from,
        to: edge.to,
        persistedLink: false,
        confidence: edge.confidence,
        coverage: page.coverage ?? state.coverage?.activities ?? state.streams.activities.coverage,
        linkKey: null,
        pageKey: page.pageKey,
      })
    }
    activityPages.push({
      pageKey: page.pageKey,
      continued: page.continued,
      coverage: page.coverage,
      nodeCount: page.nodes.length,
      hasMore: state.streams.activities.hasMore,
    })
  }

  for (const edge of state.triggerEdges) {
    edges.push({
      id: `trigger:${edge.ownerId}:${edge.notificationId}:${edge.attempt}`,
      kind: 'notificationTrigger',
      from: edge.from,
      to: edge.to,
      persistedLink: false,
      confidence: null,
      coverage: state.coverage?.triggers ?? state.streams.triggers.coverage,
      linkKey: null,
      pageKey: null,
    })
  }

  const gaps: TraceGraphCoverageGap[] = []
  const coverage = state.coverage
  if (coverage) {
    const scopes: Array<TraceGraphStreamName | 'job'> = ['job', ...TRACE_GRAPH_STREAM_NAMES]
    for (const scope of scopes) {
      const value = scope === 'job' ? coverage.job : coverage[scope]
      if (value !== 'complete') gaps.push({ scope, coverage: value })
    }
  }

  return {
    job: state.job,
    nodes,
    edges,
    activityPages,
    gaps,
    reasons: coverage?.reasons ?? [],
    complete: coverage !== null && gaps.length === 0,
  }
}
