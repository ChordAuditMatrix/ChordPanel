<template>
  <n-card size="small" :bordered="true" class="overview-card apple-card-hover">
    <template #header>
      <div class="card-heading">
        <span>{{ t('dashboard.systemOverview') }}</span>
        <span v-if="available" class="health-state" role="status"><i aria-hidden="true" />{{ t('dashboard.statusAvailable') }}</span>
        <span v-else-if="loading" class="health-state is-pending" role="status">{{ t('common.loading') }}</span>
        <span v-else class="health-state is-error" role="status">{{ t('common.requestFailed') }}</span>
      </div>
    </template>
    <n-spin :show="loading && !hasMetrics">
      <div v-if="hasMetrics" class="metric-grid">
        <div v-for="metric in metrics" :key="metric.label" class="metric">
          <span class="metric-label">{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      </div>
      <n-empty v-else-if="!loading && error" :description="t('common.requestFailed')" size="small" />
      <n-empty v-else-if="!loading" :description="t('common.noData')" size="small" />
    </n-spin>
    <div v-if="uptime" class="uptime-row">
      <span>{{ t('dashboard.uptime') }}</span><strong>{{ uptime }}</strong>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  loading: boolean
  error: boolean
  available: boolean
  cpu?: number
  memory?: number
  load?: number
  uptime?: string
}>()
const { t } = useI18n()
const metrics = computed(() => [
  Number.isFinite(props.cpu) ? { label: t('dashboard.cpu'), value: `${props.cpu!.toFixed(1)}%` } : null,
  Number.isFinite(props.memory) ? { label: t('dashboard.memory'), value: `${props.memory!.toFixed(1)}%` } : null,
  Number.isFinite(props.load) ? { label: t('dashboard.load'), value: props.load!.toFixed(2) } : null,
].filter((item): item is { label: string; value: string } => item !== null))
const hasMetrics = computed(() => metrics.value.length > 0)
</script>

<style scoped>
.overview-card { height: 100%; }
.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.health-state { display: inline-flex; align-items: center; gap: 7px; color: var(--apple-green); font-size: 12px; font-weight: 600; }
.health-state i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.health-state.is-pending { color: var(--apple-gray-3); }
.health-state.is-error { color: var(--apple-red); }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 14px; }
.metric { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.metric-label, .uptime-row { color: var(--apple-gray-3); font-size: 12px; }
.metric strong, .uptime-row strong { color: var(--apple-gray-1); font-size: 20px; font-variant-numeric: tabular-nums; font-weight: 650; }
.uptime-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--apple-gray-6); }
.uptime-row strong { font-size: 14px; }
</style>
