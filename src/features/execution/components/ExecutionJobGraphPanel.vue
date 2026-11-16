<template>
  <section ref="root" class="job-graph">
    <header class="job-graph__header">
      <div>
        <h3>{{ t('execution.graph.title') }}</h3>
        <p class="job-graph__description">{{ t('execution.graph.description') }}</p>
      </div>
      <div class="job-graph__actions">
        <n-button v-if="!graph.loaded" size="small" secondary :loading="graph.loading" @click="emit('load')">
          {{ t('execution.graph.load') }}
        </n-button>
        <n-button v-else size="small" tertiary :loading="graph.loading" @click="emit('refresh')">
          {{ t('common.refresh') }}
        </n-button>
      </div>
    </header>

    <p v-if="readMeta" class="job-graph__read-meta">{{ readMeta }}</p>

    <GraphUnavailableNotice
      v-if="graphUnavailable"
      :error="graph.error"
    />
    <p v-else-if="graph.error" class="job-graph__error">{{ errorMessage }}</p>
    <p v-else-if="!graph.loaded && !graph.loading" class="job-graph__hint">{{ t('execution.graph.idle') }}</p>

    <template v-if="graph.loaded">
      <div class="job-graph__coverage">
        <div v-for="gap in projection.gaps" :key="gap.scope" class="job-graph__coverage-row">
          <span>{{ scopeLabel(gap.scope) }}</span>
          <n-tag size="small" :bordered="false" :type="gap.coverage === 'partial' ? 'warning' : 'default'">
            {{ coverageStateLabel(gap.coverage, t) }}
          </n-tag>
        </div>
        <p v-if="!projection.gaps.length" class="job-graph__hint">{{ t('execution.graph.allComplete') }}</p>
      </div>
      <ul v-if="projection.reasons.length" class="job-graph__reasons">
        <li v-for="reason in projection.reasons" :key="reason">{{ coverageReasonLabel(reason, t) }}</li>
      </ul>

      <dl v-if="graph.job" class="job-graph__facts">
        <div>
          <dt>{{ t('execution.graph.jobStatus') }}</dt>
          <dd>{{ jobStatusLabel(graph.job.status, t) }}</dd>
        </div>
        <div>
          <dt>{{ t('execution.graph.errorCode') }}</dt>
          <dd>{{ graph.job.errorCode }}</dd>
        </div>
        <div>
          <dt>{{ t('execution.graph.terminal') }}</dt>
          <dd>{{ graph.job.terminal ? t('common.yes') : t('common.no') }}</dd>
        </div>
        <div>
          <dt>{{ t('execution.graph.createdAt') }}</dt>
          <dd>{{ formatDateTime(graph.job.createdAtMs) }}</dd>
        </div>
        <div>
          <dt>{{ t('execution.graph.taskReferences') }}</dt>
          <dd>{{ graph.taskReferenceCount ?? t('execution.notAvailable') }}</dd>
        </div>
      </dl>

      <section v-if="canvasLayout.nodes.length" class="job-graph__section">
        <h4>{{ t('execution.graph.canvas.title') }}</h4>
        <ExecutionGraphCanvas
          :layout="canvasLayout"
          :selected-node-id="selectedNodeId"
          :selection="selection"
          @select="selectNode"
          @clear="clearSelection"
          @toggle-group="toggleGroup"
          @focus-evidence="focusEvidence"
        />
      </section>

      <section v-if="unresolvedEdges.length" class="job-graph__section">
        <h4>{{ t('execution.graph.canvas.unresolvedRelations') }}</h4>
        <p class="job-graph__hint">{{ t('execution.graph.canvas.unresolvedListNote') }}</p>
        <ul class="job-graph__rows">
          <li v-for="edge in unresolvedEdges" :key="`unresolved:${edge.id}`" class="job-graph__row">
            <span class="mono">{{ edge.fromRef.ref }}</span>
            <span aria-hidden="true">→</span>
            <span class="mono">{{ edge.toRef?.ref ?? t('execution.graph.canvas.unresolvedReasons.targetMissing') }}</span>
            <span class="job-graph__muted">{{ unresolvedReasonLabel(edge) }}</span>
          </li>
        </ul>
      </section>

      <div class="job-graph__streams">
        <div v-for="name in streamNames" :key="name" class="job-graph__stream">
          <span class="job-graph__stream-name">{{ scopeLabel(name) }}</span>
          <n-tag size="small" :bordered="false" :type="graph.streams[name].coverage === 'complete' ? 'success' : graph.streams[name].coverage === 'partial' ? 'warning' : 'default'">
            {{ coverageStateLabel(graph.streams[name].coverage, t) }}
          </n-tag>
          <span class="job-graph__stream-meta">{{ rowCountLabel(name) }}</span>
          <n-button
            v-if="graph.streams[name].hasMore"
            size="tiny"
            quaternary
            :loading="graph.loading"
            @click="emit('more', name)"
          >
            {{ t('execution.graph.loadMore') }}
          </n-button>
        </div>
      </div>

      <section v-if="graph.taskNodes.length" class="job-graph__section">
        <h4>{{ t('execution.graph.tasks') }}</h4>
        <ul class="job-graph__rows">
          <li
            v-for="node in graph.taskNodes"
            :key="node.referenceIndex"
            class="job-graph__row"
            :class="{ 'job-graph__row--focused': focusedEvidenceKey === `task:${node.referenceIndex}` }"
            :data-evidence="`task:${node.referenceIndex}`"
            tabindex="-1"
          >
            <span class="mono">#{{ node.referenceIndex }}</span>
            <span class="mono">{{ node.taskId ?? t('execution.graph.emptyReference') }}</span>
            <span>{{ node.status ? taskStatusLabel(node.status, t) : t('execution.notAvailable') }}</span>
            <span class="job-graph__muted">{{ taskStatusStateLabel(node.statusState) }}</span>
            <n-tag v-if="node.remoteStopStatus" size="small" :bordered="false" type="warning">
              {{ t('execution.graph.remoteStopUnknown') }}
            </n-tag>
          </li>
        </ul>
      </section>

      <section v-if="graph.partNodes.length" class="job-graph__section">
        <h4>{{ t('execution.graph.parts') }}</h4>
        <ul class="job-graph__rows">
          <li
            v-for="part in graph.partNodes"
            :key="part.nodeId"
            class="job-graph__row"
            :class="{ 'job-graph__row--focused': focusedEvidenceKey === `part:${part.nodeId}` }"
            :data-evidence="`part:${part.nodeId}`"
            tabindex="-1"
          >
            <span class="mono">{{ part.nodeId }}</span>
            <span>{{ part.state ? tracePartStatusLabel(part.state, t) : t('execution.notAvailable') }}</span>
            <span class="job-graph__muted">{{ part.plannedBlockCount }} / {{ part.generatedBlockCount ?? '—' }}</span>
            <span v-if="part.generateTaskRef" class="mono">{{ part.generateTaskRef.ref }}</span>
          </li>
        </ul>
      </section>

      <section v-if="projection.activityPages.length" class="job-graph__section">
        <h4>{{ t('execution.graph.activities') }}</h4>
        <div v-for="page in projection.activityPages" :key="page.pageKey" class="job-graph__activity-page">
          <div class="job-graph__activity-head">
            <span>{{ page.continued ? t('execution.graph.activityContinuedPage') : t('execution.graph.activityFirstPage') }}</span>
            <n-tag size="small" :bordered="false" :type="page.coverage === 'complete' ? 'success' : 'default'">
              {{ coverageStateLabel(page.coverage, t) }}
            </n-tag>
            <span class="job-graph__muted">{{ t('execution.graph.activityFactCount', { count: page.nodeCount }) }}</span>
          </div>
          <p class="job-graph__hint">{{ t('execution.graph.activityFactsOnly') }}</p>
          <ul class="job-graph__rows">
            <li
              v-for="node in activityNodes(page.pageKey)"
              :key="node.nodeId"
              class="job-graph__row"
              :class="{ 'job-graph__row--focused': focusedEvidenceKey === `activity:${page.pageKey}:${node.nodeId}` }"
              :data-evidence="`activity:${page.pageKey}:${node.nodeId}`"
              tabindex="-1"
            >
              <span class="mono">{{ node.activityId }}</span>
              <span>{{ node.activityKind ?? t('execution.notAvailable') }}</span>
              <span>{{ node.lifecycle ?? (node.conflicting ? t('execution.graph.conflicting') : t('execution.notAvailable')) }}</span>
              <span class="job-graph__muted">
                {{ node.terminal ? node.state ?? t('execution.graph.terminal') : t('execution.graph.notTerminal') }}
              </span>
              <span class="job-graph__muted">{{ node.observationCount }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="job-graph__section">
        <h4>{{ t('execution.graph.observations') }}</h4>
        <p class="job-graph__hint">{{ t('execution.graph.observationsNote', { count: graph.observations.length }) }}</p>
      </section>

      <section v-if="graph.edges.length" class="job-graph__section">
        <h4>{{ t('execution.graph.links') }}</h4>
        <ul class="job-graph__rows">
          <li v-for="edge in graph.edges" :key="edge.linkKey" class="job-graph__row">
            <span class="mono">{{ edge.linkKey }}</span>
            <span>{{ edge.linkKind ?? t('execution.notAvailable') }}</span>
            <span class="mono">{{ edge.from.ref }} → {{ edge.to?.ref ?? '—' }}</span>
          </li>
        </ul>
      </section>

      <section v-if="graph.triggerEdges.length" class="job-graph__section">
        <h4>{{ t('execution.graph.triggers') }}</h4>
        <ul class="job-graph__rows">
          <li v-for="edge in graph.triggerEdges" :key="`${edge.ownerId}:${edge.notificationId}:${edge.attempt}`" class="job-graph__row">
            <span class="mono">{{ edge.notificationId }}</span>
            <span>{{ t('execution.graph.triggerAttempt', { attempt: edge.attempt }) }}</span>
            <span class="job-graph__muted">{{ edge.currentAttempt ? t('execution.graph.triggerCurrent') : t('execution.graph.triggerEarlier') }}</span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { TraceGraphActivityNode, TraceGraphStreamName } from '@/api/trace'
import {
  TRACE_GRAPH_STREAM_NAMES,
  type TraceGraphState,
} from '@/features/execution/data/traceGraphModel'
import type { TraceGraphProjection } from '@/features/execution/data/traceGraphProjection'
import {
  layoutTraceGraphCanvas,
  type TraceGraphCanvasGroupKind,
  type TraceGraphCanvasUnresolvedEdge,
} from '@/features/execution/data/traceGraphCanvasLayout'
import {
  describeTraceGraphNode,
  type TraceGraphEvidenceTarget,
} from '@/features/execution/data/traceGraphNodeDetail'
import { readGraphUnavailable } from '@/features/execution/data/graphAvailability'
import ExecutionGraphCanvas from '@/features/execution/components/ExecutionGraphCanvas.vue'
import GraphUnavailableNotice from '@/features/execution/components/GraphUnavailableNotice.vue'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import {
  coverageReasonLabel,
  coverageStateLabel,
  jobStatusLabel,
  taskStatusLabel,
  tracePartStatusLabel,
} from '@/utils/statusLabels'

const props = defineProps<{
  /** The session's graph slice; the panel never opens its own session. */
  graph: TraceGraphState
  projection: TraceGraphProjection
  /** Local moment the first page of this Job's graph settled. */
  loadedAtMs?: number | null
  /** Local moment a later read settled; `null` until the user refreshes. */
  refreshedAtMs?: number | null
}>()

const emit = defineEmits<{
  (event: 'load'): void
  (event: 'more', stream: TraceGraphStreamName): void
  (event: 'refresh'): void
  /** A selected node's evidence row exists outside this panel; the page routes it. */
  (event: 'open-evidence', target: TraceGraphEvidenceTarget, key: string): void
}>()

const { t } = useI18n()
const streamNames = TRACE_GRAPH_STREAM_NAMES
const root = ref<HTMLElement | null>(null)
const collapsedGroups = ref<TraceGraphCanvasGroupKind[]>([])
const selectedNodeId = ref<string | null>(null)
const focusedEvidenceKey = ref<string | null>(null)

const canvasLayout = computed(() => layoutTraceGraphCanvas(props.projection, {
  collapsed: collapsedGroups.value,
}))
const unresolvedEdges = computed(() => canvasLayout.value.unresolvedEdges)
const selection = computed(() => selectedNodeId.value === null
  ? null
  : describeTraceGraphNode(canvasLayout.value, selectedNodeId.value, props.graph.provenance))

const readMeta = computed(() => {
  if (props.loadedAtMs == null) {
    return props.graph.loaded ? t('execution.graph.readAtUnknown') : ''
  }
  const loaded = t('execution.graph.loadedAt', { time: formatDateTime(props.loadedAtMs) })
  if (props.refreshedAtMs == null) return loaded
  return `${loaded} · ${t('execution.graph.refreshedAt', { time: formatDateTime(props.refreshedAtMs) })}`
})

const graphUnavailable = computed(() => readGraphUnavailable(props.graph.error))

const errorMessage = computed(() => {
  const error = props.graph.error
  if (error instanceof Error) return error.message
  return String(error)
})

// A folded group or a new page can remove the selected node; the selection is
// then cleared instead of describing a row the drawing no longer holds.
watch(canvasLayout, (layout) => {
  if (selectedNodeId.value === null) return
  if (!layout.nodes.some(node => node.id === selectedNodeId.value)) {
    selectedNodeId.value = null
    focusedEvidenceKey.value = null
  }
})

function selectNode(nodeId: string): void {
  selectedNodeId.value = nodeId
  focusedEvidenceKey.value = null
}

function clearSelection(): void {
  selectedNodeId.value = null
  focusedEvidenceKey.value = null
}

function toggleGroup(group: TraceGraphCanvasGroupKind): void {
  const existing = collapsedGroups.value
  collapsedGroups.value = existing.includes(group)
    ? existing.filter(candidate => candidate !== group)
    : [...existing, group]
}

/**
 * Jump to the evidence row a selected node names. The row is the same fact the
 * canvas states; the panel only scrolls and focuses it.
 */
async function focusEvidence(target: TraceGraphEvidenceTarget, key: string): Promise<void> {
  focusedEvidenceKey.value = key
  emit('open-evidence', target, key)
  await nextTick()
  const candidates = root.value?.querySelectorAll<HTMLElement>('[data-evidence]')
  const element = candidates
    ? Array.from(candidates).find(candidate => candidate.dataset.evidence === key)
    : undefined
  if (!element) return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  element.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  element.focus({ preventScroll: true })
}

function scopeLabel(scope: TraceGraphStreamName | 'job'): string {
  return t(`execution.graph.scopes.${scope}`)
}

function rowCountLabel(stream: TraceGraphStreamName): string {
  const count = stream === 'tasks'
    ? props.graph.taskNodes.length
    : stream === 'parts'
      ? props.graph.partNodes.length
      : stream === 'observations'
        ? props.graph.observations.length
        : stream === 'activities'
          ? props.graph.activityPages.reduce((total, page) => total + page.nodes.length, 0)
          : stream === 'edges'
            ? props.graph.edges.length
            : props.graph.triggerEdges.length
  return t('execution.graph.rowCount', { count })
}

function activityNodes(pageKey: string): TraceGraphActivityNode[] {
  return props.graph.activityPages.find(page => page.pageKey === pageKey)?.nodes ?? []
}

const TASK_STATUS_STATE_KEYS: Record<string, string> = {
  available: 'execution.graph.taskStatusState.available',
  missingRow: 'execution.graph.taskStatusState.missingRow',
  unattributedRow: 'execution.graph.taskStatusState.unattributedRow',
  foreignRow: 'execution.graph.taskStatusState.foreignRow',
  storeUnavailable: 'execution.graph.taskStatusState.storeUnavailable',
  invalidReference: 'execution.graph.taskStatusState.invalidReference',
}

function taskStatusStateLabel(state: string): string {
  const key = TASK_STATUS_STATE_KEYS[state]
  return key ? t(key) : state
}

const UNRESOLVED_REASON_KEYS: Record<string, string> = {
  targetMissing: 'execution.graph.canvas.unresolvedReasons.targetMissing',
  endpointNotLoaded: 'execution.graph.canvas.unresolvedReasons.endpointNotLoaded',
  ambiguousReference: 'execution.graph.canvas.unresolvedReasons.ambiguousReference',
}

function unresolvedReasonLabel(edge: TraceGraphCanvasUnresolvedEdge): string {
  return t(UNRESOLVED_REASON_KEYS[edge.reason] ?? 'execution.graph.canvas.unresolved')
}
</script>

<style scoped>
.job-graph {
  display: grid;
  min-width: 0;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--apple-border);
  border-radius: 10px;
  background: var(--apple-card);
}

.job-graph__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.job-graph__header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.job-graph__description,
.job-graph__hint,
.job-graph__error,
.job-graph__read-meta {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 11px;
  line-height: 1.5;
}

.job-graph__read-meta {
  color: var(--apple-gray-3);
}

.job-graph__error {
  color: var(--apple-red, #d03050);
}

.job-graph__coverage {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.job-graph__coverage-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.job-graph__reasons {
  margin: 0;
  padding-left: 16px;
  color: var(--apple-gray-2);
  font-size: 11px;
}

.job-graph__facts {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  gap: 4px 16px;
}

.job-graph__facts div {
  display: flex;
  gap: 5px;
  font-size: 11px;
}

.job-graph__facts dt {
  color: var(--apple-gray-3);
}

.job-graph__facts dd {
  margin: 0;
  color: var(--apple-gray-1);
}

.job-graph__streams {
  display: grid;
  gap: 4px;
}

.job-graph__stream {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.job-graph__stream-name {
  min-width: 84px;
  color: var(--apple-gray-2);
}

.job-graph__stream-meta,
.job-graph__muted {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.job-graph__section {
  display: grid;
  gap: 5px;
}

.job-graph__section h4 {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}

.job-graph__rows {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 3px;
  list-style: none;
}

.job-graph__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--apple-blue) 3%, transparent);
  font-size: 11px;
}

.job-graph__row--focused {
  outline: 2px solid var(--apple-blue);
  outline-offset: 1px;
  background: color-mix(in srgb, var(--apple-blue) 9%, transparent);
}

.job-graph__activity-page {
  display: grid;
  gap: 4px;
  padding: 6px 8px;
  border: 1px dashed color-mix(in srgb, var(--apple-blue) 18%, var(--apple-border));
  border-radius: 8px;
}

.job-graph__activity-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.mono {
  font-family: var(--apple-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
</style>
