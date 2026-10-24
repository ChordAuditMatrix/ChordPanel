<template>
  <section
    class="tag-generation-canvas"
    :class="{ 'is-replay': displayProjection.facts.isReplay }"
    :aria-label="t('execution.tagGeneration.canvas.phases')"
    :aria-busy="loading || undefined"
  >
    <p v-if="error" class="state-block error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !stages.length" class="state-block" role="status">
      {{ t('execution.loading') }}
    </p>

    <!--
      Focal head. The page-level stage rail owns navigation; this canvas only
      states the focus that produced the pointer-time projection.
    -->
    <header class="scene-head">
      <div class="focus">
        <span class="focus-label">{{ t('execution.tagGeneration.canvas.focusLabel') }}</span>
        <span v-if="displayProjection.facts.isReplay" class="history-badge" role="note">
          {{ t('execution.replay.title') }}
        </span>
        <p class="focus-line">
          <span v-if="focusStage" class="focus-stage">{{ t(focusStage.labelKey) }}</span>
          <span v-else class="focus-stage muted">{{ t('execution.noCurrentStage') }}</span>
          <span v-if="focus.partIndex !== null" class="focus-ref">
            {{ t('execution.tagGeneration.part') }}
            <span class="mono">{{ focus.partIndex }}</span>
          </span>
          <span v-if="focus.windowIndex !== null" class="focus-ref">
            {{ t('execution.tagGeneration.window') }}
            <span class="mono">{{ focus.windowIndex }}</span>
          </span>
          <span class="focus-source">{{ focusSourceText }}</span>
        </p>
      </div>

      <div
        v-if="observedCues.length || reconstructedCues.length || unknownCues.length"
        class="cue-strip"
        :aria-label="t('execution.tagGeneration.canvas.cueTitle')"
      >
        <span class="cue-title">{{ t('execution.tagGeneration.canvas.cueTitle') }}</span>
        <span
          v-for="cue in observedCues"
          :key="cue.id"
          class="cue cue-observed"
          :title="t('execution.sourceQuality.observed')"
        >
          <span class="cue-dot" aria-hidden="true"></span>
          {{ activityLabel(cue.eventType) }}
        </span>
        <span
          v-for="cue in reconstructedCues"
          :key="cue.id"
          class="cue cue-static"
          :title="t('execution.stages.reconstructed')"
        >
          {{ activityLabel(cue.eventType) }} · {{ t('execution.stages.reconstructed') }}
        </span>
        <span
          v-for="cue in unknownCues"
          :key="cue.id"
          class="cue cue-static cue-unknown"
          :title="t('execution.stages.qualityUnknown')"
        >
          {{ activityLabel(cue.eventType) }} · {{ t('execution.stages.qualityUnknown') }}
        </span>
      </div>
    </header>

    <!--
      Stage brief. The stage selected on the page rail wins, otherwise the
      focus stage. Every value is read from the projection, so a replay keeps
      showing pointer-time facts and never the final summary.
    -->
    <section
      v-if="stageBrief"
      :key="stageBrief.stageId"
      class="stage-brief"
      :class="`status-${stageStatus(stageBrief.stageId)}`"
      :aria-label="t(stageLabelKey(stageBrief.stageId))"
    >
      <header class="brief-head">
        <!-- The focus line above already names the stage when both agree. -->
        <h3 v-if="stageBrief.stageId !== focus.stageId" class="brief-title">
          {{ t(stageLabelKey(stageBrief.stageId)) }}
        </h3>
        <span class="brief-status">
          <span class="status-dot" :class="stageStatus(stageBrief.stageId)" aria-hidden="true"></span>
          {{ displayStatusText(stageStatus(stageBrief.stageId)) }}
        </span>
        <span v-if="stageStatus(stageBrief.stageId) === 'failed'" class="brief-failure">
          {{ t('execution.stages.failure') }}
        </span>
      </header>

      <dl class="brief-facts">
        <div v-for="fact in stageBrief.facts" :key="fact.key" class="brief-fact">
          <dt>{{ fact.label }}</dt>
          <dd>
            <span class="brief-value">{{ fact.value }}</span>
            <span v-if="fact.note" class="brief-note">{{ fact.note }}</span>
          </dd>
        </div>
      </dl>

      <p v-if="stageBrief.showStorageNode" class="brief-storage">
        <span class="fact-label">{{ t('execution.tagGeneration.canvas.selectedStorageNode') }}</span>
        <code v-if="displayProjection.facts.storageNodeId">{{ displayProjection.facts.storageNodeId }}</code>
        <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
      </p>
    </section>

    <!-- Always visible: two independent, source-derived progress measures. -->
    <div class="measures">
      <div class="measure">
        <div class="measure-head">
          <span class="measure-label">{{ t('execution.tagGeneration.calculationProgress') }}</span>
          <span class="measure-value">{{ percentText(progress.calculationPercent) }}</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="progress.calculationPercent ?? undefined"
          :aria-valuetext="percentText(progress.calculationPercent)"
        >
          <span
            v-if="progress.calculationPercent !== null"
            class="progress-fill"
            :style="{ '--progress-scale': `${progress.calculationPercent / 100}` }"
          ></span>
          <span v-else class="progress-none">—</span>
        </div>
        <div class="measure-facts">
          <span>
            <span class="fact-label">{{ t('execution.tagGeneration.plannedBlocks') }}</span>
            <span class="mono">{{ valueText(progress.plannedBlockCount) }}</span>
          </span>
          <span>
            <span class="fact-label">{{ t('execution.tagGeneration.generatedBlocks') }}</span>
            <span class="mono">{{ valueText(progress.generatedBlockCount) }}</span>
          </span>
        </div>
      </div>

      <div class="measure">
        <div class="measure-head">
          <span class="measure-label">{{ t('execution.tagGeneration.storageProgress') }}</span>
          <span class="measure-value">{{ percentText(progress.storagePercent) }}</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="progress.storagePercent ?? undefined"
          :aria-valuetext="percentText(progress.storagePercent)"
        >
          <span
            v-if="progress.storagePercent !== null"
            class="progress-fill progress-fill-storage"
            :style="{ '--progress-scale': `${progress.storagePercent / 100}` }"
          ></span>
          <span v-else class="progress-none">—</span>
        </div>
        <div class="measure-facts">
          <span>
            <span class="fact-label">{{ t('execution.tagGeneration.storageAccountedTags') }}</span>
            <span class="mono">{{ valueText(progress.storageAccountedTagCount) }}</span>
          </span>
          <span>
            <span class="fact-label">{{ t('execution.tagGeneration.completedParts') }}</span>
            <span class="mono">{{ valueText(progress.completedPartCount) }}</span>
          </span>
        </div>
      </div>

      <div v-if="hasProgressNote" class="measure-notes">
        <p v-if="progress.storageLagging === true" class="lag-warning" role="status">
          {{ t('execution.tagGeneration.canvas.generatedNotAccounted') }}
        </p>
        <p v-else-if="progress.storageLagging === null" class="lag-unknown">
          {{ t('execution.tagGeneration.canvas.lagUnknown') }}
        </p>
        <p v-if="progress.source === 'unknown'" class="lag-unknown">
          {{ t('execution.tagGeneration.canvas.progressUnknown') }}
        </p>
      </div>
    </div>

    <!--
      One execution field: Admin local work, the real Part/Window activity and
      the Storage target. Zones are layout only; they never imply time order,
      concurrency or protocol traffic.
    -->
    <div class="field">
      <section class="zone zone-admin" :aria-label="t('execution.tagGeneration.canvas.planStage')">
        <header class="zone-head">
          <h4 class="zone-title">{{ t('execution.tagGeneration.canvas.planStage') }}</h4>
        </header>
        <ul class="stage-list">
          <li
            v-for="stageId in adminStageIds"
            :key="stageId"
            class="stage-line"
            :class="{
              current: stageId === selectedStageId,
              failure: stageStatus(stageId) === 'failed',
            }"
          >
            <span class="status-dot" :class="stageStatus(stageId)" aria-hidden="true"></span>
            <span class="stage-name">{{ t(stageLabelKey(stageId)) }}</span>
            <span class="stage-status">{{ displayStatusText(stageStatus(stageId)) }}</span>
          </li>
        </ul>
        <p class="zone-fact">
          <span class="fact-label">{{ t('execution.tagGeneration.plannedParts') }}</span>
          <span class="mono">{{ valueText(progress.plannedPartCount) }}</span>
        </p>
      </section>

      <section class="zone zone-parts" :aria-label="t('execution.tagGeneration.canvas.partActivity')">
        <header class="zone-head">
          <h4 class="zone-title">{{ t('execution.tagGeneration.canvas.partActivity') }}</h4>
          <span class="zone-meta">
            {{ t('execution.tagGeneration.canvas.loadedParts', { count: partCount }) }}
          </span>
        </header>

        <p v-if="loading" class="state-block" role="status">{{ t('execution.loading') }}</p>
        <p v-else-if="!partRows.length" class="muted">{{ t('execution.tagGeneration.noParts') }}</p>
        <ul v-else class="part-list">
          <li
            v-for="row in partRows"
            :key="row.key"
            class="part-item"
          >
            <button
              type="button"
              class="part-row"
              :class="{
                selected: row.key === selectedPartKey,
                focused: row.focused,
                failure: row.failed,
                'live-active': row.generationActive && !displayProjection.facts.isReplay,
              }"
              :aria-expanded="row.key === selectedPartKey"
              :aria-controls="row.key === selectedPartKey ? detailId : undefined"
              @click="togglePart(row.key)"
            >
              <span class="part-head">
                <span class="part-title">
                  {{ t('execution.tagGeneration.part') }}
                  <span class="mono">{{ row.fact.partIndex }}</span>
                </span>
                <span v-if="row.fact.attempt !== null" class="part-attempt">
                  {{ t('execution.tagGeneration.attempt') }} {{ row.fact.attempt }}
                </span>
                <span class="part-status">
                  <span v-if="row.generationActive && !displayProjection.facts.isReplay" class="live-indicator" aria-hidden="true"></span>
                  <span class="status-chip" :class="`state-${row.fact.status}`">
                    {{ partStatusText(row.fact.status) }}
                  </span>
                  <span v-if="row.lagging" class="lag-badge">
                    {{ t('execution.tagGeneration.canvas.partLagging') }}
                  </span>
                </span>
              </span>

              <span class="part-facts">
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.plannedBlocks') }}</span>
                  <span class="fact-value mono">{{ valueText(row.fact.plannedBlockCount) }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.generatedBlocks') }}</span>
                  <span class="fact-value mono">{{ valueText(row.fact.generatedBlockCount) }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.storageAccountedTags') }}</span>
                  <span class="fact-value mono">{{ valueText(row.fact.storageAccountedTagCount) }}</span>
                </span>
                <span class="fact">
                  <span class="fact-label">{{ t('execution.tagGeneration.taskState') }}</span>
                  <span class="fact-value">
                    {{ taskStateText(row.fact.generateTaskId, row.fact.generateTaskStatus, row.fact.source) }}
                  </span>
                </span>
              </span>

              <span v-if="row.windows.length" class="mini-windows">
                <span
                  v-for="window in row.windows"
                  :key="window.fact.windowIndex"
                  class="mini-window"
                  :class="{
                    failure: window.failed,
                    lagging: window.lagging,
                    'live-active': window.active && !displayProjection.facts.isReplay,
                  }"
                >
                  <span v-if="window.active && !displayProjection.facts.isReplay" class="live-indicator" aria-hidden="true"></span>
                  <span class="mono">
                    {{ t('execution.tagGeneration.window') }} {{ window.fact.windowIndex }}
                  </span>
                  <span>{{ windowStatusText(window.fact.status) }}</span>
                  <span v-if="window.fact.taskId !== null" class="mini-task">
                    {{ t('execution.tagGeneration.canvas.dumpTask') }}
                    <span class="mono">
                      {{ taskStateText(window.fact.taskId, window.fact.taskStatus, row.fact.source) }}
                    </span>
                  </span>
                  <span v-if="window.lagging" class="lag-badge">
                    {{ t('execution.tagGeneration.canvas.partLagging') }}
                  </span>
                </span>
                <span v-if="row.hiddenWindows > 0" class="mini-window-more">
                  {{ t('execution.tagGeneration.canvas.windowsHidden', { count: row.hiddenWindows }) }}
                </span>
              </span>
              <span v-else class="mini-window-more">{{ windowsStateText(row.fact) }}</span>
            </button>
          </li>
        </ul>

        <p v-if="hiddenPartCount > 0" class="zone-note">
          {{
            t('execution.tagGeneration.canvas.boundedParts', {
              shown: partRows.length,
              total: partCount,
              rest: hiddenPartCount,
            })
          }}
          <span v-if="partStats.failed > 0">
            · {{ t('execution.stages.failure') }}
            <span class="mono">{{ partStats.failed }}</span>
          </span>
          <span v-if="partStats.active > 0">
            · {{ t('execution.tagGeneration.canvas.stageActive') }}
            <span class="mono">{{ partStats.active }}</span>
          </span>
          <span v-if="partStats.lagging > 0">
            · {{ t('execution.tagGeneration.canvas.partLagging') }}
            <span class="mono">{{ partStats.lagging }}</span>
          </span>
        </p>
      </section>

      <section class="zone zone-storage" :aria-label="t('execution.tagGeneration.canvas.storageLane')">
        <header class="zone-head">
          <h4 class="zone-title">{{ t('execution.tagGeneration.canvas.storageLane') }}</h4>
        </header>
        <p class="storage-target" role="status">
          <span class="fact-label">{{ t('execution.tagGeneration.canvas.selectedStorageNode') }}</span>
          <code v-if="displayProjection.facts.storageNodeId">{{ displayProjection.facts.storageNodeId }}</code>
          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
        </p>
        <ul class="stage-list">
          <li
            v-for="stageId in storageStageIds"
            :key="stageId"
            class="stage-line"
            :class="{
              current: stageId === selectedStageId,
              failure: stageStatus(stageId) === 'failed',
            }"
          >
            <span class="status-dot" :class="stageStatus(stageId)" aria-hidden="true"></span>
            <span class="stage-name">{{ t(stageLabelKey(stageId)) }}</span>
            <span class="stage-status">{{ displayStatusText(stageStatus(stageId)) }}</span>
          </li>
        </ul>
        <p class="zone-fact">
          <span class="fact-label">{{ t('execution.tagGeneration.canvas.registeredDumpTasks') }}</span>
          <span class="mono">{{ storageFacts.windowCount === 0 ? '—' : storageFacts.registeredDumpTasks }}</span>
        </p>
        <p class="zone-note">
          {{
            storageFacts.windowCount === 0
              ? t('execution.tagGeneration.canvas.windowsUnknown')
              : t('execution.tagGeneration.canvas.accountedWindows', { count: storageFacts.accountedWindows })
          }}
        </p>
        <p v-if="storageFacts.failedWindows > 0" class="zone-note failure-note">
          {{ t('execution.stages.failure') }}: {{ storageFacts.failedWindows }}
        </p>
      </section>

      <p class="field-note">{{ t('execution.tagGeneration.canvas.parallelNote') }}</p>
    </div>

    <!-- Selected part detail, opened from a part row above. -->
    <div v-if="selectedPart" :id="detailId" class="part-detail">
      <header class="detail-head">
        <h3 class="detail-title-lg">
          {{ t('execution.tagGeneration.canvas.selectedPart') }}
          <span class="mono">
            {{ t('execution.tagGeneration.part') }} {{ selectedPart.row.fact.partIndex }}
          </span>
        </h3>
        <span class="detail-hint">{{ t('execution.tagGeneration.canvas.selectPartHint') }}</span>
      </header>

      <dl class="detail-grid">
        <div class="detail-fact">
          <dt>{{ t('execution.tagGeneration.plannedBlocks') }}</dt>
          <dd class="mono">{{ valueText(selectedPart.row.fact.plannedBlockCount) }}</dd>
        </div>
        <div class="detail-fact">
          <dt>{{ t('execution.tagGeneration.generatedBlocks') }}</dt>
          <dd class="mono">{{ valueText(selectedPart.row.fact.generatedBlockCount) }}</dd>
        </div>
        <div class="detail-fact">
          <dt>{{ t('execution.tagGeneration.storageAccountedTags') }}</dt>
          <dd class="mono">{{ valueText(selectedPart.row.fact.storageAccountedTagCount) }}</dd>
        </div>
        <div class="detail-fact">
          <dt>{{ t('execution.tagGeneration.generateTask') }}</dt>
          <dd class="mono">{{ valueText(selectedPart.row.fact.generateTaskId) }}</dd>
        </div>
        <div class="detail-fact">
          <dt>{{ t('execution.tagGeneration.taskState') }}</dt>
          <dd>
            {{ taskStateText(selectedPart.row.fact.generateTaskId, selectedPart.row.fact.generateTaskStatus, selectedPart.row.fact.source) }}
          </dd>
        </div>
        <div class="detail-fact">
          <dt>{{ t('execution.tagGeneration.canvas.windowState') }}</dt>
          <dd>
            {{
              selectedPart.row.fact.windows.length
                ? t('execution.tagGeneration.canvas.projectedWindows', {
                  count: selectedPart.row.fact.windows.length,
                })
                : windowsStateText(selectedPart.row.fact)
            }}
          </dd>
        </div>
      </dl>

      <h4 class="detail-title">{{ t('execution.tagGeneration.windows') }}</h4>
      <p v-if="windowsStateText(selectedPart.row.fact)" class="muted">
        {{ windowsStateText(selectedPart.row.fact) }}
      </p>
      <div v-else class="window-scroll">
        <table class="window-table">
          <thead>
            <tr>
              <th scope="col">{{ t('execution.tagGeneration.window') }}</th>
              <th scope="col">{{ t('execution.tagGeneration.canvas.windowState') }}</th>
              <th scope="col">{{ t('execution.tagGeneration.generatedBlocks') }}</th>
              <th scope="col">{{ t('execution.tagGeneration.storageAccountedTags') }}</th>
              <th scope="col">{{ t('execution.tagGeneration.canvas.dumpTask') }}</th>
              <th scope="col">{{ t('execution.tagGeneration.taskState') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="window in selectedPart.windows"
              :key="window.fact.windowIndex"
              :class="{
                'row-failure': window.failed,
                'row-lagging': window.lagging,
                'row-active': window.active && !displayProjection.facts.isReplay,
              }"
            >
              <td class="mono"><span v-if="window.active && !displayProjection.facts.isReplay" class="live-indicator" aria-hidden="true"></span>{{ window.fact.windowIndex }}</td>
              <td>{{ windowStatusText(window.fact.status) }}</td>
              <td class="mono">{{ valueText(window.fact.generatedCount) }}</td>
              <td class="mono">{{ valueText(window.fact.storageAccountedTagCount) }}</td>
              <td class="mono">{{ valueText(window.fact.taskId) }}</td>
              <td>{{ taskStateText(window.fact.taskId, window.fact.taskStatus, selectedPart.row.fact.source) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="selectedPart.hiddenWindows > 0" class="muted">
        {{ t('execution.tagGeneration.canvas.windowsHidden', { count: selectedPart.hiddenWindows }) }}
      </p>
    </div>

    <!-- Final snapshots are audit-only and deliberately outside the active scene. -->
    <div
      v-if="displayProjection.facts.finalSnapshotAvailable"
      class="final-snapshot"
    >
      <header class="detail-head">
        <h3 class="detail-title-lg">{{ t('execution.tagGeneration.canvas.finalSnapshot') }}</h3>
        <span class="detail-hint">{{ t('execution.tagGeneration.canvas.finalSnapshotNote') }}</span>
      </header>
      <p class="muted">
        {{ t('execution.tagGeneration.canvas.loadedParts', { count: parts.length }) }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { TaskSummary } from '@/api/job'
import type { TracePart, TraceSummary } from '@/api/trace'
import type { ExecutionStage } from '@/features/execution/data/executionStages'
import type {
  ExecutionDisplayProjection,
  ExecutionDisplayStatus,
  ExecutionPartDisplayFact,
  ExecutionWindowDisplayFact,
} from '@/features/execution/data/executionDisplayProjection'
import { useI18n } from '@/stores/i18n'
import { taskStatusLabel, tracePartStatusLabel } from '@/utils/statusLabels'

/**
 * Tag-generation main canvas.
 *
 * Stage status, focus, counts and animation intents are read from the
 * pointer-time `displayProjection`. Final `summary` / `parts` records are only
 * audited in a clearly-labelled final-snapshot block, never inside the active
 * scene. No card implies concurrency or protocol traffic.
 */

const MAX_PARTS = 5
const MAX_PART_WINDOWS = 2
const MAX_DETAIL_WINDOWS = 5
const MAX_CUES = 4

const props = withDefaults(defineProps<{
  displayProjection: ExecutionDisplayProjection
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

const projection = computed(() => props.displayProjection)
const progress = computed(() => projection.value.facts.progress)
const focus = computed(() => projection.value.focus)
const partCount = computed(() => projection.value.facts.parts.length)
const TAG_STAGE_IDS = ['layout', 'plan', 'generation', 'storage', 'settlement'] as const
const adminStageIds = ['layout', 'plan', 'generation', 'settlement'] as const
const storageStageIds = ['storage'] as const

function isTagStageId(stageId: string): boolean {
  return (TAG_STAGE_IDS as readonly string[]).includes(stageId)
}

const stageFactById = computed(() =>
  new Map(projection.value.facts.stages.map(fact => [fact.stageId, fact])),
)

const focusStage = computed(() => {
  const stageId = focus.value.stageId
  return stageId ? props.stages.find(stage => stage.id === stageId) ?? null : null
})

const focusSourceText = computed(() => {
  switch (focus.value.source) {
    case 'failure':
      return t('execution.outcomes.failed')
    case 'task':
      return t('execution.tasks')
    case 'part':
      return t('execution.tagGeneration.part')
    case 'observation':
      return t('execution.observations')
    default:
      return t('execution.notAvailable')
  }
})

const observedCues = computed(() =>
  projection.value.cues
    .filter(cue => cue.sourceQuality === 'observed')
    .slice(-MAX_CUES),
)
const reconstructedCues = computed(() =>
  projection.value.cues
    .filter(cue => cue.sourceQuality === 'reconstructed')
    .slice(-MAX_CUES),
)
const unknownCues = computed(() =>
  projection.value.cues
    .filter(cue => cue.sourceQuality !== 'observed' && cue.sourceQuality !== 'reconstructed')
    .slice(-MAX_CUES),
)

/**
 * Stage the brief describes: the page-rail selection wins, otherwise the focus
 * stage. Ids this execution kind does not define are ignored, so the brief can
 * never invent a stage.
 */
const activeStageId = computed<string | null>(() => {
  const selected = props.selectedStageId
  if (selected && isTagStageId(selected)) return selected
  const focused = focus.value.stageId
  return focused && isTagStageId(focused) ? focused : null
})

const hasProgressNote = computed(() =>
  progress.value.storageLagging !== false || progress.value.source === 'unknown',
)

interface WindowRow {
  fact: ExecutionWindowDisplayFact
  focused: boolean
  failed: boolean
  active: boolean
  lagging: boolean
}

interface PartRow {
  key: string
  fact: ExecutionPartDisplayFact
  focused: boolean
  selected: boolean
  failed: boolean
  active: boolean
  generationActive: boolean
  lagging: boolean
  windows: WindowRow[]
  hiddenWindows: number
}
const FAILURE_STATUSES: Record<string, true> = {
  failed: true,
  cancelled: true,
  canceled: true,
  timedout: true,
}
const ACTIVE_STATUSES: Record<string, true> = {
  running: true,
  generating: true,
}

function normalized(value: string | null | undefined): string {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function isFailureStatus(value: string | null | undefined): boolean {
  return FAILURE_STATUSES[normalized(value)] === true
}

function isActiveStatus(value: string | null | undefined): boolean {
  return ACTIVE_STATUSES[normalized(value)] === true
}

function countBig(value: string | null | undefined): bigint | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) return null
  return BigInt(value)
}

/** Exact integer comparison; never converts a uint64 count to Number. */
function isLagging(generated: string | null, accounted: string | null): boolean {
  const generatedValue = countBig(generated)
  const accountedValue = countBig(accounted)
  return generatedValue !== null && accountedValue !== null && accountedValue < generatedValue
}

function windowRank(row: WindowRow, partIndex: number): number {
  if (focus.value.partIndex === partIndex && focus.value.windowIndex === row.fact.windowIndex) return 0
  if (row.failed) return 1
  if (row.active) return 2
  if (row.lagging) return 3
  return 4
}

function buildWindowRows(
  part: ExecutionPartDisplayFact,
  limit: number,
): { rows: WindowRow[]; hidden: number } {
  const rows = part.windows.map<WindowRow>((window) => {
    const failed = isFailureStatus(window.status) || isFailureStatus(window.taskStatus)
    return {
      fact: window,
      focused: focus.value.partIndex === part.partIndex
        && focus.value.windowIndex === window.windowIndex,
      failed,
      active: !failed && isActiveStatus(window.taskStatus),
      lagging: isLagging(window.generatedCount, window.storageAccountedTagCount),
    }
  })
  rows.sort((left, right) =>
    windowRank(left, part.partIndex) - windowRank(right, part.partIndex)
    || left.fact.windowIndex - right.fact.windowIndex,
  )
  return { rows: rows.slice(0, limit), hidden: Math.max(0, rows.length - limit) }
}

function buildPartRow(part: ExecutionPartDisplayFact): PartRow {
  const key = `${part.partIndex}:${part.attempt ?? '-'}`
  const windows = buildWindowRows(part, MAX_PART_WINDOWS)
  const failed = isFailureStatus(part.status)
    || isFailureStatus(part.generateTaskStatus)
    || part.windows.some(window =>
      isFailureStatus(window.status) || isFailureStatus(window.taskStatus))
  return {
    key,
    fact: part,
    focused: focus.value.partIndex === part.partIndex,
    selected: key === selectedPartKey.value,
    failed,
    active: !failed && (
      isActiveStatus(part.status)
      || isActiveStatus(part.generateTaskStatus)
      || part.windows.some(window =>
        !isFailureStatus(window.status)
        && !isFailureStatus(window.taskStatus)
        && isActiveStatus(window.taskStatus))
    ),
    generationActive: !failed && (
      isActiveStatus(part.status)
      || isActiveStatus(part.generateTaskStatus)
    ),
    lagging: isLagging(part.generatedBlockCount, part.storageAccountedTagCount),
    windows: windows.rows,
    hiddenWindows: windows.hidden,
  }
}

function partRank(row: PartRow): number {
  if (row.focused) return 0
  if (row.selected) return 1
  if (row.failed) return 2
  if (row.active) return 3
  if (row.lagging) return 4
  return 5
}

const allPartRows = computed<PartRow[]>(() =>
  projection.value.facts.parts.map(buildPartRow),
)

const partRows = computed<PartRow[]>(() => {
  const ranked = [...allPartRows.value].sort((left, right) =>
    partRank(left) - partRank(right)
    || left.fact.partIndex - right.fact.partIndex
    || (left.fact.attempt ?? -1) - (right.fact.attempt ?? -1),
  )
  const bounded = ranked.slice(0, MAX_PARTS)
  const selected = allPartRows.value.find(row => row.key === selectedPartKey.value)
  if (selected && !bounded.includes(selected)) {
    if (bounded.length >= MAX_PARTS) bounded.splice(bounded.length - 1, 1, selected)
    else bounded.push(selected)
  }
  return bounded
})

const hiddenPartCount = computed(() =>
  Math.max(0, projection.value.facts.parts.length - partRows.value.length),
)

const partStats = computed(() => {
  let failed = 0
  let active = 0
  let lagging = 0
  for (const row of allPartRows.value) {
    if (row.failed) failed += 1
    if (row.active) active += 1
    if (row.lagging) lagging += 1
  }
  return { failed, active, lagging }
})

const selectedPart = computed(() => {
  const row = allPartRows.value.find(candidate => candidate.key === selectedPartKey.value)
  if (!row) return null
  const windows = buildWindowRows(row.fact, MAX_DETAIL_WINDOWS)
  return { row, windows: windows.rows, hiddenWindows: windows.hidden }
})

const storageFacts = computed(() => {
  let windowCount = 0
  let registeredDumpTasks = 0
  let accountedWindows = 0
  let failedWindows = 0
  for (const part of projection.value.facts.parts) {
    for (const window of part.windows) {
      windowCount += 1
      if (window.taskId !== null) registeredDumpTasks += 1
      if (window.status === 'accounted' || window.status === 'persisted') accountedWindows += 1
      if (isFailureStatus(window.status) || isFailureStatus(window.taskStatus)) {
        failedWindows += 1
      }
    }
  }
  return { windowCount, registeredDumpTasks, accountedWindows, failedWindows }
})

/**
 * A REST `generating` window with no TagDump task ID is locally generated but
 * still awaiting TagDump registration; it is not a window currently computing.
 */
const generatedAwaitingDumpWindowCount = computed<number | null>(() => {
  let windows = 0
  let awaitingDump = 0
  for (const part of projection.value.facts.parts) {
    for (const window of part.windows) {
      windows += 1
      if (
        window.taskId === null
        && (window.status === 'generated' || window.status === 'generating')
      ) {
        awaitingDump += 1
      }
    }
  }
  return windows === 0 ? null : awaitingDump
})

interface StageBriefFact {
  key: string
  label: string
  value: string
  note?: string
}

interface StageBrief {
  stageId: string
  facts: StageBriefFact[]
  showStorageNode: boolean
}

function briefCount(value: number | null): string {
  return value === null ? t('execution.notAvailable') : String(value)
}

/**
 * Parts with local Generate activity. Window dispatch is deliberately excluded:
 * a dispatched TagDump says nothing about the Admin-side generation state.
 */
const activeGenerationPartCount = computed(() => {
  let active = 0
  for (const part of projection.value.facts.parts) {
    if (
      !isFailureStatus(part.status)
      && !isFailureStatus(part.generateTaskStatus)
      && (isActiveStatus(part.status) || isActiveStatus(part.generateTaskStatus))
    ) active += 1
  }
  return active
})

/**
 * Facts of the active stage, all read from the pointer-time projection. The
 * rate measures stay visible above, so a brief only states what that stage
 * itself produced: planning, generation, dump or the final roll-up.
 */
const stageBrief = computed<StageBrief | null>(() => {
  const stageId = activeStageId.value
  if (!stageId) return null
  const activeNote = activeGenerationPartCount.value > 0
    ? t('execution.tagGeneration.canvas.stageActive')
    : undefined
  switch (stageId) {
    case 'layout':
    case 'plan':
      return {
        stageId,
        facts: [
          {
            key: 'plannedParts',
            label: t('execution.tagGeneration.plannedParts'),
            value: valueText(progress.value.plannedPartCount),
          },
          {
            key: 'plannedBlocks',
            label: t('execution.tagGeneration.plannedBlocks'),
            value: valueText(progress.value.plannedBlockCount),
          },
        ],
        showStorageNode: true,
      }
    case 'generation':
      return {
        stageId,
        facts: [
          {
            key: 'plannedBlocks',
            label: t('execution.tagGeneration.plannedBlocks'),
            value: valueText(progress.value.plannedBlockCount),
          },
          {
            key: 'generatedBlocks',
            label: t('execution.tagGeneration.generatedBlocks'),
            value: valueText(progress.value.generatedBlockCount),
          },
          {
            key: 'activeParts',
            label: t('execution.tagGeneration.canvas.activeGenerationParts'),
            value: briefCount(activeGenerationPartCount.value),
            note: activeNote,
          },
          {
            key: 'generatedAwaitingDumpWindows',
            label: t('execution.tagGeneration.canvas.generatedAwaitingDumpWindows'),
            value: briefCount(generatedAwaitingDumpWindowCount.value),
            note: generatedAwaitingDumpWindowCount.value
              ? t('execution.tagGeneration.canvas.awaitingDumpRegistration')
              : undefined,
          },
        ],
        showStorageNode: false,
      }
    case 'storage':
      return {
        stageId,
        facts: [
          {
            key: 'accountedTags',
            label: t('execution.tagGeneration.storageAccountedTags'),
            value: valueText(progress.value.storageAccountedTagCount),
          },
          {
            key: 'registeredDumpTasks',
            label: t('execution.tagGeneration.canvas.registeredDumpTasks'),
            value: storageFacts.value.windowCount === 0
              ? '—'
              : String(storageFacts.value.registeredDumpTasks),
          },
          {
            key: 'accountedWindows',
            label: t('execution.tagGeneration.canvas.accountedWindowCount'),
            value: storageFacts.value.windowCount === 0
              ? '—'
              : String(storageFacts.value.accountedWindows),
          },
        ],
        showStorageNode: true,
      }
    default:
      return {
        stageId,
        facts: [
          {
            key: 'completedParts',
            label: t('execution.tagGeneration.completedParts'),
            value: valueText(progress.value.completedPartCount),
          },
          {
            key: 'plannedParts',
            label: t('execution.tagGeneration.plannedParts'),
            value: valueText(progress.value.plannedPartCount),
          },
          {
            key: 'rollupObservations',
            label: t('execution.observations'),
            value: briefCount(stageFactById.value.get('settlement')?.evidenceCount ?? null),
          },
          ...(partStats.value.failed > 0
            ? [{
              key: 'failedParts',
              label: t('execution.stages.failure'),
              value: briefCount(partStats.value.failed),
            }]
            : []),
        ],
        showStorageNode: false,
      }
  }
})

function stageFact(stageId: string) {
  return stageFactById.value.get(stageId) ?? null
}

function stageStatus(stageId: string): ExecutionDisplayStatus {
  return stageFact(stageId)?.status ?? 'unknown'
}

function stageLabelKey(stageId: string): string {
  return props.stages.find(stage => stage.id === stageId)?.labelKey
    ?? `execution.stages.tagGeneration.${stageId}`
}

function displayStatusText(status: ExecutionDisplayStatus): string {
  switch (status) {
    case 'active':
      return t('execution.tagGeneration.canvas.stageActive')
    case 'completed':
      return t('execution.tagGeneration.states.completed')
    case 'failed':
      return t('execution.tagGeneration.states.failed')
    case 'snapshot':
      return t('execution.stages.snapshotAvailable')
    case 'observed':
      return t('execution.stages.observed')
    case 'unknown':
      return t('execution.notAvailable')
    default:
      return t('execution.stages.notObserved')
  }
}

function partStatusText(status: string): string {
  if (!status || status === 'unknown') return t('execution.notAvailable')
  if (status === 'observed') return t('execution.stages.observed')
  if (status === 'cancelled' || status === 'canceled') {
    return t('execution.tagGeneration.states.cancelled')
  }
  return tracePartStatusLabel(status, t)
}

function windowStatusText(status: string): string {
  switch (status) {
    case 'dispatchRecorded':
      return t('execution.tagGeneration.canvas.windowStatusDispatchRecorded')
    case 'accounted':
    case 'persisted':
      return t('execution.tagGeneration.canvas.windowStatusAccounted')
    // REST collapses the internal Generated and DispatchRecorded states into
    // `generating`, so both values mean generation finished. A registered
    // TagDump task is shown separately and still does not prove delivery.
    case 'generated':
    case 'generating':
      return t('execution.tagGeneration.states.generated')
    case 'failed':
      return t('execution.tagGeneration.states.failed')
    case 'cancelled':
    case 'canceled':
      return t('execution.tagGeneration.states.cancelled')
    case 'unknown':
      return t('execution.notAvailable')
    default:
      return tracePartStatusLabel(status, t)
  }
}

function windowsStateText(part: ExecutionPartDisplayFact): string {
  if (part.windows.length) return ''
  if (part.windowsRequested === false) return t('execution.tagGeneration.notRequested')
  if (part.windowsRequested === null) return t('execution.tagGeneration.canvas.windowsUnknown')
  return t('execution.tagGeneration.emptyWindows')
}

function taskStateText(
  taskId: string | null,
  status: string | null,
  source: 'snapshot' | 'observation' | null,
): string {
  if (status) return taskStatusLabel(status, t)
  if (taskId) return t('execution.notAvailable')
  return source === 'snapshot'
    ? t('execution.tagGeneration.canvas.noTask')
    : t('execution.notAvailable')
}

function valueText(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? t('execution.notAvailable') : value
}

function percentText(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function activityLabel(eventType: string): string {
  const key = `execution.activities.${eventType}`
  const label = t(key)
  return label === key ? eventType : label
}

function togglePart(key: string): void {
  emit('manual-explore')
  selectedPartKey.value = selectedPartKey.value === key ? null : key
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

/* Scene head: focus and source cue, never a second stage rail */
.scene-head {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.focus {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-width: 0;
}

.focus-label {
  color: var(--apple-gray-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.history-badge {
  padding: 2px 7px;
  color: var(--apple-purple, #7356bf);
  font-size: 10px;
  font-weight: 600;
  border: 1px solid color-mix(in srgb, var(--apple-purple, #7356bf) 35%, var(--apple-border));
  border-radius: 999px;
}

.focus-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 0;
  color: var(--apple-gray-2);
}

.focus-stage {
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.focus-ref {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 0 6px;
  font-size: 10px;
  color: var(--apple-gray-2);
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border-radius: var(--apple-radius-sm);
}

.focus-source {
  color: var(--apple-gray-3);
  font-size: 11px;
}

/* Stage brief: facts tied to the selected or source-backed focus stage */
.stage-brief {
  --brief-accent: var(--apple-blue);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px 12px;
  background: color-mix(in srgb, var(--brief-accent) 5%, var(--apple-card));
  border-left: 2px solid var(--brief-accent);
  border-radius: var(--apple-radius);
  animation: stageBriefEnter 220ms var(--apple-ease-out) both;
}

.is-replay .stage-brief,
.is-replay .cue-observed,
.is-replay .part-row,
.is-replay .progress-fill,
.is-replay .live-indicator {
  animation: none;
  transition: none;
}

@keyframes stageBriefEnter {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}


.stage-brief.status-completed { --brief-accent: var(--apple-green); }
.stage-brief.status-failed { --brief-accent: var(--apple-red); }
.stage-brief.status-observed { --brief-accent: var(--apple-purple); }
 .stage-brief.status-snapshot { --brief-accent: var(--apple-purple); }
.stage-brief.status-unknown { --brief-accent: var(--apple-gray-4); }



.brief-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.brief-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  font-weight: 650;
}

 .brief-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--brief-accent);
  font-size: 10px;
  font-weight: 600;

}
.brief-failure {
  color: var(--apple-red, #d03050);
  font-size: 10px;
}

.brief-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 6px 14px;
  margin: 0;
}

.brief-fact {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.brief-fact dt {
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.3;
}

.brief-fact dd {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-1);
  font-size: 18px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.brief-value {
  font-family: var(--apple-font-mono);
  font-size: inherit;
  font-weight: inherit;
}

.brief-note {
  color: var(--apple-gray-3);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
}

.brief-storage {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
}

.brief-storage code {
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.status-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--apple-gray-4);
}

.status-dot.observed,
.status-dot.completed {
  background: var(--apple-green);
}

.status-dot.active {
  background: var(--apple-blue);
}

.status-dot.failed {
  background: var(--apple-red, #d03050);
}

.status-dot.unknown {
  background: var(--apple-gray-4);
}
 .status-dot.snapshot { background: var(--apple-purple); }

/* Observed cues animate once; reconstructed cues never animate. */
.cue-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.cue-title {
  color: var(--apple-gray-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cue {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 1px 7px;
  overflow: hidden;
  font-size: 10px;
  color: var(--apple-gray-2);
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
}

.cue-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--apple-blue);
}

.cue-observed {
  animation: cue-in var(--apple-dur-slow, 320ms) var(--apple-ease-out) 1;
}

.cue-static {
  color: var(--apple-gray-3);
  border-style: dashed;
}

@keyframes cue-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Two independent measures, grouped so both stay visible at any width */
.measures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.measure {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.measure + .measure {
  padding-left: 18px;
  border-left: 1px solid var(--apple-border);
}

.measure-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.measure-label {
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

.measure-value {
  flex: none;
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 24px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.measure-facts {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-size: 10px;
  color: var(--apple-gray-2);
}

.measure-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  grid-column: 1 / -1;
  padding-top: 8px;
  border-top: 1px solid var(--apple-border);
}

.progress-track {
  position: relative;
  display: flex;
  align-items: center;
  height: 10px;
  overflow: hidden;
  background: var(--apple-gray-6);
  border-radius: 999px;
}

.progress-fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--apple-blue);
  border-radius: inherit;
  transform: scaleX(var(--progress-scale, 0));
  transform-origin: left center;
  transition: transform var(--apple-dur-slow) var(--apple-ease-in-out);
}

.progress-fill-storage {
  background: var(--apple-green);
}

.progress-none {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  line-height: 1;
  color: var(--apple-gray-3);
}

.fact-label {
  color: var(--apple-gray-3);
  margin-right: 4px;
}

.lag-warning {
  margin: 0;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--apple-red, #d03050);
  background: color-mix(in srgb, var(--apple-red, #d03050) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--apple-red, #d03050) 32%, var(--apple-border));
  border-radius: var(--apple-radius);
}

.lag-unknown {
  margin: 0;
  font-size: 11px;
  color: var(--apple-gray-3);
}

/* One execution field: zones share one surface, split by hairlines only */
.field {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.9fr) minmax(0, 1fr);
  grid-template-areas: 'admin parts storage';
  gap: 0 16px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.zone {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.zone + .zone {
  padding-left: 16px;
  border-left: 1px solid var(--apple-border);
}

.zone-admin {
  grid-area: admin;
}

.zone-parts {
  grid-area: parts;
}

.zone-storage {
  grid-area: storage;
}

.zone-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.zone-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
}

.zone-meta,
.zone-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.4;
}

.zone-fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 11px;
}

.zone-fact .mono {
  font-size: 12px;
  font-weight: 600;
}

.failure-note {
  color: var(--apple-red, #d03050);
}

.field-note {
  grid-column: 1 / -1;
  margin: 10px 0 0;
  padding-top: 8px;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.45;
  border-top: 1px solid var(--apple-border);
}

/* Stage lines: one row per stage, deliberately without their own box */
.stage-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-line {
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--apple-gray-2);
  font-size: 10px;
}

.stage-line.current {
  color: var(--apple-gray-1);
  font-weight: 600;
}

.stage-line.failure .stage-name,
.stage-line.failure .stage-status {
  color: var(--apple-red, #d03050);
}

.stage-status {
  color: var(--apple-gray-3);
  text-align: right;
}

.stage-line.current .stage-status {
  color: var(--apple-blue);
}

/* Selected Storage target: the dump destination of this Job */
.storage-target {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
}

.storage-target code {
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.brief-storage .muted,
.storage-target .muted {
  font-size: 10px;
}

/* Bounded part records: compact rows split by hairlines, never a card stack */
.part-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.part-item + .part-item {
  border-top: 1px solid var(--apple-border);
}

.part-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 7px 6px;
  font: inherit;
  color: var(--apple-gray-1);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--apple-radius-sm);
  cursor: pointer;
  transition: background-color var(--apple-dur-fast) var(--apple-ease-out);
}

.part-row:hover {
  background: color-mix(in srgb, var(--apple-gray-1) 4%, transparent);
}

.part-row.selected {
  background: color-mix(in srgb, var(--apple-blue) 6%, transparent);
}

.part-row:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: -2px;
}

.part-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  min-width: 0;
}

.part-title {
  font-size: 12px;
  font-weight: 600;
}

.part-row.focused .part-title {
  color: var(--apple-blue);
}

.part-row.failure .part-title {
  color: var(--apple-red, #d03050);
}

.part-attempt {
  font-size: 10px;
  color: var(--apple-gray-3);
}

.part-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-left: auto;
  font-size: 10px;
}

.live-indicator {
  display: inline-block;
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--apple-blue);
  opacity: 0.55;
}

@media (prefers-reduced-motion: no-preference) {
  .live-indicator {
    animation: tag-live-indicator-pulse 1.6s linear infinite;
  }
}

@keyframes tag-live-indicator-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

.window-table tr.row-active td:first-child {
  color: var(--apple-blue);
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
.status-chip.state-cancelled,
.status-chip.state-canceled {
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

.lag-badge {
  padding: 0 5px;
  font-size: 9px;
  line-height: 16px;
  color: var(--apple-orange, #c77700);
  border: 1px solid color-mix(in srgb, var(--apple-orange, #c77700) 38%, var(--apple-border));
  border-radius: 999px;
}

.part-facts {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 12px;
  min-width: 0;
}

.fact {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
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

.mini-windows {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 3px 10px;
  min-width: 0;
}

.mini-window {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 10px;
  color: var(--apple-gray-2);
}

.mini-window.failure {
  color: var(--apple-red, #d03050);
}

.mini-window.lagging {
  color: var(--apple-orange, #c77700);
}

.mini-task {
  color: var(--apple-gray-3);
}

.mini-window-more {
  font-size: 10px;
  color: var(--apple-gray-3);
}

/* Selected detail and final snapshot share one disclosure header style */
.part-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.detail-title-lg {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  color: var(--apple-gray-1);
}

.detail-hint {
  max-width: 62ch;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.4;
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
  min-width: 560px;
  font-size: 11px;
  border-collapse: collapse;
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
  vertical-align: top;
  border-bottom: 1px solid var(--apple-border);
}

.window-table tr.row-failure td {
  color: var(--apple-red, #d03050);
}

.window-table tr.row-lagging td {
  background: color-mix(in srgb, var(--apple-orange, #c77700) 5%, transparent);
}

/* Final snapshot stays outside the active scene */
.final-snapshot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--apple-gray-1) 3%, var(--apple-card));
  border: 1px dashed var(--apple-gray-4);
  border-radius: var(--apple-radius);
}

.detail-title {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}

.muted {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* The field keeps its reading order: Admin, parts, Storage. */
@media (max-width: 1100px) {
  .field {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'admin storage'
      'parts parts';
    gap: 12px 16px;
  }

  .zone-parts {
    padding-left: 0;
    padding-top: 12px;
    border-top: 1px solid var(--apple-border);
    border-left: 0;
  }

  .zone-storage {
    padding-left: 16px;
  }
}

@media (max-width: 720px) {
  .field {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'admin'
      'parts'
      'storage';
    gap: 0;
  }

  .zone + .zone {
    margin-top: 12px;
    padding-left: 0;
    padding-top: 12px;
    border-top: 1px solid var(--apple-border);
    border-left: 0;
  }

  .measures {
    grid-template-columns: minmax(0, 1fr);
  }

  .measure + .measure {
    padding-left: 0;
    padding-top: 10px;
    border-top: 1px solid var(--apple-border);
    border-left: 0;
  }

  .measure-value {
    font-size: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-brief {
    animation: none;
  }

  .part-row {
    transition: none;
  }
  .live-indicator {
    animation: none;
    opacity: 1;
  }


  .cue-observed {
    animation: none;
  }

  .progress-fill {
    transition: none;
  }
}
</style>
