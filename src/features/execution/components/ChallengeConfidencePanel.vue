<template>
  <section
    v-if="isChallengeProof"
    class="challenge-confidence"
    :class="{ 'is-compact': compact }"
    :aria-labelledby="titleId"
  >
    <div class="panel-head">
      <h2 :id="titleId" class="panel-title">{{ t('execution.confidence.title') }}</h2>
      <p v-if="!compact" class="panel-description">{{ t('execution.confidence.description') }}</p>
    </div>

    <p v-if="metadataErrorText" class="state-block" role="status">{{ metadataErrorText }}</p>

    <dl class="fact-grid">
      <div class="fact">
        <dt>{{ t('execution.confidence.target') }}</dt>
        <dd class="mono">{{ targetText }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('execution.confidence.theoretical') }}</dt>
        <dd class="mono">{{ theoreticalText }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('execution.confidence.verified') }}</dt>
        <dd :class="verifiedClass">{{ verifiedText }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('execution.confidence.jobStatus') }}</dt>
        <dd>{{ jobStatusText }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('execution.confidence.coverage') }}</dt>
        <dd>{{ coverageText }}</dd>
      </div>
    </dl>

    <dl v-if="!compact" class="param-grid">
      <div class="param">
        <dt>{{ t('execution.confidence.assumedCorruptionRatio') }}</dt>
        <dd class="mono">{{ ratioText }}</dd>
      </div>
      <div class="param">
        <dt>{{ t('execution.confidence.assumedCorruptedBlockCount') }}</dt>
        <dd class="mono">{{ corruptedBlockCountText }}</dd>
      </div>
      <div class="param">
        <dt>{{ t('execution.confidence.blockCount') }}</dt>
        <dd class="mono">{{ blockCountText }}</dd>
      </div>
      <div class="param">
        <dt>{{ t('execution.confidence.challengeCount') }}</dt>
        <dd class="mono">{{ challengeCountText }}</dd>
      </div>
      <div v-if="challengedTagCountText" class="param">
        <dt>{{ t('execution.confidence.challengedTagCount') }}</dt>
        <dd class="mono">{{ challengedTagCountText }}</dd>
      </div>
    </dl>

    <div v-if="!compact" class="notes">
      <p class="formula">
        <span>{{ t('execution.confidence.formula') }}</span>
        <math class="math-expression" display="inline" :aria-label="t('execution.confidence.formulaAccessible')">
          <msub>
            <mi>P</mi>
            <mtext>detect</mtext>
          </msub>
          <mo>=</mo>
          <mn>1</mn>
          <mo>−</mo>
          <mfrac>
            <mrow>
              <mo>(</mo>
              <mfrac linethickness="0">
                <mrow><mi>N</mi><mo>−</mo><mi>t</mi></mrow>
                <mi>c</mi>
              </mfrac>
              <mo>)</mo>
            </mrow>
            <mrow>
              <mo>(</mo>
              <mfrac linethickness="0">
                <mi>N</mi>
                <mi>c</mi>
              </mfrac>
              <mo>)</mo>
            </mrow>
          </mfrac>
        </math>
      </p>
      <p>{{ t('execution.confidence.assumption') }}</p>
      <p class="source">{{ t('execution.confidence.metadataSource') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import type { TraceCoverageState, TraceExecutionKind } from '@/api/trace'
import { useI18n } from '@/stores/i18n'
import {
  displayConfidencePercentage,
  parseChallengeSamplingMetadata,
  theoreticalDetectionProbability,
  type ConfidenceError,
} from '@/features/execution/data/challengeConfidence'
import { jobStatusLabel } from '@/utils/statusLabels'

const props = defineProps<{
  executionKind: TraceExecutionKind | null
  /** The `GET /v1/jobs/{jobId}` Job metadata snapshot; never a Trace summary value. */
  jobMetadata: Record<string, unknown> | null
  /** Cryptographic verification result, independent of the modelled probability. */
  verified: boolean | null
  jobStatus: string | null
  coverage: TraceCoverageState | null
  /** Execution-page summary: KPI row only; the report page keeps full formulas and parameters. */
  compact?: boolean
}>()

const { t } = useI18n()
const titleId = `challenge-confidence-${useId()}`

const isChallengeProof = computed(() => props.executionKind === 'challengeProof')

/** All parsing and probability work lives in the shared data contract. */
const parsed = computed(() => parseChallengeSamplingMetadata(props.jobMetadata))
const snapshot = computed(() => (parsed.value.ok ? parsed.value.value : null))
const probability = computed(() =>
  snapshot.value ? theoreticalDetectionProbability(snapshot.value) : null,
)

const notAvailable = computed(() => t('execution.notAvailable'))

/** Every contract failure reason is a closed vocabulary and has its own key. */
function reasonText(reason: ConfidenceError): string {
  return t(`execution.confidence.${reason}`)
}

const metadataErrorText = computed(() =>
  parsed.value.ok ? '' : reasonText(parsed.value.reason),
)

const targetText = computed(() =>
  snapshot.value ? displayConfidencePercentage(snapshot.value.targetConfidence) : notAvailable.value,
)

const theoreticalText = computed(() => {
  const result = probability.value
  if (!result) return notAvailable.value
  return result.ok ? displayConfidencePercentage(result.value) : reasonText(result.reason)
})

const verifiedText = computed(() => {
  if (props.verified === true) return t('execution.confidence.verifiedTrue')
  if (props.verified === false) return t('execution.confidence.verifiedFalse')
  return t('execution.confidence.verifiedUnknown')
})

const verifiedClass = computed(() => {
  if (props.verified === true) return 'verified verified-true'
  if (props.verified === false) return 'verified verified-false'
  return 'verified verified-unknown'
})

const jobStatusText = computed(() =>
  props.jobStatus ? jobStatusLabel(props.jobStatus, t) : notAvailable.value,
)
const coverageText = computed(() =>
  props.coverage ? t(`execution.coverageState.${props.coverage}`) : notAvailable.value,
)

/** Exact persisted strings; the ratio keeps its original decimal spelling. */
function rawMetadataText(key: string): string | null {
  const raw = props.jobMetadata?.[key]
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null
}

const ratioText = computed(() => {
  if (!snapshot.value) return notAvailable.value
  return rawMetadataText('assumedCorruptionRatio') ?? String(snapshot.value.assumedCorruptionRatio)
})
const corruptedBlockCountText = computed(() =>
  snapshot.value ? snapshot.value.assumedCorruptedBlockCount : notAvailable.value,
)
const blockCountText = computed(() => (snapshot.value ? snapshot.value.blockCount : notAvailable.value))
const challengeCountText = computed(() =>
  snapshot.value ? snapshot.value.challengeCount : notAvailable.value,
)
const challengedTagCountText = computed(() => snapshot.value?.challengedTagCount ?? null)
</script>

<style scoped>
.challenge-confidence {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--apple-gray-1);
}

.panel-description {
  max-width: 72ch;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--apple-gray-3);
}

.state-block {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  font-size: 12px;
  color: var(--apple-orange);
}

.fact-grid,
.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 0;
}

.param-grid {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.fact,
.param {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-left: 10px;
  border-left: 2px solid var(--apple-border);
}

.fact dt,
.param dt {
  font-size: 11px;
  color: var(--apple-gray-3);
}

.fact dd,
.param dd {
  margin: 0;
  font-size: 13px;
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.param dd {
  font-size: 12px;
  color: var(--apple-gray-2);
}

.verified-true {
  color: var(--apple-green);
}

.verified-false {
  color: var(--apple-red);
}

.verified-unknown {
  color: var(--apple-gray-3);
}

.mono {
  font-family: var(--apple-font-mono);
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--apple-gray-3);
}

.notes p {
  margin: 0;
}

.formula {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.math-expression {
  max-width: 100%;
  color: var(--apple-gray-1);
  font-size: 17px;
}

.source {
  color: var(--apple-gray-3);
}
</style>
