<template>
  <n-spin :show="loading">
    <div v-if="error && nodes.length > 0" class="node-refresh-error" role="status">{{ t('common.requestFailed') }}</div>
    <div v-if="nodes.length === 0 && !loading" style="text-align: center; padding: 24px;">
      {{ error ? t('common.requestFailed') : t('node.noData') }}
    </div>
    <div class="node-list-wrap">
      <div class="node-list-inner" :class="{ 'centered': nodes.length <= 6 }">
        <div
          v-for="node in nodes"
          :key="node.nodeId"
          class="node-card"
          role="button"
          tabindex="0"
          @click="selectedNodeId = node.nodeId"
          @keydown.enter.prevent="selectedNodeId = node.nodeId"
          @keydown.space.prevent="selectedNodeId = node.nodeId"
        >
          <div class="node-top">
            <span class="node-dot" role="img" :aria-label="availabilityLabel(node.liveness?.isAvailable)" :class="availabilityClass(node.liveness?.isAvailable)"></span>
            <span class="node-name">{{ node.nodeId }}</span>
            <span class="node-role-tag">{{ node.role ?? '-' }}</span>
          </div>
          <div class="node-body">
            <ArcGauge
              v-if="node.runtimeState && typeof node.runtimeState.currentLoad === 'number' && Number.isFinite(node.runtimeState.currentLoad)"
              :value="node.runtimeState.currentLoad * 100"
              :label="t('node.load')"
              unit="%"
              width="72px"
              height="64px"
              compact
            />
            <span v-else class="node-load-unavailable" :aria-label="t('common.noData')">-</span>
            <div class="node-stats">
              <div>{{ t('node.cpu') }} <span class="stat-val">{{ percentage(node.runtimeState?.cpuUsage) }}</span></div>
              <div>{{ t('node.memory') }} <span class="stat-val" :class="{ 'stat-warn': exceedsThreshold(node.runtimeState?.memoryUsage) }">{{ percentage(node.runtimeState?.memoryUsage) }}</span></div>
              <div>{{ t('node.tasks') }} <span class="stat-val">{{ count(node.runtimeState?.activeTaskCount) }}/{{ count(node.capabilities?.maxConcurrentTasks) }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
      <div class="pagination">
        <span>{{ t('common.totalItems', { n: total }) }}</span>
        <n-pagination
          :page="page"
          :page-size="pageSize"
          :item-count="total"
          :page-sizes="[10, 20, 50]"
          show-size-picker
          @update:page="changePage"
          @update:page-size="changePageSize"
        />
    </div>
  </n-spin>

  <NodeDetailModal :node-id="selectedNodeId" @close="selectedNodeId = null" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getNodes, getNodeDetail, type NodeSummary } from '@/api/system'
import { useTheme } from '@/stores/theme'
import { useSettings } from '@/stores/settings'
import { useI18n } from '@/stores/i18n'
import ArcGauge from '@/components/ArcGauge.vue'
import NodeDetailModal from './NodeDetailModal.vue'
import {
  parseNodeDetail,
  formatNodePercentage as percentage,
  formatNodeCount as count,
  isNodeMetricHigh as exceedsThreshold,
  type NodeDetail,
} from './types'

const { isDark } = useTheme()
// isDark is used for theme switching via v-bind() in <style>
void isDark
const { settings } = useSettings()
const { t } = useI18n()

function availabilityClass(value: boolean | undefined): string {
  return value === true ? 'dot-ok' : value === false ? 'dot-err' : 'dot-unknown'
}

function availabilityLabel(value: boolean | undefined): string {
  return value === true ? t('node.available') : value === false ? t('node.unavailable') : t('common.noData')
}
function isNodeSummary(value: unknown): value is NodeSummary {
  return value !== null && typeof value === 'object' && 'nodeId' in value && typeof value.nodeId === 'string'
}

const nodes = ref<NodeDetail[]>([])
const loading = ref(false)
const error = ref(false)
const selectedNodeId = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let requestSequence = 0

function changePage(nextPage: number) {
  page.value = nextPage
  nodes.value = []
  error.value = false
  void fetchNodes(true)
}

function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  nodes.value = []
  error.value = false
  void fetchNodes(true)
}

async function fetchNodes(showLoading = false) {
  const sequence = ++requestSequence
  loading.value = showLoading || (nodes.value.length === 0 && !error.value)
  try {
    const response = await getNodes({ page: page.value, pageSize: pageSize.value })
    if (sequence !== requestSequence) return
    const rawItems: unknown[] = response.items
    const items = rawItems.filter(isNodeSummary)
    if (typeof response.total !== 'number' || !Number.isFinite(response.total)) {
      throw new TypeError('Invalid node list response')
    }
    total.value = response.total
    const pageCount = response.totalPages || Math.ceil(response.total / pageSize.value)
    const lastPage = Math.max(1, pageCount)
    if (page.value > lastPage) {
      page.value = lastPage
      nodes.value = []
      void fetchNodes(true)
      return
    }
    const details = await Promise.all(items.map(node => getNodeDetail(node.nodeId).then(parseNodeDetail).catch(() => null)))
    if (sequence !== requestSequence) return
    nodes.value = details.filter((detail): detail is NodeDetail => detail !== null)
    error.value = items.length !== rawItems.length || details.some(detail => detail === null)
  } catch (e) {
    if (sequence !== requestSequence) return
    console.error('Failed to fetch nodes', e)
    error.value = true
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

onMounted(() => {
  void fetchNodes()
  timer = setInterval(() => { void fetchNodes() }, settings.value.pollInterval)
})

onUnmounted(() => {
  requestSequence++
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.node-list-wrap {
  width: 100%;
}

.node-list-inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 10px;
}

.node-list-inner.centered {
  justify-content: space-evenly;
  gap: 20px;
}
.node-list-inner:not(.centered) {
  justify-content: flex-start;
  gap: 10px;
}

/* ── Apple-style node card ── */
.node-card {
  border-radius: 14px;
  padding: 12px 14px;
  background: v-bind(isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)');
  border: 1px solid v-bind(isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
  flex: 0 0 auto;
  width: fit-content;
  cursor: pointer;
  transition:
    transform var(--apple-dur) var(--apple-spring),
    box-shadow var(--apple-dur) var(--apple-ease-out),
    background-color var(--apple-dur-fast) var(--apple-ease-out),
    border-color var(--apple-dur-fast) var(--apple-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .node-card:hover {
    background: v-bind(isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)');
    border-color: v-bind(isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
    transform: translateY(-2px);
    box-shadow: v-bind(isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.06)');
  }
}

.node-card:focus-visible {
  outline: 2px solid var(--apple-blue, #0071E3);
  outline-offset: 2px;
}

.node-card:active {
  transform: scale(0.97);
}

.node-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-bottom: 6px;
}

.node-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
}

.dot-ok { background: var(--apple-green); color: var(--apple-green); }
.dot-err { background: var(--apple-red); color: var(--apple-red); }
.dot-unknown { background: var(--apple-gray-4, #8E8E93); color: var(--apple-gray-4, #8E8E93); }

.node-name {
  font-weight: 600;
  font-size: 12px;
  color: var(--apple-gray-1, #1D1D1F);
  letter-spacing: -0.01em;
}

.node-role-tag {
  font-size: 9px;
  font-weight: 600;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 980px;
  background: v-bind(isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)');
  color: var(--apple-gray-3, #6E6E73);
}

.node-body {
  display: flex;
  gap: 10px;
  align-items: center;
}
.node-load-unavailable { width: 72px; text-align: center; color: var(--apple-gray-3, #6E6E73); font-size: 12px; }

.node-stats {
  font-size: 10px;
  color: var(--apple-gray-3, #6E6E73);
  line-height: 1.7;
  font-weight: 500;
}

.stat-val {
  font-weight: 600;
  color: var(--apple-gray-1, #1D1D1F);
  font-variant-numeric: tabular-nums;
}

.stat-warn { color: var(--apple-red); }
 .node-refresh-error { padding: 0 12px; color: var(--apple-red); font-size: 12px; }

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.pagination :deep(.n-pagination) {
  max-width: 100%;
}

@media (max-width: 639px) {
  .pagination { justify-content: center; }
}
</style>
