<template>
  <n-modal v-model:show="show" preset="card" :title="t('job.taskDetail', { id: task?.taskId ?? '' })" style="width: 640px; max-width: 92vw;">
    <n-descriptions v-if="task" :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('job.taskId')" :span="2">{{ task.taskId }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.jobId')" :span="2">{{ task.jobId }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.status')">
        <n-tag :type="statusTagType(task.status)" size="small" :bordered="false">{{ task.status }}</n-tag>
      </n-descriptions-item>
      <n-descriptions-item :label="t('job.taskType')">{{ task.taskType ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.taskSubType')">{{ task.taskSubType || '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.priority')">{{ task.priority ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.createdAt')">{{ formatTime(task.createdAtMs) }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.submittedAt')">{{ formatTime(task.submittedAtMs) }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.startedAt')">{{ formatTime(task.startedAtMs) }}</n-descriptions-item>
      <n-descriptions-item :label="t('job.completedAt')">{{ formatTime(task.completedAtMs) }}</n-descriptions-item>
      <n-descriptions-item v-if="task.statusMessage" :label="t('job.message')" :span="2">
        <n-code :code="task.statusMessage" />
      </n-descriptions-item>
    </n-descriptions>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NTag, NCode } from 'naive-ui'
import type { TaskSummary } from '@/api/job'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = defineProps<{
  task: TaskSummary | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const show = computed({
  get: () => props.task !== null,
  set: (val: boolean) => { if (!val) emit('close') },
})

function statusTagType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  switch (status?.toLowerCase()) {
    case 'running': return 'info'
    case 'pending': return 'default'
    case 'succeeded': return 'success'
    case 'failed': return 'error'
    case 'rejected': return 'warning'
    default: return 'default'
  }
}

function formatTime(ms?: number): string {
  if (!ms || ms === 0) return '-'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}
</script>