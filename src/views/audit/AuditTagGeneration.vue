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
            <n-button type="primary" :loading="tagLoading" @click="handleGenerateTags">{{ t('audit.generateTags') }}</n-button>
            <n-button :loading="layoutLoading" @click="handleGetLayout">{{ t('audit.queryLayout') }}</n-button>
          </n-space>
        </n-form-item>
      </n-form>
      <n-descriptions v-if="layoutResult" :column="3" label-placement="left" bordered size="small" style="margin-top: 8px;">
        <n-descriptions-item :label="t('audit.totalBlocks')">{{ layoutResult.totalBlocks ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('audit.totalUnits')">{{ layoutResult.totalUnits ?? '-' }}</n-descriptions-item>
        <n-descriptions-item :label="t('audit.blockSize')">{{ layoutResult.blockSize ?? 1024 }} B</n-descriptions-item>
      </n-descriptions>
    </n-card>
    <ResultCard v-if="tagResult" :result="tagResult" :title="t('audit.tagResult')" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { generateTags, getBlockLayout } from '@/api/audit'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import ResultCard from '@/components/ResultCard.vue'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'

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
const layoutResult = ref<any>(null)
let layoutRequestSeq = 0
watch(() => form.value.ownerId, () => {
  ++layoutRequestSeq
  layoutLoading.value = false
  layoutResult.value = null
  emit('layout', null)
})

async function handleGetLayout() {
  const ownerId = form.value.ownerId.trim()
  if (!ownerId) { message.warning(t('audit.selectOwnerWarn')); return }
  const seq = ++layoutRequestSeq
  layoutLoading.value = true
  try {
    const result: any = await getBlockLayout(ownerId, 1024)
    if (seq !== layoutRequestSeq || ownerId !== form.value.ownerId.trim()) return
    layoutResult.value = result
    emit('layout', result)
  } catch (e: any) {
    if (seq === layoutRequestSeq) message.error(e?.response?.data?.message || t('audit.layoutQueryFailed'))
  } finally {
    if (seq === layoutRequestSeq) layoutLoading.value = false
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
