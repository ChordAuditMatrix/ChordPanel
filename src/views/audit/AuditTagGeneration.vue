<template>
  <div>
    <n-card size="small" :bordered="true" :title="t('audit.generateTags')" style="margin-top: 12px;">
      <n-form :model="form" label-placement="left" label-width="100">
        <n-form-item :label="t('audit.ownerId')" required>
          <UserSelect v-model="form.ownerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
        </n-form-item>
        <n-form-item :label="t('audit.algorithmId')" :feedback="t('audit.autoAlgorithmHint')">
          <AlgorithmSelect v-model="form.algorithmId" purpose="Audit" :placeholder="t('audit.autoSelectAlgorithm')" style="width:100%" />
        </n-form-item>
        <n-form-item :label="t('audit.blockStart')" required>
          <n-input-number v-model:value="form.blockStart" :show-button="false" style="width:100%" :min="0" :placeholder="t('audit.blockStartPlaceholder', { max: Math.max(0, (layoutResult?.totalBlocks ?? 1) - 1) })" />
        </n-form-item>
        <n-form-item :label="t('audit.blockCount')" required>
          <n-input-number v-model:value="form.blockCount" :show-button="false" style="width:100%" :min="1" :placeholder="t('audit.blockCountPlaceholder', { max: layoutResult?.totalBlocks ?? '?' })" />
        </n-form-item>
        <n-form-item :show-label="false">
          <n-space>
            <n-button type="primary" :loading="tagLoading" :disabled="layoutLoading" @click="handleGenerateTags">{{ t('audit.generateTags') }}</n-button>
            <n-button :loading="layoutLoading" @click="handleGetLayout">{{ t('audit.queryLayout') }}</n-button>
          </n-space>
        </n-form-item>
      </n-form>
      <n-descriptions v-if="layoutResult" :column="3" label-placement="left" bordered size="small" style="margin-top: 8px;">
        <n-descriptions-item :label="t('audit.totalBlocks')">{{ layoutResult.totalBlocks ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('audit.totalUnits')">{{ layoutResult.totalCells ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('audit.blockSize')">{{ layoutResult.blockSize ?? 1024 }} B</n-descriptions-item>
      </n-descriptions>
    </n-card>
    <ResultCard v-if="tagResult" :result="tagResult" :title="t('audit.tagResult')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { createLayoutJob, generateTags } from '@/api/audit'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import ResultCard from '@/components/ResultCard.vue'
import { subscribeJob, trackJob, useJobTracking } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'
import { parseLayoutJobMetadata, type AuditLayoutResult } from '@/utils/auditLayout'

const props = defineProps<{ ownerId: string; algorithmId: string }>()
const emit = defineEmits<{
  'update:ownerId': [value: string]
  'update:algorithmId': [value: string]
  generated: [result: any]
  layout: [result: any]
}>()

const message = useMessage()
const { t } = useI18n()
const form = ref({ ownerId: props.ownerId, algorithmId: props.algorithmId, blockStart: 0, blockCount: 1 })
watch(() => props.ownerId, value => { form.value.ownerId = value })
watch(() => props.algorithmId, value => { form.value.algorithmId = value })
watch(() => form.value.ownerId, value => emit('update:ownerId', value))
watch(() => form.value.algorithmId, value => emit('update:algorithmId', value))

const tagLoading = ref(false)
const tagResult = ref<any>(null)
const layoutLoading = ref(false)
const layoutResult = ref<AuditLayoutResult | null>(null)
const layoutJobId = ref<string | null>(null)
let layoutRequestSeq = 0
const { snapshots } = useJobTracking()
const layoutJobStatus = computed(() => (layoutJobId.value ? snapshots[layoutJobId.value]?.status ?? '' : ''))
// The subscription keeps the layout Job's snapshot alive (so dismissing it in
// the global job drawer cannot strand the button) and releases at terminal state.
let releaseLayoutJob: (() => void) | null = null
function releaseLayoutJobSubscription() {
  releaseLayoutJob?.()
  releaseLayoutJob = null
}
onBeforeUnmount(releaseLayoutJobSubscription)

watch(() => form.value.ownerId, () => {
  ++layoutRequestSeq
  layoutJobId.value = null
  releaseLayoutJobSubscription()
  layoutLoading.value = false
  layoutResult.value = null
  emit('layout', null)
})

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
  emit('layout', result)
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
  tagLoading.value = true
  try {
    const res: any = await generateTags({
      algorithmId: selectedAlgorithmId || undefined,
      dataOwnerId: form.value.ownerId.trim(),
      blockStart: form.value.blockStart,
      blockCount: Math.max(1, form.value.blockCount),
      blockSize: 1024,
    })
    tagResult.value = res
    emit('generated', res)
    message.success(t('audit.tagSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Audit')
  } catch (e: any) { message.error(e?.response?.data?.message || t('audit.tagGenerateFailed')) } finally { tagLoading.value = false }
}
</script>
