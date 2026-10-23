<template>
  <n-drawer v-model:show="visible" class="jobs-drawer" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
    <n-drawer-content :title="drawerTitle" closable>
      <div v-if="trackedJobs.length === 0" class="empty-wrap">
        <div class="empty-copy">
          <n-empty :description="t('jobProgress.empty')">
            <template #extra>
              <n-button size="small" @click="openJobCenter">{{ t('job.workbench.global.openJobCenter') }}</n-button>
            </template>
          </n-empty>
          <p class="empty-hint">{{ t('job.workbench.global.emptyDescription') }}</p>
        </div>
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
          @open-execution="openExecution"
          @open-job-center="openJobInCenter"
          @open-report="openReport"
        />
      </div>
      <template #footer>
        <div class="drawer-footer">
          <n-button size="small" @click="openJobCenter">{{ t('job.workbench.global.openJobCenter') }}</n-button>
          <n-button size="small" @click="clearCompletedJobs">{{ t('jobProgress.clearCompleted') }}</n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
  <TaskDetailModal :task="currentTask" :job="currentJob" @close="closeTaskDetail" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { JobDetail, TaskSummary } from '@/api/job'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import { isJobRecovering, isTerminalJob, useJobTracking, type TrackedJob } from '@/stores/jobTracking'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobProgressCard from '@/components/JobProgressCard.vue'
import { executionRoute, jobCenterRoute, reportRoute } from '@/utils/jobRoutes'

const { t } = useI18n()
const { drawerWidth } = useAdaptiveWidth(380)
const router = useRouter()
const { snapshots, trackedIds, removeTrackedJob, clearCompletedJobs } = useJobTracking()
const visible = ref(false)
function open(): void {
  visible.value = true
}
defineExpose({ open })
const currentTask = ref<TaskSummary | null>(null)
const currentJob = ref<JobDetail | null>(null)
const openPopoverJobId = ref<string | null>(null)

// Active work comes first; within a group the newest tracked Job stays on top.
const trackedJobs = computed(() => trackedIds.value
  .map(id => snapshots[id])
  .filter((job): job is TrackedJob => Boolean(job))
  .sort((left, right) => Number(isTerminalJob(left)) - Number(isTerminalJob(right))
    || right.createdAtMs - left.createdAtMs))

const drawerTitle = computed(() => trackedJobs.value.length > 0
  ? t('job.workbench.global.drawerTitle', { n: trackedJobs.value.length })
  : t('jobProgress.title'))

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
function openExecution(jobId: string) {
  visible.value = false
  void router.push(executionRoute(jobId))
}

function openReport(jobId: string) {
  visible.value = false
  void router.push(reportRoute(jobId))
}
function openJobInCenter(jobId: string) {
  visible.value = false
  void router.push(jobCenterRoute(jobId))
}

function openJobCenter() {
  visible.value = false
  void router.push(jobCenterRoute())
}
</script>

<style scoped>
.job-list {
  display: flex;
  flex-direction: column;
}

.empty-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.empty-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--apple-space-2);
  padding: 0 var(--apple-space-4);
  text-align: center;
}

.empty-hint {
  max-width: 34ch;
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}
</style>
