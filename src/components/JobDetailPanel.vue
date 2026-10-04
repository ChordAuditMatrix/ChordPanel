<template>
  <div class="job-detail-panel" :class="{ 'job-detail-compact': compact }">
    <n-spin :show="loading">
      <n-descriptions v-if="job" :column="descColumns" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('job.jobId')"><span class="job-id-value">{{ job.jobId }}</span></n-descriptions-item>
        <n-descriptions-item :label="t('job.type')">{{ job.jobType }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.status')">
          <n-tag :type="statusTagType(job.status)" size="small" :bordered="false">{{ job.status }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="t('job.initiator')">{{ formatUserIdentity(job.initiator) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.dataOwner')">{{ formatUserIdentity(job.dataOwner) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.duration')">{{ job?.totalDurationMs ?? '-' }} ms</n-descriptions-item>
        <n-descriptions-item :label="t('job.createdAt')">{{ formatDateTime(job?.createdAtMs) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.endedAt')">{{ formatDateTime(job?.endedAtMs) }}</n-descriptions-item>
        <n-descriptions-item v-if="job.statusMessage" :label="t('job.message')" :span="descColumns">{{ job.statusMessage }}</n-descriptions-item>
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
      <n-divider>{{ t('job.subtasks', { n: tasks.length }) }}</n-divider>
      <n-data-table v-if="tasks.length" :columns="taskColumns" :data="tasks" size="small"
        :bordered="false" :max-height="compact ? 200 : undefined" :pagination="compact ? { pageSize: 5 } : { pageSize: 10 }"
        :row-props="(row: TaskSummary) => ({ style: 'cursor: pointer', onClick: () => emit('taskClick', row, job) })" />
      <n-empty v-else :description="t('job.noSubtasks')" size="small" />

      <n-divider>{{ t('job.statusHistory') }}</n-divider>
      <n-timeline>
        <n-timeline-item v-for="h in jobHistory" :key="h.sequence"
          :type="historyTagType(h.status)"
          :title="h.status"
          :content="h.statusMessage"
          :time="formatDateTime(h.switchedAtMs)" />
      </n-timeline>
    </n-spin>
    <div v-if="!hideActions && job && ['pending', 'running'].includes(job.status?.toLowerCase())" class="job-actions">
      <n-button type="error" size="small" @click="emit('cancel', job.jobId)">{{ t('job.cancelJob') }}</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import { NTag } from 'naive-ui'
import { getJobDetail, getJobTasks, type JobDetail, type TaskSummary } from '@/api/job'
import { useI18n } from '@/stores/i18n'
import { useIdentityCatalog } from '@/stores/identityCatalog'
import { useWindowSize } from '@/composables/useWindowSize'
import { useJobResultPolling, isTerminalStatus } from '@/composables/useJobResultPolling'
import { formatDateTime } from '@/utils/datetime'
import JsonKeyValue from '@/components/JsonKeyValue.vue'

const { t } = useI18n()
const { ensureLoaded, formatUserIdentity, formatValue } = useIdentityCatalog()
const { winW } = useWindowSize()

const props = withDefaults(defineProps<{
  jobId: string
  compact?: boolean
  hideActions?: boolean
  jobSnapshot?: JobDetail | null
}>(), {
  compact: false,
  hideActions: false,
  jobSnapshot: null,
})
const { pollJobResult, stopPolling } = useJobResultPolling()

const emit = defineEmits<{
  (e: 'taskClick', task: TaskSummary, job: JobDetail | null): void
  (e: 'cancel', jobId: string): void
}>()

const loading = ref(false)
const job = ref<JobDetail | null>(null)
const tasks = ref<TaskSummary[]>([])
let detailRequest = 0

const descColumns = computed(() => (props.compact || winW.value < 720 ? 1 : 2))

const jobHistory = computed(() => job.value?.history ?? [])

const taskColumns = computed(() => [
  { title: t('job.taskId'), key: 'taskId', minWidth: 140, ellipsis: { tooltip: true }, render: (r: TaskSummary) => h('span', { style: 'font-family: var(--apple-font-mono, monospace); font-size: 12px' }, r.taskId) },
  { title: t('job.status'), key: 'status', minWidth: 80, render: (r: TaskSummary) => h(NTag, { type: statusTagType(r.status), size: 'small', bordered: false }, () => r.status) },
  { title: t('job.type'), key: 'taskType', minWidth: 80, render: (r: TaskSummary) => r.taskType ?? '-' },
  { title: t('job.taskSubType'), key: 'taskSubType', minWidth: 80, render: (r: TaskSummary) => r.taskSubType || '-' },
  { title: t('job.message'), key: 'statusMessage', ellipsis: { tooltip: true } },
])

function statusTagType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const s = (status || '').toLowerCase()
  if (s === 'succeeded' || s === 'completed') return 'success'
  if (s === 'running') return 'info'
  if (s === 'pending') return 'default'
  if (s === 'failed') return 'error'
  if (s === 'canceled' || s === 'cancelled') return 'warning'
  return 'default'
}

function historyTagType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  return statusTagType(status)
}

async function fetchDetail(jobId: string) {
  ensureLoaded()
  const request = ++detailRequest
  job.value = null
  tasks.value = []
  loading.value = true
  try {
    const [detail, taskList] = await Promise.all([
      getJobDetail(jobId),
      getJobTasks(jobId, { pageSize: 100 }).catch(() => null),
    ])
    if (request !== detailRequest || props.jobId !== jobId) return

    const snapshot = props.jobSnapshot?.jobId === jobId ? props.jobSnapshot : null
    const resolvedDetail = detail as unknown as JobDetail
    job.value = snapshot ? { ...resolvedDetail, ...snapshot } : resolvedDetail
    tasks.value = ((taskList as any)?.items ?? []) as TaskSummary[]

    if (!props.compact && !isTerminalStatus(job.value.status)) {
      pollJobResult(jobId, (updated: JobDetail) => {
        if (request !== detailRequest || props.jobId !== jobId) return
        job.value = updated
        void getJobTasks(jobId, { pageSize: 100 }).then((latestTasks: any) => {
          if (request === detailRequest && props.jobId === jobId) {
            tasks.value = (latestTasks?.items ?? []) as TaskSummary[]
          }
        }).catch(() => {})
      })
    } else {
      stopPolling(jobId)
    }
  } catch { /* ignore */ }
  finally { if (request === detailRequest) loading.value = false }
}

watch(() => props.jobId, (jobId, previousJobId) => {
  if (previousJobId) stopPolling(previousJobId)
  void fetchDetail(jobId)
}, { immediate: true })

watch(() => props.jobSnapshot, (snapshot) => {
  if (snapshot?.jobId && snapshot.jobId === props.jobId && job.value?.jobId === snapshot.jobId) {
    job.value = { ...job.value, ...snapshot }
  }
})
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