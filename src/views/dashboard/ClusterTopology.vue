<template>
  <section ref="topologyPanel" class="topology-panel" :aria-label="t('dashboard.topology')">
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

    <div class="topology-body">
      <p class="topology-note">{{ t('dashboard.topologyDetails.staticRelation') }}</p>
      <p class="topology-note control-plane-note" role="status">
        <span>{{ t('dashboard.topologyDetails.adminControlPlaneStatus', { state: adminControlPlaneStateLabel }) }}</span>
        <span v-if="adminConfiguredId" class="admin-configured-id">
          <span>{{ t(adminIdentityStale ? 'dashboard.topologyDetails.adminIdStale' : 'dashboard.topologyDetails.configuredAdminId') }}</span>
          <code :title="adminConfiguredId">{{ adminConfiguredId }}</code>
          <span class="admin-id-source">{{ t('dashboard.topologyDetails.adminIdSource') }}</span>
        </span>
      </p>

      <div class="topology-scroll">
        <svg
          class="topology-svg"
          :viewBox="`0 0 ${layout.width} ${layout.height}`"
          preserveAspectRatio="xMidYMid meet"
          :style="{ maxWidth: `${layout.width}px` }"
          role="img"
          :aria-label="t('dashboard.topologyDetails.diagramDescription', { count: nodes.length })"
          focusable="false"
        >
          <defs>
            <marker
              :id="relationMarkerId"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path class="relation-head" d="M0,0 L8,4 L0,8 Z" />
            </marker>
            <marker
              :id="evidenceMarkerId"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path class="evidence-head" d="M0,0 L8,4 L0,8 Z" />
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
            <g
              v-if="panel.group.key === 'Admin' && panel.group.nodes.length === 0"
              class="topology-anchor"
            >
              <title>{{ anchorTitle }}</title>
              <rect
                class="topology-node-box topology-anchor-box"
                :class="[`is-${adminControlPlaneState}`, { 'is-highlighted': anchorSenderId !== null }]"
                :x="panel.x + NODE_INSET"
                :y="panel.y + PANEL_HEADER_HEIGHT + 4"
                :width="panel.width - NODE_INSET * 2"
                :height="ADMIN_ANCHOR_HEIGHT"
                rx="7"
              />
              <circle
                class="topology-node-dot"
                :class="`is-${adminControlPlaneState}`"
                :cx="panel.x + NODE_INSET + 10"
                :cy="panel.y + PANEL_HEADER_HEIGHT + 14"
                r="3"
              />
              <text
                class="topology-placeholder-label"
                :x="panel.x + NODE_INSET + 20"
                :y="panel.y + PANEL_HEADER_HEIGHT + 18"
              >{{ t('dashboard.topologyDetails.adminControlPlane') }}</text>
              <text
                class="topology-placeholder-detail"
                :class="{ 'is-node-id': anchorSenderId !== null }"
                :x="panel.x + NODE_INSET + 20"
                :y="panel.y + PANEL_HEADER_HEIGHT + 31"
              >{{ anchorIdentityLabel }}</text>
              <text
                class="topology-placeholder-detail"
                :x="panel.x + NODE_INSET + 20"
                :y="panel.y + PANEL_HEADER_HEIGHT + 43"
              >{{ adminControlPlaneStateLabel }}</text>
            </g>
            <g v-else-if="panel.group.nodes.length === 0" class="topology-placeholder">
              <rect
                class="topology-node-box is-unknown"
                :x="panel.x + NODE_INSET"
                :y="panel.y + PANEL_HEADER_HEIGHT + 4"
                :width="panel.width - NODE_INSET * 2"
                :height="EMPTY_ROLE_HEIGHT"
                rx="7"
              />
              <circle
                class="topology-node-dot is-unknown"
                :cx="panel.x + NODE_INSET + 10"
                :cy="panel.y + PANEL_HEADER_HEIGHT + 21"
                r="3"
              />
              <text
                class="topology-placeholder-label"
                :x="panel.x + NODE_INSET + 20"
                :y="panel.y + PANEL_HEADER_HEIGHT + 25"
              >{{ t('dashboard.topologyDetails.noRegisteredNodes') }}</text>
            </g>
          </g>

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
            >{{ nodeLabel(point.node.nodeId, point.width) }}</text>
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
          <path
            v-if="layout.evidencePath && evidence.selected"
            :key="`evidence-flow-${evidence.selected.activityId}`"
            class="topology-evidence-flow"
            :d="layout.evidencePath"
            pathLength="100"
          />
          <path
            v-if="layout.evidencePath && evidence.selected"
            :key="`evidence-ribbon-${evidence.selected.activityId}`"
            class="topology-evidence-ribbon"
            :d="layout.evidencePath"
            pathLength="100"
          />
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
              <li v-for="activity in visibleActivities" :key="activity.technical.activityId">
                <button
                  type="button"
                  class="evidence-button"
                  :class="{ selected: activity.technical.activityId === selectedActivityId }"
                  :aria-pressed="activity.technical.activityId === selectedActivityId"
                  @click="toggleActivity(activity.technical.activityId)"
                >
                  <span class="evidence-kind">{{ activity.summary.kind }}</span>
                  <span class="evidence-path mono">{{ activity.summary.path }}</span>
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
          <template v-else-if="evidence.selected">
            <div class="selected-evidence" role="status" aria-live="polite">
              <span class="selected-kind">{{ kindLabel(evidence.selected.kind) }}</span>
              <p v-if="selectedActivityPresentation" class="selected-summary-path mono">
                {{ selectedActivityPresentation.summary.path }}
              </p>
              <p v-if="displayedMissingNodeIds.length" class="topology-state is-error">
                {{ t('dashboard.topologyDetails.missingNodes', { ids: displayedMissingNodeIds.join(', ') }) }}
              </p>
            </div>
            <details
              v-if="selectedActivityPresentation"
              :key="selectedActivityPresentation.technical.activityId"
              class="selected-technical"
            >
              <summary>{{ t('dashboard.topologyDetails.technicalDetails') }}</summary>
              <dl class="selected-fields">
                <div v-for="field in selectedFields" :key="field.key" class="selected-field">
                  <dt class="field-label mono">{{ field.key }}</dt>
                  <dd class="field-value mono">{{ field.value }}</dd>
                </div>
              </dl>
              <div class="technical-id-row">
                <span class="field-label mono">{{ t('dashboard.topologyDetails.activityId') }}</span>
                <code class="technical-id-value mono">{{ selectedActivityPresentation.technical.activityId }}</code>
                <button
                  type="button"
                  class="text-button technical-id-copy"
                  :aria-label="t('dashboard.topologyDetails.copyActivityId')"
                  @click.stop="copyActivityId(selectedActivityPresentation.technical.activityId)"
                >{{ t('common.copy') }}</button>
              </div>
            </details>
          </template>
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
          <p v-if="group.nodes.length === 0" class="roster-empty">
            {{ emptyGroupLabel(group.key) }}
          </p>
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
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useId, watch } from 'vue'
import { useMessage } from 'naive-ui'
import type { NodeSummary } from '@/api/system'
import {
  adminAnchorEndpoints,
  dashboardTopologyGroups,
  projectNodeEvidence,
  type AdminControlPlaneStatus,
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
import { presentTopologyActivity } from './topologyEvidencePresentation'

const props = withDefaults(defineProps<{
  nodes: readonly NodeSummary[]
  loading: boolean
  error: boolean
  adminControlPlaneState?: AdminControlPlaneStatus
  adminConfiguredId?: string | null
  adminIdentityStale?: boolean
  activityProjection?: ExecutionCommunicationProjection | null
  activityScope?: string | null
  activityLoading?: boolean
  activityError?: boolean
  selectedActivityId?: string | null
}>(), {
  adminControlPlaneState: 'unknown',
  adminConfiguredId: null,
  adminIdentityStale: false,
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
const message = useMessage()
const relationMarkerId = `dashboard-relation-arrow-${useId()}`
const evidenceMarkerId = `dashboard-evidence-arrow-${useId()}`

/**
 * Stable triangle: Admin panel on top, Audit bottom-left, Storage bottom-right.
 * Unknown roles get their own full-width row so every catalog node has a slot.
 */
const PANEL_WIDTH = 196
const PANEL_GAP = 22
const PADDING = 14
const COMPACT_PANEL_GAP = 12
const COMPACT_PADDING = 10
const COMPACT_PANEL_WIDTH = 460
/** Lowest readable column width; anything narrower scales the whole canvas instead. */
const MIN_PANEL_WIDTH = 104
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

const EMPTY_ROLE_HEIGHT = 36
const ADMIN_ANCHOR_HEIGHT = 52
/** Used until the first measurement; the SVG never exceeds its container either way. */
const DEFAULT_PANEL_WIDTH = 660
/** The section, not the scroll box, so a vertical scrollbar cannot feed back into the layout. */
const topologyPanel = ref<HTMLElement | null>(null)
const topologyPanelWidth = ref(DEFAULT_PANEL_WIDTH)
let resizeObserver: ResizeObserver | null = null

function measureTopologyPanel(): void {
  const width = topologyPanel.value?.clientWidth
  if (typeof width === 'number' && width > 0) topologyPanelWidth.value = width
}

onMounted(() => {
  measureTopologyPanel()
  if (typeof ResizeObserver !== 'undefined' && topologyPanel.value) {
    resizeObserver = new ResizeObserver(measureTopologyPanel)
    resizeObserver.observe(topologyPanel.value)
  } else {
    window.addEventListener('resize', measureTopologyPanel)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measureTopologyPanel)
})

const adminControlPlaneStateLabel = computed(() =>
  props.adminControlPlaneState === 'available'
    ? t('dashboard.available')
    : props.adminControlPlaneState === 'unavailable'
      ? t('dashboard.unavailable')
      : t('dashboard.stateUnknown'),
)

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
  return evidence.value.activities
    .slice(start, start + ACTIVITY_PAGE_SIZE)
    .map(presentActivity)
})
const selectedActivityPresentation = computed(() => {
  const selectedId = evidence.value.selected?.activityId
  const activity = selectedId
    ? evidence.value.activities.find(item => item.activityId === selectedId)
    : null
  return activity ? presentActivity(activity) : null
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
const groups = computed(() => dashboardTopologyGroups(props.nodes, {
  maxPerGroup: Math.max(1, props.nodes.length),
  keepNodeIds: highlightedIds.value,
}))
/**
 * Exact confirmed sender that is not a registered node, drawn from the anchor.
 * The model returns null whenever any Admin node is registered, and everything
 * else keeps the strict registered-endpoints rule.
 */
const anchorLink = computed(() => {
  const selected = evidence.value.selected
  if (!selected) return null
  const activity = evidence.value.activities.find(item => item.activityId === selected.activityId)
  return adminAnchorEndpoints(selected, activity, props.nodes)
})
const anchorSenderId = computed(() => anchorLink.value?.sourceNodeId ?? null)
const anchorIdentityLabel = computed(() =>
  anchorSenderId.value
  ?? (props.adminConfiguredId
    ? t('dashboard.topologyDetails.adminIdentityConfiguredCompact')
    : t('dashboard.topologyDetails.adminIdentityMissing')),
)
const anchorTitle = computed(() => [
  t('dashboard.topologyDetails.adminControlPlane'),
  anchorIdentityLabel.value,
  adminControlPlaneStateLabel.value,
].join(' · '))
const displayedMissingNodeIds = computed(() => {
  const selected = evidence.value.selected
  if (!selected) return []
  // A sender drawn to the anchor is accounted for; a missing target stays missing.
  return anchorLink.value
    ? selected.missingNodeIds.filter(nodeId => nodeId !== anchorLink.value?.sourceNodeId)
    : selected.missingNodeIds
})
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

interface ConnectorPoint {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
}

interface NodePoint extends ConnectorPoint {
  node: NodeSummary
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
function connectorPath(source: ConnectorPoint, target: ConnectorPoint): string {
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
  // Narrow containers tighten the gutters before the SVG has to scale down at all.
  const compact = topologyPanelWidth.value < COMPACT_PANEL_WIDTH
  const padding = compact ? COMPACT_PADDING : PADDING
  const gap = compact ? COMPACT_PANEL_GAP : PANEL_GAP
  const panelWidth = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(
      PANEL_WIDTH,
      Math.floor((topologyPanelWidth.value - padding * 2 - gap) / 2),
    ),
  )
  const width = padding * 2 + panelWidth * 2 + gap
  const panels: GroupPanel[] = []
  const points: NodePoint[] = []
  const relationEdges: RelationEdge[] = []
  let cursorY = padding
  let bottom = padding

  /** One role panel: actual nodes, or a non-counted structural placeholder. */
  function addPanel(group: NodeRoleGroup, x: number, y: number, widthForPanel = panelWidth): GroupPanel {
    const nodeWidth = widthForPanel - NODE_INSET * 2
    const visible = group.visibleNodes
    const placeholderHeight = group.key === 'Admin' ? ADMIN_ANCHOR_HEIGHT : EMPTY_ROLE_HEIGHT
    const contentHeight = visible.length > 0
      ? visible.length * NODE_HEIGHT + Math.max(0, visible.length - 1) * NODE_GAP
      : placeholderHeight + 4
    const height = PANEL_HEADER_HEIGHT + contentHeight + PANEL_BOTTOM_PADDING
    const panel: GroupPanel = { group, x, y, width: widthForPanel, height }
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
  const adminPanel = adminGroup
    ? addPanel(adminGroup, padding + (panelWidth + gap) / 2, cursorY)
    : null
  if (adminPanel) cursorY = adminPanel.y + adminPanel.height + ROW_GAP

  const peerGroups = (['Audit', 'Storage'] as const)
    .map(key => byKey.get(key))
    .filter((group): group is NodeRoleGroup => Boolean(group))
  let rowBottom = cursorY
  peerGroups.forEach((group, index) => {
    const panel = addPanel(group, padding + index * (panelWidth + gap), cursorY)
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

  const unknownGroup = byKey.get('unknown')
  if (unknownGroup?.nodes.length) {
    addPanel(unknownGroup, padding, cursorY, width - padding * 2)
  }

  const selected = evidence.value.selected
  const endpoints = selectedEndpoints(selected, evidence.value.activities) ?? anchorLink.value
  const source = endpoints
    ? points.find(point => point.node.nodeId === endpoints.sourceNodeId)
    : undefined
  const target = endpoints
    ? points.find(point => point.node.nodeId === endpoints.targetNodeId)
    : undefined
  const adminPlaceholder = adminPanel && adminGroup?.nodes.length === 0
    ? {
      x: adminPanel.x + NODE_INSET,
      y: adminPanel.y + PANEL_HEADER_HEIGHT + 4,
      width: panelWidth - NODE_INSET * 2,
      height: ADMIN_ANCHOR_HEIGHT,
      centerX: adminPanel.x + adminPanel.width / 2,
      centerY: adminPanel.y + PANEL_HEADER_HEIGHT + 4 + ADMIN_ANCHOR_HEIGHT / 2,
    }
    : null
  // Only the exact confirmed sender may stand in the anchor; a missing target never does.
  const sourcePoint = source ?? (anchorLink.value ? adminPlaceholder : null)
  const evidencePath = endpoints && sourcePoint && target
    ? connectorPath(sourcePoint, target)
    : null

  return {
    panels,
    points,
    relationEdges,
    evidencePath,
    width,
    height: bottom + padding,
  }
})

const KIND_LABEL_KEY: Record<NodeEvidenceKind, string> = {
  confirmedPacket: 'execution.topology.confirmedPacket',
  peerCorrelation: 'execution.topology.peerCorrelation',
  localStage: 'execution.topology.nodeLocalEvent',
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

/** Empty role panels are labeled only; they never carry a placeholder node id. */
function emptyGroupLabel(key: NodeRoleGroupKey): string {
  return key === 'Admin'
    ? `${t('dashboard.topologyDetails.adminControlPlane')} · ${anchorIdentityLabel.value} · ${adminControlPlaneStateLabel.value}`
    : t('dashboard.topologyDetails.noRegisteredNodes')
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

/** Fit the label inside the drawn box; the tooltip keeps the exact id. */
function nodeLabel(nodeId: string, nodeWidth: number): string {
  const maxChars = Math.max(6, Math.min(24, Math.floor((nodeWidth - 26) / 5.6)))
  return nodeId.length > maxChars ? `${nodeId.slice(0, maxChars - 1)}…` : nodeId
}

function nodeTitle(node: NodeSummary): string {
  const role = typeof node.role === 'string' && node.role.length > 0 ? node.role : t('dashboard.stateUnknown')
  return `${node.nodeId} · ${role} · ${availabilityLabel(node)}`
}

function presentActivity(activity: ExecutionCommunicationActivity) {
  return presentTopologyActivity(activity, {
    kind: kindLabel(activity.kind),
    proofAccepted: t('execution.sequenceChart.proofAccepted'),
    challengeDelivered: t('execution.sequenceChart.challengeDelivered'),
  })
}

async function copyActivityId(activityId: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(activityId)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = activityId
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      let copied = false
      try {
        textarea.select()
        copied = document.execCommand('copy')
      } finally {
        textarea.remove()
      }
      if (!copied) throw new Error('Clipboard copy was refused')
    }
    message.success(t('common.copied'))
  } catch {
    message.error(t('common.operationFailed'))
  }
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
.topology-note { margin: 6px 0 0; color: var(--apple-gray-3); font-size: 11px; line-height: 1.45; }
.topology-note.control-plane-note { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; color: var(--apple-gray-3); font-size: 12px; }
.admin-configured-id { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 4px 6px; }
.admin-configured-id code { color: var(--apple-gray-1); font-family: var(--apple-font-mono); overflow-wrap: anywhere; }
.admin-id-source { color: var(--apple-gray-4); }
.mono { font-family: var(--apple-font-mono); }

.topology-scroll { width: 100%; max-width: 100%; max-height: 380px; margin-top: 8px; overflow-x: hidden; overflow-y: auto; border-radius: 10px; }
/* Fluid canvas: the viewBox keeps the aspect ratio and the width never exceeds the panel. */
.topology-svg { display: block; width: 100%; height: auto; max-width: 100%; margin-inline: auto; }

/* Half-pixel-ish strokes stay crisp when a narrow panel scales the canvas down. */
.topology-relation,
.topology-evidence,
.group-panel,
.topology-node-box,
.topology-node-dot { vector-effect: non-scaling-stroke; }

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
.topology-placeholder-label { fill: var(--apple-gray-1); font-size: 9.5px; font-weight: 600; }
.topology-placeholder-detail { fill: var(--apple-gray-4); font-size: 8.5px; }
/* Structural Admin anchor: dashed border because it is not a registered node row. */
.topology-anchor-box { stroke-dasharray: 3 3; fill: color-mix(in srgb, var(--apple-gray-6) 22%, var(--apple-card)); }
.topology-placeholder-detail.is-node-id { fill: var(--apple-gray-2); font-family: var(--apple-font-mono); }

.topology-evidence { fill: none; stroke: var(--apple-blue); stroke-width: 2; }
/* One draw-in sweep makes the direction of the selected evidence visible. */
.topology-evidence-flow {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  pointer-events: none;
  animation: evidence-flow-draw 900ms cubic-bezier(0.23, 1, 0.32, 1) 1 forwards;
}

@keyframes evidence-flow-draw {
  to { stroke-dashoffset: 0; }
}

.topology-evidence-ribbon {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 9;
  stroke-linecap: round;
  stroke-dasharray: 18 100;
  opacity: 0;
  pointer-events: none;
  animation: evidence-ribbon-sweep 900ms cubic-bezier(0.23, 1, 0.32, 1) 1 both;
}

@keyframes evidence-ribbon-sweep {
  from { stroke-dashoffset: 100; opacity: 0; }
  12% { opacity: 0.34; }
  78% { opacity: 0.34; }
  to { stroke-dashoffset: -40; opacity: 0; }
}
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

.selected-evidence { margin-top: 8px; padding: 8px; border: 1px solid var(--apple-gray-6); border-radius: 8px; }
.selected-kind { color: var(--apple-blue); font-size: 10px; font-weight: 650; }
.selected-summary-path { margin: 6px 0 0; color: var(--apple-gray-3); font-size: 10px; overflow-wrap: anywhere; }
.selected-fields { display: grid; gap: 3px; margin: 6px 0 0; }
.selected-field { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 8px; }
.field-label { color: var(--apple-gray-4); font-size: 9.5px; }
.field-value { margin: 0; color: var(--apple-gray-2); font-size: 10px; overflow-wrap: anywhere; }
.selected-technical { margin-top: 8px; padding: 8px; border: 1px solid var(--apple-gray-6); border-radius: 8px; }
.selected-technical summary { cursor: pointer; color: var(--apple-gray-2); font-size: 10px; font-weight: 600; }
.selected-technical summary:focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 2px; }
.technical-id-row { display: grid; grid-template-columns: 90px minmax(0, 1fr) auto; align-items: center; gap: 8px; margin-top: 6px; }
.technical-id-value { min-width: 0; color: var(--apple-gray-2); font-size: 10px; overflow-wrap: anywhere; }
.technical-id-copy { justify-self: end; }

.node-roster { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--apple-gray-6); color: var(--apple-gray-3); font-size: 10px; }
.node-roster summary { cursor: pointer; color: var(--apple-gray-2); font-weight: 600; }
.node-roster summary:focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 2px; }
.roster-group { margin-top: 8px; }
.roster-group-title { display: flex; align-items: center; justify-content: space-between; color: var(--apple-gray-4); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.roster-group ul { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; }
.roster-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 3px 6px; border-radius: 6px; }
.roster-item.is-highlighted { background: color-mix(in srgb, var(--apple-blue) 10%, transparent); }
.roster-empty { margin: 4px 0 0; color: var(--apple-gray-4); font-size: 9.5px; }
.roster-id { color: var(--apple-gray-2); overflow-wrap: anywhere; }
.roster-role { color: var(--apple-gray-4); }
.roster-state.is-available { color: var(--apple-green); }
.roster-state.is-unavailable { color: var(--apple-red); }
.roster-state.is-unknown { color: var(--apple-gray-4); }

@media (max-width: 640px) {
  .topology-scroll { max-height: 260px; }
  .selected-field { grid-template-columns: 80px minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .topology-evidence-flow,
  .topology-evidence-ribbon { display: none; }
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
