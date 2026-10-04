<template>
  <n-modal v-model:show="show" preset="card" :title="t('job.taskDetail', { id: task?.taskId ?? '' })" style="width: 640px; max-width: 92vw;">
    <n-descriptions v-if="task" :column="descColumns" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('job.taskId')" :span="descColumns"><span class="entity-id">{{ task.taskId }}</span></n-descriptions-item>
      <n-descriptions-item :label="t('job.jobId')" :span="descColumns"><span class="entity-id">{{ task.jobId }}</span></n-descriptions-item>
      <n-descriptions-item :label="t('job.status')">
        <n-tag :type="statusTagType(task.status)" size="small" :bordered="false">{{ task.status }}</n-tag>
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
          <n-tag :type="statusTagType(parentJob.status)" size="small" :bordered="false">{{ parentJob.status }}</n-tag>
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
import type { JobSummary, TaskSummary } from '@/api/job'
import { useI18n } from '@/stores/i18n'
import { useIdentityCatalog } from '@/stores/identityCatalog'
import { useWindowSize } from '@/composables/useWindowSize'
import { formatDateTime } from '@/utils/datetime'
import ResultCard from '@/components/ResultCard.vue'

const { t } = useI18n()
const { ensureLoaded, formatUserIdentity, formatValue } = useIdentityCatalog()
const { winW } = useWindowSize()

const props = defineProps<{
  task: TaskSummary | null
  job?: JobSummary | null
}>()

// Shared, deduped catalog load: detail names resolve without per-cell requests
watch(() => props.task, (task) => { if (task) ensureLoaded() }, { immediate: true })

const emit = defineEmits<{
  (e: 'close'): void
}>()

const show = computed({
  get: () => props.task !== null,
  set: (val: boolean) => { if (!val) emit('close') },
})

const descColumns = computed(() => (winW.value < 720 ? 1 : 2))

const parentJob = computed<JobSummary | null>(() => {
  const task = props.task
  const job = props.job
  if (!task || !job || !task.jobId || job.jobId !== task.jobId) return null
  return job
})

/** Parsed object/array statusMessage, otherwise null (ordinary text path). */
const structuredStatus = computed<unknown>(() => {
  const message = props.task?.statusMessage
  if (!message) return null
  const trimmed = message.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
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
</script>

<style scoped>
.entity-id {
  font-family: var(--apple-font-mono, monospace);
  font-size: 12px;
  word-break: break-all;
}
</style>
