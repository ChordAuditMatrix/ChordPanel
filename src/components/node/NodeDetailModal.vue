<template>
  <n-modal v-model:show="show" preset="card" :title="t('node.detailNodeId', { id: node?.nodeId ?? '' })" :style="{ width: modalWidth, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto' }" :bordered="true">
    <div v-if="node" class="node-detail">
      <!-- Basic info -->
      <n-divider title-placement="left" style="margin-top: 0;">{{ t('node.basicInfo') }}</n-divider>
      <n-descriptions :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('node.nodeId')">{{ node.nodeId }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.instanceId')">{{ node.nodeInstanceId || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.role')">{{ node.role }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.availability')">
          <n-tag :type="node.liveness?.isAvailable ? 'success' : 'error'" size="small" :bordered="false">
            {{ node.liveness?.isAvailable ? t('node.available') : t('node.unavailable') }}
          </n-tag>
        </n-descriptions-item>
        <n-descriptions-item :label="t('node.state')">{{ node.runtimeState?.state ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.stateReason')">{{ node.runtimeState?.stateReason || '-' }}</n-descriptions-item>
      </n-descriptions>

      <!-- Connection info -->
      <n-divider title-placement="left">{{ t('node.connection') }}</n-divider>
      <n-descriptions :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('node.address')">{{ node.endpoint?.host }}:{{ node.endpoint?.port }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.transport')">{{ node.endpoint?.transport || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.advertiseAddress')">{{ node.endpoint?.advertiseHost || '-' }}:{{ node.endpoint?.advertisePort || '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.livenessPolicy')">{{ node.liveness?.policyType ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.lastSeen')">{{ formatTime(node.liveness?.lastSeenAt) }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.lastReport')">{{ formatTime(node.runtimeState?.lastReportAt) }}</n-descriptions-item>
      </n-descriptions>

      <!-- Runtime status -->
      <n-divider title-placement="left">{{ t('node.runtimeStatus') }}</n-divider>
      <n-descriptions :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('node.cpuUsage')">
          <span :class="{ 'stat-warn': (node.runtimeState?.cpuUsage ?? 0) > 80 }">
            {{ (node.runtimeState?.cpuUsage ?? 0).toFixed(1) }}%
          </span>
        </n-descriptions-item>
        <n-descriptions-item :label="t('node.memoryUsage')">
          <span :class="{ 'stat-warn': (node.runtimeState?.memoryUsage ?? 0) > 80 }">
            {{ (node.runtimeState?.memoryUsage ?? 0).toFixed(1) }}%
          </span>
        </n-descriptions-item>
        <n-descriptions-item :label="t('node.currentLoad')">{{ ((node.runtimeState?.currentLoad ?? 0) * 100).toFixed(1) }}%</n-descriptions-item>
        <n-descriptions-item :label="t('node.queueDepth')">{{ node.runtimeState?.queueDepth ?? 0 }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.activeTasks')">{{ node.runtimeState?.activeTaskCount ?? 0 }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.maxConcurrency')">{{ node.capabilities?.maxConcurrentTasks ?? '-' }}</n-descriptions-item>
      </n-descriptions>

      <!-- Capabilities info -->
      <n-divider title-placement="left">{{ t('node.capabilities') }}</n-divider>
      <n-descriptions :column="2" label-placement="left" bordered size="small">
        <n-descriptions-item :label="t('node.maxFrameSize')">{{ formatBytes(node.capabilities?.maxFrameSize) }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.maxInFlight')">{{ node.capabilities?.maxInFlightRequests ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.supportsDirectTransfer')">{{ node.capabilities?.supportsDirectTransfer ? t('node.yes') : t('node.no') }}</n-descriptions-item>
        <n-descriptions-item :label="t('node.supportsLease')">{{ node.capabilities?.supportsLease ? t('node.yes') : t('node.no') }}</n-descriptions-item>
      </n-descriptions>
      <div v-if="node.capabilities?.supportedTaskTypes?.length" class="task-types">
        <span class="task-types-label">{{ t('node.supportedTaskTypes') }}:</span>
        <n-tag v-for="tt in node.capabilities.supportedTaskTypes" :key="tt" size="small" :bordered="false" style="margin: 2px 4px;">
          {{ tt }}
        </n-tag>
      </div>

      <!-- Active task list -->
      <template v-if="node.tasks && node.tasks.length > 0">
        <n-divider title-placement="left">{{ t('node.activeTasksCount', { n: node.tasks.length }) }}</n-divider>
        <n-data-table
          :columns="taskColumns"
          :data="node.tasks"
          size="small"
          :bordered="false"
          :max-height="200"
          :row-props="(row: any) => ({ style: 'cursor: pointer;', onClick: () => handleTaskClick(row) })"
        />
      </template>

      <!-- Action buttons -->
      <n-divider title-placement="left">{{ t('node.operations') }}</n-divider>
      <div class="action-row">
        <n-button
          :type="node.runtimeState?.state === 'BusyDraining' ? 'warning' : 'default'"
          :loading="actionLoading"
          :disabled="node.runtimeState?.state === 'BusyDraining'"
          style="flex: 1;"
          @click="handleDrain"
        >
          {{ node.runtimeState?.state === 'BusyDraining' ? t('node.drainingNode') : t('node.drainNode') }}
        </n-button>
        <n-button
          type="success"
          :loading="actionLoading"
          :disabled="node.runtimeState?.state !== 'BusyDraining'"
          style="flex: 1;"
          @click="handleResume"
        >
          {{ t('node.resumeNode') }}
        </n-button>
      </div>
    </div>
  </n-modal>

  <!-- Subtask list modal -->
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
        :row-props="(row: any) => ({ style: 'cursor: pointer', onClick: () => currentTask = row })"
      />
      <n-empty v-else :description="t('node.noTaskDetail')" />
    </n-spin>
  </n-modal>

  <TaskDetailModal :task="currentTask" @close="currentTask = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import { NTag } from 'naive-ui'
import { getNodeDetail, drainNode, resumeNode } from '@/api/system'
import { getJobTasks, type TaskSummary } from '@/api/job'
import type { NodeDetail } from './types'
import { formatTime, formatBytes } from './types'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import TaskDetailModal from '@/components/TaskDetailModal.vue'

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
const actionLoading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const taskColumns = computed(() => [
  { title: t('node.requestId'), key: 'requestId', ellipsis: { tooltip: true }, minWidth: 100 },
  { title: t('node.type'), key: 'taskType', minWidth: 70 },
  { title: t('node.jobId'), key: 'jobId', ellipsis: { tooltip: true }, minWidth: 100 },
  { title: t('node.status'), key: 'status', minWidth: 80, render: (row: any) => {
    const type = row.status === 'Running' ? 'info' : row.status === 'Succeeded' ? 'success' : row.status === 'Failed' ? 'error' : 'default'
    return h(NTag, { size: 'small', type, bordered: false }, { default: () => row.status })
  }},
  { title: t('node.startedAt'), key: 'startedAt', minWidth: 120, render: (row: any) => formatTime(row.startedAtMs ?? row.startedAt ?? row.startTime) },
])

// When nodeId changes, open the modal and fetch details
watch(() => props.nodeId, async (id) => {
  if (id) {
    show.value = true
    await fetchNodeDetail(id)
    // Poll periodically while the modal is open
    startPolling(id)
  } else {
    show.value = false
    stopPolling()
    node.value = null
  }
})

// Clear state when the modal closes
watch(show, (val) => {
  if (!val) {
    stopPolling()
    emit('close')
  }
})

async function fetchNodeDetail(id: string) {
  try {
    const detail = await getNodeDetail(id)
    node.value = (detail as any) as NodeDetail
  } catch (e) {
    console.error('Failed to fetch node detail', e)
  }
}

function startPolling(id: string) {
  stopPolling()
  pollTimer = setInterval(() => fetchNodeDetail(id), 5000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function handleTaskClick(row: any) {
  if (row.jobId) {
    currentJobId.value = row.jobId
    showTaskDetail.value = true
    fetchJobTasks(row.jobId)
  }
}

const showTaskDetail = ref(false)
const currentJobId = ref('')
const currentTask = ref<TaskSummary | null>(null)
const taskDetailItems = ref<any[]>([])
const taskDetailLoading = ref(false)
const taskColumnsForDetail = computed(() => [
  { title: t('node.taskId'), key: 'taskId', ellipsis: { tooltip: true }, minWidth: 140 },
  { title: t('node.type'), key: 'taskType', minWidth: 70 },
  { title: t('node.status'), key: 'status', minWidth: 80, render: (row: any) => {
    const type = row.status === 'Running' ? 'info' : row.status === 'Succeeded' ? 'success' : row.status === 'Failed' ? 'error' : 'default'
    return h(NTag, { size: 'small', type, bordered: false }, { default: () => row.status })
  }},
  { title: t('node.startedAt'), key: 'startedAt', minWidth: 140, render: (row: any) => formatTime(row.startedAtMs ?? row.startedAt) },
])

async function fetchJobTasks(jobId: string) {
  taskDetailLoading.value = true
  try {
    const res: any = await getJobTasks(jobId, { pageSize: 100 })
    taskDetailItems.value = res?.items ?? res?.data ?? []
  } catch (e) {
    console.error('Failed to fetch job tasks', e)
    taskDetailItems.value = []
  } finally {
    taskDetailLoading.value = false
  }
}

async function handleDrain() {
  if (!node.value) return
  actionLoading.value = true
  try {
    await drainNode(node.value.nodeId, { reason: '1', allowPeerRequests: false })
    await fetchNodeDetail(node.value.nodeId)
  } catch (e) {
    console.error('Drain failed', e)
  } finally {
    actionLoading.value = false
  }
}

async function handleResume() {
  if (!node.value) return
  actionLoading.value = true
  try {
    await resumeNode(node.value.nodeId, { reason: '1' })
    await fetchNodeDetail(node.value.nodeId)
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

.task-types {
  margin-top: 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.task-types-label {
  font-size: 12px;
  opacity: 0.5;
  margin-right: 4px;
}

.action-row {
  display: flex;
  gap: 12px;
}

.stat-warn {
  color: #FF3B30;
}
</style>
