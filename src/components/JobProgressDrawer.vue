<template>
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
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobProgressCard from '@/components/JobProgressCard.vue'

const { t } = useI18n()
const { drawerWidth } = useAdaptiveWidth(380)
const { snapshots, trackedIds, removeTrackedJob, clearCompletedJobs } = useJobTracking()
const visible = ref(false)
function open(): void {
  visible.value = true
}
defineExpose({ open })
const currentTask = ref<TaskSummary | null>(null)
const currentJob = ref<JobDetail | null>(null)
const openPopoverJobId = ref<string | null>(null)

const trackedJobs = computed(() => trackedIds.value.map(id => snapshots[id]).filter((job): job is TrackedJob => Boolean(job)))


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
/* Card, timeline, and popover presentation lives in JobProgressCard. */
</style>
