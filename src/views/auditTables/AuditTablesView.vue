<template>
  <main class="audit-tables-view">
    <PageHeader
      :eyebrow="t('auditTables.workbench.eyebrow')"
      :title="t('auditTables.title')"
      :description="t('auditTables.workbench.description')"
    >
      <template #actions>
        <n-button size="small" :loading="loading" @click="refreshAfterMutation">{{ t('common.refresh') }}</n-button>
        <n-button size="small" type="primary" :disabled="registryState !== 'initialized'" @click="showRegister = true">{{ t('auditTables.register') }}</n-button>
      </template>
    </PageHeader>


    <WorkbenchSection
      :title="t('auditTables.workbench.registry.title')"
      :description="t('auditTables.workbench.registry.description')"
    >
      <template #actions>
        <n-button
          v-if="registryState === 'uninitialized'"
          size="small"
          :loading="bootstrapLoading"
          :disabled="bootstrapLoading || bootstrapJobLookupLoading || bootstrapJobActive"
          @click="bootstrap"
        >{{ t(bootstrapState === 'failed' ? 'auditTables.bootstrapRetry' : 'auditTables.bootstrap') }}</n-button>
      </template>

      <ol class="registry-rail" :aria-label="t('auditTables.workbench.registry.title')">
        <li
          v-for="(stage, index) in registryLifecycle"
          :key="stage.key"
          class="registry-rail__item"
          :class="`is-${stage.state}`"
          :aria-current="stage.state === 'current' ? 'step' : undefined"
        >
          <span class="registry-rail__marker" aria-hidden="true">{{ index + 1 }}</span>
          <span class="registry-rail__label">{{ t(`auditTables.workbench.registry.stages.${stage.key}`) }}</span>
        </li>
      </ol>
      <p class="registry-hint">{{ t(registryHintKey) }}</p>

      <div v-if="bootstrapJobId" class="registry-job">
        <span class="registry-job__label">{{ t('auditTables.workbench.registry.jobLabel') }}</span>
        <code class="registry-job__id" :title="bootstrapJobId">{{ shortBootstrapJobId }}</code>
        <n-tag size="small" :bordered="false" :type="jobStatusTagType(bootstrapJobStatus)">{{ jobStatusLabel(bootstrapJobStatus, t) }}</n-tag>
        <n-button text type="primary" size="tiny" @click="showBootstrapDetail = true">{{ t('auditTables.bootstrapJobDetail') }}</n-button>
      </div>

      <n-alert v-if="bootstrapState === 'failed'" type="error" :show-icon="true" class="section-alert">
        {{ t('auditTables.bootstrapFailed') }}
      </n-alert>
    </WorkbenchSection>

    <WorkbenchSection
      :title="t('auditTables.workbench.tables.title')"
      :description="t('auditTables.workbench.tables.description')"
    >
      <template #actions>
        <MetricCard
          class="tables-total"
          :label="t('auditTables.workbench.summary.registered')"
          :value="registryState === 'initialized' ? total : null"
          :fallback="loading && registryState === 'unknown' ? t('common.loading') : error && registryState === 'unknown' ? t('common.requestFailed') : '—'"
          :hint="registryState === 'initialized' ? t(filtersActive ? 'auditTables.workbench.summary.scopeFiltered' : 'auditTables.workbench.summary.scopeAll') : undefined"
          tone="neutral"
          compact
        />
      </template>
        <div class="filters">
          <n-select
            v-model:value="statusFilter"
            class="filters__status"
            clearable
            :placeholder="t('auditTables.filterStatus')"
            :options="statusOptions"
            @update:value="applyFilters"
          />
          <n-input
            v-model:value="tableNameFilter"
            class="filters__name"
            clearable
            :placeholder="t('auditTables.filterTableName')"
            @keyup.enter="applyFilters"
            @clear="applyFilters"
          />
          <n-button size="small" @click="applyFilters">{{ t('common.search') }}</n-button>
          <span v-if="filtersActive" class="filters__summary">{{ t('auditTables.workbench.tables.filterHint') }}</span>
        </div>

        <n-alert v-if="error" type="error" :show-icon="true" class="section-alert">
          <p class="alert-inline__lead">{{ t('auditTables.staleData') }}</p>
          <div class="alert-inline">
            <span>{{ error }}</span>
            <n-button size="tiny" @click="refreshAfterMutation">{{ t('common.retry') }}</n-button>
          </div>
        </n-alert>

        <div class="table-container">
          <n-data-table
            :columns="columns"
            :data="items"
            :loading="loading"
            :pagination="false"
            :scroll-x="640"
            :row-key="rowKey"
            :row-props="rowProps"
            :row-class-name="rowClassName"
            size="small"
          />
        </div>
        <p v-if="emptyHintKey && !loading" class="table-hint">{{ t(emptyHintKey) }}</p>

        <div class="pagination">
          <span>{{ t('common.totalItems', { n: total }) }}</span>
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="total"
            :page-sizes="[10, 20, 50]"
            show-size-picker
            @update:page="handlePageChange"
            @update:page-size="changePageSize"
          />
        </div>
    </WorkbenchSection>

    <section class="concept-strip" :aria-label="t('auditTables.workbench.concepts.label')">
      <div class="concept-strip__item">
        <h3 class="concept-strip__title">{{ t('auditTables.workbench.concepts.schema.title') }}</h3>
        <p class="concept-strip__text">{{ t('auditTables.workbench.concepts.schema.text') }}</p>
      </div>
      <div class="concept-strip__item">
        <h3 class="concept-strip__title">{{ t('auditTables.workbench.concepts.fingerprint.title') }}</h3>
        <p class="concept-strip__text">{{ t('auditTables.workbench.concepts.fingerprint.text') }}</p>
      </div>
      <div class="concept-strip__item">
        <h3 class="concept-strip__title">{{ t('auditTables.workbench.concepts.addressing.title') }}</h3>
        <p class="concept-strip__text">{{ t('auditTables.workbench.concepts.addressing.text') }}</p>
      </div>
    </section>

    <n-drawer v-model:show="showDetail" placement="right" :width="480" :style="{ maxWidth: '100vw' }">
      <n-drawer-content :title="t('auditTables.workbench.detail.drawerTitle')" closable body-content-style="padding: 16px">
        <AuditTableDetailPanel
          v-if="detail"
          :table="detail"
          :loading="detailLoading"
          :error="detailError"
          :in-current-page="selectedInCurrentPage"
          @retry="retryDetail"
          @validate="validate"
          @edit-addressing="openAddressingEdit"
          @retire="requestRetire"
        />
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="showRegister" placement="right" :width="480" :style="{ maxWidth: '100vw' }">
      <n-drawer-content :title="t('auditTables.register')" closable>
        <n-form label-placement="top">
          <n-form-item :label="t('auditTables.tableName')" required>
            <n-input v-model:value="registerForm.tableName" :placeholder="t('auditTables.tableName')" />
          </n-form-item>
          <n-form-item :label="t('auditTables.addressingMode')">
            <n-select v-model:value="registerForm.addressingMode" :options="registrationModeOptions" />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="drawer-actions">
            <n-button @click="showRegister = false">{{ t('common.cancel') }}</n-button>
            <n-button type="primary" :loading="registerLoading" :disabled="!registerForm.tableName.trim()" @click="registerTable">{{ t('auditTables.register') }}</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="showAddressingEdit" placement="right" :width="480" :style="{ maxWidth: '100vw' }">
      <n-drawer-content :title="t('auditTables.editAddressingMode')" closable>
        <n-form label-placement="top">
          <n-form-item :label="t('auditTables.addressingMode')">
            <n-select v-model:value="addressingModeForm" :options="addressingModeOptions" />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="drawer-actions">
            <n-button @click="showAddressingEdit = false">{{ t('common.cancel') }}</n-button>
            <n-button type="primary" :loading="addressingModeLoading" @click="saveAddressingMode">{{ t('common.save') }}</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showRetireConfirm" preset="card" :title="t('auditTables.retire')" style="width: 420px; max-width: 92vw" :bordered="true">
      <p class="confirm-text">{{ t('auditTables.retireConfirm', { name: retireTarget?.tableName ?? '' }) }}</p>
      <template #footer>
        <div class="drawer-actions">
          <n-button @click="showRetireConfirm = false">{{ t('common.cancel') }}</n-button>
          <n-button type="error" :loading="retireLoading" @click="confirmRetire">{{ t('auditTables.retire') }}</n-button>
        </div>
      </template>
    </n-modal>

    <n-drawer v-model:show="showBootstrapDetail" :width="560" placement="right" :style="{ maxWidth: '92vw' }">
      <n-drawer-content :title="t('auditTables.bootstrapJobDetail')" closable>
        <JobDetailPanel v-if="bootstrapJobId" :job-id="bootstrapJobId" :visible="showBootstrapDetail" />
      </n-drawer-content>
    </n-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { NButton, NDropdown, NIcon, NTag, useMessage } from 'naive-ui'
import type { DataTableColumns, DropdownOption } from 'naive-ui'
import { EllipsisHorizontal } from '@vicons/ionicons5'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MetricCard from '@/components/MetricCard.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import { usePagePolling } from '@/composables/usePagePolling'
import {
  bootstrapAuditTables,
  getAuditTable,
  listAuditTables,
  registerAuditTable,
  retireAuditTable,
  updateAuditTableAddressingMode,
  validateAuditTable,
} from '@/api/auditTables'
import type { AuditTable, AuditTableAddressingMode, AuditTableAddressingModeSelection, AuditTableRegisterParams } from '@/api/auditTables'
import { getJobs } from '@/api/job'
import { trackJob, useJobTracking } from '@/stores/jobTracking'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'
import { jobStatusTagType } from '@/utils/jobStatus'
import { jobStatusLabel } from '@/utils/statusLabels'
import AuditTableDetailPanel from './AuditTableDetailPanel.vue'
import {
  auditTableCapabilities,
  buildRegistryLifecycle,
} from './auditTableModel'

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

/* ------------------------------------------------------------------ *
 * Registry state
 * ------------------------------------------------------------------ */
const bootstrapJobLookupLoading = ref(true)
const bootstrapLoading = ref(false)
const bootstrapState = ref<'success' | 'failed' | ''>('')
const registryState = ref<'unknown' | 'uninitialized' | 'initialized'>('unknown')
const bootstrapJobId = ref<string | null>(null)
const showBootstrapDetail = ref(false)
const { snapshots } = useJobTracking()
const bootstrapJobStatus = computed(() => bootstrapJobId.value ? snapshots[bootstrapJobId.value]?.status ?? 'Pending' : '')
const bootstrapJobActive = computed(() => bootstrapLoading.value || ['pending', 'running'].includes(bootstrapJobStatus.value.toLowerCase()))
const shortBootstrapJobId = computed(() => {
  const value = bootstrapJobId.value
  if (!value) return ''
  return value.length > 14 ? `${value.slice(0, 12)}…` : value
})
const registryLifecycle = computed(() => buildRegistryLifecycle({
  registryState: registryState.value,
  bootstrapJobActive: bootstrapJobActive.value,
}))
const registryStage = computed(() => registryLifecycle.value.find(stage => stage.state === 'current')?.key ?? 'unknown')
const registryHintKey = computed(() => {
  switch (registryStage.value) {
    case 'uninitialized': return 'auditTables.registryUninitialized'
    case 'bootstrapping': return 'auditTables.bootstrapRunning'
    case 'ready': return 'auditTables.workbench.registry.stageHints.ready'
    default: return 'auditTables.workbench.registry.stageHints.unknown'
  }
})

/* ------------------------------------------------------------------ *
 * Catalog page
 * ------------------------------------------------------------------ */
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
const filtersActive = computed(() => statusFilter.value !== null || tableNameFilter.value.trim().length > 0)
const emptyHintKey = computed(() => (filtersActive.value ? 'auditTables.workbench.tables.emptyFiltered' : ''))

const registrationModeOptions = computed(() => (['auto', 'primaryKeyValue', 'orderedOffset'] as AuditTableAddressingModeSelection[]).map(value => ({
  label: value === 'auto' ? t('auditTables.addressingModes.auto') : t(`auditTables.addressingModes.${value}`),
  value,
})))
const addressingModeOptions = computed(() => (['primaryKeyValue', 'orderedOffset'] as AuditTableAddressingMode[]).map(value => ({
  label: t(`auditTables.addressingModes.${value}`),
  value,
})))

/* ------------------------------------------------------------------ *
 * Selection and detail drawer
 * ------------------------------------------------------------------ */
const selected = ref<AuditTable | null>(null)
const showDetail = ref(false)
const detail = ref<AuditTable | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const selectedInCurrentPage = computed(() => {
  const current = selected.value
  if (!current || loading.value) return true
  return items.value.some(item => item.tableId === current.tableId)
})

let listRequestId = 0
let lastRegistryRefreshAt = 0
let detailRequestId = 0

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */
function statusTagType(status: AuditTableStatus): 'success' | 'error' | 'default' | 'warning' {
  if (status === 'active') return 'success'
  if (status === 'invalid') return 'error'
  if (status === 'retired') return 'default'
  return 'warning'
}

function actionOptions(row: AuditTable): DropdownOption[] {
  const capabilities = auditTableCapabilities(row)
  return [
    { label: t('auditTables.validate'), key: 'validate', disabled: !capabilities.validate },
    { label: t('auditTables.editAddressingMode'), key: 'editAddressing', disabled: !capabilities.editAddressing },
    { type: 'divider', key: 'divider' },
    { label: t('auditTables.retire'), key: 'retire', disabled: !capabilities.retire },
  ]
}

function handleRowAction(action: string, row: AuditTable): void {
  if (action === 'validate') void validate(row)
  else if (action === 'editAddressing') openAddressingEdit(row)
  else if (action === 'retire') requestRetire(row)
}

function rowKey(row: AuditTable): string {
  return row.tableId
}

function rowClassName(row: AuditTable): string {
  return row.tableId === selected.value?.tableId ? 'is-selected-row' : ''
}

function rowProps(row: AuditTable) {
  return {
    style: 'cursor: pointer',
    onClick: (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('button, a, input, .n-dropdown')) return
      openDetail(row)
    },
  }
}

const columns = computed<DataTableColumns<AuditTable>>(() => [
  { title: t('auditTables.tableName'), key: 'tableName', minWidth: 150, maxWidth: 420, resizable: true, ellipsis: { tooltip: true } },
  {
    title: t('auditTables.addressingMode'),
    key: 'addressingMode',
    width: 118,
    minWidth: 100,
    maxWidth: 180,
    resizable: true,
    ellipsis: { tooltip: true },
    render: (row: AuditTable) => t(`auditTables.addressingModes.${row.addressingMode}`),
  },
  {
    title: t('auditTables.schemaRevision'),
    key: 'schemaRevision',
    width: 96,
    minWidth: 88,
    maxWidth: 150,
    resizable: true,
    render: (row: AuditTable) => h('span', { class: 'cell-id' }, row.schemaRevision),
  },
  {
    title: t('auditTables.status'),
    key: 'status',
    width: 96,
    minWidth: 92,
    maxWidth: 150,
    resizable: true,
    render: (row: AuditTable) => h(NTag, {
      size: 'small',
      bordered: false,
      type: statusTagType(row.status),
    }, () => t(`auditTables.statuses.${row.status}`)),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 100,
    minWidth: 96,
    maxWidth: 140,
    render: (row: AuditTable) => h('div', { class: 'row-actions' }, [
      h(NButton, { size: 'tiny', text: true, type: 'primary', onClick: () => openDetail(row) }, () => t('auditTables.detail')),
      h(NDropdown, {
        trigger: 'click',
        placement: 'bottom-end',
        options: actionOptions(row),
        onSelect: (key: string | number) => handleRowAction(String(key), row),
      }, {
        default: () => h(NButton, {
          size: 'tiny',
          quaternary: true,
          title: t('auditTables.workbench.actions.more', { name: row.tableName }),
          'aria-label': t('auditTables.workbench.actions.more', { name: row.tableName }),
        }, { icon: () => h(NIcon, null, { default: () => h(EllipsisHorizontal) }) }),
      }),
    ]),
  },
])

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */
function syncSelection(): void {
  const current = selected.value
  if (!current) {
    selected.value = items.value[0] ?? null
    return
  }
  const fresh = items.value.find(item => item.tableId === current.tableId)
  if (fresh) selected.value = fresh
}

async function loadPage(): Promise<void> {
  const requestId = ++listRequestId
  loading.value = true
  error.value = ''
  try {
    const response = await listAuditTables({
      page: page.value,
      pageSize: pageSize.value,
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      ...(tableNameFilter.value.trim().length ? { tableName: tableNameFilter.value.trim() } : {}),
    })
    if (requestId !== listRequestId) return
    // Any successful list response proves the registry is readable, including an empty result set.
    registryState.value = 'initialized'
    total.value = response.total
    const lastPage = Math.max(1, response.totalPages || Math.ceil(response.total / pageSize.value))
    if (page.value > lastPage) {
      page.value = lastPage
      items.value = []
      if (response.total > 0) void loadPage()
      return
    }
    items.value = response.items
    syncSelection()
  } catch (cause) {
    if (requestId !== listRequestId) return
    if (axios.isAxiosError<{ error?: string }>(cause) && cause.response?.data?.error === 'AuditTableRegistryNotBootstrapped') {
      registryState.value = 'uninitialized'
      items.value = []
      total.value = 0
      syncSelection()
    } else {
      error.value = requestErrorMessage(cause, 'auditTables.loadFailed')
    }
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

function applyFilters(): void {
  page.value = 1
  items.value = []
  total.value = 0
  void loadPage()
}
function handlePageChange(): void { items.value = []; void loadPage() }
function changePageSize(): void { page.value = 1; items.value = []; void loadPage() }

async function refreshAfterMutation(): Promise<void> {
  await Promise.all([loadPage(), refreshAuditTables()])
  if (showDetail.value && detail.value) await loadDetail(detail.value.tableId, true)
}

/* ------------------------------------------------------------------ *
 * Detail drawer
 * ------------------------------------------------------------------ */
async function loadDetail(tableId: string, background = false): Promise<void> {
  const requestId = ++detailRequestId
  if (!background) {
    detailLoading.value = true
    detailError.value = ''
  }
  try {
    const result = await getAuditTable(tableId)
    if (requestId !== detailRequestId || !showDetail.value) return
    detail.value = result
    detailError.value = ''
    if (selected.value?.tableId === result.tableId) selected.value = result
  } catch (cause) {
    if (requestId !== detailRequestId || !showDetail.value) return
    detailError.value = requestErrorMessage(cause, 'auditTables.detailFailed')
    if (!background) message.error(detailError.value)
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}

function openDetail(row: AuditTable): void {
  selected.value = row
  detail.value = row
  detailError.value = ''
  showDetail.value = true
  void loadDetail(row.tableId)
}

function retryDetail(): void {
  const current = detail.value?.tableId ?? selected.value?.tableId
  if (current) void loadDetail(current)
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */
const showRegister = ref(false)
const registerLoading = ref(false)
const registerForm = ref<{ tableName: string; addressingMode: AuditTableAddressingModeSelection }>({ tableName: '', addressingMode: 'auto' })

const showAddressingEdit = ref(false)
const addressingModeLoading = ref(false)
const addressingModeTable = ref<AuditTable | null>(null)
const addressingModeForm = ref<AuditTableAddressingMode>('primaryKeyValue')

const showRetireConfirm = ref(false)
const retireLoading = ref(false)
const retireTarget = ref<AuditTable | null>(null)

watch(bootstrapJobStatus, status => {
  if (status.toLowerCase() === 'succeeded') {
    bootstrapState.value = 'success'
    // Job completion and registry availability are separate facts; verify through the list API.
    registryState.value = 'unknown'
    void refreshAfterMutation()
  } else if (status.toLowerCase() === 'failed') {
    bootstrapState.value = 'failed'
    void loadPage()
  }
})

async function bootstrap(): Promise<void> {
  if (registryState.value !== 'uninitialized' || bootstrapLoading.value || bootstrapJobLookupLoading.value || bootstrapJobActive.value) return
  bootstrapLoading.value = true
  bootstrapState.value = ''
  try {
    const { jobId } = await bootstrapAuditTables('1')
    bootstrapJobId.value = jobId
    trackJob(jobId, 'Replication')
    showBootstrapDetail.value = true
  } catch (cause) {
    if (axios.isAxiosError<{ error?: string }>(cause)
      && cause.response?.status === 409
      && cause.response.data?.error === 'AuditTableRegistryAlreadyBootstrapped') {
      bootstrapState.value = 'success'
      await refreshAfterMutation()
      return
    }
    bootstrapState.value = 'failed'
    message.error(requestErrorMessage(cause, 'auditTables.bootstrapFailed'))
    await loadPage()
  } finally { bootstrapLoading.value = false }
}

async function registerTable(): Promise<void> {
  registerLoading.value = true
  try {
    const params: AuditTableRegisterParams = {
      tableName: registerForm.value.tableName.trim(),
      addressingMode: registerForm.value.addressingMode,
    }
    await registerAuditTable(params, '1')
    showRegister.value = false
    registerForm.value = { tableName: '', addressingMode: 'auto' }
    message.success(t('auditTables.registerSuccess'))
    await refreshAfterMutation()
  } catch (cause) {
    message.error(requestErrorMessage(cause, 'auditTables.registerFailed'))
  } finally { registerLoading.value = false }
}

async function validate(row: AuditTable): Promise<void> {
  if (!auditTableCapabilities(row).validate) return
  try {
    await validateAuditTable(row.tableId, '1')
    message.success(t('auditTables.validateSuccess'))
    await refreshAfterMutation()
  } catch (cause) { message.error(requestErrorMessage(cause, 'auditTables.validateFailed')) }
}

function requestRetire(row: AuditTable): void {
  if (!auditTableCapabilities(row).retire) return
  retireTarget.value = row
  showRetireConfirm.value = true
}

async function confirmRetire(): Promise<void> {
  const row = retireTarget.value
  if (!row) return
  retireLoading.value = true
  try {
    await retireAuditTable(row.tableId, '1')
    message.success(t('auditTables.retireSuccess'))
    showRetireConfirm.value = false
    retireTarget.value = null
    await refreshAfterMutation()
  } catch (cause) {
    message.error(requestErrorMessage(cause, 'auditTables.retireFailed'))
  } finally { retireLoading.value = false }
}

function openAddressingEdit(row: AuditTable): void {
  if (!auditTableCapabilities(row).editAddressing) return
  addressingModeTable.value = row
  addressingModeForm.value = row.addressingMode
  showAddressingEdit.value = true
}

async function saveAddressingMode(): Promise<void> {
  const row = addressingModeTable.value
  if (!row || !auditTableCapabilities(row).editAddressing) return
  addressingModeLoading.value = true
  try {
    await updateAuditTableAddressingMode(row.tableId, addressingModeForm.value, '1')
    showAddressingEdit.value = false
    addressingModeTable.value = null
    message.success(t('auditTables.addressingModeUpdated'))
    await refreshAfterMutation()
  } catch (cause) {
    message.error(requestErrorMessage(cause, 'auditTables.addressingModeUpdateFailed'))
  } finally { addressingModeLoading.value = false }
}

/* ------------------------------------------------------------------ *
 * Polling and bootstrap discovery
 * ------------------------------------------------------------------ */
async function checkBootstrapJob(): Promise<void> {
  if (bootstrapJobActive.value) {
    bootstrapJobLookupLoading.value = false
    return
  }
  try {
    const pages = await Promise.all(['Pending', 'Running', 'Failed'].map(status => getJobs({
      page: 1,
      pageSize: 20,
      jobType: 'Replication',
      status,
      'metadata.auditTableOperation': 'bootstrap',
    })))
    const candidates = pages.flatMap(response => response.items).filter(candidate =>
      candidate.jobType === 'Replication',
    )
    const job = candidates.find(candidate =>
      ['pending', 'running'].includes(candidate.status.toLowerCase()),
    ) ?? (registryState.value === 'initialized' ? undefined : candidates.find(
      candidate => candidate.status.toLowerCase() === 'failed',
    ))
    if (job) {
      bootstrapJobId.value = job.jobId
      bootstrapState.value = job.status.toLowerCase() === 'failed' ? 'failed' : ''
      trackJob(job.jobId, 'Replication')
    }
  } catch {
    // Job tracking itself will surface network failures; registry loading remains independent.
  } finally {
    bootstrapJobLookupLoading.value = false
  }
}

function checkRegistryFreshness(): void {
  const now = Date.now()
  if (now - lastRegistryRefreshAt < 60_000) return
  lastRegistryRefreshAt = now
  void Promise.all([loadPage(), ensureAuditTablesLoaded(), checkBootstrapJob()])
  if (showDetail.value && detail.value) void loadDetail(detail.value.tableId, true)
}

onMounted(() => {
  register(checkRegistryFreshness, route.path)
})
</script>

<style scoped>
.audit-tables-view {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.tables-total { width: 220px; }

/* ── Registry lifecycle ── */
.registry-rail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2) var(--apple-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.registry-rail__item {
  display: flex;
  align-items: center;
  gap: var(--apple-space-2);
  color: var(--apple-gray-3);
  font-size: 13px;
  line-height: 1.4;
}

.registry-rail__item + .registry-rail__item::before {
  content: '';
  display: block;
  width: 18px;
  height: 1px;
  margin-right: var(--apple-space-2);
  background: var(--apple-border);
}

.registry-rail__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--apple-border);
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.registry-rail__item.is-complete .registry-rail__marker {
  border-color: var(--apple-gray-5);
  color: var(--apple-gray-2);
}

.registry-rail__item.is-current .registry-rail__marker {
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}

.registry-rail__item.is-current .registry-rail__label {
  color: var(--apple-gray-1);
  font-weight: 560;
}

.registry-rail__item.is-pending,
.registry-rail__item.is-unknown {
  color: var(--apple-gray-4);
}

.registry-hint {
  max-width: 78ch;
  margin: var(--apple-space-3) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

.registry-job {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin-top: var(--apple-space-3);
  padding-top: var(--apple-space-3);
  border-top: 1px solid var(--apple-border);
  font-size: 12px;
  line-height: 1.5;
}

.registry-job__label {
  color: var(--apple-gray-3);
}

.registry-job__id {
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono);
  font-size: 11px;
}

.section-alert {
  margin-top: var(--apple-space-3);
}

.concept-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--apple-space-5);
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
}

.concept-strip__item {
  min-width: 0;
}

.concept-strip__item + .concept-strip__item {
  padding-left: var(--apple-space-5);
  border-left: 1px solid var(--apple-border);
}

.concept-strip__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
}

.concept-strip__text {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}

/* ── Filters, table, pagination ── */
.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin-bottom: var(--apple-space-3);
}

.filters__status {
  width: 190px;
}

.filters__name {
  width: 240px;
}

.filters__summary {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.table-container {
  width: 100%;
  min-width: 0;
}

.table-hint {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
  min-width: 0;
  margin-top: var(--apple-space-3);
  color: var(--apple-gray-3);
  font-size: 12px;
}

.pagination :deep(.n-pagination) {
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: var(--apple-space-1);
}

:deep(.cell-id) {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}


:deep(.is-selected-row td) {
  background: color-mix(in srgb, var(--apple-blue) 6%, transparent);
}

.drawer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--apple-space-2);
}

.confirm-text {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 14px;
  line-height: 1.6;
}

.alert-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-3);
}

.alert-inline__lead {
  margin: 0 0 var(--apple-space-1);
  font-size: 12px;
  line-height: 1.55;
}


@media (max-width: 900px) {
  .concept-strip {
    grid-template-columns: 1fr;
    gap: var(--apple-space-3);
  }

  .concept-strip__item + .concept-strip__item {
    padding-top: var(--apple-space-3);
    padding-left: 0;
    border-top: 1px solid var(--apple-border);
    border-left: 0;
  }
}

@media (max-width: 680px) {
  .filters {
    align-items: stretch;
  }

  .filters__status,
  .filters__name {
    width: 100%;
  }

  .pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .registry-rail__item + .registry-rail__item::before {
    display: none;
  }
}
</style>
