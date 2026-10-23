<template>
  <n-drawer :show="show" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }" @update:show="$emit('update:show', $event)">
    <n-drawer-content closable>
      <template #header>
        <div class="drawer-head">
          <span class="drawer-title">{{ view?.algorithmType ?? t('algorithm.workbench.viewStrategyRecord') }}</span>
          <n-tag v-if="view" size="small" :bordered="false">{{ strategyPurposeLabel(view.purpose, t) }}</n-tag>
        </div>
      </template>

      <div v-if="view" class="detail-body">
        <p class="kind-explanation">{{ strategyKindExplanation(view.kind, t) }}</p>

        <dl class="fact-list">
          <div class="fact">
            <dt>{{ t('algorithm.purpose') }}</dt>
            <dd>{{ strategyPurposeLabel(view.purpose, t) }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('algorithm.workbench.strategyKind') }}</dt>
            <dd>
              <span>{{ strategyKindLabel(view.kind, t) }}</span>
              <span v-if="view.kind.raw && view.kind.kind === null" class="raw-kind">{{ t('algorithm.workbench.reportedKind', { kind: view.kind.raw }) }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('algorithm.workbench.pluginVersion') }}</dt>
            <dd>
              <span v-if="view.pluginVersion" class="mono">{{ view.pluginVersion }}</span>
              <span v-else class="unknown">{{ t('algorithm.workbench.pluginVersionUnknown') }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('algorithm.workbench.capabilities') }}</dt>
            <dd>
              <div v-if="view.capabilities.state === 'declared'" class="capability-chips">
                <span v-for="name in view.capabilities.names" :key="name" class="capability-chip">
                  {{ capabilityNameLabel(name, t) }}
                </span>
                <span v-if="view.capabilities.unnamedBits.length > 0" class="unknown">
                  {{ t('algorithm.workbench.capabilityUnnamedBits', { n: view.capabilities.unnamedBits.length }) }}
                </span>
              </div>
              <span v-else-if="view.capabilities.state === 'none'" class="capability-none">
                {{ t('algorithm.workbench.capabilitiesNone') }}
              </span>
              <span v-else class="unknown">{{ t('algorithm.workbench.capabilitiesUnknown') }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('algorithm.workbench.capabilitiesMask') }}</dt>
            <dd>
              <span v-if="view.capabilities.mask !== null" class="mono">{{ view.capabilities.mask }}</span>
              <span v-else class="unknown">{{ t('algorithm.workbench.capabilitiesUnknown') }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('algorithm.workbench.maintenanceParty') }}</dt>
            <dd>
              <span v-if="view.maintenanceParty">{{ stateMaintenancePartyLabel(view.maintenanceParty, t) }}</span>
              <span v-else-if="view.maintenancePartyApplies" class="unknown">{{ t('algorithm.workbench.valueUnknown') }}</span>
              <span v-else class="unknown">{{ t('algorithm.workbench.notApplicable') }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('algorithm.workbench.instanceCount') }}</dt>
            <dd>
              <span v-if="profileCount !== null" class="mono">{{ profileCount }}</span>
              <span v-else class="unknown">{{ t('algorithm.workbench.instanceCountUnknown') }}</span>
            </dd>
          </div>
        </dl>

        <p class="note">{{ t('algorithm.workbench.snapshotNote') }}</p>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <n-button @click="$emit('update:show', false)">{{ t('algorithm.workbench.close') }}</n-button>
          <div class="footer-actions">
            <n-button v-if="view" size="small" @click="$emit('view-instances', view.algorithmType)">
              {{ t('algorithm.workbench.viewInstances') }}
            </n-button>
            <n-button v-if="view" size="small" type="primary" @click="$emit('create', view.algorithmType)">
              {{ t('algorithm.workbench.createFromStrategy') }}
            </n-button>
          </div>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AlgorithmStrategy } from '@/api/algorithm'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import { describeStrategy } from './algorithmWorkbench'
import {
  capabilityNameLabel,
  stateMaintenancePartyLabel,
  strategyKindExplanation,
  strategyKindLabel,
  strategyPurposeLabel,
} from './strategyLabels'

const props = defineProps<{
  show: boolean
  strategy: AlgorithmStrategy | null
  /** Instance count for this strategy type; `null` when coverage is incomplete. */
  profileCount: number | null
}>()

defineEmits<{
  'update:show': [value: boolean]
  'create': [algorithmType: string]
  'view-instances': [algorithmType: string]
}>()

const { t } = useI18n()
const { drawerWidth } = useAdaptiveWidth(420)
const view = computed(() => props.strategy ? describeStrategy(props.strategy) : null)
</script>

<style scoped>
.drawer-head {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3, 12px);
  min-width: 0;
}

.drawer-title { overflow-wrap: anywhere; }

.detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4, 16px);
}

.kind-explanation {
  margin: 0;
  color: var(--apple-gray-2);
  font-size: 13px;
  line-height: 1.6;
}

.fact-list {
  margin: 0;
  border-top: 1px solid var(--apple-border);
}

.fact {
  display: grid;
  grid-template-columns: minmax(92px, 132px) minmax(0, 1fr);
  gap: var(--apple-space-3, 12px);
  padding: var(--apple-space-2, 8px) 0;
  border-bottom: 1px solid var(--apple-border);
}

.fact dt {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.fact dd {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.raw-kind {
  display: block;
  margin-top: 2px;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.capability-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--apple-space-2, 8px);
}

.capability-chip {
  padding: 1px 8px;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.6;
}

.capability-none { color: var(--apple-gray-2); }
.unknown { color: var(--apple-gray-3); font-style: italic; }
.mono { font-family: var(--apple-font-mono); font-size: 12px; }

.note {
  margin: 0;
  padding-top: var(--apple-space-3, 12px);
  border-top: 1px solid var(--apple-border);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3, 12px);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: var(--apple-space-2, 8px);
}

@media (max-width: 640px) {
  .fact { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .drawer-footer { flex-direction: column; align-items: stretch; }
  .footer-actions { justify-content: flex-end; }
}
</style>
