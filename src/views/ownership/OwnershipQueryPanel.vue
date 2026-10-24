<template>
  <div class="ownership-query-page">
    <n-card size="small" :bordered="true">
      <template #header>
        <div class="query-heading">
          <span>{{ t('ownership.queryOwnership') }}</span>
          <n-text depth="3">{{ t('ownership.queryDescription') }}</n-text>
        </div>
      </template>
      <p class="owner-id-note">{{ t('ownership.workbench.ownerIdIdentityNote') }}</p>
      <n-form :model="queryForm" label-placement="top">
        <n-form-item :label="t('ownership.queryScope')">
          <n-radio-group v-model:value="queryForm.scope" size="small">
            <n-radio-button value="all">{{ t('ownership.allTablesScope') }}</n-radio-button>
            <n-radio-button value="table">{{ t('ownership.singleTableScope') }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <div class="query-fields">
          <n-form-item :label="t('ownership.ownerId')" required>
            <UserSelect v-model="queryForm.ownerId" :placeholder="t('ownership.selectOwner')" style="width: 100%" />
          </n-form-item>
          <n-form-item v-if="queryForm.scope === 'table'" :label="t('ownership.mappedTable')" required>
            <TableSelect
              v-model="queryForm.tableId"
              :active-only="false"
              style="width: 100%"
              :placeholder="t('ownership.selectMappedTable')"
            />
          </n-form-item>
          <n-alert v-else class="all-tables-hint" type="info" :show-icon="false">
            {{ t('ownership.allTablesHint') }}
          </n-alert>
        </div>
        <div class="query-actions">
          <n-button type="primary" :disabled="!canQuery" :loading="queryLoading" @click="handleQuery">
            {{ t('ownership.query') }}
          </n-button>
        </div>
      </n-form>
      <div v-if="appliedQuery" class="owner-id-path">
        <span>{{ t('ownership.workbench.query.ownerPath') }}</span>
        <span class="detail-value" :title="appliedQuery.ownerId">{{ appliedOwnerLabel }}</span>
      </div>
    </n-card>

    <n-alert v-if="mappingCatalogMessage && queryForm.scope === 'all'" type="warning" :show-icon="true" class="catalog-warning">
      {{ mappingCatalogMessage }}
    </n-alert>

    <n-card v-if="queryError && !queryResponse" size="small" :bordered="true" class="query-state-card">
      <n-result status="error" :title="t('ownership.queryFailed')" :description="queryError" />
    </n-card>
    <n-card v-else-if="queryLoading && !queryResponse" size="small" :bordered="true" class="query-state-card">
      <div class="query-loading">
        <n-spin size="small" />
        <span>{{ t('ownership.queryRunning', { seconds: elapsedSeconds }) }}</span>
        <n-button size="small" text type="primary" @click="handleCancelQuery">{{ t('ownership.cancelQuery') }}</n-button>
      </div>
      <p class="query-wait-note">{{ t('ownership.queryLongRunningNote') }}</p>
    </n-card>

    <n-alert v-if="queryNotice" type="warning" :show-icon="true" class="catalog-warning">
      {{ queryNotice }}
    </n-alert>

    <n-card v-if="queryResponse" size="small" :bordered="true" class="results-card">
      <template #header>
        <div class="results-heading">
          <div class="results-title-group">
            <span>{{ t('ownership.queryResult') }}</span>
            <n-text depth="3">{{ appliedQueryLabel }}</n-text>
          </div>
          <n-space size="small" wrap>
            <n-tag round size="small">{{ t('ownership.tablesCount', { count: tableCount }) }}</n-tag>
            <n-tag round size="small">{{ t('ownership.rowsCount', { count: rowCount }) }}</n-tag>
            <n-tag round size="small" type="info">{{ t('ownership.cellsCount', { count: queryResponse.total }) }}</n-tag>
          </n-space>
        </div>
      </template>

      <n-alert v-if="queryError" type="error" :show-icon="true" class="page-error">
        {{ queryError }}
      </n-alert>
      <div v-if="queryLoading" class="results-loading">
        <n-spin size="small" />
        <span>{{ t('ownership.queryRunning', { seconds: elapsedSeconds }) }}</span>
        <n-button size="small" text type="primary" @click="handleCancelQuery">{{ t('ownership.cancelQuery') }}</n-button>
      </div>

      <section class="summary-section">
        <div class="section-heading">
          <div>
            <h3>{{ t('ownership.tableSummary') }}</h3>
            <n-text depth="3">{{ t('ownership.tableSummaryDescription') }}</n-text>
          </div>
        </div>
        <n-empty v-if="!queryResponse.tableSummaries.length" :description="t('ownership.noTablesInResult')" />
        <n-data-table
          v-else
          :columns="tableColumns"
          :data="queryResponse.tableSummaries"
          :pagination="{ pageSize: 10 }"
          :row-key="tableRowKey"
          :scroll-x="760"
          size="small"
          :bordered="false"
        />
      </section>

      <n-divider />

      <section class="cell-detail-section">
        <div class="section-heading">
          <div>
            <h3>{{ t('ownership.cellDetails') }}</h3>
            <n-text depth="3">{{ t('ownership.cellDetailsDescription') }}</n-text>
          </div>
        </div>
        <n-empty v-if="queryResponse.total === 0" :description="t('ownership.emptyQueryResult')" />
        <ServerPagedDataTable
          v-else
          :columns="cellColumns"
          :data="displayCells"
          :loading="queryLoading"
          :page="page"
          :page-size="pageSize"
          :total="queryResponse.total"
          :remote="true"
          :scroll-x="820"
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </section>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NTag, useMessage } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import type { AuditTableStatus } from '@/api/auditTables'
import { queryCells, type OwnershipQueryRequestOptions } from '@/api/ownership'
import type { DataCell, OwnershipCellsQueryResponse, OwnershipTableSummary } from '@/api/ownership'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import TableSelect from '@/components/TableSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'

type QueryScope = 'all' | 'table'
interface OwnershipQuery {
  ownerId: string
  tableId?: string
}
interface OwnershipQueryCellRow extends DataCell {
  key: string
}

const { t } = useI18n()
const message = useMessage()
const { auditTables, auditTablesById, auditTablesState, userEntitiesById, ensureAuditTablesLoaded } = useReferenceCatalog()
const queryForm = ref<{ ownerId: string; scope: QueryScope; tableId: string }>({ ownerId: '', scope: 'all', tableId: '' })
const appliedQuery = ref<OwnershipQuery | null>(null)
const queryResponse = ref<OwnershipCellsQueryResponse | null>(null)
const queryError = ref('')
const queryLoading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const queryNotice = ref('')
const elapsedSeconds = ref(0)
let requestSequence = 0
let activeController: AbortController | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null

/** The query is one synchronous request with no jobId; only the client may stop waiting. */
const QUERY_TIMEOUT_MS = 0

const canQuery = computed(() => Boolean(queryForm.value.ownerId.trim())
  && (queryForm.value.scope === 'all' || Boolean(queryForm.value.tableId))
  && !queryLoading.value)
const appliedOwnerLabel = computed(() => {
  const ownerId = appliedQuery.value?.ownerId
  if (!ownerId) return ''
  const userName = userEntitiesById.value.get(ownerId)?.userName
  return userName ? `${userName} (${ownerId})` : ownerId
})
const tableCount = computed(() => queryResponse.value?.tableSummaries.length ?? 0)
const rowCount = computed(() => queryResponse.value?.tableSummaries.reduce((sum, table) => sum + table.rowCount, 0) ?? 0)
const displayCells = computed<OwnershipQueryCellRow[]>(() => {
  const response = queryResponse.value
  if (!response || response.page !== page.value) return []
  return response.cells.map(cell => ({
    ...cell,
    key: JSON.stringify([String(cell.tableId), cell.rowId, cell.columnId]),
  }))
})
const mappingCatalogMessage = computed(() => {
  const error = auditTablesState.error
  if (!error) return ''
  if (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error === 'AuditTableRegistryNotBootstrapped') {
    return t('auditTables.registryUninitialized')
  }
  return auditTables.value.length ? t('auditTables.staleData') : t('auditTables.loadFailed')
})
const appliedQueryLabel = computed(() => {
  const query = appliedQuery.value
  if (!query) return ''
  if (!query.tableId) return t('ownership.appliedAllTablesQuery', { owner: appliedOwnerLabel.value })
  const table = auditTablesById.value.get(query.tableId)
  return t('ownership.appliedTableQuery', {
    owner: appliedOwnerLabel.value,
    table: table?.tableName ?? t('ownership.unmappedTable'),
    id: query.tableId,
  })
})
const tableColumns = computed<DataTableColumns<OwnershipTableSummary>>(() => [
  {
    title: t('auditTables.tableName'),
    key: 'tableName',
    minWidth: 180,
    render: row => {
      const table = auditTablesById.value.get(row.tableId)
      return h('div', { class: 'mapping-name-cell' }, [
        h('span', { class: 'mapping-name' }, table?.tableName ?? unmappedTableLabel()),
        h('code', { class: 'mapping-id' }, row.tableId),
      ])
    },
  },
  {
    title: t('auditTables.status'),
    key: 'status',
    width: 120,
    render: row => {
      const table = auditTablesById.value.get(row.tableId)
      return table
        ? h(NTag, { size: 'small', round: true, type: statusTagType(table.status) }, { default: () => t(`auditTables.statuses.${table.status}`) })
        : h(NTag, { size: 'small', round: true, type: 'warning' }, { default: unmappedTableLabel })
    },
  },
  { title: t('ownership.ownedRows'), key: 'rowCount', width: 110 },
  { title: t('ownership.ownedCells'), key: 'cellCount', width: 110 },
  {
    title: '',
    key: 'actions',
    width: 120,
    render: row => appliedQuery.value?.tableId === row.tableId
      ? h(NTag, { size: 'small', type: 'info' }, { default: () => t('ownership.currentTable') })
      : h(NButton, {
        size: 'tiny',
        type: 'primary',
        ghost: true,
        onClick: () => handleViewTable(row.tableId),
      }, { default: () => t('ownership.viewCells') }),
  },
])
const cellColumns = computed<DataTableColumns<OwnershipQueryCellRow>>(() => [
  {
    title: t('auditTables.tableName'),
    key: 'tableId',
    minWidth: 190,
    render: row => {
      const tableId = String(row.tableId)
      const table = auditTablesById.value.get(tableId)
      return h('div', { class: 'mapping-name-cell' }, [
        h('span', { class: 'mapping-name' }, table?.tableName ?? unmappedTableLabel()),
        h('code', { class: 'mapping-id' }, tableId),
      ])
    },
  },
  {
    title: t('auditTables.status'),
    key: 'tableStatus',
    width: 120,
    render: row => {
      const table = auditTablesById.value.get(String(row.tableId))
      return table
        ? h(NTag, { size: 'small', round: true, type: statusTagType(table.status) }, { default: () => t(`auditTables.statuses.${table.status}`) })
        : h(NTag, { size: 'small', round: true, type: 'warning' }, { default: unmappedTableLabel })
    },
  },
  { title: t('ownership.rowId'), key: 'rowId', minWidth: 180, ellipsis: { tooltip: true } },
  { title: t('ownership.columnId'), key: 'columnId', width: 100 },
])

function tableRowKey(row: OwnershipTableSummary) {
  return row.tableId
}
function statusTagType(status: AuditTableStatus): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'active') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'invalid') return 'error'
  return 'default'
}
function unmappedTableLabel() {
  return mappingCatalogMessage.value ? t('ownership.mappingUnavailable') : t('ownership.unmappedTable')
}
function errorMessage(error: unknown) {
  const detail = error as { response?: { data?: { message?: string; error?: string } } }
  return detail?.response?.data?.message || detail?.response?.data?.error || String(error)
}

function stopElapsedTimer() {
  if (elapsedTimer !== null) clearInterval(elapsedTimer)
  elapsedTimer = null
}

function startElapsedTimer() {
  stopElapsedTimer()
  elapsedSeconds.value = 0
  elapsedTimer = setInterval(() => { elapsedSeconds.value += 1 }, 1000)
}

function abortActiveQuery() {
  activeController?.abort()
  activeController = null
  stopElapsedTimer()
}

function isCancellation(error: unknown): boolean {
  if (axios.isAxiosError(error)) return error.code === 'ERR_CANCELED'
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ERR_CANCELED'
}

function handleCancelQuery() {
  if (!activeController) return
  const controller = activeController
  queryNotice.value = t('ownership.queryCancelled')
  abortActiveQuery()
  controller.abort()
}

async function loadPage(query: OwnershipQuery, nextPage: number, nextPageSize: number, clearResults: boolean) {
  const sequence = ++requestSequence
  abortActiveQuery()
  const controller = new AbortController()
  activeController = controller
  const requestOptions: OwnershipQueryRequestOptions = {
    signal: controller.signal,
    timeoutMs: QUERY_TIMEOUT_MS,
  }
  const previousPage = queryResponse.value?.page ?? page.value
  const previousPageSize = queryResponse.value?.pageSize ?? pageSize.value
  page.value = nextPage
  pageSize.value = nextPageSize
  queryLoading.value = true
  queryError.value = ''
  queryNotice.value = ''
  if (clearResults) queryResponse.value = null
  startElapsedTimer()
  try {
    const response = await queryCells(query.ownerId, {
      page: nextPage,
      pageSize: nextPageSize,
      ...(query.tableId ? { tableId: query.tableId } : {}),
    }, requestOptions)
    if (sequence !== requestSequence) return
    queryResponse.value = response
    page.value = response.page
    pageSize.value = response.pageSize
  } catch (error) {
    if (sequence !== requestSequence) return
    if (!isCancellation(error)) {
      queryError.value = errorMessage(error)
      if (queryResponse.value) {
        page.value = previousPage
        pageSize.value = previousPageSize
      }
    }
  } finally {
    if (sequence === requestSequence) {
      queryLoading.value = false
      stopElapsedTimer()
      if (activeController === controller) activeController = null
    }
  }
}

function handleQuery() {
  const ownerId = queryForm.value.ownerId.trim()
  if (!ownerId) { message.warning(t('ownership.fillOwnerId')); return }
  const tableId = queryForm.value.scope === 'table' ? queryForm.value.tableId : ''
  if (queryForm.value.scope === 'table' && !tableId) { message.warning(t('ownership.selectMappedTable')); return }
  const query = { ownerId, ...(tableId ? { tableId } : {}) }
  appliedQuery.value = query
  void loadPage(query, 1, pageSize.value, true)
}

function handleViewTable(tableId: string) {
  queryForm.value.scope = 'table'
  queryForm.value.tableId = tableId
  handleQuery()
}

function handlePageChange(nextPage: number) {
  if (appliedQuery.value) void loadPage(appliedQuery.value, nextPage, pageSize.value, false)
}
function handlePageSizeChange(nextPageSize: number) {
  if (appliedQuery.value) void loadPage(appliedQuery.value, 1, nextPageSize, false)
}

watch(() => [queryForm.value.ownerId, queryForm.value.scope, queryForm.value.tableId] as const, () => {
  requestSequence += 1
  abortActiveQuery()
  queryLoading.value = false
  queryNotice.value = ''
  queryError.value = ''
  queryResponse.value = null
  appliedQuery.value = null
  page.value = 1
}, { flush: 'sync' })

onMounted(() => { void ensureAuditTablesLoaded() })
onBeforeUnmount(() => {
  requestSequence += 1
  abortActiveQuery()
})
</script>

<style scoped>
.query-heading,
.results-heading,
.section-heading,
.mapping-name-cell {
  display: flex;
  min-width: 0;
}
.query-heading,
.results-title-group,
.section-heading,
.mapping-name-cell {
  flex-direction: column;
}
.query-heading,
.results-title-group,
.section-heading { gap: 4px; }
.owner-id-note { margin: 0 0 var(--apple-space-3); color: var(--apple-gray-4); font-size: 12px; line-height: 1.6; }
.owner-id-path { display: flex; align-items: baseline; gap: var(--apple-space-2); margin-top: var(--apple-space-3); color: var(--apple-gray-4); font-size: 12px; }
.detail-value { color: var(--apple-gray-1); font-family: var(--apple-font-mono); }
.query-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}
.all-tables-hint { align-self: end; margin-bottom: 24px; }
.query-actions { display: flex; justify-content: flex-end; margin-top: var(--apple-space-3); }
.catalog-warning,
.query-state-card,
.results-card { margin-top: 12px; }
.query-loading { display: flex; min-height: 56px; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; }
.query-wait-note { margin: var(--apple-space-2) 0 0; color: var(--apple-gray-4); font-size: 12px; line-height: 1.6; text-align: center; }
.results-loading { display: flex; align-items: center; flex-wrap: wrap; gap: var(--apple-space-2); margin-bottom: var(--apple-space-2); color: var(--apple-gray-3); font-size: 12px; }
.results-heading {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.results-title-group { display: flex; }
.section-heading {
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-heading h3 { margin: 0; font-size: 14px; font-weight: 600; }
.mapping-name-cell { gap: 3px; }
.mapping-name { font-weight: 500; }
.mapping-id { font-size: 11px; opacity: 0.72; overflow-wrap: anywhere; }
.page-error { margin-bottom: 12px; }
@media (max-width: 680px) {
  .query-fields { grid-template-columns: minmax(0, 1fr); gap: var(--apple-space-3); }
  .all-tables-hint { margin-bottom: 12px; }
  .results-heading { align-items: flex-start; flex-direction: column; }
}
</style>
