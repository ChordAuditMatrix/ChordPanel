<template>
  <n-modal v-model:show="show" preset="card" :title="t('node.detailNodeId', { id: node?.nodeId ?? '' })" :style="{ width: modalWidth, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto' }" :bordered="true">
    <n-spin :show="nodeLoading">
      <div v-if="node" class="node-detail">
        <NodeIdentityPanel :node="node" />
        <NodeRuntimePanel :node="node" />
        <NodeTaskPanel v-if="node.tasks?.length" :node="node" @task-click="handleTaskClick" />
        <NodeOperationsPanel
          :node="node"
          :loading="actionLoading"
          @drain="handleDrain"
          @resume="handleResume"
          @protocol-events="openProtocolEvents"
        />
      </div>
      <n-empty v-else-if="nodeError" :description="t('common.requestFailed')" />
      <n-empty v-else-if="!nodeLoading" :description="t('common.noData')" />
    </n-spin>
    <n-alert v-if="nodeError && node" type="warning" :bordered="false" style="margin-top: 12px">
      {{ t('common.requestFailed') }}
    </n-alert>
  </n-modal>

  <n-modal v-model:show="showTaskDetail" preset="card" :title="t('node.taskList', { id: currentJobId })" :style="{ width: '720px', maxWidth: '92vw' }" :bordered="true">
    <n-spin :show="taskDetailLoading">
      <n-data-table
        v-if="taskDetailItems.length > 0"
        :columns="taskColumnsForDetail"
        :data="taskDetailItems"
        size="small"
        :bordered="false"
        :max-height="400"
        :pagination="{ pageSize: 10 }"
        :row-props="(row: JobTaskRow) => ({ style: 'cursor: pointer', onClick: () => currentTask = row })"
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
import { getNodeDetail, drainNode, resumeNode } from '@/api/system'
import { getJobTasks, getJobDetail, type JobSummary, type TaskSummary } from '@/api/job'
import { formatTime, parseNodeDetail, type NodeDetail } from './types'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import { jobStatusTagType } from '@/utils/jobStatus'
import NodeIdentityPanel from './NodeIdentityPanel.vue'
import NodeRuntimePanel from './NodeRuntimePanel.vue'
import NodeTaskPanel from './NodeTaskPanel.vue'
import NodeOperationsPanel from './NodeOperationsPanel.vue'

type JobTaskRow = TaskSummary & { startedAt?: number | string }

const router = useRouter()

const { drawerWidth: modalWidth } = useAdaptiveWidth(600)
const { t } = useI18n()

const props = defineProps<{
  nodeId: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const show = ref(false)
const node = ref<NodeDetail | null>(null)
const nodeLoading = ref(false)
const nodeError = ref(false)
const actionLoading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let detailRequestToken = 0


// When nodeId changes, open the modal and fetch details
watch(() => props.nodeId, async (id) => {
  if (id) {
    stopPolling()
    detailRequestToken++
    node.value = null
    nodeError.value = false
    nodeLoading.value = true
    show.value = true
    await fetchNodeDetail(id)
    if (props.nodeId === id && show.value) startPolling(id)
  } else {
    detailRequestToken++
    show.value = false
    stopPolling()
    node.value = null
    nodeLoading.value = false
    nodeError.value = false
  }
})

// Clear state when the modal closes
watch(show, (val) => {
  if (!val) {
    detailRequestToken++
    nodeLoading.value = false
    stopPolling()
    showTaskDetail.value = false
    resetJobContext()
    emit('close')
  }
})

onUnmounted(() => {
  detailRequestToken++
  stopPolling()
  resetJobContext()
})

async function fetchNodeDetail(id: string) {
  const token = ++detailRequestToken
  if (!node.value || node.value.nodeId !== id) {
    nodeLoading.value = true
    nodeError.value = false
  }
  try {
    const detail = await getNodeDetail(id)
    if (token !== detailRequestToken || props.nodeId !== id || !show.value) return
    const parsed = parseNodeDetail(detail)
    if (!parsed) throw new TypeError('Invalid node detail response')
    node.value = parsed
    nodeError.value = false
  } catch (e) {
    if (token === detailRequestToken) {
      nodeError.value = true
      console.error('Failed to fetch node detail', e)
    }
  } finally {
    if (token === detailRequestToken) nodeLoading.value = false
  }
}

function startPolling(id: string) {
  stopPolling()
  if (props.nodeId !== id || !show.value) return
  pollTimer = setInterval(() => { void fetchNodeDetail(id) }, 5000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function handleTaskClick(row: { jobId?: string }) {
  if (row.jobId) {
    currentJobId.value = row.jobId
    showTaskDetail.value = true
    fetchJobTasks(row.jobId)
  }
}

const showTaskDetail = ref(false)
const currentJobId = ref('')
const currentTask = ref<TaskSummary | null>(null)
const currentJob = ref<JobSummary | null>(null)
let jobContextToken = 0
const taskDetailItems = ref<JobTaskRow[]>([])
const taskDetailLoading = ref(false)
const taskColumnsForDetail = computed(() => [
  { title: t('node.taskId'), key: 'taskId', ellipsis: { tooltip: true }, minWidth: 140 },
  { title: t('node.type'), key: 'taskType', minWidth: 70 },
  { title: t('node.status'), key: 'status', minWidth: 80, render: (row: JobTaskRow) => h(NTag, { size: 'small', type: jobStatusTagType(row.status), bordered: false }, { default: () => row.status }) },
  { title: t('node.startedAt'), key: 'startedAt', minWidth: 140, render: (row: JobTaskRow) => formatTime(row.startedAtMs ?? row.startedAt) },
])

function resetJobContext() {
  jobContextToken++
  currentJobId.value = ''
  currentJob.value = null
  currentTask.value = null
  taskDetailItems.value = []
  taskDetailLoading.value = false
}

// Closing the subtask list drops the parent Job context (no stale identity on reopen)
watch(showTaskDetail, (val) => {
  if (!val) resetJobContext()
})

function closeTaskDetail() {
  currentTask.value = null
}

function toJobTaskRows(raw: unknown): JobTaskRow[] {
  if (!raw || typeof raw !== 'object') return []
  const source = 'items' in raw ? raw.items : 'data' in raw ? raw.data : undefined
  // API boundary: /jobs/{jobId}/tasks resolves with TaskSummary-shaped items
  return Array.isArray(source) ? source as JobTaskRow[] : []
}

async function fetchJobTasks(jobId: string) {
  const token = ++jobContextToken
  // Clear the previous job's context before loading so a stale identity can never show
  currentTask.value = null
  currentJob.value = null
  taskDetailItems.value = []
  taskDetailLoading.value = true
  try {
    const [tasksRaw, jobDetail] = await Promise.all([
      getJobTasks(jobId, { pageSize: 100 }),
      getJobDetail(jobId).catch(() => null),
    ])
    if (token !== jobContextToken) return
    taskDetailItems.value = toJobTaskRows(tasksRaw)
    // API boundary: axios resolves with the Job DTO payload
    currentJob.value = (jobDetail as unknown as JobSummary | null) ?? null
  } catch (e) {
    if (token === jobContextToken) taskDetailItems.value = []
    console.error('Failed to fetch job tasks', e)
  } finally {
    if (token === jobContextToken) taskDetailLoading.value = false
  }
}

function openProtocolEvents() {
  const nodeId = node.value?.nodeId
  if (!nodeId) return
  show.value = false
  void router.push({ name: 'events', query: { nodeId } })
}

async function handleDrain() {
  if (!node.value) return
  const nodeId = node.value.nodeId
  actionLoading.value = true
  try {
    await drainNode(nodeId, { reason: '1', allowPeerRequests: false })
    await fetchNodeDetail(nodeId)
  } catch (e) {
    console.error('Drain failed', e)
  } finally {
    actionLoading.value = false
  }
}

async function handleResume() {
  if (!node.value) return
  const nodeId = node.value.nodeId
  actionLoading.value = true
  try {
    await resumeNode(nodeId, { reason: '1' })
    await fetchNodeDetail(nodeId)
  } catch (e) {
    console.error('Resume failed', e)
  } finally {
    actionLoading.value = false
  }
}
</script>

<style scoped>
.node-detail {
  max-height: 70vh;
  overflow-y: auto;
}
</style>
