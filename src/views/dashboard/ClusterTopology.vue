<template>
  <section class="topology-panel" :aria-label="t('dashboard.topology')">
    <p v-if="error && nodes.length" class="topology-notice" role="status">
      {{ t('dashboard.topologyStale') }}
    </p>
    <p v-if="loading && !nodes.length" class="topology-state" role="status">
      {{ t('dashboard.topologyLoading') }}
    </p>
    <p v-else-if="error && !nodes.length" class="topology-state is-error" role="status">
      {{ t('common.requestFailed') }}
    </p>
    <p v-else-if="!nodes.length" class="topology-state" role="status">
      {{ t('dashboard.topologyNoNodes') }}
    </p>

    <template v-else>
      <p class="topology-note">{{ t('dashboard.topologyDetails.staticRelation') }}</p>

      <div class="topology-scroll">
        <svg
          class="topology-svg"
          :viewBox="`0 0 ${layout.width} ${layout.height}`"
          :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
          role="img"
          :aria-label="t('dashboard.topologyDetails.diagramDescription', { count: nodes.length })"
          focusable="false"
        >
          <defs>
            <marker
              :id="relationMarkerId"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path class="relation-head" d="M0,0 L7,3.5 L0,7 Z" />
            </marker>
            <marker
              :id="evidenceMarkerId"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path class="evidence-head" d="M0,0 L7,3.5 L0,7 Z" />
            </marker>
          </defs>

          <line
            v-for="edge in layout.relationEdges"
            :key="`relation-${edge.from}-${edge.to}`"
            class="topology-relation"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
            :marker-end="edge.directed ? `url(#${relationMarkerId})` : undefined"
          />

          <g v-for="panel in layout.panels" :key="`panel-${panel.group.key}`">
            <rect
              class="group-panel"
              :x="panel.x"
              :y="panel.y"
              :width="panel.width"
              :height="panel.height"
              rx="12"
            />
            <text class="group-header-label" :x="panel.x + 12" :y="panel.y + 19">
              {{ groupTitle(panel.group.key) }}
            </text>
            <text
              class="group-header-count"
              :x="panel.x + panel.width - 12"
              :y="panel.y + 19"
              text-anchor="end"
            >{{ panel.group.nodes.length }}</text>
          </g>

          <path
            v-if="layout.evidencePath"
            class="topology-evidence"
            :class="{
              'is-peer': evidence.selected?.kind === 'peerCorrelation',
              'is-undirected': evidence.selected?.relationDirection === 'undirected',
            }"
            :d="layout.evidencePath"
            :marker-end="evidence.selected?.relationDirection === 'directed' ? `url(#${evidenceMarkerId})` : undefined"
          />

          <g v-for="point in layout.points" :key="`${point.node.nodeId}-${point.node.nodeInstanceId ?? ''}`" class="topology-node">
            <title>{{ nodeTitle(point.node) }}</title>
            <rect
              class="topology-node-box"
              :class="[
                availabilityClass(point.node),
                { 'is-highlighted': highlightedIds.has(point.node.nodeId) },
              ]"
              :x="point.x"
              :y="point.y"
              :width="point.width"
              :height="point.height"
              rx="7"
            />
            <circle
              class="topology-node-dot"
              :class="availabilityClass(point.node)"
              :cx="point.x + 11"
              :cy="point.y + point.height / 2"
              r="3"
            />
            <text
              class="topology-node-label"
              :x="point.x + 20"
              :y="point.y + point.height / 2 + 3.5"
            >{{ shortNodeId(point.node.nodeId) }}</text>
          </g>
        </svg>
      </div>

      <div class="topology-legend">
        <span><i class="dot is-available" />{{ t('dashboard.available') }}</span>
        <span><i class="dot is-unavailable" />{{ t('dashboard.unavailable') }}</span>
        <span><i class="dot is-unknown" />{{ t('dashboard.stateUnknown') }}</span>
        <span><i class="line is-relation" />{{ t('dashboard.topologyDetails.legendRelation') }}</span>
        <span><i class="line is-evidence" />{{ t('dashboard.topologyDetails.legendEvidence') }}</span>
      </div>

      <div class="evidence-panel">
        <div class="evidence-heading">
          <span>{{ t('dashboard.topologyDetails.evidenceTitle') }}</span>
          <span v-if="evidence.projectionJobId" class="evidence-job mono">{{ evidence.projectionJobId }}</span>
        </div>

        <p v-if="!activityProjection" class="topology-state">{{ t('dashboard.topologyDetails.noScope') }}</p>
        <p v-else-if="activityLoading" class="topology-state" role="status">{{ t('dashboard.topologyDetails.evidenceLoading') }}</p>
        <p v-else-if="!activityScope" class="topology-state" role="status">{{ t('dashboard.topologyDetails.noScope') }}</p>
        <p v-else-if="!evidence.scopeMatched" class="topology-state is-error" role="status">{{ t('dashboard.topologyDetails.scopeMismatch') }}</p>
        <template v-else>
          <p v-if="activityError && evidence.activities.length" class="topology-state is-error" role="status">
            {{ t('dashboard.topologyDetails.evidenceError') }}
          </p>
          <p v-if="!evidence.activities.length" class="topology-state" role="status">
            {{ activityError ? t('dashboard.topologyDetails.evidenceError') : t('execution.topology.noEvidence') }}
          </p>
          <template v-else>
            <span class="evidence-prompt">{{ t('execution.topology.selectActivity') }}</span>
            <ul class="evidence-list">
              <li v-for="activity in visibleActivities" :key="activity.activityId">
                <button
                  type="button"
                  class="evidence-button"
                  :class="{ selected: activity.activityId === selectedActivityId }"
                  :aria-pressed="activity.activityId === selectedActivityId"
                  @click="toggleActivity(activity.activityId)"
                >
                  <span class="evidence-kind">{{ kindLabel(activity.kind) }}</span>
                  <span class="evidence-path mono">{{ activityPath(activity) }}</span>
                  <span class="evidence-id mono">{{ activity.activityId }}</span>
                </button>
              </li>
            </ul>
            <nav
              v-if="evidence.activities.length > ACTIVITY_PAGE_SIZE"
              class="evidence-pagination"
              :aria-label="t('execution.pagination.navigation')"
            >
              <button
                type="button"
                class="text-button"
                :disabled="activityPage <= 1"
                @click="activityPage -= 1"
              >
                {{ t('execution.pagination.previous') }}
              </button>
              <span class="pagination-status" aria-live="polite">
                {{ t('execution.pagination.status', {
                  page: activityPage,
                  pages: activityPageCount,
                  count: evidence.activities.length,
                }) }}
              </span>
              <button
                type="button"
                class="text-button"
                :disabled="activityPage >= activityPageCount"
                @click="activityPage += 1"
              >
                {{ t('execution.pagination.next') }}
              </button>
            </nav>
          </template>

          <p v-if="evidence.selectedMissing" class="topology-state is-error" role="status">
            {{ t('dashboard.topologyDetails.selectedMissing') }}
          </p>
          <div v-else-if="evidence.selected" class="selected-evidence" role="status" aria-live="polite">
            <span class="selected-kind">{{ kindLabel(evidence.selected.kind) }}</span>
            <dl class="selected-fields">
              <div v-for="field in selectedFields" :key="field.key" class="selected-field">
                <dt class="field-label mono">{{ field.key }}</dt>
                <dd class="field-value mono">{{ field.value }}</dd>
              </div>
            </dl>
            <p v-if="evidence.selected.missingNodeIds.length" class="topology-state is-error">
              {{ t('dashboard.topologyDetails.missingNodes', { ids: evidence.selected.missingNodeIds.join(', ') }) }}
            </p>
          </div>
        </template>
      </div>

      <details class="node-roster">
        <summary>{{ t('dashboard.topologyDetails.roster') }}</summary>
        <div v-for="group in groups" :key="`roster-${group.key}`" class="roster-group">
          <div class="roster-group-title">
            <span>{{ groupTitle(group.key) }}</span>
            <span class="mono">{{ group.nodes.length }}</span>
          </div>
          <ul>
            <li
              v-for="node in visibleRosterNodes(group)"
              :key="`roster-${node.nodeId}-${node.nodeInstanceId ?? ''}`"
              class="roster-item"
              :class="{ 'is-highlighted': highlightedIds.has(node.nodeId) }"
            >
              <span class="roster-id mono">{{ node.nodeId }}</span>
              <span class="roster-role">{{ node.role || t('dashboard.stateUnknown') }}</span>
              <span class="roster-state" :class="availabilityClass(node)">
                {{ availabilityLabel(node) }}
              </span>
            </li>
          </ul>
          <nav
            v-if="group.nodes.length > NODE_ROSTER_PAGE_SIZE"
            class="evidence-pagination roster-pagination"
            :aria-label="t('execution.pagination.navigation')"
          >
            <button
              type="button"
              class="text-button"
              :disabled="rosterPage(group) <= 1"
              @click="shiftRosterPage(group, -1)"
            >
              {{ t('execution.pagination.previous') }}
            </button>
            <span class="pagination-status">
              {{ t('execution.pagination.status', {
                page: rosterPage(group),
                pages: rosterPageCount(group),
                count: group.nodes.length,
              }) }}
            </span>
            <button
              type="button"
              class="text-button"
              :disabled="rosterPage(group) >= rosterPageCount(group)"
              @click="shiftRosterPage(group, 1)"
            >
              {{ t('execution.pagination.next') }}
            </button>
          </nav>
        </div>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import type { NodeSummary } from '@/api/system'
import {
  groupNodesByRole,
  projectNodeEvidence,
  type NodeEvidenceKind,
  type NodeRoleGroup,
  type NodeRoleGroupKey,
  type SelectedNodeEvidence,
} from './nodeTopologyModel'
import type {
  ExecutionCommunicationActivity,
  ExecutionCommunicationProjection,
} from '@/features/execution/data/executionCommunication'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  nodes: readonly NodeSummary[]
  loading: boolean
  error: boolean
  activityProjection?: ExecutionCommunicationProjection | null
  activityScope?: string | null
  activityLoading?: boolean
  activityError?: boolean
  selectedActivityId?: string | null
}>(), {
  activityProjection: null,
  activityScope: null,
  activityLoading: false,
  activityError: false,
  selectedActivityId: null,
})

const emit = defineEmits<{
  (event: 'select-activity', activityId: string | null): void
}>()

const { t } = useI18n()
const relationMarkerId = `dashboard-relation-arrow-${useId()}`
const evidenceMarkerId = `dashboard-evidence-arrow-${useId()}`

/**
 * Stable triangle: Admin panel on top, Audit bottom-left, Storage bottom-right.
 * Unknown roles get their own full-width row so every catalog node has a slot.
 */
const PANEL_WIDTH = 196
const PANEL_GAP = 22
const PADDING = 14
const ROW_GAP = 44
const PANEL_HEADER_HEIGHT = 30
const NODE_HEIGHT = 26
const NODE_GAP = 6
const NODE_INSET = 10
const PANEL_BOTTOM_PADDING = 12
const UNKNOWN_ROW_GAP = 16

const GROUP_LABEL_KEY: Record<NodeRoleGroupKey, string> = {
  Admin: 'execution.topology.admin',
  Audit: 'execution.topology.audit',
  Storage: 'execution.topology.storage',
  unknown: 'dashboard.topologyDetails.otherRoles',
}
const ACTIVITY_PAGE_SIZE = 50
const NODE_ROSTER_PAGE_SIZE = 50
const activityPage = ref(1)

const evidence = computed(() => projectNodeEvidence(
  props.activityProjection,
  props.nodes,
  props.selectedActivityId,
  props.activityScope,
))

const activityPageCount = computed(() =>
  Math.max(1, Math.ceil(evidence.value.activities.length / ACTIVITY_PAGE_SIZE)),
)
const visibleActivities = computed(() => {
  const start = (activityPage.value - 1) * ACTIVITY_PAGE_SIZE
  return evidence.value.activities.slice(start, start + ACTIVITY_PAGE_SIZE)
})

watch(() => evidence.value.activities.length, () => {
  if (activityPage.value > activityPageCount.value) activityPage.value = activityPageCount.value
})
watch(() => props.activityScope, () => {
  activityPage.value = 1
})
watch(() => props.selectedActivityId, (activityId) => {
  if (!activityId) return
  const index = evidence.value.activities.findIndex(item => item.activityId === activityId)
  if (index >= 0) activityPage.value = Math.floor(index / ACTIVITY_PAGE_SIZE) + 1
}, { immediate: true })
const highlightedIds = computed(() => new Set(evidence.value.selected?.matchedNodeIds ?? []))

// Every registered node is drawn; tall panels scroll inside the canvas instead
// of silently dropping the tail of a large role.
const groups = computed(() => groupNodesByRole(props.nodes, {
  maxPerGroup: Math.max(1, props.nodes.length),
  keepNodeIds: highlightedIds.value,
}).filter(group => group.nodes.length > 0))
const rosterPages = reactive(new Map<NodeRoleGroupKey, number>())

function rosterPageCount(group: NodeRoleGroup): number {
  return Math.max(1, Math.ceil(group.nodes.length / NODE_ROSTER_PAGE_SIZE))
}

function rosterPage(group: NodeRoleGroup): number {
  return Math.min(rosterPages.get(group.key) ?? 1, rosterPageCount(group))
}

function visibleRosterNodes(group: NodeRoleGroup): readonly NodeSummary[] {
  const start = (rosterPage(group) - 1) * NODE_ROSTER_PAGE_SIZE
  return group.nodes.slice(start, start + NODE_ROSTER_PAGE_SIZE)
}

function shiftRosterPage(group: NodeRoleGroup, delta: -1 | 1): void {
  const next = Math.min(rosterPageCount(group), Math.max(1, rosterPage(group) + delta))
  rosterPages.set(group.key, next)
}

watch(
  [() => evidence.value.selected?.activityId, () => props.nodes],
  () => {
    const ids = new Set(evidence.value.selected?.matchedNodeIds ?? [])
    for (const group of groups.value) {
      const index = group.nodes.findIndex(node => ids.has(node.nodeId))
      if (index >= 0) rosterPages.set(group.key, Math.floor(index / NODE_ROSTER_PAGE_SIZE) + 1)
    }
  },
)

interface NodePoint {
  node: NodeSummary
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
}

interface GroupPanel {
  group: NodeRoleGroup
  x: number
  y: number
  width: number
  height: number
}

interface RelationEdge {
  from: NodeRoleGroupKey
  to: NodeRoleGroupKey
  x1: number
  y1: number
  x2: number
  y2: number
  /** Static architecture relation; false renders an undirected peer edge. */
  directed: boolean
}

interface EvidenceEndpoints {
  sourceNodeId: string
  targetNodeId: string
}

/**
 * Endpoints of the selected relation. Directed evidence keeps its from/to
 * nodes; an undirected peer hint may only fall back to the persisted link
 * endpoints, which is an association rather than a packet direction.
 */
function selectedEndpoints(
  selected: SelectedNodeEvidence | null,
  activities: readonly ExecutionCommunicationActivity[],
): EvidenceEndpoints | null {
  if (!selected?.drawableRelation) return null
  if (selected.sourceNodeId && selected.targetNodeId) {
    return { sourceNodeId: selected.sourceNodeId, targetNodeId: selected.targetNodeId }
  }
  const activity = activities.find(item => item.activityId === selected.activityId)
  if (activity?.kind !== 'peerCorrelation') return null
  return { sourceNodeId: activity.originNodeId, targetNodeId: activity.nodeId }
}

/** Route along the wider gap: stacked boxes connect vertically, side-by-side ones horizontally. */
function connectorPath(source: NodePoint, target: NodePoint): string {
  const gapX = Math.max(
    source.x - (target.x + target.width),
    target.x - (source.x + source.width),
    0,
  )
  const gapY = Math.max(
    source.y - (target.y + target.height),
    target.y - (source.y + source.height),
    0,
  )
  if (gapY > gapX) {
    const downward = target.centerY > source.centerY
    const startY = downward ? source.y + source.height : source.y
    const endY = downward ? target.y : target.y + target.height
    const middle = (startY + endY) / 2
    return `M ${source.centerX} ${startY} C ${source.centerX} ${middle}, ${target.centerX} ${middle}, ${target.centerX} ${endY}`
  }
  const forward = source.centerX < target.centerX
  const startX = forward ? source.x + source.width : source.x
  const endX = forward ? target.x : target.x + target.width
  const middle = (startX + endX) / 2
  return `M ${startX} ${source.centerY} C ${middle} ${source.centerY}, ${middle} ${target.centerY}, ${endX} ${target.centerY}`
}

const layout = computed(() => {
  const byKey = new Map(groups.value.map(group => [group.key, group] as const))
  const width = PADDING * 2 + PANEL_WIDTH * 3 + PANEL_GAP * 2
  const panels: GroupPanel[] = []
  const points: NodePoint[] = []
  const relationEdges: RelationEdge[] = []
  let cursorY = PADDING
  let bottom = PADDING

  /** One role panel: header row plus every drawn node of that role, stacked vertically. */
  function addPanel(group: NodeRoleGroup, x: number, y: number, panelWidth = PANEL_WIDTH): GroupPanel {
    const nodeWidth = panelWidth - NODE_INSET * 2
    const visible = group.visibleNodes
    const height = PANEL_HEADER_HEIGHT + visible.length * NODE_HEIGHT
      + Math.max(0, visible.length - 1) * NODE_GAP + PANEL_BOTTOM_PADDING
    const panel: GroupPanel = { group, x, y, width: panelWidth, height }
    panels.push(panel)
    bottom = Math.max(bottom, y + height)
    visible.forEach((node, index) => {
      const nodeX = x + NODE_INSET
      const nodeY = y + PANEL_HEADER_HEIGHT + index * (NODE_HEIGHT + NODE_GAP)
      points.push({
        node,
        x: nodeX,
        y: nodeY,
        width: nodeWidth,
        height: NODE_HEIGHT,
        centerX: nodeX + nodeWidth / 2,
        centerY: nodeY + NODE_HEIGHT / 2,
      })
    })
    return panel
  }

  const adminGroup = byKey.get('Admin')
  let adminPanel: GroupPanel | null = null
  if (adminGroup) {
    adminPanel = addPanel(adminGroup, PADDING + PANEL_WIDTH + PANEL_GAP, cursorY)
    cursorY = adminPanel.y + adminPanel.height + ROW_GAP
  }

  const peerGroups = (['Audit', 'Storage'] as const)
    .map(key => byKey.get(key))
    .filter((group): group is NodeRoleGroup => Boolean(group))
  if (peerGroups.length > 0) {
    let rowBottom = cursorY
    peerGroups.forEach((group, index) => {
      // Audit takes the left column, Storage the right; a lone peer keeps the centre.
      const slot = peerGroups.length === 1 ? 1 : index * 2
      const panel = addPanel(group, PADDING + slot * (PANEL_WIDTH + PANEL_GAP), cursorY)
      rowBottom = Math.max(rowBottom, panel.y + panel.height)
      if (adminPanel) {
        relationEdges.push({
          from: 'Admin',
          to: group.key,
          x1: adminPanel.x + adminPanel.width / 2,
          y1: adminPanel.y + adminPanel.height,
          x2: panel.x + panel.width / 2,
          y2: panel.y,
          directed: true,
        })
      }
    })
    const auditPanel = panels.find(panel => panel.group.key === 'Audit')
    const storagePanel = panels.find(panel => panel.group.key === 'Storage')
    if (auditPanel && storagePanel) {
      relationEdges.push({
        from: 'Audit',
        to: 'Storage',
        x1: auditPanel.x + auditPanel.width,
        y1: auditPanel.y + auditPanel.height / 2,
        x2: storagePanel.x,
        y2: storagePanel.y + storagePanel.height / 2,
        directed: false,
      })
    }
    cursorY = rowBottom + UNKNOWN_ROW_GAP
  }

  const unknownGroup = byKey.get('unknown')
  if (unknownGroup) {
    addPanel(unknownGroup, PADDING, cursorY, width - PADDING * 2)
  }

  const selected = evidence.value.selected
  const endpoints = selectedEndpoints(selected, evidence.value.activities)
  const source = endpoints
    ? points.find(point => point.node.nodeId === endpoints.sourceNodeId)
    : undefined
  const target = endpoints
    ? points.find(point => point.node.nodeId === endpoints.targetNodeId)
    : undefined
  const evidencePath = endpoints && source && target
    ? connectorPath(source, target)
    : null

  return {
    panels,
    points,
    relationEdges,
    evidencePath,
    width,
    height: bottom + PADDING,
  }
})

const KIND_LABEL_KEY: Record<NodeEvidenceKind, string> = {
  confirmedPacket: 'execution.topology.confirmedPacket',
  peerCorrelation: 'execution.topology.peerCorrelation',
  localStage: 'execution.topology.localStage',
}

const selectedFields = computed(() => {
  const selected = evidence.value.selected
  if (!selected) return []
  const fields: { key: string; value: string }[] = []
  if (selected.sourceNodeId) fields.push({ key: t('dashboard.topologyDetails.source'), value: selected.sourceNodeId })
  if (selected.targetNodeId) fields.push({ key: t('dashboard.topologyDetails.target'), value: selected.targetNodeId })
  if (selected.packetId) fields.push({ key: t('dashboard.topologyDetails.packetId'), value: selected.packetId })
  const activity = evidence.value.activities.find(item => item.activityId === selected.activityId)
  if (activity?.kind === 'confirmedPacket') {
    fields.push({ key: t('dashboard.topologyDetails.eventType'), value: activity.messageType })
    fields.push({ key: t('dashboard.topologyDetails.requestId'), value: activity.requestId ?? t('execution.notAvailable') })
  } else if (activity?.kind === 'peerCorrelation') {
    fields.push({ key: t('dashboard.topologyDetails.linkKind'), value: activity.linkKind })
    fields.push({
      key: t('dashboard.topologyDetails.requestId'),
      value: activity.requestId ?? t('execution.notAvailable'),
    })
  } else if (activity?.kind === 'localStage') {
    fields.push({ key: t('dashboard.topologyDetails.eventType'), value: activity.eventType })
    fields.push({ key: t('dashboard.topologyDetails.component'), value: activity.component })
  }
  return fields
})

function kindLabel(kind: NodeEvidenceKind): string {
  return t(KIND_LABEL_KEY[kind])
}

function groupTitle(key: NodeRoleGroupKey): string {
  return t(GROUP_LABEL_KEY[key])
}

function availabilityClass(node: NodeSummary): string {
  if (node.isAvailable === true) return 'is-available'
  if (node.isAvailable === false) return 'is-unavailable'
  return 'is-unknown'
}

function availabilityLabel(node: NodeSummary): string {
  return node.isAvailable === true
    ? t('dashboard.available')
    : node.isAvailable === false
      ? t('dashboard.unavailable')
      : t('dashboard.stateUnknown')
}

function shortNodeId(nodeId: string): string {
  // Fits the 176 px node box at 10 px monospace; the tooltip keeps the exact id.
  return nodeId.length > 24 ? `${nodeId.slice(0, 23)}…` : nodeId
}

function nodeTitle(node: NodeSummary): string {
  const role = typeof node.role === 'string' && node.role.length > 0 ? node.role : t('dashboard.stateUnknown')
  return `${node.nodeId} · ${role} · ${availabilityLabel(node)}`
}

function activityPath(activity: ExecutionCommunicationActivity): string {
  if (activity.kind === 'localStage') return `${activity.component} · ${activity.nodeId}`
  if (activity.kind === 'peerCorrelation') {
    // Without a matched stage fact the hint stays an origin ↔ node association.
    return activity.direction
      ? `${activity.direction.fromNodeId} → ${activity.direction.toNodeId}`
      : `${activity.originNodeId} ↔ ${activity.nodeId}`
  }
  return `${activity.fromNodeId} → ${activity.toNodeId}`
}

function toggleActivity(activityId: string): void {
  emit('select-activity', activityId === props.selectedActivityId ? null : activityId)
}
</script>

<style scoped>
.topology-panel { min-width: 0; }
.topology-notice,
.topology-state { margin: 8px 0 0; color: var(--apple-gray-3); font-size: 11px; }
.topology-notice { color: var(--apple-orange); }
.topology-state.is-error { color: var(--apple-red); }
.topology-note { margin: 6px 0 0; color: var(--apple-gray-4); font-size: 10px; }
.mono { font-family: var(--apple-font-mono); }

.topology-scroll { max-height: 380px; margin-top: 8px; overflow: auto; border-radius: 10px; }
.topology-svg { display: block; max-width: none; }

.topology-relation { stroke: var(--apple-gray-5); stroke-width: 1.1; stroke-dasharray: 4 4; }
.relation-head { fill: var(--apple-gray-5); }

.group-panel { fill: color-mix(in srgb, var(--apple-gray-6) 30%, var(--apple-card)); stroke: var(--apple-gray-6); stroke-width: 1; }
.group-header-label { fill: var(--apple-gray-2); font-size: 10.5px; font-weight: 650; letter-spacing: 0.02em; }
.group-header-count { fill: var(--apple-gray-3); font-size: 10px; font-variant-numeric: tabular-nums; }

.topology-node-box { fill: var(--apple-card); stroke: var(--apple-gray-5); stroke-width: 1.2; }
.topology-node-box.is-available { stroke: var(--apple-green); }
.topology-node-box.is-unavailable { stroke: var(--apple-red); }
.topology-node-box.is-unknown { stroke: var(--apple-gray-4); }
.topology-node-box.is-highlighted { stroke: var(--apple-blue); stroke-width: 2; fill: color-mix(in srgb, var(--apple-blue) 10%, var(--apple-card)); }
.topology-node-dot { stroke: none; }
.topology-node-dot.is-available { fill: var(--apple-green); }
.topology-node-dot.is-unavailable { fill: var(--apple-red); }
.topology-node-dot.is-unknown { fill: var(--apple-gray-4); }
.topology-node-label { fill: var(--apple-gray-1); font-size: 10px; font-family: var(--apple-font-mono); }

.topology-evidence { fill: none; stroke: var(--apple-blue); stroke-width: 2; }
/* Unmatched peer hints keep their dashed association and carry no arrowhead. */
.topology-evidence.is-peer,
.topology-evidence.is-undirected { stroke-dasharray: 6 4; }
.evidence-head { fill: var(--apple-blue); }

.topology-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; color: var(--apple-gray-4); font-size: 10px; }
.topology-legend span { display: inline-flex; align-items: center; gap: 5px; }
.topology-legend .dot { width: 6px; height: 6px; border-radius: 50%; }
.topology-legend .dot.is-available { background: var(--apple-green); }
.topology-legend .dot.is-unavailable { background: var(--apple-red); }
.topology-legend .dot.is-unknown { background: var(--apple-gray-4); }
.topology-legend .line { width: 14px; height: 0; border-top: 1px solid var(--apple-gray-5); }
.topology-legend .line.is-relation { border-top-style: dashed; }
.topology-legend .line.is-evidence { border-top: 2px solid var(--apple-blue); }

.evidence-panel { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--apple-gray-6); }
.evidence-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--apple-gray-2); font-size: 11px; font-weight: 650; }
.evidence-job { color: var(--apple-gray-4); font-size: 10px; font-weight: 500; overflow-wrap: anywhere; text-align: right; }
.evidence-prompt { display: block; margin-top: 8px; color: var(--apple-gray-4); font-size: 10px; }
.evidence-list { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 0; padding: 0; list-style: none; max-height: 170px; overflow: auto; }
.evidence-button { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; width: 100%; padding: 6px 8px; border: 1px solid var(--apple-gray-6); border-radius: 8px; background: var(--apple-card); color: var(--apple-gray-2); font: inherit; font-size: 10px; text-align: left; cursor: pointer; }
.evidence-button:hover { border-color: var(--apple-gray-4); }
.evidence-button:focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 1px; }
.evidence-button.selected { border-color: var(--apple-blue); background: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card)); }
.evidence-kind { color: var(--apple-gray-1); font-weight: 600; }
.evidence-path { color: var(--apple-gray-3); overflow-wrap: anywhere; }
.evidence-id { grid-column: 1 / -1; color: var(--apple-gray-4); font-size: 9px; overflow-wrap: anywhere; }

.selected-evidence { margin-top: 8px; padding: 8px; border: 1px solid var(--apple-gray-6); border-radius: 8px; }
.selected-kind { color: var(--apple-blue); font-size: 10px; font-weight: 650; }
.selected-fields { display: grid; gap: 3px; margin: 6px 0 0; }
.selected-field { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 8px; }
.field-label { color: var(--apple-gray-4); font-size: 9.5px; }
.field-value { margin: 0; color: var(--apple-gray-2); font-size: 10px; overflow-wrap: anywhere; }

.node-roster { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--apple-gray-6); color: var(--apple-gray-3); font-size: 10px; }
.node-roster summary { cursor: pointer; color: var(--apple-gray-2); font-weight: 600; }
.node-roster summary:focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 2px; }
.roster-group { margin-top: 8px; }
.roster-group-title { display: flex; align-items: center; justify-content: space-between; color: var(--apple-gray-4); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.roster-group ul { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; }
.roster-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 3px 6px; border-radius: 6px; }
.roster-item.is-highlighted { background: color-mix(in srgb, var(--apple-blue) 10%, transparent); }
.roster-id { color: var(--apple-gray-2); overflow-wrap: anywhere; }
.roster-role { color: var(--apple-gray-4); }
.roster-state.is-available { color: var(--apple-green); }
.roster-state.is-unavailable { color: var(--apple-red); }
.roster-state.is-unknown { color: var(--apple-gray-4); }

@media (max-width: 640px) {
  .topology-scroll { max-height: 260px; }
  .selected-field { grid-template-columns: 80px minmax(0, 1fr); }
}
.evidence-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}

.pagination-status {
  color: var(--apple-gray-3);
  font-size: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.text-button {
  padding: 4px 6px;
  color: var(--apple-blue);
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.text-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.text-button:disabled {
  color: var(--apple-gray-4);
  cursor: not-allowed;
}
</style>
