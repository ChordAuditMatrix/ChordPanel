<template>
  <section class="report-prefill" :aria-label="t('recovery.source.title')">
    <header class="report-prefill__head">
      <h3 class="report-prefill__title">{{ t('recovery.source.title') }}</h3>
      <p class="report-prefill__description">{{ t('recovery.source.description') }}</p>
    </header>

    <n-alert
      v-if="plan.status === 'invalid'"
      type="error"
      :show-icon="true"
      role="alert"
      class="report-prefill__alert"
    >
      {{ t('recovery.source.invalid') }}
    </n-alert>
    <n-alert
      v-else-if="plan.status === 'owner-mismatch'"
      type="warning"
      :show-icon="true"
      role="alert"
      class="report-prefill__alert"
    >
      {{ t('recovery.source.ownerMismatchDetail', {
        reportOwner,
        owner: ownerId.trim() || t('recovery.source.ownerUnset'),
      }) }}
    </n-alert>

    <dl v-if="plan.report && reportFacts.length" class="report-prefill__facts">
      <div v-for="fact in reportFacts" :key="`${fact.labelKey}:${fact.value}`" class="report-prefill__fact">
        <dt>{{ t(fact.labelKey) }}</dt>
        <dd :class="{ 'report-prefill__mono': fact.mono }">{{ fact.value }}</dd>
      </div>
    </dl>

    <div v-if="plan.status === 'available'" class="report-prefill__actions">
      <n-button size="small" type="primary" secondary @click="emit('apply')">
        {{ applied ? t('recovery.source.reapply') : t('recovery.source.apply') }}
      </n-button>
      <n-tag v-if="applied" size="small" type="success" :bordered="false">
        {{ t('recovery.source.applied') }}
      </n-tag>
    </div>

    <p v-if="plan.status !== 'available'" class="report-prefill__manual">
      {{ plan.status === 'owner-mismatch'
        ? t('recovery.source.manualAfterMismatch')
        : manualNote }}
    </p>
    <p v-else class="report-prefill__manual">
      {{ t('recovery.source.availableHint') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NAlert, NButton, NTag } from 'naive-ui'
import {
  planDriftReportPrefill,
  planRefreshReportPrefill,
  type DriftRecoveryReport,
  type RecoveryFact,
  type RefreshFailureReport,
} from '@/features/recovery/recoveryFlow'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  mode: 'drift' | 'refresh'
  report?: DriftRecoveryReport | RefreshFailureReport | null
  ownerId: string
  applied?: boolean
}>(), {
  report: null,
  applied: false,
})

const emit = defineEmits<{ apply: [] }>()
const { t } = useI18n()

const plan = computed(() => props.mode === 'drift'
  ? planDriftReportPrefill(props.report, props.ownerId)
  : planRefreshReportPrefill(props.report, props.ownerId))

const reportOwner = computed(() => plan.value.report?.ownerId ?? '')

const reportFacts = computed<RecoveryFact[]>(() => {
  const report = plan.value.report
  if (!report) return []
  const facts: RecoveryFact[] = [
    { labelKey: 'recovery.source.owner', value: report.ownerId, mono: true },
  ]
  if (report.kind === 'source-drift') {
    facts.push(
      { labelKey: 'audit.workbench.drift.recoveryId', value: report.recoveryId, mono: true },
      { labelKey: 'audit.workbench.drift.driftRevision', value: String(report.driftRevision) },
    )
  } else {
    facts.push({
      labelKey: 'ownership.workbench.refresh.pendingRevision',
      value: String(report.pendingRevision),
    })
  }
  if (report.sourceLabel) {
    facts.push({ labelKey: 'recovery.source.sourceLabel', value: report.sourceLabel })
  }
  if (report.reportRef) {
    facts.push({ labelKey: 'recovery.source.reportRef', value: report.reportRef, mono: true })
  }
  if (report.reportedAt) {
    facts.push({ labelKey: 'recovery.source.reportedAt', value: report.reportedAt })
  }
  return facts
})

const manualNote = computed(() => t(
  props.mode === 'drift'
    ? 'recovery.source.manualDrift'
    : 'recovery.source.manualRefresh',
))
</script>

<style scoped>
.report-prefill {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  min-width: 0;
  margin-bottom: var(--apple-space-4);
  padding: var(--apple-space-3) var(--apple-space-4);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}
.report-prefill__head {
  min-width: 0;
}
.report-prefill__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
}
.report-prefill__description {
  margin: 2px 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}
.report-prefill__alert {
  margin: 0;
}
.report-prefill__facts {
  display: grid;
  grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
  gap: var(--apple-space-1) var(--apple-space-4);
  margin: 0;
}
.report-prefill__fact {
  display: contents;
}
.report-prefill__fact dt {
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.6;
}
.report-prefill__fact dd {
  min-width: 0;
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.report-prefill__mono {
  font-family: var(--apple-font-mono);
  font-size: 11.5px;
}
.report-prefill__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}
.report-prefill__manual {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.55;
}
</style>
