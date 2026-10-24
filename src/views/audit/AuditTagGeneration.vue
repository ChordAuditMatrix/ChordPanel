<template>
  <div class="audit-path">
    <div class="audit-panel">
      <WorkbenchSection :title="t('audit.workbench.tag.title')" :description="t('audit.workbench.tag.description')">
        <n-form :model="form" label-placement="top" class="audit-form">
          <div class="audit-form__grid">
            <n-form-item :label="t('audit.ownerId')" required>
              <UserSelect v-model="form.ownerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
            </n-form-item>
            <n-form-item :label="t('audit.workbench.mode.label')" required>
              <n-radio-group v-model:value="form.mode" size="small" :aria-label="t('audit.workbench.mode.label')">
                <n-radio-button value="automatic">{{ t('audit.workbench.mode.automatic') }}</n-radio-button>
                <n-radio-button value="explicit">{{ t('audit.workbench.mode.explicit') }}</n-radio-button>
              </n-radio-group>
            </n-form-item>
          </div>

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
          </n-form-item>
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

          <fieldset class="audit-fieldset">
            <legend class="audit-fieldset__legend">{{ t('audit.workbench.tag.rangeLabel') }}</legend>
            <div class="audit-form__grid">
              <n-form-item :label="t('audit.blockStart')" required>
                <n-input-number
                  v-model:value="form.blockStart"
                  :show-button="false"
                  :min="0"
                  :max="layoutResult ? Math.max(0, layoutResult.totalBlocks - 1) : undefined"
                  style="width:100%"
                  :placeholder="layoutResult ? t('audit.blockStartPlaceholder', { max: Math.max(0, layoutResult.totalBlocks - 1) }) : undefined"
                />
              </n-form-item>
              <n-form-item :label="t('audit.blockCount')" required>
                <n-input-number
                  v-model:value="form.blockCount"
                  :show-button="false"
                  :min="1"
                  :max="layoutResult?.totalBlocks ?? undefined"
                  style="width:100%"
                  :placeholder="layoutResult ? t('audit.blockCountPlaceholder', { max: layoutResult.totalBlocks }) : undefined"
                />
              </n-form-item>
            </div>
            <p class="audit-hint">{{ t('audit.workbench.tag.rangeHint') }}</p>
          </fieldset>

          <div class="audit-actions">
            <n-button type="primary" :loading="tagLoading" :disabled="layoutLoading" @click="handleGenerateTags">
              {{ t('audit.generateTags') }}
            </n-button>
            <n-button :loading="layoutLoading" @click="handleGetLayout">{{ t('audit.queryLayout') }}</n-button>
          </div>
          <p class="audit-hint">{{ t('audit.workbench.tag.layoutHint') }}</p>
        </n-form>

        <div v-if="layoutJobId" class="layout-state">
          <span class="layout-state__label">{{ t('audit.workbench.tag.layoutJob') }}</span>
          <code class="layout-state__id mono" :title="layoutJobId">{{ layoutJobId }}</code>
          <n-tag size="small" :bordered="false" :type="layoutStatusTagType">{{ layoutStatusLabel }}</n-tag>
        </div>

        <dl v-if="layoutResult" class="layout-facts">
          <div class="layout-facts__item">
            <dt>{{ t('audit.totalBlocks') }}</dt>
            <dd class="mono">{{ layoutResult.totalBlocks }}</dd>
          </div>
          <div class="layout-facts__item">
            <dt>{{ t('audit.totalUnits') }}</dt>
            <dd class="mono">{{ layoutResult.totalCells ?? t('audit.workbench.submission.unavailable') }}</dd>
          </div>
          <div class="layout-facts__item">
            <dt>{{ t('audit.blockSize') }}</dt>
            <dd class="mono">{{ layoutResult.blockSize ?? t('audit.workbench.submission.unavailable') }}</dd>
          </div>
        </dl>
      </WorkbenchSection>
    </div>

    <aside class="audit-aside">
      <section class="audit-panel audit-panel--plain" :aria-label="t('audit.workbench.tag.division.title')">
        <h2 class="audit-panel__title">{{ t('audit.workbench.tag.division.title') }}</h2>
        <ol class="division-list">
          <li class="division-list__item">
            <span class="division-list__index" aria-hidden="true">1</span>
            <div>
              <p class="division-list__label">{{ t('audit.workbench.tag.division.step1') }}</p>
              <p class="division-list__hint">{{ t('audit.workbench.tag.division.step1Hint') }}</p>
            </div>
          </li>
          <li class="division-list__item">
            <span class="division-list__index" aria-hidden="true">2</span>
            <div>
              <p class="division-list__label">{{ t('audit.workbench.tag.division.step2') }}</p>
              <p class="division-list__hint">{{ t('audit.workbench.tag.division.step2Hint') }}</p>
            </div>
          </li>
          <li class="division-list__item">
            <span class="division-list__index" aria-hidden="true">3</span>
            <div>
              <p class="division-list__label">{{ t('audit.workbench.tag.division.step3') }}</p>
              <p class="division-list__hint">{{ t('audit.workbench.tag.division.step3Hint') }}</p>
            </div>
          </li>
        </ol>
        <p class="audit-hint">{{ t('audit.workbench.tag.division.note') }}</p>
      </section>

      <section class="audit-panel audit-panel--plain" :aria-label="t('audit.workbench.tag.storage.title')">
        <h2 class="audit-panel__title">{{ t('audit.workbench.tag.storage.title') }}</h2>
        <p class="storage-value mono" :title="storageNodeId ?? undefined">{{ storageText }}</p>
        <p class="audit-hint">{{ t('audit.workbench.tag.storage.hint') }}</p>
      </section>
    </aside>
  </div>

  <AuditSubmissionCard
    v-if="tagJobId"
    :job-id="tagJobId"
    execution-kind="tagGeneration"
    :algorithm-id="tagResult.algorithmId"
    :selection-mode="submittedMode"
    show-storage
  >
    <template #raw>
      <ResultCard :result="tagResult" :title="t('audit.tagResult')" />
    </template>
  </AuditSubmissionCard>
  <ResultCard
    v-else-if="tagResult"
    :result="tagResult"
    :title="t('audit.tagResult')"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { createLayoutJob, generateTags } from '@/api/audit'
import type { AlgorithmProfile } from '@/api/algorithm'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import ResultCard from '@/components/ResultCard.vue'
import WorkbenchSection from '@/components/WorkbenchSection.vue'
import { subscribeJob, trackJob, useJobTracking } from '@/stores/jobTracking'
import { jobStatusLabel } from '@/utils/statusLabels'
import { jobStatusTagType } from '@/utils/jobStatus'
import { useI18n } from '@/stores/i18n'
import { parseLayoutJobMetadata, type AuditLayoutResult } from '@/utils/auditLayout'
import { metadataText, type AlgorithmSelectionMode } from './auditWorkbench'
import AuditSubmissionCard from './AuditSubmissionCard.vue'

const props = defineProps<{ ownerId: string }>()
const emit = defineEmits<{
  'update:ownerId': [value: string]
  generated: [result: any]
  layout: [payload: { ownerId: string; layout: AuditLayoutResult } | null]
}>()

const message = useMessage()
const { t } = useI18n()
const form = ref({
  ownerId: props.ownerId,
  mode: 'automatic',
  algorithmId: '',
  blockStart: 0,
  blockCount: 1,
})
const selectedAlgorithm = ref<AlgorithmProfile | null>(null)
watch(() => props.ownerId, value => { form.value.ownerId = value })
watch(() => form.value.ownerId, value => emit('update:ownerId', value))

const modeHint = computed(() => t(form.value.mode === 'automatic'
  ? 'audit.workbench.mode.automaticTagHint'
  : 'audit.workbench.mode.explicitTagHint'))
function handleAlgorithmChange(profile: AlgorithmProfile | null) {
  selectedAlgorithm.value = profile
}

const tagLoading = ref(false)
const tagResult = ref<any>(null)
const submittedMode = ref<AlgorithmSelectionMode>('automatic')
const layoutLoading = ref(false)
const layoutResult = ref<AuditLayoutResult | null>(null)
const layoutJobId = ref<string | null>(null)
let layoutRequestSeq = 0
const { snapshots } = useJobTracking()
const layoutJobStatus = computed(() => (layoutJobId.value ? snapshots[layoutJobId.value]?.status ?? '' : ''))
const layoutJobSnapshot = computed(() => (layoutJobId.value ? snapshots[layoutJobId.value] ?? null : null))
const layoutStatusLabel = computed(() => layoutJobSnapshot.value?.snapshotLoaded
  ? jobStatusLabel(layoutJobStatus.value, t)
  : t('audit.workbench.submission.statusLoading'))
const layoutStatusTagType = computed(() => layoutJobSnapshot.value?.snapshotLoaded
  ? jobStatusTagType(layoutJobStatus.value)
  : 'default')
// The subscription keeps the layout Job's snapshot alive (so dismissing it in
// the global job drawer cannot strand the button) and releases at terminal state.
let releaseLayoutJob: (() => void) | null = null
function releaseLayoutJobSubscription() {
  releaseLayoutJob?.()
  releaseLayoutJob = null
}
onBeforeUnmount(releaseLayoutJobSubscription)

function resetLayout() {
  ++layoutRequestSeq
  layoutJobId.value = null
  releaseLayoutJobSubscription()
  layoutLoading.value = false
  layoutResult.value = null
  emit('layout', null)
}

watch(() => form.value.ownerId, resetLayout)

// Layout planning runs as a background Job: the job store polls
// GET /v1/jobs/{jobId}, and this watcher settles the button state on the
// terminal status — rendering the layout totals, or the failure reason.
watch(layoutJobStatus, status => {
  const snapshot = layoutJobId.value ? snapshots[layoutJobId.value] : null
  if (!snapshot) return
  const normalized = status.toLowerCase()
  const succeeded = normalized === 'succeeded'
  const failed = normalized === 'failed' || normalized === 'canceled' || normalized === 'cancelled'
  if (!succeeded && !failed) return
  releaseLayoutJobSubscription()
  layoutLoading.value = false
  if (failed) {
    message.error(snapshot.statusMessage || snapshot.errorCode || t('audit.layoutQueryFailed'))
    return
  }
  const result = parseLayoutJobMetadata(snapshot.metadata)
  if (!result) { message.error(t('audit.layoutQueryFailed')); return }
  layoutResult.value = result
  emit('layout', { ownerId: form.value.ownerId.trim(), layout: result })
})

async function handleGetLayout() {
  const ownerId = form.value.ownerId.trim()
  if (!ownerId) { message.warning(t('audit.selectOwnerWarn')); return }
  const seq = ++layoutRequestSeq
  layoutResult.value = null
  emit('layout', null)
  layoutLoading.value = true
  try {
    const accepted = await createLayoutJob(ownerId)
    if (seq !== layoutRequestSeq) return
    const jobId = String(accepted?.jobId ?? '').trim()
    if (!jobId) {
      layoutLoading.value = false
      message.error(t('audit.layoutQueryFailed'))
      return
    }
    layoutJobId.value = jobId
    trackJob(jobId, 'Query')
    releaseLayoutJobSubscription()
    releaseLayoutJob = subscribeJob(jobId)
  } catch (e: any) {
    if (seq !== layoutRequestSeq) return
    layoutLoading.value = false
    message.error(e?.response?.data?.message || t('audit.layoutQueryFailed'))
  }
}

async function handleGenerateTags() {
  if (!form.value.ownerId.trim()) { message.warning(t('audit.selectOwnerWarn')); return }
  const selectedAlgorithmId = (form.value.algorithmId || '').trim()
  const selectionMode: AlgorithmSelectionMode = form.value.mode === 'explicit' ? 'explicit' : 'automatic'
  if (form.value.mode === 'explicit' && !selectedAlgorithmId) {
    message.warning(t('audit.workbench.mode.required'))
    return
  }
  tagLoading.value = true
  try {
    const res: any = await generateTags({
      algorithmId: selectionMode === 'explicit' ? selectedAlgorithmId : undefined,
      dataOwnerId: form.value.ownerId.trim(),
      blockStart: form.value.blockStart,
      blockCount: Math.max(1, form.value.blockCount),
    })
    tagResult.value = res
    submittedMode.value = selectionMode
    emit('generated', res)
    message.success(t('audit.tagSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Audit')
  } catch (e: any) { message.error(e?.response?.data?.message || t('audit.tagGenerateFailed')) } finally { tagLoading.value = false }
}

const tagJobId = computed(() => {
  const jobId = tagResult.value?.jobId
  return typeof jobId === 'string' && jobId.trim() !== '' ? jobId.trim() : null
})
const tagSnapshot = computed(() => (tagJobId.value ? snapshots[tagJobId.value] ?? null : null))
const storageNodeId = computed(() => metadataText(tagSnapshot.value?.metadata ?? null, 'storageNodeId'))
const storageText = computed(() => {
  if (!tagResult.value) return t('audit.workbench.tag.storage.pending')
  if (tagSnapshot.value?.detailLoadFailed) return t('audit.workbench.submission.unavailable')
  if (!tagSnapshot.value?.detailLoaded) return t('audit.workbench.tag.storage.waiting')
  return storageNodeId.value ?? t('audit.workbench.tag.storage.missing')
})
</script>

<style scoped>
.audit-path {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
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

.audit-panel--plain {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
}

.audit-panel__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.35;
}

.audit-aside {
  display: flex;
  flex-direction: column;
  gap: var(--apple-section-gap);
  min-width: 0;
}

.audit-form {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
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

.audit-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0 var(--apple-space-4);
}

.audit-fieldset {
  margin: 0 0 var(--apple-space-2);
  padding: var(--apple-space-3) 0 0;
  border: 0;
  border-top: 1px solid var(--apple-border);
}

.audit-fieldset__legend {
  padding: 0;
  color: var(--apple-gray-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.audit-hint {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}

.audit-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
}

.layout-state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2);
  margin-top: var(--apple-space-4);
  padding-top: var(--apple-space-3);
  border-top: 1px solid var(--apple-border);
  font-size: 12px;
}

.layout-state__label {
  color: var(--apple-gray-3);
}

.layout-state__id {
  color: var(--apple-gray-2);
  overflow-wrap: anywhere;
}

.layout-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--apple-space-3);
  margin: var(--apple-space-3) 0 0;
}

.layout-facts__item dt {
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.layout-facts__item dd {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-1);
  font-size: 18px;
  font-weight: 620;
  line-height: 1.25;
}

.division-list {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.division-list__item {
  display: flex;
  gap: var(--apple-space-3);
  min-width: 0;
}

.division-list__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border: 1px solid var(--apple-border);
  border-radius: 50%;
  color: var(--apple-gray-3);
  font-size: 11px;
  font-weight: 600;
}

.division-list__label {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.division-list__hint {
  margin: var(--apple-space-1) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.storage-value {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
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
