<template>
  <main class="dashboard">
    <section class="overview-grid">
      <SystemHealthPanel
        :loading="statusLoading"
        :error="statusError"
        :available="statusAvailable"
        :cpu="system?.admin.cpuUsage"
        :memory="system?.admin.memoryUsage"
        :load="system?.admin.load"
        :uptime="formatUptime(system?.uptime)"
      />
      <NodeSummaryPanel
        :loading="statusLoading"
        :error="statusError"
        :total="system?.cluster.totalNodes"
        :available="system?.cluster.availableNodes"
        :unavailable="system?.cluster.unavailableNodes"
        :draining="system?.cluster.drainingNodes"
        :nodes-by-role="system?.cluster.nodesByRole"
      />
      <WorkloadPanel
        :jobs-loading="jobsLoading"
        :status-loading="statusLoading"
        :jobs-error="jobsError"
        :status-error="statusError"
        :active-jobs="activeJobs"
        :queue-depth="system?.tasks.queueDepth"
        :total-rejected="system?.tasks.totalRejected"
        :unavailable-nodes="system?.cluster.unavailableNodes"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { getSystemStatus } from '@/api/system'
import { getJobs } from '@/api/job'
import { usePagePolling } from '@/composables/usePagePolling'
import { useI18n } from '@/stores/i18n'
import SystemHealthPanel from './SystemHealthPanel.vue'
import NodeSummaryPanel from './NodeSummaryPanel.vue'
import WorkloadPanel from './WorkloadPanel.vue'

interface DashboardStatus {
  admin: { cpuUsage?: number; memoryUsage?: number; load?: number }
  cluster: { totalNodes?: number; availableNodes?: number; unavailableNodes?: number; drainingNodes?: number; nodesByRole?: Record<string, number> }
  tasks: { queueDepth?: number; totalRejected?: number }
  uptime?: string
}

const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const system = ref<DashboardStatus | null>(null)
const activeJobs = ref<number>()
const statusAvailable = ref(false)
const statusLoading = ref(true)
const jobsLoading = ref(true)
const statusError = ref(false)
const jobsError = ref(false)
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

function readStatus(value: unknown): DashboardStatus {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid system status response')
  const root = record(value)
  const admin = record(root.admin)
  const cluster = record(root.cluster)
  const tasks = record(root.tasks)
  const roles = record(cluster.nodesByRole)
  return {
    admin: { cpuUsage: finite(admin.cpuUsage), memoryUsage: finite(admin.memoryUsage), load: finite(admin.load) },
    cluster: {
      totalNodes: finite(cluster.totalNodes), availableNodes: finite(cluster.availableNodes),
      unavailableNodes: finite(cluster.unavailableNodes), drainingNodes: finite(cluster.drainingNodes),
      nodesByRole: Object.fromEntries(Object.entries(roles).flatMap(([key, count]) => {
        const parsed = finite(count)
        return parsed === undefined ? [] : [[key, parsed]]
      })),
    },
    tasks: { queueDepth: finite(tasks.queueDepth), totalRejected: finite(tasks.totalRejected) },
    uptime: typeof root.uptime === 'string' && root.uptime.length > 0 ? root.uptime : undefined,
  }
}

async function fetchDashboard() {
  if (requestInFlight) return
  requestInFlight = true
  const sequence = ++requestSequence
  statusLoading.value = system.value === null
  jobsLoading.value = activeJobs.value === undefined
  statusError.value = false
  jobsError.value = false

  try {
    const [statusResult, jobsResult] = await Promise.allSettled([
      getSystemStatus().then(readStatus),
      getJobs({ page: 1, pageSize: 1, status: 'Running' }).then((response) => {
        const total = finite(record(response).total)
        if (total === undefined || !Number.isSafeInteger(total) || total < 0) {
          throw new TypeError('Invalid running Job total')
        }
        return total
      }),
    ])
    if (sequence !== requestSequence) return

    if (statusResult.status === 'fulfilled') {
      system.value = statusResult.value
      statusAvailable.value = true
    } else {
      statusError.value = true
      statusAvailable.value = false
      console.error('Failed to fetch dashboard system status', statusResult.reason)
    }
    if (jobsResult.status === 'fulfilled') activeJobs.value = jobsResult.value
    else {
      jobsError.value = true
      console.error('Failed to fetch dashboard active Jobs', jobsResult.reason)
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
.overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.overview-grid > :first-child { grid-column: 1 / -1; }
@media (max-width: 760px) {
  .overview-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .overview-grid > :first-child { grid-column: auto; }
}
</style>
