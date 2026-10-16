<template>
  <!-- Floating action button in the bottom-right corner (with badge) -->
  <button type="button" class="job-fab" :aria-label="t('jobProgress.title')" @click="visible = true">
    <n-icon size="22" :component="CubeOutline" />
    <span v-if="activeCount > 0" class="job-badge">{{ activeCount }}</span>
  </button>
  <n-drawer v-model:show="visible" class="jobs-drawer" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
    <n-drawer-content :title="t('jobProgress.title')" closable>
      <div v-if="trackedJobs.length === 0" class="empty-wrap">
        <n-empty :description="t('jobProgress.empty')" />
      </div>
      <div v-else class="job-list">
        <n-popover v-for="job in trackedJobs" :key="job.jobId" raw trigger="click" placement="left" :width="440" :style="{ padding: '0' }" :scrollable="true" :overlay-style="{ maxWidth: '90vw', maxHeight: '70vh' }" @update:show="onPopoverVisibility(job.jobId, $event)">
          <template #trigger>
            <n-card size="small" :bordered="true" class="job-card">
              <template #header>
                <div class="job-header">
                  <n-tag :type="isJobRecovering(job) ? 'warning' : jobStatusTagType(job.status)" size="small" :bordered="false">{{ isJobRecovering(job) ? t('job.statusRecovering') : job.status }}</n-tag>
                  <span class="job-type">{{ job.jobType }}</span>
                  <span class="job-id">{{ job.jobId.substring(0, 8) }}...</span>
                  <n-button v-if="isTerminalJob(job) || !isJobRecovering(job)" size="tiny" quaternary type="error" @click.stop="removeJob(job.jobId)" :title="t('jobProgress.remove')">×</n-button>
                </div>
              </template>
              <div class="job-info">
                <span>{{ t('jobProgress.createdAt') }}: {{ formatDateTime(job.createdAtMs) }}</span>
                <span v-if="job.totalDurationMs">{{ t('jobProgress.duration') }}: {{ job.totalDurationMs }}ms</span>
              </div>
              <!-- Status change timeline -->
              <div v-if="job.history && job.history.length > 0" class="job-steps">
                <div v-for="(h, idx) in job.history" :key="idx" class="step-item" :class="{ active: h.status === job.status, done: idx < (job.history?.findIndex(s => s.status === job.status) ?? 0) }">
                  <span class="step-dot" :class="'dot-' + jobStatusTagType(h.status)"></span>
                  <span class="step-label">{{ h.status }}</span>
                  <span class="step-time">{{ formatDateTime(h.switchedAtMs) }}</span>
                </div>
              </div>
              <div v-if="job.statusMessage" class="job-msg">
                <JobStatusMessage :message="job.statusMessage" />
              </div>
            </n-card>
          </template>
          <!-- Popover content: JobDetailPanel wrapped in a bordered card -->
          <div class="popover-wrap">
            <JobDetailPanel
              :job-id="job.jobId"
              :job-snapshot="job"
              :visible="visible && openPopoverJobId === job.jobId"
              compact
              hide-actions
              @task-click="onTaskClick"
            />
          </div>
        </n-popover>
      </div>
      <template #footer>
        <n-button size="small" @click="clearCompletedJobs">{{ t('jobProgress.clearCompleted') }}</n-button>
      </template>
    </n-drawer-content>
  </n-drawer>
  <TaskDetailModal :task="currentTask" :job="currentJob" @close="closeTaskDetail" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { JobDetail, TaskSummary } from '@/api/job'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { isJobRecovering, isTerminalJob, useJobTracking, type TrackedJob } from '@/stores/jobTracking'
import { CubeOutline } from '@vicons/ionicons5'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import JobStatusMessage from '@/components/JobStatusMessage.vue'
import { jobStatusTagType } from '@/utils/jobStatus'

const { t } = useI18n()
const { drawerWidth } = useAdaptiveWidth(380)
const { snapshots, trackedIds, removeTrackedJob, clearCompletedJobs } = useJobTracking()
const visible = ref(false)
const currentTask = ref<TaskSummary | null>(null)
const currentJob = ref<JobDetail | null>(null)
const openPopoverJobId = ref<string | null>(null)

const trackedJobs = computed(() => trackedIds.value.map(id => snapshots[id]).filter((job): job is TrackedJob => Boolean(job)))
const activeCount = computed(() => trackedJobs.value.filter(job => {
  const status = job.status.toLowerCase()
  return !isTerminalJob(job) && (status === 'pending' || status === 'running' || job.recoveryRequested === true || job.maintenanceRecovery === 'Requested')
}).length)


function onTaskClick(task: TaskSummary, job: JobDetail | null) {
  currentJob.value = job
  currentTask.value = task
}

function closeTaskDetail() {
  currentTask.value = null
  currentJob.value = null
}

function onPopoverVisibility(jobId: string, shown: boolean) {
  if (shown) openPopoverJobId.value = jobId
  else if (openPopoverJobId.value === jobId) openPopoverJobId.value = null
}

function removeJob(jobId: string) {
  const job = snapshots[jobId]
  if (!isTerminalJob(job) && isJobRecovering(job)) return
  removeTrackedJob(jobId)
}
</script>

<style scoped>
/* ── Apple-style frosted-glass floating action button ── */
.job-fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  width: 52px;
  height: 52px;
  padding: 0;
  font: inherit;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
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
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
</style>
