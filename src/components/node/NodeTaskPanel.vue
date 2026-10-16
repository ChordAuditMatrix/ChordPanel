<template>
  <section v-if="node.tasks?.length" class="task-panel">
    <n-divider title-placement="left">{{ t('node.activeTasksCount', { n: node.tasks.length }) }}</n-divider>
    <n-data-table
      :columns="columns"
      :data="node.tasks"
      size="small"
      :bordered="false"
      :max-height="200"
      :row-props="(row: NodeTaskRow) => ({ style: 'cursor: pointer', onClick: () => emit('task-click', row) })"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { NTag } from 'naive-ui'
import type { NodeDetail, NodeTask } from './types'
import { formatTime } from './types'
import { useI18n } from '@/stores/i18n'
import { jobStatusTagType } from '@/utils/jobStatus'

type NodeTaskRow = NodeTask & { startedAtMs?: number | string; startTime?: number | string }

defineProps<{ node: NodeDetail }>()
const emit = defineEmits<{ (event: 'task-click', row: NodeTaskRow): void }>()
const { t } = useI18n()
const columns = computed(() => [
  { title: t('node.requestId'), key: 'requestId', ellipsis: { tooltip: true }, minWidth: 100 },
  { title: t('node.type'), key: 'taskType', minWidth: 70 },
  { title: t('node.jobId'), key: 'jobId', ellipsis: { tooltip: true }, minWidth: 100 },
  { title: t('node.status'), key: 'status', minWidth: 80, render: (row: NodeTaskRow) => h(NTag, { size: 'small', type: jobStatusTagType(row.status), bordered: false }, { default: () => row.status }) },
  { title: t('node.startedAt'), key: 'startedAt', minWidth: 120, render: (row: NodeTaskRow) => formatTime(row.startedAtMs ?? row.startedAt ?? row.startTime) },
])
</script>

<style scoped>
.task-panel :deep(.n-divider) { margin-block: 18px 12px; }
</style>
