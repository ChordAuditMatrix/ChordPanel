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
          <n-button size="small" @click="fetchJobs">{{ t('job.refresh') }}</n-button>
        </template>
      </PageToolbar>

      <DataTable :columns="jobColumns" :data="jobs" :loading="loading"
        :row-props="(row: JobSummary) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })" />
    </n-card>

    <!-- Job detail drawer -->
    <n-drawer v-model:show="showDetail" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
      <n-drawer-content :title="currentJobId ? t('job.detailJob', { id: currentJobId }) : t('job.detail')" closable>
        <JobDetailPanel
          v-if="detailJobId"
          :job-id="detailJobId"
          @task-click="openTaskDetail"
          @cancel="handleCancel"
        />
        <template #footer></template>
      </n-drawer-content>
    </n-drawer>

    <TaskDetailModal :task="currentTask" @close="currentTask = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NTag, useMessage } from 'naive-ui'
import { getJobs, cancelJob } from '@/api/job'
import type { JobSummary, TaskSummary } from '@/api/job'
import { usePagePolling } from '@/composables/usePagePolling'
import PageToolbar from '@/components/PageToolbar.vue'
import DataTable from '@/components/DataTable.vue'
import UserSelect from '@/components/UserSelect.vue'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import JobDetailPanel from '@/components/JobDetailPanel.vue'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const route = useRoute()
const { register } = usePagePolling()
const { drawerWidth } = useAdaptiveWidth(560)
const { t } = useI18n()

const loading = ref(false)
const jobs = ref<JobSummary[]>([])
const currentJobId = ref<string | null>(null)
const detailJobId = ref<string | null>(null)
const showDetail = ref(false)
const currentTask = ref<TaskSummary | null>(null)
const filterStatus = ref<string | null>(null)
const filterType = ref<string | null>(null)
const filterOwner = ref('')

// Status options aligned with backend (backend returns Pending/Running/Succeeded/Failed/Canceled)
const statusOptions = computed(() => [
  { label: t('job.statusPending'), value: 'Pending' },
  { label: t('job.statusRunning'), value: 'Running' },
  { label: t('job.statusSucceeded'), value: 'Succeeded' },
  { label: t('job.statusFailed'), value: 'Failed' },
  { label: t('job.statusCanceled'), value: 'CANCELED' },
])
const typeOptions = computed(() => [
  { label: t('job.typeAudit'), value: 'Audit' },
  { label: t('job.typeQuery'), value: 'Query' },
  { label: t('job.typeStorage'), value: 'Storage' },
  { label: t('job.typeReplication'), value: 'Replication' },
])

// Pagination is managed internally by the DataTable component

function statusTagType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const s = status.toLowerCase()
  if (s === 'succeeded' || s === 'completed') return 'success'
  if (s === 'running') return 'info'
  if (s === 'pending') return 'default'
  if (s === 'failed') return 'error'
  if (s === 'canceled' || s === 'cancelled') return 'warning'
  return 'default'
}

function formatTime(t?: string | number) {
  if (!t) return '-'
  const d = new Date(typeof t === 'number' ? t : t.includes('T') ? t : Number(t))
  return isNaN(d.getTime()) ? String(t) : d.toLocaleString('zh-CN')
}

const jobColumns = computed(() => [
  { title: t('job.jobId'), key: 'jobId', minWidth: 180, ellipsis: { tooltip: true }, render: (r: JobSummary) => h('span', { style: 'font-family: monospace; font-size: 12px' }, r.jobId) },
  { title: t('job.type'), key: 'jobType', minWidth: 70, sorter: 'default' },
  { title: t('job.status'), key: 'status', minWidth: 90, sorter: 'default', render: (r: JobSummary) => h(NTag, { type: statusTagType(r.status), size: 'small', bordered: false }, () => r.status) },
  { title: t('job.initiator'), key: 'initiator', minWidth: 100, render: (r: JobSummary) => r.initiator?.userName ?? '-' },
  { title: t('job.durationMs'), key: 'totalDurationMs', minWidth: 90, sorter: 'default', render: (r: JobSummary) => r.totalDurationMs != null ? `${r.totalDurationMs}` : '-' },
  { title: t('job.createdAt'), key: 'createdAtMs', minWidth: 160, sorter: 'default', defaultSortOrder: 'descend', render: (r: JobSummary) => formatTime(r.createdAtMs) },
  {
    title: t('job.actions'), key: 'actions', width: 80,
    render: (r: JobSummary) => h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: (e: Event) => { e.stopPropagation(); openDetail(r) } }, () => t('job.detailBtn')),
  },
])

async function fetchJobs() {
  loading.value = true
  try {
    const res = await getJobs({ pageSize: 1000, status: filterStatus.value || undefined, jobType: filterType.value || undefined, dataOwnerUserId: filterOwner.value || undefined })
    jobs.value = ((res as any)?.items ?? []) as JobSummary[]
  } catch (e) { console.error(e) } finally { loading.value = false }
}

async function openDetail(job: JobSummary) {
  currentJobId.value = job.jobId
  detailJobId.value = job.jobId
  showDetail.value = true
}

function openTaskDetail(task: TaskSummary) {
  currentTask.value = task
}

async function handleCancel(jobId?: string) {
  const id = jobId || detailJobId.value
  if (!id) return
  try {
    await cancelJob(id)
    message.success(t('job.cancelRequested'))
    fetchJobs()
  } catch (e: any) { message.error(e?.response?.data?.message || t('job.cancelFailed')) }
}

// Global polling
watch([filterStatus, filterType, filterOwner], fetchJobs)
onMounted(() => { register(fetchJobs, route.path) })
</script>

<style scoped>
.job-view { max-width: 1200px; }
</style>
