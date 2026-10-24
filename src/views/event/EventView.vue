<template>
  <main class="event-view">
    <PageHeader
      :eyebrow="t('event.workbench.eyebrow')"
      :title="t('menu.events')"
      :description="t('event.workbench.pageDescription')"
    >
      <template #actions>
        <n-button size="small" :disabled="!appliedFilters || loading" @click="refresh">
          {{ t('common.refresh') }}
        </n-button>
      </template>
    </PageHeader>

    <MetricStrip :label="t('event.workbench.statScope')" :columns="3">
      <MetricCard
        :label="t('event.workbench.statMatched')"
        :value="appliedFilters ? total : null"
        :fallback="'-'"
        tone="info"
      />
      <MetricCard
        :label="t('event.workbench.statPage')"
        :value="appliedFilters ? events.length : null"
        :fallback="'-'"
        tone="neutral"
      />
      <MetricCard
        :label="t('event.workbench.statNode')"
        :value="appliedNodeId || null"
        :fallback="'-'"
        tone="neutral"
        mono
      />
    </MetricStrip>

    <WorkbenchSection
      :title="t('event.workbench.filterTitle')"
      :description="t('event.workbench.filterDescription')"
    >
      <form class="filters" @submit.prevent="submitQuery">
        <label class="field">
          <span class="field-label">{{ t('event.workbench.nodeField') }}</span>
          <NodeSelect v-model="draft.nodeId" :placeholder="t('event.nodeIdPlaceholder')" size="small" />
        </label>
        <label class="field">
          <span class="field-label">{{ t('event.fromNodeId') }}</span>
          <NodeSelect v-model="draft.fromNodeId" :placeholder="t('event.fromNodeId')" size="small" />
        </label>
        <label class="field">
          <span class="field-label">{{ t('event.toNodeId') }}</span>
          <NodeSelect v-model="draft.toNodeId" :placeholder="t('event.toNodeId')" size="small" />
        </label>
        <label class="field">
          <span class="field-label">{{ t('event.messageType') }}</span>
          <n-input
            v-model:value="draft.messageTypes"
            :placeholder="t('event.workbench.messageTypesPlaceholder')"
            clearable
            size="small"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ t('event.correlationId') }}</span>
          <n-input v-model:value="draft.correlationId" :placeholder="t('event.correlationId')" clearable size="small" />
        </label>
        <label class="field">
          <span class="field-label">{{ t('event.workbench.requestId') }}</span>
          <n-input v-model:value="draft.requestId" :placeholder="t('event.workbench.requestId')" clearable size="small" />
        </label>
        <label class="field">
          <span class="field-label">{{ t('event.traceId') }}</span>
          <n-input v-model:value="draft.traceId" :placeholder="t('event.traceId')" clearable size="small" />
        </label>
        <div class="field-actions">
          <n-button size="small" attr-type="button" @click="resetFilters">{{ t('event.workbench.reset') }}</n-button>
          <n-button size="small" type="primary" attr-type="submit">{{ t('event.query') }}</n-button>
        </div>
      </form>
    </WorkbenchSection>

    <WorkbenchSection :title="t('event.workbench.listTitle')" :description="appliedSummary">
      <template #actions>
        <span v-if="appliedFilters" class="result-count">
          {{ t('common.totalItems', { n: total }) }}
        </span>
      </template>

      <div v-if="!appliedFilters" class="empty-state">
        <p class="empty-title">{{ t('event.workbench.emptyTitle') }}</p>
        <p class="empty-body">{{ t('event.workbench.emptyDescription') }}</p>
      </div>

      <ServerPagedDataTable
        v-else
        :columns="eventColumns"
        :data="events"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :remote="true"
        :row-props="rowProps"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
        @update:sorter="handleSortChange"
      />

      <p class="note-box">{{ t('event.workbench.coverageNote') }}</p>
    </WorkbenchSection>

    <n-drawer v-model:show="showDetail" :width="SEQUENCE_DRAWER_WIDTH" placement="right" :style="{ maxWidth: '92vw' }">
      <n-drawer-content :title="t('event.workbench.contextTitle')" closable>
        <EventContextPanel
          v-if="currentEvent"
          :event="currentEvent"
          :node-id="appliedNodeId"
          :sequence="sequenceItems"
          :sequence-state="sequenceState"
          :sequence-limit="events.length"
          @filter="applyIdentifierFilter"
          @open-job="openJob"
          @select-event="selectEvent"
        />
      </n-drawer-content>
    </n-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, useMessage } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { getProtocolEvents } from '@/api/protocolEvent'
import type { ProtocolEvent } from '@/api/protocolEvent'
import { usePagePolling } from '@/composables/usePagePolling'
import PageHeader from '@/components/PageHeader.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import MetricStrip from '@/components/MetricStrip.vue'
import MetricCard from '@/components/MetricCard.vue'
import NodeSelect from '@/components/NodeSelect.vue'
import { formatDateTime } from '@/utils/datetime'
import { useI18n } from '@/stores/i18n'
import EventContextPanel from './EventContextPanel.vue'
import {
  eventsForCorrelationOnPage,
  normalizeEventFilters,
  readEventPage,
  sameEventFilters,
  type EventFilterDraft,
  type EventFilters,
} from './eventContext'
const SEQUENCE_DRAWER_WIDTH = 560

const message = useMessage()
const route = useRoute()
const router = useRouter()
const { register } = usePagePolling()
const { t } = useI18n()

const events = ref<ProtocolEvent[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const sortOrder = ref<'ascend' | 'descend'>('descend')
const appliedFilters = ref<EventFilters | null>(null)
const draft = reactive<EventFilterDraft>({
  nodeId: '',
  fromNodeId: '',
  toNodeId: '',
  messageTypes: '',
  correlationId: '',
  requestId: '',
  traceId: '',
})

const showDetail = ref(false)
const currentEvent = ref<ProtocolEvent | null>(null)
const sequenceItems = ref<ProtocolEvent[]>([])
const sequenceState = ref<'unavailable' | 'ready'>('unavailable')

let requestSequence = 0
let appliedSequence = 0
let pendingRequests = 0
let mounted = false

const appliedNodeId = computed(() => appliedFilters.value?.nodeId ?? '')

const appliedSummary = computed(() => {
  const filters = appliedFilters.value
  if (!filters) return t('event.workbench.listDescription')
  const parts = [t('event.workbench.scopeNode', { id: filters.nodeId })]
  if (filters.fromNodeId) parts.push(t('event.workbench.scopeFrom', { id: filters.fromNodeId }))
  if (filters.toNodeId) parts.push(t('event.workbench.scopeTo', { id: filters.toNodeId }))
  if (filters.messageTypes) parts.push(t('event.workbench.scopeTypes', { types: filters.messageTypes }))
  if (filters.correlationId) parts.push(t('event.workbench.scopeCorrelation', { id: filters.correlationId }))
  if (filters.requestId) parts.push(t('event.workbench.scopeRequest', { id: filters.requestId }))
  if (filters.traceId) parts.push(t('event.workbench.scopeTrace', { id: filters.traceId }))
  return parts.join(' · ')
})

const eventColumns = computed<DataTableColumns<ProtocolEvent>>(() => [
  {
    title: t('event.timestamp'),
    key: 'timestampMs',
    width: 170,
    sorter: 'default',
    sortOrder: sortOrder.value,
    render: (row: ProtocolEvent) => formatDateTime(row.timestampMs),
  },
  {
    title: t('event.messageType'),
    key: 'messageType',
    minWidth: 180,
    render: (row: ProtocolEvent) => h('span', { class: 'cell-mono' }, row.messageType),
  },
  { title: t('event.fromNode'), key: 'fromNodeId', minWidth: 120, ellipsis: { tooltip: true } },
  { title: t('event.toNode'), key: 'toNodeId', minWidth: 120, ellipsis: { tooltip: true } },
  {
    title: t('event.workbench.statusCodeRaw'),
    key: 'statusCode',
    width: 100,
    render: (row: ProtocolEvent) => h('span', { class: 'cell-mono' }, row.statusCode === undefined ? '-' : String(row.statusCode)),
  },
  {
    title: t('event.packetId'),
    key: 'packetId',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render: (row: ProtocolEvent) => h('span', { class: 'cell-mono' }, row.packetId),
  },
  {
    title: '',
    key: 'actions',
    width: 96,
    render: (row: ProtocolEvent) => h(
      NButton,
      {
        size: 'tiny',
        quaternary: true,
        type: 'primary',
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          openEventDetail(row)
        },
      },
      () => t('event.workbench.openEvidence'),
    ),
  },
])

const rowProps = (row: ProtocolEvent) => ({
  style: 'cursor: pointer',
  onClick: () => openEventDetail(row),
})

function applyFiltersToDraft(filters: EventFilters) {
  draft.nodeId = filters.nodeId
  draft.fromNodeId = filters.fromNodeId ?? ''
  draft.toNodeId = filters.toNodeId ?? ''
  draft.messageTypes = filters.messageTypes ?? ''
  draft.correlationId = filters.correlationId ?? ''
  draft.requestId = filters.requestId ?? ''
  draft.traceId = filters.traceId ?? ''
}

function closeDetail() {
  sequenceItems.value = []
  sequenceState.value = 'unavailable'
  currentEvent.value = null
  showDetail.value = false
}

async function fetchEvents(filters: EventFilters | null, requestedPage: number) {
  if (!filters) {
    requestSequence += 1
    events.value = []
    total.value = 0
    loading.value = false
    return
  }
  const sequence = ++requestSequence
  const filterSequence = appliedSequence
  pendingRequests += 1
  loading.value = true
  try {
    const response = await getProtocolEvents(filters.nodeId, {
      page: requestedPage,
      pageSize: pageSize.value,
      fromNodeId: filters.fromNodeId,
      toNodeId: filters.toNodeId,
      messageTypes: filters.messageTypes,
      correlationId: filters.correlationId,
      requestId: filters.requestId,
      traceId: filters.traceId,
      ascending: sortOrder.value === 'ascend',
    })
    if (sequence !== requestSequence || filterSequence !== appliedSequence) return
    const result = readEventPage(response)
    events.value = result.items
    total.value = result.total
    page.value = requestedPage
  } catch {
    if (sequence !== requestSequence || filterSequence !== appliedSequence) return
    events.value = []
    total.value = 0
    message.error(t('event.queryFailed'))
  } finally {
    pendingRequests -= 1
    if (sequence === requestSequence) loading.value = false
  }
}

function submitQuery() {
  const filters = normalizeEventFilters(draft)
  closeDetail()
  appliedSequence += 1
  appliedFilters.value = filters
  page.value = 1
  events.value = []
  total.value = 0
  if (!filters) {
    requestSequence += 1
    loading.value = false
    message.warning(t('event.fillNodeId'))
    return
  }
  void fetchEvents(filters, 1)
}

function resetFilters() {
  draft.fromNodeId = ''
  draft.toNodeId = ''
  draft.messageTypes = ''
  draft.correlationId = ''
  draft.requestId = ''
  draft.traceId = ''
  submitQuery()
}

function refresh() {
  if (!appliedFilters.value) return
  events.value = []
  void fetchEvents(appliedFilters.value, page.value)
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

function handleSortChange(sorter: DataTableSortState | null) {
  if (sorter?.columnKey && sorter.columnKey !== 'timestampMs') return
  sortOrder.value = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  page.value = 1
  events.value = []
  void fetchEvents(appliedFilters.value, 1)
}

function pollEvents() {
  const applied = appliedFilters.value
  if (!applied || pendingRequests > 0) return
  if (!sameEventFilters(normalizeEventFilters(draft), applied)) return
  void fetchEvents(applied, page.value)
}

function loadSequence(event: ProtocolEvent) {
  const correlationId = event.correlationId
  if (!correlationId) {
    sequenceItems.value = []
    sequenceState.value = 'unavailable'
    return
  }
  // The table is server-paged. Only the currently loaded page is evidence here;
  // do not issue a broader lookup or imply a complete conversation.
  sequenceItems.value = eventsForCorrelationOnPage(events.value, correlationId)
  sequenceState.value = 'ready'
}

function openEventDetail(event: ProtocolEvent) {
  currentEvent.value = event
  showDetail.value = true
  loadSequence(event)
}

function selectEvent(event: ProtocolEvent) {
  currentEvent.value = event
  loadSequence(event)
}

function applyIdentifierFilter(field: 'correlationId' | 'traceId', value: string) {
  if (!appliedFilters.value) return
  applyFiltersToDraft(appliedFilters.value)
  draft.correlationId = field === 'correlationId' ? value : ''
  draft.traceId = field === 'traceId' ? value : ''
  submitQuery()
}

function openJob(jobId: string) {
  void router.push({ name: 'executionDetail', params: { jobId } })
}

function readQueryString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

watch(() => route.query, (query) => {
  applyFiltersToDraft({
    nodeId: readQueryString(query.nodeId),
    fromNodeId: readQueryString(query.fromNodeId) || undefined,
    toNodeId: readQueryString(query.toNodeId) || undefined,
    messageTypes: readQueryString(query.messageTypes) || undefined,
    correlationId: readQueryString(query.correlationId) || undefined,
    requestId: readQueryString(query.requestId) || undefined,
    traceId: readQueryString(query.traceId) || undefined,
  })
  requestSequence += 1
  loading.value = false
  appliedSequence += 1
  appliedFilters.value = null
  events.value = []
  total.value = 0
  closeDetail()
  if (mounted && draft.nodeId.trim()) submitQuery()
}, { immediate: true })

watch(showDetail, (visible) => {
  if (!visible) closeDetail()
})

watch(() => [draft.fromNodeId, draft.toNodeId, draft.messageTypes, draft.correlationId, draft.requestId, draft.traceId], () => {
  requestSequence += 1
  loading.value = false
}, { flush: 'sync' })

onMounted(() => {
  mounted = true
  if (draft.nodeId.trim()) submitQuery()
  register(pollEvents, route.path)
})

onUnmounted(() => {
  requestSequence += 1
})
</script>

<style scoped>
.event-view {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  max-width: var(--apple-content-max);
  margin: 0 auto;
  padding: var(--apple-space-6) var(--apple-page-gutter) var(--apple-space-8);
}

.note-box {
  margin: var(--apple-space-4) 0 0;
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.7;
}

.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--apple-space-3);
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1);
  min-width: 0;
}

.field-label {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.4;
}

.field-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--apple-space-2);
}

.result-count {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.empty-state {
  padding: var(--apple-space-8) var(--apple-space-4);
  border: 1px dashed var(--apple-border);
  border-radius: var(--apple-radius-lg);
  text-align: center;
}

.empty-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 600;
}

.empty-body {
  max-width: 60ch;
  margin: var(--apple-space-2) auto 0;
  color: var(--apple-gray-3);
  font-size: 13px;
  line-height: 1.6;
}

:deep(.cell-mono) {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

@media (max-width: 680px) {
  .field-actions {
    justify-content: stretch;
  }
}
</style>
