<template>
  <n-drawer v-model:show="show" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }">
    <n-drawer-content :title="t('node.detailNodeId', { id: nodeId ?? '' })" closable>
      <n-spin :show="initialLoading">
        <div v-if="node" class="node-detail">
          <p class="detail-source">{{ t('node.workbench.detailSource') }}</p>
          <div v-if="refreshError" class="detail-stale" role="status">
            {{ t('node.workbench.detailStale', { time: formatTime(nodeLoadedAt) }) }}
          </div>
          <NodeIdentityPanel :node="node" />
          <NodeRuntimePanel :node="node" />
          <NodeContextPanel :node="node" @open-job="openJobTasks" />
          <NodeTaskPanel v-if="node.tasks?.length" :node="node" @task-click="handleTaskClick" />
          <NodeOperationsPanel
            :node="node"
            :loading="actionLoading"
            :notice="operationNotice"
            @drain="handleDrain"
            @resume="handleResume"
            @protocol-events="openProtocolEvents"
          />
        </div>
        <div v-else-if="detailFailed" class="detail-state">
          <p>{{ t('common.requestFailed') }}</p>
          <n-button size="small" @click="retryDetail">{{ t('common.retry') }}</n-button>
        </div>
        <div v-else-if="initialLoading" class="detail-state" role="status">{{ t('common.loading') }}</div>
        <n-empty v-else :description="t('common.noData')" />
      </n-spin>
      <template #footer></template>
    </n-drawer-content>
  </n-drawer>

  <n-modal v-model:show="showTaskDetail" preset="card" :title="t('node.taskList', { id: currentJobId })" :style="{ width: '720px', maxWidth: '92vw' }" :bordered="true">
    <n-spin :show="taskDetailLoading">
      <n-alert v-if="taskPage.error" type="error" :bordered="false" style="margin-bottom: 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>{{ t('job.loadTasksFailed') }}</span>
          <n-button size="tiny" @click="retryTaskPage(currentJobId)">{{ t('common.retry') }}</n-button>
        </div>
      </n-alert>
      <div v-if="currentJobId" class="job-navigation">
        <n-button size="small" @click="openJobPage">{{ t('node.workbench.context.openJobPage') }}</n-button>
        <n-button size="small" @click="openExecution">{{ t('node.workbench.context.openExecution') }}</n-button>
      </div>
      <ServerPagedDataTable
        v-if="taskDetailLoading || taskPage.total > 0"
        :columns="taskColumnsForDetail"
        :remote="true"
        :data="taskDetailItems"
        :loading="taskDetailLoading"
        :page="taskPage.page"
        :page-size="taskPage.pageSize"
        :total="taskPage.total"
        :page-sizes="[10, 20, 50]"
        :row-props="(row: JobTaskRow) => ({ style: 'cursor: pointer', onClick: () => currentTask = row })"
        @update:page="setTaskPage(currentJobId, $event, taskPage.pageSize)"
        @update:page-size="setTaskPage(currentJobId, 1, $event)"
        @update:sorter="handleTaskSortChange"
      />
      <n-empty v-else :description="t('node.noTaskDetail')" />
    </n-spin>
  </n-modal>

  <TaskDetailModal :task="currentTask" :job="currentJob" @close="closeTaskDetail" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { NTag } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { drainNode, resumeNode } from '@/api/system'
import type { JobSummary, TaskSummary } from '@/api/job'
import { useJobTracking } from '@/stores/jobTracking'
import { formatTime, type NodeDetail } from './types'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import ServerPagedDataTable from '@/components/ServerPagedDataTable.vue'
import { jobStatusTagType } from '@/utils/jobStatus'
import NodeIdentityPanel from './NodeIdentityPanel.vue'
import NodeRuntimePanel from './NodeRuntimePanel.vue'
import NodeContextPanel from './NodeContextPanel.vue'
import NodeTaskPanel from './NodeTaskPanel.vue'
import NodeOperationsPanel from './NodeOperationsPanel.vue'
import { nodeDetailLoader } from './nodeDetailStore'
import { nodeJobNavigationRoutes } from './nodeWorkbenchModel'
import type { NodeOperationNotice } from './nodeWorkbenchModel'

type JobTaskRow = TaskSummary & { startedAt?: number | string }

const DETAIL_POLL_INTERVAL_MS = 5000

const router = useRouter()
const { drawerWidth } = useAdaptiveWidth(600)
const { t } = useI18n()

const props = defineProps<{
  nodeId: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', detail: NodeDetail): void
}>()

const show = ref(false)
const actionLoading = ref(false)
const operationNotice = ref<NodeOperationNotice | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const entry = computed(() => props.nodeId ? nodeDetailLoader.entries[props.nodeId] ?? null : null)
const node = computed(() => entry.value?.detail ?? null)
const nodeLoadedAt = computed(() => entry.value?.loadedAt ?? 0)
const initialLoading = computed(() => entry.value?.status === 'loading' && node.value === null)
const detailFailed = computed(() => entry.value?.status === 'error' && node.value === null)
const refreshError = computed(() => entry.value?.status === 'error' && node.value !== null)

watch(() => props.nodeId, async (id, previousId) => {
  if (previousId && previousId !== id) nodeDetailLoader.cancel(previousId)
  if (!id) {
    show.value = false
    stopPolling()
    return
  }
  stopPolling()
  show.value = true
  operationNotice.value = null
  nodeDetailLoader.prune()
  await nodeDetailLoader.load(id)
  if (props.nodeId !== id || !show.value) return
  startPolling(id)
}, { immediate: true })

watch(show, (value) => {
  if (!value) {
    if (props.nodeId) nodeDetailLoader.cancel(props.nodeId)
    operationNotice.value = null
    stopPolling()
    showTaskDetail.value = false
    resetJobContext()
    emit('close')
  }
})

onUnmounted(() => {
  if (props.nodeId) nodeDetailLoader.cancel(props.nodeId)
  stopPolling()
  resetJobContext()
})

function startPolling(id: string) {
  stopPolling()
  if (props.nodeId !== id || !show.value) return
  pollTimer = setInterval(() => {
    if (props.nodeId !== id || !show.value) return
    void nodeDetailLoader.load(id, { force: true })
  }, DETAIL_POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function retryDetail() {
  if (props.nodeId) void nodeDetailLoader.load(props.nodeId, { force: true })
}

function handleTaskClick(row: { jobId?: string }) {
  if (row.jobId) openJobTasks(row.jobId)
}

function openJobTasks(jobId: string) {
  currentJobId.value = jobId
  showTaskDetail.value = true
  fetchJobTasks(jobId)
}

const showTaskDetail = ref(false)
const currentJobId = ref('')
const currentTask = ref<TaskSummary | null>(null)
const { snapshots, taskSnapshots, taskPages, setTaskPage, retryTaskPage, subscribeJob } = useJobTracking()
let releaseTaskJob: (() => void) | null = null
const currentJob = computed<JobSummary | null>(() => currentJobId.value ? snapshots[currentJobId.value] ?? null : null)
const taskDetailItems = computed<JobTaskRow[]>(() => currentJobId.value ? taskSnapshots[currentJobId.value] ?? [] : [])
const taskPage = computed(() => taskPages[currentJobId.value] ?? { page: 1, pageSize: 10, total: 0, loading: false, error: false, sortOrder: 'descend' as const })
const taskDetailLoading = computed(() => taskPage.value.loading)
const taskColumnsForDetail = computed<DataTableColumns<JobTaskRow>>(() => [
  { title: t('node.taskId'), key: 'taskId', ellipsis: { tooltip: true }, minWidth: 140 },
  { title: t('node.type'), key: 'taskType', minWidth: 70 },
  { title: t('node.status'), key: 'status', minWidth: 80, render: (row: JobTaskRow) => h(NTag, { size: 'small', type: jobStatusTagType(row.status), bordered: false }, { default: () => row.status }) },
  { title: t('job.submittedAt'), key: 'submittedAtMs', minWidth: 140, sorter: 'default', sortOrder: taskPage.value.sortOrder, render: (row: JobTaskRow) => formatTime(row.submittedAtMs) },
  { title: t('node.startedAt'), key: 'startedAt', minWidth: 140, render: (row: JobTaskRow) => formatTime(row.startedAtMs ?? row.startedAt) },
])
function handleTaskSortChange(sorter: DataTableSortState | null) {
  if (sorter?.columnKey && sorter.columnKey !== 'submittedAtMs') return
  const sortOrder = sorter?.order === 'ascend' ? 'ascend' : 'descend'
  setTaskPage(currentJobId.value, 1, taskPage.value.pageSize, sortOrder)
}

function resetJobContext() {
  releaseTaskJob?.()
  releaseTaskJob = null
  currentJobId.value = ''
  currentTask.value = null
}

// Closing the subtask list drops the parent Job context (no stale identity on reopen)
watch(showTaskDetail, (val) => {
  if (!val) resetJobContext()
})

function closeTaskDetail() {
  currentTask.value = null
}

function fetchJobTasks(jobId: string) {
  resetJobContext()
  currentJobId.value = jobId
  setTaskPage(jobId, 1, 10)
  releaseTaskJob = subscribeJob(jobId)
}

function openProtocolEvents() {
  const nodeId = node.value?.nodeId
  if (!nodeId) return
  show.value = false
  void router.push({ name: 'events', query: { nodeId } })
}

function openJobPage() {
  if (!currentJobId.value) return
  const jobId = currentJobId.value
  showTaskDetail.value = false
  show.value = false
  void router.push(nodeJobNavigationRoutes(jobId).job)
}

function openExecution() {
  if (!currentJobId.value) return
  const jobId = currentJobId.value
  showTaskDetail.value = false
  show.value = false
  void router.push(nodeJobNavigationRoutes(jobId).execution)
}

async function refreshAfterOperation(nodeId: string) {
  const result = await nodeDetailLoader.load(nodeId, { force: true })
  if (result?.detail) emit('updated', result.detail)
}

async function handleDrain() {
  const nodeId = node.value?.nodeId
  if (!nodeId) return
  actionLoading.value = true
  operationNotice.value = null
  try {
    await drainNode(nodeId, { reason: '1', allowPeerRequests: false })
    operationNotice.value = 'drainRequested'
    await refreshAfterOperation(nodeId)
  } catch (e) {
    console.error('Drain failed', e)
    operationNotice.value = 'drainFailed'
  } finally {
    actionLoading.value = false
  }
}

async function handleResume() {
  const nodeId = node.value?.nodeId
  if (!nodeId) return
  actionLoading.value = true
  operationNotice.value = null
  try {
    await resumeNode(nodeId, { reason: '1' })
    operationNotice.value = 'resumeRequested'
    await refreshAfterOperation(nodeId)
  } catch (e) {
    console.error('Resume failed', e)
    operationNotice.value = 'resumeFailed'
  } finally {
    actionLoading.value = false
  }
}
</script>

<style scoped>
.detail-updated {
  margin: 0 0 10px;
  color: var(--apple-gray-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.detail-stale {
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  color: var(--apple-orange);
  font-size: 12px;
  line-height: 1.5;
}
.detail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 16px;
  color: var(--apple-gray-3);
  font-size: 13px;
  text-align: center;
}
.detail-state p { margin: 0; }
.job-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.detail-source {
  margin: -4px 0 10px;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.5;
}
</style>
