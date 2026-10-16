<template>
  <div class="job-detail-panel" :class="{ 'job-detail-compact': compact }">
    <n-spin :show="loading">
      <n-descriptions v-if="job" :column="descColumns" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('job.jobId')"><span class="job-id-value">{{ job.jobId }}</span></n-descriptions-item>
        <n-descriptions-item :label="t('job.type')">{{ job.jobType }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.status')">
          <n-tag :type="isJobRecovering(job) ? 'warning' : jobStatusTagType(job.status)" size="small" :bordered="false">{{ isJobRecovering(job) ? t('job.statusRecovering') : job.status }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="t('job.initiator')">{{ formatUserIdentity(job.initiator) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.dataOwner')">{{ formatUserIdentity(job.dataOwner) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.duration')">{{ job?.totalDurationMs ?? '-' }} ms</n-descriptions-item>
        <n-descriptions-item :label="t('job.createdAt')">{{ formatDateTime(job?.createdAtMs) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.endedAt')">{{ formatDateTime(job?.endedAtMs) }}</n-descriptions-item>
        <n-descriptions-item v-if="job.statusMessage" :label="t('job.message')" :span="descColumns">
          <JobStatusMessage :message="job.statusMessage" />
        </n-descriptions-item>
        <n-descriptions-item v-if="job.errorCode && job.errorCode !== 'None'" :label="t('job.errorCode')" :span="descColumns">
          <n-tag type="error" size="small" :bordered="false">{{ job.errorCode }}</n-tag>
        </n-descriptions-item>
      </n-descriptions>

      <!-- Metadata -->
      <template v-if="job?.metadata && Object.keys(job.metadata).length">
        <n-divider>{{ t('job.metadata') }}</n-divider>
        <JsonKeyValue :data="job.metadata" :format-value="formatValue" />
      </template>

      <!-- Subtask list -->
      <n-divider>{{ t('job.subtasks', { n: taskPage.total }) }}</n-divider>
      <n-alert v-if="taskPage.error" type="error" :bordered="false" style="margin-bottom: 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>{{ t('job.loadTasksFailed') }}</span>
          <n-button size="tiny" @click="retryTaskPage(props.jobId)">{{ t('common.retry') }}</n-button>
        </div>
      </n-alert>
      <ServerPagedDataTable
        v-else-if="taskPage.loading || taskPage.total > 0 || tasks.length > 0"
        :columns="taskColumns"
        :data="tasks"
        :loading="taskPage.loading"
        :page="taskPage.page"
        :page-size="taskPage.pageSize"
        :total="taskPage.total"
        :page-sizes="[5, 10, 20, 50]"
        :row-props="(row: TaskSummary) => ({ style: 'cursor: pointer', onClick: () => emit('taskClick', row, job) })"
        @update:page="setTaskPage(props.jobId, $event, taskPage.pageSize)"
        @update:page-size="setTaskPage(props.jobId, 1, $event)"
      />
      <n-empty v-else :description="t('job.noSubtasks')" size="small" />

      <n-divider>{{ t('job.statusHistory') }}</n-divider>
      <n-timeline>
        <n-timeline-item v-for="h in jobHistory" :key="h.sequence"
          :type="jobStatusTagType(h.status)"
          :title="h.status"
          :time="formatDateTime(h.switchedAtMs)">
            <JobStatusMessage :message="h.statusMessage" />
        </n-timeline-item>
      </n-timeline>
    </n-spin>
    <n-alert v-if="detailLoadFailed" type="error" :bordered="false" style="margin-top: 12px">
      {{ t('job.loadDetailFailed') }}
    </n-alert>
    <div v-if="!hideActions && job && ['pending', 'running'].includes(job.status?.toLowerCase()) && !isJobRecovering(job)" class="job-actions">
      <n-button type="error" size="small" @click="emit('cancel', job.jobId)">{{ t('job.cancelJob') }}</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, h } from 'vue'
import { NTag } from 'naive-ui'
import type { JobDetail, JobSummary, TaskSummary } from '@/api/job'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useWindowSize } from '@/composables/useWindowSize'
import { isJobRecovering, useJobTracking } from '@/stores/jobTracking'
import { formatDateTime } from '@/utils/datetime'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import JobStatusMessage from '@/components/JobStatusMessage.vue'
import { hasAuditTableReference } from '@/utils/auditTableReferences'
import { jobStatusTagType } from '@/utils/jobStatus'

const { t } = useI18n()
const { ensureLoaded, ensureAuditTablesLoaded, formatUserIdentity, formatValue } = useReferenceCatalog()
const { winW } = useWindowSize()

const props = withDefaults(defineProps<{
  jobId: string
  compact?: boolean
  hideActions?: boolean
  visible: boolean
  jobSnapshot?: JobSummary | null
}>(), {
  compact: false,
  hideActions: false,
  jobSnapshot: null,
})

const emit = defineEmits<{
  (e: 'taskClick', task: TaskSummary, job: JobDetail | null): void
  (e: 'cancel', jobId: string): void
}>()

const { snapshots, taskSnapshots, taskPages, setTaskPage, retryTaskPage, subscribeJob } = useJobTracking()
const job = computed<JobDetail | null>(() => {
  const snapshot = snapshots[props.jobId]
  if (snapshot?.snapshotLoaded) return snapshot
  const providedJob = props.jobSnapshot
  if (providedJob && !('snapshotLoaded' in providedJob && providedJob.snapshotLoaded === false)) return providedJob
  return null
})
const detailLoadFailed = computed(() => snapshots[props.jobId]?.detailLoadFailed === true)
const loading = computed(() => !job.value && !detailLoadFailed.value)
const tasks = computed(() => taskSnapshots[props.jobId] ?? [])
const taskPage = computed(() => taskPages[props.jobId] ?? { page: 1, pageSize: 10, total: 0, loading: false, error: false })

watch([() => props.jobId, () => props.visible], ([jobId, visible], _previous, onCleanup) => {
  if (!visible) return
  ensureLoaded()
  const release = subscribeJob(jobId)
  onCleanup(release)
}, { immediate: true })
watch(() => job.value, detail => {
  if (hasAuditTableReference(detail?.metadata)) void ensureAuditTablesLoaded()
}, { immediate: true })

const descColumns = computed(() => (props.compact || winW.value < 720 ? 1 : 2))

const jobHistory = computed(() => job.value?.history ?? [])

const taskColumns = computed(() => [
  { title: t('job.taskId'), key: 'taskId', minWidth: 140, ellipsis: { tooltip: true }, render: (r: TaskSummary) => h('span', { style: 'font-family: var(--apple-font-mono, monospace); font-size: 12px' }, r.taskId) },
  { title: t('job.status'), key: 'status', minWidth: 80, render: (r: TaskSummary) => h(NTag, { type: jobStatusTagType(r.status), size: 'small', bordered: false }, () => r.status) },
  { title: t('job.type'), key: 'taskType', minWidth: 80, render: (r: TaskSummary) => r.taskType ?? '-' },
  { title: t('job.taskSubType'), key: 'taskSubType', minWidth: 80, render: (r: TaskSummary) => r.taskSubType || '-' },
  { title: t('job.message'), key: 'statusMessage', minWidth: 160, render: (row: TaskSummary) => h('div', { style: 'max-height: 56px; overflow: auto' }, [h(JobStatusMessage, { message: row.statusMessage })]) },
])

</script>

<style scoped>
.job-detail-panel {
  min-width: 0;
}

.job-detail-compact {
  min-width: 0;
  max-width: 480px;
}

.job-id-value {
  font-family: var(--apple-font-mono, monospace);
  font-size: 12px;
  word-break: break-all;
}

:deep(.n-descriptions-table-content) {
  word-break: break-word;
}

.job-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
</style>