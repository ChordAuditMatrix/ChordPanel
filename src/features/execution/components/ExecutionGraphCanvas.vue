<template>
  <section class="graph-canvas" :aria-label="t('execution.graph.canvas.region')">
    <div class="graph-canvas__legend-block">
      <p class="graph-canvas__legend-title">{{ t('execution.graph.canvas.relationsLegend') }}</p>
      <div class="graph-canvas__legend-groups">
        <div class="graph-canvas__legend-group">
          <span class="graph-canvas__legend-group-title">{{ t('execution.graph.canvas.persistedRelations') }}</span>
          <ul class="graph-canvas__legend">
            <li v-for="family in persistedFamilies" :key="family">
              <span class="graph-canvas__swatch" :class="`family--${family}`" aria-hidden="true" />
              <span>{{ t(FAMILY_LABEL_KEYS[family]) }}</span>
            </li>
          </ul>
        </div>
        <div class="graph-canvas__legend-group">
          <span class="graph-canvas__legend-group-title">{{ t('execution.graph.canvas.derivedRelations') }}</span>
          <ul class="graph-canvas__legend">
            <li v-for="family in derivedFamilies" :key="family">
              <span class="graph-canvas__swatch" :class="`family--${family}`" aria-hidden="true" />
              <span>{{ t(FAMILY_LABEL_KEYS[family]) }}</span>
            </li>
            <li>
              <span class="graph-canvas__swatch swatch--endpoint" aria-hidden="true" />
              <span>{{ t('execution.graph.canvas.endpointLegend') }}</span>
            </li>
            <li>
              <span class="graph-canvas__swatch swatch--unresolved" aria-hidden="true" />
              <span>{{ t('execution.graph.canvas.unresolvedLegend') }}</span>
            </li>
          </ul>
        </div>
      </div>
      <p class="graph-canvas__note">{{ t('execution.graph.canvas.note') }}</p>
      <p class="graph-canvas__counts">{{ description }}</p>
      <p v-if="layout.isolatedNodeIds.length" class="graph-canvas__note">
        {{ t('execution.graph.canvas.isolated', { count: layout.isolatedNodeIds.length }) }}
      </p>
    </div>

    <div class="graph-canvas__delegation" role="group" :aria-label="t('execution.graph.canvas.delegationLabel')">
      <span class="graph-canvas__delegation-job mono">
        {{ layout.delegation.jobId ?? t('execution.notAvailable') }}
      </span>
      <span>{{ t('execution.graph.canvas.delegationScope', {
        tasks: layout.delegation.taskNodeCount,
        parts: layout.delegation.partNodeCount,
        activities: layout.delegation.activityNodeCount,
      }) }}</span>
    </div>

    <div class="graph-canvas__groups" role="group" :aria-label="t('execution.graph.canvas.groups.title')">
      <button
        v-for="group in layout.groups"
        :key="`group:${group.kind}`"
        type="button"
        class="graph-canvas__group-toggle"
        :class="{ 'is-collapsed': group.collapsed }"
        :aria-expanded="!group.collapsed"
        :aria-controls="scrollRegionId"
        :aria-label="t('execution.graph.canvas.groups.toggle', {
          lane: t(LANE_LABEL_KEYS[group.lane]),
          count: group.nodeCount,
          state: group.collapsed
            ? t('execution.graph.canvas.groups.expand')
            : t('execution.graph.canvas.groups.collapse'),
        })"
        @click="emit('toggle-group', group.kind)"
        @keydown.escape="emit('clear')"
      >
        <span class="graph-canvas__group-caret" aria-hidden="true">{{ group.collapsed ? '▸' : '▾' }}</span>
        <span>{{ t(LANE_LABEL_KEYS[group.lane]) }}</span>
        <span class="graph-canvas__group-count">{{ group.nodeCount }}</span>
      </button>
      <p class="graph-canvas__groups-note">{{ t('execution.graph.canvas.groups.foldedNote') }}</p>
      <p v-if="layout.foldedEdgeCount" class="graph-canvas__groups-note">
        {{ t('execution.graph.canvas.groups.foldedEdges', { count: layout.foldedEdgeCount }) }}
      </p>
    </div>

    <p
      v-if="canScrollHorizontally"
      :id="scrollHintId"
      class="graph-canvas__scroll-hint graph-canvas__scroll-hint--overflow"
    >
      <span class="graph-canvas__scroll-hint-glyph" aria-hidden="true">↔</span>
      <span>{{ t('execution.graph.canvas.scrollHint') }}</span>
    </p>

    <div class="graph-canvas__viewport">
      <div
        :id="scrollRegionId"
        ref="scrollElement"
        class="graph-canvas__scroll"
        role="region"
        tabindex="0"
        :aria-label="t('execution.graph.canvas.scrollRegion', { width: layout.width })"
        :aria-describedby="canScrollHorizontally ? scrollHintId : undefined"
        @scroll.passive="syncScrollMetrics"
      >
        <svg
          ref="svgElement"
          class="graph-canvas__svg"
          :width="layout.width"
          :height="layout.height"
          :viewBox="`0 0 ${layout.width} ${layout.height}`"
          role="img"
          :aria-labelledby="titleId"
          :aria-describedby="descriptionId"
        >
          <title :id="titleId">{{ summary }}</title>
          <desc :id="descriptionId">{{ description }}</desc>

          <defs>
            <marker
              v-for="family in familyOrder"
              :id="`${uid}-arrow-${family}`"
              :key="`${uid}-arrow-${family}`"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path class="arrow-head" :class="`family--${family}`" d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>

          <g class="rings" aria-hidden="true">
            <g v-for="ring in layout.rings" :key="`ring:${ring.ring}`">
              <circle
                v-if="ring.ring > 0"
                class="ring-guide"
                :cx="ring.centerX"
                :cy="ring.centerY"
                :r="ring.radius"
              />
              <text
                v-if="ring.ring > 0"
                class="ring-label"
                :x="ring.centerX"
                :y="ring.centerY - ring.radius + 12"
                text-anchor="middle"
              >
                {{ t('execution.graph.canvas.ringLabel', { ring: ring.ring, count: ring.nodeIds.length }) }}
              </text>
            </g>
          </g>

          <g class="edges">
            <g
              v-for="edge in layout.edges"
              :key="edge.id"
              :class="[
                'edge',
                `edge--${edge.family}`,
                { 'edge--selected': selectedNodeId !== null && (edge.from === selectedNodeId || edge.to === selectedNodeId) },
              ]"
            >
              <title>{{ edgeText(edge) }}</title>
              <path class="edge__line" :d="edge.path" :marker-end="`url(#${uid}-arrow-${edge.family})`" />
            </g>
          </g>

          <g class="nodes">
            <g
              v-for="node in layout.nodes"
              :key="node.id"
              class="node"
              :class="[
                `node--${node.kind}`,
                `node--${node.resolution}`,
                {
                  'node--selected': node.id === selectedNodeId,
                  'node--related': relatedNodeIds.has(node.id),
                },
              ]"
              :transform="`translate(${node.x} ${node.y})`"
              role="button"
              tabindex="0"
              :aria-pressed="node.id === selectedNodeId"
              :aria-label="nodeAltText(node)"
              @click="emit('select', node.id)"
              @keydown.enter.prevent="emit('select', node.id)"
              @keydown.space.prevent="emit('select', node.id)"
              @keydown.escape="emit('clear')"
            >
              <rect class="node__box" :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="7" />
              <rect class="node__stripe" x="0" y="6" width="3" :height="NODE_HEIGHT - 12" rx="1.5" />
              <text class="node__kind" x="10" y="17">{{ nodeKindLabel(node) }}</text>
              <text class="node__ref" x="10" y="33">{{ nodeRefLabel(node) }}</text>
              <text class="node__status" x="10" y="48">{{ nodeStatusLabel(node) }}</text>
            </g>
          </g>
        </svg>
      </div>

      <span
        v-if="canScrollHorizontally && !atScrollStart"
        class="graph-canvas__edge-fade graph-canvas__edge-fade--start"
        aria-hidden="true"
      />
      <span
        v-if="canScrollHorizontally && !atScrollEnd"
        class="graph-canvas__edge-fade graph-canvas__edge-fade--end"
        aria-hidden="true"
      />
    </div>

    <p class="graph-canvas__scroll-hint">{{ t('execution.graph.canvas.selectHint') }}</p>

    <section
      v-if="selection"
      class="graph-canvas__selection"
      role="region"
      :aria-label="t('execution.graph.canvas.selection.title')"
    >
      <header class="graph-canvas__selection-head">
        <div class="graph-canvas__selection-title">
          <span class="graph-canvas__selection-kind">{{ nodeKindLabel(selection.node) }}</span>
          <span class="mono graph-canvas__selection-ref">{{ selection.identity ?? nodeRefLabel(selection.node) }}</span>
          <n-tag size="small" :bordered="false">{{ nodeStatusLabel(selection.node) }}</n-tag>
        </div>
        <n-button size="tiny" quaternary @click="emit('clear')">
          {{ t('execution.graph.canvas.selection.clear') }}
        </n-button>
      </header>

      <dl class="graph-canvas__selection-facts">
        <div>
          <dt>{{ t('execution.graph.canvas.selection.source') }}</dt>
          <dd>
            {{ selection.provenanceField
              ? t('execution.graph.canvas.selection.sourceField', {
                field: t(PROVENANCE_LABEL_KEYS[selection.provenanceField] ?? fallbackProvenanceKey),
                value: selection.provenanceValue ?? t('execution.notAvailable'),
              })
              : t('execution.graph.canvas.selection.sourceEndpoint') }}
          </dd>
        </div>
        <div v-if="selection.node.pageKey">
          <dt>{{ t('execution.graph.canvas.selection.scope') }}</dt>
          <dd class="mono">{{ selection.node.pageKey }}</dd>
        </div>
      </dl>

      <div class="graph-canvas__selection-block">
        <p class="graph-canvas__selection-subtitle">
          {{ t('execution.graph.canvas.selection.relations', {
            incoming: selection.incomingCount,
            outgoing: selection.outgoingCount,
          }) }}
        </p>
        <p v-if="!selection.relations.length" class="graph-canvas__selection-empty">
          {{ t('execution.graph.canvas.selection.noRelations') }}
        </p>
        <ul v-else class="graph-canvas__selection-relations">
          <li v-for="relation in selection.relations" :key="relation.edgeId">
            <button
              type="button"
              class="graph-canvas__relation-button"
              :aria-label="t('execution.graph.canvas.selection.openRelation', {
                kind: t(KIND_LABEL_KEYS[relation.otherKind]),
                identity: relation.otherIdentity ?? t('execution.notAvailable'),
              })"
              @click="emit('select', relation.otherNodeId)"
            >
              <span class="graph-canvas__relation-direction" aria-hidden="true">
                {{ relation.direction === 'outgoing' ? '→' : '←' }}
              </span>
              <span>{{ t(KIND_LABEL_KEYS[relation.otherKind]) }}</span>
              <span class="mono">{{ relation.otherIdentity ?? t('execution.notAvailable') }}</span>
            </button>
            <span class="graph-canvas__relation-family">{{ t(FAMILY_LABEL_KEYS[relation.family]) }}</span>
            <span class="graph-canvas__relation-evidence">
              {{ t(relation.evidence === 'persisted'
                ? 'execution.graph.canvas.persistedEvidence'
                : 'execution.graph.canvas.derivedEvidence') }}
            </span>
          </li>
        </ul>
      </div>

      <div v-if="selection.unresolvedRelations.length" class="graph-canvas__selection-block">
        <p class="graph-canvas__selection-subtitle">
          {{ t('execution.graph.canvas.selection.unresolved', { count: selection.unresolvedRelations.length }) }}
        </p>
        <ul class="graph-canvas__selection-relations">
          <li v-for="edge in selection.unresolvedRelations" :key="`sel-unresolved:${edge.id}`">
            <span class="mono">{{ edge.fromRef.ref }}</span>
            <span aria-hidden="true">→</span>
            <span class="mono">{{ edge.toRef?.ref ?? t('execution.graph.canvas.unresolvedReasons.targetMissing') }}</span>
            <span class="graph-canvas__relation-family">{{ t(FAMILY_LABEL_KEYS[edge.family]) }}</span>
            <span class="graph-canvas__relation-evidence">
              {{ t(UNRESOLVED_REASON_KEYS[edge.reason] ?? 'execution.graph.canvas.unresolved') }}
            </span>
          </li>
        </ul>
      </div>

      <div v-if="selection.foldedRelations.length" class="graph-canvas__selection-block">
        <p class="graph-canvas__selection-subtitle">
          {{ t('execution.graph.canvas.selection.folded', { count: selection.foldedRelations.length }) }}
        </p>
        <ul class="graph-canvas__selection-relations">
          <li v-for="edge in selection.foldedRelations" :key="`sel-folded:${edge.id}`">
            <span class="mono">{{ edge.fromRef.ref }}</span>
            <span aria-hidden="true">→</span>
            <span class="mono">{{ edge.toRef?.ref ?? t('execution.notAvailable') }}</span>
            <span class="graph-canvas__relation-family">{{ t(LANE_LABEL_KEYS[edge.foldedGroup]) }}</span>
            <span class="graph-canvas__relation-evidence">{{ t(FAMILY_LABEL_KEYS[edge.family]) }}</span>
          </li>
        </ul>
      </div>

      <div class="graph-canvas__selection-actions">
        <n-button
          v-if="selection.evidenceTarget && selection.evidenceKey"
          size="tiny"
          secondary
          @click="openEvidence"
        >
          {{ t('execution.graph.canvas.selection.openEvidence') }}
        </n-button>
        <p v-else class="graph-canvas__selection-empty">
          {{ t('execution.graph.canvas.selection.evidenceMissing') }}
        </p>
      </div>
    </section>

    <ul class="sr-only" :aria-label="t('execution.graph.canvas.textAlternative')">
      <li v-for="node in layout.nodes" :key="`alt-node:${node.id}`">{{ nodeAltText(node) }}</li>
      <li v-for="edge in layout.edges" :key="`alt-edge:${edge.id}`">{{ edgeText(edge) }}</li>
      <li v-for="edge in layout.unresolvedEdges" :key="`alt-unresolved:${edge.id}`">{{ unresolvedEdgeText(edge) }}</li>
      <li v-for="group in layout.groups" :key="`alt-group:${group.kind}`">
        {{ t('execution.graph.canvas.groups.textAlternative', {
          lane: t(LANE_LABEL_KEYS[group.lane]),
          count: group.nodeCount,
          state: group.collapsed
            ? t('execution.graph.canvas.groups.expand')
            : t('execution.graph.canvas.groups.collapse'),
        }) }}
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  TraceGraphCanvasEdge,
  TraceGraphCanvasEdgeFamily,
  TraceGraphCanvasGroupKind,
  TraceGraphCanvasLane,
  TraceGraphCanvasLayout,
  TraceGraphCanvasNode,
  TraceGraphCanvasNodeKind,
  TraceGraphCanvasUnresolvedEdge,
} from '@/features/execution/data/traceGraphCanvasLayout'
import {
  TRACE_GRAPH_CANVAS_FAMILY_EVIDENCE,
  TRACE_GRAPH_CANVAS_FAMILY_ORDER,
  TRACE_GRAPH_CANVAS_NODE_HEIGHT,
  TRACE_GRAPH_CANVAS_NODE_WIDTH,
} from '@/features/execution/data/traceGraphCanvasLayout'
import type {
  TraceGraphEvidenceTarget,
  TraceGraphNodeDetail,
} from '@/features/execution/data/traceGraphNodeDetail'
import { useI18n } from '@/stores/i18n'
import {
  jobStatusLabel,
  taskStatusLabel,
  tracePartStatusLabel,
} from '@/utils/statusLabels'

const props = defineProps<{
  layout: TraceGraphCanvasLayout
  selectedNodeId?: string | null
  selection?: TraceGraphNodeDetail | null
}>()

const emit = defineEmits<{
  (event: 'select', nodeId: string): void
  (event: 'clear'): void
  (event: 'toggle-group', group: TraceGraphCanvasGroupKind): void
  (event: 'focus-evidence', target: TraceGraphEvidenceTarget, key: string): void
}>()

const { t } = useI18n()
const NODE_WIDTH = TRACE_GRAPH_CANVAS_NODE_WIDTH
const NODE_HEIGHT = TRACE_GRAPH_CANVAS_NODE_HEIGHT

let canvasSequence = 0
const uid = `graph-canvas-${++canvasSequence}`
const titleId = `${uid}-title`
const descriptionId = `${uid}-description`
const scrollRegionId = `${uid}-scroll`
const scrollHintId = `${uid}-scroll-hint`

const scrollElement = ref<HTMLElement | null>(null)
const svgElement = ref<SVGSVGElement | null>(null)
const viewportWidth = ref(0)
const contentWidth = ref(0)
const scrollLeft = ref(0)
let resizeObserver: ResizeObserver | null = null

/**
 * The drawing keeps its laid-out width and the box scrolls instead, so a narrow
 * screen never shrinks nodes below legibility and never rewrites a relation.
 */
const canScrollHorizontally = computed(() => contentWidth.value > viewportWidth.value + 1)
const atScrollStart = computed(() => scrollLeft.value <= 1)
const atScrollEnd = computed(() =>
  scrollLeft.value + viewportWidth.value >= contentWidth.value - 1,
)

function syncScrollMetrics(): void {
  const element = scrollElement.value
  if (!element) return
  viewportWidth.value = element.clientWidth
  contentWidth.value = element.scrollWidth
  scrollLeft.value = element.scrollLeft
}

function scheduleScrollMetrics(): void {
  void nextTick(syncScrollMetrics)
}

onMounted(() => {
  syncScrollMetrics()
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', syncScrollMetrics)
    return
  }
  resizeObserver = new ResizeObserver(syncScrollMetrics)
  if (scrollElement.value) resizeObserver.observe(scrollElement.value)
  if (svgElement.value) resizeObserver.observe(svgElement.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', syncScrollMetrics)
})

// Folding a group or reading another page changes the drawn extent.
watch(() => props.layout, scheduleScrollMetrics)

const familyOrder = TRACE_GRAPH_CANVAS_FAMILY_ORDER
const persistedFamilies = TRACE_GRAPH_CANVAS_FAMILY_ORDER
  .filter(family => TRACE_GRAPH_CANVAS_FAMILY_EVIDENCE[family] === 'persisted')
const derivedFamilies = TRACE_GRAPH_CANVAS_FAMILY_ORDER
  .filter(family => TRACE_GRAPH_CANVAS_FAMILY_EVIDENCE[family] === 'derived')

const nodeById = computed(() => {
  const map = new Map<string, TraceGraphCanvasNode>()
  for (const node of props.layout.nodes) map.set(node.id, node)
  return map
})

/** Nodes a selected relation names; they are emphasised, never promoted. */
const relatedNodeIds = computed(() => {
  const ids = new Set<string>()
  const selectedId = props.selectedNodeId
  if (!selectedId) return ids
  for (const edge of props.layout.edges) {
    if (edge.from === selectedId) ids.add(edge.to)
    else if (edge.to === selectedId) ids.add(edge.from)
  }
  return ids
})

const summary = computed(() => t('execution.graph.canvas.summary', {
  nodes: props.layout.nodes.length,
  edges: props.layout.edges.length,
  unresolved: props.layout.unresolvedEdges.length,
}))

const description = computed(() => t('execution.graph.canvas.description', {
  links: props.layout.familyCounts.link,
  triggers: props.layout.familyCounts.notificationTrigger,
  activities: props.layout.familyCounts.activityParent,
  parts: props.layout.familyCounts.partTaskRef,
  unresolvedEdges: props.layout.unresolvedEdgeCount,
}))

const LANE_LABEL_KEYS: Record<TraceGraphCanvasLane, string> = {
  notification: 'execution.graph.canvas.lanes.notification',
  job: 'execution.graph.canvas.lanes.job',
  task: 'execution.graph.canvas.lanes.task',
  part: 'execution.graph.canvas.lanes.part',
  activity: 'execution.graph.canvas.lanes.activity',
  endpoint: 'execution.graph.canvas.lanes.endpoint',
}

const KIND_LABEL_KEYS: Record<TraceGraphCanvasNodeKind, string> = {
  job: 'execution.graph.canvas.kinds.job',
  task: 'execution.graph.canvas.kinds.task',
  part: 'execution.graph.canvas.kinds.part',
  activity: 'execution.graph.canvas.kinds.activity',
  notification: 'execution.graph.canvas.kinds.notification',
  packet: 'execution.graph.canvas.kinds.packet',
  peer: 'execution.graph.canvas.kinds.peer',
  request: 'execution.graph.canvas.kinds.request',
  node: 'execution.graph.canvas.kinds.node',
  unknown: 'execution.graph.canvas.kinds.unknown',
}

const FAMILY_LABEL_KEYS: Record<TraceGraphCanvasEdgeFamily, string> = {
  link: 'execution.graph.canvas.families.link',
  notificationTrigger: 'execution.graph.canvas.families.notificationTrigger',
  activityParent: 'execution.graph.canvas.families.activityParent',
  partTaskRef: 'execution.graph.canvas.families.partTaskRef',
}

const PROVENANCE_LABEL_KEYS: Record<string, string> = {
  jobStatus: 'execution.graph.canvas.provenance.jobStatus',
  taskStatus: 'execution.graph.canvas.provenance.taskStatus',
  parts: 'execution.graph.canvas.provenance.parts',
  activities: 'execution.graph.canvas.provenance.activities',
}
const fallbackProvenanceKey = 'execution.graph.canvas.provenance.unknown'

const UNRESOLVED_REASON_KEYS: Record<string, string> = {
  targetMissing: 'execution.graph.canvas.unresolvedReasons.targetMissing',
  endpointNotLoaded: 'execution.graph.canvas.unresolvedReasons.endpointNotLoaded',
  ambiguousReference: 'execution.graph.canvas.unresolvedReasons.ambiguousReference',
}

const ACTIVITY_STATE_KEYS: Record<string, string> = {
  started: 'execution.graph.canvas.activityStates.started',
  progressed: 'execution.graph.canvas.activityStates.progressed',
  succeeded: 'execution.graph.canvas.activityStates.succeeded',
  failed: 'execution.graph.canvas.activityStates.failed',
  cancelled: 'execution.graph.canvas.activityStates.cancelled',
  timedOut: 'execution.graph.canvas.activityStates.timedOut',
}

const TASK_STATUS_STATE_KEYS: Record<string, string> = {
  available: 'execution.graph.taskStatusState.available',
  missingRow: 'execution.graph.taskStatusState.missingRow',
  unattributedRow: 'execution.graph.taskStatusState.unattributedRow',
  foreignRow: 'execution.graph.taskStatusState.foreignRow',
  storeUnavailable: 'execution.graph.taskStatusState.storeUnavailable',
  invalidReference: 'execution.graph.taskStatusState.invalidReference',
}

function truncateIdentifier(value: string, limit = 27): string {
  if (value.length <= limit) return value
  const keep = limit - 1
  const head = Math.ceil(keep / 2)
  const tail = keep - head
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

function nodeKindLabel(node: TraceGraphCanvasNode): string {
  const kind = t(KIND_LABEL_KEYS[node.kind])
  if (node.resolution === 'endpointOnly') {
    return t('execution.graph.canvas.endpointKind', { kind })
  }
  return kind
}

function nodeRefLabel(node: TraceGraphCanvasNode): string {
  if (node.ref) return truncateIdentifier(node.ref.ref)
  const projected = node.projected
  if (projected?.kind === 'task') {
    return t('execution.graph.canvas.emptyTaskReference', { index: projected.task.referenceIndex })
  }
  return t('execution.notAvailable')
}

function nodeStatusLabel(node: TraceGraphCanvasNode): string {
  if (node.resolution === 'endpointOnly') return t('execution.graph.canvas.endpointOnly')
  const projected = node.projected
  if (!projected) return t('execution.graph.canvas.endpointOnly')
  switch (projected.kind) {
    case 'job':
      return jobStatusLabel(projected.job.status, t)
    case 'task':
      return projected.task.status
        ? taskStatusLabel(projected.task.status, t)
        : t(TASK_STATUS_STATE_KEYS[projected.task.statusState] ?? 'execution.notAvailable')
    case 'part':
      return projected.part.state
        ? tracePartStatusLabel(projected.part.state, t)
        : t('execution.notAvailable')
    case 'activity': {
      if (projected.activity.conflicting) return t('execution.graph.conflicting')
      if (!projected.activity.state) return t('execution.graph.notTerminal')
      const key = ACTIVITY_STATE_KEYS[projected.activity.state]
      return key ? t(key) : projected.activity.state
    }
  }
  return t('execution.notAvailable')
}

function nodeAltText(node: TraceGraphCanvasNode): string {
  const identity = node.ref?.ref ?? nodeRefLabel(node)
  return t('execution.graph.canvas.nodeAlt', {
    kind: nodeKindLabel(node),
    identity,
    status: nodeStatusLabel(node),
  })
}

function edgeText(edge: TraceGraphCanvasEdge): string {
  const from = nodeById.value.get(edge.from)
  const to = nodeById.value.get(edge.to)
  const fromLabel = from ? `${nodeKindLabel(from)} ${from.ref?.ref ?? nodeRefLabel(from)}` : edge.fromRef.ref
  const toLabel = to ? `${nodeKindLabel(to)} ${to.ref?.ref ?? nodeRefLabel(to)}` : edge.toRef?.ref ?? '—'
  return t('execution.graph.canvas.edgeAlt', {
    from: fromLabel,
    to: toLabel,
    family: t(FAMILY_LABEL_KEYS[edge.family]),
    evidence: t(edge.evidence === 'persisted'
      ? 'execution.graph.canvas.persistedEvidence'
      : 'execution.graph.canvas.derivedEvidence'),
    unresolved: t('execution.graph.canvas.resolvedEvidence'),
  })
}

function unresolvedEdgeText(edge: TraceGraphCanvasUnresolvedEdge): string {
  return t('execution.graph.canvas.unresolvedEdgeAlt', {
    from: edge.fromRef.ref,
    to: edge.toRef?.ref ?? t('execution.graph.canvas.unresolvedReasons.targetMissing'),
    family: t(FAMILY_LABEL_KEYS[edge.family]),
    reason: t(UNRESOLVED_REASON_KEYS[edge.reason] ?? 'execution.graph.canvas.unresolved'),
  })
}

function openEvidence(): void {
  const selection = props.selection
  if (!selection?.evidenceTarget || !selection.evidenceKey) return
  emit('focus-evidence', selection.evidenceTarget, selection.evidenceKey)
}
</script>

<style scoped>
.graph-canvas {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.graph-canvas__legend-block {
  display: grid;
  gap: 5px;
}

.graph-canvas__legend-title {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  font-weight: 600;
}

.graph-canvas__legend-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.graph-canvas__legend-group {
  display: grid;
  gap: 3px;
}

.graph-canvas__legend-group-title {
  color: var(--apple-gray-3);
  font-size: 10px;
}

.graph-canvas__legend {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
  gap: 4px 14px;
  list-style: none;
  color: var(--apple-gray-2);
  font-size: 10px;
}

.graph-canvas__legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.graph-canvas__swatch {
  display: inline-block;
  width: 22px;
  height: 0;
  border-top: 2px solid var(--apple-gray-4);
}

.graph-canvas__swatch.family--link {
  border-top-color: var(--apple-blue);
}

.graph-canvas__swatch.family--notificationTrigger {
  border-top-style: dashed;
  border-top-color: var(--apple-purple);
}

.graph-canvas__swatch.family--activityParent {
  border-top-style: dashed;
  border-top-color: var(--apple-orange);
}

.graph-canvas__swatch.family--partTaskRef {
  border-top-style: dotted;
  border-top-color: var(--apple-green);
}

.graph-canvas__swatch.swatch--unresolved {
  border-top-style: dotted;
  border-top-color: var(--apple-gray-4);
}

.graph-canvas__swatch.swatch--endpoint {
  border-top-style: dashed;
  border-top-color: var(--apple-gray-4);
}

.graph-canvas__note,
.graph-canvas__counts,
.graph-canvas__scroll-hint,
.graph-canvas__groups-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.5;
}

.graph-canvas__counts {
  color: var(--apple-gray-2);
}

.graph-canvas__scroll-hint--overflow {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 18%, var(--apple-border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--apple-blue) 5%, transparent);
  color: var(--apple-gray-2);
  font-size: 10px;
}

.graph-canvas__scroll-hint-glyph {
  flex: none;
  color: var(--apple-blue);
  font-size: 12px;
  line-height: 1.2;
}

.graph-canvas__delegation {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  color: var(--apple-gray-2);
  font-size: 11px;
}

.graph-canvas__delegation-job {
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.graph-canvas__groups {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.graph-canvas__group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
  background: var(--apple-card);
  color: var(--apple-gray-1);
  font-size: 11px;
  cursor: pointer;
}

.graph-canvas__group-toggle.is-collapsed {
  border-style: dashed;
  color: var(--apple-gray-2);
}

.graph-canvas__group-toggle:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.graph-canvas__group-caret {
  color: var(--apple-gray-3);
  font-size: 9px;
}

.graph-canvas__group-count {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--apple-blue) 10%, transparent);
  color: var(--apple-gray-2);
  font-size: 10px;
  text-align: center;
}

.graph-canvas__groups-note {
  flex-basis: 100%;
}

.graph-canvas__viewport {
  position: relative;
  min-width: 0;
  --graph-canvas-surface: color-mix(in srgb, var(--apple-gray-1) 2%, var(--apple-card));
}

.graph-canvas__scroll {
  min-width: 0;
  overflow: auto;
  max-height: 520px;
  border: 1px solid var(--apple-border);
  border-radius: 8px;
  background: var(--graph-canvas-surface);
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.graph-canvas__edge-fade {
  position: absolute;
  top: 1px;
  bottom: 1px;
  width: 26px;
  border-radius: 8px;
  pointer-events: none;
}

.graph-canvas__edge-fade--start {
  left: 1px;
  background: linear-gradient(to right, var(--graph-canvas-surface), transparent);
}

.graph-canvas__edge-fade--end {
  right: 1px;
  background: linear-gradient(to left, var(--graph-canvas-surface), transparent);
}

.graph-canvas__scroll:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.graph-canvas__svg {
  display: block;
  font-family: var(--apple-font);
}

.ring-guide {
  fill: none;
  stroke: color-mix(in srgb, var(--apple-gray-4) 45%, transparent);
  stroke-width: 1;
  stroke-dasharray: 4 6;
}

.ring-label {
  fill: var(--apple-gray-3);
  font-size: 9px;
}

.edge__line {
  fill: none;
  stroke: var(--apple-gray-4);
  stroke-width: 1.4;
  stroke-linecap: round;
}

.edge--link .edge__line {
  stroke: var(--apple-blue);
}

.edge--notificationTrigger .edge__line {
  stroke: var(--apple-purple);
  stroke-dasharray: 6 3;
}

.edge--activityParent .edge__line {
  stroke: var(--apple-orange);
  stroke-dasharray: 5 4;
}

.edge--partTaskRef .edge__line {
  stroke: var(--apple-green);
  stroke-dasharray: 2 3;
}

.edge--selected .edge__line {
  stroke-width: 2.4;
}

.arrow-head.family--link {
  fill: var(--apple-blue);
}

.arrow-head.family--notificationTrigger {
  fill: var(--apple-purple);
}

.arrow-head.family--activityParent {
  fill: var(--apple-orange);
}

.arrow-head.family--partTaskRef {
  fill: var(--apple-green);
}

.node__box {
  fill: var(--apple-card);
  stroke: var(--apple-gray-6);
  stroke-width: 1;
}

.node__stripe {
  fill: var(--apple-gray-4);
}

.node:focus {
  outline: none;
}

.node:focus-visible .node__box {
  stroke: var(--apple-blue);
  stroke-width: 2.4;
}

.node--selected .node__box {
  fill: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
  stroke: var(--apple-blue);
  stroke-width: 2.2;
}

.node--related .node__box {
  stroke: color-mix(in srgb, var(--apple-blue) 45%, var(--apple-gray-6));
}

.node {
  cursor: pointer;
}

.node--job .node__stripe {
  fill: var(--apple-blue);
}

.node--task .node__stripe {
  fill: var(--apple-purple);
}

.node--part .node__stripe {
  fill: var(--apple-green);
}

.node--activity .node__stripe {
  fill: var(--apple-orange);
}

.node--notification .node__stripe {
  fill: var(--apple-purple);
}

.node--endpointOnly .node__box {
  stroke-dasharray: 3 3;
}

.node__kind {
  fill: var(--apple-gray-2);
  font-size: 9px;
  font-weight: 600;
}

.node__ref {
  fill: var(--apple-gray-1);
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
}

.node__status {
  fill: var(--apple-gray-3);
  font-size: 9px;
}

.graph-canvas__selection {
  display: grid;
  gap: 7px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 18%, var(--apple-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--apple-blue) 3%, var(--apple-card));
}

.graph-canvas__selection-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.graph-canvas__selection-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.graph-canvas__selection-kind {
  color: var(--apple-gray-2);
  font-weight: 600;
}

.graph-canvas__selection-ref {
  overflow-wrap: anywhere;
}

.graph-canvas__selection-facts {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  gap: 4px 16px;
}

.graph-canvas__selection-facts div {
  display: flex;
  gap: 5px;
  font-size: 11px;
}

.graph-canvas__selection-facts dt {
  color: var(--apple-gray-3);
}

.graph-canvas__selection-facts dd {
  margin: 0;
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.graph-canvas__selection-block {
  display: grid;
  gap: 4px;
}

.graph-canvas__selection-subtitle {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  font-weight: 600;
}

.graph-canvas__selection-empty {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.5;
}

.graph-canvas__selection-relations {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 3px;
  list-style: none;
}

.graph-canvas__selection-relations li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
}

.graph-canvas__relation-button {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: color-mix(in srgb, var(--apple-blue) 5%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.graph-canvas__relation-button:hover {
  border-color: color-mix(in srgb, var(--apple-blue) 30%, transparent);
}

.graph-canvas__relation-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}

.graph-canvas__relation-direction {
  color: var(--apple-blue);
}

.graph-canvas__relation-family,
.graph-canvas__relation-evidence {
  color: var(--apple-gray-3);
  font-size: 10px;
}

.graph-canvas__selection-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.mono {
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
