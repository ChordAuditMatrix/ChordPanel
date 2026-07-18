<template>
  <!-- Floating action button in the bottom-right corner (with badge) -->
  <div class="job-fab" @click="visible = true">
    <n-icon size="22" :component="CubeOutline" />
    <span v-if="activeCount > 0" class="job-badge">{{ activeCount }}</span>
  </div>
  <n-drawer v-model:show="visible" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
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
      <n-empty v-if="trackedJobs.length === 0" :description="t('jobProgress.empty')" />
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

// Watch global trackJob calls; auto-add the job and open the drawer
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
  visible.value = true
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
.job-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--n-color, #18a058);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  z-index: 1000;
  transition: transform 0.2s, box-shadow 0.2s;
}
.job-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}
.job-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #d03050;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  border: 2px solid var(--n-card-color, #fff);
}
.job-list { display: flex; flex-direction: column; }
.job-header { display: flex; align-items: center; gap: 8px; }
.job-type { font-weight: 600; font-size: 13px; }
.job-id { font-family: monospace; font-size: 11px; opacity: 0.5; margin-left: auto; }
.job-info { display: flex; gap: 16px; font-size: 12px; opacity: 0.6; margin-bottom: 8px; }
.job-msg { font-size: 12px; margin-top: 8px; padding: 6px 8px; background: rgba(0,0,0,0.04); border-radius: 4px; word-break: break-all; }
.job-card { cursor: pointer; transition: all 0.2s; margin-bottom: 12px; border: 1px solid var(--n-border-color, rgba(0,0,0,0.06)); }
.job-card:hover { border-color: var(--n-color-target, #18a058); box-shadow: 0 2px 12px rgba(24, 160, 88, 0.15); transform: translateY(-1px); }

/* Status change step bar */
.job-steps { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 11px; }
.step-item { display: flex; align-items: center; gap: 4px; opacity: 0.4; }
.step-item.active { opacity: 1; font-weight: 600; }
.step-item.done { opacity: 0.7; }
.step-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.dot-info { background: #2080f0; }
.dot-success { background: #18a058; }
.dot-error { background: #d03050; }
.dot-warning { background: #f0a020; }
.dot-default { background: #909399; }
.step-time { opacity: 0.5; margin-left: 4px; }

.popover-wrap {
  border: 1px solid var(--n-border-color, rgba(0,0,0,0.08));
  border-radius: 8px;
  background: var(--n-color, #fff);
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  max-height: 60vh;
  overflow-y: auto;
}
</style>
