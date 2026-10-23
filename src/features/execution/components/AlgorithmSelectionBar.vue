<template>
  <button
    v-if="algorithmId"
    type="button"
    class="algorithm-selection-bar"
    :title="tooltipText"
    :aria-label="accessibleLabel"
    @click="copyAlgorithmId"
  >
    <span class="selection-heading">
      <span class="selection-label">{{ t('execution.algorithmSelection.algorithmName') }}</span>
      <strong class="selection-name">{{ algorithmName }}</strong>
      <span v-if="sourceQualityLabel" class="selection-source">{{ sourceQualityLabel }}</span>
      <span class="selection-copy">
        {{ copied ? t('execution.algorithmSelection.copied') : t('execution.algorithmSelection.copyId') }}
      </span>
    </span>
    <span class="selection-meta">
      <span class="selection-meta-item">
        <span class="selection-meta-label">{{ t('execution.algorithmSelection.algorithmType') }}</span>
        <span class="selection-meta-value">{{ algorithmType }}</span>
      </span>
      <span class="selection-meta-item">
        <span class="selection-meta-label">{{ t('execution.algorithmSelection.purpose') }}</span>
        <span class="selection-meta-value">{{ purpose }}</span>
      </span>
      <span class="selection-meta-item">
        <span class="selection-meta-label">{{ t('execution.algorithmSelection.strategyKind') }}</span>
        <span class="selection-meta-value">{{ strategyKind }}</span>
      </span>
    </span>
    <span class="selection-capabilities">
      <span class="selection-meta-label">{{ t('execution.algorithmSelection.capabilities') }}</span>
      <span v-if="capabilitiesState === 'unknown'" class="selection-capability-state">
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
}>()

const { t } = useI18n()
const copied = ref(false)
let copyTimer: number | null = null

const algorithmName = computed(() =>
  props.selection?.algorithmName?.trim() || t('execution.algorithmSelection.nameUnavailable'),
)
const algorithmType = computed(() =>
  props.selection?.algorithmType?.trim() || t('execution.algorithmSelection.typeUnavailable'),
)
const rawPurpose = computed(() => props.selection?.purpose?.trim() || null)
const purpose = computed(() =>
  rawPurpose.value ? strategyPurposeLabel(rawPurpose.value, t) : t('execution.algorithmSelection.valueUnknown'),
)
const strategyKind = computed(() => {
  const rawKind = props.selection?.strategyKind?.trim()
  if (!rawKind) return t('execution.algorithmSelection.valueUnknown')
  const fact = classifyStrategyKind(rawPurpose.value, rawKind)
  return fact.kind
    ? strategyKindLabel(fact, t)
    : `${strategyKindLabel(fact, t)} · ${t('algorithm.workbench.reportedKind', { kind: rawKind })}`
})
const capabilities = computed(() => props.selection?.capabilities ?? null)
const capabilitiesState = computed(() => {
  if (capabilities.value === null) return 'unknown'
  return capabilities.value.length === 0 ? 'none' : 'declared'
})
const capabilityLabels = computed(() =>
  (capabilities.value ?? []).map(name => ({ name, label: capabilityNameLabel(name, t) })),
)
const capabilitiesSummary = computed(() => {
  if (capabilitiesState.value === 'unknown') return t('execution.algorithmSelection.capabilitiesUnknown')
  if (capabilitiesState.value === 'none') return t('execution.algorithmSelection.capabilitiesNone')
  return capabilityLabels.value.map(capability => capability.label).join(', ')
})

const tooltipText = computed(() => {
  const selection = props.selection
  const unknown = t('execution.algorithmSelection.valueUnknown')
  const rawCapabilities = selection?.capabilities
  const capabilityText = rawCapabilities == null
    ? t('execution.algorithmSelection.capabilitiesUnknown')
    : rawCapabilities.length > 0
      ? rawCapabilities.join(', ')
      : t('execution.algorithmSelection.capabilitiesNone')
  return [
    `${t('execution.algorithmSelection.algorithmId')}: ${props.algorithmId}`,
    `${t('execution.algorithmSelection.purpose')}: ${rawPurpose.value ?? unknown}`,
    `${t('execution.algorithmSelection.capabilities')}: ${capabilityText}`,
    `${t('execution.algorithmSelection.capabilitiesMask')}: ${selection?.capabilitiesMask ?? unknown}`,
    `${t('execution.algorithmSelection.profileVersion')}: ${selection?.profileVersion ?? unknown}`,
    `${t('execution.algorithmSelection.strategyVersion')}: ${selection?.strategyVersion?.trim() || unknown}`,
    `${t('execution.algorithmSelection.strategyKind')}: ${selection?.strategyKind?.trim() || unknown}`,
  ].join('\n')
})

const accessibleLabel = computed(() => [
  `${t('execution.algorithmSelection.algorithmName')}: ${algorithmName.value}`,
  `${t('execution.algorithmSelection.algorithmType')}: ${algorithmType.value}`,
  `${t('execution.algorithmSelection.purpose')}: ${purpose.value}`,
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
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
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

@media (hover: hover) and (pointer: fine) {
  .algorithm-selection-bar:hover {
    border-color: var(--apple-gray-4);
    background-color: color-mix(in srgb, var(--apple-blue) 4%, var(--apple-card));
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
