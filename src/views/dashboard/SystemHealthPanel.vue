<template>
  <section class="resource-strip" :aria-label="t('dashboard.systemOverview')" :aria-busy="loading">
    <div v-for="metric in metrics" :key="metric.key" class="resource-item">
      <div class="resource-head">
        <span class="resource-label">{{ metric.label }}</span>
        <strong class="resource-value">{{ metric.value }}</strong>
      </div>
      <MetricTrendChart
        :label="metric.label"
        :points="metric.points"
        :color="metric.color"
      />
    </div>
    <p v-if="!hasMetrics && loading" class="resource-state" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!hasMetrics && error" class="resource-state is-error" role="status">
      {{ t('common.requestFailed') }}
    </p>
    <p v-else-if="!hasMetrics" class="resource-state">{{ t('common.noData') }}</p>
    <div v-if="uptime || hasMetrics" class="resource-meta">
      <div v-if="uptime" class="resource-uptime">
        <span class="resource-label">{{ t('dashboard.uptime') }}</span>
        <strong class="resource-value">{{ uptime }}</strong>
      </div>
      <span v-if="hasMetrics && error" class="resource-state resource-status is-error" role="status">{{ t('common.requestFailed') }}</span>
      <span v-else-if="hasMetrics && hasIncompleteTrend" class="resource-state resource-status" role="status">{{ t('dashboard.waitingForSamples') }}</span>
      <span v-if="hasMetrics" class="resource-samples">{{ t('dashboard.recentSamples', { n: samples.length }) }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/stores/i18n'
import MetricTrendChart from './MetricTrendChart.vue'
import type { MetricPoint, SystemMetricSample } from './types'

const props = defineProps<{
  loading: boolean
  error: boolean
  cpu?: number
  memory?: number
  load?: number
  uptime?: string
  samples: SystemMetricSample[]
}>()
const { t } = useI18n()
function pointsFor(field: 'cpuUsage' | 'memoryUsage' | 'load'): MetricPoint[] {
  return props.samples.flatMap(sample => {
    const value = sample[field]
    return typeof value === 'number' && Number.isFinite(value)
      ? [{ observedAtMs: sample.observedAtMs, value }]
      : []
  })
}

type HealthMetric = {
  key: 'cpu' | 'memory' | 'load'
  label: string
  value: string
  color: string
  points: MetricPoint[]
}

const metrics = computed<HealthMetric[]>(() => [
  Number.isFinite(props.cpu) ? { key: 'cpu', label: t('dashboard.cpu'), value: `${props.cpu!.toFixed(1)}%`, color: 'var(--apple-blue)', points: pointsFor('cpuUsage') } : null,
  Number.isFinite(props.memory) ? { key: 'memory', label: t('dashboard.memory'), value: `${props.memory!.toFixed(1)}%`, color: 'var(--apple-green)', points: pointsFor('memoryUsage') } : null,
  Number.isFinite(props.load) ? { key: 'load', label: t('dashboard.load'), value: props.load!.toFixed(2), color: 'var(--apple-orange)', points: pointsFor('load') } : null,
].filter((item): item is HealthMetric => item !== null))
const hasMetrics = computed(() => metrics.value.length > 0)
const hasIncompleteTrend = computed(() => metrics.value.some(metric => metric.points.length < 2))
</script>

<style scoped>
.resource-strip {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 6px 26px;
  padding-top: 10px;
}
.resource-item { display: flex; min-width: 110px; max-width: 220px; flex: 1 1 132px; flex-direction: column; gap: 3px; }
.resource-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.resource-label { color: var(--apple-gray-4); font-size: 10px; letter-spacing: 0.03em; text-transform: uppercase; }
.resource-value { color: var(--apple-gray-2); font-size: 13px; font-variant-numeric: tabular-nums; font-weight: 600; }
.resource-state { margin: 0 0 4px; color: var(--apple-gray-4); font-size: 11px; }
.resource-state.is-error { color: var(--apple-red); }
.resource-meta { display: flex; flex: 1 1 100%; min-width: 0; align-items: center; flex-wrap: wrap; gap: 4px 16px; margin-top: 2px; }
.resource-uptime { display: flex; flex: 0 0 auto; min-width: 0; flex-direction: column; gap: 2px; }
.resource-uptime .resource-value { color: var(--apple-gray-3); font-size: 11px; font-weight: 500; }
.resource-status { flex: 1 1 180px; margin: 0; }
.resource-samples { margin-left: auto; color: var(--apple-gray-4); font-size: 10px; text-align: right; }
.resource-strip > .resource-state { flex: 1 1 100%; }
.resource-strip :deep(.metric-trend-chart),
.resource-strip :deep(.metric-trend-waiting) { height: 26px; }
@media (max-width: 760px) {
  .resource-strip { gap: 8px 18px; }
  .resource-item { flex-basis: 96px; min-width: 92px; }
  .resource-meta { gap: 4px 12px; }
  .resource-uptime { order: 1; }
  .resource-samples { order: 2; }
  .resource-status { flex-basis: 100%; order: 3; }
}
</style>
