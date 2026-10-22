<template>
  <n-card size="small" :bordered="true" class="overview-card apple-card-hover">
    <template #header>
      <div class="card-heading">
        <span class="card-title">{{ t('dashboard.topology') }}</span>
        <span class="heading-meta">
          <span v-if="error" class="error-state" role="status">{{ t('common.requestFailed') }}</span>
          <span v-if="nodes.length" class="node-count">{{ t('dashboard.nodesCount', { n: nodes.length }) }}</span>
          <span v-if="draining" class="draining-chip">{{ t('dashboard.draining') }} {{ draining }}</span>
          <router-link class="management-link" to="/nodes">{{ t('menu.nodes') }}<span aria-hidden="true">↗</span></router-link>
        </span>
      </div>
    </template>
    <ClusterTopology
      :nodes="nodes"
      :loading="nodesLoading"
      :error="nodesError"
      :activity-projection="activityProjection"
      :activity-scope="activityScope"
      :activity-loading="activityLoading"
      :activity-error="activityError"
      :selected-activity-id="selectedActivityId"
      @select-activity="emit('select-activity', $event)"
    />
  </n-card>
</template>

<script setup lang="ts">
import ClusterTopology from './ClusterTopology.vue'
import type { NodeSummary } from '@/api/system'
import type { ExecutionCommunicationProjection } from '@/features/execution/data/executionCommunication'
import { useI18n } from '@/stores/i18n'

withDefaults(defineProps<{
  /** Cluster summary request failed; the node catalog may still be current. */
  error: boolean
  /** Nodes the backend reports as draining; shown only when non-zero. */
  draining?: number
  nodes: NodeSummary[]
  nodesLoading: boolean
  nodesError: boolean
  activityProjection?: ExecutionCommunicationProjection | null
  activityScope?: string | null
  activityLoading?: boolean
  activityError?: boolean
  selectedActivityId?: string | null
}>(), {
  draining: undefined,
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
</script>

<style scoped>
.overview-card { height: 100%; }
.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-title { color: var(--apple-gray-1); font-size: 13px; font-weight: 650; }
.heading-meta { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.node-count { color: var(--apple-gray-4); font-size: 11px; font-variant-numeric: tabular-nums; }
.draining-chip {
  padding: 1px 7px;
  border: 1px solid var(--apple-gray-6);
  border-radius: 999px;
  color: var(--apple-orange);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.error-state { color: var(--apple-red); font-size: 11px; font-weight: 500; }
.management-link { color: var(--apple-blue); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.management-link span { margin-left: 4px; }
.management-link:hover { color: var(--apple-blue-hover); }
@media (max-width: 440px) {
  .node-count { display: none; }
}
</style>
