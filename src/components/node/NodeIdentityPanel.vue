<template>
  <section class="detail-panel">
    <n-divider title-placement="left" style="margin-top: 0">{{ t('node.basicInfo') }}</n-divider>
    <n-descriptions :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('node.nodeId')">{{ node.nodeId }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.instanceId')">{{ node.nodeInstanceId || '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.role')">{{ node.role ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.availability')">
        <n-tag v-if="typeof node.liveness?.isAvailable === 'boolean'" :type="node.liveness.isAvailable ? 'success' : 'error'" size="small" :bordered="false">
          {{ node.liveness.isAvailable ? t('node.available') : t('node.unavailable') }}
        </n-tag>
        <span v-else>-</span>
      </n-descriptions-item>
      <n-descriptions-item :label="t('node.state')">{{ node.runtimeState?.state ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.stateReason')">{{ node.runtimeState?.stateReason || '-' }}</n-descriptions-item>
    </n-descriptions>

    <n-divider title-placement="left">{{ t('node.connection') }}</n-divider>
    <n-descriptions :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('node.address')">{{ endpointAddress(node.endpoint?.host, node.endpoint?.port) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.transport')">{{ node.endpoint?.transport || '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.advertiseAddress')">{{ endpointAddress(node.endpoint?.advertiseHost, node.endpoint?.advertisePort) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.livenessPolicy')">{{ node.liveness?.policyType ?? '-' }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.lastSeen')">{{ formatTime(node.liveness?.lastSeenAt) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.lastReport')">{{ formatTime(node.runtimeState?.lastReportAt) }}</n-descriptions-item>
    </n-descriptions>
  </section>
</template>

<script setup lang="ts">
import { formatTime, type NodeDetail } from './types'
import { useI18n } from '@/stores/i18n'

defineProps<{ node: NodeDetail }>()
const { t } = useI18n()
function endpointAddress(host?: string, port?: number): string {
  if (typeof host !== 'string' || !host.trim() || typeof port !== 'number' || !Number.isFinite(port)) return '-'
  return `${host}:${port}`
}
</script>

<style scoped>
.detail-panel :deep(.n-divider) { margin-block: 18px 12px; }
</style>
