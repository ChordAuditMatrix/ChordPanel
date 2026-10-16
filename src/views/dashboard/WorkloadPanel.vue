<template>
  <n-card size="small" :bordered="true" class="overview-card apple-card-hover">
    <template #header>
      <div class="panel-heading">
        <span>{{ t('dashboard.taskOverview') }}</span>
        <router-link to="/jobs">{{ t('dashboard.viewJobs') }} <span aria-hidden="true">↗</span></router-link>
      </div>
    </template>
    <div class="workload-grid">
      <div class="workload-cell">
        <span class="metric-label">{{ t('dashboard.activeJobs') }}</span>
        <n-spin v-if="jobsLoading && activeJobs === undefined" size="small" />
        <strong v-else-if="activeJobs !== undefined">{{ activeJobs }}</strong>
        <span v-else class="unavailable">{{ jobsError ? t('common.requestFailed') : t('common.noData') }}</span>
      </div>
      <div class="workload-cell">
        <span class="metric-label">{{ t('dashboard.queueDepth') }}</span>
        <n-spin v-if="statusLoading && queueDepth === undefined" size="small" />
        <strong v-else-if="queueDepth !== undefined">{{ queueDepth }}</strong>
        <span v-else class="unavailable">{{ statusError ? t('common.requestFailed') : t('common.noData') }}</span>
      </div>
      <div class="workload-cell">
        <span class="metric-label">{{ t('dashboard.totalRejected') }}</span>
        <n-spin v-if="statusLoading && totalRejected === undefined" size="small" />
        <strong v-else-if="totalRejected !== undefined">{{ totalRejected }}</strong>
        <span v-else class="unavailable">{{ statusError ? t('common.requestFailed') : t('common.noData') }}</span>
      </div>
    </div>
    <p v-if="jobsError || statusError" class="error-note">{{ t('common.requestFailed') }}</p>
    <div class="anomaly-section">
      <h3>{{ t('dashboard.anomalies') }}</h3>
      <template v-if="hasAnomalyData">
        <ul v-if="anomalies.length" class="anomaly-list">
          <li v-for="item in anomalies" :key="item.label">
            <span class="anomaly-dot" aria-hidden="true" />{{ item.label }} <strong>{{ item.count }}</strong>
          </li>
        </ul>
        <p v-else class="quiet-state">{{ t('dashboard.noAnomalies') }}</p>
      </template>
      <p v-else-if="jobsError || statusError" class="quiet-state">{{ t('common.requestFailed') }}</p>
      <p v-else-if="jobsLoading || statusLoading" class="quiet-state">{{ t('common.loading') }}</p>
      <p v-else class="quiet-state">{{ t('common.noData') }}</p>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  jobsLoading: boolean
  statusLoading: boolean
  jobsError: boolean
  statusError: boolean
  activeJobs?: number
  queueDepth?: number
  totalRejected?: number
  unavailableNodes?: number
}>()
const { t } = useI18n()
const hasAnomalyData = computed(() => props.unavailableNodes !== undefined)
const anomalies = computed(() => [
  props.unavailableNodes !== undefined && props.unavailableNodes > 0
    ? { label: t('dashboard.unavailable'), count: props.unavailableNodes } : null,
].filter((item): item is { label: string; count: number } => item !== null))
</script>

<style scoped>
.overview-card { height: 100%; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.panel-heading a { color: var(--apple-blue); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.panel-heading a:hover { color: var(--apple-blue-hover); }
.workload-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 16px; }
.workload-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.metric-label { color: var(--apple-gray-3); font-size: 12px; }
.workload-cell strong { color: var(--apple-gray-1); font-size: 27px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.unavailable, .error-note { color: var(--apple-red); font-size: 12px; }
.error-note { margin: 12px 0 0; }
.anomaly-section { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--apple-gray-6); }
.anomaly-section h3 { margin: 0 0 10px; color: var(--apple-gray-2); font-size: 12px; font-weight: 600; }
.anomaly-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.anomaly-list li { display: flex; align-items: center; gap: 7px; color: var(--apple-gray-2); font-size: 12px; }
.anomaly-list strong { margin-left: auto; color: var(--apple-gray-1); font-variant-numeric: tabular-nums; }
.anomaly-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--apple-orange); }
.quiet-state { margin: 0; color: var(--apple-gray-3); font-size: 12px; }
</style>
