<template>
  <section
    class="tag-generation-canvas"
    :aria-label="t('execution.tagGeneration.canvas.partGrid')"
    :aria-busy="loading || undefined"
  >
    <p v-if="error" class="state-block error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !stages.length" class="state-block" role="status">
      {{ t('execution.loading') }}
    </p>

    <div class="canvas-section">
      <div class="section-head">
        <h3 class="section-title">{{ t('execution.tagGeneration.canvas.phases') }}</h3>
        <span class="section-note">{{ t('execution.tagGeneration.canvas.phaseNote') }}</span>
      </div>
      <ol v-if="stages.length" class="phase-flow">
        <li v-for="stage in stages" :key="stage.id" class="phase-item">
          <button
            type="button"
            class="phase-button"
            :class="{ selected: stage.id === selectedStageId, failure: stage.hasFailureEvidence }"
            :aria-pressed="stage.id === selectedStageId"
            :disabled="loading"
            @click="toggleStage(stage)"
          >
            <span class="phase-index mono">{{ stage.index + 1 }}</span>
            <span class="phase-body">
              <span class="phase-label">{{ t(stage.labelKey) }}</span>
              <span class="phase-meta">
                <span class="status-dot" :class="stage.status" aria-hidden="true"></span>
                <span>{{ statusText(stage) }}</span>
                <span v-if="stage.evidence.length" class="phase-count mono">{{ stage.evidence.length }}</span>
                <span v-if="stage.hasFailureEvidence" class="phase-failure">
                  {{ t('execution.stages.failure') }}
                </span>
              </span>
            </span>
          </button>
        </li>
      </ol>
      <p v-else class="muted">{{ t('execution.stages.empty') }}</p>
    </div>
    <div class="canvas-section">
      <div class="section-head">
        <h3 class="section-title">{{ t('execution.tagGeneration.canvas.processBoard') }}</h3>
        <span class="section-note">{{ t('execution.tagGeneration.canvas.logicalFlow') }}</span>
      </div>
      <div class="process-board">
        <section class="process-lane">
          <p class="process-role">{{ t('execution.topology.admin') }}</p>
          <h4>{{ t('execution.tagGeneration.canvas.planStage') }}</h4>
          <div class="lane-stage">
            <span class="status-dot" :class="stageStatus('layout')" aria-hidden="true"></span>
            <span>{{ t('execution.stages.tagGeneration.layout') }}</span>
            <span class="lane-status">{{ stageStatusText('layout') }}</span>
          </div>
          <div class="lane-stage">
            <span class="status-dot" :class="stageStatus('plan')" aria-hidden="true"></span>
            <span>{{ t('execution.stages.tagGeneration.plan') }}</span>
            <span class="lane-status">{{ stageStatusText('plan') }}</span>
          </div>
          <dl class="lane-facts">
            <div>
              <dt>{{ t('execution.tagGeneration.plannedParts') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.plannedPartCount ?? null) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.plannedBlocks') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.plannedBlockCount ?? null) }}</dd>
            </div>
          </dl>
        </section>
        <div class="process-arrow" aria-hidden="true">→</div>
        <section class="process-lane process-lane-audit">
          <p class="process-role">{{ t('execution.topology.audit') }}</p>
          <h4>{{ t('execution.tagGeneration.canvas.computeStage') }}</h4>
          <div class="lane-stage">
            <span class="status-dot" :class="stageStatus('generation')" aria-hidden="true"></span>
            <span>{{ t('execution.stages.tagGeneration.generation') }}</span>
            <span class="lane-status">{{ stageStatusText('generation') }}</span>
          </div>
          <p class="lane-note">{{ t('execution.tagGeneration.canvas.loadedParts', { count: parts.length }) }}</p>
          <p class="lane-note">{{ t('execution.tagGeneration.canvas.gridNote') }}</p>
          <dl class="lane-facts">
            <div>
              <dt>{{ t('execution.tagGeneration.canvas.generatedTotal') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.generatedBlockCount ?? null) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.completedParts') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.completedPartCount ?? null) }}</dd>
            </div>
          </dl>
        </section>
        <div class="process-arrow" aria-hidden="true">→</div>
        <section class="process-lane">
          <p class="process-role">{{ t('execution.topology.storage') }}</p>
          <h4>{{ t('execution.tagGeneration.canvas.storageStage') }}</h4>
          <div class="lane-stage">
            <span class="status-dot" :class="stageStatus('storage')" aria-hidden="true"></span>
            <span>{{ t('execution.stages.tagGeneration.storage') }}</span>
            <span class="lane-status">{{ stageStatusText('storage') }}</span>
          </div>
          <div class="lane-stage">
            <span class="status-dot" :class="stageStatus('settlement')" aria-hidden="true"></span>
            <span>{{ t('execution.stages.tagGeneration.settlement') }}</span>
            <span class="lane-status">{{ stageStatusText('settlement') }}</span>
          </div>
          <dl class="lane-facts">
            <div>
              <dt>{{ t('execution.tagGeneration.canvas.storageTotal') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.storageAccountedTagCount ?? null) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.persisted') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.persistedCount ?? null) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.duplicateCount') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.duplicateCount ?? null) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.replacedCount') }}</dt>
              <dd class="mono">{{ valueText(summary?.progress.replacedCount ?? null) }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>


    <div class="canvas-section">
      <div class="section-head">
        <h3 class="section-title">{{ t('execution.tagGeneration.canvas.partGrid') }}</h3>
        <span class="section-note">
          {{ t('execution.tagGeneration.canvas.loadedParts', { count: parts.length }) }}
        </span>
      </div>
      <p class="section-note">{{ t('execution.tagGeneration.canvas.gridNote') }}</p>

      <p v-if="loading" class="state-block" role="status">{{ t('execution.loading') }}</p>
      <p v-else-if="!error && !partRows.length" class="muted">{{ t('execution.tagGeneration.noParts') }}</p>
      <template v-else-if="partRows.length">
        <ul class="part-grid">
          <li v-for="row in partRows" :key="row.key">
            <button
              type="button"
              class="part-tile"
              :class="{ selected: row.key === selectedPartKey }"
              :aria-expanded="row.key === selectedPartKey"
              :aria-controls="row.key === selectedPartKey ? detailId : undefined"
              @click="togglePart(row.key)"
            >
              <span class="part-head">
                <span class="part-title">
                  {{ t('execution.tagGeneration.part') }}
                  <span class="mono">{{ row.part.partIndex }}</span>
                </span>
                <span v-if="row.part.attempt !== null" class="part-attempt">
                  {{ t('execution.tagGeneration.attempt') }} {{ row.part.attempt }}
                </span>
              </span>

              <span class="part-status">
                <span v-if="row.part.status" class="status-chip" :class="`state-${row.part.status}`">
                  {{ tracePartStatusLabel(row.part.status, t) }}
                </span>
                <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
              </span>

              <span class="part-facts">
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.range') }}</span>
                  <span class="fact-value mono">{{ row.rangeText }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.generatedBlocks') }}</span>
                  <span class="fact-value mono">{{ valueText(row.part.generatedBlockCount) }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.storageAccountedTags') }}</span>
                  <span class="fact-value mono">{{ valueText(row.part.storageAccountedTagCount) }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.generateTask') }}</span>
                  <span class="fact-value mono">{{ valueText(row.part.generateTaskId) }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.taskState') }}</span>
                  <span class="fact-value">
                    {{ row.generateTask ? taskStatusLabel(row.generateTask.status, t) : row.part.generateTaskId ? t('execution.notAvailable') : t('execution.tagGeneration.canvas.noTask') }}
                  </span>
                </span>
              </span>
            </button>
          </li>
        </ul>

        <div v-if="selectedPart" :id="detailId" class="part-detail">
          <div class="section-head">
            <h4 class="detail-title">
              {{ t('execution.tagGeneration.canvas.selectedPart') }}
              <span class="mono">
                {{ t('execution.tagGeneration.part') }} {{ selectedPart.part.partIndex }}
              </span>
            </h4>
            <span class="section-note">{{ t('execution.tagGeneration.canvas.selectPartHint') }}</span>
          </div>

          <dl class="detail-grid">
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.range') }}</dt>
              <dd class="mono">{{ selectedPart.rangeText }}</dd>
            </div>
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.plannedBlocks') }}</dt>
              <dd class="mono">{{ valueText(selectedPart.part.plannedBlockCount) }}</dd>
            </div>
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.generatedBlocks') }}</dt>
              <dd class="mono">{{ valueText(selectedPart.part.generatedBlockCount) }}</dd>
            </div>
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.storageAccountedTags') }}</dt>
              <dd class="mono">{{ valueText(selectedPart.part.storageAccountedTagCount) }}</dd>
            </div>
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.taskState') }}</dt>
              <dd>{{ selectedPart.generateTask ? taskStatusLabel(selectedPart.generateTask.status, t) : selectedPart.part.generateTaskId ? t('execution.notAvailable') : t('execution.tagGeneration.canvas.noTask') }}</dd>
            </div>
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.coverage') }}</dt>
              <dd>{{ selectedPart.part.coverage ? coverageStateLabel(selectedPart.part.coverage, t) : t('execution.notAvailable') }}</dd>
            </div>
            <div class="detail-fact">
              <dt>{{ t('execution.tagGeneration.canvas.updatedAt') }}</dt>
              <dd class="mono">{{ timeText(selectedPart.part.updatedAtMs) }}</dd>
            </div>
          </dl>

          <h4 class="detail-title">{{ t('execution.tagGeneration.windows') }}</h4>
          <p v-if="!selectedPart.windowsRequested" class="muted">
            {{ t('execution.tagGeneration.notRequested') }}
          </p>
          <p v-else-if="!selectedPart.windows.length" class="muted">
            {{ t('execution.tagGeneration.emptyWindows') }}
          </p>
          <div v-else class="window-scroll">
            <table class="window-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('execution.tagGeneration.window') }}</th>
                  <th scope="col">{{ t('execution.tagGeneration.range') }}</th>
                  <th scope="col">{{ t('execution.tagGeneration.canvas.windowState') }}</th>
                  <th scope="col">{{ t('execution.tagGeneration.canvas.dumpTask') }}</th>
                  <th scope="col">{{ t('execution.tagGeneration.taskState') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="window in selectedPart.windows" :key="window.window.windowIndex">
                  <td class="mono">{{ window.window.windowIndex }}</td>
                  <td class="mono">{{ rangeText(window.window.blockStart, window.window.blockCount) }}</td>
                  <td>
                    {{ window.window.state ? tracePartStatusLabel(window.window.state, t) : t('execution.notAvailable') }}
                  </td>
                  <td class="mono">{{ valueText(window.window.tagDumpTaskId) }}</td>
                  <td>
                    {{ window.dumpTask ? taskStatusLabel(window.dumpTask.status, t) : window.window.tagDumpTaskId ? t('execution.notAvailable') : t('execution.tagGeneration.canvas.noTask') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>


  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { TaskSummary } from '@/api/job'
import type {
  TracePart,
  TracePartWindow,
  TraceSummary,
} from '@/api/trace'
import type { ExecutionStage } from '@/features/execution/data/executionStages'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { coverageStateLabel, taskStatusLabel, tracePartStatusLabel } from '@/utils/statusLabels'

/**
 * Tag-generation main canvas.
 *
 * Shows the stage flow, the real Part records returned by the API and separate
 * computation / Storage-confirmation counters. Part tiles are source records,
 * never a claim about simultaneous concurrency. Missing values stay
 * `notAvailable`; counters are never coerced to zero.
 */

const props = withDefaults(defineProps<{
  stages: readonly ExecutionStage[]
  parts: readonly TracePart[]
  summary: TraceSummary | null
  selectedStageId: string | null
  tasks: readonly TaskSummary[]
  loading?: boolean
  error?: string | null
}>(), { loading: false, error: null })

const emit = defineEmits<{
  (event: 'select-stage', stageId: string | null): void
  (event: 'manual-explore'): void
}>()

const { t } = useI18n()
const detailId = `tag-generation-detail-${useId()}`
const selectedPartKey = ref<string | null>(null)

const taskById = computed(() => {
  const map = new Map<string, TaskSummary>()
  for (const task of props.tasks) map.set(task.taskId, task)
  return map
})

function rangeText(blockStart: string, blockCount: string): string {
  return `${blockStart} + ${blockCount}`
}

interface PartRow {
  key: string
  part: TracePart
  rangeText: string
  generateTask: TaskSummary | null
  windowsRequested: boolean
  windows: { window: TracePartWindow; dumpTask: TaskSummary | null }[]
}

const partRows = computed<PartRow[]>(() => props.parts.map((part) => ({
  key: `${part.partIndex}:${part.attempt ?? '-'}`,
  part,
  rangeText: part.ranges.length
    ? part.ranges.map(range => rangeText(range.blockStart, range.blockCount)).join(' · ')
    : t('execution.notAvailable'),
  generateTask: part.generateTaskId ? taskById.value.get(part.generateTaskId) ?? null : null,
  windowsRequested: part.windows !== undefined,
  windows: (part.windows ?? []).map(window => ({
    window,
    dumpTask: window.tagDumpTaskId ? taskById.value.get(window.tagDumpTaskId) ?? null : null,
  })),
})))
const stageById = computed(() => new Map(props.stages.map(stage => [stage.id, stage])))

function stageStatus(stageId: string): ExecutionStage['status'] {
  return stageById.value.get(stageId)?.status ?? 'notObserved'
}

function stageStatusText(stageId: string): string {
  const stage = stageById.value.get(stageId)
  return stage ? statusText(stage) : t('execution.notAvailable')
}



const selectedPart = computed(() =>
  partRows.value.find(row => row.key === selectedPartKey.value) ?? null,
)


function togglePart(key: string): void {
  emit('manual-explore')
  selectedPartKey.value = selectedPartKey.value === key ? null : key
}

function valueText(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? t('execution.notAvailable') : value
}

function statusText(stage: ExecutionStage): string {
  if (stage.status === 'notObserved') return t('execution.stages.notObserved')
  if (stage.evidence.some(evidence => evidence.source.quality === 'observed')) {
    return t('execution.sourceQuality.observed')
  }
  if (stage.evidence.some(evidence => evidence.source.quality === 'reconstructed')) {
    return t('execution.stages.reconstructed')
  }
  return t('execution.stages.qualityUnknown')
}


function timeText(value: number | null): string {
  return value === null ? t('execution.notAvailable') : formatDateTime(value)
}

function toggleStage(stage: ExecutionStage): void {
  emit('manual-explore')
  emit('select-stage', stage.id === props.selectedStageId ? null : stage.id)
}

</script>

<style scoped>
.tag-generation-canvas {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.state-block {
  margin: 0;
  padding: 8px 0;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.state-block.error {
  color: var(--apple-red, #d03050);
}

.canvas-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-2);
}

.section-note {
  font-size: 11px;
  color: var(--apple-gray-3);
  line-height: 1.4;
}

.phase-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.phase-item {
  flex: 1 1 150px;
  min-width: 140px;
}

.phase-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 8px 10px;
  font: inherit;
  color: var(--apple-gray-1);
  text-align: left;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  cursor: pointer;
  transition: border-color var(--apple-dur-fast) var(--apple-ease-out),
    background-color var(--apple-dur-fast) var(--apple-ease-out);
}

.phase-button:hover {
  border-color: var(--apple-gray-4);
}

.phase-button.selected {
  border-color: var(--apple-gray-1);
  background: color-mix(in srgb, var(--apple-gray-1) 5%, var(--apple-card));
}

.phase-button.failure {
  border-left: 2px solid var(--apple-red, #d03050);
}

.phase-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.phase-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.phase-index {
  flex: none;
  min-width: 14px;
  font-size: 11px;
  color: var(--apple-gray-4);
}

.phase-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.phase-label {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.phase-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--apple-gray-3);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--apple-gray-4);
}

.status-dot.observed {
  background: var(--apple-green);
}

.phase-count {
  padding: 0 4px;
  font-size: 10px;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
}

.phase-failure {
  color: var(--apple-red, #d03050);
}

.part-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.part-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 9px 10px;
  font: inherit;
  color: var(--apple-gray-1);
  text-align: left;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  cursor: pointer;
  transition: border-color var(--apple-dur-fast) var(--apple-ease-out),
    background-color var(--apple-dur-fast) var(--apple-ease-out);
}

.part-tile:hover {
  border-color: var(--apple-gray-4);
}

.part-tile.selected {
  border-color: var(--apple-gray-1);
  background: color-mix(in srgb, var(--apple-gray-1) 5%, var(--apple-card));
}

.part-tile:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.part-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.part-title {
  font-size: 12px;
  font-weight: 600;
}

.part-attempt {
  font-size: 10px;
  color: var(--apple-gray-3);
}

.part-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.status-chip {
  padding: 0 6px;
  font-size: 10px;
  line-height: 18px;
  color: var(--apple-gray-2);
  border: 1px solid var(--apple-border);
  border-radius: 999px;
}

.status-chip.state-failed,
.status-chip.state-cancelled {
  color: var(--apple-red, #d03050);
  border-color: color-mix(in srgb, var(--apple-red, #d03050) 40%, var(--apple-border));
}

.status-chip.state-running,
.status-chip.state-generating {
  color: var(--apple-blue);
  border-color: color-mix(in srgb, var(--apple-blue) 40%, var(--apple-border));
}

.status-chip.state-completed,
.status-chip.state-persisted,
.status-chip.state-generated {
  color: var(--apple-green);
  border-color: color-mix(in srgb, var(--apple-green) 40%, var(--apple-border));
}

.part-facts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  font-size: 10px;
}

.fact-label {
  flex: none;
  color: var(--apple-gray-3);
}

.fact-value {
  min-width: 0;
  overflow: hidden;
  color: var(--apple-gray-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.detail-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-2);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 6px 16px;
  margin: 0;
}

.detail-fact {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.detail-fact dt {
  font-size: 10px;
  color: var(--apple-gray-3);
}

.detail-fact dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--apple-gray-1);
}

.window-scroll {
  overflow-x: auto;
}

.window-table {
  width: 100%;
  min-width: 540px;
  border-collapse: collapse;
  font-size: 11px;
}

.window-table th {
  padding: 5px 8px;
  font-weight: 600;
  color: var(--apple-gray-3);
  text-align: left;
  border-bottom: 1px solid var(--apple-border);
}

.window-table td {
  padding: 5px 8px;
  color: var(--apple-gray-2);
  border-bottom: 1px solid var(--apple-border);
  vertical-align: top;
}

 .process-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1.2fr) 28px minmax(0, 1fr);
  align-items: stretch;
  gap: 8px;
}

.process-lane {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: var(--apple-gray-7);
}

.process-lane-audit {
  background: var(--apple-card);
}

.process-role {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.process-lane h4 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 600;
}

.lane-stage {
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--apple-border);
  color: var(--apple-gray-2);
  font-size: 10px;
}

.lane-status {
  color: var(--apple-gray-3);
  text-align: right;
}

.lane-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.4;
}

.lane-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
  gap: 6px 10px;
  margin: auto 0 0;
  padding-top: 7px;
  border-top: 1px solid var(--apple-border);
}

.lane-facts dt {
  color: var(--apple-gray-3);
  font-size: 9px;
}

.lane-facts dd {
  margin: 2px 0 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.process-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--apple-gray-4);
  font-size: 18px;
}

@media (max-width: 900px) {
  .process-board {
    grid-template-columns: minmax(0, 1fr);
  }

  .process-arrow {
    min-height: 22px;
    transform: rotate(90deg);
  }
}


.muted {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 11px;
}

@media (prefers-reduced-motion: reduce) {
  .phase-button,
  .part-tile {
    transition: none;
  }
}
</style>
