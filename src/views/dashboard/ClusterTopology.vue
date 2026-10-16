<template>
  <section class="topology-panel" :aria-label="t('dashboard.topology')">
    <div class="topology-heading">
      <span>{{ t('dashboard.topology') }}</span>
      <span class="topology-count">{{ t('dashboard.nodesCount', { n: nodes.length }) }}</span>
    </div>

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

    <div v-else class="topology-scroll">
      <svg
        class="topology-svg"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
        role="img"
        :aria-label="t('dashboard.topologyDescription', { n: nodes.length })"
      >
        <title>{{ t('dashboard.topologyDescription', { n: nodes.length }) }}</title>
        <line
          v-for="point in layout.points"
          :key="`link-${point.node.nodeId}`"
          class="topology-link"
          :x1="layout.centerX"
          :y1="layout.centerY"
          :x2="point.x"
          :y2="point.y"
        />
        <circle class="admin-hub-ring" :cx="layout.centerX" :cy="layout.centerY" r="30" />
        <circle class="admin-hub-core" :cx="layout.centerX" :cy="layout.centerY" r="21" />
        <text class="admin-hub-label" :x="layout.centerX" :y="layout.centerY + 4" text-anchor="middle">Admin</text>

        <g v-for="point in layout.points" :key="point.node.nodeId" class="topology-node">
          <title>{{ nodeTitle(point.node) }}</title>
          <circle
            class="topology-node-ring"
            :class="availabilityClass(point.node)"
            :cx="point.x"
            :cy="point.y"
            r="8"
          />
          <circle
            class="topology-node-core"
            :class="availabilityClass(point.node)"
            :cx="point.x"
            :cy="point.y"
            r="3"
          />
          <text
            class="topology-node-label"
            :x="point.labelX"
            :y="point.labelY"
            :text-anchor="point.labelAnchor"
          >{{ shortNodeId(point.node.nodeId) }}</text>
        </g>
      </svg>
    </div>

    <div v-if="nodes.length" class="topology-legend" aria-hidden="true">
      <span><i class="is-available" />{{ t('dashboard.available') }}</span>
      <span><i class="is-unavailable" />{{ t('dashboard.unavailable') }}</span>
      <span><i class="is-unknown" />{{ t('dashboard.stateUnknown') }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeSummary } from '@/api/system'
import { useI18n } from '@/stores/i18n'

const RING_CAPACITY = 8
const FIRST_RING_RADIUS = 76
const RING_SPACING = 62

const props = defineProps<{
  nodes: readonly NodeSummary[]
  loading: boolean
  error: boolean
}>()

const { t } = useI18n()

const layout = computed(() => {
  const ringCount = Math.max(1, Math.ceil(props.nodes.length / RING_CAPACITY))
  const outerRadius = FIRST_RING_RADIUS + (ringCount - 1) * RING_SPACING
  const width = Math.max(420, outerRadius * 2 + 88)
  const height = Math.max(236, outerRadius * 2 + 44)
  const centerX = width / 2
  const centerY = height / 2
  const points = props.nodes.map((node, index) => {
    const ring = Math.floor(index / RING_CAPACITY)
    const indexInRing = index % RING_CAPACITY
    const countInRing = Math.min(RING_CAPACITY, props.nodes.length - ring * RING_CAPACITY)
    const radius = FIRST_RING_RADIUS + ring * RING_SPACING
    const angle = -Math.PI / 2 + (2 * Math.PI * indexInRing) / countInRing
    const x = centerX + radius * Math.cos(angle)
    const y = centerY + radius * Math.sin(angle)
    const labelAnchor = x >= centerX ? 'start' as const : 'end' as const
    return {
      node,
      x,
      y,
      labelAnchor,
      labelX: x + (labelAnchor === 'start' ? 13 : -13),
      labelY: y + 3,
    }
  })
  return { width, height, centerX, centerY, points }
})

function availabilityClass(node: NodeSummary): string {
  if (node.isAvailable === true) return 'is-available'
  if (node.isAvailable === false) return 'is-unavailable'
  return 'is-unknown'
}

function shortNodeId(nodeId: string): string {
  return nodeId.length > 14 ? `${nodeId.slice(0, 11)}…` : nodeId
}

function nodeTitle(node: NodeSummary): string {
  const role = typeof node.role === 'string' && node.role.length > 0 ? node.role : t('dashboard.stateUnknown')
  return `${node.nodeId} · ${role} · ${availabilityClass(node) === 'is-available' ? t('dashboard.available') : availabilityClass(node) === 'is-unavailable' ? t('dashboard.unavailable') : t('dashboard.stateUnknown')}`
}
</script>

<style scoped>
.topology-panel { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--apple-gray-6); }
.topology-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--apple-gray-2); font-size: 11px; font-weight: 650; }
.topology-count { color: var(--apple-gray-4); font-size: 10px; font-weight: 500; font-variant-numeric: tabular-nums; }
.topology-notice,
.topology-state { margin: 10px 0 0; color: var(--apple-gray-3); font-size: 11px; }
.topology-notice { color: var(--apple-orange); }
.topology-state.is-error { color: var(--apple-red); }
.topology-scroll { max-height: 300px; margin-top: 8px; overflow: auto; border-radius: 10px; }
.topology-svg { display: block; max-width: none; }
.topology-link { stroke: var(--apple-gray-5); stroke-width: 1.2; opacity: 0.72; }
.admin-hub-ring { fill: color-mix(in srgb, var(--apple-blue) 12%, transparent); stroke: var(--apple-blue); stroke-width: 1.5; }
.admin-hub-core { fill: var(--apple-card); stroke: var(--apple-blue); stroke-width: 1.5; }
.admin-hub-label { fill: var(--apple-blue); font-size: 10px; font-weight: 700; }
.topology-node-ring { fill: var(--apple-card); stroke-width: 1.5; }
.topology-node-core { stroke: none; }
.is-available.topology-node-ring { stroke: var(--apple-green); }
.is-available.topology-node-core { fill: var(--apple-green); }
.is-unavailable.topology-node-ring { stroke: var(--apple-red); }
.is-unavailable.topology-node-core { fill: var(--apple-red); }
.is-unknown.topology-node-ring { stroke: var(--apple-gray-4); }
.is-unknown.topology-node-core { fill: var(--apple-gray-4); }
.topology-node-label { fill: var(--apple-gray-2); font-size: 9px; font-family: var(--apple-font-mono); }
.topology-legend { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 8px; color: var(--apple-gray-4); font-size: 10px; }
.topology-legend span { display: inline-flex; align-items: center; gap: 5px; }
.topology-legend i { width: 6px; height: 6px; border-radius: 50%; }
.topology-legend .is-available { background: var(--apple-green); }
.topology-legend .is-unavailable { background: var(--apple-red); }
.topology-legend .is-unknown { background: var(--apple-gray-4); }

@media (max-width: 640px) {
  .topology-scroll { max-height: 230px; }
}
</style>
