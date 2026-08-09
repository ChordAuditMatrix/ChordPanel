<template>
  <n-spin :show="loading">
    <div v-if="nodes.length === 0 && !loading" style="text-align: center; padding: 24px;">
      {{ t('node.noData') }}
    </div>
    <div class="node-list-wrap" :class="{ 'scrollable': nodes.length > 6 }">
      <div class="node-list-inner" :class="{ 'centered': nodes.length <= 6 }">
        <div v-for="node in nodes" :key="node.nodeId" class="node-card" @click="selectedNodeId = node.nodeId">
          <div class="node-top">
            <span class="node-dot" :class="node.liveness?.isAvailable ? 'dot-ok' : 'dot-err'"></span>
            <span class="node-name">{{ node.nodeId }}</span>
            <span class="node-role-tag">{{ node.role }}</span>
          </div>
          <div class="node-body">
            <ArcGauge
              :value="(node.runtimeState?.currentLoad ?? 0) * 100"
              :label="t('node.load')"
              unit="%"
              width="72px"
              height="64px"
              compact
            />
            <div class="node-stats">
              <div>{{ t('node.cpu') }} <span class="stat-val">{{ (node.runtimeState?.cpuUsage ?? 0).toFixed(1) }}%</span></div>
              <div>{{ t('node.memory') }} <span class="stat-val" :class="{ 'stat-warn': (node.runtimeState?.memoryUsage ?? 0) > 80 }">{{ (node.runtimeState?.memoryUsage ?? 0).toFixed(1) }}%</span></div>
              <div>{{ t('node.tasks') }} <span class="stat-val">{{ node.runtimeState?.activeTaskCount ?? 0 }}/{{ node.capabilities?.maxConcurrentTasks ?? '-' }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-spin>

  <NodeDetailModal :node-id="selectedNodeId" @close="selectedNodeId = null" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getNodes, getNodeDetail } from '@/api/system'
import { useTheme } from '@/stores/theme'
import { useSettings } from '@/stores/settings'
import { useI18n } from '@/stores/i18n'
import ArcGauge from '@/components/ArcGauge.vue'
import NodeDetailModal from './NodeDetailModal.vue'
import type { NodeDetail } from './types'

const { isDark } = useTheme()
// isDark is used for theme switching via v-bind() in <style>
void isDark
const { settings } = useSettings()
const { t } = useI18n()

const nodes = ref<NodeDetail[]>([])
const loading = ref(false)
const selectedNodeId = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

async function fetchNodes() {
  loading.value = true
  try {
    const res = await getNodes({ pageSize: 100 })
    const items = (res as any)?.items ?? []
    if (items.length > 0) {
      const details = await Promise.all(
        items.map((n: any) => getNodeDetail(n.nodeId).catch(() => null))
      )
      nodes.value = details.filter(d => d !== null).map(d => (d as any) as NodeDetail)
    } else {
      nodes.value = []
    }
  } catch (e) {
    console.error('Failed to fetch nodes', e)
    nodes.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchNodes()
  timer = setInterval(fetchNodes, settings.value.pollInterval)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.node-list-wrap {
  width: 100%;
}

.node-list-wrap.scrollable {
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, 0.3) transparent;
}

.node-list-wrap.scrollable::-webkit-scrollbar {
  width: 6px;
}

.node-list-wrap.scrollable::-webkit-scrollbar-track {
  background: transparent;
}

.node-list-wrap.scrollable::-webkit-scrollbar-thumb {
  background-color: rgba(128, 128, 128, 0.3);
  border-radius: 3px;
}

.node-list-wrap.scrollable::-webkit-scrollbar-thumb:hover {
  background-color: rgba(128, 128, 128, 0.5);
}

.node-list-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
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
    transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 300ms ease,
    background 200ms ease,
    border-color 200ms ease;
}

.node-card:hover {
  background: v-bind(isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)');
  border-color: v-bind(isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
  transform: translateY(-2px);
  box-shadow: v-bind(isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.06)');
}

.node-card:active {
  transform: scale(0.98);
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

.dot-ok { background: #34C759; color: #34C759; }
.dot-err { background: #FF3B30; color: #FF3B30; }

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

.stat-warn {
  color: #FF3B30;
}
</style>
