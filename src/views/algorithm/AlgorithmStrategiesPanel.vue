<template>
  <div class="strategy-library">
    <div class="library-toolbar">
      <n-select
        :value="purpose"
        :placeholder="t('algorithm.purpose')"
        clearable
        size="small"
        class="purpose-filter"
        :options="purposeOptions"
        @update:value="$emit('update:purpose', $event ?? null)"
      />
      <n-input
        v-model:value="query"
        size="small"
        clearable
        class="strategy-search"
        :placeholder="t('algorithm.workbench.searchStrategies')"
      />
    </div>

    <div v-if="error" class="library-state library-state--error" role="alert">
      <span>{{ t('algorithm.workbench.strategiesFailed') }}</span>
      <n-button size="tiny" quaternary type="primary" @click="$emit('retry')">{{ t('common.retry') }}</n-button>
    </div>

    <p v-if="total > strategies.length && !error" class="coverage-note">
      {{ t('algorithm.workbench.strategyCoveragePartial', { shown: strategies.length, total }) }}
    </p>

    <div v-if="loading && strategies.length === 0" class="library-state">{{ t('common.loading') }}</div>

    <div v-else-if="!error && filteredViews.length === 0" class="library-state">
      <template v-if="strategies.length === 0">
        <p class="state-title">{{ t('algorithm.workbench.noStrategiesTitle') }}</p>
        <p class="state-hint">{{ t('algorithm.workbench.noStrategiesHint') }}</p>
      </template>
      <p v-else class="state-hint">{{ t('algorithm.workbench.noStrategyMatch') }}</p>
    </div>

    <template v-else-if="filteredViews.length > 0">
      <ul class="strategy-list" role="list">
        <li v-for="view in filteredViews" :key="view.algorithmType">
          <article class="strategy-card">
            <header class="card-head">
              <div class="card-heading">
                <h3 class="card-type">{{ view.algorithmType }}</h3>
                <p class="card-sub">
                  {{ strategyPurposeLabel(view.purpose, t) }}
                  <span class="meta-sep">·</span>
                  {{ strategyKindLabel(view.kind, t) }}
                  <span v-if="view.kind.raw && view.kind.kind === null"> · {{ t('algorithm.workbench.reportedKind', { kind: view.kind.raw }) }}</span>
                  <span class="meta-sep">·</span>
                  {{ view.pluginVersion ?? t('algorithm.workbench.pluginVersionUnknown') }}
                </p>
              </div>
            </header>

            <div class="capability-row">
              <n-tag size="small" :bordered="false" :type="view.purpose === 'Audit' ? 'info' : 'default'">
                {{ strategyKindLabel(view.kind, t) }}
              </n-tag>
              <n-tag v-for="name in view.capabilities.names" :key="name" size="small" :bordered="false" type="success">
                {{ capabilityNameLabel(name, t) }}
              </n-tag>
              <n-tag v-if="view.capabilities.state === 'unknown'" size="small" :bordered="false" type="warning">
                {{ t('algorithm.workbench.capabilitiesUnknown') }}
              </n-tag>
              <n-tag v-else-if="view.capabilities.state === 'none'" size="small" :bordered="false">
                {{ t('algorithm.workbench.capabilitiesNone') }}
              </n-tag>
              <span v-if="view.capabilities.unnamedBits.length > 0" class="unnamed-bits">
                {{ t('algorithm.workbench.capabilityUnnamedBits', { n: view.capabilities.unnamedBits.length }) }}
              </span>
            </div>

            <p class="card-explanation">{{ strategyKindExplanation(view.kind, t) }}</p>

            <dl class="fact-list">
              <div class="fact">
                <dt>{{ t('algorithm.purpose') }}</dt>
                <dd>{{ strategyPurposeLabel(view.purpose, t) }}</dd>
              </div>
              <div class="fact">
                <dt>{{ t('algorithm.workbench.maintenanceParty') }}</dt>
                <dd>
                  <template v-if="view.maintenanceParty">{{ stateMaintenancePartyLabel(view.maintenanceParty, t) }}</template>
                  <template v-else-if="view.maintenancePartyApplies">
                    <span class="unknown">{{ t('algorithm.workbench.valueUnknown') }}</span>
                  </template>
                  <span v-else class="unknown">{{ t('algorithm.workbench.notApplicable') }}</span>
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
                <dt>{{ t('algorithm.workbench.instanceCount') }}</dt>
                <dd>
                  <span v-if="profileCounts !== null" class="mono">{{ profileCountFor(view.algorithmType) }}</span>
                  <span v-else class="unknown">{{ t('algorithm.workbench.instanceCountUnknown') }}</span>
                </dd>
              </div>
            </dl>

            <footer class="card-actions">
              <n-button size="small" quaternary type="primary" @click="$emit('open-strategy', view.algorithmType)">
                {{ t('algorithm.workbench.viewStrategyRecord') }}
              </n-button>
              <n-button size="small" quaternary @click="$emit('view-instances', view.algorithmType)">
                {{ t('algorithm.workbench.viewInstances') }}
              </n-button>
            </footer>
          </article>
        </li>
      </ul>

      <p class="library-note">{{ t('algorithm.workbench.snapshotNote') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AlgorithmStrategy } from '@/api/algorithm'
import { useI18n } from '@/stores/i18n'
import { describeStrategy, filterStrategies, type StrategyView } from './algorithmWorkbench'
import {
  capabilityNameLabel,
  stateMaintenancePartyLabel,
  strategyKindExplanation,
  strategyKindLabel,
  strategyPurposeLabel,
} from './strategyLabels'

const props = defineProps<{
  strategies: AlgorithmStrategy[]
  loading: boolean
  error: boolean
  purpose: string | null
  /** Per-type instance counts; `null` when profile coverage is incomplete. */
  profileCounts: Map<string, number> | null
  /** Server-side strategy total, used to flag a partial library. */
  total: number
}>()

defineEmits<{
  'update:purpose': [value: string | null]
  'open-strategy': [algorithmType: string]
  'view-instances': [algorithmType: string]
  retry: []
}>()

const { t } = useI18n()
const query = ref('')

const purposeOptions = computed(() => [
  { label: t('algorithm.workbench.purposeAudit'), value: 'Audit' },
  { label: t('algorithm.workbench.purposeIdentity'), value: 'Identity' },
])

const filteredViews = computed<StrategyView[]>(() => filterStrategies(props.strategies, { purpose: props.purpose, query: query.value })
  .map(strategy => describeStrategy(strategy)))

function profileCountFor(algorithmType: string): number {
  return props.profileCounts?.get(algorithmType) ?? 0
}

</script>

<style scoped>
.strategy-library {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-4, 16px);
  min-width: 0;
}

.library-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--apple-space-3, 12px);
}

.purpose-filter { width: 140px; }
.strategy-search { width: 220px; max-width: 100%; }

.library-state {
  padding: var(--apple-space-5, 20px) 0;
  color: var(--apple-gray-3);
  font-size: 13px;
  line-height: 1.55;
}

.library-state--error {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3, 12px);
  color: var(--apple-red);
}

.state-title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 600;
}

.state-hint {
  max-width: 62ch;
  margin: var(--apple-space-1, 4px) 0 0;
}

.coverage-note {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.strategy-list {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2, 8px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.strategy-card {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(220px, 1fr) auto;
  grid-template-areas:
    "head facts actions"
    "capabilities facts actions"
    "explanation facts actions";
  align-items: center;
  column-gap: var(--apple-space-4, 16px);
  padding: var(--apple-space-3, 12px) var(--apple-space-4, 16px);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg, 8px);
  background: var(--apple-card);
  min-width: 0;
}

.card-head { grid-area: head; min-width: 0; }


.card-heading { min-width: 0; }

.card-type {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 14px;
  font-weight: 620;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.card-sub {
  margin: 2px 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.meta-sep { color: var(--apple-gray-5); }

.capability-row {
  grid-area: capabilities;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--apple-space-2, 8px);
  padding-top: var(--apple-space-2, 8px);
}


.unnamed-bits {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.card-explanation {
  grid-area: explanation;
  margin: 0;
  padding-top: var(--apple-space-1, 4px);
  color: var(--apple-gray-2);
  font-size: 12px;
  line-height: 1.5;
}


.fact-list {
  grid-area: facts;
  margin: 0;
  border-left: 1px solid var(--apple-border);
  padding-left: var(--apple-space-3, 12px);
}

.fact {
  display: grid;
  grid-template-columns: minmax(76px, 108px) minmax(0, 1fr);
  gap: var(--apple-space-2, 8px);
  padding: 4px 0;
  border-bottom: 1px solid var(--apple-border);
}

.fact:last-child { border-bottom: 0; }

.fact dt {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.fact dd {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
}

.card-actions {
  grid-area: actions;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--apple-space-1, 4px);
}

.unknown { color: var(--apple-gray-3); font-style: italic; }
.mono { font-family: var(--apple-font-mono); }

.library-note {
  margin: 0;
  padding-top: var(--apple-space-3, 12px);
  border-top: 1px solid var(--apple-border);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 800px) {
  .strategy-card {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "head"
      "capabilities"
      "explanation"
      "facts"
      "actions";
    row-gap: var(--apple-space-2, 8px);
  }

  .fact-list {
    border-top: 1px solid var(--apple-border);
    border-left: 0;
    padding: var(--apple-space-2, 8px) 0 0;
  }

  .card-actions {
    flex-direction: row;
    align-items: center;
  }
}

@media (max-width: 640px) {
  .purpose-filter, .strategy-search { width: 100%; }
}
</style>
