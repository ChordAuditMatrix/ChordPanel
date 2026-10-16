<template>
  <n-modal v-model:show="show" preset="card" :title="t('job.taskDetail', { id: task?.taskId ?? '' })" style="width: 640px; max-width: 92vw;">
    <n-descriptions v-if="task" :column="descColumns" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('job.taskId')" :span="descColumns"><span class="entity-id">{{ task.taskId }}</span></n-descriptions-item>
      <n-descriptions-item :label="t('job.jobId')" :span="descColumns"><span class="entity-id">{{ task.jobId }}</span></n-descriptions-item>
      <n-descriptions-item :label="t('job.status')">
        <n-tag :type="jobStatusTagType(task.status)" size="small" :bordered="false">{{ task.status }}</n-tag>
      </n-descriptions-item>
      <n-descriptions-item :label="t('job.taskType')">{{ task.taskType ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.taskSubType')">{{ task.taskSubType || '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.priority')">{{ task.priority ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.createdAt')">{{ formatDateTime(task.createdAtMs) }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.submittedAt')">{{ formatDateTime(task.submittedAtMs) }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.startedAt')">{{ formatDateTime(task.startedAtMs) }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.completedAt')">{{ formatDateTime(task.completedAtMs) }}</n-descriptions-item>
      <n-descriptions-item v-if="task.statusMessage" :label="t('job.message')" :span="descColumns">
        <ResultCard
          v-if="structuredStatus !== null"
          :result="structuredStatus"
          :format-value="formatValue"
          :title="t('job.message')"
        />
        <n-code v-else :code="task.statusMessage" />
      </n-descriptions-item>
    </n-descriptions>

    <!-- Parent Job context: only the explicitly provided Job DTO, matched by jobId -->
    <template v-if="task && parentJob">
      <n-divider>{{ t('job.parentJob') }}</n-divider>
      <n-descriptions :column="descColumns" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('job.jobId')"><span class="entity-id">{{ parentJob.jobId }}</span></n-descriptions-item>
        <n-descriptions-item :label="t('job.type')">{{ parentJob.jobType }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.status')">
          <n-tag :type="isJobRecovering(parentJob) ? 'warning' : jobStatusTagType(parentJob.status)" size="small" :bordered="false">{{ isJobRecovering(parentJob) ? t('job.statusRecovering') : parentJob.status }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="t('job.initiator')">{{ formatUserIdentity(parentJob.initiator) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.dataOwner')">{{ formatUserIdentity(parentJob.dataOwner) }}</n-descriptions-item>
      </n-descriptions>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { NTag, NCode } from 'naive-ui'
import { parseJobStatusMessage, type JobSummary, type TaskSummary } from '@/api/job'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useWindowSize } from '@/composables/useWindowSize'
import { formatDateTime } from '@/utils/datetime'
import ResultCard from '@/components/ResultCard.vue'
import { hasAuditTableReference } from '@/utils/auditTableReferences'
import { isJobRecovering, isTerminalJob, useJobTracking } from '@/stores/jobTracking'
import { jobStatusTagType } from '@/utils/jobStatus'

const { t } = useI18n()
const { ensureLoaded, ensureAuditTablesLoaded, formatUserIdentity, formatValue } = useReferenceCatalog()
const { winW } = useWindowSize()

const props = defineProps<{
  task: TaskSummary | null
  job?: JobSummary | null
}>()

const { snapshots, loadedTaskSnapshots, subscribeJob } = useJobTracking()
const task = computed(() => {
  const initial = props.task
  if (!initial) return null
  return loadedTaskSnapshots[initial.jobId]?.find(item => item.taskId === initial.taskId) ?? initial
})
const parentJob = computed<JobSummary | null>(() => {
  const taskJobId = task.value?.jobId
  if (!taskJobId) return null
  const snapshot = snapshots[taskJobId]
  if (snapshot?.snapshotLoaded) return snapshot
  const providedJob = props.job
  if (!providedJob || providedJob.jobId !== taskJobId) return null
  if ('snapshotLoaded' in providedJob && providedJob.snapshotLoaded === false) return null
  return providedJob
})

watch(() => task.value, (currentTask) => { if (currentTask) void ensureLoaded() }, { immediate: true })

const emit = defineEmits<{
  (e: 'close'): void
}>()

const show = computed({
  get: () => props.task !== null,
  set: (val: boolean) => { if (!val) emit('close') },
})
watch(
  [show, () => task.value?.jobId, () => task.value?.taskId, () => isTerminalTask(task.value?.status ?? ''), () => isTerminalJob(parentJob.value)],
  ([visible, jobId, _taskId, taskTerminal, jobTerminal], _previous, onCleanup) => {
    if (!visible || !jobId || taskTerminal || jobTerminal) return
    onCleanup(subscribeJob(jobId))
  },
  { immediate: true },
)

function isTerminalTask(status: string) {
  const state = status.toLowerCase()
  return state === 'succeeded' || state === 'failed' || state === 'completed' || state === 'canceled' || state === 'cancelled'
}

const descColumns = computed(() => (winW.value < 720 ? 1 : 2))

const structuredStatus = computed(() => parseJobStatusMessage(task.value?.statusMessage))
watch(structuredStatus, (value) => {
  if (hasAuditTableReference(value)) void ensureAuditTablesLoaded()
}, { immediate: true })


</script>

<style scoped>
.entity-id {
  font-family: var(--apple-font-mono, monospace);
  font-size: 12px;
  word-break: break-all;
}
</style>
