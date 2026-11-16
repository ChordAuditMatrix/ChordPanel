<template>
  <header class="execution-header">
    <div class="execution-heading">
      <p class="eyebrow">{{ t('execution.title') }}</p>
      <div class="execution-title-row">
        <ExecutionBackButton :label="returnLabel" @activate="emit('return')" />
        <h1 class="execution-title">
          {{ kind ? executionKindLabel(kind, t) : t('execution.title') }}
        </h1>
        <n-tag v-if="isHistoricalReplay" type="info" size="small" :bordered="false">
          {{ t('execution.replay.title') }}
        </n-tag>
        <n-tag v-else-if="jobStatus && kind !== 'challengeProof' && kind !== 'identityVerification'" :type="jobStatusTag" size="small" :bordered="false">
          {{ jobStatusLabel(jobStatus, t) }}
        </n-tag>
        <span v-else-if="initialLoading" class="section-status" role="status">{{ t('execution.loading') }}</span>
      </div>
    </div>

    <div class="execution-context">
      <div class="execution-context-groups">
        <section class="execution-context-group execution-context-group--job">
          <h2>{{ t('execution.jobIdLabel') }}</h2>
          <code class="execution-meta-value mono" :title="jobId ?? t('execution.notAvailable')">
            {{ jobId ?? t('execution.notAvailable') }}
          </code>
        </section>
        <section class="execution-context-group execution-context-group--time">
          <h2>{{ t('execution.timeInfo') }}</h2>
          <dl class="execution-meta-facts">
            <div>
              <dt>{{ t('execution.createdAt') }}</dt>
              <dd>{{ createdAtMs !== null ? formatDateTime(createdAtMs) : summaryPlaceholder }}</dd>
            </div>
            <div>
              <dt>{{ isHistoricalReplay ? t('execution.replay.position') : t('execution.updatedAt') }}</dt>
              <dd>{{ updatedAtMs !== null ? formatDateTime(updatedAtMs) : summaryPlaceholder }}</dd>
            </div>
          </dl>
        </section>
        <section class="execution-context-group execution-context-group--tasks">
          <h2>{{ kind === 'tagGeneration' ? t('execution.taskInfo') : t('execution.taskTraceInfo') }}</h2>
          <dl class="execution-meta-facts">
            <div>
              <dt>{{ isHistoricalReplay ? t('execution.replay.finalSnapshot') : t('execution.taskCount') }}</dt>
              <dd class="mono">{{ taskTotalLabel }}</dd>
            </div>
            <template v-if="kind !== 'tagGeneration'">
              <div>
                <dt>{{ t('execution.observations') }}</dt>
                <dd class="mono">{{ observationCountLabel }}</dd>
              </div>
              <div>
                <dt>{{ t('execution.topology.confirmedPacket') }}</dt>
                <dd class="mono">{{ confirmedPacketCountLabel }}</dd>
              </div>
              <div>
                <dt>{{ t('execution.topology.peerCorrelation') }}</dt>
                <dd class="mono">{{ peerCorrelationCountLabel }}</dd>
              </div>
            </template>
          </dl>
          <p v-if="kind !== 'tagGeneration'" class="execution-context-note">
            {{ isHistoricalReplay ? t('execution.replay.traceCountsNote') : t('execution.traceCountsNote') }}
          </p>
        </section>
        <section
          v-if="hasCoverageDetails"
          class="execution-context-group execution-context-group--coverage"
        >
          <h2>{{ t('execution.coverage') }}</h2>
          <ExecutionCoverageSummary
            :coverage="coverage"
            :execution-kind="kind"
            :is-replay="isHistoricalReplay"
          />
        </section>
      </div>
      <p class="execution-scope">{{ t('execution.scopeNote') }}</p>
    </div>

    <div class="execution-actions">
      <div class="execution-action-group execution-action-group--views" role="group" :aria-label="t('execution.actionGroups.views')">
        <span class="execution-action-group__label" aria-hidden="true">{{ t('execution.actionGroups.views') }}</span>
        <div class="execution-action-group__buttons">
          <n-button
            size="small"
            :type="pressed.sequence ? 'primary' : 'default'"
            :aria-pressed="pressed.sequence"
            @click="emit('set-view', 'sequence')"
          >
            {{ t('execution.sequenceView') }}
          </n-button>
          <n-button
            size="small"
            :type="pressed.topology ? 'primary' : 'default'"
            :aria-pressed="pressed.topology"
            @click="emit('set-view', 'topology')"
          >
            {{ t('execution.topologyView') }}
          </n-button>
          <n-button
            size="small"
            :type="pressed.graph ? 'primary' : 'default'"
            :aria-pressed="pressed.graph"
            @click="emit('show-graph')"
          >
            {{ t('execution.graphView') }}
          </n-button>
        </div>
      </div>
      <div class="execution-action-group execution-action-group--replay" role="group" :aria-label="t('execution.actionGroups.replay')">
        <span class="execution-action-group__label" aria-hidden="true">{{ t('execution.actionGroups.replay') }}</span>
        <div class="execution-action-group__buttons">
          <n-button
            size="small"
            :type="followLatest ? 'primary' : 'default'"
            :aria-pressed="followLatest"
            @click="emit('follow-latest')"
          >
            {{ followLatest ? t('execution.replay.live') : t('execution.replay.follow') }}
          </n-button>
          <n-button
            size="small"
            :disabled="!hasObservations"
            @click="isPlaying ? emit('replay-pause') : emit('replay-start')"
          >
            {{ isPlaying ? t('execution.replay.pause') : t('execution.replay.start') }}
          </n-button>
        </div>
      </div>
      <div class="execution-action-group execution-action-group--data" role="group" :aria-label="t('execution.actionGroups.data')">
        <span class="execution-action-group__label" aria-hidden="true">{{ t('execution.actionGroups.data') }}</span>
        <div class="execution-action-group__buttons">
          <n-button size="small" :loading="reloading" :disabled="!jobId" @click="emit('reload')">
            {{ t('execution.reload') }}
          </n-button>
          <n-button
            size="small"
            :loading="resynchronizing"
            :disabled="!jobId || initialLoading"
            @click="emit('resync')"
          >
            {{ t('execution.resync') }}
          </n-button>
          <n-button size="small" type="primary" ghost :disabled="!jobId" @click="emit('report')">
            {{ t('execution.openReport') }}
          </n-button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TraceCoverage, TraceExecutionKind } from '@/api/trace'
import ExecutionBackButton from '@/features/execution/components/ExecutionBackButton.vue'
import ExecutionCoverageSummary from '@/features/execution/components/ExecutionCoverageSummary.vue'
import { resolveViewPressedStates } from '@/features/execution/data/executionPageGuards'
import type { ExecutionViewMode } from '@/features/execution/data/executionViewState'
import { useI18n } from '@/stores/i18n'
import type { JobStatusTagType } from '@/utils/jobStatus'
import { formatDateTime } from '@/utils/datetime'
import { executionKindLabel, jobStatusLabel } from '@/utils/statusLabels'

const props = defineProps<{
  jobId: string | null
  kind: TraceExecutionKind | null
  isHistoricalReplay: boolean
  jobStatus: string | null
  jobStatusTag: JobStatusTagType
  initialLoading: boolean
  createdAtMs: number | null
  updatedAtMs: number | null
  summaryPlaceholder: string
  taskTotalLabel: string
  observationCountLabel: string
  confirmedPacketCountLabel: string
  peerCorrelationCountLabel: string
  hasCoverageDetails: boolean
  coverage: TraceCoverage | null
  viewMode: ExecutionViewMode
  graphVisible: boolean
  followLatest: boolean
  isPlaying: boolean
  hasObservations: boolean
  reloading: boolean
  resynchronizing: boolean
  returnLabel: string
}>()

const emit = defineEmits<{
  (event: 'return'): void
  (event: 'set-view', mode: ExecutionViewMode): void
  (event: 'show-graph'): void
  (event: 'follow-latest'): void
  (event: 'replay-start'): void
  (event: 'replay-pause'): void
  (event: 'reload'): void
  (event: 'resync'): void
  (event: 'report'): void
}>()

const { t } = useI18n()

/**
 * Sequence, topology and graph are one exclusive view choice. Pressed state is
 * derived from both coordinates so opening the graph always releases the two
 * canvas buttons instead of leaving two "current" views announced.
 */
const pressed = computed(() => resolveViewPressedStates(props.viewMode, props.graphVisible))
</script>

<style scoped>
.eyebrow {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.section-status {
  color: var(--apple-gray-3);
  font-size: 12px;
}

/* ── Job header: one hierarchy, no KPI card wall ── */
.execution-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "heading actions"
    "context context";
  align-items: start;
  gap: 12px 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--apple-border);
}

.execution-heading {
  grid-area: heading;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.execution-heading .eyebrow {
  margin: 0 0 4px;
}

.execution-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.execution-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 26px;
  font-weight: 680;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.execution-context {
  grid-area: context;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.execution-context-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 8px;
  min-width: 0;
}

.execution-context-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--apple-gray-1) 3%, var(--apple-bg));
}

.execution-context-group > h2 {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 600;
}

.execution-context-group--job code {
  overflow-wrap: anywhere;
  color: var(--apple-gray-1);
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.execution-meta-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
  gap: 8px 12px;
  margin: 0;
}

.execution-meta-facts > div { min-width: 0; }
.execution-meta-facts dt { color: var(--apple-gray-4); font-size: 10px; }
.execution-meta-facts dd { margin: 2px 0 0; overflow-wrap: anywhere; color: var(--apple-gray-2); font-size: 12px; }
.execution-context-group--tasks dd { font-variant-numeric: tabular-nums; font-weight: 600; }
.execution-context-note {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 10px;
  line-height: 1.45;
}

.execution-scope {
  max-width: 76ch;
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 10px;
  line-height: 1.55;
}

.execution-actions {
  grid-area: actions;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  align-self: start;
}

.execution-action-group {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-bg));
}

.execution-action-group__label {
  flex: 0 0 auto;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.execution-action-group__buttons {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 640px) {
  .execution-header {
    gap: 12px;
  }

  .execution-header .execution-actions {
    justify-content: flex-start;
  }

  .execution-title {
    font-size: 21px;
  }
}

@media (max-width: 1120px) {
  .execution-header {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "heading" "context" "actions";
  }

  .execution-header .execution-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .execution-header {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "heading" "context" "actions";
    gap: 12px;
  }

  .execution-title { font-size: 21px; }
  .execution-actions { width: 100%; flex-direction: column; align-items: stretch; }
  .execution-action-group { width: 100%; justify-content: space-between; }
  .execution-action-group__label { flex-basis: 76px; }
  .execution-action-group__buttons { flex: 1 1 0; }
}
</style>
