<template>
  <n-modal :show="show" preset="card" :title="t('algorithm.workbench.initializeInstance')" :style="{ width: '460px', maxWidth: '92vw' }" :bordered="true" @update:show="$emit('update:show', $event)">
    <n-form label-placement="left" label-width="auto">
      <n-form-item :label="t('algorithm.algorithmType')" required>
        <n-select :value="algorithmType" :placeholder="t('algorithm.algorithmType')" :options="typeOptions" :loading="typeLoading" @update:value="$emit('update:algorithmType', $event)" />
      </n-form-item>

      <div v-if="strategyView" class="strategy-summary">
        <div class="summary-row">
          <span class="summary-label">{{ t('algorithm.workbench.strategyKind') }}</span>
          <span>{{ strategyKindLabel(strategyView.kind, t) }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">{{ t('algorithm.workbench.pluginVersion') }}</span>
          <span :class="{ unknown: !strategyView.pluginVersion }">{{ strategyView.pluginVersion ?? t('algorithm.workbench.pluginVersionUnknown') }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">{{ t('algorithm.workbench.capabilities') }}</span>
          <span v-if="strategyView.capabilities.state === 'declared'">
            {{ strategyView.capabilities.names.map(name => capabilityNameLabel(name, t)).join(' · ') || t('algorithm.workbench.capabilitiesUnknown') }}
          </span>
          <span v-else-if="strategyView.capabilities.state === 'none'">{{ t('algorithm.workbench.capabilitiesNone') }}</span>
          <span v-else class="unknown">{{ t('algorithm.workbench.capabilitiesUnknown') }}</span>
        </div>
        <div v-if="strategyView.maintenancePartyApplies" class="summary-row">
          <span class="summary-label">{{ t('algorithm.workbench.maintenanceParty') }}</span>
          <span v-if="strategyView.maintenanceParty">{{ stateMaintenancePartyLabel(strategyView.maintenanceParty, t) }}</span>
          <span v-else class="unknown">{{ t('algorithm.workbench.valueUnknown') }}</span>
        </div>
        <p class="summary-note">{{ t('algorithm.workbench.createPurposeHint') }}</p>
      </div>

      <n-form-item :label="t('algorithm.algorithmName')" required>
        <n-input :value="algorithmName" :placeholder="t('common.inputAlgorithmName')" @update:value="$emit('update:algorithmName', $event)" />
      </n-form-item>
      <n-form-item :label="t('algorithm.initParams')">
        <KeyValueEditor :model-value="params" :hint="paramsHint" @update:model-value="$emit('update:params', $event)" />
      </n-form-item>
      <p class="params-note">{{ t('algorithm.workbench.paramsOpenSchema') }}</p>
    </n-form>
    <template #footer>
      <div class="dialog-actions">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="loading" @click="$emit('submit')">{{ t('common.create') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AlgorithmStrategy } from '@/api/algorithm'
import type { KvHintItem } from '@/components/KeyValueEditor.vue'
import KeyValueEditor from '@/components/KeyValueEditor.vue'
import { useI18n } from '@/stores/i18n'
import { describeStrategy } from './algorithmWorkbench'
import {
  capabilityNameLabel,
  stateMaintenancePartyLabel,
  strategyKindLabel,
} from './strategyLabels'

const props = defineProps<{
  show: boolean
  algorithmType: string
  algorithmName: string
  params: Record<string, string>
  paramsHint: KvHintItem[]
  typeOptions: Array<{ label: string; value: string }>
  typeLoading: boolean
  loading: boolean
  /** Strategy descriptor of the currently selected type, when known. */
  strategy: AlgorithmStrategy | null
}>()

defineEmits<{
  'update:show': [value: boolean]
  'update:algorithmType': [value: string]
  'update:algorithmName': [value: string]
  'update:params': [value: Record<string, string>]
  submit: []
}>()

const { t } = useI18n()
const strategyView = computed(() => props.strategy ? describeStrategy(props.strategy) : null)
</script>

<style scoped>
.strategy-summary {
  margin: 0 0 var(--apple-space-4, 16px);
  padding: var(--apple-space-3, 12px) 0;
  border-top: 1px solid var(--apple-border);
  border-bottom: 1px solid var(--apple-border);
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1, 4px);
}

.summary-row {
  display: grid;
  grid-template-columns: minmax(84px, 120px) minmax(0, 1fr);
  gap: var(--apple-space-3, 12px);
  font-size: 12px;
  line-height: 1.6;
  color: var(--apple-gray-1);
  overflow-wrap: anywhere;
}

.summary-label { color: var(--apple-gray-3); }

.summary-note,
.params-note {
  margin: var(--apple-space-2, 8px) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

.unknown { color: var(--apple-gray-3); font-style: italic; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
