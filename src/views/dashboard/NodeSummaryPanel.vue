<template>
  <n-card size="small" :bordered="true" class="overview-card apple-card-hover">
    <template #header>
      <div class="card-heading">
        <span>{{ t('dashboard.clusterOverview') }}</span>
        <span v-if="error" class="error-state">{{ t('common.requestFailed') }}</span>
        <router-link class="management-link" to="/nodes">{{ t('menu.nodes') }}<span aria-hidden="true">↗</span></router-link>
      </div>
    </template>
    <n-spin :show="loading && !hasCounts">
      <div v-if="hasCounts" class="node-grid">
        <div v-for="item in counts" :key="item.label" class="node-stat">
          <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
        </div>
      </div>
      <n-empty v-else-if="!loading && error" :description="t('common.requestFailed')" size="small" />
      <n-empty v-else-if="!loading" :description="t('dashboard.noNodeData')" size="small" />
    </n-spin>
    <div v-if="roles.length" class="role-list">
      <span v-for="role in roles" :key="role.name" class="role-item">
        <span class="role-dot" aria-hidden="true" />{{ role.name }} <strong>{{ role.count }}</strong>
      </span>
    </div>
    <ClusterTopology :nodes="nodes" :loading="nodesLoading" :error="nodesError" />
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ClusterTopology from './ClusterTopology.vue'
import type { NodeSummary } from '@/api/system'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  loading: boolean
  error: boolean
  total?: number
  available?: number
  unavailable?: number
  draining?: number
  nodesByRole?: Record<string, number>
  nodes: NodeSummary[]
  nodesLoading: boolean
  nodesError: boolean
}>()
const { t } = useI18n()
const counts = computed(() => [
  { label: t('dashboard.totalNodes'), value: props.total },
  { label: t('dashboard.available'), value: props.available },
  { label: t('dashboard.unavailable'), value: props.unavailable },
  { label: t('dashboard.draining'), value: props.draining },
].filter((item): item is { label: string; value: number } => Number.isFinite(item.value)))
const hasCounts = computed(() => counts.value.length > 0)
const roles = computed(() => Object.entries(props.nodesByRole ?? {})
  .filter(([, count]) => Number.isFinite(count))
  .map(([name, count]) => ({ name, count })))
</script>

<style scoped>
.overview-card { height: 100%; }
.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.management-link { color: var(--apple-blue); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.management-link span { margin-left: 4px; }
.management-link:hover { color: var(--apple-blue-hover); }
.node-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.error-state { color: var(--apple-red); font-size: 11px; font-weight: 500; }
.node-stat { display: flex; justify-content: space-between; gap: 8px; color: var(--apple-gray-3); font-size: 12px; }
.node-stat strong { color: var(--apple-gray-1); font-size: 16px; font-variant-numeric: tabular-nums; }
.role-list { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--apple-gray-6); }
.role-item { display: inline-flex; align-items: center; gap: 5px; color: var(--apple-gray-3); font-size: 11px; text-transform: capitalize; }
.role-item strong { color: var(--apple-gray-1); font-variant-numeric: tabular-nums; }
.role-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--apple-blue); }
@media (max-width: 440px) { .node-grid { gap: 12px 10px; } }
.cluster-topology { min-width: 0; }
</style>
