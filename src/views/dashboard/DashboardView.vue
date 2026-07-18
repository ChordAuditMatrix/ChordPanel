<template>
  <div class="dashboard">
    <!-- Admin overview: gauge + task metrics combined -->
    <n-card :title="t('dashboard.adminOverview')" size="small" :bordered="true">
      <div class="gauge-row">
        <div class="gauge-wrap">
          <ArcGauge :value="adminLoad" :label="t('dashboard.load')" unit="" :sub-label="loadSubLabel" :max="4" />
        </div>
        <div class="gauge-wrap">
          <ArcGauge :value="adminCpu" :label="t('dashboard.cpu')" unit="%" :sub-label="cpuSubLabel" />
        </div>
        <div class="gauge-wrap">
          <ArcGauge :value="adminMemory" :label="t('dashboard.memory')" unit="%" :sub-label="memorySubLabel" />
        </div>
      </div>
      <div class="overview-extras">
        <div class="extra-item">
          <span class="extra-label">{{ t('dashboard.uptime') }}</span>
          <span class="clock">{{ clockStr }}</span>
        </div>
        <div class="extra-item">
          <span class="extra-label">{{ t('dashboard.maxConcurrency') }}</span>
          <span class="extra-val">{{ tasks.maxConcurrentTasks }}</span>
        </div>
      </div>
      <!-- Task metrics row -->
      <div class="task-metrics-row">
        <div class="stat-chart-item" v-for="item in taskChartItems" :key="item.label">
          <MiniLineChart :data="item.data" :color="item.color" />
          <div class="stat-chart-info">
            <span class="sc-label">{{ item.label }}</span>
            <span class="sc-value">{{ item.value }}</span>
          </div>
        </div>
      </div>
    </n-card>

    <!-- Cluster overview + node load (two columns) -->
    <div class="overview-row" style="margin-top: 16px;">
      <n-card size="small" :bordered="true" class="overview-col">
        <template #header>
          <span>{{ t('dashboard.clusterOverview') }}</span>
        </template>
        <template v-if="cluster.nodesByRole && Object.keys(cluster.nodesByRole).length" #header-extra>
          <div class="role-tags">
            <span v-for="(count, role) in cluster.nodesByRole" :key="role" class="role-badge">
              <span class="role-dot" :class="'role-' + role.toLowerCase()"></span>
              {{ role }}: {{ count }}
            </span>
          </div>
        </template>
        <div class="stat-charts-col cluster-charts">
          <div class="stat-chart-item" v-for="item in clusterChartItems" :key="item.label">
            <MiniLineChart :data="item.data" :color="item.color" />
            <div class="stat-chart-info">
              <span class="sc-label">{{ item.label }}</span>
              <span class="sc-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </n-card>

      <n-card :title="t('dashboard.nodeLoad')" size="small" :bordered="true" class="overview-col">
        <NodePanel />
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSystemStatus } from '@/api/system'
import { useSettings } from '@/stores/settings'
import { useTheme } from '@/stores/theme'
import { useI18n } from '@/stores/i18n'
import { usePagePolling } from '@/composables/usePagePolling'
import ArcGauge from '@/components/ArcGauge.vue'
import MiniLineChart from '@/components/MiniLineChart.vue'
import NodePanel from '@/components/node/NodePanel.vue'

const { isDark } = useTheme()
const { t } = useI18n()
// isDark is used for theme switching via v-bind() in <style>
void isDark
const route = useRoute()
const { register } = usePagePolling()

interface SystemStatus {
  admin: {
    cpuUsage: number
    memoryUsage: number
    totalMemoryKb: number
    freeMemoryKb: number
    load: number
  }
  cluster: {
    totalNodes: number
    availableNodes: number
    unavailableNodes: number
    drainingNodes: number
    nodesByRole: Record<string, number>
  }
  tasks: {
    activeTaskCount: number
    maxConcurrentTasks: number
    queueDepth: number
    totalSubmitted: number
    totalCompleted: number
    totalRejected: number
  }
  uptime: string
  timestampMs: number
}

const status = ref<SystemStatus | null>(null)
let clockTimer: ReturnType<typeof setInterval> | null = null

const { settings } = useSettings()

// Historical data (latest 30 points)
const MAX_HISTORY = 30
const history = ref<{
  cpu: number[]
  memory: number[]
  load: number[]
  totalNodes: number[]
  availableNodes: number[]
  unavailableNodes: number[]
  activeTaskCount: number[]
  queueDepth: number[]
  totalSubmitted: number[]
  totalCompleted: number[]
  totalRejected: number[]
}>({
  cpu: [], memory: [], load: [],
  totalNodes: [], availableNodes: [], unavailableNodes: [],
  activeTaskCount: [], queueDepth: [], totalSubmitted: [], totalCompleted: [], totalRejected: [],
})

function pushHistory(key: keyof typeof history.value, val: number) {
  const arr = history.value[key]
  arr.push(val)
  if (arr.length > MAX_HISTORY) arr.shift()
}

const adminCpu = computed(() => status.value?.admin?.cpuUsage ?? 0)
const adminMemory = computed(() => status.value?.admin?.memoryUsage ?? 0)
const adminLoad = computed(() => status.value?.admin?.load ?? 0)
const cpuSubLabel = computed(() => `${adminCpu.value.toFixed(1)}%`)
const memorySubLabel = computed(() => {
  const free = status.value?.admin?.freeMemoryKb ?? 0
  const total = status.value?.admin?.totalMemoryKb ?? 0
  return t('dashboard.memoryAvailable', { free: formatMem(free), total: formatMem(total) })
})
const loadSubLabel = computed(() => `${adminLoad.value.toFixed(2)} / 4`)
const cluster = computed(() => status.value?.cluster ?? { totalNodes: 0, availableNodes: 0, unavailableNodes: 0, drainingNodes: 0, nodesByRole: {} as Record<string, number> })
const tasks = computed(() => status.value?.tasks ?? { activeTaskCount: 0, maxConcurrentTasks: 0, queueDepth: 0, totalSubmitted: 0, totalCompleted: 0, totalRejected: 0 })

function formatMem(kb: number): string {
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(1)} GB`
  return `${Math.round(kb / 1024)} MB`
}

// Blinking clock
const uptimeSeconds = ref(0)
const clockTick = ref(0)
const clockStr = computed(() => {
  // Access clockTick to make it a reactive dependency
  void clockTick.value
  const s = uptimeSeconds.value
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  const colon = clockTick.value % 2 === 0 ? ':' : '\u2008'
  return t('common.timeFormat', { h: pad(h), sep: colon, m: pad(m), s: pad(sec) })
})

function parseUptimeSeconds(pt: string): number {
  if (!pt || !pt.startsWith('PT')) return 0
  const m = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!m) return 0
  const h = m[1] ? parseInt(m[1]) : 0
  const min = m[2] ? parseInt(m[2]) : 0
  const s = m[3] ? Math.floor(parseFloat(m[3])) : 0
  return h * 3600 + min * 60 + s
}

// Cluster chart items
const clusterChartItems = computed(() => [
  { label: t('dashboard.totalNodes'), value: cluster.value.totalNodes, data: history.value.totalNodes, color: '#63E2B7' },
  { label: t('dashboard.available'), value: cluster.value.availableNodes, data: history.value.availableNodes, color: '#18A058' },
  { label: t('dashboard.unavailable'), value: cluster.value.unavailableNodes, data: history.value.unavailableNodes, color: '#E88080' },
  { label: t('dashboard.draining'), value: cluster.value.drainingNodes, data: [...history.value.totalNodes].fill(0), color: '#F2C97D' },
])

// Task chart items
const taskChartItems = computed(() => [
  { label: t('dashboard.active'), value: tasks.value.activeTaskCount, data: history.value.activeTaskCount, color: '#63E2B7' },
  { label: t('dashboard.queue'), value: tasks.value.queueDepth, data: history.value.queueDepth, color: '#F2C97D' },
  { label: t('dashboard.submitted'), value: tasks.value.totalSubmitted, data: history.value.totalSubmitted, color: '#70C0E8' },
  { label: t('dashboard.completed'), value: tasks.value.totalCompleted, data: history.value.totalCompleted, color: '#18A058' },
  { label: t('dashboard.rejected'), value: tasks.value.totalRejected, data: history.value.totalRejected, color: '#E88080' },
])

async function fetchData() {
  try {
    const sysStatus = await getSystemStatus()
    status.value = sysStatus as unknown as SystemStatus
    uptimeSeconds.value = parseUptimeSeconds(status.value?.uptime ?? '')

    // Push history
    pushHistory('cpu', adminCpu.value)
    pushHistory('memory', adminMemory.value)
    pushHistory('load', adminLoad.value)
    pushHistory('totalNodes', cluster.value.totalNodes)
    pushHistory('availableNodes', cluster.value.availableNodes)
    pushHistory('unavailableNodes', cluster.value.unavailableNodes)
    pushHistory('activeTaskCount', tasks.value.activeTaskCount)
    pushHistory('queueDepth', tasks.value.queueDepth)
    pushHistory('totalSubmitted', tasks.value.totalSubmitted)
    pushHistory('totalCompleted', tasks.value.totalCompleted)
    pushHistory('totalRejected', tasks.value.totalRejected)
  } catch (e) {
    console.error('Failed to fetch dashboard data', e)
  }
}

function startPolling() {
  register(fetchData, route.path)
}

// Watch polling interval changes (already handled by the global composable; kept for compatibility only)
watch(() => settings.value.pollInterval, () => {})

onMounted(() => {
  startPolling()
  clockTimer = setInterval(() => {
    clockTick.value++
  }, 1000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.gauge-row {
  display: flex;
  gap: 48px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

.gauge-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.overview-extras {
  display: flex;
  gap: 48px;
  justify-content: center;
  margin-top: 12px;
}

.extra-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.extra-label {
  font-size: 12px;
  opacity: 0.5;
}

.extra-val {
  font-size: 16px;
  font-weight: 700;
}

.clock {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

/* Task metrics row — below the admin overview; 5 items evenly share one row */
.task-metrics-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid v-bind(isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
}

.task-metrics-row .stat-chart-item {
  flex: 1 1 0;
  min-width: 120px;
}

/* Cluster overview + node load: two columns */
.overview-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.overview-col {
  flex: 1;
  min-width: 280px;
}

.stats-with-chart {
  display: flex;
  flex-wrap: wrap;
}

/* Chart items use a grid layout */
.stat-charts-col {
  display: grid;
  gap: 12px 20px;
  width: 100%;
}

/* Cluster overview: 4 items in 2 columns and 2 rows */
.cluster-charts {
  grid-template-columns: repeat(2, 1fr);
}

.stat-chart-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stat-chart-info {
  display: flex;
  flex-direction: column;
}

.sc-label {
  font-size: 11px;
  opacity: 0.45;
}

.sc-value {
  font-size: 18px;
  font-weight: 700;
}

.role-tags {
  display: flex;
  gap: 8px;
  align-items: center;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  background: v-bind(isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)');
  opacity: 0.8;
}

.role-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.role-admin { background: #70C0E8; }
.role-audit { background: #F2C97D; }
.role-storage { background: #63E2B7; }
</style>
