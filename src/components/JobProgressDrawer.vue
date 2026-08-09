<template>
  <!-- Floating action button in the bottom-right corner (with badge) -->
  <div class="job-fab" @click="visible = true">
    <n-icon size="22" :component="CubeOutline" />
    <span v-if="activeCount > 0" class="job-badge">{{ activeCount }}</span>
  </div>
  <n-drawer v-model:show="visible" class="jobs-drawer" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
    <n-drawer-content :title="t('jobProgress.title')" closable>
      <template #header-extra>
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button size="small" circle quaternary @click="visible = false">
              <template #icon><n-icon :component="CloseOutline" /></template>
            </n-button>
          </template>
          {{ t('jobProgress.close') }}
        </n-tooltip>
      </template>
      <div v-if="trackedJobs.length === 0" class="empty-wrap">
        <n-empty :description="t('jobProgress.empty')" />
      </div>
      <div v-else class="job-list">
        <n-popover v-for="job in trackedJobs" :key="job.jobId" trigger="click" placement="left" :width="440" :style="{ padding: '0' }" :scrollable="true" :overlay-style="{ maxWidth: '90vw', maxHeight: '70vh' }">
          <template #trigger>
            <n-card size="small" :bordered="true" class="job-card">
              <template #header>
                <div class="job-header">
                  <n-tag :type="statusTagType(job.status)" size="small" :bordered="false">{{ job.status }}</n-tag>
                  <span class="job-type">{{ job.jobType }}</span>
                  <span class="job-id">{{ job.jobId.substring(0, 8) }}...</span>
                  <n-button size="tiny" quaternary type="error" @click.stop="removeJob(job.jobId)" :title="t('jobProgress.remove')">×</n-button>
                </div>
              </template>
              <div class="job-info">
                <span>{{ t('jobProgress.createdAt') }}: {{ formatTime(job.createdAtMs) }}</span>
                <span v-if="job.totalDurationMs">{{ t('jobProgress.duration') }}: {{ job.totalDurationMs }}ms</span>
              </div>
              <!-- Status change timeline -->
              <div v-if="job.history && job.history.length > 0" class="job-steps">
                <div v-for="(h, idx) in job.history" :key="idx" class="step-item" :class="{ active: h.status === job.status, done: idx < (job.history?.findIndex(s => s.status === job.status) ?? 0) }">
                  <span class="step-dot" :class="'dot-' + statusTagType(h.status)"></span>
                  <span class="step-label">{{ h.status }}</span>
                  <span class="step-time">{{ formatTime(h.switchedAtMs) }}</span>
                </div>
              </div>
              <div v-if="job.statusMessage" class="job-msg">{{ job.statusMessage }}</div>
            </n-card>
          </template>
          <!-- Popover content: JobDetailPanel wrapped in a bordered card -->
          <div class="popover-wrap">
            <JobDetailPanel
              :job-id="job.jobId"
              compact
              hide-actions
              @task-click="onTaskClick"
            />
          </div>
        </n-popover>
      </div>
      <template #footer>
        <n-button size="small" @click="clearAll">{{ t('jobProgress.clearCompleted') }}</n-button>
      </template>
    </n-drawer-content>
  </n-drawer>
  <TaskDetailModal :task="currentTask" @close="currentTask = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { getJobDetail } from '@/api/job'
import type { JobDetail } from '@/api/job'
import { useSettings } from '@/stores/settings'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
const { t } = useI18n()

import { useJobTracking } from '@/stores/jobTracking'
import { CubeOutline, CloseOutline } from '@vicons/ionicons5'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import type { TaskSummary } from '@/api/job'

const { drawerWidth } = useAdaptiveWidth(380)
const { pendingAdd } = useJobTracking()

const visible = ref(false)
const trackedJobs = ref<JobDetail[]>([])
const currentTask = ref<TaskSummary | null>(null)
const { settings } = useSettings()
let timer: ReturnType<typeof setInterval> | null = null

// Count of currently active tasks (Pending/Running)
const activeCount = computed(() => trackedJobs.value.filter(j => {
  const s = (j.status || '').toLowerCase()
  return s === 'pending' || s === 'running'
}).length)

// Watch global trackJob calls; auto-add the job (no drawer popup — the FAB badge
// shows active count, user opens the drawer on demand)
watch(pendingAdd, (v) => {
  if (v?.jobId) addJob(v.jobId, v.jobType)
})

function statusTagType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const s = status.toLowerCase()
  if (s === 'succeeded' || s === 'completed') return 'success'
  if (s === 'running') return 'info'
  if (s === 'pending') return 'default'
  if (s === 'failed') return 'error'
  return 'default'
}

function onTaskClick(task: TaskSummary) {
  currentTask.value = task
}

function formatTime(t?: number) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

function show() { visible.value = true }

function addJob(jobId: string, jobType?: string) {
  if (trackedJobs.value.find(j => j.jobId === jobId)) return
  // Push a placeholder first
  trackedJobs.value.unshift({
    jobId, jobType: jobType || '', status: 'Pending', createdAtMs: Date.now(),
  } as any)
  pollOnce(jobId)
}

function removeJob(jobId: string) {
  trackedJobs.value = trackedJobs.value.filter(j => j.jobId !== jobId)
}

function clearAll() {
  trackedJobs.value = trackedJobs.value.filter(j => {
    const s = j.status.toLowerCase()
    return s !== 'succeeded' && s !== 'failed' && s !== 'canceled'
  })
}

async function pollOnce(jobId: string) {
  try {
    const detail = await getJobDetail(jobId) as any
    const idx = trackedJobs.value.findIndex(j => j.jobId === jobId)
    if (idx >= 0) trackedJobs.value[idx] = detail
  } catch { /* ignore */ }
}

function startTimer() {
  if (timer) clearInterval(timer)
  timer = setInterval(async () => {
    const active = trackedJobs.value.filter(j => {
      const s = j.status.toLowerCase()
      return s === 'pending' || s === 'running'
    })
    await Promise.all(active.map(j => pollOnce(j.jobId)))
  }, settings.value.pollInterval)
}

watch(() => settings.value.pollInterval, startTimer)
startTimer()
onUnmounted(() => { if (timer) clearInterval(timer) })

defineExpose({ show, addJob })
</script>

<style scoped>
/* ── Apple-style frosted-glass floating action button ── */
.job-fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  /* Frosted material — gradient glass, translucent enough to show depth */
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.45));
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: #0071E3;
  /* Glass top highlight — light catching the material */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 4px 20px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.06);
  transition:
    transform 200ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 200ms ease;
}
.app-dark .job-fab {
  background: linear-gradient(145deg, rgba(60, 60, 62, 0.85), rgba(40, 40, 42, 0.55));
  border-color: rgba(255, 255, 255, 0.12);
  color: #0A84FF;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.3);
}
.job-fab:hover {
  transform: scale(1.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 6px 28px rgba(0, 0, 0, 0.18),
    0 2px 12px rgba(0, 0, 0, 0.08);
}
.app-dark .job-fab:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 6px 28px rgba(0, 0, 0, 0.45),
    0 2px 12px rgba(0, 0, 0, 0.35);
}
.job-fab:active {
  transform: scale(0.94);
}
.job-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #FF3B30;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  border: 2px solid rgba(255, 255, 255, 0.9);
  font-variant-numeric: tabular-nums;
}
.app-dark .job-badge {
  border-color: rgba(28, 28, 30, 0.9);
}

/* ── Job list ── */
.job-list {
  display: flex;
  flex-direction: column;
}

/* Empty state: centered in the drawer body (fills remaining height below header) */
.empty-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}
.job-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.job-type {
  font-weight: 600;
  font-size: 13px;
}
.job-id {
  font-family: var(--apple-font-mono, monospace);
  font-size: 11px;
  color: var(--apple-gray-3, #6E6E73);
  margin-left: auto;
}
.job-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--apple-gray-3, #6E6E73);
  margin-bottom: 8px;
}
.job-msg {
  font-size: 12px;
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  word-break: break-all;
}
.app-dark .job-msg {
  background: rgba(255, 255, 255, 0.06);
}

/* ── Job card ── */
.job-card {
  cursor: pointer;
  margin-bottom: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition:
    transform 200ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 200ms ease,
    border-color 200ms ease;
}
.job-card:hover {
  border-color: rgba(0, 113, 227, 0.2);
  box-shadow: 0 2px 12px rgba(0, 113, 227, 0.08);
  transform: translateY(-1px);
}
.app-dark .job-card {
  border-color: rgba(255, 255, 255, 0.08);
}
.app-dark .job-card:hover {
  border-color: rgba(10, 132, 255, 0.35);
  box-shadow: 0 2px 12px rgba(10, 132, 255, 0.15);
}

/* ── Status step bar ── */
.job-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 11px;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.4;
}
.step-item.active {
  opacity: 1;
  font-weight: 600;
}
.step-item.done {
  opacity: 0.7;
}
.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.dot-info { background: #0071E3; }
.dot-success { background: #34C759; }
.dot-error { background: #FF3B30; }
.dot-warning { background: #FF9500; }
.dot-default { background: #8E8E93; }
.step-time {
  opacity: 0.5;
  margin-left: 4px;
}

/* ── Popover wrap ── */
.popover-wrap {
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  padding: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  /* Fixed height: JobDetailPanel loads async — a constant box size means the
     v-binder popover position never jumps on open (no re-positioning needed).
     Extra content scrolls inside. */
  height: min(420px, 60vh);
  overflow-y: auto;
}
.app-dark .popover-wrap {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(44, 44, 46, 0.9);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
</style>
