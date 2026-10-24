<template>
  <section class="stage-details-card" :aria-label="t('execution.stageDetails.title')">
    <header class="stage-details-header">
      <div>
        <p class="stage-details-eyebrow">{{ t('execution.stageDetails.title') }}</p>
        <h3>{{ stageLabel }}</h3>
      </div>
      <span class="stage-details-mode">{{ t(isReplay ? 'execution.stageDetails.replayEvidence' : 'execution.stageDetails.liveEvidence') }}</span>
    </header>

    <section class="stage-details-section">
      <h4>{{ t('execution.stageDetails.jobParticipants') }}</h4>
      <ul v-if="jobParticipants.length" class="stage-user-list">
        <li v-for="user in jobParticipants" :key="`${user.role}:${user.userId}`">
          <span class="stage-detail-label">{{ t(`execution.stageDetails.userRoles.${user.role}`) }}</span>
          <span class="stage-user-value">
            <strong v-if="user.userName">{{ user.userName }}</strong>
            <code :title="user.userId">{{ user.userName ? ` (${user.userId})` : user.userId }}</code>
          </span>
          <span class="stage-detail-source">
            {{ t(`execution.stageDetails.sources.${user.source}`) }}
            <template v-if="user.nameSource !== user.source"> · {{ t(`execution.stageDetails.sources.${user.nameSource}`) }}</template>
          </span>
        </li>
      </ul>
      <p v-else class="stage-details-empty">{{ t('execution.stageDetails.usersUnavailable') }}</p>
    </section>

    <section
      v-if="kind === 'identityVerification' || dataOwners.length || identityDataOwnerCount !== null || unlistedIdentityDataOwnerCount !== null"
      class="stage-details-section"
    >
      <h4>{{ t(kind === 'identityVerification' ? 'execution.stageDetails.identityDataOwners' : 'execution.stageDetails.dataOwners') }}</h4>
      <ul v-if="dataOwners.length" class="stage-user-list">
        <li v-for="user in dataOwners" :key="`${user.role}:${user.userId}`">
          <span class="stage-detail-label">{{ t('execution.stageDetails.userRoles.dataOwner') }}</span>
          <span class="stage-user-value">
            <strong v-if="user.userName">{{ user.userName }}</strong>
            <code :title="user.userId">{{ user.userName ? ` (${user.userId})` : user.userId }}</code>
          </span>
          <span class="stage-detail-source">
            {{ t(`execution.stageDetails.sources.${user.source}`) }}
            <template v-if="user.nameSource !== user.source"> · {{ t(`execution.stageDetails.sources.${user.nameSource}`) }}</template>
          </span>
        </li>
      </ul>
      <p v-else class="stage-details-empty">{{ t('execution.stageDetails.usersUnavailable') }}</p>
      <p v-if="identityDataOwnerCount !== null" class="stage-details-note">
        {{ t('execution.stageDetails.identityDataOwnerCount', { count: identityDataOwnerCount }) }}
        <span v-if="identityDataOwnerCountSource" class="stage-detail-source">{{ t(`execution.stageDetails.sources.${identityDataOwnerCountSource}`) }}</span>
      </p>
      <p v-if="unlistedIdentityDataOwnerCount !== null" class="stage-details-note stage-details-warning">
        {{ t('execution.stageDetails.identityDataOwnerIdsUnavailable', { count: unlistedIdentityDataOwnerCount }) }}
      </p>
    </section>

    <section v-if="otherUsers.length" class="stage-details-section">
      <h4>{{ t('execution.stageDetails.otherUsers') }}</h4>
      <ul class="stage-user-list">
        <li v-for="user in otherUsers" :key="`${user.role}:${user.userId}`">
          <span class="stage-detail-label">{{ t('execution.stageDetails.userRoles.user') }}</span>
          <span class="stage-user-value">
            <strong v-if="user.userName">{{ user.userName }}</strong>
            <code :title="user.userId">{{ user.userName ? ` (${user.userId})` : user.userId }}</code>
          </span>
          <span class="stage-detail-source">
            {{ t(`execution.stageDetails.sources.${user.source}`) }}
            <template v-if="user.nameSource !== user.source"> · {{ t(`execution.stageDetails.sources.${user.nameSource}`) }}</template>
          </span>
        </li>
      </ul>
    </section>

    <section v-if="rootHash" class="stage-details-section">
      <h4>{{ t('execution.stageDetails.rootHash') }}</h4>
      <p v-if="!rootHash.completionVisible" class="stage-details-empty">
        {{ t('execution.stageDetails.rootHashNotObserved') }}
      </p>
      <dl v-else class="stage-detail-list">
        <div v-for="(fact, index) in rootHash.presenceFacts" :key="`root-presence-${index}`">
          <dt>{{ t('execution.businessMetrics.rootHashPresence') }}</dt>
          <dd>
            {{ t(fact.present ? 'execution.businessMetrics.present' : 'execution.businessMetrics.notPresent') }}
            <span class="stage-detail-source">{{ t(`execution.stageDetails.sources.${fact.source}`) }}</span>
          </dd>
        </div>
        <div v-if="rootHash.ownerRootHashCount">
          <dt>{{ t('execution.stageDetails.ownerRootHashCount') }}</dt>
          <dd class="mono">
            {{ rootHash.ownerRootHashCount.value }}
            <span class="stage-detail-source">{{ t(`execution.stageDetails.sources.${rootHash.ownerRootHashCount.source}`) }}</span>
          </dd>
        </div>
        <div v-if="rootHash.rootHashValue">
          <dt>{{ t('execution.stageDetails.rootHashValue') }}</dt>
          <dd class="mono stage-hash-value">
            {{ rootHash.rootHashValue.value }}
            <span class="stage-detail-source">{{ t(`execution.stageDetails.sources.${rootHash.rootHashValue.source}`) }}</span>
          </dd>
        </div>
        <p v-if="rootHash.presenceFacts.length === 0 && !rootHash.ownerRootHashCount && !rootHash.rootHashValue" class="stage-details-empty">
          {{ t('execution.stageDetails.rootHashValueUnavailable') }}
        </p>
      </dl>
    </section>

    <section v-if="stagePartRows.rows.length" class="stage-details-section">
      <h4>{{ t('execution.stageDetails.parts') }}</h4>
      <ul class="stage-part-list">
        <li v-for="row in stagePartRows.rows" :key="`${row.fact.partIndex}:${row.fact.attempt ?? ''}`">
          <header class="stage-part-heading">
            <h5>
              {{ t('execution.tagGeneration.part') }} {{ row.fact.partIndex }}
              <template v-if="row.fact.attempt !== null"> · {{ t('execution.tagGeneration.attempt') }} {{ row.fact.attempt }}</template>
            </h5>
            <span>{{ partStateLabel(row.fact.status) }}</span>
          </header>
          <p class="stage-detail-source">{{ t(`execution.stageDetails.sources.${row.fact.source === 'snapshot' ? 'partSnapshot' : 'observation'}`) }}</p>
          <dl class="stage-detail-list stage-part-facts">
            <div>
              <dt>{{ t('execution.tagGeneration.plannedBlocks') }}</dt>
              <dd class="mono">{{ valueLabel(row.fact.plannedBlockCount) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.generatedBlocks') }}</dt>
              <dd class="mono">{{ valueLabel(row.fact.generatedBlockCount) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.storageAccountedTags') }}</dt>
              <dd class="mono">{{ valueLabel(row.fact.storageAccountedTagCount) }}</dd>
            </div>
            <div>
              <dt>{{ t('execution.tagGeneration.generateTask') }}</dt>
              <dd class="mono">
                {{ valueLabel(row.fact.generateTaskId) }}
                <template v-if="row.fact.generateTaskStatus"> · {{ taskStatusLabel(row.fact.generateTaskStatus, t) }}</template>
              </dd>
            </div>
          </dl>
          <ul v-if="row.windows.length" class="stage-window-list">
            <li v-for="window in row.windows" :key="window.windowIndex">
              <strong>{{ t('execution.tagGeneration.window') }} {{ window.windowIndex }}</strong>
              <dl class="stage-detail-list stage-window-facts">
                <div>
                  <dt>{{ t('execution.tagGeneration.canvas.windowState') }}</dt>
                  <dd>{{ windowStateLabel(window.status) }}</dd>
                </div>
                <div>
                  <dt>{{ t('execution.tagGeneration.generatedBlocks') }}</dt>
                  <dd class="mono">{{ valueLabel(window.generatedCount) }}</dd>
                </div>
                <div>
                  <dt>{{ t('execution.tagGeneration.storageAccountedTags') }}</dt>
                  <dd class="mono">{{ valueLabel(window.storageAccountedTagCount) }}</dd>
                </div>
                <div>
                  <dt>{{ t('execution.tagGeneration.canvas.dumpTask') }}</dt>
                  <dd class="mono">
                    {{ valueLabel(window.taskId) }}
                    <template v-if="window.taskStatus"> · {{ taskStatusLabel(window.taskStatus, t) }}</template>
                  </dd>
                </div>
              </dl>
            </li>
          </ul>
          <p v-else-if="row.fact.windowsRequested === false" class="stage-details-note">
            {{ t('execution.tagGeneration.notRequested') }}
          </p>
          <p v-else-if="row.fact.windowsRequested === null" class="stage-details-note">
            {{ t('execution.tagGeneration.canvas.windowsUnknown') }}
          </p>
          <p v-else class="stage-details-note">{{ t('execution.tagGeneration.emptyWindows') }}</p>
        </li>
      </ul>
      <p v-if="stagePartRows.olderCount > 0" class="stage-details-note">
        {{ t('execution.stageDetails.olderParts', { count: stagePartRows.olderCount }) }}
      </p>
      <p v-if="stagePartRows.olderWindowCount > 0" class="stage-details-note">
        {{ t('execution.stageDetails.olderWindows', { count: stagePartRows.olderWindowCount }) }}
      </p>
    </section>

    <section class="stage-details-section">
      <h4>{{ t('execution.stageDetails.metrics') }}</h4>
      <dl v-if="metricRows.length" class="stage-detail-list">
        <div v-for="row in metricRows" :key="row.key">
          <dt>{{ row.label }}</dt>
          <dd class="mono">
            {{ row.value }}
            <span class="stage-detail-time">{{ row.eventLabel }} · {{ row.sourceLabel }} · {{ formatDateTime(row.recordedAtMs) }}</span>
          </dd>
        </div>
      </dl>
      <p v-else class="stage-details-empty">{{ emptyText }}</p>
    </section>

    <section class="stage-details-section">
      <h4>{{ t('execution.stageDetails.observations', { count: observations.length }) }}</h4>
      <p v-if="observations.length === 0" class="stage-details-empty">
        {{ t('execution.stageDetails.noStageObservations') }}
      </p>
      <template v-else>
        <details
          v-for="(observation, index) in visibleObservations"
          :key="observation.observationId"
          class="stage-observation-record"
          :open="index === 0"
        >
          <summary>
            <strong>{{ eventLabel(observation.eventType) }}</strong>
            <span class="stage-detail-record-meta">
              {{ formatDateTime(observation.recordedAtMs) }} · {{ sourceLabel(observation) }}
            </span>
          </summary>
          <dl class="stage-detail-list stage-observation-fields">
            <div>
              <dt>{{ t('execution.observationDetail.observationId') }}</dt>
              <dd class="mono">{{ observation.observationId }}</dd>
            </div>
            <div v-for="field in referenceFields(observation)" :key="field.key">
              <dt>{{ field.label }}</dt>
              <dd class="mono">{{ field.value }}</dd>
            </div>
            <div v-for="field in metricFields(observation)" :key="field.key">
              <dt>{{ field.label }}</dt>
              <dd class="mono">{{ field.value }}</dd>
            </div>
            <div v-if="observation.outcome">
              <dt>{{ t('execution.observationDetail.outcome') }}</dt>
              <dd>{{ outcomeLabel(observation.outcome) }}</dd>
            </div>
          </dl>
        </details>
        <p v-if="olderObservationCount > 0" class="stage-details-note">
          {{ t('execution.stageDetails.olderObservations', { count: olderObservationCount }) }}
        </p>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TraceExecutionKind, TraceObservation, TraceObservationMetricKey } from '@/api/trace'
import { projectExecutionMetricSummary } from '@/features/execution/data/executionDisplayProjection'
import type { ExecutionPartDisplayFact } from '@/features/execution/data/executionDisplayProjection'
import type { IdentityRootHashDetails, StageUserReference } from '@/features/execution/data/executionStageDetails'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { taskStatusLabel } from '@/utils/statusLabels'

interface StageMetricRow {
  key: string
  label: string
  value: string
  recordedAtMs: number
  eventLabel: string
  sourceLabel: string
}

interface StagePartRow {
  fact: ExecutionPartDisplayFact
  windows: ExecutionPartDisplayFact['windows']
}

const MAX_VISIBLE_OBSERVATIONS = 5
const MAX_VISIBLE_PARTS = 5
const MAX_VISIBLE_WINDOWS = 5
const props = defineProps<{
  activeJobId: string
  kind: TraceExecutionKind | null
  stageId: string
  stageLabel: string
  isReplay: boolean
  observations: readonly TraceObservation[]
  metricRows: readonly StageMetricRow[]
  users: readonly StageUserReference[]
  identityDataOwnerCount: string | null
  identityDataOwnerCountSource: 'observation' | 'traceSummary' | null
  unlistedIdentityDataOwnerCount: string | null
  rootHash: IdentityRootHashDetails | null
  partFacts: readonly ExecutionPartDisplayFact[]
  focusPartIndex: number | null
  emptyText: string
}>()
const { t } = useI18n()
const jobParticipants = computed(() => props.users.filter(user => user.role === 'jobOwner' || user.role === 'initiator'))
const dataOwners = computed(() => props.users.filter(user => user.role === 'dataOwner'))
const otherUsers = computed(() => props.users.filter(user => user.role === 'user'))

const orderedObservations = computed(() => [...props.observations]
  .filter(observation => observation.jobId === props.activeJobId)
  .sort((left, right) => left.recordedAtMs - right.recordedAtMs || left.observationId.localeCompare(right.observationId)))
const visibleObservations = computed(() => orderedObservations.value.slice(-MAX_VISIBLE_OBSERVATIONS).reverse())
const olderObservationCount = computed(() => Math.max(0, orderedObservations.value.length - visibleObservations.value.length))
const stagePartRows = computed(() => {
  if (props.kind !== 'tagGeneration' || (props.stageId !== 'generation' && props.stageId !== 'storage')) {
    return { rows: [] as StagePartRow[], olderCount: 0, olderWindowCount: 0 }
  }

  const partRanks = new Map<number, number>()
  const observationPartKeys = new Map<number, Set<number | null>>()
  let nextRank = 0
  const addPart = (partIndex: number, attempt: number | null) => {
    if (!partRanks.has(partIndex)) partRanks.set(partIndex, nextRank++)
    const attempts = observationPartKeys.get(partIndex) ?? new Set<number | null>()
    attempts.add(attempt)
    observationPartKeys.set(partIndex, attempts)
  }
  if (props.focusPartIndex !== null) addPart(props.focusPartIndex, null)
  for (const observation of [...orderedObservations.value].reverse()) {
    const partIndex = observation.refs.partIndex
    if (partIndex !== null && Number.isSafeInteger(partIndex) && partIndex >= 0) {
      addPart(partIndex, observation.refs.attempt)
    }
  }

  const isActivePart = (fact: ExecutionPartDisplayFact) =>
    fact.status.toLowerCase() === 'running'
    || fact.generateTaskStatus?.toLowerCase() === 'running'
  const isActiveWindow = (window: ExecutionPartDisplayFact['windows'][number]) =>
    (window.taskId !== null && (window.status === 'generating' || window.status === 'dispatchRecorded'))
    || window.taskStatus?.toLowerCase() === 'running'

  const candidates = props.partFacts.filter(fact => {
    const attempts = observationPartKeys.get(fact.partIndex)
    const observed = attempts !== undefined && (attempts.has(null) || attempts.has(fact.attempt))
    const active = props.stageId === 'generation' ? isActivePart(fact) : fact.windows.some(isActiveWindow)
    return observed || active
  }).sort((left, right) => {
    const leftRank = partRanks.get(left.partIndex)
    const rightRank = partRanks.get(right.partIndex)
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1
      if (rightRank === undefined) return -1
      if (leftRank !== rightRank) return leftRank - rightRank
    }
    if (left.partIndex !== right.partIndex) return left.partIndex - right.partIndex
    return (right.attempt ?? 0) - (left.attempt ?? 0)
  })

  const visibleCandidates = candidates.length === 0 && !props.isReplay
    ? props.partFacts
    : candidates
  const rows = visibleCandidates.slice(0, MAX_VISIBLE_PARTS).map(fact => ({
    fact,
    windows: fact.windows.slice(-MAX_VISIBLE_WINDOWS).reverse(),
  }))
  const olderWindowCount = rows.reduce((total, row) =>
    total + Math.max(0, row.fact.windows.length - row.windows.length), 0)
  return {
    rows,
    olderCount: Math.max(0, visibleCandidates.length - rows.length),
    olderWindowCount,
  }
})

function valueLabel(value: string | null): string {
  return value ?? t('execution.notAvailable')
}

function partStateLabel(status: string): string {
  if (status === 'observed') return t('execution.stages.observed')
  const key = `execution.tagGeneration.states.${status}`
  const label = t(key)
  return label === key ? t('execution.notAvailable') : label
}

function windowStateLabel(status: string): string {
  if (status === 'accounted') return t('execution.tagGeneration.canvas.windowStatusAccounted')
  if (status === 'dispatchRecorded') return t('execution.tagGeneration.canvas.windowStatusDispatchRecorded')
  return partStateLabel(status)
}

function eventLabel(eventType: string): string {
  const key = `execution.activities.${eventType}`
  const label = t(key)
  return label === key ? eventType : label
}

function sourceLabel(observation: TraceObservation): string {
  const parts: string[] = []
  if (observation.source.component) parts.push(observation.source.component)
  if (observation.source.nodeId) parts.push(observation.source.nodeId)
  if (observation.source.quality) {
    const qualityKey = `execution.sourceQuality.${observation.source.quality}`
    const qualityLabel = t(qualityKey)
    parts.push(qualityLabel === qualityKey ? observation.source.quality : qualityLabel)
  }
  return parts.join(' · ')
}

function fieldLabel(key: string): string {
  const labelKey = `execution.observationDetail.${key}`
  const label = t(labelKey)
  if (label !== labelKey) return label
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

function referenceFields(observation: TraceObservation): Array<{ key: string; label: string; value: string }> {
  return Object.entries(observation.refs)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => ({ key, label: fieldLabel(key), value: String(value) }))
}

function metricFields(observation: TraceObservation): Array<{ key: string; label: string; value: string }> {
  return Object.entries(observation.metrics).flatMap(([rawKey, rawValue]) => {
    if (typeof rawValue !== 'string') return []
    const key = rawKey as TraceObservationMetricKey
    const summary = projectExecutionMetricSummary(props.kind, observation.eventType, key, rawValue)
    if (summary?.kind === 'rootHashPresence') {
      return [{
        key: rawKey,
        label: t('execution.businessMetrics.rootHashPresence'),
        value: t(summary.present ? 'execution.businessMetrics.present' : 'execution.businessMetrics.notPresent'),
      }]
    }
    if (summary?.kind === 'verifiedCount') {
      return [{ key: rawKey, label: t('execution.activityMetrics.verifiedCount'), value: summary.count }]
    }
    if (summary?.kind === 'count') return [{ key: rawKey, label: fieldLabel(rawKey), value: summary.value }]
    return [{
      key: rawKey,
      label: t('execution.stageDetails.technicalMetric', { key: rawKey }),
      value: rawValue,
    }]
  })
}

function outcomeLabel(outcome: string): string {
  const key = `execution.outcomes.${outcome}`
  const label = t(key)
  return label === key ? outcome : label
}
</script>

<style scoped>
.stage-details-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--apple-border);
  border-radius: 12px;
  background: var(--apple-surface);
}
.stage-details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.stage-details-eyebrow {
  margin: 0 0 4px;
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 550;
}
.stage-details-header h3 {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.stage-details-mode,
.stage-detail-source,
.stage-detail-record-meta,
.stage-detail-time {
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.stage-details-mode {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
}
.stage-details-section {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding-top: 10px;
  border-top: 1px solid var(--apple-border);
}
.stage-details-section h4 {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}
.stage-user-list,
.stage-part-list,
.stage-window-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.stage-part-list {
  max-height: min(48vh, 480px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}
.stage-user-list {
  max-height: min(32vh, 320px);
  padding-right: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}
.stage-user-list li {
  display: grid;
  grid-template-columns: minmax(68px, 0.7fr) minmax(0, 1.6fr);
  gap: 3px 8px;
  min-width: 0;
}
.stage-user-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
}
.stage-user-value strong {
  min-width: 0;
  overflow: hidden;
  color: var(--apple-gray-1);
  font-size: 12px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-user-value code {
  max-width: 20ch;
  overflow: hidden;
  color: var(--apple-gray-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-user-list .stage-detail-source { grid-column: 2; }
.stage-detail-label,
.stage-detail-list dt {
  color: var(--apple-gray-3);
  font-size: 11px;
}
.stage-detail-list {
  display: grid;
  gap: 7px;
  margin: 0;
}
.stage-detail-list > div {
  display: grid;
  grid-template-columns: minmax(82px, 0.8fr) minmax(0, 1.2fr);
  gap: 8px;
  min-width: 0;
  align-items: start;
}
.stage-detail-list dd {
  min-width: 0;
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.stage-detail-time {
  display: block;
  margin-top: 2px;
}
.stage-hash-value { word-break: break-all; }
.stage-details-note,
.stage-details-empty {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.stage-details-warning { color: var(--apple-orange, #b76e00); }
.stage-part-list > li,
.stage-window-list > li {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--apple-border);
  border-radius: 8px;
}
.stage-part-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.stage-part-heading h5,
.stage-window-list strong {
  min-width: 0;
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 11px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.stage-part-heading > span {
  color: var(--apple-gray-2);
  font-size: 11px;
  text-align: right;
}
.stage-part-facts,
.stage-window-facts { gap: 5px; }
.stage-window-list > li { margin-left: 10px; }
.stage-observation-record {
  min-width: 0;
  border: 1px solid var(--apple-border);
  border-radius: 8px;
  overflow: hidden;
}
.stage-observation-record summary {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  cursor: pointer;
  list-style-position: inside;
}
.stage-observation-record summary strong {
  color: var(--apple-gray-1);
  font-size: 11px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.stage-observation-fields { padding: 0 10px 10px; }
.stage-observation-fields dt { overflow-wrap: anywhere; }
.stage-observation-fields dd { font-size: 10px; }
.mono { font-family: var(--apple-font-mono); }

@media (max-width: 640px) {
  .stage-details-card { padding: 12px; }
  .stage-user-list li,
  .stage-detail-list > div {
    grid-template-columns: minmax(68px, 0.75fr) minmax(0, 1.25fr);
  }
}
</style>
