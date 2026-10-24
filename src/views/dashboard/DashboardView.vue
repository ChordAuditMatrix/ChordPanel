<template>
  <main class="dashboard">
    <PageHeader class="dashboard-page-header" :eyebrow="t('dashboard.systemOverview')" :title="t('menu.dashboard')" :description="t('dashboard.clusterOverview')" />

    <section class="summary-bar" :aria-label="t('dashboard.systemOverview')" :aria-busy="statusLoading">
      <MetricStrip class="summary-stats" :label="t('dashboard.systemOverview')" :columns="4">
        <MetricCard
          :label="t('dashboard.totalNodes')"
          :value="summaryValue(system?.cluster.totalNodes)"
          tone="neutral"
        />
        <MetricCard
          :label="t('dashboard.availableNodes')"
          :value="summaryValue(availableNodeCount)"
          tone="neutral"
        />
        <MetricCard
          :label="t('dashboard.activeJobs')"
          :value="activeJobsError ? t('common.requestFailed') : summaryValue(activeJobs)"
          :tone="activeJobsError ? 'danger' : activeJobs === undefined ? 'neutral' : activeJobs > 0 ? 'info' : 'neutral'"
        />
        <MetricCard
          :label="t('dashboard.anomalies')"
          :value="summaryValue(system?.cluster.unavailableNodes)"
          :tone="typeof system?.cluster.unavailableNodes === 'number' && system.cluster.unavailableNodes > 0 ? 'danger' : 'neutral'"
        />
      </MetricStrip>

      <SystemHealthPanel
        :loading="statusLoading"
        :error="statusError"
        :cpu="system?.admin.cpuUsage"
        :memory="system?.admin.memoryUsage"
        :load="system?.admin.load"
        :uptime="formatUptime(system?.uptime)"
        :samples="metricSamples"
      />
    </section>

    <section class="dashboard-main">
      <NodeSummaryPanel
        :error="statusError"
        :admin-configured-id="system?.admin.adminId ?? null"
        :admin-identity-stale="statusError && Boolean(system?.admin.adminId)"
        :admin-control-plane-state="adminControlPlaneState"
        :draining="system?.cluster.drainingNodes"
        :nodes="nodes"
        :nodes-loading="nodesLoading"
        :nodes-error="Boolean(nodesError)"
        :activity-projection="activityProjection"
        :activity-scope="selectedJobId"
        :activity-loading="activityLoading"
        :activity-error="activityError"
        :selected-activity-id="selectedActivityId"
        @select-activity="selectedActivityId = $event"
      />
      <WorkloadPanel
        :jobs-loading="jobsLoading"
        :jobs-error="jobsError"
        :status-loading="statusLoading"
        :status-error="statusError"
        :total-jobs="totalJobs"
        :queue-depth="system?.tasks.queueDepth"
        :total-rejected="system?.tasks.totalRejected"
        :recent-jobs="recentJobs"
        :selected-job-id="selectedJobId"
        :challenge="challengeSummary"
        @select-job="selectedJobId = $event"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSystemStatus, parseSystemStatusResponse, type SystemStatusResponse } from '@/api/system'
import { getJobs, type JobSummary } from '@/api/job'
import { usePagePolling } from '@/composables/usePagePolling'
import { useI18n } from '@/stores/i18n'
import { useNodeCatalog } from '@/stores/nodeCatalog'
import { useTraceSession } from '@/features/execution/data/useTraceSession'
import {
  projectExecutionCommunication,
  type ExecutionCommunicationProjection,
} from '@/features/execution/data/executionCommunication'
import {
  displayConfidencePercentage,
  parseChallengeSamplingMetadata,
  theoreticalDetectionProbability,
} from '@/features/execution/data/challengeConfidence'
import { adminControlPlaneStatus } from './nodeTopologyModel'
import type { SystemMetricSample } from './types'
import MetricCard from '@/components/MetricCard.vue'
import MetricStrip from '@/components/MetricStrip.vue'
import NodeSummaryPanel from './NodeSummaryPanel.vue'
import PageHeader from '@/components/PageHeader.vue'
import SystemHealthPanel from './SystemHealthPanel.vue'
import WorkloadPanel from './WorkloadPanel.vue'


const RECENT_JOB_LIMIT = 5

const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const system = ref<SystemStatusResponse | null>(null)
const activeJobs = ref<number>()
const totalJobs = ref<number>()
const recentJobs = ref<JobSummary[]>([])
const selectedJobId = ref<string | null>(null)
const selectedActivityId = ref<string | null>(null)
const statusLoading = ref(true)
const jobsLoading = ref(true)
const statusError = ref(false)
const adminControlPlaneState = computed(() =>
  adminControlPlaneStatus(system.value?.admin ?? null, statusError.value),
)
const jobsError = ref(false)
const activeJobsError = ref(false)
const metricSamples = ref<SystemMetricSample[]>([])
const { nodes, loading: nodesLoading, error: nodesError, ensureNodesLoaded } = useNodeCatalog()
const nodeCatalogReady = ref(false)
const availableNodeCount = computed(() => {
  if (!nodeCatalogReady.value || (nodesError.value !== null && nodes.value.length === 0)) return undefined
  return nodes.value.filter(node => node.isAvailable === true).length
})

// One session only: switching the selected recent Job aborts and discards the previous
// Trace requests through the session model revision/abort controller.
const traceSession = useTraceSession(selectedJobId, { silent: true })
const activityProjection = computed<ExecutionCommunicationProjection | null>(() => {
  const jobId = selectedJobId.value
  if (!jobId) return null
  return projectExecutionCommunication({
    activeJobId: jobId,
    links: traceSession.state.links.data ?? [],
    observations: traceSession.state.observations.data ?? [],
    protocolEvents: traceSession.state.protocol.data ?? [],
  })
})
const activityLoading = computed(() => {
  if (!selectedJobId.value) return false
  const state = traceSession.state
  return state.observations.loading || state.links.loading || state.protocol.loading
})
const activityError = computed(() => {
  if (!selectedJobId.value) return false
  const state = traceSession.state
  return Boolean(state.observations.error || state.links.error || state.protocol.error)
})

/**
 * Home-page confidence line for the selected ChallengeProof only. Both values
 * come from the persisted Job metadata plus the shared hypergeometric model;
 * anything missing or uncomputable stays hidden instead of defaulting to 99%.
 */
const challengeSummary = computed<{
  jobId: string
  target: string
  theoretical: string
  ratio: string
} | null>(() => {
  const jobId = selectedJobId.value
  if (!jobId) return null
  if (traceSession.state.summary.data?.executionKind !== 'challengeProof') return null
  const parsed = parseChallengeSamplingMetadata(traceSession.jobDetail.value?.metadata ?? null)
  if (!parsed.ok) return null
  const probability = theoreticalDetectionProbability(parsed.value)
  if (!probability.ok) return null
  return {
    jobId,
    target: displayConfidencePercentage(parsed.value.targetConfidence),
    theoretical: displayConfidencePercentage(probability.value),
    ratio: displayConfidencePercentage(parsed.value.assumedCorruptionRatio),
  }
})

/** Summary counters keep `—` for an unknown value instead of implying zero. */
function summaryValue(value?: number): string {
  return Number.isFinite(value) ? String(value) : '—'
}

watch(selectedJobId, () => {
  selectedActivityId.value = null
})
let requestSequence = 0
let requestInFlight = false

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
function formatUptime(value?: string): string | undefined {
  const match = value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  if (!match || !match[1] && !match[2] && !match[3] && !match[4]) return undefined
  const totalSeconds = Math.floor(
    Number(match[1] ?? 0) * 86400
    + Number(match[2] ?? 0) * 3600
    + Number(match[3] ?? 0) * 60
    + Number(match[4] ?? 0),
  )
  if (!Number.isSafeInteger(totalSeconds) || totalSeconds < 0) return undefined
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (part: number) => part.toString().padStart(2, '0')
  return t('common.timeFormat', { h: pad(hours), m: pad(minutes), s: pad(seconds), sep: '' })
}


/** The jobs endpoint returns a server total and a page of latest records. */
function readRecentJobs(value: unknown): { total: number; items: JobSummary[] } {
  const root = record(value)
  const total = finite(root.total)
  if (total === undefined || !Number.isSafeInteger(total) || total < 0) {
    throw new TypeError('Invalid Job total')
  }
  const items = Array.isArray(root.items) ? root.items : []
  const jobs: JobSummary[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const row = record(item)
    const jobId = row.jobId
    const createdAtMs = finite(row.createdAtMs)
    if (
      typeof jobId !== 'string'
      || jobId.length === 0
      || typeof row.jobType !== 'string'
      || typeof row.status !== 'string'
      || createdAtMs === undefined
      || !Number.isSafeInteger(createdAtMs)
      || seen.has(jobId)
    ) continue
    seen.add(jobId)
    jobs.push(item as JobSummary)
    if (jobs.length === RECENT_JOB_LIMIT) break
  }
  return { total, items: jobs }
}

function readJobTotal(value: unknown): number {
  const total = finite(record(value).total)
  if (total === undefined || !Number.isSafeInteger(total) || total < 0) {
    throw new TypeError('Invalid Job total')
  }
  return total
}

/** Keep the selection valid: newest visible Job, or null when the page empties. */
function reconcileSelectedJob(jobs: readonly JobSummary[]) {
  const current = selectedJobId.value
  if (current && jobs.some(job => job.jobId === current)) return
  selectedJobId.value = jobs[0]?.jobId ?? null
}

async function fetchDashboard() {
  void ensureNodesLoaded().finally(() => { nodeCatalogReady.value = true })
  if (requestInFlight) return
  requestInFlight = true
  const sequence = ++requestSequence
  statusLoading.value = system.value === null
  jobsLoading.value = totalJobs.value === undefined && recentJobs.value.length === 0
  statusError.value = false
  jobsError.value = false
  activeJobsError.value = false

  try {
    const [statusResult, recentJobsResult, activeJobsResult] = await Promise.allSettled([
      getSystemStatus().then(parseSystemStatusResponse),
      getJobs({
        page: 1,
        pageSize: RECENT_JOB_LIMIT,
        sortBy: 'createdAtMs',
        ascending: false,
      }).then(readRecentJobs),
      getJobs({ page: 1, pageSize: 1, status: 'Running' }).then(readJobTotal),
    ])
    if (sequence !== requestSequence) return

    if (statusResult.status === 'fulfilled') {
      system.value = statusResult.value
      // `observedAtMs` must be the source snapshot time from the API; a poll
      // without a timestamp never fabricates a sample.
      const observedAtMs = statusResult.value.timestampMs
      if (observedAtMs !== undefined && observedAtMs > 0) {
        const sample: SystemMetricSample = {
          observedAtMs,
          cpuUsage: statusResult.value.admin.cpuUsage,
          memoryUsage: statusResult.value.admin.memoryUsage,
          load: statusResult.value.admin.load,
        }
        const last = metricSamples.value[metricSamples.value.length - 1]
        if (observedAtMs > (last?.observedAtMs ?? 0)
          && [sample.cpuUsage, sample.memoryUsage, sample.load].some(value => value !== undefined)) {
          metricSamples.value.push(sample)
          if (metricSamples.value.length > 30) metricSamples.value.splice(0, metricSamples.value.length - 30)
        }
      }
    } else {
      statusError.value = true
      console.error('Failed to fetch dashboard system status', statusResult.reason)
    }

    if (recentJobsResult.status === 'fulfilled') {
      totalJobs.value = recentJobsResult.value.total
      recentJobs.value = recentJobsResult.value.items
      reconcileSelectedJob(recentJobsResult.value.items)
    } else {
      jobsError.value = true
      console.error('Failed to fetch recent Jobs', recentJobsResult.reason)
    }

    if (activeJobsResult.status === 'fulfilled') {
      activeJobs.value = activeJobsResult.value
    } else {
      activeJobsError.value = true
      console.error('Failed to fetch active Job count', activeJobsResult.reason)
    }
  } finally {
    requestInFlight = false
    if (sequence === requestSequence) {
      statusLoading.value = false
      jobsLoading.value = false
    }
  }
}

register(fetchDashboard, route.path)
onUnmounted(() => { requestSequence++ })
</script>

<style scoped>
.dashboard { width: 100%; max-width: 1200px; margin: 0 auto; }
.dashboard :deep(.dashboard-page-header) { border-bottom: 0; }

.summary-bar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-bar .summary-stats {
  width: 100%;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-xl);
  background: var(--apple-card);
}

.summary-bar .summary-stats :deep(.metric-card) {
  min-height: 68px;
  padding: 10px 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.summary-bar .summary-stats :deep(.metric-card + .metric-card) {
  border-inline-start: 1px solid var(--apple-border);
}

.dashboard-main {
  display: grid;
  grid-template-columns: minmax(0, 1.62fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}

@media (max-width: 960px) {
  .dashboard-main { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .summary-bar .summary-stats :deep(.metric-card:nth-child(3)) {
    border-top: 1px solid var(--apple-border);
    border-inline-start: 0;
  }
  .summary-bar .summary-stats :deep(.metric-card:nth-child(4)) {
    border-top: 1px solid var(--apple-border);
  }
}

@media (max-width: 520px) {
  .summary-bar .summary-stats { grid-template-columns: minmax(0, 1fr); }
  .summary-bar .summary-stats :deep(.metric-card + .metric-card) {
    border-top: 1px solid var(--apple-border);
    border-inline-start: 0;
  }
}
</style>
