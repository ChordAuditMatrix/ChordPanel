<template>
  <div>
    <n-card size="small" :bordered="true" style="margin-top: 12px;">
      <n-form :model="challengeForm" label-placement="left" label-width="100">
        <n-form-item :label="t('audit.ownerId')" required>
          <UserSelect v-model="challengeForm.ownerId" :placeholder="t('audit.selectOwner')" style="width:100%" />
        </n-form-item>
        <n-form-item :label="t('audit.algorithmId')" :feedback="t('audit.autoAlgorithmHint')">
          <AlgorithmSelect v-model="challengeForm.algorithmId" purpose="Audit" :placeholder="t('audit.autoSelectAlgorithm')" style="width:100%" />
        </n-form-item>
        <n-form-item :label="t('audit.extraParams')">
          <KeyValueEditor v-model="challengeForm.params" :hint="challengeParamsHint" />
        </n-form-item>
        <n-form-item :show-label="false">
          <n-button type="primary" :loading="challengeLoading" @click="handleChallenge">{{ t('audit.initiateChallenge') }}</n-button>
        </n-form-item>
      </n-form>
    </n-card>
    <ResultCard v-if="challengeResult" :result="challengeResult" :title="t('audit.challengeResult')" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { challengeProof } from '@/api/audit'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import ResultCard from '@/components/ResultCard.vue'
import KeyValueEditor, { type KvHintItem } from '@/components/KeyValueEditor.vue'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const { t } = useI18n()
const challengeForm = ref({ ownerId: '1', algorithmId: '', params: {} as Record<string, string> })
const challengeLoading = ref(false)
const challengeResult = ref<any>(null)
const challengeParamsHint = computed<KvHintItem[]>(() => [
  { key: 'challengeCount', type: 'number', desc: t('audit.challengeCountHint') },
  { key: 'blockCount', type: 'number', desc: t('audit.blockCountHint') },
  { key: 'seed', type: 'number', desc: t('audit.seedHint') },
  { key: 'usePseudoRandom', type: 'boolean', desc: t('audit.usePseudoRandomHint') },
])

async function handleChallenge() {
  if (!challengeForm.value.ownerId.trim()) { message.warning(t('audit.selectOwnerWarn')); return }
  challengeLoading.value = true
  try {
    const selectedAlgorithmId = (challengeForm.value.algorithmId || '').trim()
    const res: any = await challengeProof({
      initiatorId: '1',
      dataOwnerId: challengeForm.value.ownerId.trim(),
      algorithmId: selectedAlgorithmId || undefined,
      params: challengeForm.value.params,
    })
    challengeResult.value = res
    message.success(t('audit.challengeSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Audit')
  } catch (e: any) { message.error(e?.response?.data?.message || t('audit.challengeFailed')) } finally { challengeLoading.value = false }
}
</script>
