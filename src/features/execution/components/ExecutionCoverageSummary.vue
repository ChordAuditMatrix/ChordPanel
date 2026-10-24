<template>
  <div class="coverage-summary">
    <div v-if="primaryRow" class="coverage-primary">
      <span class="coverage-primary__label">{{ primaryRow.label }}</span>
      <n-tag :type="coverageTagType(primaryRow.coverage)" size="small" :bordered="false">
        {{ coverageStateLabel(primaryRow.coverage, t) }}
      </n-tag>
    </div>
    <p v-else class="coverage-empty">{{ t('execution.notAvailable') }}</p>

    <details v-if="additionalCount > 0" class="coverage-details">
      <summary>{{ t('execution.coverageDetails', { count: additionalCount }) }}</summary>
      <div class="coverage-details__content">
        <section v-if="secondaryRows.length" class="coverage-details__group">
          <h3>{{ t('execution.coverageOtherScopes') }}</h3>
          <div class="coverage-secondary">
            <div v-for="row in secondaryRows" :key="row.key" class="coverage-secondary__item">
              <span>{{ row.label }}</span>
              <n-tag :type="coverageTagType(row.coverage)" size="small" :bordered="false">
                {{ coverageStateLabel(row.coverage, t) }}
              </n-tag>
            </div>
          </div>
        </section>
        <section v-if="reasons.length" class="coverage-details__group">
          <h3>{{ t('execution.coverageReasonHeading') }}</h3>
          <ul class="coverage-reasons">
            <li v-for="reason in reasons" :key="reason">{{ coverageReasonLabel(reason, t) }}</li>
          </ul>
        </section>
      </div>
    </details>
    <p v-if="isReplay" class="coverage-replay-note">
      {{ t('execution.coverageReplayNote') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TraceCoverage, TraceCoverageState, TraceExecutionKind } from '@/api/trace'
import { coverageReasonLabel, coverageStateLabel } from '@/utils/statusLabels'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  coverage: TraceCoverage | null
  executionKind: TraceExecutionKind | null
  isReplay?: boolean
}>(), { isReplay: false })

const { t } = useI18n()

interface CoverageRow {
  key: 'job' | 'tasks' | 'parts' | 'protocol' | 'workerStages'
  label: string
  coverage: TraceCoverageState
}

const rows = computed<CoverageRow[]>(() => {
  const coverage = props.coverage
  if (!coverage) return []
  const allRows: Array<Omit<CoverageRow, 'coverage'> & { coverage: TraceCoverageState | null }> = [
    { key: 'job', label: t('execution.coverageScopes.job'), coverage: coverage.job },
    { key: 'tasks', label: t('execution.coverageScopes.tasks'), coverage: coverage.tasks },
    { key: 'parts', label: t('execution.coverageScopes.parts'), coverage: coverage.parts },
    { key: 'protocol', label: t('execution.coverageScopes.protocol'), coverage: coverage.protocol },
    { key: 'workerStages', label: t('execution.coverageScopes.workerStages'), coverage: coverage.workerStages },
  ]
  return allRows.filter((row): row is CoverageRow => row.coverage !== null)
})
const reasons = computed(() => props.coverage?.reasons ?? [])
const primaryKey = computed(() => props.executionKind === 'tagGeneration' ? 'parts' : 'workerStages')
const primaryRow = computed(() =>
  rows.value.find(row => row.key === primaryKey.value) ?? rows.value[0] ?? null,
)
const secondaryRows = computed(() => rows.value.filter(row => row.key !== primaryRow.value?.key))
const additionalCount = computed(() => secondaryRows.value.length + reasons.value.length)

function coverageTagType(value: TraceCoverageState): 'default' | 'success' | 'warning' {
  if (value === 'complete') return 'success'
  if (value === 'partial') return 'warning'
  return 'default'
}
</script>

<style scoped>
.coverage-summary {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.coverage-primary {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 16%, var(--apple-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--apple-blue) 4%, var(--apple-card));
}

.coverage-primary__label {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
}

.coverage-empty {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11px;
}
.coverage-replay-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  line-height: 1.45;
}

.coverage-details > summary {
  color: var(--apple-gray-4);
  font-size: 11px;
  cursor: pointer;
  list-style: none;
}

.coverage-details > summary::-webkit-details-marker { display: none; }
.coverage-details > summary::after { content: '⌄'; margin-left: 6px; }
.coverage-details[open] > summary::after { content: '⌃'; }

.coverage-details__content,
.coverage-details__group {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.coverage-details__content { padding-top: 8px; }

.coverage-details__group h3 {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 10px;
  font-weight: 600;
}

.coverage-secondary {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.coverage-secondary__item {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding: 4px 7px;
  border: 1px solid var(--apple-border);
  border-radius: 7px;
  background: var(--apple-card);
}

.coverage-secondary__item > span {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-2);
  font-size: 11px;
}

.coverage-secondary__item :deep(.n-tag) { flex: none; font-size: 10px; }

.coverage-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.coverage-reasons li {
  padding: 4px 7px;
  color: var(--apple-gray-3);
  font-size: 10px;
  border: 1px solid var(--apple-border);
  border-radius: 7px;
  background: var(--apple-bg);
}
</style>
