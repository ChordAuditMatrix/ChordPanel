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
            <marker
              :id="flowMarkerId"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path class="arrow-head directed" d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>

          <!-- Fixed role edges; the token and the drawn line share the same endpoints. -->
          <line
            class="edge"
            :x1="EDGES.adminAudit.x1"
            :y1="EDGES.adminAudit.y1"
            :x2="EDGES.adminAudit.x2"
            :y2="EDGES.adminAudit.y2"
            :marker-end="markerUrl"
          />
          <line
            class="edge"
            :x1="EDGES.adminStorage.x1"
            :y1="EDGES.adminStorage.y1"
            :x2="EDGES.adminStorage.x2"
            :y2="EDGES.adminStorage.y2"
            :marker-end="markerUrl"
          />
          <line
            v-if="projection.peerCorrelations.length"
            class="edge peer-relationship"
            :x1="EDGES.auditStorage.x1"
            :y1="EDGES.auditStorage.y1"
            :x2="EDGES.auditStorage.x2"
            :y2="EDGES.auditStorage.y2"
          />


          <g v-for="node in nodeGeometry" :key="node.component">
            <rect
              class="node-box"
              :class="{
                'has-local': node.hasLocal,
                selected: node.selected,
                addressed: node.addressed,
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
          <rect
            v-if="localNodePulse"
            :key="`local-node-pulse:${localNodePulse.activityId}`"
            class="node-local-pulse"
            :x="localNodePulse.x"
            :y="localNodePulse.y"
            :width="localNodePulse.width"
            :height="localNodePulse.height"
            rx="12"
          />

          <!-- A directed peer relation keeps its arrow; the trace carries the emphasis. -->
          <line
            v-if="peerMotion"
            :key="`peer-flow:${selectedActivityId ?? ''}`"
            class="peer-flow"
            :x1="peerMotion.x1"
            :y1="peerMotion.y1"
            :x2="peerMotion.x2"
            :y2="peerMotion.y2"
            :marker-end="flowMarkerUrl"
          />

          <!-- A soft ribbon sweeps the active edge under the moving trace. -->
          <line
            v-if="activeFlow?.animated"
            :key="`flow-ribbon:${selectedActivityId ?? ''}`"
            class="flow-ribbon"
            :class="[activeFlow.token ? 'packet' : 'peer', { 'is-looping': activeFlowLooping }]"
            :x1="activeFlow.x1"
            :y1="activeFlow.y1"
            :x2="activeFlow.x2"
            :y2="activeFlow.y2"
            pathLength="100"
            :style="motionStyle(activeFlow.durationMs)"
          />

          <!-- A trace runs the exact resolved segment once; it is never a latency claim. -->
          <line
            v-if="activeFlow?.animated"
            :key="`flow-trace:${selectedActivityId ?? ''}`"
            class="flow-trace"
            :class="[activeFlow.token ? 'packet' : 'peer', { 'is-looping': activeFlowLooping }]"
            :x1="activeFlow.x1"
            :y1="activeFlow.y1"
            :x2="activeFlow.x2"
            :y2="activeFlow.y2"
            pathLength="100"
            :style="motionStyle(activeFlow.durationMs)"
          />

          <!-- Only a confirmed TaskDispatchReq may draw a token; a peer direction never does. -->
          <circle
            v-if="activeFlow?.token && !activeFlow.animated"
            :key="`packet-fact:${selectedActivityId ?? ''}`"
            class="packet-dot"
            :cx="activeFlow.x2"
            :cy="activeFlow.y2"
            r="5"
          />
          <circle
            v-else-if="activeFlow?.token"
            :key="`packet-token:${selectedActivityId ?? ''}`"
            class="packet-token"
            cx="0"
            cy="0"
            r="5"
          >
            <animateMotion
              :path="activeFlow.path"
              :dur="`${activeFlow.durationMs}ms`"
              :repeatCount="activeFlowLooping ? 'indefinite' : '1'"
              fill="freeze"
            />
          </circle>
          <!-- A moving arrowhead makes the evidence direction visible in the topology. -->
          <path
            v-if="activeFlow?.animated"
            :key="`flow-arrow:${selectedActivityId ?? ''}`"
            class="flow-arrow"
            :class="activeFlow.token ? 'packet' : 'peer'"
            d="M -9 -4.5 L0 0 L-9 4.5 Z"
          >
            <animateMotion
              :path="activeFlow.path"
              :dur="`${activeFlow.durationMs}ms`"
              :repeatCount="activeFlowLooping ? 'indefinite' : '1'"
              rotate="auto"
              fill="freeze"
            />
          </path>

          <!-- The destination answers after the trace arrives, then stays focused. -->
          <rect
            v-if="responseNode"
            :key="`node-response:${selectedActivityId ?? ''}`"
            class="node-response"
            :class="{ animated: responseNode.animated }"
            :x="responseNode.x"
            :y="responseNode.y"
            :width="responseNode.width"
            :height="responseNode.height"
            rx="9"
            :style="motionStyle(responseNode.durationMs)"
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
import type { CSSProperties } from 'vue'
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
 *  - a confirmed TaskDispatchReq packet becomes a single token that rides its
 *    resolved edge, then leaves a static fact dot at the destination;
 *  - an undirected peer relation has no arrow, token, or message claim;
 *  - a peer direction requires an exact requestId and sender-node stage fact,
 *    and is drawn as a directional trace, never as a packet token;
 *  - the destination node answers after the trace arrives and stays focused;
 *  - selecting an observed local Worker event emits one bounded node-response pulse, never a packet or edge;
 *  - reduced motion removes only the travel; the fact, the direction and the
 *    destination focus remain.
 *
 * Travel durations are presentation only and are derived from the drawn
 * segment, so no motion implies a measured round trip.
 *
 * The parent keeps this view mounted across mode switches and owns selection.

 */

const props = withDefaults(defineProps<{
  projection: ExecutionCommunicationProjection
  /** Node identities are copied only from the active Job's persisted metadata and exact links. */
  roleNodeIds?: Partial<Record<TraceSourceComponent, string | null>>
  selectedActivityId?: string | null
  animationActivityId?: string | null
  /** Selected activities whose stage is still executing; motion loops until it completes. */
  loopActivityIds?: readonly string[]
  disabled?: boolean
  loading?: boolean
  error?: string | null
}>(), { roleNodeIds: () => ({}), selectedActivityId: null, animationActivityId: null, loopActivityIds: () => [], disabled: false, loading: false, error: null })

const emit = defineEmits<{
  (event: 'select-activity', activityId: string | null): void
  (event: 'manual-explore'): void
}>()
const { t } = useI18n()
const flowNoteId = `execution-topology-note-${useId()}`
const markerId = `execution-topology-arrow-${useId()}`
const flowMarkerId = `execution-topology-flow-arrow-${useId()}`

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
  localStage: 'execution.topology.nodeLocalEvent',
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
  /** Destination of the selected resolved flow; stays focused after arrival. */
  addressed: boolean
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

/** Fixed role edges: the line, the trace and the token read the same endpoints. */
const EDGES = {
  adminAudit: { x1: 182, y1: 150, x2: 450, y2: 70 },
  adminStorage: { x1: 182, y1: 170, x2: 450, y2: 250 },
  auditStorage: { x1: 533, y1: 88, x2: 533, y2: 232 },
  storageAudit: { x1: 533, y1: 232, x2: 533, y2: 88 },
} as const

type FlowTargetRole = 'Audit' | 'Storage'

interface ResolvedFlow {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Exactly the drawn segment; the SMIL token follows this path. */
  path: string
  durationMs: number
  animated: boolean
  targetRole: FlowTargetRole
  /** A confirmed TaskDispatchReq is the only flow that may draw a token. */
  token: boolean
}

/**
 * Travel time is presentation only. It scales with the drawn segment so a short
 * hop stays readable, and never encodes an observed interval.
 */
const TRAVEL_BASE_MS = 520
const TRAVEL_MAX_MS = 1_000
const TRAVEL_MS_PER_UNIT = 1.2

function travelDuration(x1: number, y1: number, x2: number, y2: number): number {
  const distance = Math.hypot(x2 - x1, y2 - y1)
  return Math.min(TRAVEL_MAX_MS, Math.round(TRAVEL_BASE_MS + distance * TRAVEL_MS_PER_UNIT))
}

interface MotionStyle extends CSSProperties {
  '--travel-duration': string
}

function motionStyle(durationMs: number): MotionStyle {
  return { '--travel-duration': `${durationMs}ms` }
}

function resolvedFlow(
  edge: { x1: number; y1: number; x2: number; y2: number },
  targetRole: FlowTargetRole,
  activityId: string,
  token: boolean,
): ResolvedFlow {
  return {
    ...edge,
    path: `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`,
    durationMs: travelDuration(edge.x1, edge.y1, edge.x2, edge.y2),
    animated: props.animationActivityId === activityId && !prefersReducedMotion.value,
    targetRole,
    token,
  }
}

const selectedNodeId = computed(() => {
  const activity = selectedActivity.value
  return activity?.kind === 'localStage' ? activity.nodeId : null
})

/**
 * A packet token exists only when the dispatch target resolves to an observed
 * Audit/Storage role. An unresolved role leaves the packet in the evidence list
 * without claiming an edge.
 */
const packetMotion = computed<ResolvedFlow | null>(() => {
  const activity = selectedActivity.value
  if (!activity || activity.kind !== 'confirmedPacket') return null
  const targetRole = componentByNodeId.value.get(activity.toNodeId)
  if (targetRole === 'Audit') {
    return resolvedFlow(EDGES.adminAudit, targetRole, activity.activityId, true)
  }
  if (targetRole === 'Storage') {
    return resolvedFlow(EDGES.adminStorage, targetRole, activity.activityId, true)
  }
  return null
})

/**
 * Peer evidence never becomes a packet: only an exact observed direction whose
 * endpoints resolve to the Audit/Storage roles may draw a relationship flow.
 * `ProofReturnedToAudit` stays an Audit-acceptance direction, not a dispatch.
 */
const peerMotion = computed<ResolvedFlow | null>(() => {
  const activity = selectedActivity.value
  const direction = activity?.kind === 'peerCorrelation' ? activity.direction : null
  if (!activity || !direction) return null

  const source = componentByNodeId.value.get(direction.fromNodeId)
  const target = componentByNodeId.value.get(direction.toNodeId)
  if (source === 'Audit' && target === 'Storage') {
    return resolvedFlow(EDGES.auditStorage, target, activity.activityId, false)
  }
  if (source === 'Storage' && target === 'Audit') {
    return resolvedFlow(EDGES.storageAudit, target, activity.activityId, false)
  }
  return null
})

const activeFlow = computed(() => packetMotion.value ?? peerMotion.value)

const activeFlowLooping = computed(() =>
  activeFlow.value?.animated === true
  && props.selectedActivityId !== null
  && props.loopActivityIds.includes(props.selectedActivityId),
)

const addressedComponent = computed<TraceSourceComponent | null>(
  () => activeFlow.value?.targetRole ?? null,
)

/**
 * The destination frame stays while its activity is selected; only the arrival
 * settle waits for the trace. Reduced motion keeps the static frame.
 */
const responseNode = computed(() => {
  const flow = activeFlow.value
  if (!flow) return null
  const box = NODE_BOX[flow.targetRole]
  return {
    x: box.x - 4,
    y: box.y - 4,
    width: box.width + 8,
    height: box.height + 8,
    durationMs: flow.durationMs,
    animated: flow.animated,
  }
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
      addressed: component === addressedComponent.value,
    }
  })
})
const localNodePulse = computed(() => {
  const activity = selectedActivity.value
  if (
    !activity
    || activity.kind !== 'localStage'
    || activity.sourceQuality !== 'observed'
    || activity.activityId !== props.animationActivityId
    || prefersReducedMotion.value
  ) return null

  const node = nodeGeometry.value.find(item => item.nodeId === activity.nodeId)
  if (!node) return null
  return {
    activityId: activity.activityId,
    x: node.x - 6,
    y: node.y - 6,
    width: node.width + 12,
    height: node.height + 12,
  }
})
const topologyNodeDescription = computed(() => nodeGeometry.value
  .map(node => `${t(node.labelKey)}: ${node.nodeId ?? t('execution.notAvailable')}`)
  .join(' · '))

const EDGE_MIDPOINT = {
  adminAudit: { x: 316, y: 110 },
  adminStorage: { x: 316, y: 210 },
  auditStorage: { x: 533, y: 156 },
}

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
  if (activity.kind === 'confirmedPacket') return `${activity.messageType} · ${activity.fromNodeId} → ${activity.toNodeId}`
  if (!activity.direction) return `${activity.originNodeId} ↔ ${activity.nodeId}`
  const shortLabel = activity.direction.eventType === 'ProofReturnedToAudit'
    ? t('execution.sequenceChart.proofAccepted')
    : t('execution.sequenceChart.challengeDelivered')
  return `${activity.direction.fromNodeId} → ${activity.direction.toNodeId} · ${shortLabel}`
}


const markerUrl = computed(() => `url(#${markerId})`)
const flowMarkerUrl = computed(() => `url(#${flowMarkerId})`)

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

/* A directed peer relation keeps a static arrow; the moving trace carries emphasis. */
.peer-flow {
  stroke: var(--apple-blue);
  stroke-width: 2;
  stroke-dasharray: 7 5;
}

/* One short trace runs the exact resolved segment once, then clears. */
.flow-trace {
  fill: none;
  stroke: var(--apple-blue);
  stroke-linecap: round;
  animation: flow-trace-travel var(--travel-duration, 960ms) cubic-bezier(0.3, 0.6, 0.35, 1) 1 both;
}

.flow-trace.packet {
  stroke-width: 2.4;
  stroke-dasharray: 18 100;
}

/* The peer wave is a dotted direction cue, never a packet token. */
.flow-trace.peer {
  stroke-width: 2.2;
  stroke-dasharray: 2 8;
}

.flow-arrow {
  fill: var(--apple-blue);
  stroke: none;
}

.flow-arrow.peer {
  fill: var(--apple-blue);
}

.flow-ribbon {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 18 100;
  opacity: 0;
  animation: flow-ribbon-travel var(--travel-duration, 1000ms) cubic-bezier(0.23, 1, 0.32, 1) 1 both;
}

.flow-ribbon.peer {
  stroke-width: 7;
  stroke-dasharray: 12 100;
}

.flow-trace.is-looping,
.flow-ribbon.is-looping {
  animation-iteration-count: infinite;
}

@keyframes flow-ribbon-travel {
  from { stroke-dashoffset: 100; opacity: 0; }
  12% { opacity: 0.34; }
  78% { opacity: 0.34; }
  to { stroke-dashoffset: -40; opacity: 0; }
}
@keyframes flow-trace-travel {
  from { stroke-dashoffset: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  to { stroke-dashoffset: -100; opacity: 0; }
}

.arrow-head {
  fill: var(--apple-gray-5);
}

.arrow-head.directed {
  fill: var(--apple-blue);
}

.node-box {
  fill: var(--apple-card);
  stroke: var(--apple-gray-5);
  stroke-width: 1;
  transition: fill var(--apple-dur-fast) var(--apple-ease-out),
    stroke var(--apple-dur-fast) var(--apple-ease-out),
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

.node-box.addressed {
  fill: color-mix(in srgb, var(--apple-blue) 7%, var(--apple-card));
  stroke: var(--apple-blue);
  stroke-width: 2;
}

.node-local-pulse {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 2;
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: local-node-response 760ms var(--apple-ease-out) 1 both;
}

@keyframes local-node-response {
  from { opacity: 0.78; transform: scale(0.98); }
  45% { opacity: 0.42; }
  to { opacity: 0; transform: scale(1.08); }
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
  fill: var(--apple-blue);
}

.packet-token {
  fill: var(--apple-blue);
  stroke: var(--apple-card);
  stroke-width: 1.2;
}

/* The destination answers only after the trace arrives, then holds the frame. */
.node-response {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 1.5;
  stroke-dasharray: 6 5;
  pointer-events: none;
}

.node-response.animated {
  animation: node-response-settle 320ms var(--apple-ease-out) var(--travel-duration, 1000ms) 1 both;
}

@keyframes node-response-settle {
  from { opacity: 0; stroke-dashoffset: 22; }
  30% { opacity: 0.95; }
  to { opacity: 1; stroke-dashoffset: 0; }
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

  /* Only travel is removed; the fact, the direction and the destination focus stay. */
  .flow-trace,
  .flow-arrow,
  .flow-ribbon,
  .packet-token {
    display: none;
  }

  .node-response.animated {
    animation: none;
  }
}
</style>
