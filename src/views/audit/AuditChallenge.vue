<template>
  <div class="audit-path">
    <div class="audit-panel">
      <WorkbenchSection :title="t('audit.workbench.challenge.title')" :description="t('audit.workbench.challenge.description')">
        <n-form :model="form" label-placement="top" class="audit-form">
          <n-form-item :label="t('audit.ownerId')" required>
            <UserSelect v-model="ownerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
          </n-form-item>

          <n-form-item :label="t('audit.workbench.mode.label')" required>
            <n-radio-group v-model:value="form.mode" size="small" :aria-label="t('audit.workbench.mode.label')">
              <n-radio-button value="automatic">{{ t('audit.workbench.mode.automatic') }}</n-radio-button>
              <n-radio-button value="explicit">{{ t('audit.workbench.mode.explicit') }}</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <p class="audit-hint">{{ modeHint }}</p>

          <n-form-item
            v-if="form.mode === 'explicit'"
            :label="t('audit.algorithmId')"
            required
            :feedback="t('audit.workbench.mode.explicitScopeHint')"
          >
            <AlgorithmSelect
              v-model="form.algorithmId"
              purpose="Audit"
              :placeholder="t('audit.workbench.mode.explicitPlaceholder')"
              style="width:100%"
              @change="handleAlgorithmChange"
            />
          <div v-if="form.mode === 'explicit' && selectedAlgorithm" class="algorithm-selection">
            <span class="algorithm-selection__label">{{ t('audit.workbench.selection.selected') }}</span>
            <strong>{{ selectedAlgorithm.algorithmName }}</strong>
            <span>{{ t('audit.workbench.selection.algorithmType') }} · {{ selectedAlgorithm.algorithmType }}</span>
            <span>{{ t('audit.workbench.selection.purpose') }} · {{ selectedAlgorithm.purpose === 'Audit' ? t('algorithm.workbench.purposeAudit') : selectedAlgorithm.purpose }}</span>
            <code
              class="algorithm-selection__id mono"
              tabindex="0"
              :title="selectedAlgorithm.algorithmId"
              :aria-label="`${t('audit.workbench.selection.algorithmId')}: ${selectedAlgorithm.algorithmId}`"
            >ID</code>
          </div>
          </n-form-item>

          <n-form-item :label="t('audit.extraParams')" :feedback="t('audit.workbench.challenge.paramsHint')">
            <KeyValueEditor v-model="form.params" :hint="challengeParamsHint" />
          </n-form-item>

          <div class="audit-actions">
            <n-button type="primary" :loading="challengeLoading" @click="handleChallenge">
              {{ t('audit.initiateChallenge') }}
            </n-button>
          </div>
        </n-form>
      </WorkbenchSection>
    </div>

    <AuditChallengeProbability :job-id="challengeJobId" />
  </div>

  <AuditSubmissionCard
    v-if="challengeJobId"
    :job-id="challengeJobId"
    :algorithm-id="challengeResult?.algorithmId ?? null"
    :selection-mode="challengeSelectionMode"
    selection-mode-source="response"
  >
    <template #raw>
      <ResultCard :result="challengeResult" :title="t('audit.challengeResult')" />
    </template>
  </AuditSubmissionCard>
  <ResultCard
    v-else-if="challengeResult"
    :result="challengeResult"
    :title="t('audit.challengeResult')"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { challengeProof } from '@/api/audit'
import type { AlgorithmProfile } from '@/api/algorithm'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import ResultCard from '@/components/ResultCard.vue'
import KeyValueEditor, { type KvHintItem } from '@/components/KeyValueEditor.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'
import { normalizeSelectionMode, type AlgorithmSelectionMode } from './auditWorkbench'
import AuditSubmissionCard from './AuditSubmissionCard.vue'
import AuditChallengeProbability from './AuditChallengeProbability.vue'

const message = useMessage()
const { t } = useI18n()
const props = defineProps<{ ownerId: string }>()
const emit = defineEmits<{ 'update:ownerId': [value: string] }>()
const ownerId = computed({
  get: () => props.ownerId,
  set: (value: string) => emit('update:ownerId', value),
})
const form = ref({
  mode: 'automatic',
  algorithmId: '',
  params: {} as Record<string, string>,
})
const selectedAlgorithm = ref<AlgorithmProfile | null>(null)
const challengeLoading = ref(false)
const challengeResult = ref<any>(null)
const challengeJobId = computed(() => {
  const jobId = challengeResult.value?.jobId
  return typeof jobId === 'string' && jobId.trim() !== '' ? jobId.trim() : null
})
const challengeSelectionMode = computed<AlgorithmSelectionMode | null>(() =>
  normalizeSelectionMode(challengeResult.value?.algorithmSelectionMode),
)
const modeHint = computed(() => t(form.value.mode === 'automatic'
  ? 'audit.workbench.mode.automaticChallengeHint'
  : 'audit.workbench.mode.explicitChallengeHint'))

const challengeParamsHint = computed<KvHintItem[]>(() => [
  { key: 'challengeCount', type: 'number', desc: t('audit.workbench.challenge.challengeCountHint') },
  { key: 'seed', type: 'number', desc: t('audit.workbench.challenge.seedHint') },
  { key: 'usePseudoRandom', type: 'boolean', desc: t('audit.workbench.challenge.usePseudoRandomHint') },
])

function handleAlgorithmChange(profile: AlgorithmProfile | null) {
  selectedAlgorithm.value = profile
}
async function handleChallenge() {
  if (!ownerId.value.trim()) { message.warning(t('audit.selectOwnerWarn')); return }
  const selectedAlgorithmId = (form.value.algorithmId || '').trim()
  if (form.value.mode === 'explicit' && !selectedAlgorithmId) {
    message.warning(t('audit.workbench.mode.required'))
    return
  }
  challengeLoading.value = true
  try {
    const res: any = await challengeProof({
      initiatorId: '1',
      dataOwnerId: ownerId.value.trim(),
      algorithmId: form.value.mode === 'explicit' ? selectedAlgorithmId : undefined,
      params: form.value.params,
    })
    challengeResult.value = res
    message.success(t('audit.challengeSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Audit')
  } catch (e: any) { message.error(e?.response?.data?.message || t('audit.challengeFailed')) } finally { challengeLoading.value = false }
}
</script>

<style scoped>
.audit-path {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.9fr);
  gap: var(--apple-section-gap);
  align-items: start;
  min-width: 0;
}

.audit-panel {
  min-width: 0;
  padding: var(--apple-space-5);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}

.audit-form {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
}

.audit-hint {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}
.algorithm-selection {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--apple-space-2) var(--apple-space-3);
  margin: calc(var(--apple-space-2) * -1) 0 var(--apple-space-3);
  padding: var(--apple-space-2) var(--apple-space-3);
  border-left: 2px solid var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 4%, var(--apple-card));
  color: var(--apple-gray-2);
  font-size: 12px;
}

.algorithm-selection__label {
  color: var(--apple-gray-3);
  font-size: 11px;
}

.algorithm-selection strong {
  color: var(--apple-gray-1);
  font-weight: 620;
}

.algorithm-selection__id {
  color: var(--apple-gray-3);
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.audit-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}

.mono {
  font-family: var(--apple-font-mono);
}

@media (max-width: 960px) {
  .audit-path {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
