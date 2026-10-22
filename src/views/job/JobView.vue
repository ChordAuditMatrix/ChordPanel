<template>
  <div class="job-view">
    <n-card size="small" :bordered="true">
      <PageToolbar>
        <n-select v-model:value="filterStatus" :placeholder="t('job.filterStatus')" clearable size="small"
          :options="statusOptions" style="width: 140px;" />
        <n-select v-model:value="filterType" :placeholder="t('job.filterType')" clearable size="small"
          :options="typeOptions" style="width: 160px;" />
        <UserSelect v-model="filterOwner" :placeholder="t('job.filterOwnerId')" size="small" style="width: 200px;" />
        <template #actions>
          <n-button size="small" @click="handleRefresh">{{ t('job.refresh') }}</n-button>
        </template>
      </PageToolbar>

      <ServerPagedDataTable
        :columns="jobColumns"
        :remote="true"
        :data="displayJobs"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :row-props="(row: JobSummary) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
        @update:sorter="handleSortChange"
      />
    </n-card>

    <!-- Job detail drawer -->
    <n-drawer v-model:show="showDetail" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
      <n-drawer-content :title="currentJobId ? t('job.detailJob', { id: currentJobId }) : t('job.detail')" closable>
        <JobDetailPanel
          v-if="detailJobId"
          :job-id="detailJobId"
          :visible="showDetail"
          @task-click="openTaskDetail"
          @cancel="handleCancel"
        />
        <template #footer></template>
      </n-drawer-content>
    </n-drawer>

    <TaskDetailModal :task="currentTask" :job="currentTaskJob" @close="closeTaskDetail" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NTag, useMessage } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { getJobs, cancelJob } from '@/api/job'
import type { JobSummary, JobDetail, TaskSummary } from '@/api/job'
import { usePagePolling } from '@/composables/usePagePolling'
import { isJobRecovering, useJobTracking } from '@/stores/jobTracking'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { formatDateTime } from '@/utils/datetime'
import PageToolbar from '@/components/PageToolbar.vue'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import UserSelect from '@/components/UserSelect.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import { jobStatusTagType } from '@/utils/jobStatus'
import { jobTypeLabel } from '@/utils/jobType'

const message = useMessage()
const route = useRoute()
const router = useRouter()
const { register } = usePagePolling()
const { drawerWidth } = useAdaptiveWidth(560)
const { t } = useI18n()
const { ensureLoaded, refresh, formatUserIdentity } = useReferenceCatalog()
const { snapshots, publishJobSnapshots } = useJobTracking()

const loading = ref(false)
const jobs = ref<JobSummary[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const sortOrder = ref<'ascend' | 'descend'>('descend')
let fetchSequence = 0
const displayJobs = computed(() => jobs.value.map(job => snapshots[job.jobId]?.snapshotLoaded ? snapshots[job.jobId] : job))
const currentJobId = ref<string | null>(null)
const detailJobId = ref<string | null>(null)
const showDetail = ref(false)
const currentTask = ref<TaskSummary | null>(null)
const currentTaskJob = ref<JobDetail | null>(null)
const filterStatus = ref<string | null>(null)
const filterType = ref<string | null>(null)
const filterOwner = ref('')

// Status options match the backend's supported Job states.
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


const jobColumns = computed<DataTableColumns<JobSummary>>(() => [
  { title: t('job.jobId'), key: 'jobId', minWidth: 180, ellipsis: { tooltip: true }, render: (r: JobSummary) => h('span', { style: 'font-family: monospace; font-size: 12px' }, r.jobId) },
  { title: t('job.type'), key: 'jobType', minWidth: 70, render: (r: JobSummary) => jobTypeLabel(r.jobType, t) },
  { title: t('job.status'), key: 'status', minWidth: 90, render: (r: JobSummary) => h(NTag, { type: isJobRecovering(r) ? 'warning' : jobStatusTagType(r.status), size: 'small', bordered: false }, () => isJobRecovering(r) ? t('job.statusRecovering') : r.status) },
  { title: t('job.initiator'), key: 'initiator', minWidth: 160, ellipsis: { tooltip: true }, render: (r: JobSummary) => formatUserIdentity(r.initiator) },
  { title: t('job.dataOwner'), key: 'dataOwner', minWidth: 160, ellipsis: { tooltip: true }, render: (r: JobSummary) => formatUserIdentity(r.dataOwner) },
  { title: t('job.durationMs'), key: 'totalDurationMs', minWidth: 90, render: (r: JobSummary) => r.totalDurationMs != null ? `${r.totalDurationMs}` : '-' },
  { title: t('job.createdAt'), key: 'createdAtMs', minWidth: 160, sorter: 'default', sortOrder: sortOrder.value, render: (r: JobSummary) => formatDateTime(r.createdAtMs) },
  {
    title: t('job.actions'), key: 'actions', width: 190,
    render: (r: JobSummary) => h('div', { style: 'display: flex; gap: 6px; flex-wrap: wrap' }, [
      h(NButton, {
        size: 'small',
        type: 'primary',
        ghost: true,
        onClick: (e: Event) => { e.stopPropagation(); openDetail(r) },
      }, () => t('job.detailBtn')),
      // Execution detail is a page, not a drawer: a real focusable button keeps
      // it reachable by keyboard without changing the row-click behavior.
      h(NButton, {
        size: 'small',
        onClick: (e: Event) => { e.stopPropagation(); openExecution(r) },
      }, () => t('job.openExecution')),
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
  loading.value = true
  try {
    const response = await getJobs({
      page: page.value,
      pageSize: pageSize.value,
      status: filterStatus.value || undefined,
      jobType: filterType.value || undefined,
      dataOwnerUserId: filterOwner.value || undefined,
      sortBy: 'createdAtMs',
      ascending: sortOrder.value === 'ascend',
    })
    if (sequence !== fetchSequence) return
    jobs.value = response.items
    total.value = response.total
    publishJobSnapshots(jobs.value)
  } catch (e) {
    if (sequence === fetchSequence) console.error(e)
  } finally {
    if (sequence === fetchSequence) loading.value = false
  }
}

async function openDetail(job: JobSummary) {
  currentJobId.value = job.jobId
  detailJobId.value = job.jobId
  showDetail.value = true
}

/** Navigate to the backend-backed execution page for this Job. */
function openExecution(job: JobSummary) {
  void router.push({ name: 'executionDetail', params: { jobId: job.jobId } })
}

function openTaskDetail(task: TaskSummary, job?: JobDetail | null) {
  currentTaskJob.value = job ?? null
  currentTask.value = task
}

function closeTaskDetail() {
  currentTask.value = null
  currentTaskJob.value = null
}

function handleRefresh() {
  refresh()
  fetchJobs()
}

async function handleCancel(jobId?: string) {
  const id = jobId || detailJobId.value
  if (!id) return
  try {
    await cancelJob(id)
    message.success(t('job.cancelRequested'))
    fetchJobs()
  } catch (e) {
    // axios rejections carry the API error payload; fall back to the locale string
    const detail = e as { response?: { data?: { message?: string } } }
    message.error(detail?.response?.data?.message || t('job.cancelFailed'))
  }
}

// Global polling
watch([filterStatus, filterType, filterOwner, page, pageSize, sortOrder], (current, previous) => {
  const filtersChanged = current[0] !== previous[0] || current[1] !== previous[1] || current[2] !== previous[2]
  const pageChanged = current[3] !== previous[3]
  const pageSizeChanged = current[4] !== previous[4]
  const sortChanged = current[5] !== previous[5]
  if (filtersChanged || pageChanged || pageSizeChanged || sortChanged) {
    jobs.value = []
    if (filtersChanged) total.value = 0
  }
  if ((filtersChanged || pageSizeChanged || sortChanged) && page.value !== 1) {
    page.value = 1
    return
  }
  fetchJobs()
})
onMounted(() => {
  ensureLoaded()
  register(fetchJobs, route.path)
})
</script>

<style scoped>
.job-view { max-width: 1200px; }
</style>
