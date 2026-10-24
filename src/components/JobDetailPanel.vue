<template>
  <div class="job-detail-panel" :class="{ 'job-detail-compact': compact }">
    <n-spin :show="loading">
      <div v-if="job" class="job-detail-body">
        <header class="job-summary">
          <div class="job-summary__copy">
            <p class="job-summary__eyebrow">
              {{ operationLabel ? t('job.workbench.operationLabel') : t('job.type') }}
            </p>
            <h2 class="job-summary__title">{{ businessName }}</h2>
            <code class="job-id-value" :title="job.jobId">{{ job.jobId }}</code>
          </div>
          <div class="job-summary__tags">
            <n-tag
              :type="isJobRecovering(job) ? 'warning' : jobStatusTagType(job.status)"
              size="small"
              :bordered="false"
            >
              {{ isJobRecovering(job) ? t('job.statusRecovering') : jobStatusLabel(job.status, t) }}
            </n-tag>
            <n-tag v-if="errorLabel" :type="isCancelledJob(job) ? 'warning' : 'error'" size="small" :bordered="false" :title="job.errorCode">
              {{ errorLabel }}
            </n-tag>
          </div>
        </header>

        <p v-if="unknownOperationToken" class="job-warning" role="status">
          {{ t('job.workbench.operationUnknown', { token: unknownOperationToken }) }}
        </p>
        <p v-else-if="detailReady && !operationLabel" class="job-muted">
          {{ t('job.workbench.operationAbsent') }}
        </p>

        <dl class="fact-grid">
          <div v-for="fact in facts" :key="fact.key" class="fact">
            <dt>{{ fact.label }}</dt>
            <dd :class="{ 'fact-mono': fact.mono }" :title="fact.value">{{ fact.value }}</dd>
          </div>
        </dl>

        <section v-if="detailReady" class="job-section">
          <h3 class="job-section__title">{{ t('job.workbench.businessObject') }}</h3>
          <dl v-if="businessObjects.length" class="fact-grid">
            <div v-for="item in businessObjects" :key="item.key" class="fact">
              <dt>{{ t(item.labelKey) }}</dt>
              <dd :title="item.value">
                <span class="fact-mono">{{ item.value }}</span>
              </dd>
            </div>
          </dl>
          <p v-else class="job-muted">{{ t('job.workbench.noBusinessObject') }}</p>
        </section>

        <section v-if="job.statusMessage" class="job-section">
          <h3 class="job-section__title">{{ t('job.message') }}</h3>
          <div class="job-message">
            <JobStatusMessage :message="job.statusMessage" />
          </div>
        </section>

        <section class="job-section">
          <div class="job-section__head">
            <h3 class="job-section__title">{{ t('job.subtasks', { n: taskPage.total }) }}</h3>
            <n-button v-if="taskPage.error" size="tiny" @click="retryTaskPage(props.jobId)">
              {{ t('common.retry') }}
            </n-button>
          </div>
          <n-alert v-if="taskPage.error" type="error" :bordered="false" class="section-alert">
            {{ t('job.loadTasksFailed') }}
          </n-alert>
          <ServerPagedDataTable
            v-else-if="taskPage.loading || taskPage.total > 0 || tasks.length > 0"
            :columns="taskColumns"
            :remote="true"
            :data="tasks"
            :loading="taskPage.loading"
            :page="taskPage.page"
            :page-size="taskPage.pageSize"
            :total="taskPage.total"
            :page-sizes="[5, 10, 20, 50]"
            :row-props="taskRowProps"
            @update:page="setTaskPage(props.jobId, $event, taskPage.pageSize)"
            @update:page-size="setTaskPage(props.jobId, 1, $event)"
            @update:sorter="handleTaskSortChange"
          />
          <n-empty v-else :description="t('job.noSubtasks')" size="small" />
        </section>

        <section v-if="detailReady" class="job-section">
          <h3 class="job-section__title">{{ t('job.statusHistory') }}</h3>
          <div v-if="jobHistory.length" class="job-history-scroll">
            <n-timeline>
              <n-timeline-item
                v-for="entry in jobHistory"
                :key="entry.sequence"
                :type="jobStatusTagType(entry.status)"
                :title="jobStatusLabel(entry.status, t)"
                :time="formatDateTime(entry.switchedAtMs)"
              >
                <div class="history-entry">
                  <JobStatusMessage v-if="entry.statusMessage" :message="entry.statusMessage" />
                  <n-tag
                    v-if="jobErrorLabel(entry.errorCode, t)"
                    :type="isCancelledJob(entry) ? 'warning' : 'error'"
                    size="small"
                    :bordered="false"
                    :title="entry.errorCode"
                  >
                    {{ jobErrorLabel(entry.errorCode, t) }}
                  </n-tag>
                </div>
              </n-timeline-item>
            </n-timeline>
          </div>
          <n-empty v-else :description="t('job.workbench.noHistory')" size="small" />
        </section>
        <section v-if="detailReady && hasMetadata" class="job-section">
          <details class="raw-metadata">
            <summary>{{ t('job.workbench.rawMetadataLabel') }}</summary>
            <div class="raw-metadata__content">
              <JsonKeyValue :data="metadata" :format-value="formatValue" />
            </div>
          </details>
        </section>


        <div v-if="!hideActions" class="job-actions">
          <n-button size="small" type="primary" ghost :aria-label="t('job.workbench.action.execution')" :title="t('job.workbench.action.executionHelp')" @click="openExecution">
            {{ t('job.workbench.action.execution') }}
          </n-button>
          <n-button size="small" :aria-label="t('job.workbench.action.report')" :title="t('job.workbench.action.reportHelp')" @click="openReport">
            {{ t('job.workbench.action.report') }}
          </n-button>
          <n-button v-if="canCancel" type="error" size="small" @click="emit('cancel', job.jobId)">
            {{ t('job.cancelJob') }}
          </n-button>
        </div>
        <p class="scope-note">{{ t('job.workbench.statusScopeNote') }}</p>
      </div>
    </n-spin>
    <n-alert v-if="detailLoadFailed" type="error" :bordered="false" class="section-alert">
      {{ t('job.loadDetailFailed') }}
    </n-alert>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, h } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NTag } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import type { JobDetail, JobSummary, TaskSummary } from '@/api/job'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { isJobRecovering, useJobTracking } from '@/stores/jobTracking'
import { formatDateTime } from '@/utils/datetime'
import { maintenanceRecoveryLabel, jobStatusLabel, taskStatusLabel } from '@/utils/statusLabels'
import { jobStatusTagType } from '@/utils/jobStatus'
import { jobTypeLabel } from '@/utils/jobType'
import {
  formatJobDuration,
  isCancelledJob,
  jobBusinessObjects,
  jobErrorLabel,
  jobHasCryptographicVerification,
  jobOperation,
  jobOperationLabel,
  jobVerification,
} from '@/utils/jobBusiness'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import JobStatusMessage from '@/components/JobStatusMessage.vue'
import JsonKeyValue from '@/components/JsonKeyValue.vue'
import { hasAuditTableReference } from '@/utils/auditTableReferences'
import { executionRoute, reportRoute } from '@/utils/jobRoutes'

const { t } = useI18n()
const { ensureLoaded, ensureAuditTablesLoaded, formatUserIdentity, formatValue, algorithmsById } = useReferenceCatalog()
const router = useRouter()

const props = withDefaults(defineProps<{
  jobId: string
  compact?: boolean
  hideActions?: boolean
  visible: boolean
  jobSnapshot?: JobSummary | null
}>(), {
  compact: false,
  hideActions: false,
  jobSnapshot: null,
})

const emit = defineEmits<{
  (e: 'taskClick', task: TaskSummary, job: JobDetail | null): void
  (e: 'cancel', jobId: string): void
}>()

const { snapshots, taskSnapshots, taskPages, setTaskPage, retryTaskPage, subscribeJob } = useJobTracking()
const job = computed<JobDetail | null>(() => {
  const snapshot = snapshots[props.jobId]
  if (snapshot?.snapshotLoaded) return snapshot
  const providedJob = props.jobSnapshot
  if (providedJob && !('snapshotLoaded' in providedJob && providedJob.snapshotLoaded === false)) return providedJob
  return null
})
const detailLoadFailed = computed(() => snapshots[props.jobId]?.detailLoadFailed === true)
const detailReady = computed(() => snapshots[props.jobId]?.detailLoaded === true)
const loading = computed(() => !job.value && !detailLoadFailed.value)
const tasks = computed(() => taskSnapshots[props.jobId] ?? [])
const taskPage = computed(() => taskPages[props.jobId] ?? { page: 1, pageSize: 10, total: 0, loading: false, error: false, sortOrder: 'descend' as const })
const metadata = computed(() => job.value?.metadata ?? {})
const hasMetadata = computed(() => Object.keys(metadata.value).length > 0)

watch([() => props.jobId, () => props.visible], ([jobId, visible], _previous, onCleanup) => {
  if (!visible) return
  ensureLoaded()
  const release = subscribeJob(jobId)
  onCleanup(release)
}, { immediate: true })
watch(() => job.value, detail => {
  if (hasAuditTableReference(detail?.metadata)) void ensureAuditTablesLoaded()
}, { immediate: true })

const jobHistory = computed(() => job.value?.history ?? [])
const operation = computed(() => jobOperation(job.value?.metadata))
const operationLabel = computed(() => jobOperationLabel(operation.value, t))
const unknownOperationToken = computed(() => operation.value.state === 'unknown' ? operation.value.token : '')
const businessName = computed(() => {
  const current = job.value
  if (!current) return ''
  if (operationLabel.value) return operationLabel.value
  return jobTypeLabel(current.jobType, t) || t('job.workbench.global.typePending')
})
const businessObjects = computed(() => jobBusinessObjects(job.value?.metadata, algorithmsById.value))
const errorLabel = computed(() => jobErrorLabel(job.value?.errorCode, t))
const canCancel = computed(() => {
  const status = job.value?.status?.toLowerCase()
  return (status === 'pending' || status === 'running') && !isJobRecovering(job.value)
})

const facts = computed(() => {
  const current = job.value
  if (!current) return []
  const rows: Array<{ key: string; label: string; value: string; mono?: boolean }> = [
    { key: 'jobType', label: t('job.type'), value: jobTypeLabel(current.jobType, t) },
    { key: 'initiator', label: t('job.initiator'), value: formatUserIdentity(current.initiator) },
    { key: 'dataOwner', label: t('job.dataOwner'), value: formatUserIdentity(current.dataOwner) },
    { key: 'createdAt', label: t('job.createdAt'), value: formatDateTime(current.createdAtMs) },
    { key: 'startedAt', label: t('job.startedAt'), value: formatDateTime(current.startedAtMs) },
    { key: 'endedAt', label: t('job.endedAt'), value: formatDateTime(current.endedAtMs) },
    { key: 'duration', label: t('job.duration'), value: formatJobDuration(current.totalDurationMs) },
  ]
  if (jobHasCryptographicVerification(current.jobType, current.metadata)) {
    const verification = jobVerification(current.metadata)
    rows.push({
      key: 'verification',
      label: t('job.workbench.verification'),
      value: t(verification === true
        ? 'job.workbench.verificationTrue'
        : verification === false
          ? 'job.workbench.verificationFalse'
          : 'job.workbench.verificationUnknown'),
    })
  }
  if (current.errorCode && current.errorCode !== 'None') {
    rows.push({ key: 'errorCode', label: t('job.errorCode'), value: current.errorCode, mono: true })
  }
  if (typeof current.maintenanceRecovery === 'string' && current.maintenanceRecovery) {
    rows.push({
      key: 'maintenanceRecovery',
      label: t('execution.maintenance.recoveryState'),
      value: maintenanceRecoveryLabel(current.maintenanceRecovery, t),
    })
  }
  return rows
})

function openExecution() {
  if (!job.value) return
  void router.push(executionRoute(job.value.jobId))
}

function openReport() {
  if (!job.value) return
  void router.push(reportRoute(job.value.jobId))
}

const taskRowProps = (row: TaskSummary) => ({
  style: 'cursor: pointer',
  tabindex: '0',
  onClick: () => emit('taskClick', row, job.value),
  onKeydown: (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    emit('taskClick', row, job.value)
  },
})

const taskColumns = computed<DataTableColumns<TaskSummary>>(() => {
  const columns: DataTableColumns<TaskSummary> = [
    {
      title: t('job.taskId'),
      key: 'taskId',
      minWidth: 150,
      ellipsis: { tooltip: true },
      render: (row: TaskSummary) => h('span', { class: 'cell-mono' }, row.taskId),
    },
    {
      title: t('job.status'),
      key: 'status',
      minWidth: 90,
      render: (row: TaskSummary) => h(
        NTag,
        { type: jobStatusTagType(row.status), size: 'small', bordered: false },
        () => taskStatusLabel(row.status, t),
      ),
    },
    {
      title: t('job.type'),
      key: 'taskType',
      minWidth: 90,
      render: (row: TaskSummary) => jobTypeLabel(row.taskType, t),
    },
    {
      title: t('job.taskSubType'),
      key: 'taskSubType',
      minWidth: 110,
      render: (row: TaskSummary) => row.taskSubType || '-',
    },
    {
      title: t('job.submittedAt'),
      key: 'submittedAtMs',
      minWidth: 150,
      sorter: 'default',
      sortOrder: taskPage.value.sortOrder,
      render: (row: TaskSummary) => formatDateTime(row.submittedAtMs),
    },
    {
      title: t('job.message'),
      key: 'statusMessage',
      minWidth: 170,
      render: (row: TaskSummary) => h('div', { class: 'task-message' }, [
        h(JobStatusMessage, { message: row.statusMessage }),
      ]),
    },
    {
      title: t('job.actions'),
      key: 'actions',
      width: 110,
      render: (row: TaskSummary) => h(
        NButton,
        {
          size: 'tiny',
          quaternary: true,
          type: 'primary',
          onClick: (event: Event) => {
            event.stopPropagation()
            emit('taskClick', row, job.value)
          },
        },
        () => t('job.workbench.openTask'),
      ),
    },
  ]
  if (!props.compact) return columns
  return columns.filter(column => !('key' in column)
    || !['taskType', 'taskSubType', 'statusMessage'].includes(String(column.key)))
})

function handleTaskSortChange(sorter: DataTableSortState | null) {
  if (sorter?.columnKey && sorter.columnKey !== 'submittedAtMs') return
  const sortOrder = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  setTaskPage(props.jobId, 1, taskPage.value.pageSize, sortOrder)
}
</script>

<style scoped>
.job-detail-panel {
  min-width: 0;
}

.job-detail-compact {
  min-width: 0;
  max-width: 480px;
}

.job-detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4);
  min-width: 0;
}

.job-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-4);
  padding-bottom: var(--apple-space-4);
  border-bottom: 1px solid var(--apple-border);
  min-width: 0;
}

.job-summary__copy {
  min-width: 0;
}

.job-summary__eyebrow {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  line-height: 1.4;
}

.job-summary__title {
  margin: 2px 0 var(--apple-space-2);
  color: var(--apple-gray-1);
  font-size: 20px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.015em;
  overflow-wrap: anywhere;
}

.job-summary__tags {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  flex: 0 0 auto;
}

.job-id-value {
  display: inline-block;
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono);
  font-size: 12px;
  word-break: break-all;
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--apple-space-3) var(--apple-space-4);
  margin: 0;
}

.fact {
  min-width: 0;
}

.fact dt {
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.4;
}

.fact dd {
  margin: 2px 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.fact-mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}


.job-section {
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
  min-width: 0;
}

.job-section__title {
  margin: 0 0 var(--apple-space-3);
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
}

.job-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-2);
  margin-bottom: var(--apple-space-3);
}

.job-section__head .job-section__title {
  margin: 0;
}

.job-message {
  max-height: 240px;
  overflow: auto;
  padding: var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  font-size: 12px;
  line-height: 1.55;
}

.job-warning,
.job-muted {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.job-warning {
  padding: var(--apple-space-2) var(--apple-space-3);
  border: 1px solid var(--apple-orange);
  border-radius: var(--apple-radius);
  color: var(--apple-orange);
}

.job-muted {
  color: var(--apple-gray-3);
}

.section-alert {
  margin-bottom: var(--apple-space-3);
}

.history-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--apple-space-2);
  min-width: 0;
}
.job-history-scroll {
  max-height: min(36vh, 320px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}


.job-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  padding-top: var(--apple-space-4);
  border-top: 1px solid var(--apple-border);
}

.scope-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}
.raw-metadata__content {
  max-height: min(52vh, 480px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.task-message {
  max-height: 56px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
}

:deep(.cell-mono) {
  font-family: var(--apple-font-mono, monospace);
  font-size: 12px;
}


@media (max-width: 640px) {
  .job-summary {
    flex-direction: column;
    gap: var(--apple-space-2);
  }

  .job-summary__tags {
    justify-content: flex-start;
  }
}

</style>
