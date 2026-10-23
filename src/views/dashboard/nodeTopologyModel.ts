import type { NodeSummary } from '@/api/system'
import {
  executionCommunicationActivities,
  type ExecutionCommunicationActivity,
  type ExecutionCommunicationProjection,
} from '@/features/execution/data/executionCommunication'

/** Roles the backend documents. Anything else is kept as an unknown role. */
export const KNOWN_NODE_ROLES = ['Admin', 'Audit', 'Storage'] as const
export type KnownNodeRole = (typeof KNOWN_NODE_ROLES)[number]
export type NodeRoleGroupKey = KnownNodeRole | 'unknown'

export const DEFAULT_MAX_GROUP_NODES = 12

export interface NodeRoleGroup {
  key: NodeRoleGroupKey
  /** Null for the unknown group, which mixes distinct role strings. */
  role: KnownNodeRole | null
  /** All catalog nodes of this group, stably sorted. */
  nodes: readonly NodeSummary[]
  /** Nodes drawn in the diagram; the roster still lists every node. */
  visibleNodes: readonly NodeSummary[]
  hiddenCount: number
}
/** The structural Admin anchor is not a registered NodeSummary. */
export function shouldDisplayNodeCount(role: NodeRoleGroupKey, count: number): boolean {
  return role !== 'Admin' || count > 0
}

function compareNodes(a: NodeSummary, b: NodeSummary): number {
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1
  const left = a.nodeInstanceId ?? ''
  const right = b.nodeInstanceId ?? ''
  return left === right ? 0 : left < right ? -1 : 1
}

/** Exact, case-sensitive match; `admin` is not `Admin`. */
export function isKnownNodeRole(role: unknown): role is KnownNodeRole {
  return typeof role === 'string' && (KNOWN_NODE_ROLES as readonly string[]).includes(role)
}

/**
 * Group nodes by documented role, keeping every unknown role in one group.
 * Order is fixed (Admin, Audit, Storage, unknown) and nodes are sorted by
 * `nodeId`, so the diagram never depends on API response order.
 *
 * `keepNodeIds` forces highlighted nodes into the drawn slice when a group
 * exceeds the readable cap.
 */
export function groupNodesByRole(
  nodes: readonly NodeSummary[],
  options: { maxPerGroup?: number; keepNodeIds?: ReadonlySet<string> } = {},
): NodeRoleGroup[] {
  const maxPerGroup = options.maxPerGroup ?? DEFAULT_MAX_GROUP_NODES
  const buckets: Record<Exclude<NodeRoleGroupKey, 'unknown'>, NodeSummary[]> = {
    Admin: [],
    Audit: [],
    Storage: [],
  }
  const unknown: NodeSummary[] = []
  for (const node of nodes) {
    if (isKnownNodeRole(node.role)) buckets[node.role].push(node)
    else unknown.push(node)
  }

  const groups: NodeRoleGroup[] = []
  for (const role of KNOWN_NODE_ROLES) {
    const sorted = [...buckets[role]].sort(compareNodes)
    groups.push(makeGroup(role, role, sorted, maxPerGroup, options.keepNodeIds))
  }
  groups.push(makeGroup('unknown', null, [...unknown].sort(compareNodes), maxPerGroup, options.keepNodeIds))
  return groups
}

/** The dashboard may render an Admin control-plane anchor without a NodeSummary. */
export type AdminControlPlaneStatus = 'available' | 'unavailable' | 'unknown'

/**
 * Retain structural Admin/Audit/Storage groups while never inventing NodeSummary rows.
 * Empty unknown-role groups have no architectural meaning and stay hidden.
 */
export function dashboardTopologyGroups(
  nodes: readonly NodeSummary[],
  options: { maxPerGroup?: number; keepNodeIds?: ReadonlySet<string> } = {},
): NodeRoleGroup[] {
  return groupNodesByRole(nodes, options).filter(group =>
    group.key !== 'unknown' || group.nodes.length > 0,
  )
}

/** Prefer an explicit Admin availability flag; metrics prove the status route responded. */
export function adminControlPlaneStatus(
  admin: {
    isAvailable?: boolean
    cpuUsage?: number
    memoryUsage?: number
    load?: number
  } | null | undefined,
  statusFailed = false,
): AdminControlPlaneStatus {
  if (statusFailed || !admin) return 'unknown'
  if (typeof admin.isAvailable === 'boolean') {
    return admin.isAvailable ? 'available' : 'unavailable'
  }
  return [admin.cpuUsage, admin.memoryUsage, admin.load].some(
    value => typeof value === 'number' && Number.isFinite(value),
  ) ? 'available' : 'unknown'
}

function makeGroup(
  key: NodeRoleGroupKey,
  role: KnownNodeRole | null,
  sorted: NodeSummary[],
  maxPerGroup: number,
  keepNodeIds: ReadonlySet<string> | undefined,
): NodeRoleGroup {
  if (maxPerGroup <= 0 || sorted.length <= maxPerGroup) {
    return { key, role, nodes: sorted, visibleNodes: sorted, hiddenCount: 0 }
  }
  const keep = keepNodeIds ?? new Set<string>()
  const visible = sorted.slice(0, maxPerGroup)
  if (keep.size > 0) {
    const visibleIds = new Set(visible.map(node => node.nodeId))
    for (const node of sorted) {
      if (!keep.has(node.nodeId) || visibleIds.has(node.nodeId)) continue
      // Replace the last unkept node so the cap stays exact.
      let replaceAt = visible.length - 1
      while (replaceAt >= 0 && keep.has(visible[replaceAt].nodeId)) replaceAt -= 1
      if (replaceAt < 0) break
      visibleIds.delete(visible[replaceAt].nodeId)
      visible[replaceAt] = node
      visibleIds.add(node.nodeId)
    }
    visible.sort(compareNodes)
  }
  return {
    key,
    role,
    nodes: sorted,
    visibleNodes: visible,
    hiddenCount: sorted.length - visible.length,
  }
}

export type NodeEvidenceKind = ExecutionCommunicationActivity['kind']

/**
 * One selected activity, resolved against the exact catalog node ids.
 * `missingNodeIds` is reported instead of snapping to a similar node id.
 */
export interface SelectedNodeEvidence {
  activityId: string
  kind: NodeEvidenceKind
  /** Populated only when evidence establishes a direction. */
  sourceNodeId: string | null
  targetNodeId: string | null
  matchedNodeIds: readonly string[]
  missingNodeIds: readonly string[]
  relationDirection: 'directed' | 'undirected' | 'none'
  drawableRelation: boolean
  /** Exact confirmed packet id; null for every other evidence kind. */
  packetId: string | null
}


export interface NodeEvidenceProjection {
  /** Evidence is usable only when the scope is non-empty and equals the projection Job. */
  scopeMatched: boolean
  projectionJobId: string | null
  activities: readonly ExecutionCommunicationActivity[]
  selected: SelectedNodeEvidence | null
  /** True when a selected id is not part of the scoped projection. */
  selectedMissing: boolean
}

const EMPTY_EVIDENCE: NodeEvidenceProjection = {
  scopeMatched: false,
  projectionJobId: null,
  activities: [],
  selected: null,
  selectedMissing: false,
}

/**
 * Project the current Job's communication evidence onto the node catalog.
 *
 * The projection is never global: activities are accepted only when the
 * caller-provided scope equals the projection Job and the activity carries
 * that same Job id.
 */
export function projectNodeEvidence(
  projection: ExecutionCommunicationProjection | null | undefined,
  nodes: readonly NodeSummary[],
  selectedActivityId: string | null,
  activityScope: string | null,
): NodeEvidenceProjection {
  if (!projection) {
    return { ...EMPTY_EVIDENCE, selectedMissing: Boolean(selectedActivityId) }
  }
  const scopeMatched = typeof activityScope === 'string'
    && activityScope.trim() !== ''
    && activityScope === projection.jobId
  if (!scopeMatched) {
    return {
      ...EMPTY_EVIDENCE,
      projectionJobId: projection.jobId,
      selectedMissing: Boolean(selectedActivityId),
    }
  }

  const activities = executionCommunicationActivities(projection)
    .filter(activity => activity.jobId === projection.jobId)
  const catalogIds = new Set<string>()
  for (const node of nodes) {
    if (typeof node.nodeId === 'string' && node.nodeId !== '') catalogIds.add(node.nodeId)
  }

  if (!selectedActivityId) {
    return { scopeMatched, projectionJobId: projection.jobId, activities, selected: null, selectedMissing: false }
  }
  const activity = activities.find(item => item.activityId === selectedActivityId)
  if (!activity) {
    return { scopeMatched, projectionJobId: projection.jobId, activities, selected: null, selectedMissing: true }
  }
  return {
    scopeMatched,
    projectionJobId: projection.jobId,
    activities,
    selected: resolveEvidence(activity, catalogIds),
    selectedMissing: false,
  }
}

function resolveEvidence(
  activity: ExecutionCommunicationActivity,
  catalogIds: ReadonlySet<string>,
): SelectedNodeEvidence {
  if (activity.kind === 'localStage') {
    const matched = catalogIds.has(activity.nodeId)
    return {
      activityId: activity.activityId,
      kind: activity.kind,
      sourceNodeId: activity.nodeId,
      targetNodeId: null,
      matchedNodeIds: matched ? [activity.nodeId] : [],
      missingNodeIds: matched ? [] : [activity.nodeId],
      relationDirection: 'none',
      drawableRelation: false,
      packetId: null,
    }
  }

  const direction = activity.kind === 'peerCorrelation' ? activity.direction : activity
  const sourceNodeId = direction?.fromNodeId ?? null
  const targetNodeId = direction?.toNodeId ?? null
  const endpoints = activity.kind === 'peerCorrelation' && !direction
    ? [activity.originNodeId, activity.nodeId]
    : [sourceNodeId, targetNodeId].filter((value): value is string => value !== null)
  const matched: string[] = []
  const missing: string[] = []
  for (const nodeId of endpoints) {
    if (matched.includes(nodeId) || missing.includes(nodeId)) continue
    if (catalogIds.has(nodeId)) matched.push(nodeId)
    else missing.push(nodeId)
  }
  const relationDirection = direction ? 'directed' : activity.kind === 'peerCorrelation' ? 'undirected' : 'none'
  return {
    activityId: activity.activityId,
    kind: activity.kind,
    sourceNodeId,
    targetNodeId,
    matchedNodeIds: matched,
    missingNodeIds: missing,
    relationDirection,
    drawableRelation: relationDirection !== 'none' && endpoints.length === 2
      && endpoints[0] !== endpoints[1] && matched.length === 2,
    packetId: activity.kind === 'confirmedPacket' ? activity.packetId : null,
  }
}

/**
 * A confirmed TaskDispatchReq may be drawn from the Admin structural anchor when
 * its exact recorded sender is not a registered node and no registered Admin
 * exists. The target must still be a registered catalog node, so a missing target
 * stays missing instead of being redirected. Returns null for every other case,
 * including a merely similar id or a peer/local evidence kind.
 */
export function adminAnchorEndpoints(
  selected: SelectedNodeEvidence | null,
  activity: ExecutionCommunicationActivity | null | undefined,
  nodes: readonly NodeSummary[],
): { sourceNodeId: string; targetNodeId: string } | null {
  if (!selected || selected.kind !== 'confirmedPacket') return null
  if (!activity || activity.kind !== 'confirmedPacket') return null
  if (activity.activityId !== selected.activityId) return null
  const sourceNodeId = selected.sourceNodeId
  const targetNodeId = selected.targetNodeId
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return null
  // The anchor may only stand for the sender the exact packet recorded.
  if (activity.fromNodeId !== sourceNodeId) return null

  const registered = new Set<string>()
  let hasRegisteredAdmin = false
  for (const node of nodes) {
    if (typeof node.nodeId === 'string' && node.nodeId !== '') registered.add(node.nodeId)
    if (node.role === 'Admin') hasRegisteredAdmin = true
  }
  // A registered Admin owns the panel; the anchor is never drawn beside it.
  if (hasRegisteredAdmin) return null
  if (registered.has(sourceNodeId) || !registered.has(targetNodeId)) return null
  return { sourceNodeId, targetNodeId }
}
