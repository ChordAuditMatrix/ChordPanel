<template>
  <section class="execution-stage-rail" :aria-label="t('execution.stageRail.title')">
    <div class="rail-scroll" tabindex="0" role="group" :aria-label="t('execution.stageRail.title')">
      <ol class="rail-list">
        <li v-if="executionKind === 'identityVerification'" class="rail-item">
          <button
            type="button"
            class="stage-button"
            :class="{
              selected: selectedStageId === 'dispatch',
              observed: dispatchLink !== null,
              [`status-${dispatchLink ? 'observed' : 'unknown'}`]: true,
            }"
            :aria-pressed="selectedStageId === 'dispatch'"
            :disabled="!selectable"
            :aria-label="relationAriaLabel('dispatch')"
            @click="emit('select-stage', 'dispatch')"
          >
            <span class="rail-marker stage-marker" aria-hidden="true"><span>1</span></span>
            <span class="rail-content">
              <span class="position-label">{{ t('execution.identityTimeline.dispatchPosition') }}</span>
              <strong class="item-title">{{ t('execution.identityTimeline.dispatchTitle') }}</strong>
              <span class="item-detail">
                {{ dispatchLink ? t('execution.identityTimeline.dispatchRecorded') : t('execution.stages.notObserved') }}
              </span>
            </span>
          </button>
        </li>

        <li v-for="(row, index) in stageRows" :key="row.stage.id" class="rail-item">
          <button
            type="button"
            class="stage-button"
            :class="{
              selected: selectedStageId === row.stage.id,
              observed: row.hasEvidence,
              [`status-${row.displayStatus}`]: true,
            }"
            :aria-pressed="selectedStageId === row.stage.id"
            :disabled="!selectable"
            :aria-label="stageAriaLabel(row)"
            @click="emit('select-stage', row.stage.id)"
          >
            <span class="rail-marker stage-marker" aria-hidden="true">
              <span>{{ index + (executionKind === 'identityVerification' ? 2 : 1) }}</span>
            </span>
            <span class="rail-content">
              <span class="position-label">{{ t('execution.stageRail.stagePosition', { number: index + (executionKind === 'identityVerification' ? 2 : 1) }) }}</span>
              <strong class="item-title">{{ t(row.stage.labelKey) }}</strong>
              <span class="item-detail">{{ displayStatusLabel(row.displayStatus) }}</span>
            </span>
          </button>
        </li>

        <li v-if="executionKind === 'identityVerification'" class="rail-item">
          <button
            type="button"
            class="stage-button"
            :class="{
              selected: selectedStageId === 'settlement',
              observed: settlementLink !== null,
              [`status-${settlementLink ? 'observed' : 'unknown'}`]: true,
            }"
            :aria-pressed="selectedStageId === 'settlement'"
            :disabled="!selectable"
            :aria-label="relationAriaLabel('settlement')"
            @click="emit('select-stage', 'settlement')"
          >
            <span class="rail-marker stage-marker" aria-hidden="true"><span>7</span></span>
            <span class="rail-content">
              <span class="position-label">{{ t('execution.identityTimeline.settlementPosition') }}</span>
              <strong class="item-title">{{ t('execution.identityTimeline.settlementTitle') }}</strong>
              <span class="item-detail">
                {{ settlementLink ? t('execution.identityTimeline.settlementRecorded') : t('execution.stages.notObserved') }}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </div>
    <p class="rail-note">{{ t(executionKind === 'identityVerification' ? 'execution.stageRail.identityOrderNote' : 'execution.stageRail.orderNote') }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { TraceExecutionKind, TraceLink } from '@/api/trace'
import type { ExecutionDisplayStatus, ExecutionStageDisplayFact } from '@/features/execution/data/executionDisplayProjection'
import { projectIdentityWorkerStageFacts, type ExecutionStage } from '@/features/execution/data/executionStages'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  executionKind: TraceExecutionKind
  stages: readonly ExecutionStage[]
  dispatchLink: TraceLink | null
  settlementLink: TraceLink | null
  selectedStageId: string | null
  displayFacts?: readonly ExecutionStageDisplayFact[]
  selectable?: boolean
}>(), { selectable: true })

const emit = defineEmits<{
  (event: 'select-stage', stageId: string): void
}>()

const { t } = useI18n()

const identityStageFacts = computed(() => props.executionKind === 'identityVerification'
  ? projectIdentityWorkerStageFacts(props.stages)
  : null)

const stageRows = computed(() => {
  const statusByStageId = new Map<string, ExecutionDisplayStatus>()
  for (const fact of props.displayFacts ?? []) statusByStageId.set(fact.stageId, fact.status)
  const identityFactsByStageId = new Map((identityStageFacts.value ?? []).map(fact => [fact.stage.id, fact]))
  return props.stages.map(stage => {
    const identityFacts = identityFactsByStageId.get(stage.id)
    const evidenceCount = identityFacts?.workerEvidenceCount ?? stage.evidence.length
    return {
      stage,
      hasEvidence: evidenceCount > 0,
      displayStatus: statusByStageId.get(stage.id)
        ?? (evidenceCount > 0 ? 'observed' as const : 'unknown' as const),
    }
  })
})

function displayStatusLabel(status: ExecutionDisplayStatus): string {
  if (status === 'active') return t('execution.rail.statusActive')
  if (status === 'completed') return t('execution.rail.statusCompleted')
  if (status === 'failed') return t('execution.rail.statusFailed')
  if (status === 'snapshot') return t('execution.stages.snapshotAvailable')
  if (status === 'observed') return t('execution.stages.observed')
  return t('execution.stages.notObserved')
}

function stageAriaLabel(row: (typeof stageRows.value)[number]): string {
  return `${t(row.stage.labelKey)} · ${displayStatusLabel(row.displayStatus)}`
}

function relationAriaLabel(relation: 'dispatch' | 'settlement'): string {
  if (relation === 'dispatch') {
    return `${t('execution.identityTimeline.dispatchTitle')} · ${props.dispatchLink ? t('execution.identityTimeline.dispatchRecorded') : t('execution.stages.notObserved')}`
  }
  return `${t('execution.identityTimeline.settlementTitle')} · ${props.settlementLink ? t('execution.identityTimeline.settlementRecorded') : t('execution.stages.notObserved')}`
}
</script>

<style scoped>
 .execution-stage-rail {
  min-width: 0;
  color: var(--apple-gray-1);
}

.rail-scroll {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 8px 2px 10px;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
}

.rail-scroll:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
  border-radius: var(--apple-radius-sm);
}

.rail-list {
  display: flex;
  min-width: 826px;
  margin: 0;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--apple-border);
  list-style: none;
}

.rail-list::before {
  display: none;
}

.rail-item {
  position: relative;
  flex: 1 1 0;
  min-width: 118px;
}

.rail-item + .rail-item::before {
  position: absolute;
  top: 15px;
  bottom: 7px;
  left: 0;
  width: 1px;
  background: var(--apple-border);
  content: '';
}

.stage-button {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  gap: 9px;
  padding: 7px 11px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: color 180ms var(--apple-ease-out), background-color 180ms var(--apple-ease-out), box-shadow 180ms var(--apple-ease-out);
}

.stage-button:hover {
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
}

.stage-button.selected {
  background: color-mix(in srgb, var(--apple-blue) 7%, var(--apple-card));
  box-shadow: inset 0 -2px 0 var(--apple-blue);
}

.stage-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}
.stage-button:disabled {
  cursor: default;
  opacity: 1;
}
.stage-button:disabled:hover { background: transparent; }
.relation-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 7px 11px;
}

.rail-marker {
  position: relative;
  z-index: 1;
  display: grid;
  width: 23px;
  height: 23px;
  flex: 0 0 23px;
  place-items: center;
  border: 1px solid var(--apple-gray-5);
  border-radius: 50%;
  background: var(--apple-card);
  color: var(--apple-gray-4);
  font-size: 10px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.stage-marker span {
  display: block;
}

.stage-button.observed .stage-marker {
  border-color: var(--apple-gray-3);
  color: var(--apple-gray-1);
}
.stage-button.status-active .stage-marker {
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}

.stage-button.status-completed .stage-marker {
  border-color: var(--apple-green);
  background: var(--apple-green);
  color: var(--apple-card);
}
.stage-button.status-failed .stage-marker {
  border-color: var(--apple-red);
  color: var(--apple-red);
}

.stage-button.status-snapshot .stage-marker {
  border-style: dashed;
}


.rail-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding-top: 0;
}

.position-label {
  color: var(--apple-gray-4);
  font-size: 9px;
  line-height: 1.35;
  white-space: normal;
}


.item-title {
  max-width: 100%;
  color: var(--apple-gray-1);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.stage-button.selected .item-title {
  color: var(--apple-gray-1);
  font-size: 12px;
}

.item-detail {
  color: var(--apple-gray-3);
  font-size: 9px;
  line-height: 1.4;
}

.rail-note {
  margin: 2px 0 0;
  color: var(--apple-gray-4);
  font-size: 10px;
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .stage-button {
    transition: none;
  }
}
</style>
