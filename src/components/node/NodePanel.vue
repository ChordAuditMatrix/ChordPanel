<template>
  <div class="node-workbench">
    <section v-if="loadedAt" class="directory-summary" :aria-label="t('node.workbench.summaryLabel')">
      <MetricStrip :columns="roleMetrics.length > 3 ? 4 : 3">
        <MetricCard
          v-for="role in roleMetrics"
          :key="role.key"
          :label="role.key === 'other' ? t('node.workbench.roleOther') : role.key"
          :value="role.total"
          tone="neutral"
        >
          <p class="role-metric-desc">{{ t(ROLE_DESCRIPTION_KEYS[role.key]) }}</p>
          <p class="role-metric-sub">{{ t('node.workbench.roleBreakdown', { available: role.available, offline: role.offline, unknown: role.unknown }) }}</p>
        </MetricCard>
      </MetricStrip>
      <p class="role-caution">{{ t('node.workbench.roleCaution') }}</p>
      <div class="summary-groups">
        <div class="summary-group">
          <span class="group-label">{{ t('node.availability') }}</span>
          <span
            v-for="stat in availabilityStats"
            :key="stat.key"
            class="availability-stat"
            :class="availabilityClass(stat)"
          >
            <strong>{{ stat.value }}</strong>{{ stat.label }}
          </span>
        </div>
        <div v-if="stateSummary.length" class="summary-group">
          <span class="group-label">{{ t('node.state') }}</span>
          <ul class="role-summary">
            <li v-for="entry in stateSummary" :key="entry.state" class="role-entry">
              <span class="role-name">{{ stateLabel(entry.state) }}</span>
              <span class="role-count">{{ entry.count }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <WorkbenchSection
      :title="t('node.workbench.topologyTitle')"
      :description="t('node.workbench.topologyDescription')"
    >
      <ClusterTopology :nodes="directory" :loading="loading" :error="error" />
    </WorkbenchSection>

    <WorkbenchSection
      :title="t('node.workbench.directoryTitle')"
      :description="t('node.workbench.directoryDescription')"
    >
      <template #actions>
        <span v-if="loadedAt" class="directory-updated">{{ t('node.workbench.updatedAt', { time: formatTime(loadedAt) }) }}</span>
        <n-button size="small" :loading="loading" @click="loadDirectory()">{{ t('common.refresh') }}</n-button>
      </template>

      <p v-if="loadedAt" class="directory-source">{{ t('node.workbench.directorySource') }}</p>
      <div v-if="error && directory.length > 0" class="directory-stale" role="status">
        {{ t('node.workbench.stale', { time: formatTime(loadedAt) }) }}
      </div>

      <div class="directory-filters">
        <PageToolbar>
          <n-input
            v-model:value="search"
            size="small"
            clearable
            :placeholder="t('node.workbench.searchPlaceholder')"
            style="width: 220px"
            :aria-label="t('node.workbench.searchPlaceholder')"
          />
          <n-select
            v-model:value="roleFilter"
            size="small"
            :options="roleOptions"
            style="width: 140px"
            :aria-label="t('node.workbench.roleFilter')"
          />
          <n-select
            v-model:value="availabilityFilter"
            size="small"
            :options="availabilityOptions"
            style="width: 140px"
            :aria-label="t('node.workbench.availabilityFilter')"
          />
          <n-select
            v-model:value="stateFilter"
            size="small"
            :options="stateOptions"
            style="width: 150px"
            :aria-label="t('node.workbench.stateFilter')"
          />
        </PageToolbar>
      </div>

      <div v-if="initialLoading" class="directory-state" role="status">
        <n-spin size="small" /> {{ t('common.loading') }}
      </div>
      <div v-else-if="error && directory.length === 0" class="directory-state">
        <p>{{ t('common.requestFailed') }}</p>
        <n-button size="small" @click="loadDirectory()">{{ t('common.retry') }}</n-button>
      </div>
      <div v-else-if="directory.length === 0" class="directory-state">
        {{ t('node.noData') }}
      </div>
      <div v-else-if="pageData.total === 0" class="directory-state">
        <p>{{ t('node.workbench.noMatch') }}</p>
        <n-button size="small" @click="clearFilters">{{ t('node.workbench.clearFilters') }}</n-button>
      </div>
      <template v-else>
        <n-data-table
          :columns="columns"
          :data="pageData.items"
          :loading="loading"
          :bordered="false"
          :single-line="false"
          :row-key="rowKey"
          :row-props="rowProps"
          :scroll-x="980"
          size="small"
        />
        <div class="directory-footer">
          <span class="directory-total">{{ t('common.totalItems', { n: pageData.total }) }}</span>
          <n-pagination
            :page="pageData.page"
            :page-size="pageSize"
            :item-count="pageData.total"
            :page-sizes="[10, 20, 50]"
            show-size-picker
            @update:page="page = $event"
            @update:page-size="changePageSize"
          />
        </div>
      </template>
    </WorkbenchSection>

    <NodeDetailModal :node-id="selectedNodeId" @close="selectedNodeId = null" @updated="applyNodeDetail" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onUnmounted, ref, watch } from 'vue'
import { NButton, NTag } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { useRoute } from 'vue-router'
import { getNodes, type NodeSummary } from '@/api/system'
import { fetchAllPages } from '@/api/pagination'
import { usePagePolling } from '@/composables/usePagePolling'
import { useI18n } from '@/stores/i18n'
import PageToolbar from '@/components/PageToolbar.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import MetricCard from '@/components/MetricCard.vue'
import MetricStrip from '@/components/MetricStrip.vue'
import NodeDetailModal from './NodeDetailModal.vue'
import ClusterTopology from '@/views/dashboard/ClusterTopology.vue'
import { formatTime, type NodeDetail } from './types'
import {
  aggregateNodeDirectory,
  classifyNodeAvailability,
  collectNodeStates,
  filterNodeDirectory,
  nodeStateKey,
  paginateNodeDirectory,
  parseNodeSummaryPage,
  sortNodeDirectory,
  type NodeAvailability,
  type NodeRoleFilter,
} from './nodeWorkbenchModel'

type DirectoryFilter = NodeAvailability | 'all'

const DIRECTORY_PAGE_SIZE = 1000

const route = useRoute()
const { register } = usePagePolling()
const { t } = useI18n()

const directory = ref<NodeSummary[]>([])
const loading = ref(true)
const error = ref(false)
const loadedAt = ref(0)
const page = ref(1)
const pageSize = ref(20)
const roleFilter = ref<string | null>('all')
const availabilityFilter = ref<string | null>('all')
const stateFilter = ref<string | null>('all')
const search = ref<string | null>('')
const selectedNodeId = ref<string | null>(null)
let requestSequence = 0
let inflight: Promise<void> | null = null

const aggregate = computed(() => aggregateNodeDirectory(directory.value))
const roleMetrics = computed(() => aggregate.value.roles.filter(role => role.key !== 'other' || role.total > 0))

const ROLE_DESCRIPTION_KEYS: Record<string, string> = {
  Admin: 'node.workbench.role.adminDescription',
  Audit: 'node.workbench.role.auditDescription',
  Storage: 'node.workbench.role.storageDescription',
  other: 'node.workbench.role.otherDescription',
}
const stateSummary = computed(() => collectNodeStates(directory.value).map(state => ({
  state,
  count: directory.value.filter(node => node.state === state).length,
})))

const availabilityStats = computed(() => {
  if (!loadedAt.value) return []
  const stats = [
    { key: 'total', label: t('node.workbench.total'), value: aggregate.value.total },
    { key: 'available', label: t('node.available'), value: aggregate.value.available },
    { key: 'offline', label: t('node.workbench.offline'), value: aggregate.value.offline },
    { key: 'unknown', label: t('node.workbench.unknown'), value: aggregate.value.unknown },
  ]
  if (aggregate.value.draining > 0) {
    stats.push({ key: 'draining', label: t('node.workbench.draining'), value: aggregate.value.draining })
  }
  return stats
})

function availabilityClass(stat: { key: string; value: number }): string | undefined {
  if (stat.value <= 0) return undefined
  switch (stat.key) {
    case 'available': return 'is-available'
    case 'offline': return 'is-offline'
    case 'draining': return 'is-draining'
    default: return undefined
  }
}

const roleOptions = computed(() => [
  { label: t('node.workbench.allRoles'), value: 'all' },
  { label: 'Admin', value: 'Admin' },
  { label: 'Audit', value: 'Audit' },
  { label: 'Storage', value: 'Storage' },
  { label: t('node.workbench.roleOther'), value: 'other' },
])

const availabilityOptions = computed(() => [
  { label: t('node.workbench.allAvailability'), value: 'all' },
  { label: t('node.available'), value: 'available' },
  { label: t('node.workbench.offline'), value: 'offline' },
  { label: t('node.workbench.unknown'), value: 'unknown' },
])

const stateOptions = computed(() => [
  { label: t('node.workbench.allStates'), value: 'all' },
  ...collectNodeStates(directory.value).map(state => ({ label: stateLabel(state), value: state })),
])

const filteredNodes = computed(() => sortNodeDirectory(filterNodeDirectory(directory.value, {
  role: (roleFilter.value ?? 'all') as NodeRoleFilter,
  availability: (availabilityFilter.value ?? 'all') as DirectoryFilter,
  state: stateFilter.value ?? 'all',
  query: search.value ?? '',
})))

const pageData = computed(() => paginateNodeDirectory(filteredNodes.value, page.value, pageSize.value))
const initialLoading = computed(() => loading.value && loadedAt.value === 0)

watch(() => pageData.value.page, next => {
  if (next !== page.value) page.value = next
})
watch([roleFilter, availabilityFilter, stateFilter, search], () => {
  page.value = 1
})

function stateLabel(state: string): string {
  const key = nodeStateKey(state)
  return key ? t(key) : state
}

const availabilityTagTypes: Record<NodeAvailability, 'success' | 'error' | 'default'> = {
  available: 'success',
  offline: 'error',
  unknown: 'default',
}

const availabilityKeys: Record<NodeAvailability, string> = {
  available: 'node.available',
  offline: 'node.workbench.offline',
  unknown: 'node.workbench.unknown',
}

const columns = computed<DataTableColumns<NodeSummary>>(() => [
  {
    title: t('node.availability'),
    key: 'isAvailable',
    width: 96,
    render: (row: NodeSummary) => {
      const value = classifyNodeAvailability(row)
      return h(NTag, { size: 'small', type: availabilityTagTypes[value], bordered: false }, { default: () => t(availabilityKeys[value]) })
    },
  },
  {
    title: t('node.nodeId'),
    key: 'nodeId',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render: (row: NodeSummary) => h('span', { class: 'mono' }, row.nodeId),
  },
  {
    title: t('node.instanceId'),
    key: 'nodeInstanceId',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render: (row: NodeSummary) => h('span', { class: 'mono' }, row.nodeInstanceId || '-'),
  },
  {
    title: t('node.role'),
    key: 'role',
    width: 100,
    render: (row: NodeSummary) => row.role || '-',
  },
  {
    title: t('node.state'),
    key: 'state',
    width: 130,
    render: (row: NodeSummary) => {
      if (!row.state) return '-'
      return h('span', { class: row.state === 'BusyDraining' ? 'state-draining' : undefined }, stateLabel(row.state))
    },
  },
  {
    title: t('node.lastSeen'),
    key: 'lastSeenAt',
    width: 170,
    render: (row: NodeSummary) => formatTime(row.lastSeenAt),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 108,
    render: (row: NodeSummary) => h(NButton, {
      size: 'tiny',
      text: true,
      onClick: (event: Event) => {
        event.stopPropagation()
        selectedNodeId.value = row.nodeId
      },
    }, { default: () => t('node.workbench.details') }),
  },
])

function rowKey(row: NodeSummary): string {
  return row.nodeId
}

function rowProps(row: NodeSummary) {
  return {
    style: 'cursor: pointer',
    onClick: () => { selectedNodeId.value = row.nodeId },
  }
}

function changePageSize(next: number) {
  pageSize.value = next
  page.value = 1
}

function clearFilters() {
  roleFilter.value = 'all'
  availabilityFilter.value = 'all'
  stateFilter.value = 'all'
  search.value = ''
}

/** One directory read per poll; details are never preloaded from the list. */
function loadDirectory(silent = false): Promise<void> {
  if (inflight) {
    if (!silent) {
      loading.value = true
      void inflight.finally(() => { loading.value = false })
    }
    return inflight
  }
  if (!silent || loadedAt.value === 0) loading.value = true
  const sequence = ++requestSequence
  let request: Promise<void>
  request = (async () => {
    try {
      const items = await fetchAllPages(async params => parseNodeSummaryPage(await getNodes(params), DIRECTORY_PAGE_SIZE), DIRECTORY_PAGE_SIZE)
      if (sequence !== requestSequence) return
      directory.value = items
      loadedAt.value = Date.now()
      error.value = false
    } catch (cause) {
      if (sequence !== requestSequence) return
      console.error('Failed to fetch node directory', cause)
      error.value = true
    } finally {
      if (sequence === requestSequence) {
        loading.value = false
        inflight = null
      }
    }
  })()
  inflight = request
  return request
}

/** Apply a freshly loaded detail to its directory row instead of refetching the list. */
function applyNodeDetail(detail: NodeDetail) {
  directory.value = directory.value.map(node => node.nodeId === detail.nodeId
    ? {
        ...node,
        nodeInstanceId: detail.nodeInstanceId ?? node.nodeInstanceId,
        role: detail.role ?? node.role,
        state: detail.runtimeState?.state ?? node.state,
        isAvailable: detail.liveness?.isAvailable ?? node.isAvailable,
        lastSeenAt: detail.liveness?.lastSeenAt ?? node.lastSeenAt,
      }
    : node)
}

onUnmounted(() => {
  requestSequence++
})

register(() => loadDirectory(true), route.path)
</script>

<style scoped>
.node-workbench {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}

.directory-updated {
  color: var(--apple-gray-4);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.directory-source {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.5;
}

.directory-summary {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  padding: var(--apple-space-3) 0 0;
}

.role-metric-desc {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.5;
}

.role-metric-sub {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-4);
  font-size: 11px;
  line-height: 1.5;
}

.role-caution {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11px;
  line-height: 1.5;
}

.summary-groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.summary-group {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--apple-space-2) var(--apple-space-4);
  min-width: 0;
}

.group-label {
  min-width: 48px;
  color: var(--apple-gray-4);
  font-size: 11px;
}

.availability-stat {
  color: var(--apple-gray-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.availability-stat strong {
  margin-right: 4px;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
}

.availability-stat.is-available strong {
  color: var(--apple-green);
}

.availability-stat.is-offline strong {
  color: var(--apple-red);
}

.availability-stat.is-draining strong {
  color: var(--apple-orange);
}

.role-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-2) var(--apple-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.role-entry {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.role-name {
  color: var(--apple-gray-2);
  font-weight: 600;
}

.role-count {
  font-variant-numeric: tabular-nums;
}

.directory-stale {
  padding: var(--apple-space-2) var(--apple-space-3);
  margin-top: var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  color: var(--apple-orange);
  font-size: 12px;
}

.directory-filters {
  margin: var(--apple-space-4) 0 var(--apple-space-3);
}

.directory-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--apple-space-2);
  padding: var(--apple-space-6) var(--apple-space-4);
  margin-top: var(--apple-space-3);
  color: var(--apple-gray-3);
  font-size: 13px;
  text-align: center;
}

.directory-state p {
  margin: 0;
}

.directory-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3);
  flex-wrap: wrap;
  margin-top: var(--apple-space-3);
}

.directory-total {
  color: var(--apple-gray-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.directory-footer :deep(.n-pagination) {
  max-width: 100%;
}

:deep(.mono) {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

:deep(.state-draining) {
  color: var(--apple-orange);
  font-weight: 600;
}

@media (max-width: 680px) {
  .directory-footer {
    justify-content: center;
  }
}
</style>
