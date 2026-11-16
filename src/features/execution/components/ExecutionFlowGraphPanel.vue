<template>
  <section class="flow-graph">
    <header class="flow-graph__header">
      <div class="flow-graph__titles">
        <h3>{{ t('execution.flowGraph.title') }}</h3>
        <p v-if="flowId" class="flow-graph__flow">{{ flowId }}</p>
      </div>
      <div class="flow-graph__actions">
        <n-button
          v-if="flowId"
          size="small"
          tertiary
          :loading="state.loading"
          @click="reload"
        >
          {{ state.loaded ? t('common.refresh') : t('execution.flowGraph.load') }}
        </n-button>
        <n-button v-if="state.hasMore" size="small" secondary :loading="state.loading" @click="loadMore">
          {{ t('execution.flowGraph.loadMore') }}
        </n-button>
      </div>
    </header>

    <p class="flow-graph__description">{{ t('execution.flowGraph.description') }}</p>

    <p v-if="!flowId" class="flow-graph__state" :class="`flow-graph__state--${flowState.kind}`">
      {{ flowStateText }}
    </p>

    <template v-else>
      <p v-if="readMeta" class="flow-graph__read-meta">{{ readMeta }}</p>

      <div v-if="state.coverage" class="flow-graph__meta">
        <n-tag size="small" :bordered="false" :type="coverageTagType">
          {{ coverageStateLabel(state.coverage, t) }}
        </n-tag>
        <span>{{ t('execution.flowGraph.nodeCount', { count: state.jobNodes.length }) }}</span>
        <span>{{ t('execution.flowGraph.edgeCount', { count: state.parentEdges.length }) }}</span>
      </div>

      <ul v-if="state.reasons.length" class="flow-graph__reasons">
        <li v-for="reason in state.reasons" :key="reason">{{ coverageReasonLabel(reason, t) }}</li>
      </ul>

      <GraphUnavailableNotice
        v-if="flowUnavailable"
        :error="state.error"
      />
      <p v-else-if="state.error" class="flow-graph__error">{{ errorMessage }}</p>

      <p v-if="!state.loaded && !state.loading && !state.error" class="flow-graph__empty">
        {{ t('execution.flowGraph.idle') }}
      </p>
      <p v-else-if="state.loaded && state.jobNodes.length === 0" class="flow-graph__empty">
        {{ t('execution.flowGraph.empty') }}
      </p>

      <section v-if="canvasLayout.nodes.length" class="flow-graph__canvas-block">
        <h4>{{ t('execution.flowGraph.canvas.title') }}</h4>
        <p class="flow-graph__canvas-note">{{ t('execution.flowGraph.canvas.description') }}</p>
        <p class="flow-graph__canvas-legend">
          <span class="flow-graph__swatch" aria-hidden="true" />
          <span>{{ t('execution.flowGraph.canvas.legend') }}</span>
        </p>
        <div
          :id="scrollRegionId"
          class="flow-graph__canvas-scroll"
          role="region"
          tabindex="0"
          :aria-label="t('execution.flowGraph.canvas.scrollRegion', { width: canvasLayout.width })"
        >
          <svg
            class="flow-graph__canvas"
            :width="canvasLayout.width"
            :height="canvasLayout.height"
            :viewBox="`0 0 ${canvasLayout.width} ${canvasLayout.height}`"
            role="img"
            :aria-labelledby="canvasTitleId"
            :aria-describedby="canvasDescriptionId"
          >
            <title :id="canvasTitleId">{{ canvasSummary }}</title>
            <desc :id="canvasDescriptionId">{{ canvasDescription }}</desc>
            <defs>
              <marker
                :id="`${canvasUid}-arrow`"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path class="flow-arrow-head" d="M0,0 L8,4 L0,8 Z" />
              </marker>
            </defs>

            <g class="flow-edges">
              <g
                v-for="edge in canvasLayout.edges"
                :key="edge.id"
                :class="{
                  'flow-edge--selected': selectedJobId !== null
                    && (edge.from === selectedJobId || edge.to === selectedJobId),
                }"
              >
                <title>{{ flowEdgeText(edge) }}</title>
                <path
                  class="flow-edge"
                  :d="edge.path"
                  :marker-end="`url(#${canvasUid}-arrow)`"
                />
              </g>
            </g>

            <g class="flow-canvas-nodes">
              <g
                v-for="node in canvasLayout.nodes"
                :key="node.jobId"
                class="flow-canvas-node"
                :class="{ 'flow-canvas-node--selected': node.jobId === selectedJobId }"
                :transform="`translate(${node.x} ${node.y})`"
                role="button"
                tabindex="0"
                :aria-pressed="node.jobId === selectedJobId"
                :aria-label="flowNodeAltText(node)"
                @click="selectJob(node.jobId)"
                @keydown.enter.prevent="selectJob(node.jobId)"
                @keydown.space.prevent="selectJob(node.jobId)"
              >
                <rect
                  class="flow-canvas-node__box"
                  :width="FLOW_NODE_WIDTH"
                  :height="FLOW_NODE_HEIGHT"
                  rx="7"
                />
                <rect class="flow-canvas-node__stripe" x="0" y="6" width="3" :height="FLOW_NODE_HEIGHT - 12" rx="1.5" />
                <text class="flow-canvas-node__kind" x="10" y="16">{{ t('execution.flowGraph.canvas.jobNode') }}</text>
                <text class="flow-canvas-node__id" x="10" y="32">{{ truncateJobId(node.jobId) }}</text>
                <text class="flow-canvas-node__status" x="10" y="47">
                  {{ jobStatusLabel(node.node.status, t) }}
                </text>
                <text
                  v-if="parentNote(node)"
                  class="flow-canvas-node__parent"
                  x="10"
                  y="63"
                >
                  {{ parentNote(node) }}
                </text>
              </g>
            </g>
          </svg>
        </div>

        <p v-if="canvasLayout.parentOutsideLoadedCount" class="flow-graph__canvas-note">
          {{ t('execution.flowGraph.canvas.parentOutside', { count: canvasLayout.parentOutsideLoadedCount }) }}
        </p>
        <p v-if="canvasLayout.parentLoadedWithoutPageEdgeCount" class="flow-graph__canvas-note">
          {{ t('execution.flowGraph.canvas.parentWithoutEdge', { count: canvasLayout.parentLoadedWithoutPageEdgeCount }) }}
        </p>
        <p v-if="canvasLayout.skippedEdgeCount" class="flow-graph__canvas-note">
          {{ t('execution.flowGraph.canvas.skippedEdges', { count: canvasLayout.skippedEdgeCount }) }}
        </p>
        <p class="flow-graph__canvas-note">{{ t('execution.flowGraph.canvas.selectHint') }}</p>

        <ul class="sr-only" :aria-label="t('execution.flowGraph.canvas.textAlternative')">
          <li v-for="node in canvasLayout.nodes" :key="`alt:${node.jobId}`">{{ flowNodeAltText(node) }}</li>
          <li v-for="edge in canvasLayout.edges" :key="`alt:${edge.id}`">{{ flowEdgeText(edge) }}</li>
        </ul>
      </section>

      <section
        v-if="selectedNode && selectedNavigation"
        class="flow-graph__selection"
        role="region"
        :aria-label="t('execution.flowGraph.selection.title')"
      >
        <header class="flow-graph__selection-head">
          <div class="flow-graph__selection-title">
            <span class="mono">{{ selectedNode.jobId }}</span>
            <n-tag size="small" :bordered="false" :type="statusTagType(selectedNode.node.status)">
              {{ jobStatusLabel(selectedNode.node.status, t) }}
            </n-tag>
          </div>
          <n-button size="tiny" secondary @click="openJob(selectedNode.jobId)">
            {{ t('execution.flowGraph.selection.openJob') }}
          </n-button>
        </header>

        <dl class="flow-graph__fields">
          <div v-if="selectedNode.node.jobOperation">
            <dt>{{ t('execution.flowGraph.operation') }}</dt>
            <dd>{{ selectedNode.node.jobOperation }}</dd>
          </div>
          <div v-if="selectedNode.node.errorCode !== 'None'">
            <dt>{{ t('execution.flowGraph.errorCode') }}</dt>
            <dd>{{ selectedNode.node.errorCode }}</dd>
          </div>
          <div>
            <dt>{{ t('execution.flowGraph.createdAt') }}</dt>
            <dd>{{ formatDateTime(selectedNode.node.createdAtMs) }}</dd>
          </div>
          <div>
            <dt>{{ t('execution.flowGraph.revision') }}</dt>
            <dd>{{ selectedNode.node.revision ?? t('execution.notAvailable') }}</dd>
          </div>
        </dl>

        <div class="flow-graph__selection-block">
          <p class="flow-graph__selection-subtitle">{{ t('execution.flowGraph.selection.parent') }}</p>
          <p v-if="!selectedNavigation.parentJobId" class="flow-graph__selection-empty">
            {{ t('execution.flowGraph.selection.parentNone') }}
          </p>
          <div v-else class="flow-graph__selection-row">
            <button
              type="button"
              class="flow-graph__nav-button"
              @click="openJob(selectedNavigation.parentJobId)"
            >
              <span class="mono">{{ selectedNavigation.parentJobId }}</span>
              <span class="flow-graph__nav-action">{{ t('execution.flowGraph.selection.openParent') }}</span>
            </button>
            <span v-if="selectedNavigation.parentRelationProven" class="flow-graph__muted">
              {{ t('execution.flowGraph.selection.parentProven') }}
            </span>
            <span v-else-if="selectedNavigation.parentLoaded" class="flow-graph__muted">
              {{ t('execution.flowGraph.selection.parentLoadedNoEdge') }}
            </span>
            <span v-else class="flow-graph__muted">
              {{ t('execution.flowGraph.selection.parentOutsideLoaded') }}
            </span>
          </div>
        </div>

        <div class="flow-graph__selection-block">
          <p class="flow-graph__selection-subtitle">{{ t('execution.flowGraph.selection.children') }}</p>
          <p v-if="!selectedNavigation.childJobIds.length" class="flow-graph__selection-empty">
            {{ t('execution.flowGraph.selection.childrenNone') }}
          </p>
          <ul v-else class="flow-graph__child-list">
            <li v-for="childJobId in selectedNavigation.childJobIds" :key="childJobId">
              <button
                type="button"
                class="flow-graph__nav-button"
                @click="openJob(childJobId)"
              >
                <span class="mono">{{ childJobId }}</span>
                <span class="flow-graph__nav-action">{{ t('execution.flowGraph.selection.openChild') }}</span>
              </button>
              <span
                v-if="selectedNavigation.childFieldOnlyJobIds.includes(childJobId)"
                class="flow-graph__muted"
              >
                {{ t('execution.flowGraph.selection.childFieldOnly') }}
              </span>
              <span v-else class="flow-graph__muted">
                {{ t('execution.flowGraph.selection.childProven') }}
              </span>
            </li>
          </ul>
          <p class="flow-graph__selection-empty">{{ t('execution.flowGraph.selection.childrenBounded') }}</p>
        </div>
      </section>

      <ol v-if="state.jobNodes.length" class="flow-graph__nodes">
        <li
          v-for="node in state.jobNodes"
          :key="node.jobId"
          class="flow-graph__node"
          :class="{ 'flow-graph__node--selected': node.jobId === selectedJobId }"
        >
          <button type="button" class="flow-graph__node-main" @click="selectJob(node.jobId)">
            <span class="flow-graph__job-id">{{ node.jobId }}</span>
            <n-tag size="small" :bordered="false" :type="statusTagType(node.status)">
              {{ jobStatusLabel(node.status, t) }}
            </n-tag>
            <span v-if="node.terminal" class="flow-graph__flag">{{ t('execution.flowGraph.terminal') }}</span>
          </button>
          <dl class="flow-graph__fields">
            <div v-if="node.jobOperation">
              <dt>{{ t('execution.flowGraph.operation') }}</dt>
              <dd>{{ node.jobOperation }}</dd>
            </div>
            <div v-if="node.errorCode !== 'None'">
              <dt>{{ t('execution.flowGraph.errorCode') }}</dt>
              <dd>{{ node.errorCode }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.flowGraph.parent') }}</dt>
              <dd>{{ node.parentJobId ?? t('execution.notAvailable') }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.flowGraph.createdAt') }}</dt>
              <dd>{{ formatDateTime(node.createdAtMs) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.flowGraph.revision') }}</dt>
              <dd>{{ node.revision ?? t('execution.notAvailable') }}</dd>
            </div>
          </dl>
          <span
            v-if="canvasNodeByJobId.get(node.jobId)?.parentOutsideLoadedPages"
            class="flow-graph__parent-flag"
          >
            {{ t('execution.flowGraph.canvas.parentOutsideShort') }}
          </span>
          <span
            v-else-if="canvasNodeByJobId.get(node.jobId)?.parentLoadedWithoutPageEdge"
            class="flow-graph__parent-flag"
          >
            {{ t('execution.flowGraph.canvas.parentWithoutEdgeShort') }}
          </span>
          <n-button size="tiny" quaternary @click="openJob(node.jobId)">
            {{ t('execution.flowGraph.selection.openJob') }}
          </n-button>
        </li>
      </ol>

      <p class="flow-graph__note">{{ t('execution.flowGraph.pagingNote') }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { getFlowTraceGraph } from '@/api/trace'
import { type ExecutionFlowIdentity } from '@/features/execution/data/executionFlowIdentity'
import { readGraphUnavailable } from '@/features/execution/data/graphAvailability'
import {
  createTraceFlowGraphModel,
  createTraceFlowGraphState,
} from '@/features/execution/data/traceFlowGraphModel'
import {
  buildTraceFlowGraphNavigation,
  findTraceFlowGraphNodeNavigation,
} from '@/features/execution/data/traceFlowGraphNavigation'
import { useExecutionFlowGraphRead } from '@/features/execution/useExecutionFlowGraphRead'
import GraphUnavailableNotice from '@/features/execution/components/GraphUnavailableNotice.vue'
import {
  FLOW_CANVAS_NODE_HEIGHT,
  FLOW_CANVAS_NODE_WIDTH,
  layoutTraceFlowGraphCanvas,
  type TraceFlowGraphCanvasEdge,
  type TraceFlowGraphCanvasNode,
} from '@/features/execution/data/traceFlowGraphLayout'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { coverageReasonLabel, coverageStateLabel, jobStatusLabel } from '@/utils/statusLabels'

const props = defineProps<{
  /**
   * Flow identity of the current Job. Only `flow` renders a graph; the other
   * states state what is unknown instead of claiming the Job has no flow.
   */
  flowState: ExecutionFlowIdentity
  /** Direct flow identity for a panel used outside the Job page. */
  flowId?: string | null
}>()

const emit = defineEmits<{
  /** A Job node was chosen; the parent routes it through the existing Job page. */
  (event: 'select', jobId: string): void
}>()

const { t } = useI18n()
const state = reactive(createTraceFlowGraphState(null))
// Background panel: a failure stays inside this section instead of opening the
// global error modal.
const model = createTraceFlowGraphModel({ getFlowTraceGraph }, state, { silent: true })

const FLOW_NODE_WIDTH = FLOW_CANVAS_NODE_WIDTH
const FLOW_NODE_HEIGHT = FLOW_CANVAS_NODE_HEIGHT
let canvasSequence = 0
const canvasUid = `flow-graph-canvas-${++canvasSequence}`
const canvasTitleId = `${canvasUid}-title`
const canvasDescriptionId = `${canvasUid}-description`
const scrollRegionId = `${canvasUid}-scroll`

const selectedJobId = ref<string | null>(null)

const FLOW_STATE_TEXT_KEYS: Record<Exclude<ExecutionFlowIdentity['kind'], 'flow'>, string> = {
  detailLoading: 'execution.flowGraph.detailLoading',
  detailError: 'execution.flowGraph.detailError',
  detailMissing: 'execution.flowGraph.detailMissing',
  noFlow: 'execution.graph.noFlow',
}

const flowId = computed<string | null>(() => {
  if (props.flowId) return props.flowId
  const identity = props.flowState
  return identity.kind === 'flow' ? identity.flowId : null
})
const { loadedAtMs, refreshedAtMs, applyRead, resetRead } = useExecutionFlowGraphRead({
  flowId,
  graph: state,
})

/**
 * One sentence per unknown identity state. A `flow` identity renders no note:
 * its graph is what the reader needs, not a restatement of the identity.
 */
const flowStateText = computed(() => {
  const identity = props.flowState
  if (identity.kind === 'flow') return ''
  return t(FLOW_STATE_TEXT_KEYS[identity.kind])
})

const readMeta = computed(() => {
  if (loadedAtMs.value == null) {
    return state.loaded ? t('execution.graph.readAtUnknown') : ''
  }
  const loaded = t('execution.graph.loadedAt', { time: formatDateTime(loadedAtMs.value) })
  if (refreshedAtMs.value == null) return loaded
  return `${loaded} · ${t('execution.graph.refreshedAt', { time: formatDateTime(refreshedAtMs.value) })}`
})

const canvasLayout = computed(() => layoutTraceFlowGraphCanvas(state.jobNodes, state.parentEdges))
const navigation = computed(() => buildTraceFlowGraphNavigation(state.jobNodes, state.parentEdges))
const selectedNode = computed(() => selectedJobId.value === null
  ? null
  : canvasLayout.value.nodes.find(node => node.jobId === selectedJobId.value) ?? null)
const selectedNavigation = computed(() => selectedJobId.value === null
  ? null
  : findTraceFlowGraphNodeNavigation(navigation.value, selectedJobId.value))
const canvasNodeByJobId = computed(() => {
  const map = new Map<string, TraceFlowGraphCanvasNode>()
  for (const node of canvasLayout.value.nodes) map.set(node.jobId, node)
  return map
})
const canvasSummary = computed(() => t('execution.flowGraph.canvas.summary', {
  nodes: canvasLayout.value.nodes.length,
  edges: canvasLayout.value.edges.length,
}))
const canvasDescription = computed(() => t('execution.flowGraph.canvas.summaryDescription', {
  count: canvasLayout.value.edges.length,
}))

watch(flowId, (currentFlow) => {
  // Changing the flow identity resets the page set and its local read stamps.
  model.setFlowId(currentFlow)
  selectedJobId.value = null
  resetRead()
}, { immediate: true })

function truncateJobId(value: string, limit = 27): string {
  if (value.length <= limit) return value
  const keep = limit - 1
  const head = Math.ceil(keep / 2)
  const tail = keep - head
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

function parentNote(node: TraceFlowGraphCanvasNode): string {
  if (node.parentOutsideLoadedPages) return t('execution.flowGraph.canvas.parentOutsideShort')
  if (node.parentLoadedWithoutPageEdge) return t('execution.flowGraph.canvas.parentWithoutEdgeShort')
  return ''
}

function flowEdgeText(edge: TraceFlowGraphCanvasEdge): string {
  return t('execution.flowGraph.canvas.edgeAlt', {
    from: edge.fromRef.ref,
    to: edge.toRef.ref,
  })
}

function flowNodeAltText(node: TraceFlowGraphCanvasNode): string {
  let note = parentNote(node)
  if (!note) {
    note = node.node.parentJobId === null
      ? t('execution.flowGraph.canvas.noParent')
      : t('execution.flowGraph.canvas.parentEdgePresent')
  }
  return t('execution.flowGraph.canvas.nodeAlt', {
    job: node.jobId,
    status: jobStatusLabel(node.node.status, t),
    parent: node.node.parentJobId ?? t('execution.notAvailable'),
    note,
  })
}

function statusTagType(status: string): 'default' | 'success' | 'error' {
  if (status === 'Succeeded') return 'success'
  if (status === 'Failed') return 'error'
  return 'default'
}

const coverageTagType = computed<'default' | 'success' | 'warning'>(() => {
  if (state.coverage === 'complete') return 'success'
  if (state.coverage === 'partial') return 'warning'
  return 'default'
})

const errorMessage = computed(() => {
  const error = state.error
  if (error instanceof Error) return error.message
  return String(error)
})

const flowUnavailable = computed(() => readGraphUnavailable(state.error))

function selectJob(jobId: string): void {
  selectedJobId.value = jobId
}

function openJob(jobId: string | null): void {
  if (jobId) emit('select', jobId)
}

async function reload() {
  const requestedFlowId = flowId.value
  if (!requestedFlowId) return
  const outcome = await model.load()
  applyRead(requestedFlowId, outcome)
}

async function loadMore() {
  const requestedFlowId = flowId.value
  if (!requestedFlowId) return
  const outcome = await model.loadMore()
  applyRead(requestedFlowId, outcome)
}

onUnmounted(() => model.dispose())
</script>

<style scoped>
.flow-graph {
  display: grid;
  min-width: 0;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--apple-border);
  border-radius: 10px;
  background: var(--apple-card);
}

.flow-graph__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.flow-graph__titles h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.flow-graph__flow {
  margin: 2px 0 0;
  color: var(--apple-gray-2);
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.flow-graph__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.flow-graph__description,
.flow-graph__note,
.flow-graph__empty,
.flow-graph__error,
.flow-graph__state,
.flow-graph__read-meta {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  line-height: 1.5;
}

.flow-graph__state {
  padding: 8px 10px;
  border: 1px dashed var(--apple-border);
  border-radius: 8px;
}

.flow-graph__state--detailError {
  border-color: color-mix(in srgb, var(--apple-orange) 45%, var(--apple-border));
}

.flow-graph__read-meta {
  color: var(--apple-gray-3);
}

.flow-graph__error {
  color: var(--apple-red, #d03050);
}

.flow-graph__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--apple-gray-2);
  font-size: 11px;
}

.flow-graph__reasons {
  margin: 0;
  padding-left: 16px;
  color: var(--apple-gray-2);
  font-size: 11px;
}

.flow-graph__nodes {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 8px;
  list-style: none;
}

.flow-graph__node {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 12%, var(--apple-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--apple-blue) 3%, var(--apple-card));
}

.flow-graph__node--selected {
  border-color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
}

.flow-graph__node-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.flow-graph__node-main:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.flow-graph__job-id {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.flow-graph__flag {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.flow-graph__fields {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  gap: 4px 16px;
}

.flow-graph__fields div {
  display: flex;
  gap: 5px;
  font-size: 11px;
}

.flow-graph__fields dt {
  color: var(--apple-gray-3);
}

.flow-graph__fields dd {
  margin: 0;
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.flow-graph__selection {
  display: grid;
  gap: 7px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 20%, var(--apple-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--apple-blue) 3%, var(--apple-card));
}

.flow-graph__selection-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.flow-graph__selection-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.flow-graph__selection-block {
  display: grid;
  gap: 4px;
}

.flow-graph__selection-subtitle {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  font-weight: 600;
}

.flow-graph__selection-empty {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.5;
}

.flow-graph__selection-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}

.flow-graph__child-list {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 4px;
  list-style: none;
}

.flow-graph__child-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}

.flow-graph__nav-button {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 22%, var(--apple-border));
  border-radius: 7px;
  background: var(--apple-card);
  color: inherit;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.flow-graph__nav-button:hover {
  border-color: color-mix(in srgb, var(--apple-blue) 50%, var(--apple-border));
}

.flow-graph__nav-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
}

.flow-graph__nav-action {
  color: var(--apple-blue);
  font-size: 10px;
}

.flow-graph__muted {
  color: var(--apple-gray-3);
  font-size: 10px;
}

.flow-graph__canvas-block {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.flow-graph__canvas-block h4 {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}

.flow-graph__canvas-note,
.flow-graph__parent-flag {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.5;
}

.flow-graph__canvas-legend {
  display: flex;
  align-items: center;
  margin: 0;
  gap: 6px;
  color: var(--apple-gray-2);
  font-size: 10px;
}

.flow-graph__swatch {
  display: inline-block;
  width: 22px;
  height: 0;
  border-top: 2px solid var(--apple-blue);
}

.flow-graph__canvas-scroll {
  min-width: 0;
  max-height: 520px;
  overflow: auto;
  border: 1px solid var(--apple-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--apple-gray-1) 2%, var(--apple-card));
  scrollbar-color: var(--apple-gray-5) transparent;
}

.flow-graph__canvas-scroll:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.flow-graph__canvas {
  display: block;
  font-family: var(--apple-font);
}

.flow-edge {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 1.4;
  stroke-linecap: round;
}

.flow-edge--selected .flow-edge {
  stroke-width: 2.4;
}

.flow-arrow-head {
  fill: var(--apple-blue);
}

.flow-canvas-node {
  cursor: pointer;
}

.flow-canvas-node:focus {
  outline: none;
}

.flow-canvas-node:focus-visible .flow-canvas-node__box,
.flow-canvas-node--selected .flow-canvas-node__box {
  stroke: var(--apple-blue);
  stroke-width: 2.2;
}

.flow-canvas-node--selected .flow-canvas-node__box {
  fill: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
}

.flow-canvas-node__box {
  fill: var(--apple-card);
  stroke: var(--apple-gray-6);
  stroke-width: 1;
}

.flow-canvas-node__stripe {
  fill: var(--apple-blue);
}

.flow-canvas-node__kind {
  fill: var(--apple-gray-2);
  font-size: 9px;
  font-weight: 600;
}

.flow-canvas-node__id {
  fill: var(--apple-gray-1);
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
}

.flow-canvas-node__status {
  fill: var(--apple-gray-2);
  font-size: 9px;
}

.flow-canvas-node__parent {
  fill: var(--apple-gray-3);
  font-size: 8px;
}

.mono {
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
