import type { TraceSourceComponent } from '@/api/trace'
import type {
  ExecutionCommunicationActivity,
  ExecutionCommunicationProjection,
  PeerCorrelationHint,
} from '@/features/execution/data/executionCommunication'

/**
 * Pure geometry and evidence selection for the execution communication
 * topology. Nothing here measures latency: travel durations are derived from
 * the drawn segment only, and a flow exists only when an exact observed
 * activity resolves to a fixed role edge.
 */

export const TOPOLOGY_NODE_ORDER: readonly TraceSourceComponent[] = ['Admin', 'Audit', 'Storage']
export const TOPOLOGY_NODE_LABEL_KEY: Record<TraceSourceComponent, string> = {
  Admin: 'execution.topology.admin',
  Audit: 'execution.topology.audit',
  Storage: 'execution.topology.storage',
}

export interface TopologyNodeBox {
  x: number
  y: number
  width: number
  height: number
}

export const TOPOLOGY_NODE_BOX: Record<TraceSourceComponent, TopologyNodeBox> = {
  Admin: { x: 32, y: 132, width: 150, height: 56 },
  Audit: { x: 458, y: 32, width: 150, height: 56 },
  Storage: { x: 458, y: 232, width: 150, height: 56 },
}

export interface TopologyEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Fixed role edges: the line, the trace and the token read the same endpoints. */
export const TOPOLOGY_EDGES = {
  adminAudit: { x1: 182, y1: 150, x2: 450, y2: 70 },
  adminStorage: { x1: 182, y1: 170, x2: 450, y2: 250 },
  auditStorage: { x1: 533, y1: 88, x2: 533, y2: 232 },
  storageAudit: { x1: 533, y1: 232, x2: 533, y2: 88 },
} as const

export const TOPOLOGY_EDGE_MIDPOINT = {
  adminAudit: { x: 316, y: 110 },
  adminStorage: { x: 316, y: 210 },
  auditStorage: { x: 533, y: 156 },
}

export const TOPOLOGY_ACTIVITY_PAGE_SIZE = 50
export const TOPOLOGY_PEER_MARKER_LIMIT = 8

const PEER_MARKER_SPAN = 128
const PEER_MARKER_BASE_Y = 90
const PEER_MARKER_X_OFFSET = 18

const TRAVEL_BASE_MS = 520
const TRAVEL_MAX_MS = 1_000
const TRAVEL_MS_PER_UNIT = 1.2

export type TopologyFlowTargetRole = 'Audit' | 'Storage'

export interface TopologyFlow {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Exactly the drawn segment; the SMIL token follows this path. */
  path: string
  durationMs: number
  animated: boolean
  targetRole: TopologyFlowTargetRole
  /** A confirmed TaskDispatchReq is the only flow that may draw a token. */
  token: boolean
}

export interface TopologyNodeGeometry extends TopologyNodeBox {
  component: TraceSourceComponent
  /** `execution.topology.admin` | `audit` | `storage`. */
  labelKey: string
  centerX: number
  labelY: number
  idY: number
  nodeId: string | null
  /** Shortened for the fixed-width SVG label; full id stays in the evidence list. */
  nodeIdText: string | null
  hasLocal: boolean
  selected: boolean
  /** Destination of the selected resolved flow; stays focused after arrival. */
  addressed: boolean
}

export interface TopologyResponseNode {
  x: number
  y: number
  width: number
  height: number
  durationMs: number
  animated: boolean
}

export interface TopologyLocalPulse {
  activityId: string
  x: number
  y: number
  width: number
  height: number
}

export interface TopologyPeerMarker {
  activityId: string
  index: number
  x: number
  y: number
}

export interface TopologyNodeComponentsInput {
  localStages: readonly Pick<
    ExecutionCommunicationProjection['localStages'][number],
    'nodeId' | 'component'
  >[]
  roleNodeIds?: Partial<Record<TraceSourceComponent, string | null>> | null
}

/**
 * Observed worker identity is preferred; durable Job metadata fills missing
 * roles. A metadata id never overwrites a node id already observed in worker
 * evidence.
 */
export function projectTopologyNodeComponents(
  input: TopologyNodeComponentsInput,
): Map<string, TraceSourceComponent> {
  const map = new Map<string, TraceSourceComponent>()
  for (const stage of input.localStages) {
    if (!map.has(stage.nodeId)) map.set(stage.nodeId, stage.component)
  }
  for (const component of TOPOLOGY_NODE_ORDER) {
    const nodeId = input.roleNodeIds?.[component]
    if (nodeId && !map.has(nodeId)) map.set(nodeId, component)
  }
  return map
}

export function topologyTravelDurationMs(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const distance = Math.hypot(x2 - x1, y2 - y1)
  return Math.min(TRAVEL_MAX_MS, Math.round(TRAVEL_BASE_MS + distance * TRAVEL_MS_PER_UNIT))
}

function flowFromEdge(
  edge: TopologyEdge,
  targetRole: TopologyFlowTargetRole,
  token: boolean,
  activityId: string,
  options: TopologyFlowOptions,
): TopologyFlow {
  return {
    ...edge,
    path: `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`,
    durationMs: topologyTravelDurationMs(edge.x1, edge.y1, edge.x2, edge.y2),
    animated: options.animationActivityId === activityId && !options.reducedMotion,
    targetRole,
    token,
  }
}

export interface TopologyFlowOptions {
  animationActivityId?: string | null
  reducedMotion?: boolean
}

/**
 * A packet token exists only when the dispatch target resolves to an observed
 * Audit/Storage role. An unresolved role leaves the packet in the evidence list
 * without claiming an edge.
 *
 * Peer evidence never becomes a packet: only an exact observed direction whose
 * endpoints resolve to the Audit/Storage roles may draw a relationship flow.
 * `ProofReturnedToAudit` stays an Audit-acceptance direction, not a dispatch.
 */
export function resolveTopologyFlow(
  activity: ExecutionCommunicationActivity | null | undefined,
  componentByNodeId: ReadonlyMap<string, TraceSourceComponent>,
  options: TopologyFlowOptions = {},
): TopologyFlow | null {
  if (!activity) return null

  if (activity.kind === 'confirmedPacket') {
    const targetRole = componentByNodeId.get(activity.toNodeId)
    if (targetRole === 'Audit') {
      return flowFromEdge(TOPOLOGY_EDGES.adminAudit, 'Audit', true, activity.activityId, options)
    }
    if (targetRole === 'Storage') {
      return flowFromEdge(TOPOLOGY_EDGES.adminStorage, 'Storage', true, activity.activityId, options)
    }
    return null
  }

  if (activity.kind === 'peerCorrelation') {
    const direction = activity.direction
    if (!direction) return null
    const source = componentByNodeId.get(direction.fromNodeId)
    const target = componentByNodeId.get(direction.toNodeId)
    if (source === 'Audit' && target === 'Storage') {
      return flowFromEdge(TOPOLOGY_EDGES.auditStorage, 'Storage', false, activity.activityId, options)
    }
    if (source === 'Storage' && target === 'Audit') {
      return flowFromEdge(TOPOLOGY_EDGES.storageAudit, 'Audit', false, activity.activityId, options)
    }
    return null
  }

  return null
}

/** The destination frame stays while its activity is selected; only the settle waits. */
export function projectTopologyResponseNode(
  flow: TopologyFlow | null | undefined,
): TopologyResponseNode | null {
  if (!flow) return null
  const box = TOPOLOGY_NODE_BOX[flow.targetRole]
  return {
    x: box.x - 4,
    y: box.y - 4,
    width: box.width + 8,
    height: box.height + 8,
    durationMs: flow.durationMs,
    animated: flow.animated,
  }
}

export function shortTopologyNodeId(nodeId: string | null): string | null {
  if (nodeId === null) return null
  return nodeId.length > 20 ? `${nodeId.slice(0, 19)}…` : nodeId
}

export interface TopologyNodeProjectionInput {
  componentByNodeId: ReadonlyMap<string, TraceSourceComponent>
  localComponents: ReadonlySet<TraceSourceComponent>
  selectedNodeId?: string | null
  addressedComponent?: TraceSourceComponent | null
}

export function projectTopologyNodes(
  input: TopologyNodeProjectionInput,
): TopologyNodeGeometry[] {
  const selectedNodeId = input.selectedNodeId ?? null
  const addressedComponent = input.addressedComponent ?? null
  return TOPOLOGY_NODE_ORDER.map(component => {
    const box = TOPOLOGY_NODE_BOX[component]
    const nodeId = [...input.componentByNodeId.entries()]
      .find(([, value]) => value === component)?.[0] ?? null
    return {
      component,
      labelKey: TOPOLOGY_NODE_LABEL_KEY[component],
      ...box,
      centerX: box.x + box.width / 2,
      labelY: box.y + box.height / 2 - 2,
      idY: box.y + box.height / 2 + 13,
      nodeId,
      nodeIdText: shortTopologyNodeId(nodeId),
      hasLocal: input.localComponents.has(component),
      selected: nodeId !== null && nodeId === selectedNodeId,
      addressed: component === addressedComponent,
    }
  })
}

export interface TopologyLocalPulseInput {
  activity: ExecutionCommunicationActivity | null | undefined
  animationActivityId?: string | null
  reducedMotion?: boolean
  nodes: readonly TopologyNodeGeometry[]
}

/** Selecting an observed local event emits one bounded node pulse, never a packet. */
export function resolveTopologyLocalPulse(
  input: TopologyLocalPulseInput,
): TopologyLocalPulse | null {
  const activity = input.activity
  if (
    !activity
    || activity.kind !== 'localStage'
    || activity.sourceQuality !== 'observed'
    || activity.activityId !== input.animationActivityId
    || input.reducedMotion
  ) return null

  const node = input.nodes.find(item => item.nodeId === activity.nodeId)
  if (!node) return null
  return {
    activityId: activity.activityId,
    x: node.x - 6,
    y: node.y - 6,
    width: node.width + 12,
    height: node.height + 12,
  }
}

/**
 * Peer markers keep the first eight relationships and replace the last slot
 * with the selected relationship when it falls outside that window. The number
 * always names the activity's position in the full evidence list.
 */
export function projectTopologyPeerMarkers(
  peers: readonly PeerCorrelationHint[],
  selectedPeer?: PeerCorrelationHint | null,
): TopologyPeerMarker[] {
  const visible = peers.slice(0, TOPOLOGY_PEER_MARKER_LIMIT)
  if (selectedPeer && !visible.some(item => item.activityId === selectedPeer.activityId)) {
    if (visible.length === TOPOLOGY_PEER_MARKER_LIMIT) visible[TOPOLOGY_PEER_MARKER_LIMIT - 1] = selectedPeer
    else visible.push(selectedPeer)
  }
  const step = PEER_MARKER_SPAN / (visible.length + 1)
  return visible.map((hint, slot) => ({
    activityId: hint.activityId,
    index: peers.findIndex(item => item.activityId === hint.activityId) + 1,
    x: TOPOLOGY_EDGE_MIDPOINT.auditStorage.x + (slot % 2 === 0 ? -PEER_MARKER_X_OFFSET : PEER_MARKER_X_OFFSET),
    y: PEER_MARKER_BASE_Y + step * (slot + 1),
  }))
}

export interface TopologyActivityPage<T> {
  page: number
  pageCount: number
  visibleActivities: T[]
}

export function topologyActivityPageCount(
  total: number,
  pageSize: number = TOPOLOGY_ACTIVITY_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function clampTopologyActivityPage(
  page: number,
  total: number,
  pageSize: number = TOPOLOGY_ACTIVITY_PAGE_SIZE,
): number {
  const pageCount = topologyActivityPageCount(total, pageSize)
  return Math.min(pageCount, Math.max(1, Math.floor(page)))
}

export function topologyActivityPageForSelection(
  activities: readonly { activityId: string }[],
  activityId: string | null | undefined,
  pageSize: number = TOPOLOGY_ACTIVITY_PAGE_SIZE,
): number | null {
  if (!activityId) return null
  const index = activities.findIndex(item => item.activityId === activityId)
  return index < 0 ? null : Math.floor(index / pageSize) + 1
}

export function projectTopologyActivityPage<T>(
  activities: readonly T[],
  requestedPage: number,
  pageSize: number = TOPOLOGY_ACTIVITY_PAGE_SIZE,
): TopologyActivityPage<T> {
  const pageCount = topologyActivityPageCount(activities.length, pageSize)
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage)))
  const start = (page - 1) * pageSize
  return {
    page,
    pageCount,
    visibleActivities: activities.slice(start, start + pageSize),
  }
}
