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
        :waiting-text="t('dashboard.waitingForSamples')"
      />
    </div>
    <div v-if="uptime" class="resource-item is-uptime">
      <span class="resource-label">{{ t('dashboard.uptime') }}</span>
      <strong class="resource-value">{{ uptime }}</strong>
    </div>
    <p v-if="!hasMetrics && loading" class="resource-state" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!hasMetrics && error" class="resource-state is-error" role="status">
      {{ t('common.requestFailed') }}
    </p>
    <p v-else-if="!hasMetrics" class="resource-state">{{ t('common.noData') }}</p>
    <template v-else>
      <span v-if="error" class="resource-state is-error" role="status">{{ t('common.requestFailed') }}</span>
      <span class="resource-samples">{{ t('dashboard.recentSamples', { n: samples.length }) }}</span>
    </template>
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

const metrics = computed(() => [
  Number.isFinite(props.cpu) ? { key: 'cpu', label: t('dashboard.cpu'), value: `${props.cpu!.toFixed(1)}%`, color: 'var(--apple-blue)', points: pointsFor('cpuUsage') } : null,
  Number.isFinite(props.memory) ? { key: 'memory', label: t('dashboard.memory'), value: `${props.memory!.toFixed(1)}%`, color: 'var(--apple-green)', points: pointsFor('memoryUsage') } : null,
  Number.isFinite(props.load) ? { key: 'load', label: t('dashboard.load'), value: props.load!.toFixed(2), color: 'var(--apple-orange)', points: pointsFor('load') } : null,
].filter((item): item is { key: string; label: string; value: string; color: string; points: MetricPoint[] } => item !== null))
const hasMetrics = computed(() => metrics.value.length > 0)
</script>

<style scoped>
/* Secondary band: real resources stay readable without competing with the topology. */
.resource-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 6px 26px;
  padding-top: 12px;
}
.resource-item { display: flex; flex: 1 1 132px; flex-direction: column; gap: 3px; min-width: 110px; max-width: 220px; }
.resource-item.is-uptime { flex: 0 0 auto; align-items: flex-start; max-width: none; gap: 2px; padding-bottom: 4px; }
.resource-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.resource-label { color: var(--apple-gray-4); font-size: 10px; letter-spacing: 0.03em; text-transform: uppercase; }
.resource-value { color: var(--apple-gray-2); font-size: 13px; font-variant-numeric: tabular-nums; font-weight: 600; }
.resource-item.is-uptime .resource-value { color: var(--apple-gray-3); font-size: 11px; font-weight: 500; }
.resource-state { margin: 0 0 4px; color: var(--apple-gray-4); font-size: 11px; }
.resource-state.is-error { color: var(--apple-red); }
.resource-samples { margin-left: auto; color: var(--apple-gray-4); font-size: 10px; text-align: right; }
.resource-strip :deep(.metric-trend-chart),
.resource-strip :deep(.metric-trend-waiting) { height: 26px; }
@media (max-width: 760px) {
  .resource-strip { gap: 8px 18px; }
  .resource-item { flex-basis: 96px; min-width: 92px; }
}
</style>
