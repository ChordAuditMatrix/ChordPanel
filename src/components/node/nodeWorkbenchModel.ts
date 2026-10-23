import type { NodeSummary } from '@/api/system'
import type { PageResponse } from '@/api/pagination'
import { KNOWN_NODE_ROLES, isKnownNodeRole, type KnownNodeRole } from '@/views/dashboard/nodeTopologyModel'
import type { NodeDetail } from './types'

/**
 * Directory-level projections for the node workbench.
 *
 * Everything here is derived from the flat `GET /api/v1/nodes` summary. The
 * summary does not carry capacity, task lists or history, so this module never
 * invents them; per-node facts come from the on-demand detail route.
 */

/** Validate one page of `GET /api/v1/nodes` without dropping malformed rows. */
export function parseNodeSummaryPage(value: unknown, fallbackPageSize = 1000): PageResponse<NodeSummary> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !('items' in value) || !Array.isArray(value.items)) {
    throw new TypeError('Invalid node list response')
  }
  const rawItems: unknown[] = value.items
  const items = rawItems.filter((item): item is NodeSummary =>
    item !== null && typeof item === 'object' && 'nodeId' in item && typeof item.nodeId === 'string')
  if (items.length !== rawItems.length) throw new TypeError('Invalid node summary')
  return {
    items,
    total: 'total' in value && typeof value.total === 'number' ? value.total : items.length,
    page: 'page' in value && typeof value.page === 'number' ? value.page : 1,
    pageSize: 'pageSize' in value && typeof value.pageSize === 'number' ? value.pageSize : fallbackPageSize,
    totalPages: 'totalPages' in value && typeof value.totalPages === 'number' ? value.totalPages : 0,
  }
}

/** Availability verdict of the backend: true/false are facts, absent is unknown. */
export type NodeAvailability = 'available' | 'offline' | 'unknown'

export type NodeRoleFilter = 'all' | KnownNodeRole | 'other'

/** Backend-documented `runtimeState.state` values, in presentation order. */
export const NODE_STATE_ORDER = ['Idle', 'BusyAccepting', 'BusyDraining', 'Unavailable', 'Other'] as const

const NODE_STATE_KEYS: Record<string, string> = {
  Idle: 'node.workbench.state.idle',
  BusyAccepting: 'node.workbench.state.busyAccepting',
  BusyDraining: 'node.workbench.state.busyDraining',
  Unavailable: 'node.workbench.state.unavailable',
  Other: 'node.workbench.state.other',
}

/** Translation key for a documented state; null for a value this UI cannot name. */
export function nodeStateKey(state: unknown): string | null {
  return typeof state === 'string' ? NODE_STATE_KEYS[state] ?? null : null
}

export function classifyNodeAvailability(node: Pick<NodeSummary, 'isAvailable'> | null | undefined): NodeAvailability {
  if (node?.isAvailable === true) return 'available'
  if (node?.isAvailable === false) return 'offline'
  return 'unknown'
}

/** Unknown role strings stay distinguishable from the three documented roles. */
export function nodeRoleGroupKey(role: unknown): KnownNodeRole | 'other' {
  return isKnownNodeRole(role) ? role : 'other'
}

export interface NodeAvailabilityCounts {
  total: number
  available: number
  offline: number
  unknown: number
}

export interface NodeRoleAggregate extends NodeAvailabilityCounts {
  key: KnownNodeRole | 'other'
}

export interface NodeDirectoryAggregate extends NodeAvailabilityCounts {
  /** Nodes whose reported state is `BusyDraining`; unknown states are not counted. */
  draining: number
  roles: NodeRoleAggregate[]
}

function addAvailability(counts: NodeAvailabilityCounts, availability: NodeAvailability): void {
  counts.total += 1
  counts[availability] += 1
}

const EMPTY_COUNTS: NodeAvailabilityCounts = { total: 0, available: 0, offline: 0, unknown: 0 }

export function aggregateNodeDirectory(nodes: readonly NodeSummary[]): NodeDirectoryAggregate {
  const roles: NodeRoleAggregate[] = [...KNOWN_NODE_ROLES.map(role => ({ key: role, ...EMPTY_COUNTS })), { key: 'other', ...EMPTY_COUNTS }]
  const roleIndex = new Map(roles.map(entry => [entry.key, entry]))
  const aggregate: NodeDirectoryAggregate = { ...EMPTY_COUNTS, draining: 0, roles }
  for (const node of nodes) {
    const availability = classifyNodeAvailability(node)
    addAvailability(aggregate, availability)
    const role = roleIndex.get(nodeRoleGroupKey(node.role))
    if (role) addAvailability(role, availability)
    if (node.state === 'BusyDraining') aggregate.draining += 1
  }
  return aggregate
}

/** Distinct state values present in the directory, documented values first. */
export function collectNodeStates(nodes: readonly NodeSummary[]): string[] {
  const seen = new Set<string>()
  for (const node of nodes) {
    if (typeof node.state === 'string' && node.state.trim() !== '') seen.add(node.state)
  }
  const documented = NODE_STATE_ORDER.filter(state => seen.has(state))
  const remaining = [...seen].filter(state => !(NODE_STATE_ORDER as readonly string[]).includes(state)).sort()
  return [...documented, ...remaining]
}

export interface NodeDirectoryFilters {
  role?: NodeRoleFilter
  availability?: NodeAvailability | 'all'
  state?: string | 'all'
  query?: string
}

function normalizedQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function filterNodeDirectory(nodes: readonly NodeSummary[], filters: NodeDirectoryFilters = {}): NodeSummary[] {
  const role = filters.role ?? 'all'
  const availability = filters.availability ?? 'all'
  const state = filters.state ?? 'all'
  const query = normalizedQuery(filters.query)
  return nodes.filter(node => {
    if (role !== 'all' && nodeRoleGroupKey(node.role) !== role) return false
    if (availability !== 'all' && classifyNodeAvailability(node) !== availability) return false
    if (state !== 'all' && node.state !== state) return false
    if (query !== '') {
      const nodeId = normalizedQuery(node.nodeId)
      const instanceId = normalizedQuery(node.nodeInstanceId)
      if (!nodeId.includes(query) && !instanceId.includes(query)) return false
    }
    return true
  })
}

const ROLE_RANK: Record<KnownNodeRole | 'other', number> = { Admin: 0, Audit: 1, Storage: 2, other: 3 }

function compareIdentities(a: NodeSummary, b: NodeSummary): number {
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1
  const left = a.nodeInstanceId ?? ''
  const right = b.nodeInstanceId ?? ''
  return left === right ? 0 : left < right ? -1 : 1
}

/** Stable role-then-identity order so the directory never depends on response order. */
export function sortNodeDirectory(nodes: readonly NodeSummary[]): NodeSummary[] {
  return [...nodes].sort((a, b) => {
    const roleDelta = ROLE_RANK[nodeRoleGroupKey(a.role)] - ROLE_RANK[nodeRoleGroupKey(b.role)]
    return roleDelta !== 0 ? roleDelta : compareIdentities(a, b)
  })
}

export interface NodeDirectoryPage {
  /** Clamped page actually rendered. */
  page: number
  pageSize: number
  pageCount: number
  total: number
  items: NodeSummary[]
}

export function paginateNodeDirectory(
  nodes: readonly NodeSummary[],
  page: number,
  pageSize: number,
): NodeDirectoryPage {
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 20
  const total = nodes.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const requested = Number.isFinite(page) ? Math.floor(page) : 1
  const safePage = Math.min(Math.max(1, requested), pageCount)
  const start = (safePage - 1) * size
  return { page: safePage, pageSize: size, pageCount, total, items: nodes.slice(start, start + size) }
}

/** Distinct Job IDs proven by the node detail's task assignments. */
export interface NodeJobLink {
  jobId: string
  taskCount: number
}

export function collectNodeJobLinks(tasks: readonly { jobId?: string }[] | undefined): NodeJobLink[] {
  const counts = new Map<string, number>()
  for (const task of tasks ?? []) {
    if (!task.jobId) continue
    counts.set(task.jobId, (counts.get(task.jobId) ?? 0) + 1)
  }
  return [...counts].map(([jobId, taskCount]) => ({ jobId, taskCount }))
}

/** Exact navigations derived from a node task's explicit Job ID. */
export function nodeJobNavigationRoutes(jobId: string) {
  return {
    job: { name: 'jobs', query: { jobId } } as const,
    execution: { name: 'executionDetail', params: { jobId } } as const,
  }
}

/** Result surfaced after an accepted (202) drain/resume request or a forward failure. */
export type NodeOperationNotice = 'drainRequested' | 'resumeRequested' | 'drainFailed' | 'resumeFailed'

export interface NodeOperationGuard {
  canDrain: boolean
  canResume: boolean
  /** True when the state string is not one this UI can name. */
  stateUnknown: boolean
}

/**
 * Preserve the documented drain/resume runtime guard: drain is offered unless
 * the node reports `BusyDraining`; resume is offered only while draining. The
 * backend accepts the request and forwards it asynchronously, so availability
 * (offline/unknown) does not by itself hide the operations.
 */
export function nodeOperationGuard(node: Pick<NodeDetail, 'runtimeState'> | null | undefined): NodeOperationGuard {
  const state = node?.runtimeState?.state
  const draining = state === 'BusyDraining'
  return {
    canDrain: !draining,
    canResume: draining,
    stateUnknown: state === undefined || state === '',
  }
}
