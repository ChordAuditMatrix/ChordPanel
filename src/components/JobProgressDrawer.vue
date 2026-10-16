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
        <JobProgressCard
          v-for="job in trackedJobs"
          :key="job.jobId"
          :job="job"
          :recovering="isJobRecovering(job)"
          :terminal="isTerminalJob(job)"
          :popover-visible="visible && openPopoverJobId === job.jobId"
          @remove="removeJob"
          @popover-visibility="onPopoverVisibility"
          @task-click="onTaskClick"
        />
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
import { isJobRecovering, isTerminalJob, useJobTracking, type TrackedJob } from '@/stores/jobTracking'
import { CubeOutline } from '@vicons/ionicons5'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobProgressCard from '@/components/JobProgressCard.vue'

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
  color: var(--apple-blue);
  /* Glass top highlight — light catching the material */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 4px 20px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.06);
  transition:
    transform var(--apple-dur-fast) var(--apple-spring),
    box-shadow var(--apple-dur-fast) var(--apple-ease-out);
}
.app-dark .job-fab {
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--apple-blue);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.3);
}
@media (hover: hover) and (pointer: fine) {
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
}
.job-fab:active {
  transform: scale(0.97);
}
.job-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--apple-red);
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
@media (max-width: 640px) {
  .job-fab {
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
  }
}
/* Card, timeline, and popover presentation lives in JobProgressCard. */
</style>
