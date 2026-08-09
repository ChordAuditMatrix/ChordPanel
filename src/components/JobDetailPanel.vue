<template>
  <div class="job-detail-panel" :class="{ 'job-detail-compact': compact }">
    <n-spin :show="loading">
      <n-descriptions v-if="job" :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('job.taskId')">{{ job.jobId }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.type')">{{ job.jobType }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.status')">
          <n-tag :type="statusTagType(job.status)" size="small" :bordered="false">{{ job.status }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="t('job.initiator')">{{ job?.initiator?.userName ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.dataOwner')">{{ job?.dataOwner?.userId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.duration')">{{ job?.totalDurationMs ?? '-' }} ms</n-descriptions-item>
        <n-descriptions-item :label="t('job.createdAt')">{{ formatTime(job?.createdAtMs) }}</n-descriptions-item>
        <n-descriptions-item :label="t('job.endedAt')">{{ formatTime(job?.endedAtMs) }}</n-descriptions-item>
        <n-descriptions-item v-if="job.statusMessage" :label="t('job.message')" :span="2">{{ job.statusMessage }}</n-descriptions-item>
        <n-descriptions-item v-if="job.errorCode && job.errorCode !== 'None'" :label="t('job.errorCode')" :span="2">
          <n-tag type="error" size="small" :bordered="false">{{ job.errorCode }}</n-tag>
        </n-descriptions-item>
      </n-descriptions>

      <!-- Metadata -->
      <template v-if="job?.metadata && Object.keys(job.metadata).length">
        <n-divider>{{ t('job.metadata') }}</n-divider>
        <n-descriptions :column="2" label-placement="left" bordered size="small">
          <n-descriptions-item v-for="(v, k) in job.metadata" :key="k" :label="k">{{ v }}</n-descriptions-item>
        </n-descriptions>
      </template>

      <!-- Subtask list -->
      <n-divider>{{ t('job.subtasks', { n: tasks.length }) }}</n-divider>
      <n-data-table v-if="tasks.length" :columns="taskColumns" :data="tasks" size="small"
        :bordered="false" :max-height="compact ? 200 : undefined" :pagination="compact ? { pageSize: 5 } : { pageSize: 10 }"
        :row-props="(row: any) => ({ style: 'cursor: pointer', onClick: () => emit('taskClick', row) })" />
      <n-empty v-else :description="t('job.noSubtasks')" size="small" />

      <n-divider>{{ t('job.statusHistory') }}</n-divider>
      <n-timeline>
        <n-timeline-item v-for="h in jobHistory" :key="h.sequence"
          :type="historyTagType(h.status)"
          :title="h.status"
          :content="h.statusMessage"
          :time="formatTime(h.switchedAtMs)" />
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

const { t } = useI18n()

const props = withDefaults(defineProps<{
  jobId: string
  compact?: boolean
  hideActions?: boolean
}>(), {
  compact: false,
  hideActions: false,
})

const emit = defineEmits<{
  (e: 'taskClick', task: TaskSummary): void
  (e: 'cancel', jobId: string): void
}>()

const loading = ref(false)
const job = ref<JobDetail | null>(null)
const tasks = ref<TaskSummary[]>([])

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

function formatTime(t?: string | number) {
  if (!t) return '-'
  const d = new Date(typeof t === 'number' ? t : t.includes('T') ? t : Number(t))
  return isNaN(d.getTime()) ? String(t) : d.toLocaleString('zh-CN')
}

async function fetchDetail() {
  loading.value = true
  try {
    const [detail, taskList] = await Promise.all([
      getJobDetail(props.jobId),
      getJobTasks(props.jobId, { pageSize: 100 }).catch(() => null),
    ])
    job.value = detail as any
    tasks.value = ((taskList as any)?.items ?? []) as TaskSummary[]
  } catch { /* ignore */ }
  finally { loading.value = false }
}

watch(() => props.jobId, fetchDetail, { immediate: true })
</script>

<style scoped>
.job-detail-panel {
  min-width: 400px;
}

.job-detail-compact {
  min-width: 360px;
  max-width: 480px;
}

.job-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
</style>