<template>
  <div class="event-view">
    <n-card size="small" :bordered="true">
      <PageToolbar>
        <NodeSelect v-model="nodeId" :placeholder="t('event.nodeIdPlaceholder')" size="small" style="width: 200px;" />
        <NodeSelect v-model="filterFromNodeId" :placeholder="t('event.fromNodeId')" size="small" style="width: 200px;" />
        <NodeSelect v-model="filterToNodeId" :placeholder="t('event.toNodeId')" size="small" style="width: 200px;" />
        <n-input v-model:value="filterMessageType" :placeholder="t('event.messageType')" clearable size="small" style="width: 160px;" />
        <n-input v-model:value="filterCorrelationId" :placeholder="t('event.correlationId')" clearable size="small" style="width: 200px;" />
        <template #actions>
          <n-button size="small" @click="submitQuery">{{ t('event.query') }}</n-button>
        </template>
      </PageToolbar>

      <ServerPagedDataTable :columns="eventColumns" :data="events" :loading="loading" :page="page" :page-size="pageSize" :total="total" :remote="true"
        :row-props="(row: ProtocolEvent) => ({ style: 'cursor: pointer', onClick: () => openEventDetail(row) })"
        @update:page="handlePageChange" @update:page-size="handlePageSizeChange" @update:sorter="handleSortChange" />
    </n-card>

    <!-- Event detail modal -->
    <n-modal v-model:show="showDetail" preset="card" :title="t('event.detail', { type: currentEvent?.messageType ?? '' })" style="width: 720px; max-width: 92vw;">
      <n-descriptions v-if="currentEvent" :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('event.messageType')">{{ currentEvent.messageType }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.statusCode')">{{ currentEvent.statusCode ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.fromNode')">{{ currentEvent.fromNodeId }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.toNode')">{{ currentEvent.toNodeId }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.packetId')">{{ currentEvent.packetId }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.correlationId')">{{ currentEvent.correlationId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.traceId')">{{ currentEvent.traceId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.tenantId')">{{ currentEvent.tenantId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.timestamp')">{{ formatDateTime(currentEvent.timestampMs) }}</n-descriptions-item>
        <n-descriptions-item :label="t('event.statusMessage')">{{ currentEvent.statusMessage || '-' }}</n-descriptions-item>
      </n-descriptions>
      <n-divider>{{ t('event.payload') }}</n-divider>
      <JsonKeyValue v-if="currentEvent?.payload" :data="currentEvent.payload" />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NTag, useMessage } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { getProtocolEvents } from '@/api/protocolEvent'
import type { ProtocolEvent } from '@/api/protocolEvent'
import { usePagePolling } from '@/composables/usePagePolling'
import PageToolbar from '@/components/PageToolbar.vue'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import NodeSelect from '@/components/NodeSelect.vue'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import { formatDateTime } from '@/utils/datetime'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const loading = ref(false)
const events = ref<ProtocolEvent[]>([])
const nodeId = ref('')
const filterFromNodeId = ref('')
const filterToNodeId = ref('')
const filterMessageType = ref('')
const filterCorrelationId = ref('')
const page = ref(1)
const pageSize = ref(20)
const sortOrder = ref<'ascend' | 'descend'>('descend')
const total = ref(0)
const showDetail = ref(false)
const currentEvent = ref<ProtocolEvent | null>(null)
let requestSequence = 0
let pendingRequests = 0
let mounted = false

interface EventFilters {
  nodeId: string
  fromNodeId?: string
  toNodeId?: string
  messageTypes?: string
  correlationId?: string
}
const appliedFilters = ref<EventFilters | null>(null)
let appliedSequence = 0

function msgTypeColor(type: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  if (type.includes('Ack') || type.includes('Response')) return 'success'
  if (type.includes('Error') || type.includes('Reject')) return 'error'
  if (type.includes('Request') || type.includes('Query')) return 'info'
  return 'default'
}

const eventColumns = computed<DataTableColumns<ProtocolEvent>>(() => [
  { title: t('event.messageType'), key: 'messageType', minWidth: 150, render: (r: ProtocolEvent) => h(NTag, { type: msgTypeColor(r.messageType), size: 'small', bordered: false }, () => r.messageType) },
  { title: t('event.fromNode'), key: 'fromNodeId', minWidth: 100 },
  { title: t('event.toNode'), key: 'toNodeId', minWidth: 100 },
  { title: t('event.statusCode'), key: 'statusCode', minWidth: 70, render: (r: ProtocolEvent) => r.statusCode ?? '-' },
  { title: t('event.statusMessage'), key: 'statusMessage', minWidth: 120, ellipsis: { tooltip: true }, render: (r: ProtocolEvent) => r.statusMessage || '-' },
  { title: t('event.timestamp'), key: 'timestampMs', minWidth: 160, sorter: 'default', sortOrder: sortOrder.value, render: (r: ProtocolEvent) => formatDateTime(r.timestampMs) },
])
function handleSortChange(sorter: DataTableSortState | null) {
  if (sorter?.columnKey && sorter.columnKey !== 'timestampMs') return
  sortOrder.value = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  page.value = 1
  events.value = []
  void fetchEvents(appliedFilters.value, 1)
}

function readEventPage(value: unknown): { items: ProtocolEvent[]; total: number } {
  if (value === null || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) {
    throw new TypeError('Invalid protocol event page response')
  }
  return {
    items: value.items.filter((item): item is ProtocolEvent => isProtocolEvent(item)),
    total: 'total' in value && typeof value.total === 'number' ? value.total : value.items.length,
  }
}
function isProtocolEvent(value: unknown): value is ProtocolEvent {
  if (value === null || typeof value !== 'object') return false
  return 'packetId' in value && typeof value.packetId === 'string'
    && 'fromNodeId' in value && typeof value.fromNodeId === 'string'
    && 'toNodeId' in value && typeof value.toNodeId === 'string'
    && 'messageType' in value && typeof value.messageType === 'string'
    && 'timestampMs' in value && typeof value.timestampMs === 'number'
}

function snapshotFilters(): EventFilters {
  return {
    nodeId: nodeId.value.trim(),
    fromNodeId: filterFromNodeId.value.trim() || undefined,
    toNodeId: filterToNodeId.value.trim() || undefined,
    messageTypes: filterMessageType.value.trim() || undefined,
    correlationId: filterCorrelationId.value.trim() || undefined,
  }
}

async function fetchEvents(filters = appliedFilters.value, requestedPage = page.value) {
  if (!filters?.nodeId) {
    requestSequence += 1
    events.value = []
    total.value = 0
    loading.value = false
    message.warning(t('event.fillNodeId'))
    return
  }
  const sequence = ++requestSequence
  const filterSequence = appliedSequence
  pendingRequests += 1
  loading.value = true
  try {
    const response: unknown = await getProtocolEvents(filters.nodeId, {
      page: requestedPage,
      pageSize: pageSize.value,
      fromNodeId: filters.fromNodeId,
      toNodeId: filters.toNodeId,
      messageTypes: filters.messageTypes,
      correlationId: filters.correlationId,
      ascending: sortOrder.value === 'ascend',
    })
    if (sequence === requestSequence && filterSequence === appliedSequence) {
      const result = readEventPage(response)
      events.value = result.items
      total.value = result.total
      page.value = requestedPage
    }
  } catch (e: any) {
    if (sequence === requestSequence && filterSequence === appliedSequence) {
      message.error(e?.response?.data?.message || t('event.queryFailed'))
    }
  } finally {
    pendingRequests -= 1
    if (sequence === requestSequence) loading.value = false
  }
}

function submitQuery() {
  const filters = snapshotFilters()
  if (!filters.nodeId) {
    appliedFilters.value = null
    appliedSequence += 1
    page.value = 1
    events.value = []
    total.value = 0
    void fetchEvents(null, 1)
    return
  }
  appliedFilters.value = filters
  appliedSequence += 1
  page.value = 1
  events.value = []
  total.value = 0
  void fetchEvents(filters, 1)
}
function handlePageChange(nextPage: number) {
  page.value = nextPage
  events.value = []
  void fetchEvents(appliedFilters.value, nextPage)
}
function handlePageSizeChange(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  events.value = []
  void fetchEvents(appliedFilters.value, 1)
}
function pollEvents() {
  const applied = appliedFilters.value
  const draft = snapshotFilters()
  if (!applied || pendingRequests > 0
    || draft.nodeId !== applied.nodeId
    || draft.fromNodeId !== applied.fromNodeId
    || draft.toNodeId !== applied.toNodeId
    || draft.messageTypes !== applied.messageTypes
    || draft.correlationId !== applied.correlationId) return
  void fetchEvents(applied, page.value)
}
function openEventDetail(event: ProtocolEvent) {
  currentEvent.value = event
  showDetail.value = true
}

watch([nodeId, filterFromNodeId, filterToNodeId, filterMessageType, filterCorrelationId], () => {
  requestSequence += 1
  loading.value = false
}, { flush: 'sync' })
watch(() => route.query.nodeId, queryNodeId => {
  requestSequence += 1
  nodeId.value = Array.isArray(queryNodeId) ? queryNodeId[0] ?? '' : typeof queryNodeId === 'string' ? queryNodeId : ''
  events.value = []
  total.value = 0
  appliedFilters.value = null
  if (mounted && nodeId.value.trim()) submitQuery()
}, { immediate: true })
onMounted(() => {
  mounted = true
  if (nodeId.value.trim()) submitQuery()
  register(pollEvents, route.path)
})
onUnmounted(() => { requestSequence += 1 })
</script>

<style scoped>
.event-view { max-width: 1200px; }
</style>
