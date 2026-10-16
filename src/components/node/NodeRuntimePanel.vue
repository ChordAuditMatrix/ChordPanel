<template>
  <section class="detail-panel">
    <n-divider title-placement="left" style="margin-top: 0">{{ t('node.runtimeStatus') }}</n-divider>
    <n-descriptions :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('node.cpuUsage')">
        <span :class="{ 'stat-warn': exceedsThreshold(node.runtimeState?.cpuUsage) }">{{ percentage(node.runtimeState?.cpuUsage) }}</span>
      </n-descriptions-item>
      <n-descriptions-item :label="t('node.memoryUsage')">
        <span :class="{ 'stat-warn': exceedsThreshold(node.runtimeState?.memoryUsage) }">{{ percentage(node.runtimeState?.memoryUsage) }}</span>
      </n-descriptions-item>
      <n-descriptions-item :label="t('node.currentLoad')">{{ percentage(node.runtimeState?.currentLoad, 100) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.queueDepth')">{{ count(node.runtimeState?.queueDepth) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.activeTasks')">{{ count(node.runtimeState?.activeTaskCount) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.maxConcurrency')">{{ count(node.capabilities?.maxConcurrentTasks) }}</n-descriptions-item>
    </n-descriptions>

    <n-divider title-placement="left">{{ t('node.capabilities') }}</n-divider>
    <n-descriptions :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('node.maxFrameSize')">{{ formatBytes(node.capabilities?.maxFrameSize) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.maxInFlight')">{{ node.capabilities?.maxInFlightRequests ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.supportsDirectTransfer')">{{ capability(node.capabilities?.supportsDirectTransfer) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.supportsLease')">{{ capability(node.capabilities?.supportsLease) }}</n-descriptions-item>
    </n-descriptions>
    <div v-if="node.capabilities?.supportedTaskTypes?.length" class="task-types">
      <span class="task-types-label">{{ t('node.supportedTaskTypes') }}:</span>
      <n-tag v-for="taskType in node.capabilities.supportedTaskTypes" :key="taskType" size="small" :bordered="false" class="task-type">
        {{ taskType }}
      </n-tag>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  formatBytes,
  formatNodePercentage as percentage,
  formatNodeCount as count,
  isNodeMetricHigh as exceedsThreshold,
  type NodeDetail,
} from './types'
import { useI18n } from '@/stores/i18n'

defineProps<{ node: NodeDetail }>()
const { t } = useI18n()

function capability(value: boolean | undefined): string {
  return value === true ? t('node.yes') : value === false ? t('node.no') : '-'
}
</script>

<style scoped>
.detail-panel :deep(.n-divider) { margin-block: 18px 12px; }
.task-types { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.task-types-label { margin-right: 2px; font-size: 12px; color: var(--text-color-3); }
.task-type { margin: 0; }
.stat-warn { color: var(--error-color); }
</style>
