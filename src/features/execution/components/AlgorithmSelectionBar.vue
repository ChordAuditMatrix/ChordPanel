<template>
  <button
    v-if="algorithmId"
    type="button"
    class="algorithm-selection-bar"
    :class="{ 'is-unstyled': unstyled }"
    :title="tooltipText"
    :aria-label="accessibleLabel"
    @click="copyAlgorithmId"
  >
    <span class="selection-heading">
      <span class="selection-label">{{ t('execution.algorithmSelection.algorithmName') }}</span>
      <strong class="selection-name">{{ algorithmName }}</strong>
      <span v-if="algorithmNameSourceLabel" class="selection-name-source">{{ algorithmNameSourceLabel }}</span>
      <span v-if="sourceQualityLabel" class="selection-source">{{ sourceQualityLabel }}</span>
      <span class="selection-copy">
        {{ copied ? t('execution.algorithmSelection.copied') : t('execution.algorithmSelection.copyId') }}
      </span>
    </span>
    <span class="selection-meta">
      <span class="selection-meta-item">
        <span class="selection-meta-label">{{ t('execution.algorithmSelection.algorithmType') }}</span>
        <span class="selection-meta-value">{{ algorithmType }}</span>
        <span v-if="algorithmTypeSourceLabel" class="selection-meta-source">{{ algorithmTypeSourceLabel }}</span>
      </span>
      <span class="selection-meta-item">
        <span class="selection-meta-label">{{ t('execution.algorithmSelection.purpose') }}</span>
        <span class="selection-meta-value">{{ purpose }}</span>
        <span v-if="purposeSourceLabel" class="selection-meta-source">{{ purposeSourceLabel }}</span>
      </span>
      <span class="selection-meta-item">
        <span class="selection-meta-label">{{ t('execution.algorithmSelection.strategyKind') }}</span>
        <span class="selection-meta-value">{{ strategyKind }}</span>
      </span>
    </span>
    <span class="selection-capabilities">
      <span class="selection-meta-label">{{ t('execution.algorithmSelection.capabilities') }}</span>
      <span v-if="capabilitiesState === 'not-applicable'" class="selection-capability-state">
        {{ t('execution.algorithmSelection.capabilitiesNotApplicable') }}
      </span>
      <span v-else-if="capabilitiesState === 'unknown'" class="selection-capability-state">
        {{ t('execution.algorithmSelection.capabilitiesUnknown') }}
      </span>
      <span v-else-if="capabilitiesState === 'none'" class="selection-capability-state">
        {{ t('execution.algorithmSelection.capabilitiesNone') }}
      </span>
      <template v-else>
        <span
          v-for="capability in capabilityLabels"
          :key="capability.name"
          class="selection-capability-chip"
        >
          {{ capability.label }}
        </span>
      </template>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { TraceAlgorithmSelection } from '@/api/trace'
import type { AlgorithmProfile } from '@/api/algorithm'
import { classifyStrategyKind } from '@/views/algorithm/algorithmWorkbench'
import {
  capabilityNameLabel,
  strategyKindLabel,
  strategyPurposeLabel,
} from '@/views/algorithm/strategyLabels'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  selection: TraceAlgorithmSelection | null
  algorithmId: string | null
  sourceQualityLabel?: string | null
  catalogProfile?: AlgorithmProfile | null
  unstyled?: boolean
}>()

const { t } = useI18n()
const copied = ref(false)
let copyTimer: number | null = null

const exactCatalogProfile = computed(() =>
  props.catalogProfile?.algorithmId === props.algorithmId ? props.catalogProfile : null,
)
const snapshotAlgorithmName = computed(() => props.selection?.algorithmName?.trim() || null)
const catalogAlgorithmName = computed(() => exactCatalogProfile.value?.algorithmName?.trim() || null)
const algorithmName = computed(() =>
  snapshotAlgorithmName.value || catalogAlgorithmName.value || t('execution.algorithmSelection.nameUnavailable'),
)
const algorithmNameSourceLabel = computed(() =>
  !snapshotAlgorithmName.value && catalogAlgorithmName.value
    ? t('execution.algorithmSelection.valueCurrentCatalog')
    : null,
)
const snapshotAlgorithmType = computed(() => props.selection?.algorithmType?.trim() || null)
const catalogAlgorithmType = computed(() => exactCatalogProfile.value?.algorithmType?.trim() || null)
const algorithmType = computed(() =>
  snapshotAlgorithmType.value || catalogAlgorithmType.value || t('execution.algorithmSelection.typeUnavailable'),
)
const algorithmTypeSourceLabel = computed(() =>
  !snapshotAlgorithmType.value && catalogAlgorithmType.value
    ? t('execution.algorithmSelection.valueCurrentCatalog')
    : null,
)
const snapshotPurpose = computed(() => props.selection?.purpose?.trim() || null)
const catalogPurpose = computed(() => exactCatalogProfile.value?.purpose?.trim() || null)
const rawPurpose = computed(() => snapshotPurpose.value || catalogPurpose.value)
const purpose = computed(() =>
  rawPurpose.value ? strategyPurposeLabel(rawPurpose.value, t) : t('execution.algorithmSelection.valueUnknown'),
)
const purposeSourceLabel = computed(() =>
  !snapshotPurpose.value && catalogPurpose.value
    ? t('execution.algorithmSelection.valueCurrentCatalog')
    : null,
)
const strategyKind = computed(() => {
  const rawKind = props.selection?.strategyKind?.trim()
  if (!rawKind) return t('execution.algorithmSelection.valueUnknown')
  const fact = classifyStrategyKind(snapshotPurpose.value, rawKind)
  return fact.kind
    ? strategyKindLabel(fact, t)
    : `${strategyKindLabel(fact, t)} · ${t('algorithm.workbench.reportedKind', { kind: rawKind })}`
})
const capabilities = computed(() => props.selection?.capabilities ?? null)
const capabilitiesState = computed(() => {
  if (rawPurpose.value === 'Identity') return 'not-applicable'
  if (capabilities.value === null) return 'unknown'
  return capabilities.value.length === 0 ? 'none' : 'declared'
})
const capabilityLabels = computed(() =>
  (capabilities.value ?? []).map(name => ({ name, label: capabilityNameLabel(name, t) })),
)
const capabilitiesSummary = computed(() => {
  if (capabilitiesState.value === 'not-applicable') return t('execution.algorithmSelection.capabilitiesNotApplicable')
  if (capabilitiesState.value === 'unknown') return t('execution.algorithmSelection.capabilitiesUnknown')
  if (capabilitiesState.value === 'none') return t('execution.algorithmSelection.capabilitiesNone')
  return capabilityLabels.value.map(capability => capability.label).join(', ')
})

const tooltipText = computed(() => {
  const selection = props.selection
  const unknown = t('execution.algorithmSelection.valueUnknown')
  const rawCapabilities = selection?.capabilities
  const capabilityText = capabilitiesState.value === 'not-applicable'
    ? t('execution.algorithmSelection.capabilitiesNotApplicable')
    : rawCapabilities == null
      ? t('execution.algorithmSelection.capabilitiesUnknown')
      : rawCapabilities.length > 0
        ? rawCapabilities.join(', ')
        : t('execution.algorithmSelection.capabilitiesNone')
  const capabilityMask = capabilitiesState.value === 'not-applicable'
    ? t('execution.algorithmSelection.capabilitiesNotApplicable')
    : selection?.capabilitiesMask ?? unknown
  const catalogSourceNote = t('execution.algorithmSelection.valueCurrentCatalog')
  const fieldSourceNotes = [
    algorithmNameSourceLabel.value
      ? `${t('execution.algorithmSelection.algorithmName')}: ${catalogSourceNote}`
      : null,
    algorithmTypeSourceLabel.value
      ? `${t('execution.algorithmSelection.algorithmType')}: ${catalogSourceNote}`
      : null,
    purposeSourceLabel.value
      ? `${t('execution.algorithmSelection.purpose')}: ${catalogSourceNote}`
      : null,
  ].filter((note): note is string => note !== null)
  return [
    ...fieldSourceNotes,
    `${t('execution.algorithmSelection.algorithmId')}: ${props.algorithmId}`,
    `${t('execution.algorithmSelection.algorithmType')}: ${algorithmType.value}`,
    `${t('execution.algorithmSelection.purpose')}: ${rawPurpose.value ?? unknown}`,
    `${t('execution.algorithmSelection.capabilities')}: ${capabilityText}`,
    `${t('execution.algorithmSelection.capabilitiesMask')}: ${capabilityMask}`,
    `${t('execution.algorithmSelection.profileVersion')}: ${selection?.profileVersion ?? unknown}`,
    `${t('execution.algorithmSelection.strategyVersion')}: ${selection?.strategyVersion?.trim() || unknown}`,
    `${t('execution.algorithmSelection.strategyKind')}: ${selection?.strategyKind?.trim() || unknown}`,
  ].join('\n')
})

const accessibleLabel = computed(() => [
  `${t('execution.algorithmSelection.algorithmName')}: ${algorithmName.value}`,
  ...(algorithmNameSourceLabel.value ? [algorithmNameSourceLabel.value] : []),
  `${t('execution.algorithmSelection.algorithmType')}: ${algorithmType.value}`,
  ...(algorithmTypeSourceLabel.value ? [algorithmTypeSourceLabel.value] : []),
  `${t('execution.algorithmSelection.purpose')}: ${purpose.value}`,
  ...(purposeSourceLabel.value ? [purposeSourceLabel.value] : []),
  `${t('execution.algorithmSelection.strategyKind')}: ${strategyKind.value}`,
  `${t('execution.algorithmSelection.capabilities')}: ${capabilitiesSummary.value}`,
  copied.value ? t('execution.algorithmSelection.copied') : t('execution.algorithmSelection.copyId'),
].join(' · '))

async function copyAlgorithmId(): Promise<void> {
  const id = props.algorithmId
  if (!id || !navigator.clipboard?.writeText) return
  try {
    await navigator.clipboard.writeText(id)
    copied.value = true
    if (copyTimer !== null) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copied.value = false
      copyTimer = null
    }, 1600)
  } catch {
    copied.value = false
  }
}

onUnmounted(() => {
  if (copyTimer !== null) window.clearTimeout(copyTimer)
})
</script>

<style scoped>
.algorithm-selection-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 7px 10px;
  color: var(--apple-gray-2);
  font: inherit;
  font-size: 11px;
  text-align: left;
  background: color-mix(in srgb, var(--apple-gray-1) 4%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  cursor: pointer;
  transition: border-color 160ms var(--apple-ease-out),
    background-color 160ms var(--apple-ease-out);
}

.algorithm-selection-bar.is-unstyled {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

@media (hover: hover) and (pointer: fine) {
  .algorithm-selection-bar:hover {
    border-color: var(--apple-gray-4);
    background-color: color-mix(in srgb, var(--apple-blue) 4%, var(--apple-card));
  }
  .algorithm-selection-bar.is-unstyled:hover {
    border-color: transparent;
    background: transparent;
  }
}

.algorithm-selection-bar:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.selection-heading,
.selection-meta,
.selection-capabilities {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.selection-heading { align-items: baseline; }
.selection-label,
.selection-meta-label { color: var(--apple-gray-3); font-size: 10px; }
.selection-name { color: var(--apple-gray-1); font-weight: 650; overflow-wrap: anywhere; }
.selection-name-source,
.selection-meta-source {
  color: var(--apple-gray-3);
  font-size: 9px;
}
.selection-meta-item { display: inline-flex; flex-wrap: wrap; gap: 3px 5px; }
.selection-meta-value { color: var(--apple-gray-2); }
.selection-capability-chip {
  padding: 2px 7px;
  color: var(--apple-blue);
  font-size: 10px;
  line-height: 1.4;
  background: color-mix(in srgb, var(--apple-blue) 8%, var(--apple-card));
  border: 1px solid var(--apple-border);
  border-radius: 999px;
  overflow-wrap: anywhere;
}
.selection-capability-state { color: var(--apple-gray-3); font-size: 10px; }
.selection-source,
.selection-copy { color: var(--apple-gray-4); font-size: 9px; }
.selection-source { margin-left: auto; }
</style>
