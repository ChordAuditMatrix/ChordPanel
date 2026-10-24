<template>
  <main class="job-view">
    <PageHeader
      :eyebrow="t('job.workbench.eyebrow')"
      :title="t('job.title')"
      :description="t('job.workbench.pageDescription')"
    >
      <template #actions>
        <n-button size="small" :loading="loading" @click="handleRefresh">{{ t('common.refresh') }}</n-button>
      </template>
    </PageHeader>

    <MetricStrip
      class="stat-strip"
      :label="t('job.workbench.statScope')"
      :columns="4"
      :aria-busy="statsLoading"
    >
      <MetricCard
        v-for="definition in JOB_STATS"
        :key="definition.key"
        :label="t(definition.labelKey)"
        :value="stats[definition.key]"
        :fallback="'-'"
        :tone="jobStatTone(definition.key, stats[definition.key])"
      />
    </MetricStrip>
    <p v-if="statsError" class="stat-note stat-note--block">{{ t('job.workbench.statUnavailable') }}</p>
    <p v-if="filtersActive" class="stat-note stat-note--block">{{ t('job.workbench.statFilteredNote') }}</p>

    <WorkbenchSection
      :title="t('job.workbench.listTitle')"
      :description="t('job.workbench.listDescription')"
    >
      <template #actions>
        <span class="result-count">{{ t('common.totalItems', { n: total }) }}</span>
      </template>

      <div class="filters">
        <label class="field">
          <span class="field-label">{{ t('job.filterStatus') }}</span>
          <n-select
            v-model:value="filterStatus"
            :placeholder="t('job.filterStatus')"
            clearable
            size="small"
            :options="statusOptions"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ t('job.filterType') }}</span>
          <n-select
            v-model:value="filterType"
            :placeholder="t('job.filterType')"
            clearable
            size="small"
            :options="typeOptions"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ t('job.filterOwnerId') }}</span>
          <UserSelect v-model="filterOwner" :placeholder="t('job.filterOwnerId')" size="small" />
        </label>
        <div class="field-actions">
          <n-button size="small" :disabled="!filtersActive" @click="resetFilters">
            {{ t('job.workbench.resetFilters') }}
          </n-button>
        </div>
      </div>

      <n-alert v-if="loadError" type="error" :bordered="false" class="list-alert">
        <div class="list-alert__body">
          <span>{{ t('job.workbench.loadFailed') }}</span>
          <span v-if="lastLoadedAtMs" class="list-alert__time">
            {{ t('job.workbench.lastLoaded', { time: formatDateTime(lastLoadedAtMs) }) }}
          </span>
          <n-button size="tiny" @click="fetchJobs">{{ t('common.retry') }}</n-button>
        </div>
      </n-alert>

      <div class="job-desktop-table">
        <ServerPagedDataTable
          :columns="jobColumns"
          :remote="true"
          :data="displayJobs"
          :loading="loading"
          :page="page"
          :page-size="pageSize"
          :total="total"
          :row-props="rowProps"
          @update:page="page = $event"
          @update:page-size="pageSize = $event"
          @update:sorter="handleSortChange"
        />
      </div>

      <div class="job-mobile-cards">
        <div class="job-mobile-controls">
          <n-button
            size="small"
            quaternary
            :aria-label="`${t('job.createdAt')} ${sortOrder === 'descend' ? '↓' : '↑'}`"
            :title="t('job.createdAt')"
            :aria-pressed="sortOrder === 'descend'"
            @click="toggleSortOrder"
          >
            {{ t('job.createdAt') }}
            <span aria-hidden="true">{{ sortOrder === 'descend' ? '↓' : '↑' }}</span>
          </n-button>
          <n-pagination
            :page="page"
            :page-size="pageSize"
            :item-count="total"
            :page-sizes="[10, 20, 50]"
            show-size-picker
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
          />
        </div>
        <n-spin :show="loading">
          <div v-if="mobileJobs.length" class="job-mobile-list" role="list">
            <article
              v-for="item in mobileJobs"
              :key="item.job.jobId"
              class="job-mobile-card"
              role="listitem"
              tabindex="0"
              :aria-label="t('job.detailJob', { id: item.job.jobId })"
              @click="openDetail(item.job)"
              @keydown="handleJobRowKeydown(item.job, $event)"
            >
              <div class="job-mobile-card__heading">
                <strong class="job-mobile-card__operation">{{ item.operation }}</strong>
                <n-tag :type="item.status.type" size="small" :bordered="false">
                  {{ item.status.label }}
                </n-tag>
              </div>
              <div class="job-mobile-card__job-id">
                <span class="job-mobile-card__label">{{ t('job.jobId') }}</span>
                <code
                  class="job-mobile-card__id-value"
                  :title="item.job.jobId"
                  :aria-label="`${t('job.jobId')}: ${item.job.jobId}`"
                  tabindex="0"
                >
                  {{ item.job.jobId }}
                </code>
                <n-button
                  size="tiny"
                  quaternary
                  :aria-label="t('common.copy')"
                  :title="t('common.copy')"
                  @click.stop="copyJobId(item.job.jobId)"
                >
                  {{ t('common.copy') }}
                </n-button>
              </div>

              <div class="job-mobile-card__section">
                <div class="job-mobile-card__fact">
                  <span v-if="item.businessObject" class="job-mobile-card__value"
                    :title="businessObjectTitle(item.businessObject)"
                  >
                    {{ t(item.businessObject.labelKey) }}: {{ item.businessObject.value }}
                  </span>
                  <span v-else class="job-mobile-card__value cell-muted">
                    {{ t('job.workbench.unknown') }}
                  </span>
                </div>
                <div
                  v-for="participant in item.participants"
                  :key="participant.key"
                  class="job-mobile-card__fact"
                >
                  <span class="job-mobile-card__label">{{ t(participant.labelKey) }}</span>
                  <div class="job-mobile-card__identity">
                    <span
                      class="job-mobile-card__identity-name"
                      :title="!participant.identity.name && participant.identity.id ? participant.formatted : undefined"
                      :tabindex="!participant.identity.name && participant.identity.id ? 0 : undefined"
                      :aria-label="!participant.identity.name && participant.identity.id
                        ? `${t(participant.labelKey)}: ${participant.formatted}`
                        : undefined"
                    >
                      {{ participant.identity.name || participant.identity.id || '-' }}
                    </span>
                    <span
                      v-if="participant.identity.name && participant.identity.id"
                      class="job-mobile-card__identity-id"
                      :title="participant.formatted"
                      :aria-label="`${t(participant.labelKey)}: ${participant.formatted}`"
                      tabindex="0"
                    >
                      ({{ participant.identity.id }})
                    </span>
                  </div>
                </div>
              </div>

              <div class="job-mobile-card__section">
                <span class="job-mobile-card__label">{{ t('job.workbench.recordedProgress') }}</span>
                <JobStatusMessage
                  v-if="item.job.statusMessage"
                  :message="item.job.statusMessage"
                  compact
                />
                <span v-else class="cell-muted">{{ t('job.workbench.unknown') }}</span>
                <div class="job-mobile-card__error">
                  <span class="job-mobile-card__label">{{ t('job.workbench.error') }}</span>
                  <n-tag
                    v-if="item.error.showTag"
                    :type="item.error.type"
                    size="small"
                    :bordered="false"
                    :title="item.error.code"
                  >
                    {{ item.error.label }}
                  </n-tag>
                  <span v-else class="job-mobile-card__value cell-muted">{{ item.error.label }}</span>
                </div>
              </div>

              <div class="job-mobile-card__meta">
                <div class="job-mobile-card__fact">
                  <span class="job-mobile-card__label">{{ t('job.createdAt') }}</span>
                  <span class="job-mobile-card__value">{{ formatDateTime(item.job.createdAtMs) }}</span>
                </div>
                <div class="job-mobile-card__fact">
                  <span class="job-mobile-card__label">{{ t('job.duration') }}</span>
                  <span class="job-mobile-card__value">{{ formatJobDuration(item.job.totalDurationMs) }}</span>
                </div>
              </div>

              <div class="job-mobile-card__actions" @click.stop>
                <n-button
                  v-for="action in jobNavigationActions"
                  :key="action"
                  size="tiny"
                  quaternary
                  :aria-label="t(jobNavigationContent(action).labelKey)"
                  :title="t(jobNavigationContent(action).helpKey)"
                  @click="activateJobAction(action, item.job, $event)"
                >
                  {{ t(jobNavigationContent(action).labelKey) }}
                </n-button>
              </div>
            </article>
          </div>
          <n-empty v-else-if="!loading" :description="t('common.noData')" size="small" />
        </n-spin>
      </div>

      <p class="note-box">{{ t('job.workbench.scopeNote') }}</p>
    </WorkbenchSection>

    <n-drawer v-model:show="showDetail" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
      <n-drawer-content :title="detailJobId ? t('job.detailJob', { id: detailJobId }) : t('job.detail')" closable>
        <JobDetailPanel
          v-if="detailJobId"
          :job-id="detailJobId"
          :visible="showDetail"
          @task-click="openTaskDetail"
          @cancel="handleCancel"
        />
      </n-drawer-content>
    </n-drawer>

    <TaskDetailModal :task="currentTask" :job="currentTaskJob" @close="closeTaskDetail" />
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NTag, useMessage } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { getJobs, cancelJob } from '@/api/job'
import type { JobSummary, JobDetail, TaskSummary } from '@/api/job'
import { usePagePolling } from '@/composables/usePagePolling'
import { isJobRecovering, useJobTracking } from '@/stores/jobTracking'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { formatDateTime } from '@/utils/datetime'
import PageHeader from '@/components/PageHeader.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import MetricStrip from '@/components/MetricStrip.vue'
import MetricCard from '@/components/MetricCard.vue'
import UserSelect from '@/components/UserSelect.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobStatusMessage from '@/components/JobStatusMessage.vue'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import {
  formatJobDuration,
  isCancelledJob,
  jobBusinessObjects,
  jobErrorLabel,
  jobOperation,
  jobTypeBusinessLabel,
  type JobBusinessObject,
} from '@/utils/jobBusiness'
import { JOB_STATS, clampJobPage, jobNavigationContent, jobStatusPresentation, readJobIdQuery, type JobStatKey } from './jobCenter'
import { executionRoute, reportRoute } from '@/utils/jobRoutes'

const message = useMessage()
const route = useRoute()
const router = useRouter()
const { register } = usePagePolling()
const { drawerWidth } = useAdaptiveWidth(560)
const { t } = useI18n()
const { ensureLoaded, refresh, formatUserIdentity, formatUserIdentityParts, algorithmsById } = useReferenceCatalog()
const { snapshots, publishJobSnapshots } = useJobTracking()

const loading = ref(false)
const jobs = ref<JobSummary[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const sortOrder = ref<'ascend' | 'descend'>('descend')
const loadError = ref(false)
const lastLoadedAtMs = ref<number | null>(null)
let fetchSequence = 0

const stats = ref<Partial<Record<JobStatKey, number>>>({})
const statsError = ref(false)
const statsLoading = ref(false)
let statsSequence = 0

const JOB_STAT_TONES = {
  total: 'neutral',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
} as const

function jobStatTone(key: JobStatKey, value: number | undefined) {
  return value === undefined ? 'neutral' : JOB_STAT_TONES[key]
}

const displayJobs = computed(() => jobs.value.map(job => snapshots[job.jobId]?.snapshotLoaded ? snapshots[job.jobId] : job))
const detailJobId = ref<string | null>(null)
const showDetail = ref(false)
const currentTask = ref<TaskSummary | null>(null)
const currentTaskJob = ref<JobDetail | null>(null)
const filterStatus = ref<string | null>(null)
const filterType = ref<string | null>(null)
const filterOwner = ref('')
const filtersActive = computed(() => Boolean(filterStatus.value || filterType.value || filterOwner.value))
const routeJobId = computed(() => readJobIdQuery(route.query.jobId))

// Status options match the backend's supported Job states. Cancellation is
// Failed + errorCode=Cancelled, so it is not a separate filter value.
const statusOptions = computed(() => [
  { label: t('job.statusPending'), value: 'Pending' },
  { label: t('job.statusRunning'), value: 'Running' },
  { label: t('job.statusSucceeded'), value: 'Succeeded' },
  { label: t('job.statusFailed'), value: 'Failed' },
])
const typeOptions = computed(() => [
  { label: t('job.typeAudit'), value: 'Audit' },
  { label: t('job.typeQuery'), value: 'Query' },
  { label: t('job.typeStorage'), value: 'Storage' },
  { label: t('job.typeReplication'), value: 'Replication' },
])

function stopRowClick(event: Event, action: () => void) {
  event.stopPropagation()
  action()
}

const jobNavigationActions = ['execution', 'details', 'report'] as const

function operationLabelFor(row: JobSummary): string {
  const operation = jobOperation(snapshots[row.jobId]?.metadata)
  if (operation.state === 'known') return t(operation.labelKey)
  if (operation.state === 'unknown') return t('job.workbench.operationUnknown', { token: operation.token })
  return jobTypeBusinessLabel(row.jobType, t, snapshots[row.jobId]?.detailLoaded === true)
}

function businessObjectFor(row: JobSummary): JobBusinessObject | undefined {
  return jobBusinessObjects(snapshots[row.jobId]?.metadata, algorithmsById.value)[0]
}

function businessObjectTitle(object: JobBusinessObject): string {
  return `${t(object.labelKey)}: ${object.value}`
}
function renderJobParticipant(labelKey: string, source: JobSummary['initiator']) {
  const label = t(labelKey)
  const identity = formatUserIdentityParts(source)
  const formatted = formatUserIdentity(source)
  const primary = identity.name || identity.id || '-'
  const idOnly = !identity.name && Boolean(identity.id)
  return h('div', { class: 'job-cell-participant' }, [
    h('span', { class: 'job-cell__label' }, `${label}:`),
    h('div', { class: 'job-cell__identity' }, [
      h('span', {
        class: 'job-cell__identity-name',
        title: idOnly ? formatted : undefined,
        tabindex: idOnly ? 0 : undefined,
        'aria-label': idOnly ? `${label}: ${formatted}` : undefined,
      }, primary),
      identity.name && identity.id
        ? h('span', {
          class: 'job-cell__identity-id',
          title: formatted,
          tabindex: 0,
          'aria-label': `${label}: ${formatted}`,
        }, ` (${identity.id})`)
        : null,
    ]),
  ])
}

function statusFor(row: JobSummary) {
  return jobStatusPresentation(row.status, isJobRecovering(row), t)
}

function errorFor(row: JobSummary) {
  const label = jobErrorLabel(row.errorCode, t)
  if (!label) {
    return {
      label: t(row.errorCode === 'None' ? 'job.workbench.noError' : 'job.workbench.unknown'),
      showTag: false as const,
      type: 'default' as const,
      code: row.errorCode,
    }
  }
  return {
    label,
    showTag: true as const,
    type: isCancelledJob(row) ? 'warning' as const : 'error' as const,
    code: row.errorCode,
  }
}

function activateJobAction(
  action: typeof jobNavigationActions[number],
  row: JobSummary,
  event: Event,
) {
  stopRowClick(event, () => {
    if (action === 'execution') openExecution(row)
    else if (action === 'details') openDetail(row)
    else openReport(row)
  })
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'descend' ? 'ascend' : 'descend'
  page.value = 1
}
async function copyJobId(jobId: string) {
  try {
    await navigator.clipboard.writeText(jobId)
    message.success(t('common.copied'))
  } catch {
    message.error(t('common.operationFailed'))
  }
}

const mobileJobs = computed(() => displayJobs.value.map(job => ({
  job,
  operation: operationLabelFor(job),
  status: statusFor(job),
  businessObject: businessObjectFor(job),
  participants: [
    { key: 'initiator', labelKey: 'job.initiator', identity: formatUserIdentityParts(job.initiator), formatted: formatUserIdentity(job.initiator) },
    { key: 'dataOwner', labelKey: 'job.dataOwner', identity: formatUserIdentityParts(job.dataOwner), formatted: formatUserIdentity(job.dataOwner) },
  ],
  error: errorFor(job),
})))

const jobColumns = computed<DataTableColumns<JobSummary>>(() => [
  {
    title: t('job.workbench.operationLabel'),
    key: 'businessOperation',
    width: 140,
    render: (row: JobSummary) => {
      const status = statusFor(row)
      const operation = operationLabelFor(row)
      return h('div', { class: 'job-cell-stack job-cell-operation' }, [
        h('span', { class: 'job-cell-operation__label', title: operation }, operation),
        h(NTag, { type: status.type, size: 'small', bordered: false }, () => status.label),
        h('div', { class: 'job-cell-operation__id' }, [
          h('span', {
            class: 'cell-mono job-cell-operation__id-value',
            title: row.jobId,
            tabindex: 0,
            'aria-label': `${t('job.jobId')}: ${row.jobId}`,
          }, row.jobId),
          h(NButton, {
            size: 'tiny',
            quaternary: true,
            'aria-label': t('common.copy'),
            title: t('common.copy'),
            onClick: (event: Event) => stopRowClick(event, () => { void copyJobId(row.jobId) }),
          }, () => t('common.copy')),
        ]),
      ])
    },
  },
  {
    title: t('job.workbench.businessObject'),
    key: 'businessObject',
    width: 175,
    render: (row: JobSummary) => {
      const object = businessObjectFor(row)
      const objectText = object ? `${t(object.labelKey)}: ${object.value}` : t('job.workbench.unknown')
      return h('div', { class: 'job-cell-stack job-cell-related' }, [
        h('span', {
          class: 'job-cell-related__object',
          title: object ? businessObjectTitle(object) : objectText,
        }, objectText),
        renderJobParticipant('job.initiator', row.initiator),
        renderJobParticipant('job.dataOwner', row.dataOwner),
      ])
    },
  },
  {
    title: t('job.workbench.recordedProgress'),
    key: 'statusMessage',
    width: 220,
    render: (row: JobSummary) => {
      const error = errorFor(row)
      return h('div', { class: 'job-cell-stack job-cell-progress' }, [
        row.statusMessage
          ? h('div', { class: 'cell-message' }, [h(JobStatusMessage, { message: row.statusMessage, compact: true })])
          : h('span', { class: 'cell-muted' }, t('job.workbench.unknown')),
        h('div', { class: 'job-cell-progress__error' }, [
          h('span', { class: 'job-cell__label' }, t('job.workbench.error')),
          error.showTag
            ? h(NTag, { type: error.type, size: 'small', bordered: false, title: error.code }, () => error.label)
            : h('span', { class: 'cell-muted' }, error.label),
        ]),
      ])
    },
  },
  {
    title: `${t('job.createdAt')} / ${t('job.duration')}`,
    key: 'createdAtMs',
    width: 175,
    sorter: 'default',
    sortOrder: sortOrder.value,
    render: (row: JobSummary) => h('div', { class: 'job-cell-stack job-cell-metadata' }, [
      h('span', { class: 'job-cell-metadata__date' }, formatDateTime(row.createdAtMs)),
      h('span', { class: 'job-cell-metadata__duration' }, `${t('job.duration')}: ${formatJobDuration(row.totalDurationMs)}`),
    ]),
  },
  {
    title: t('job.actions'),
    key: 'actions',
    width: 200,
    render: (row: JobSummary) => h('div', { class: 'row-actions' }, [
      ...jobNavigationActions.map(action => {
        const content = jobNavigationContent(action)
        return h(NButton, {
          size: 'tiny',
          quaternary: true,
          'aria-label': t(content.labelKey),
          title: t(content.helpKey),
          onClick: (event: Event) => activateJobAction(action, row, event),
        }, () => t(content.labelKey))
      }),
    ]),
  },
])

function handleSortChange(sorter: DataTableSortState | null) {
  if (sorter?.columnKey && sorter.columnKey !== 'createdAtMs') return
  sortOrder.value = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  page.value = 1
}

async function fetchJobs() {
  const sequence = ++fetchSequence
  const requestedPage = page.value
  const requestedPageSize = pageSize.value
  loading.value = true
  try {
    const response = await getJobs({
      page: requestedPage,
      pageSize: requestedPageSize,
      status: filterStatus.value || undefined,
      jobType: filterType.value || undefined,
      dataOwnerUserId: filterOwner.value || undefined,
      sortBy: 'createdAtMs',
      ascending: sortOrder.value === 'ascend',
    })
    if (sequence !== fetchSequence) return
    // A server-side filter change can leave the selected page past the end.
    const settledPage = clampJobPage(requestedPage, response.total, requestedPageSize)
    if (settledPage !== requestedPage) {
      page.value = settledPage
      return
    }
    jobs.value = response.items
    total.value = response.total
    lastLoadedAtMs.value = Date.now()
    loadError.value = false
    publishJobSnapshots(jobs.value)
  } catch {
    if (sequence !== fetchSequence) return
    loadError.value = true
  } finally {
    if (sequence === fetchSequence) loading.value = false
  }
}

async function fetchStats() {
  const sequence = ++statsSequence
  statsLoading.value = true
  try {
    const results = await Promise.allSettled(JOB_STATS.map(definition => getJobs({
      page: 1,
      pageSize: 1,
      status: definition.status ?? undefined,
    })))
    if (sequence !== statsSequence) return
    const nextStats: Partial<Record<JobStatKey, number>> = {}
    let failed = false
    results.forEach((result, index) => {
      const definition = JOB_STATS[index]
      if (result.status === 'fulfilled') nextStats[definition.key] = result.value.total
      else failed = true
    })
    stats.value = nextStats
    statsError.value = failed
  } finally {
    if (sequence === statsSequence) statsLoading.value = false
  }
}

function openDetail(job: JobSummary) {
  detailJobId.value = job.jobId
  showDetail.value = true
  if (routeJobId.value !== job.jobId) {
    void router.replace({ query: { ...route.query, jobId: job.jobId } })
  }
}

/** Navigate to the backend-backed execution page for this Job. */
function openExecution(job: JobSummary) {
  void router.push(executionRoute(job.jobId))
}

function openReport(job: JobSummary) {
  void router.push(reportRoute(job.jobId))
}

function openTaskDetail(task: TaskSummary, job?: JobDetail | null) {
  currentTaskJob.value = job ?? null
  currentTask.value = task
}

function closeTaskDetail() {
  currentTask.value = null
  currentTaskJob.value = null
}

function resetFilters() {
  filterStatus.value = null
  filterType.value = null
  filterOwner.value = ''
  if (page.value !== 1) page.value = 1
}

function handleRefresh() {
  refresh()
  void fetchJobs()
  void fetchStats()
}

async function handleCancel(jobId?: string) {
  const id = jobId || detailJobId.value
  if (!id) return
  try {
    await cancelJob(id)
    message.success(t('job.cancelRequested'))
    void fetchJobs()
    void fetchStats()
  } catch (e) {
    // axios rejections carry the API error payload; fall back to the locale string
    const detail = e as { response?: { data?: { message?: string } } }
    message.error(detail?.response?.data?.message || t('job.cancelFailed'))
  }
}

function handleJobRowKeydown(row: JobSummary, event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openDetail(row)
}

const rowProps = (row: JobSummary) => ({
  class: row.jobId === detailJobId.value ? 'job-row is-selected' : 'job-row',
  style: 'cursor: pointer',
  tabindex: '0',
  onClick: () => openDetail(row),
  onKeydown: (event: KeyboardEvent) => handleJobRowKeydown(row, event),
})

// The selected Job is mirrored into ?jobId, so a refresh (or a global tracking
// deep link) restores the same drawer instead of losing the selection.
watch([filterStatus, filterType, filterOwner, page, pageSize, sortOrder], (current, previous) => {
  const filtersChanged = current[0] !== previous[0] || current[1] !== previous[1] || current[2] !== previous[2]
  const pageChanged = current[3] !== previous[3]
  const pageSizeChanged = current[4] !== previous[4]
  const sortChanged = current[5] !== previous[5]
  if (!filtersChanged && !pageChanged && !pageSizeChanged && !sortChanged) return
  loadError.value = false
  jobs.value = []
  if (filtersChanged) total.value = 0
  if ((filtersChanged || pageSizeChanged || sortChanged) && page.value !== 1) {
    page.value = 1
    return
  }
  void fetchJobs()
})

watch(routeJobId, (jobId) => {
  if (!jobId) {
    showDetail.value = false
    detailJobId.value = null
    return
  }
  detailJobId.value = jobId
  showDetail.value = true
}, { immediate: true })

watch(showDetail, (visible) => {
  if (visible) return
  detailJobId.value = null
  if (!routeJobId.value) return
  const nextQuery = { ...route.query }
  delete nextQuery.jobId
  void router.replace({ query: nextQuery })
})

onMounted(() => {
  ensureLoaded()
  register(() => {
    void fetchJobs()
    void fetchStats()
  }, route.path)
})

onUnmounted(() => {
  fetchSequence += 1
  statsSequence += 1
})
</script>

<style scoped>
.job-view {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  max-width: var(--apple-content-max);
  min-width: 0;
  margin: 0 auto;
  padding: var(--apple-space-6) var(--apple-page-gutter) var(--apple-space-8);
}

.stat-strip {
  padding-bottom: var(--apple-space-3);
  border-bottom: 1px solid var(--apple-border);
}

.stat-note {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

.stat-note--block {
  margin: 0;
}

.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--apple-space-3);
  align-items: end;
  margin-bottom: var(--apple-space-4);
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

.list-alert {
  margin-bottom: var(--apple-space-3);
}

.list-alert__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  width: 100%;
}

.list-alert__time {
  color: var(--apple-gray-3);
  font-size: 12px;
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
.job-desktop-table {
  display: none;
  min-width: 0;
}
.job-desktop-table :deep(.n-data-table-table) {
  width: 100% !important;
  table-layout: fixed !important;
}

.job-mobile-cards {
  min-width: 0;
}

.job-mobile-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  min-width: 0;
  margin-bottom: var(--apple-space-3);
}

.job-mobile-controls :deep(.n-pagination) {
  max-width: 100%;
  flex-wrap: wrap;
}

.job-mobile-list {
  display: grid;
  gap: var(--apple-space-3);
  min-width: 0;
}

.job-mobile-card {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  min-width: 0;
  padding: var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  cursor: pointer;
}

.job-mobile-card:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.job-mobile-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-2);
  min-width: 0;
}

.job-mobile-card__operation {
  min-width: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 620;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.job-mobile-card__section {
  display: grid;
  gap: var(--apple-space-2);
  min-width: 0;
  padding-top: var(--apple-space-3);
  border-top: 1px solid var(--apple-border);
}

.job-mobile-card__fact {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: baseline;
  gap: var(--apple-space-2);
  min-width: 0;
}

.job-mobile-card__label {
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.4;
}

.job-mobile-card__value {
  min-width: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.job-mobile-card__job-id {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--apple-space-2);
  min-width: 0;
}

.job-mobile-card__id-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--apple-gray-1);
  font: 11px var(--apple-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-mobile-card__id-value:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}
.job-mobile-card__identity {
  display: flex;
  align-items: baseline;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.job-mobile-card__identity-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--apple-gray-1);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-mobile-card__identity-name:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}

.job-mobile-card__identity-id {
  flex: 0 1 40%;
  max-width: 40%;
  min-width: 0;
  margin-inline-start: 0.25em;
  overflow: hidden;
  color: var(--apple-gray-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-mobile-card__identity-id:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}

.job-mobile-card__error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  min-width: 0;
}

.job-mobile-card__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-2) var(--apple-space-3);
  min-width: 0;
}

.job-mobile-card__meta .job-mobile-card__fact {
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.job-mobile-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-1);
  min-width: 0;
  padding-top: var(--apple-space-2);
  border-top: 1px solid var(--apple-border);
}

:deep(.job-cell-stack) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

:deep(.job-cell-stack > .n-tag) {
  align-self: flex-start;
}

:deep(.job-cell-operation__label) {
  color: var(--apple-gray-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

:deep(.job-cell-operation__id) {
  display: flex;
  align-items: center;
  gap: var(--apple-space-1);
  width: 100%;
  min-width: 0;
}

:deep(.job-cell-operation__id-value) {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.job-cell-operation__id-value:focus-visible) {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}

:deep(.job-cell-operation__id .n-button) {
  flex: 0 0 auto;
}

:deep(.job-cell-related__object) {
  display: -webkit-box;
  overflow: hidden;
  max-width: 100%;
  color: var(--apple-gray-1);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

:deep(.job-cell-participant) {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-size: 11px;
  line-height: 1.35;
}

:deep(.job-cell__label) {
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.35;
  white-space: nowrap;
}

:deep(.job-cell__identity) {
  display: flex;
  align-items: baseline;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

:deep(.job-cell__identity-name) {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--apple-gray-1);
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.job-cell__identity-name[title]) {
  cursor: default;
}

:deep(.job-cell__identity-id) {
  flex: 0 1 40%;
  max-width: 40%;
  min-width: 0;
  margin-inline-start: 0.25em;
  overflow: hidden;
  color: var(--apple-gray-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.job-cell__identity-id:focus-visible) {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}

:deep(.job-cell-progress__error) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-1);
  min-width: 0;
}

:deep(.job-cell-metadata__date),
:deep(.job-cell-metadata__duration) {
  display: block;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

:deep(.cell-mono) {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

:deep(.cell-message) {
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
}

:deep(.cell-muted) {
  color: var(--apple-gray-4);
}

:deep(.row-actions) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-1);
}

:deep(.job-row:focus-visible) {
  outline: 2px solid var(--apple-blue);
  outline-offset: -2px;
}

:deep(.job-row.is-selected > td:first-child) {
  box-shadow: inset 2px 0 0 var(--apple-blue);
}

@media (min-width: 1260px) {
  .job-desktop-table {
    display: block;
  }

  .job-mobile-cards {
    display: none;
  }
}

@media (max-width: 700px) {
  .filters {
    grid-template-columns: minmax(0, 1fr);
  }

  .field-actions {
    justify-content: stretch;
  }

  .job-mobile-controls {
    align-items: stretch;
  }

  .job-mobile-controls :deep(.n-pagination) {
    justify-content: flex-start;
  }

  .job-mobile-card__meta {
    grid-template-columns: minmax(0, 1fr);
  }

}
</style>
