<template>
  <section
    class="execution-stage-panel"
    :class="{ 'is-sidebar': layout === 'sidebar' }"
    :aria-labelledby="titleId"
    :aria-busy="loading || undefined"
  >


    <h2 :id="titleId" class="sr-only">{{ t('execution.stages.title') }}</h2>

    <p v-if="error" class="state-block error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="state-block" role="status">{{ t('execution.loading') }}</p>

    <div v-if="showStageNavigator" class="stage-block">

      <div class="block-head">
        <span class="block-title">{{ t('execution.stages.title') }}</span>
        <span class="latest">
          {{ t('execution.stages.latestObserved') }}:
          <span v-if="latestObservedStage" class="latest-value">{{ t(latestObservedStage.labelKey) }}</span>
          <span v-else class="muted">{{ t('execution.notAvailable') }}</span>
        </span>
      </div>

      <p v-if="!stages.length" class="muted empty">{{ t('execution.stages.empty') }}</p>
      <ol v-else class="stage-list">
        <li v-for="stage in stages" :key="stage.id" class="stage-item">
          <button
            type="button"
            class="stage-button"
            :class="{
              selected: stage.id === selectedStageId,
              current: stage.id === highlightedStageId,
              observed: stage.status === 'observed',
            }"
            :aria-pressed="stage.id === selectedStageId"
            :aria-current="stage.id === highlightedStageId ? 'step' : undefined"
            :disabled="inactive"
            @click="toggleStage(stage.id)"
          >
            <span class="stage-index mono">{{ stage.index + 1 }}</span>
            <span class="stage-label">{{ t(stage.labelKey) }}</span>
            <span class="stage-tags">
              <n-tag size="small" :bordered="false" :type="stageEvidenceTagType(stage)">
                {{ stageEvidenceLabel(stage) }}
              </n-tag>
              <n-tag v-if="stage.hasFailureEvidence" size="small" :bordered="false" type="error">
                {{ t('execution.stages.failure') }}
              </n-tag>
            </span>
          </button>
        </li>
      </ol>
    </div>

    <div class="observations-block">
      <div class="block-head">
        <span class="block-title">{{ t('execution.observations') }}</span>
        <span class="muted count">{{ filteredObservations.length }} / {{ scopedObservations.length }}</span>
      </div>

      <div class="filters" role="group" :aria-label="t('execution.observationFilters.title')">
        <label class="filter">
          <span class="filter-label">{{ t('execution.observationFilters.category') }}</span>
          <select
            class="filter-select"
            :value="categoryFilter"
            :disabled="inactive"
            @change="onFilterChange('category', $event)"
          >
            <option value="all">{{ t('execution.observationFilters.all') }}</option>
            <option v-for="value in categoryOptions" :key="value" :value="value">
              {{ enumLabel('categories', value) }}
            </option>
          </select>
        </label>
        <label class="filter">
          <span class="filter-label">{{ t('execution.observationFilters.phase') }}</span>
          <select
            class="filter-select"
            :value="phaseFilter"
            :disabled="inactive"
            @change="onFilterChange('phase', $event)"
          >
            <option value="all">{{ t('execution.observationFilters.all') }}</option>
            <option v-for="value in phaseOptions" :key="value" :value="value">
              {{ enumLabel('phases', value) }}
            </option>
          </select>
        </label>
        <label class="filter">
          <span class="filter-label">{{ t('execution.observationFilters.source') }}</span>
          <select
            class="filter-select"
            :value="sourceFilter"
            :disabled="inactive"
            @change="onFilterChange('source', $event)"
          >
            <option value="all">{{ t('execution.observationFilters.all') }}</option>
            <option v-for="value in sourceOptions" :key="value" :value="value">{{ value }}</option>
          </select>
        </label>
        <button
          type="button"
          class="text-button"
          :disabled="inactive || !hasFilters"
          @click="clearFilters"
        >
          {{ t('execution.observationFilters.clear') }}
        </button>
      </div>

      <div v-if="selectedStage" class="scope-row">
        <span>
          {{ t('execution.observationFilters.stageScope') }}:
          <span class="scope-value">{{ t(selectedStage.labelKey) }}</span>
        </span>
        <button type="button" class="text-button" :disabled="inactive" @click="emit('select-stage', null)">
          {{ t('execution.observationFilters.clearStageScope') }}
        </button>
      </div>

      <div class="observation-workspace">
        <div class="observation-list">
          <p v-if="!filteredObservations.length" class="muted empty">{{ observationEmptyText }}</p>
          <ul v-else class="obs-list">
            <li v-for="observation in visibleObservations" :key="observation.observationId">
              <button
                type="button"
                class="obs-button"
                :class="{ selected: observation.observationId === selectedObservationId }"
                :aria-pressed="observation.observationId === selectedObservationId"
                :disabled="inactive"
                @click="selectObservation(observation)"
              >
                <span class="obs-times">
                  <span class="obs-time-row">
                    <span class="obs-time-label">{{ t('execution.observationDetail.adminTime') }}</span>
                    <span class="mono">{{ formatDateTime(observation.recordedAtMs) }}</span>
                  </span>
                  <span class="obs-time-row">
                    <span class="obs-time-label">{{ t('execution.observationDetail.sourceTime') }}</span>
                    <span class="mono">
                      {{ observation.eventTimeMs === null ? t('execution.notAvailable') : formatDateTime(observation.eventTimeMs) }}
                    </span>
                  </span>
                </span>
                <span class="obs-main">
                  <span class="obs-event">{{ activityLabel(observation) }}</span>
                  <span class="obs-meta mono">{{ observation.eventType }}</span>
                  <span class="obs-meta">
                    <span>{{ enumLabel('categories', observation.category) }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ enumLabel('phases', observation.phase) }}</span>
                  </span>
                  <span class="obs-meta">
                    <span>{{ observation.source.component ?? t('execution.notAvailable') }}</span>
                    <span v-if="observation.source.nodeId" class="mono obs-node">{{ observation.source.nodeId }}</span>
                    <span v-if="observation.source.quality">
                      {{ enumLabel('sourceQuality', observation.source.quality) }}
                    </span>
                  </span>
                </span>
                <span class="obs-tags">
                  <n-tag v-if="observation.coverage" size="small" :bordered="false">
                    {{ enumLabel('coverageState', observation.coverage) }}
                  </n-tag>
                  <n-tag
                    v-if="observation.outcome"
                    size="small"
                    :bordered="false"
                    :type="outcomeTagType(observation.outcome)"
                  >
                    {{ enumLabel('outcomes', observation.outcome) }}
                  </n-tag>
                </span>
              </button>
            </li>
          </ul>
          <nav
            v-if="filteredObservations.length > OBSERVATION_PAGE_SIZE"
            class="list-pagination"
            :aria-label="t('execution.pagination.navigation')"
          >
            <button
              type="button"
              class="text-button"
              :disabled="inactive || observationPage <= 1"
              @click="changeObservationPage(-1)"
            >
              {{ t('execution.pagination.previous') }}
            </button>
            <span class="pagination-status" aria-live="polite">
              {{ t('execution.pagination.status', {
                page: observationPage,
                pages: observationPageCount,
                count: filteredObservations.length,
              }) }}
            </span>
            <button
              type="button"
              class="text-button"
              :disabled="inactive || observationPage >= observationPageCount"
              @click="changeObservationPage(1)"
            >
              {{ t('execution.pagination.next') }}
            </button>
          </nav>
        </div>

        <aside class="observation-detail" :aria-label="t('execution.observationDetail.title')">
          <div class="block-head">
            <span class="block-title">{{ t('execution.observationDetail.title') }}</span>
            <span v-if="selectedObservation" class="mono detail-id">{{ selectedObservation.observationId }}</span>
          </div>
          <p v-if="!selectedObservation" class="muted empty">{{ t('execution.observationDetail.prompt') }}</p>
          <div v-else class="detail-groups">
            <dl v-for="group in detailGroups" :key="group.key" class="detail-group">
              <dt class="detail-group-title">{{ group.title }}</dt>
              <dd class="detail-fields">
                <span v-for="field in group.fields" :key="field.key" class="detail-field">
                  <span class="detail-label">{{ field.label }}</span>
                  <span class="detail-value" :class="{ mono: field.mono }">{{ field.value }}</span>
                </span>
              </dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>

    <div class="replay-bar">
      <div class="block-head">
        <span class="block-title">{{ t('execution.replay.title') }}</span>
        <span class="muted replay-state">{{ replayStateText }}</span>
      </div>

      <p v-if="!sortedReplay.length" class="muted empty">{{ t('execution.replay.noEvents') }}</p>
      <template v-else>
        <div class="replay-controls">
          <button
            type="button"
            class="toggle-button"
            :class="{ selected: followLatest }"
            :aria-pressed="followLatest"
            :disabled="inactive"
            @click="emit('follow-latest')"
          >
            {{ followLatest ? t('execution.replay.live') : t('execution.replay.follow') }}
          </button>

          <n-button size="small" :disabled="inactive || sortedReplay.length === 0" @click="togglePlayback">
            {{ replayIsPlaying ? t('execution.replay.pause') : t('execution.replay.start') }}
          </n-button>

          <n-button size="small" :disabled="inactive || replayIndex <= 0" @click="emit('step', -1)">
            {{ t('execution.replay.previous') }}
          </n-button>
          <n-button
            size="small"
            :disabled="inactive || replayIndex >= sortedReplay.length - 1"
            @click="emit('step', 1)"
          >
            {{ t('execution.replay.next') }}
          </n-button>

          <label class="slider-wrap">
            <span class="filter-label">{{ t('execution.replay.position') }}</span>
            <input
              class="position-slider"
              type="range"
              min="0"
              :max="Math.max(sortedReplay.length - 1, 0)"
              step="1"
              :value="sliderIndex"
              :aria-valuetext="positionText"
              :disabled="inactive || sortedReplay.length < 2"
              @input="onSliderInput"
            />
            <span class="mono position-text" aria-live="polite">{{ positionText }}</span>
          </label>

          <div class="speeds" role="group" :aria-label="t('execution.replay.speed')">
            <span class="filter-label">{{ t('execution.replay.speed') }}</span>
            <button
              v-for="speed in PLAYBACK_SPEEDS"
              :key="speed"
              type="button"
              class="speed-button"
              :class="{ selected: speed === playbackSpeed }"
              :aria-pressed="speed === playbackSpeed"
              :disabled="inactive"
              @click="emit('speed-change', speed)"
            >
              {{ speed }}×
            </button>
          </div>
          <div class="speeds" role="group" :aria-label="t('execution.replay.tempo')">
            <span class="filter-label">{{ t('execution.replay.tempo') }}</span>
            <button
              v-for="tempo in PLAYBACK_TEMPOS"
              :key="tempo"
              type="button"
              class="speed-button"
              :class="{ selected: tempo === playbackTempo }"
              :aria-pressed="tempo === playbackTempo"
              :disabled="inactive"
              @click="emit('tempo-change', tempo)"
            >
              {{ t(`execution.replay.${tempo}Tempo`) }}
            </button>
          </div>
        </div>
        <p v-if="pointerMissing" class="replay-warning" role="status">
          {{ t('execution.replay.pointerMissing') }}
        </p>
        <p class="replay-hint muted">{{ followLatest ? t('execution.replay.liveHint') : t('execution.replay.pinned') }}</p>
        <p class="replay-hint muted">{{ t('execution.replay.tempoHint') }}</p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import type {
  TraceObservation,
  TraceObservationCategory,
  TraceObservationOutcome,
  TraceObservationPhase,
  TraceSourceComponent,
} from '@/api/trace'
import type { ExecutionStage } from '@/features/execution/data/executionStages'
import {
  PLAYBACK_SPEEDS,
  sortReplayObservations,
  type PlaybackSpeed,
  type PlaybackTempo,
} from '@/features/execution/data/executionViewState'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'

const PLAYBACK_TEMPOS: readonly PlaybackTempo[] = ['compact', 'recorded']

/**
 * Stage navigation, structured observation exploration and historical replay.
 *
 * Every fact rendered here comes from the props: stage status is only
 * `observed`/`notObserved`, replay only moves across real observation IDs in
 * `(recordedAtMs, observationId)` order, and no selection or playback state is
 * held internally. Filters are local, but changing them asks the parent to
 * leave follow mode.
 */

const props = withDefaults(defineProps<{
  /** Ordered, kind-specific stage projection; never re-sorted or extended here. */
  stages: readonly ExecutionStage[]
  latestObservedStageId: string | null
  observations: readonly TraceObservation[]
  /** Full history for the pointer controls; rendered evidence stays prefix-scoped. */
  replayObservations?: readonly TraceObservation[]
  selectedStageId: string | null
  selectedObservationId: string | null
  followLatest: boolean
  /** `null` means live; otherwise a real observation ID. */
  replayObservationId: string | null
  replayIsPlaying: boolean
  playbackSpeed: PlaybackSpeed
  playbackTempo?: PlaybackTempo
  disabled?: boolean
  loading?: boolean
  error?: string | null
  showStageNavigator?: boolean
  highlightedStageId?: string | null
  layout?: 'full' | 'sidebar'
}>(), {
  playbackTempo: 'compact',
  disabled: false,
  loading: false,
  error: null,
  showStageNavigator: true,
  highlightedStageId: null,
  layout: 'full',
})


const emit = defineEmits<{
  (event: 'select-stage', stageId: string | null): void
  (event: 'select-observation', observationId: string, stageId: string | null): void
  (event: 'follow-latest'): void
  (event: 'replay-pointer', observationId: string | null): void
  (event: 'playback-start'): void
  (event: 'playback-pause'): void
  (event: 'step', delta: -1 | 1): void
  (event: 'speed-change', speed: PlaybackSpeed): void
  (event: 'tempo-change', tempo: PlaybackTempo): void
  /** Filters changed: the parent should leave follow mode. */
  (event: 'manual-explore'): void
}>()

const { t } = useI18n()
const OBSERVATION_PAGE_SIZE = 50
const titleId = `execution-stage-panel-${useId()}`

const inactive = computed(() => props.disabled || props.loading)

const stageById = computed(() => {
  const map = new Map<string, ExecutionStage>()
  for (const stage of props.stages) map.set(stage.id, stage)
  return map
})

const stageIdByObservation = computed(() => {
  const map = new Map<string, string>()
  for (const stage of props.stages) {
    for (const evidence of stage.evidence) map.set(evidence.observationId, stage.id)
  }
  return map
})

const latestObservedStage = computed<ExecutionStage | null>(() => {
  if (!props.latestObservedStageId) return null
  return stageById.value.get(props.latestObservedStageId) ?? null
})

const selectedStage = computed<ExecutionStage | null>(() => {
  if (!props.selectedStageId) return null
  return stageById.value.get(props.selectedStageId) ?? null
})

/** A stage selection narrows the list to that stage's own evidence. */
const scopedObservations = computed<readonly TraceObservation[]>(() => {
  const stage = selectedStage.value
  if (!stage) return props.observations
  const ids = new Set(stage.evidence.map(evidence => evidence.observationId))
  return props.observations.filter(observation => ids.has(observation.observationId))
})

// ── Local filters (presentation only) ──

type FilterValue<T extends string> = T | 'all'

const categoryFilter = ref<FilterValue<TraceObservationCategory>>('all')
const phaseFilter = ref<FilterValue<TraceObservationPhase>>('all')
const sourceFilter = ref<FilterValue<TraceSourceComponent>>('all')
const observationPage = ref(1)

function uniqueValues<T extends string>(values: readonly (T | null)[]): T[] {
  const seen = new Set<T>()
  for (const value of values) if (value !== null) seen.add(value)
  return [...seen].sort()
}

const categoryOptions = computed(() => uniqueValues(props.observations.map(item => item.category)))
const phaseOptions = computed(() => uniqueValues(props.observations.map(item => item.phase)))
const sourceOptions = computed(() => uniqueValues(props.observations.map(item => item.source.component)))

const hasFilters = computed(
  () => categoryFilter.value !== 'all' || phaseFilter.value !== 'all' || sourceFilter.value !== 'all',
)

const filteredObservations = computed(() =>
  sortReplayObservations(
    scopedObservations.value.filter(observation => {
      if (categoryFilter.value !== 'all' && observation.category !== categoryFilter.value) return false
      if (phaseFilter.value !== 'all' && observation.phase !== phaseFilter.value) return false
      if (sourceFilter.value !== 'all' && observation.source.component !== sourceFilter.value) return false
      return true
    }),
  ),
)
const observationPageCount = computed(() =>
  Math.max(1, Math.ceil(filteredObservations.value.length / OBSERVATION_PAGE_SIZE)),
)
const visibleObservations = computed(() => {
  const start = (observationPage.value - 1) * OBSERVATION_PAGE_SIZE
  return filteredObservations.value.slice(start, start + OBSERVATION_PAGE_SIZE)
})

let pageNavigationInProgress = false
watch(() => filteredObservations.value.length, () => {
  if (observationPage.value > observationPageCount.value) {
    observationPage.value = observationPageCount.value
  }
})
watch(() => props.selectedStageId, () => {
  observationPage.value = 1
})
watch(() => props.selectedObservationId, (selectedId) => {
  if (pageNavigationInProgress || !selectedId) return
  const index = filteredObservations.value.findIndex(item => item.observationId === selectedId)
  if (index >= 0) observationPage.value = Math.floor(index / OBSERVATION_PAGE_SIZE) + 1
}, { immediate: true })

const observationEmptyText = computed(() =>
  scopedObservations.value.length === 0 ? t('execution.noObservations') : t('execution.observationFilters.noMatches'),
)

function onFilterChange(kind: 'category' | 'phase' | 'source', event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (kind === 'category') categoryFilter.value = value as FilterValue<TraceObservationCategory>
  if (kind === 'phase') phaseFilter.value = value as FilterValue<TraceObservationPhase>
  if (kind === 'source') sourceFilter.value = value as FilterValue<TraceSourceComponent>
  observationPage.value = 1
  emit('manual-explore')
}

function clearFilters(): void {
  categoryFilter.value = 'all'
  phaseFilter.value = 'all'
  sourceFilter.value = 'all'
  observationPage.value = 1
  emit('manual-explore')
}

async function changeObservationPage(delta: -1 | 1): Promise<void> {
  const next = Math.min(observationPageCount.value, Math.max(1, observationPage.value + delta))
  if (next === observationPage.value) return
  pageNavigationInProgress = true
  emit('manual-explore')
  observationPage.value = next
  await nextTick()
  pageNavigationInProgress = false
}


function toggleStage(stageId: string): void {
  emit('select-stage', stageId === props.selectedStageId ? null : stageId)
}

function selectObservation(observation: TraceObservation): void {
  emit(
    'select-observation',
    observation.observationId,
    stageIdByObservation.value.get(observation.observationId) ?? null,
  )
}

function outcomeTagType(outcome: TraceObservationOutcome) {
  if (outcome === 'succeeded') return 'success'
  if (outcome === 'failed') return 'error'
  return 'warning'
}

function stageEvidenceLabel(stage: ExecutionStage): string {
  if (stage.status === 'notObserved') return t('execution.stages.notObserved')
  if (stage.evidence.some(evidence => evidence.source.quality === 'observed')) {
    return t('execution.stages.observed')
  }
  if (stage.evidence.some(evidence => evidence.source.quality === 'reconstructed')) {
    return t('execution.stages.reconstructed')
  }
  return t('execution.stages.qualityUnknown')
}

function stageEvidenceTagType(stage: ExecutionStage): 'default' | 'success' | 'warning' {
  if (stage.status === 'notObserved') return 'default'
  if (stage.evidence.some(evidence => evidence.source.quality === 'observed')) return 'success'
  if (stage.evidence.some(evidence => evidence.source.quality === 'reconstructed')) return 'warning'
  return 'default'
}

type ObservationLabelGroup = 'categories' | 'phases' | 'sourceQuality' | 'coverageState' | 'outcomes'

function enumLabel(group: ObservationLabelGroup, value: string | null): string {
  return value ? t(`execution.${group}.${value}`) : t('execution.notAvailable')
}
const ACTIVITY_METRIC_KEYS = [
  'plannedPartCount',
  'blockCount',
  'challengeCount',
  'challengedTagCount',
  'generatedCount',
  'completedPartCount',
  'tagCount',
] as const

function activityLabel(observation: TraceObservation): string {
  const key = `execution.activities.${observation.eventType}`
  const translated = t(key)
  const base = translated === key
    ? `${t('execution.observationDetail.eventType')}: ${observation.eventType}`
    : translated
  const scope: string[] = []
  const partIndex = observation.refs.partIndex
  const windowIndex = observation.refs.windowIndex
  if (partIndex !== null && Number.isInteger(partIndex) && partIndex >= 0) {
    scope.push(`${t('execution.tagGeneration.part')} ${partIndex}`)
  }
  if (windowIndex !== null && Number.isInteger(windowIndex) && windowIndex >= 0) {
    scope.push(`${t('execution.tagGeneration.window')} ${windowIndex}`)
  }
  const metrics = ACTIVITY_METRIC_KEYS.flatMap((metric) => {
    const value = observation.metrics[metric]
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return []
    return [`${t(`execution.activityMetrics.${metric}`)}: ${value}`]
  })
  const scopeText = scope.length ? `[${scope.join(' / ')}]` : ''
  const metricsText = metrics.length ? `(${metrics.join(', ')})` : ''
  return [scopeText, base, metricsText].filter(Boolean).join(' ')
}


// ── Selected observation detail ──

interface DetailField {
  key: string
  label: string
  value: string
  mono: boolean
}

interface DetailGroup {
  key: string
  title: string
  fields: DetailField[]
}

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? t('execution.notAvailable') : String(value)
}

function field(key: string, label: string, value: string | number | null | undefined, mono = false): DetailField {
  return { key, label, value: text(value), mono }
}

const selectedObservation = computed<TraceObservation | null>(() => {
  if (!props.selectedObservationId) return null
  return props.observations.find(item => item.observationId === props.selectedObservationId) ?? null
})

/** Only closed, scalar fields: identifiers stay separate and no payload is read. */
const detailGroups = computed<DetailGroup[]>(() => {
  const observation = selectedObservation.value
  if (!observation) return []

  const metricFields = Object.entries(observation.metrics)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => {
      const labelKey = `execution.activityMetrics.${key}`
      const label = t(labelKey)
      return field(key, label === labelKey ? key : label, value, true)
    })

  return [
    {
      key: 'attributes',
      title: t('execution.observationDetail.attributes'),
      fields: [
        field('eventType', t('execution.observationDetail.eventType'), observation.eventType),
        field('category', t('execution.observationDetail.category'), observation.category),
        field('phase', t('execution.observationDetail.phase'), observation.phase),
        field('coverage', t('execution.observationDetail.coverage'), observation.coverage),
        field('outcome', t('execution.observationDetail.outcome'), observation.outcome),
      ],
    },
    {
      key: 'references',
      title: t('execution.observationDetail.references'),
      fields: [
        field('observationId', t('execution.observationDetail.observationId'), observation.observationId, true),
        field('jobId', t('execution.observationDetail.jobId'), observation.jobId, true),
        field('taskId', t('execution.observationDetail.taskId'), observation.refs.taskId, true),
        field('requestId', t('execution.observationDetail.requestId'), observation.refs.requestId, true),
        field('packetId', t('execution.observationDetail.packetId'), observation.refs.packetId, true),
        field('operationId', t('execution.observationDetail.operationId'), observation.refs.operationId, true),
        field('algorithmId', t('execution.observationDetail.algorithmId'), observation.refs.algorithmId, true),
        field('partIndex', t('execution.observationDetail.partIndex'), observation.refs.partIndex, true),
        field('windowIndex', t('execution.observationDetail.windowIndex'), observation.refs.windowIndex, true),
        field('attempt', t('execution.observationDetail.attempt'), observation.refs.attempt, true),
      ],
    },
    {
      key: 'source',
      title: t('execution.observationDetail.source'),
      fields: [
        field('component', t('execution.source'), observation.source.component),
        field('nodeId', t('execution.observationDetail.sourceNode'), observation.source.nodeId, true),
        field('quality', t('execution.observationDetail.quality'), observation.source.quality),
      ],
    },
    {
      key: 'timeline',
      title: t('execution.observationDetail.timeline'),
      fields: [
        field('adminTime', t('execution.observationDetail.adminTime'), formatDateTime(observation.recordedAtMs)),
        field(
          'sourceTime',
          t('execution.observationDetail.sourceTime'),
          observation.eventTimeMs === null ? null : formatDateTime(observation.eventTimeMs),
        ),
      ],
    },
    {
      key: 'metrics',
      title: t('execution.observationDetail.metrics'),
      fields: metricFields.length
        ? metricFields
        : [{ key: 'noMetrics', label: t('execution.observationDetail.metrics'), value: t('execution.observationDetail.noMetrics'), mono: false }],
    },
  ]
})

// ── Replay (controlled by the parent) ──

const sortedReplay = computed(() =>
  sortReplayObservations(props.replayObservations ?? props.observations),
)

const replayIndex = computed(() => {
  if (props.replayObservationId === null) return -1
  return sortedReplay.value.findIndex(item => item.observationId === props.replayObservationId)
})

const pointerMissing = computed(
  () => props.replayObservationId !== null && replayIndex.value < 0,
)

/** Live sits at the newest event; the slider never invents an event of its own. */
const sliderIndex = computed(() =>
  replayIndex.value >= 0 ? replayIndex.value : Math.max(sortedReplay.value.length - 1, 0),
)

const positionText = computed(() => {
  if (replayIndex.value < 0) return t('execution.replay.live')
  return `${replayIndex.value + 1} / ${sortedReplay.value.length}`
})

const replayStateText = computed(() => {
  if (props.replayIsPlaying) return t('execution.replay.playing')
  if (replayIndex.value >= 0) return t('execution.replay.paused')
  return props.followLatest ? t('execution.replay.live') : t('execution.replay.freeExplore')
})

function togglePlayback(): void {
  if (props.replayIsPlaying) emit('playback-pause')
  else emit('playback-start')
}

function onSliderInput(event: Event): void {
  const input = event.target as HTMLInputElement
  const index = Number(input.value)
  const target = sortedReplay.value[Math.min(Math.max(index, 0), sortedReplay.value.length - 1)]
  if (!target) return
  if (target.observationId !== props.replayObservationId) emit('replay-pointer', target.observationId)
}
</script>

<style scoped>
.execution-stage-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.state-block {
  margin: 0;
  padding: 8px 0;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.state-block.error {
  color: var(--apple-red, #d03050);
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.block-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--apple-gray-1);
}

.latest,
.count,
.replay-state {
  font-size: 12px;
  color: var(--apple-gray-3);
}

.latest-value,
.scope-value {
  color: var(--apple-gray-1);
  font-weight: 500;
}

.muted {
  color: var(--apple-gray-3);
}

.empty {
  margin: 0;
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

/* Stages */

.stage-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.stage-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--apple-gray-2);
  text-align: left;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.stage-button.observed {
  border-color: color-mix(in srgb, var(--apple-blue) 35%, var(--apple-border));
}

.stage-button.selected {
  border-color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
}
 .stage-button.current:not(.selected) {
  border-color: color-mix(in srgb, var(--apple-blue) 65%, var(--apple-border));
}

.stage-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.stage-index {
  min-width: 16px;
  color: var(--apple-gray-3);
}

.stage-label {
  font-weight: 500;
  color: var(--apple-gray-1);
}

.stage-tags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Filters */

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-top: 10px;
}

.filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  color: var(--apple-gray-3);
}

.filter-select {
  min-width: 120px;
  padding: 5px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--apple-gray-1);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
}

.text-button {
  padding: 4px 2px;
  font: inherit;
  font-size: 12px;
  color: var(--apple-blue);
  background: none;
  border: none;
  cursor: pointer;
}

.text-button:disabled {
  color: var(--apple-gray-3);
  cursor: not-allowed;
}

.scope-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--apple-gray-2);
  background: color-mix(in srgb, var(--apple-blue) 6%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
}

/* Observation list + detail */

.observation-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.85fr);
  gap: 16px;
  margin-top: 12px;
  align-items: start;
}

.observation-list {
  min-width: 0;
}

.obs-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 420px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}
.list-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

.pagination-status {
  color: var(--apple-gray-3);
  font-size: 11px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}


.obs-button {
  display: grid;
  grid-template-columns: minmax(140px, auto) minmax(0, 1fr) auto;
  align-items: start;
  gap: 4px 12px;
  width: 100%;
  padding: 8px 10px;
  font: inherit;
  font-size: 12px;
  text-align: left;
  color: var(--apple-gray-2);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.obs-button.selected {
  border-color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
}

.obs-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.obs-times {
  display: flex;
  flex-direction: column;
  gap: 1px;
  color: var(--apple-gray-3);
  white-space: nowrap;
}

.obs-time-row {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.obs-time-label {
  font-size: 10px;
  color: var(--apple-gray-3);
}

.obs-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.obs-event {
  font-weight: 500;
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.obs-meta {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  gap: 6px;
  overflow-wrap: anywhere;
  font-size: 11px;
  color: var(--apple-gray-3);
}

.obs-meta.mono {
  display: block;
  overflow-wrap: anywhere;
  white-space: normal;
}

.obs-node {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-tags {
  display: inline-flex;
  gap: 4px;
  grid-column: 3;
  justify-self: end;
}

.observation-detail {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.detail-id {
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--apple-gray-3);
}

.detail-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  padding: 12px;
  overflow: auto;
  background: var(--apple-gray-7);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
}

.detail-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.detail-group + .detail-group {
  padding-top: 11px;
  border-top: 1px solid var(--apple-border);
}

.detail-group-title {
  font-size: 10px;
  font-weight: 650;
  color: var(--apple-gray-3);
  letter-spacing: 0.03em;
}

.detail-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 4px 12px;
  margin: 0;
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.detail-label {
  font-size: 11px;
  color: var(--apple-gray-3);
}

.detail-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

/* Replay */

.replay-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--apple-border);
}

.replay-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.toggle-button,
.speed-button {
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--apple-gray-2);
  background: var(--apple-card);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.toggle-button.selected,
.speed-button.selected {
  color: var(--apple-gray-1);
  border-color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
}

.toggle-button:disabled,
.speed-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.slider-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  flex: 1 1 220px;
}

.position-slider {
  flex: 1 1 auto;
  min-width: 120px;
  accent-color: var(--apple-blue);
}

.position-text {
  min-width: 48px;
  color: var(--apple-gray-2);
  text-align: right;
}

.speeds {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.replay-hint,
.replay-warning {
  margin: 0;
  font-size: 11px;
}

.replay-warning {
  color: var(--apple-orange, #c77700);
}

.stage-button:focus-visible,
.obs-button:focus-visible,
.toggle-button:focus-visible,
.speed-button:focus-visible,
.text-button:focus-visible,
.filter-select:focus-visible,
.position-slider:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}
 .execution-stage-panel.is-sidebar .observation-workspace {
  grid-template-columns: minmax(0, 1fr);
}

.execution-stage-panel.is-sidebar .observation-detail {
  position: static;
  max-height: none;
}

.execution-stage-panel.is-sidebar .obs-list {
  max-height: 300px;
}

.execution-stage-panel.is-sidebar .obs-button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
}

.execution-stage-panel.is-sidebar .obs-times {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 2px 10px;
}

.execution-stage-panel.is-sidebar .obs-tags {
  grid-column: auto;
  margin-top: 1px;
}

.execution-stage-panel.is-sidebar .observation-detail {
  padding: 10px;
}

.execution-stage-panel.is-sidebar .detail-fields {
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
}

.execution-stage-panel.is-sidebar .detail-groups {
  gap: 9px;
}

.execution-stage-panel.is-sidebar .replay-controls {
  gap: 6px;
}

.execution-stage-panel.is-sidebar .slider-wrap {
  flex-basis: 100%;
}


@media (max-width: 960px) {

  .observation-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .observation-detail {
    position: static;
    max-height: none;
  }
}

@media (max-width: 640px) {
  .obs-button {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .obs-times {
    grid-column: 1 / -1;
  }

  .obs-tags {
    grid-column: 2;
    grid-row: 1;
  }

  .slider-wrap {
    flex-basis: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-button,
  .obs-button,
  .toggle-button,
  .speed-button {
    transition: none;
  }
}
</style>
