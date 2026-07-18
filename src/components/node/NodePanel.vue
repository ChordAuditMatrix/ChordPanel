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

/* When there are few nodes, center them and auto-distribute spacing (space-evenly spreads them out) */
.node-list-inner.centered {
  justify-content: space-evenly;
  gap: 20px;
}

/* When there are many nodes, arrange compactly with fixed spacing */
.node-list-inner:not(.centered) {
  justify-content: flex-start;
  gap: 8px;
}

.node-card {
  border-radius: 8px;
  padding: 8px 12px;
  background: v-bind(isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)');
  border: 1px solid v-bind(isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)');
  flex: 0 0 auto;
  width: fit-content;
  transition: background 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}

.node-card:hover {
  background: v-bind(isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)');
  border-color: v-bind(isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)');
}

.node-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 4px;
}

.node-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-ok { background: #36D399; }
.dot-err { background: #F87272; }

.node-name {
  font-weight: 600;
  font-size: 12px;
}

.node-role-tag {
  font-size: 9px;
  opacity: 0.4;
  margin-left: 6px;
}

.node-body {
  display: flex;
  gap: 8px;
  align-items: center;
}

.node-stats {
  font-size: 10px;
  opacity: 0.6;
  line-height: 1.6;
}

.stat-val {
  font-weight: 600;
  opacity: 1;
}

.stat-warn {
  color: #F87272;
}
</style>
