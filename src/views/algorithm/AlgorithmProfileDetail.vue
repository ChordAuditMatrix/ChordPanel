<template>
  <n-drawer :show="show" :width="drawerWidth" placement="right" :style="{ maxWidth: '92vw' }" @update:show="$emit('update:show', $event)">
    <n-drawer-content closable>
      <template #header>
        <div class="drawer-head">
          <span class="drawer-title">{{ profile?.algorithmName ?? t('algorithm.workbench.instanceProfiles') }}</span>
          <n-tag v-if="profile" size="small" :bordered="false">
            {{ strategyPurposeLabel(profile.purpose, t) }}
          </n-tag>
        </div>
      </template>

      <div v-if="profile" class="detail-body">
        <section class="detail-block">
          <dl class="fact-list">
            <div class="fact">
              <dt>{{ t('algorithm.algorithmId') }}</dt>
              <dd class="id-cell">
                <code class="id-text">{{ profile.algorithmId }}</code>
                <n-button size="tiny" quaternary type="primary" @click="copyAlgorithmId">
                  {{ copied ? t('common.copied') : t('common.copy') }}
                </n-button>
              </dd>
            </div>
            <div class="fact">
              <dt>{{ t('algorithm.algorithmType') }}</dt>
              <dd class="mono">{{ profile.algorithmType }}</dd>
            </div>
          </dl>
        </section>

        <section class="detail-block">
          <h3 class="block-title">{{ t('algorithm.workbench.versions') }}</h3>
          <dl class="fact-list">
            <div class="fact">
              <dt>{{ t('algorithm.workbench.profileVersion') }}</dt>
              <dd>
                <span v-if="versions.profileVersion !== null" class="mono">{{ versions.profileVersion }}</span>
                <span v-else class="unknown">{{ t('algorithm.workbench.valueUnknown') }}</span>
              </dd>
            </div>
            <div class="fact">
              <dt>{{ t('algorithm.workbench.pluginVersion') }}</dt>
              <dd>
                <span v-if="versions.pluginVersion" class="mono">{{ versions.pluginVersion }}</span>
                <span v-else class="unknown">{{ t('algorithm.workbench.pluginVersionUnknown') }}</span>
              </dd>
            </div>
          </dl>
          <p class="note">{{ t('algorithm.workbench.versionsHint') }}</p>
        </section>

        <section class="detail-block">
          <h3 class="block-title">{{ t('algorithm.workbench.strategyFacts') }}</h3>
          <p v-if="!strategyView" class="unknown">{{ t('algorithm.workbench.strategyMissing') }}</p>
          <template v-else>
            <dl class="fact-list">
              <div class="fact">
                <dt>{{ t('algorithm.workbench.strategyKind') }}</dt>
                <dd>
                  <span>{{ strategyKindLabel(strategyView.kind, t) }}</span>
                  <span class="hint-inline">· {{ strategyKindExplanation(strategyView.kind, t) }}</span>
                </dd>
              </div>
              <div class="fact">
                <dt>{{ t('algorithm.workbench.capabilities') }}</dt>
                <dd>
                  <div v-if="strategyView.capabilities.state === 'declared'" class="capability-chips">
                    <span v-for="name in strategyView.capabilities.names" :key="name" class="capability-chip">
                      {{ capabilityNameLabel(name, t) }}
                    </span>
                    <span v-if="strategyView.capabilities.unnamedBits.length > 0" class="unknown">
                      {{ t('algorithm.workbench.capabilityUnnamedBits', { n: strategyView.capabilities.unnamedBits.length }) }}
                    </span>
                  </div>
                  <span v-else-if="strategyView.capabilities.state === 'none'" class="hint-inline">
                    {{ t('algorithm.workbench.capabilitiesNone') }}
                  </span>
                  <span v-else class="unknown">{{ t('algorithm.workbench.capabilitiesUnknown') }}</span>
                </dd>
              </div>
              <div class="fact">
                <dt>{{ t('algorithm.workbench.capabilitiesMask') }}</dt>
                <dd>
                  <span v-if="strategyView.capabilities.mask !== null" class="mono">{{ strategyView.capabilities.mask }}</span>
                  <span v-else class="unknown">{{ t('algorithm.workbench.capabilitiesUnknown') }}</span>
                </dd>
              </div>
              <div class="fact">
                <dt>{{ t('algorithm.workbench.maintenanceParty') }}</dt>
                <dd>
                  <span v-if="strategyView.maintenanceParty" :title="strategyView.maintenanceParty">
                    {{ stateMaintenancePartyLabel(strategyView.maintenanceParty, t) }}
                  </span>
                  <span v-else-if="strategyView.maintenancePartyApplies" class="unknown">
                    {{ t('algorithm.workbench.valueUnknown') }}
                  </span>
                  <span v-else class="unknown">{{ t('algorithm.workbench.notApplicable') }}</span>
                </dd>
              </div>
            </dl>
          </template>
        </section>

        <section class="detail-block">
          <div class="block-head">
            <h3 class="block-title">{{ t('algorithm.workbench.bindings') }}</h3>
            <n-button size="tiny" @click="$emit('manage-bindings')">{{ t('algorithm.workbench.manageBindings') }}</n-button>
          </div>
          <div v-if="bindingsError" class="block-error" role="alert">
            <span>{{ t('algorithm.workbench.bindingLoadFailed') }}</span>
            <n-button size="tiny" quaternary type="primary" @click="$emit('retry-bindings')">{{ t('common.retry') }}</n-button>
          </div>
          <p v-else-if="bindingsLoading" class="note">{{ t('common.loading') }}</p>
          <p v-else-if="bindingTotal === 0" class="note">{{ t('algorithm.noBindings') }}</p>
          <template v-else>
            <p class="binding-count">
              <template v-if="bindingTotal !== null">{{ t('algorithm.workbench.bindingCount', { n: bindingTotal }) }}</template>
              <span v-else class="unknown">{{ t('algorithm.workbench.bindingCountUnknown') }}</span>
            </p>
            <ul v-if="boundUsers.length > 0" class="binding-list">
              <li v-for="user in boundUsers" :key="user.userId">
                <span class="binding-name">
                  {{ user.userName || t('algorithm.workbench.userNameUnavailable') }}
                  <code class="binding-id" :title="user.userId">{{ user.userName ? ` (${user.userId})` : user.userId }}</code>
                </span>
              </li>
            </ul>
            <p v-if="bindingTotal !== null && bindingTotal > boundUsers.length" class="note">
              {{ t('algorithm.workbench.bindingPreview', { shown: boundUsers.length, total: bindingTotal }) }}
            </p>
          </template>
        </section>

        <section class="detail-block">
          <h3 class="block-title">{{ t('algorithm.workbench.executionJobs') }}</h3>
          <p class="note">{{ t('algorithm.workbench.executionJobsHint') }}</p>
          <ul v-if="sessionJobs.length > 0" class="job-list">
            <li v-for="job in sessionJobs" :key="`${job.kind}:${job.jobId}`">
              <div class="job-main">
                <span class="job-kind">{{ job.kind === 'init' ? t('algorithm.workbench.sessionJobInit') : t('algorithm.workbench.sessionJobBind') }}</span>
                <code class="job-id">{{ job.jobId }}</code>
              </div>
              <div class="job-side">
                <n-tag size="tiny" :bordered="false" :type="jobStatusTagType(jobStatus(job.jobId))">
                  {{ jobStatusLabel(jobStatus(job.jobId), t) }}
                </n-tag>
                <n-button size="tiny" quaternary type="primary" @click="$emit('open-job', job.jobId)">
                  {{ t('algorithm.workbench.viewExecution') }}
                </n-button>
              </div>
            </li>
          </ul>
          <p v-else class="note">{{ t('algorithm.workbench.noSessionJobs') }}</p>
        </section>

        <section class="detail-block detail-danger">
          <h3 class="block-title">{{ t('algorithm.workbench.deinitTitle') }}</h3>
          <p class="note">{{ t('algorithm.workbench.deinitConsequence') }}</p>
          <n-popconfirm @positive-click="$emit('deinit')">
            <template #trigger>
              <n-button size="small" type="error" ghost :loading="deinitLoading">{{ t('algorithm.workbench.deinitAction') }}</n-button>
            </template>
            {{ t('algorithm.deleteConfirm', { name: profile.algorithmName }) }}
          </n-popconfirm>
        </section>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <n-button @click="$emit('update:show', false)">{{ t('algorithm.workbench.close') }}</n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { AlgorithmProfile, AlgorithmStrategy } from '@/api/algorithm'
import { useAdaptiveWidth } from '@/composables/useWindowSize'
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'
import { jobStatusLabel } from '@/utils/statusLabels'
import { jobStatusTagType } from '@/utils/jobStatus'
import { describeProfileVersions, describeStrategy } from './algorithmWorkbench'
import {
  capabilityNameLabel,
  stateMaintenancePartyLabel,
  strategyKindExplanation,
  strategyKindLabel,
  strategyPurposeLabel,
} from './strategyLabels'
import type { BoundUser, SessionJobLink } from './types'

const props = defineProps<{
  show: boolean
  profile: AlgorithmProfile | null
  /** Strategy descriptor matched by exact algorithmType, when registered. */
  strategy: AlgorithmStrategy | null
  bindingTotal: number | null
  bindingsLoading: boolean
  bindingsError: boolean
  boundUsers: BoundUser[]
  sessionJobs: SessionJobLink[]
  deinitLoading: boolean
}>()

defineEmits<{
  'update:show': [value: boolean]
  'manage-bindings': []
  'retry-bindings': []
  'open-job': [jobId: string]
  deinit: []
}>()

const { t } = useI18n()
const { drawerWidth } = useAdaptiveWidth(460)
const { snapshots } = useJobTracking()
const copied = ref(false)
let copyTimer: number | null = null

const strategyView = computed(() => props.strategy ? describeStrategy(props.strategy) : null)
const versions = computed(() => describeProfileVersions(props.profile?.version, props.strategy?.version))

function jobStatus(jobId: string): string | null {
  return snapshots[jobId]?.status ?? null
}

async function copyAlgorithmId(): Promise<void> {
  const id = props.profile?.algorithmId
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
.drawer-head {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3, 12px);
  min-width: 0;
}

.drawer-title {
  overflow-wrap: anywhere;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-5, 20px);
}

.detail-block {
  min-width: 0;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3, 12px);
  margin-bottom: var(--apple-space-2, 8px);
}

.block-title {
  margin: 0 0 var(--apple-space-2, 8px);
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
}

.block-head .block-title { margin-bottom: 0; }

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

.id-cell {
  display: flex;
  align-items: flex-start;
  gap: var(--apple-space-2, 8px);
}

.id-text {
  min-width: 0;
  font-family: var(--apple-font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
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

.note {
  margin: var(--apple-space-2, 8px) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.6;
}

.hint-inline { color: var(--apple-gray-3); }
.unknown { color: var(--apple-gray-3); font-style: italic; }
.mono { font-family: var(--apple-font-mono); font-size: 12px; }

.block-error {
  display: flex;
  align-items: center;
  gap: var(--apple-space-2, 8px);
  color: var(--apple-red);
  font-size: 12px;
  line-height: 1.5;
}

.binding-count {
  margin: 0 0 var(--apple-space-2, 8px);
  color: var(--apple-gray-2);
  font-size: 12px;
  line-height: 1.5;
}

.binding-list,
.job-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--apple-border);
}

.binding-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--apple-space-3, 12px);
  padding: var(--apple-space-2, 8px) 0;
  border-bottom: 1px solid var(--apple-border);
  font-size: 12px;
}

 .binding-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--apple-gray-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.binding-id {
  color: var(--apple-gray-3);
  font-family: var(--apple-font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.job-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-3, 12px);
  padding: var(--apple-space-2, 8px) 0;
  border-bottom: 1px solid var(--apple-border);
}

.job-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.job-kind { color: var(--apple-gray-1); font-size: 12px; font-weight: 600; }
.job-id { color: var(--apple-gray-3); font-family: var(--apple-font-mono); font-size: 12px; overflow-wrap: anywhere; }
.job-side { display: flex; align-items: center; gap: var(--apple-space-2, 8px); flex: 0 0 auto; }

.detail-danger {
  border-top: 1px solid var(--apple-border);
  padding-top: var(--apple-space-4, 16px);
}

.drawer-footer { display: flex; justify-content: flex-end; }

@media (max-width: 640px) {
  .fact { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .job-list li { flex-direction: column; align-items: flex-start; }
}
</style>
