<template>
  <div class="audit-tables-view">
    <n-card size="small" :bordered="true">
      <div class="toolbar">
        <n-select v-model:value="statusFilter" clearable :placeholder="t('auditTables.filterStatus')" :options="statusOptions" style="width: 190px" @update:value="applyFilters" />
        <n-input v-model:value="tableNameFilter" clearable :placeholder="t('auditTables.filterTableName')" style="width: 220px" @keyup.enter="applyFilters" />
        <n-button size="small" @click="applyFilters">{{ t('common.search') }}</n-button>
        <div class="actions">
          <n-button size="small" :loading="loading" @click="refreshAfterMutation">{{ t('common.refresh') }}</n-button>
          <n-button v-if="registryState === 'uninitialized'" size="small" :loading="bootstrapLoading" :disabled="bootstrapLoading" @click="bootstrap">{{ t('auditTables.bootstrap') }}</n-button>
          <n-button size="small" type="primary" :disabled="registryState !== 'initialized'" @click="showRegister = true">{{ t('auditTables.register') }}</n-button>
        </div>
      </div>
      <n-alert v-if="registryState === 'uninitialized'" type="warning" :show-icon="true" style="margin-top: 12px">{{ t('auditTables.registryUninitialized') }}</n-alert>
      <n-alert v-if="bootstrapState === 'success'" type="success" :show-icon="true" style="margin-top: 12px">{{ t('auditTables.bootstrapSuccess') }}</n-alert>
      <n-alert v-if="error" type="error" :show-icon="true" style="margin-top: 12px">{{ error }}</n-alert>
      <n-data-table :columns="columns" :data="items" :loading="loading" :pagination="false" :scroll-x="920" size="small" style="margin-top: 12px" />
      <div class="pagination">
        <span>{{ t('common.totalItems', { n: total }) }}</span>
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="total" :page-sizes="[10, 20, 50]" show-size-picker @update:page="handlePageChange" @update:page-size="changePageSize" />
      </div>
    </n-card>

    <n-modal v-model:show="showRegister" preset="card" :title="t('auditTables.register')" style="width: 480px; max-width: 92vw" :bordered="true">
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('auditTables.tableName')" required>
          <n-input v-model:value="registerForm.tableName" :placeholder="t('auditTables.tableName')" />
        </n-form-item>
        <n-form-item :label="t('auditTables.primaryKeyEncoding')">
          <n-select v-model:value="registerForm.primaryKeyEncoding" :options="encodingOptions" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-actions">
          <n-button @click="showRegister = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="registerLoading" :disabled="!registerForm.tableName.trim()" @click="registerTable">{{ t('auditTables.register') }}</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="showDetail" preset="card" :title="t('auditTables.detail')" style="width: 560px; max-width: 92vw" :bordered="true">
      <n-spin :show="detailLoading">
        <n-descriptions v-if="detail" bordered size="small" :column="1">
          <n-descriptions-item :label="t('auditTables.tableId')">{{ detail.tableId }}</n-descriptions-item>
          <n-descriptions-item :label="t('auditTables.tableName')">{{ detail.tableName }}</n-descriptions-item>
          <n-descriptions-item :label="t('auditTables.status')">{{ t(`auditTables.statuses.${detail.status}`) }}</n-descriptions-item>
          <n-descriptions-item :label="t('auditTables.addressingMode')">{{ t(`auditTables.addressingModes.${detail.addressingMode}`) }}</n-descriptions-item>
          <n-descriptions-item :label="t('auditTables.primaryKeyEncoding')">{{ detail.primaryKeyEncoding || t('common.noData') }}</n-descriptions-item>
          <n-descriptions-item :label="t('auditTables.schemaRevision')">{{ detail.schemaRevision }}</n-descriptions-item>
          <n-descriptions-item :label="t('auditTables.schemaFingerprint')">{{ detail.schemaFingerprint }}</n-descriptions-item>
        </n-descriptions>
      </n-spin>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import axios from 'axios'
import { NButton, NPopconfirm, NTag, useMessage } from 'naive-ui'
import { useRoute } from 'vue-router'
import { usePagePolling } from '@/composables/usePagePolling'
import { bootstrapAuditTables, getAuditTable, listAuditTables, registerAuditTable, retireAuditTable, validateAuditTable } from '@/api/auditTables'
import type { AuditTable, AuditTablePrimaryKeyEncoding, AuditTableRegisterParams } from '@/api/auditTables'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'

const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()
const message = useMessage()
function requestErrorMessage(error: unknown, fallbackKey: string): string {
  if (axios.isAxiosError<{ message?: string; error?: string }>(error)) {
    const payload = error.response?.data
    if (typeof payload?.message === 'string') return payload.message
    if (typeof payload?.error === 'string') return payload.error
  }
  return error instanceof Error ? error.message : t(fallbackKey)
}
const { ensureAuditTablesLoaded, refreshAuditTables } = useReferenceCatalog()
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<AuditTable[]>([])
const loading = ref(false)
const error = ref('')
type AuditTableStatus = AuditTable['status']
const statusFilter = ref<AuditTableStatus | null>(null)
const statusOptions = computed(() => (['pending', 'active', 'invalid', 'retired'] as AuditTableStatus[]).map(status => ({ label: t(`auditTables.statuses.${status}`), value: status })))
const tableNameFilter = ref('')
const encodingOptions = computed(() => ['auto', 'integer', 'canonicalDecimalString', 'canonicalHexString'].map(value => ({
  label: t(`auditTables.encodings.${value}`),
  value,
})))
const showRegister = ref(false)
const registerLoading = ref(false)
const registerForm = ref<{ tableName: string; primaryKeyEncoding: AuditTablePrimaryKeyEncoding }>({ tableName: '', primaryKeyEncoding: 'auto' })
const bootstrapLoading = ref(false)
const bootstrapState = ref<'success' | ''>('')
const registryState = ref<'unknown' | 'uninitialized' | 'initialized'>('unknown')
const showDetail = ref(false)
const detailLoading = ref(false)
const detail = ref<AuditTable | null>(null)
let listRequestId = 0
let lastRegistryRefreshAt = 0
let detailRequestId = 0

const columns = computed(() => [
  { title: t('auditTables.tableId'), key: 'tableId', minWidth: 170, ellipsis: { tooltip: true } },
  { title: t('auditTables.tableName'), key: 'tableName', minWidth: 150, ellipsis: { tooltip: true } },
  { title: t('auditTables.status'), key: 'status', width: 110, render: (row: AuditTable) => h(NTag, { size: 'small', bordered: false, type: row.status === 'active' ? 'success' : row.status === 'invalid' ? 'error' : row.status === 'retired' ? 'default' : 'warning' }, () => t(`auditTables.statuses.${row.status}`)) },
  { title: t('auditTables.addressingMode'), key: 'addressingMode', minWidth: 150, render: (row: AuditTable) => t(`auditTables.addressingModes.${row.addressingMode}`) },
  { title: t('auditTables.schemaRevision'), key: 'schemaRevision', minWidth: 130 },
  { title: t('auditTables.schemaFingerprint'), key: 'schemaFingerprint', minWidth: 190, ellipsis: { tooltip: true } },
  { title: t('common.actions'), key: 'actions', width: 230, render: (row: AuditTable) => h('div', { class: 'row-actions' }, [
    h(NButton, { size: 'tiny', onClick: () => openDetail(row) }, () => t('auditTables.detail')),
    ...(row.status !== 'retired' ? [h(NButton, { size: 'tiny', type: 'primary', ghost: true, onClick: () => validate(row) }, () => t('auditTables.validate'))] : []),
    ...(row.status !== 'retired' ? [h(NPopconfirm, { onPositiveClick: () => retire(row), positiveText: t('common.confirm'), negativeText: t('common.cancel') }, { trigger: () => h(NButton, { size: 'tiny', type: 'error', ghost: true }, () => t('auditTables.retire')), default: () => t('auditTables.retireConfirm', { name: row.tableName }) })] : []),
  ]) },
])


async function loadPage() {
  const requestId = ++listRequestId
  loading.value = true
  error.value = ''
  try {
    const response = await listAuditTables({
      page: page.value,
      pageSize: pageSize.value,
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      ...(tableNameFilter.value.length ? { tableName: tableNameFilter.value } : {}),
    })
    if (requestId !== listRequestId) return
    // The API returns an empty page before explicit bootstrap; filtered emptiness does not prove that state.
    if (response.total > 0) {
      registryState.value = 'initialized'
    } else if (!statusFilter.value && tableNameFilter.value.length === 0) {
      registryState.value = 'uninitialized'
    }
    items.value = response.items
    total.value = response.total
  } catch (cause) {
    if (requestId !== listRequestId) return
    if (axios.isAxiosError<{ error?: string }>(cause) && cause.response?.data?.error === 'AuditTableRegistryNotBootstrapped') {
      registryState.value = 'uninitialized'
      items.value = []
      total.value = 0
    } else {
      error.value = requestErrorMessage(cause, 'auditTables.loadFailed')
    }
  }
  finally {
    if (requestId === listRequestId) loading.value = false
  }
}
function applyFilters() { page.value = 1; void loadPage() }
function handlePageChange() { void loadPage() }
function changePageSize() { page.value = 1; void loadPage() }
async function refreshAfterMutation() {
  await Promise.all([loadPage(), refreshAuditTables()])
}
async function bootstrap() {
  if (registryState.value !== 'uninitialized' || bootstrapLoading.value) return
  bootstrapLoading.value = true
  bootstrapState.value = ''
  try {
    await bootstrapAuditTables('1')
    registryState.value = 'initialized'
    bootstrapState.value = 'success'
    message.success(t('auditTables.bootstrapSuccess'))
    await refreshAfterMutation()
  } catch (cause) {
    message.error(requestErrorMessage(cause, 'auditTables.bootstrapFailed'))
    await loadPage()
  } finally { bootstrapLoading.value = false }
}
async function registerTable() {
  registerLoading.value = true
  try {
    const params: AuditTableRegisterParams = {
      tableName: registerForm.value.tableName.trim(),
      primaryKeyEncoding: registerForm.value.primaryKeyEncoding,
    }
    await registerAuditTable(params, '1')
    showRegister.value = false
    registerForm.value = { tableName: '', primaryKeyEncoding: 'auto' }
    message.success(t('auditTables.registerSuccess'))
    await refreshAfterMutation()
  } catch (cause) {
    message.error(requestErrorMessage(cause, 'auditTables.registerFailed'))
  } finally { registerLoading.value = false }
}
async function validate(row: AuditTable) {
  try {
    await validateAuditTable(row.tableId, '1')
    message.success(t('auditTables.validateSuccess'))
    await refreshAfterMutation()
  } catch (cause) { message.error(requestErrorMessage(cause, 'auditTables.validateFailed')) }
}
async function retire(row: AuditTable) {
  try {
    await retireAuditTable(row.tableId, '1')
    message.success(t('auditTables.retireSuccess'))
    await refreshAfterMutation()
  } catch (cause) { message.error(requestErrorMessage(cause, 'auditTables.retireFailed')) }
}
async function openDetail(row: AuditTable) {
  const requestId = ++detailRequestId
  showDetail.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const result = await getAuditTable(row.tableId)
    if (requestId === detailRequestId) detail.value = result
  } catch (cause) {
    if (requestId === detailRequestId) message.error(requestErrorMessage(cause, 'auditTables.detailFailed'))
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}
function checkRegistryFreshness() {
  const now = Date.now()
  if (now - lastRegistryRefreshAt < 60_000) return
  lastRegistryRefreshAt = now
  void Promise.all([loadPage(), ensureAuditTablesLoaded()])
}
onMounted(() => { register(checkRegistryFreshness, route.path) })
</script>

<style scoped>
.toolbar, .actions, .pagination, .modal-actions, .row-actions { display: flex; align-items: center; gap: 8px; }
.toolbar { justify-content: space-between; flex-wrap: wrap; }
.actions { justify-content: flex-end; flex-wrap: wrap; }
.pagination { justify-content: space-between; flex-wrap: wrap; margin-top: 14px; }
.row-actions { flex-wrap: nowrap; }
.modal-actions { justify-content: flex-end; }
@media (max-width: 640px) { .toolbar, .pagination { align-items: stretch; flex-direction: column; } .actions { justify-content: flex-start; } }
</style>
