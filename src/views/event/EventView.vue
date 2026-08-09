<template>
  <div class="event-view">
    <n-card size="small" :bordered="true">
      <PageToolbar>
        <n-input v-model:value="nodeId" :placeholder="t('event.nodeIdPlaceholder')" clearable size="small" style="width: 200px;" />
        <n-input v-model:value="filterMessageType" :placeholder="t('event.messageType')" clearable size="small" style="width: 160px;" />
        <n-input v-model:value="filterCorrelationId" :placeholder="t('event.correlationId')" clearable size="small" style="width: 200px;" />
        <template #actions>
          <n-button size="small" @click="fetchEvents">{{ t('event.query') }}</n-button>
        </template>
      </PageToolbar>

      <DataTable :columns="eventColumns" :data="events" :loading="loading"
        :row-props="(row: ProtocolEvent) => ({ style: 'cursor: pointer', onClick: () => openEventDetail(row) })" />
    </n-card>

    <!-- Event detail modal -->
    <n-modal v-model:show="showDetail" preset="card" :title="t('event.detail', { type: currentEvent?.messageType ?? '' })" style="width: 720px;">
      <n-descriptions v-if="currentEvent" :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('event.messageType')">{{ currentEvent.messageType }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.statusCode')">{{ currentEvent.statusCode ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.fromNode')">{{ currentEvent.fromNodeId }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.toNode')">{{ currentEvent.toNodeId }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.packetId')">{{ currentEvent.packetId }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.correlationId')">{{ currentEvent.correlationId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.traceId')">{{ currentEvent.traceId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.tenantId')">{{ currentEvent.tenantId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.timestamp')">{{ formatTime(currentEvent.timestampMs) }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.statusMessage')">{{ currentEvent.statusMessage || '-' }}</n-descriptions-item>
      </n-descriptions>
      <n-divider>{{ t('event.payload') }}</n-divider>
      <JsonKeyValue v-if="currentEvent?.payload" :data="currentEvent.payload" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NTag, useMessage } from 'naive-ui'
import { getProtocolEvents } from '@/api/protocolEvent'
import type { ProtocolEvent } from '@/api/protocolEvent'
import { usePagePolling } from '@/composables/usePagePolling'
import PageToolbar from '@/components/PageToolbar.vue'
import DataTable from '@/components/DataTable.vue'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const loading = ref(false)
const events = ref<ProtocolEvent[]>([])
const nodeId = ref('Audit-1')
const filterMessageType = ref('')
const filterCorrelationId = ref('')
const showDetail = ref(false)
const currentEvent = ref<ProtocolEvent | null>(null)

function formatTime(ms?: number) {
  if (!ms) return '-'
  return new Date(ms).toLocaleString('zh-CN')
}

function msgTypeColor(type: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (type.includes('Ack') || type.includes('Response')) return 'success'
  if (type.includes('Error') || type.includes('Reject')) return 'error'
  if (type.includes('Request') || type.includes('Query')) return 'info'
  return 'default'
}

const eventColumns = computed(() => [
  { title: t('event.messageType'), key: 'messageType', minWidth: 150, sorter: 'default', render: (r: ProtocolEvent) => h(NTag, { type: msgTypeColor(r.messageType), size: 'small', bordered: false }, () => r.messageType) },
  { title: t('event.fromNode'), key: 'fromNodeId', minWidth: 100, sorter: 'default' },
  { title: t('event.toNode'), key: 'toNodeId', minWidth: 100, sorter: 'default' },
  { title: t('event.statusCode'), key: 'statusCode', minWidth: 70, sorter: 'default', render: (r: ProtocolEvent) => r.statusCode ?? '-' },
  { title: t('event.statusMessage'), key: 'statusMessage', minWidth: 120, ellipsis: { tooltip: true }, render: (r: ProtocolEvent) => r.statusMessage || '-' },
  { title: t('event.timestamp'), key: 'timestampMs', minWidth: 160, sorter: 'default', defaultSortOrder: 'descend', render: (r: ProtocolEvent) => formatTime(r.timestampMs) },
])

async function fetchEvents() {
  if (!nodeId.value.trim()) { message.warning(t('event.fillNodeId')); return }
  loading.value = true
  try {
    const res = await getProtocolEvents(nodeId.value.trim(), {
      pageSize: 1000,
      messageTypes: filterMessageType.value || undefined,
      correlationId: filterCorrelationId.value || undefined,
    })
    events.value = ((res as any)?.items ?? []) as ProtocolEvent[]
  } catch (e: any) { message.error(e?.response?.data?.message || t('event.queryFailed')) } finally { loading.value = false }
}

function openEventDetail(event: ProtocolEvent) {
  currentEvent.value = event
  showDetail.value = true
}

watch([filterMessageType, filterCorrelationId], fetchEvents)
onMounted(() => { register(fetchEvents, route.path) })
</script>

<style scoped>
.event-view { max-width: 1200px; }
</style>
