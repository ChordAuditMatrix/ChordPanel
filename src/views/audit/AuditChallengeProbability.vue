<template>
  <section class="probability" :aria-label="t('audit.workbench.challenge.probability.title')">
    <header class="probability__head">
      <h2 class="probability__title">{{ t('audit.workbench.challenge.probability.title') }}</h2>
      <p class="probability__description">{{ t('audit.workbench.challenge.probability.description') }}</p>
    </header>

    <p v-if="stateText" class="probability__state" role="status">{{ stateText }}</p>

    <dl class="probability__facts">
      <div class="probability__fact">
        <dt>{{ t('audit.workbench.challenge.probability.target') }}</dt>
        <dd class="mono">{{ targetText }}</dd>
      </div>
      <div class="probability__fact">
        <dt>{{ t('audit.workbench.challenge.probability.theoretical') }}</dt>
        <dd class="mono">{{ theoreticalText }}</dd>
      </div>
    </dl>

    <div class="probability__assumptions">
      <h3 class="probability__subtitle">{{ t('audit.workbench.challenge.probability.assumptions') }}</h3>
      <dl class="probability__params">
        <div class="probability__param">
          <dt>{{ t('audit.workbench.challenge.probability.ratio') }}</dt>
          <dd class="mono">{{ ratioText }}</dd>
        </div>
        <div class="probability__param">
          <dt>{{ t('audit.workbench.challenge.probability.corruptedBlocks') }}</dt>
          <dd class="mono">{{ corruptedBlocksText }}</dd>
        </div>
        <div class="probability__param">
          <dt>{{ t('audit.workbench.challenge.probability.blockCount') }}</dt>
          <dd class="mono">{{ blockCountText }}</dd>
        </div>
        <div class="probability__param">
          <dt>{{ t('audit.workbench.challenge.probability.challengeCount') }}</dt>
          <dd class="mono">{{ challengeCountText }}</dd>
        </div>
      </dl>
    </div>

    <p class="probability__note">{{ t('audit.workbench.challenge.probability.assumptionNote') }}</p>
    <p class="probability__note">{{ t('audit.workbench.challenge.probability.policyNote') }}</p>
    <p class="probability__source">{{ t('audit.workbench.challenge.probability.source') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'
import { displayConfidencePercentage } from '@/features/execution/data/challengeConfidence'
import { samplingNumbers } from './auditWorkbench'

const props = defineProps<{ jobId: string | null }>()

const { t } = useI18n()
const { snapshots } = useJobTracking()

const snapshot = computed(() => (props.jobId ? snapshots[props.jobId] ?? null : null))
const detailLoaded = computed(() => snapshot.value?.detailLoaded === true)
const detailLoadFailed = computed(() => snapshot.value?.detailLoadFailed === true)
const numbers = computed(() => samplingNumbers(snapshot.value?.metadata ?? null))
const sampling = computed(() => numbers.value.snapshot)

/** Closed vocabulary: only these phrases explain why a number is absent. */
const stateText = computed(() => {
  if (!props.jobId) return t('audit.workbench.challenge.probability.idle')
  if (detailLoadFailed.value) return t('audit.workbench.challenge.probability.noMetadata')
  if (!detailLoaded.value) return t('audit.workbench.challenge.probability.awaiting')
  const metadataError = numbers.value.metadataError
  if (metadataError === 'noMetadata') return t('audit.workbench.challenge.probability.noMetadata')
  if (metadataError === 'notConfigured') return t('audit.workbench.challenge.probability.notConfigured')
  if (metadataError) return t('audit.workbench.challenge.probability.invalid')
  const probabilityError = numbers.value.probabilityError
  if (probabilityError === 'unsafeForClientComputation') return t('audit.workbench.challenge.probability.unsafe')
  if (probabilityError === 'computationTooExpensive') return t('audit.workbench.challenge.probability.tooExpensive')
  if (probabilityError) return t('audit.workbench.challenge.probability.invalid')
  return ''
})

const pendingValue = computed(() => t('audit.workbench.challenge.probability.pendingValue'))
const targetText = computed(() =>
  sampling.value ? displayConfidencePercentage(sampling.value.targetConfidence) : pendingValue.value,
)
const theoreticalText = computed(() =>
  numbers.value.probability === null
    ? pendingValue.value
    : displayConfidencePercentage(numbers.value.probability),
)
const ratioText = computed(() =>
  sampling.value
    ? displayConfidencePercentage(sampling.value.assumedCorruptionRatio)
    : pendingValue.value,
)
const corruptedBlocksText = computed(() => sampling.value?.assumedCorruptedBlockCount ?? pendingValue.value)
const blockCountText = computed(() => sampling.value?.blockCount ?? pendingValue.value)
const challengeCountText = computed(() => sampling.value?.challengeCount ?? pendingValue.value)
</script>

<style scoped>
.probability {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  padding: var(--apple-space-5);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
  min-width: 0;
}

.probability__head {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1);
}

.probability__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.35;
}

.probability__description {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.probability__state {
  margin: 0;
  color: var(--apple-orange);
  font-size: 12px;
  line-height: 1.5;
}

.probability__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--apple-space-3);
  margin: 0;
}

.probability__fact dt,
.probability__param dt {
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.probability__fact dd {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-1);
  font-size: 20px;
  font-weight: 620;
  line-height: 1.25;
}

.probability__assumptions {
  border-top: 1px solid var(--apple-border);
  padding-top: var(--apple-space-3);
}

.probability__subtitle {
  margin: 0 0 var(--apple-space-2);
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.probability__params {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--apple-space-3);
  margin: 0;
}

.probability__param dd {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.probability__note,
.probability__source {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 11px;
  line-height: 1.55;
}

.probability__source {
  color: var(--apple-gray-4);
}

.mono {
  font-family: var(--apple-font-mono);
}
</style>
