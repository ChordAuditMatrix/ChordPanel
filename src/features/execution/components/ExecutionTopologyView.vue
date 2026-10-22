<template>
  <section
    class="execution-topology"
    :aria-label="t('execution.topology.logicalFlow')"
    :aria-busy="loading || undefined"
  >
    <p v-if="error" class="state-block error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="state-block" role="status">{{ t('execution.loading') }}</p>

    <div class="topology-block">
      <p :id="flowNoteId" class="flow-note">{{ t('execution.topology.logicalFlow') }}</p>

      <div class="topology-canvas" role="group" :aria-label="topologyNodeDescription" :aria-describedby="flowNoteId">
        <svg
          class="topology-svg"
          viewBox="0 0 640 320"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              :id="markerId"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path class="arrow-head" d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>

          <line class="edge" x1="182" y1="150" x2="450" y2="70" :marker-end="markerUrl" />
          <line class="edge" x1="182" y1="170" x2="450" y2="250" :marker-end="markerUrl" />
          <line
            v-if="projection.peerCorrelations.length"
            class="edge peer-relationship"
            x1="533"
            y1="88"
            x2="533"
            y2="232"
          />


          <g v-for="node in nodeGeometry" :key="node.component">
            <rect
              class="node-box"
              :class="{
                'has-local': node.hasLocal,
                selected: node.selected,
              }"
              :x="node.x"
              :y="node.y"
              :width="node.width"
              :height="node.height"
              rx="6"
            />
            <text class="node-label" :x="node.centerX" :y="node.labelY" text-anchor="middle">
              {{ t(node.labelKey) }}
            </text>
            <text
              v-if="node.nodeIdText"
              class="node-id"
              :x="node.centerX"
              :y="node.idY"
              text-anchor="middle"
            >
              {{ node.nodeIdText }}
            </text>
          </g>

          <circle
            v-if="selectedPacketDot && (prefersReducedMotion || !selectedPacketDot.animated)"
            :key="selectedActivityId ?? ''"
            class="packet-dot"
            :cx="selectedPacketDot.endX"
            :cy="selectedPacketDot.endY"
            r="5"
          />
          <circle v-else-if="selectedPacketDot" :key="selectedActivityId ?? ''" class="packet-dot" cx="0" cy="0" r="5">
            <animateMotion :path="selectedPacketDot.path" dur="520ms" fill="freeze" />
          </circle>
          <line
            :key="selectedActivityId ?? ''"
            v-if="selectedPeerFlow"
            class="peer-flow"
            :class="{ animated: selectedPeerFlow.animated }"
            :x1="selectedPeerFlow.x1"
            :y1="selectedPeerFlow.y1"
            :x2="selectedPeerFlow.x2"
            :y2="selectedPeerFlow.y2"
            :marker-end="markerUrl"
          />

          <g v-for="marker in peerMarkers" :key="marker.activityId">
            <circle
              class="peer-marker"
              :class="{ selected: marker.activityId === selectedActivityId }"
              :cx="marker.x"
              :cy="marker.y"
              r="9"
            />
            <text class="peer-marker-text" :x="marker.x" :y="marker.y + 3.5" text-anchor="middle">
              {{ marker.index }}
            </text>
          </g>
        </svg>
      </div>

      <p v-if="!activities.length" class="muted empty">{{ t('execution.topology.noEvidence') }}</p>

      <div v-else class="evidence-block">
        <span class="evidence-title">{{ t('execution.topology.selectActivity') }}</span>
        <ul class="evidence-list">
          <li v-for="activity in visibleActivities" :key="activity.activityId">
            <button
              type="button"
              class="evidence-button"
              :class="{ selected: activity.activityId === selectedActivityId }"
              :aria-pressed="activity.activityId === selectedActivityId"
              :disabled="inactive"
              @click="toggleActivity(activity.activityId)"
            >
              <span class="evidence-kind">{{ t(KIND_LABEL_KEY[activity.kind]) }}</span>
              <span class="evidence-path">{{ activityPath(activity) }}</span>
              <span v-if="activity.kind === 'peerCorrelation'" class="evidence-marker mono" aria-hidden="true">
                {{ peerMarkerIndex(activity.activityId) }}
              </span>
            </button>
          </li>
        </ul>
        <nav
          v-if="activities.length > ACTIVITY_PAGE_SIZE"
          class="evidence-pagination"
          :aria-label="t('execution.pagination.navigation')"
        >
          <button
            type="button"
            class="text-button"
            :disabled="inactive || activityPage <= 1"
            @click="changeActivityPage(-1)"
          >
            {{ t('execution.pagination.previous') }}
          </button>
          <span class="pagination-status" aria-live="polite">
            {{ t('execution.pagination.status', {
              page: activityPage,
              pages: activityPageCount,
              count: activities.length,
            }) }}
          </span>
          <button
            type="button"
            class="text-button"
            :disabled="inactive || activityPage >= activityPageCount"
            @click="changeActivityPage(1)"
          >
            {{ t('execution.pagination.next') }}
          </button>
        </nav>

        <div v-if="selectedActivity" class="selected-evidence" role="status" aria-live="polite">
          <span class="selected-kind">{{ t(KIND_LABEL_KEY[selectedActivity.kind]) }}</span>
          <dl class="selected-fields">
            <div v-for="field in detailFields" :key="field.key" class="selected-field">
              <dt class="field-label mono">{{ field.key }}</dt>
              <dd class="field-value mono">{{ field.value }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import type { TraceSourceComponent } from '@/api/trace'
import {
  executionCommunicationActivities,
  type ExecutionCommunicationActivity,
  type ExecutionCommunicationProjection,
} from '@/features/execution/data/executionCommunication'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'

/**
 * Execution communication topology.
 *
 * Activity animation is explicit and bounded: a selected exact TaskDispatch
 * packet travels once; a peer relation shows a direction only when a matching
 * observed stage fact supplies one.
 *
 *  - a confirmed TaskDispatchReq packet becomes a single dot, only while it is
 *    the selected activity;
 *  - an undirected peer relation has no arrow, packet dot, or message claim;
 *  - a peer direction requires an exact requestId and sender-node stage fact;
 *  - an observed local worker stage highlights its own node.
 *
 * The parent keeps this view mounted across mode switches and owns selection.

 */

const props = withDefaults(defineProps<{
  projection: ExecutionCommunicationProjection
  /** Node identities are copied only from the active Job's persisted metadata and exact links. */
  roleNodeIds?: Partial<Record<TraceSourceComponent, string | null>>
  selectedActivityId?: string | null
  animationActivityId?: string | null
  disabled?: boolean
  loading?: boolean
  error?: string | null
}>(), { roleNodeIds: () => ({}), selectedActivityId: null, animationActivityId: null, disabled: false, loading: false, error: null })

const emit = defineEmits<{
  (event: 'select-activity', activityId: string | null): void
  (event: 'manual-explore'): void
}>()
const { t } = useI18n()
const flowNoteId = `execution-topology-note-${useId()}`
const markerId = `execution-topology-arrow-${useId()}`

const prefersReducedMotion = ref(false)
let motionMedia: MediaQueryList | null = null

function syncReducedMotion() {
  prefersReducedMotion.value = motionMedia?.matches ?? false
}

onMounted(() => {
  motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncReducedMotion()
  motionMedia.addEventListener('change', syncReducedMotion)
})

onUnmounted(() => {
  motionMedia?.removeEventListener('change', syncReducedMotion)
  motionMedia = null
})

const inactive = computed(() => props.disabled || props.loading)

const KIND_LABEL_KEY = {
  confirmedPacket: 'execution.topology.confirmedPacket',
  peerCorrelation: 'execution.topology.peerCorrelation',
  localStage: 'execution.topology.localStage',
} as const

const activities = computed(() => executionCommunicationActivities(props.projection))
const ACTIVITY_PAGE_SIZE = 50
const activityPage = ref(1)
const activityPageCount = computed(() =>
  Math.max(1, Math.ceil(activities.value.length / ACTIVITY_PAGE_SIZE)),
)
const visibleActivities = computed(() => {
  const start = (activityPage.value - 1) * ACTIVITY_PAGE_SIZE
  return activities.value.slice(start, start + ACTIVITY_PAGE_SIZE)
})
watch(() => activities.value.length, () => {
  if (activityPage.value > activityPageCount.value) activityPage.value = activityPageCount.value
})
watch(() => props.selectedActivityId, (activityId) => {
  if (!activityId) return
  const index = activities.value.findIndex(item => item.activityId === activityId)
  if (index >= 0) activityPage.value = Math.floor(index / ACTIVITY_PAGE_SIZE) + 1
}, { immediate: true })
function changeActivityPage(delta: -1 | 1): void {
  const next = Math.min(activityPageCount.value, Math.max(1, activityPage.value + delta))
  if (next === activityPage.value) return
  emit('manual-explore')
  activityPage.value = next
}

const selectedActivity = computed<ExecutionCommunicationActivity | null>(() => {
  if (!props.selectedActivityId) return null
  return activities.value.find(item => item.activityId === props.selectedActivityId) ?? null
})

/** Observed worker identity is preferred; durable Job metadata fills missing roles. */
const componentByNodeId = computed(() => {
  const map = new Map<string, TraceSourceComponent>()
  for (const stage of props.projection.localStages) {
    if (!map.has(stage.nodeId)) map.set(stage.nodeId, stage.component)
  }
  for (const component of NODE_ORDER) {
    const nodeId = props.roleNodeIds?.[component]
    if (nodeId && !map.has(nodeId)) map.set(nodeId, component)
  }
  return map
})

const localStageComponents = computed(() =>
  new Set(props.projection.localStages.map(stage => stage.component)),
)

interface NodeGeometry {
  component: TraceSourceComponent
  /** `execution.topology.admin` | `audit` | `storage`. */
  labelKey: string
  x: number
  y: number
  width: number
  height: number
  centerX: number
  labelY: number
  idY: number
  nodeId: string | null
  /** Shortened for the fixed-width SVG label; full id stays in the evidence list. */
  nodeIdText: string | null
  hasLocal: boolean
  selected: boolean
}

const NODE_ORDER: readonly TraceSourceComponent[] = ['Admin', 'Audit', 'Storage']
const NODE_LABEL_KEY: Record<TraceSourceComponent, string> = {
  Admin: 'execution.topology.admin',
  Audit: 'execution.topology.audit',
  Storage: 'execution.topology.storage',
}
const NODE_BOX: Record<TraceSourceComponent, { x: number; y: number; width: number; height: number }> = {
  Admin: { x: 32, y: 132, width: 150, height: 56 },
  Audit: { x: 458, y: 32, width: 150, height: 56 },
  Storage: { x: 458, y: 232, width: 150, height: 56 },
}

const selectedNodeId = computed(() => {
  const activity = selectedActivity.value
  return activity?.kind === 'localStage' ? activity.nodeId : null
})

const nodeGeometry = computed<NodeGeometry[]>(() => {
  return NODE_ORDER.map(component => {
    const box = NODE_BOX[component]
    const nodeId = [...componentByNodeId.value.entries()]
      .find(([, value]) => value === component)?.[0] ?? null
    return {
      component,
      labelKey: NODE_LABEL_KEY[component],
      ...box,
      centerX: box.x + box.width / 2,
      labelY: box.y + box.height / 2 - 2,
      idY: box.y + box.height / 2 + 13,
      nodeId,
      nodeIdText: nodeId === null ? null : nodeId.length > 20 ? `${nodeId.slice(0, 19)}…` : nodeId,
      hasLocal: localStageComponents.value.has(component),
      selected: nodeId !== null && nodeId === selectedNodeId.value,
    }
  })
})
const topologyNodeDescription = computed(() => nodeGeometry.value
  .map(node => `${t(node.labelKey)}: ${node.nodeId ?? t('execution.notAvailable')}`)
  .join(' · '))

const EDGE_MIDPOINT = {
  adminAudit: { x: 316, y: 110 },
  adminStorage: { x: 316, y: 210 },
  auditStorage: { x: 533, y: 156 },
}

/**
 * The packet dot is placed only when the dispatch target node has an observed
 * worker role in this projection. An unresolved role leaves the packet in the
 * evidence list without claiming an edge.
 */
const selectedPacketDot = computed(() => {
  const activity = selectedActivity.value
  if (!activity || activity.kind !== 'confirmedPacket') return null
  const targetRole = componentByNodeId.value.get(activity.toNodeId)
  if (targetRole === 'Audit') {
    return {
      path: 'M 182 150 L 450 70',
      endX: 450,
      endY: 70,
      animated: props.animationActivityId === activity.activityId,
    }
  }
  if (targetRole === 'Storage') {
    return {
      path: 'M 182 170 L 450 250',
      endX: 450,
      endY: 250,
      animated: props.animationActivityId === activity.activityId,
    }
  }
  return null
})

const selectedPeerFlow = computed(() => {
  const activity = selectedActivity.value
  const direction = activity?.kind === 'peerCorrelation' ? activity.direction : null
  if (!activity || !direction) return null

  const source = componentByNodeId.value.get(direction.fromNodeId)
  const target = componentByNodeId.value.get(direction.toNodeId)
  if (source === 'Audit' && target === 'Storage') {
    return {
      x1: 533,
      y1: 88,
      x2: 533,
      y2: 232,
      animated: props.animationActivityId === activity.activityId,
    }
  }
  if (source === 'Storage' && target === 'Audit') {
    return {
      x1: 533,
      y1: 232,
      x2: 533,
      y2: 88,
      animated: props.animationActivityId === activity.activityId,
    }
  }
  return null
})

const peerMarkers = computed(() => {
  const hints = props.projection.peerCorrelations
  const visible = hints.slice(0, 8)
  const selected = selectedActivity.value
  if (selected?.kind === 'peerCorrelation' && !visible.some(item => item.activityId === selected.activityId)) {
    if (visible.length === 8) visible[7] = selected
    else visible.push(selected)
  }
  const step = 128 / (visible.length + 1)
  return visible.map((hint, slot) => ({
    activityId: hint.activityId,
    index: hints.findIndex(item => item.activityId === hint.activityId) + 1,
    x: EDGE_MIDPOINT.auditStorage.x + (slot % 2 === 0 ? -18 : 18),
    y: 90 + step * (slot + 1),
  }))
})

function peerMarkerIndex(activityId: string): string {
  const marker = peerMarkers.value.find(item => item.activityId === activityId)
  return marker ? String(marker.index) : ''
}

function activityPath(activity: ExecutionCommunicationActivity): string {
  if (activity.kind === 'localStage') return `${activity.component} · ${activity.nodeId} · ${activity.eventType}`
  if (activity.kind === 'confirmedPacket') return `${activity.fromNodeId} → ${activity.toNodeId}`
  if (!activity.direction) return `${activity.originNodeId} ↔ ${activity.nodeId}`
  return `${activity.direction.fromNodeId} → ${activity.direction.toNodeId} · ${activity.direction.eventType}`
}


const markerUrl = computed(() => `url(#${markerId})`)

function toggleActivity(activityId: string): void {
  emit('select-activity', activityId === props.selectedActivityId ? null : activityId)
}

function timeText(value: number | null): string {
  return value === null ? t('execution.notAvailable') : formatDateTime(value)
}

function optionalText(value: string | null): string {
  return value === null ? t('execution.notAvailable') : value
}

interface DetailField {
  key: string
  value: string
}

/** Identifier names stay visible so the distinct reference namespaces never blur. */
const detailFields = computed<DetailField[]>(() => {
  const activity = selectedActivity.value
  if (!activity) return []
  if (activity.kind === 'confirmedPacket') {
    return [
      { key: 'messageType', value: activity.messageType },
      { key: 'fromNodeId', value: activity.fromNodeId },
      { key: 'toNodeId', value: activity.toNodeId },
      { key: 'dispatchPacketId', value: activity.dispatchPacketId },
      { key: 'packetId', value: activity.packetId },
      { key: 'requestId', value: optionalText(activity.requestId) },
      { key: 'taskId', value: optionalText(activity.taskId) },
      { key: 'observedAtMs', value: timeText(activity.observedAtMs) },
      { key: 'packetTimestampMs', value: timeText(activity.packetTimestampMs) },
    ]
  }
  if (activity.kind === 'peerCorrelation') {
    const direction = activity.direction
    return [
      { key: 'linkKind', value: activity.linkKind },
      { key: 'originNodeId', value: activity.originNodeId },
      { key: 'nodeId', value: activity.nodeId },
      ...(direction ? [
        { key: 'eventType', value: direction.eventType },
        { key: 'fromNodeId', value: direction.fromNodeId },
        { key: 'toNodeId', value: direction.toNodeId },
        { key: 'observationId', value: direction.observationId },
        { key: 'recordedAtMs', value: timeText(direction.recordedAtMs) },
        { key: 'eventTimeMs', value: timeText(direction.eventTimeMs) },
      ] : []),
      { key: 'linkKey', value: activity.linkKey },
      { key: 'linkSourceRef', value: activity.linkSourceRef },
      { key: 'requestId', value: optionalText(activity.requestId) },
      { key: 'peerConversationId', value: optionalText(activity.peerConversationId) },
      { key: 'dispatchPacketId', value: optionalText(activity.dispatchPacketId) },
      { key: 'observedAtMs', value: timeText(activity.observedAtMs) },
    ]
  }

  return [
    { key: 'eventType', value: activity.eventType },
    { key: 'component', value: activity.component },
    { key: 'nodeId', value: activity.nodeId },
    { key: 'observationId', value: activity.observationId },
    { key: 'recordedAtMs', value: timeText(activity.recordedAtMs) },
    { key: 'eventTimeMs', value: timeText(activity.eventTimeMs) },
  ]
})
</script>

<style scoped>
.execution-topology {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state-block {
  margin: 0;
  padding: 8px 0;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.state-block.error {
  color: var(--apple-red, #d03050);
}

.flow-note {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.topology-canvas {
  width: 100%;
  max-width: 640px;
}

.topology-svg {
  display: block;
  width: 100%;
  height: auto;
}

.edge {
  stroke: var(--apple-gray-5);
  stroke-width: 1;
  fill: none;
}

.peer-relationship {
  stroke-dasharray: 4 4;
}

.peer-flow {
  stroke: var(--apple-blue);
  stroke-width: 2;
  stroke-dasharray: 7 5;
}

.peer-flow.animated {
  animation: peer-flow 520ms ease-out 1;

}
@keyframes peer-flow {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}

.arrow-head {
  fill: var(--apple-gray-5);
}

.node-box {
  fill: var(--apple-card);
  stroke: var(--apple-gray-5);
  stroke-width: 1;
  transition: stroke var(--apple-dur-fast) var(--apple-ease-out),
    stroke-width var(--apple-dur-fast) var(--apple-ease-out);
}

.node-box.has-local {
  stroke: var(--apple-gray-2);
  stroke-width: 1.5;
}

.node-box.selected {
  stroke: var(--apple-gray-1);
  stroke-width: 2;
}

.node-label {
  fill: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 600;
}

.node-id {
  fill: var(--apple-gray-3);
  font-size: 10px;
  font-family: var(--apple-font-mono);
}


.packet-dot {
  fill: var(--apple-gray-1);
}

.peer-marker {
  fill: var(--apple-card);
  stroke: var(--apple-gray-2);
  stroke-width: 1;
}

.peer-marker.selected {
  fill: var(--apple-gray-1);
  stroke: var(--apple-gray-1);
}

.peer-marker.selected + .peer-marker-text {
  fill: var(--apple-card);
}

.peer-marker-text {
  fill: var(--apple-gray-1);
  font-size: 9px;
  font-weight: 600;
}

.evidence-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.evidence-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-2);
}

.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.evidence-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pagination-status {
  color: var(--apple-gray-3);
  font-size: 11px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.text-button {
  padding: 4px 6px;
  color: var(--apple-blue);
  font: inherit;
  font-size: 11px;
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

.evidence-button {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--apple-gray-2);
  text-align: left;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  cursor: pointer;
  transition: border-color var(--apple-dur-fast) var(--apple-ease-out),
    background-color var(--apple-dur-fast) var(--apple-ease-out);
}

.evidence-button.selected {
  border-color: var(--apple-gray-1);
  background: color-mix(in srgb, var(--apple-gray-1) 6%, var(--apple-card));
}

.evidence-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.evidence-kind {
  flex: none;
  font-weight: 600;
  color: var(--apple-gray-1);
}

.evidence-path {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.evidence-marker {
  flex: none;
  color: var(--apple-gray-3);
}

.selected-evidence {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.selected-kind {
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-1);
}

.selected-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px 16px;
  margin: 0;
}

.selected-field {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.field-label {
  flex: none;
  color: var(--apple-gray-3);
}

.field-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-1);
}

.muted {
  color: var(--apple-gray-3);
}

.empty {
  margin: 0;
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .node-box,
  .evidence-button {
    transition: none;
  }

  .peer-flow {
    animation: none;
  }
}
</style>
