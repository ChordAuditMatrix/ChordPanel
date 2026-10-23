<template>
  <section class="detail-panel">
    <n-divider title-placement="left" style="margin-top: 0">{{ t('node.basicInfo') }}</n-divider>
    <n-descriptions :column="2" label-placement="left" bordered size="small">
      <n-descriptions-item :label="t('node.nodeId')">{{ node.nodeId || t('node.workbench.unknown') }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.instanceId')">{{ node.nodeInstanceId || t('node.workbench.unknown') }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.role')">{{ node.role || t('node.workbench.unknown') }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.availability')">
        <n-tag :type="availabilityTagType" size="small" :bordered="false">{{ availabilityLabel }}</n-tag>
      </n-descriptions-item>
      <n-descriptions-item :label="t('node.state')">{{ stateLabel }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.stateReason')">{{ node.runtimeState?.stateReason || t('node.workbench.unknown') }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.workbench.offlineSince')">{{ formatTime(node.liveness?.offlineSince) }}</n-descriptions-item>
      <n-descriptions-item :label="t('node.workbench.suspectReason')">{{ node.liveness?.suspectReason || t('node.workbench.unknown') }}</n-descriptions-item>
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
import { computed } from 'vue'
import { formatTime, type NodeDetail } from './types'
import { classifyNodeAvailability, nodeStateKey } from './nodeWorkbenchModel'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{ node: NodeDetail }>()
const { t } = useI18n()

const availability = computed(() => classifyNodeAvailability({ isAvailable: props.node.liveness?.isAvailable }))
const availabilityLabel = computed(() => availability.value === 'available'
  ? t('node.available')
  : availability.value === 'offline'
    ? t('node.workbench.offline')
    : t('node.workbench.unknown'))
const availabilityTagType = computed<'success' | 'error' | 'default'>(() => availability.value === 'available' ? 'success' : availability.value === 'offline' ? 'error' : 'default')
const stateLabel = computed(() => {
  const state = props.node.runtimeState?.state
  if (!state) return t('node.workbench.unknown')
  const key = nodeStateKey(state)
  return key ? t(key) : state
})

function endpointAddress(host?: string, port?: number): string {
  if (typeof host !== 'string' || !host.trim() || typeof port !== 'number' || !Number.isFinite(port)) return t('node.workbench.unknown')
  return `${host}:${port}`
}
</script>

<style scoped>
.detail-panel :deep(.n-divider) { margin-block: 18px 12px; }
</style>
