<template>
  <div>
    <div v-if="mode === 'generate'">
    <n-card size="small" :bordered="true" style="margin-top: 12px;">
      <template #header>
        <n-radio-group v-model:value="isRangeMode" size="small">
          <n-radio-button :value="false">{{ t('ownership.singleProof') }}</n-radio-button>
          <n-radio-button :value="true">{{ t('ownership.rangeProof') }}</n-radio-button>
        </n-radio-group>
      </template>
      <n-form v-if="!isRangeMode" :model="genForm" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.proofType')" required>
          <n-select v-model:value="genForm.proofType" :options="membershipOptions" />
        </n-form-item>
        <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="genForm.ownerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.tableId')" required><TableSelect v-model="genForm.tableId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.rowId')" required><n-input v-model:value="genForm.rowId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.columnId')" required><n-input-number v-model:value="genForm.columnId" :show-button="false" style="width:100%" /></n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="genLoading" @click="handleGenerate">{{ t('ownership.generateSingle') }}</n-button></n-form-item>
      </n-form>
      <n-form v-else :model="rangeGenForm" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="rangeGenForm.ownerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.tableIdFrom')" required><TableSelect v-model="rangeGenForm.tableIdFrom" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.tableIdTo')" required><TableSelect v-model="rangeGenForm.tableIdTo" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.rowIdFrom')" required><n-input v-model:value="rangeGenForm.rowIdFrom" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.rowIdTo')" required><n-input v-model:value="rangeGenForm.rowIdTo" style="width:100%" /></n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="rangeGenLoading" @click="handleRangeGenerate">{{ t('ownership.generateRange') }}</n-button></n-form-item>
      </n-form>
    </n-card>
    <ResultCard :result="genResult" :error="genError" :title="t('ownership.singleResult')" max-width="640px" />
    <ResultCard :result="rangeGenResult" :error="rangeGenError" :title="t('ownership.rangeResult')" max-width="640px" />

    </div>
    <div v-else>
    <n-card size="small" :bordered="true" style="margin-top: 12px;">
      <template #header>
        <n-radio-group v-model:value="isRangeVerifyMode" size="small">
          <n-radio-button :value="false">{{ t('ownership.singleVerify') }}</n-radio-button>
          <n-radio-button :value="true">{{ t('ownership.rangeVerify') }}</n-radio-button>
        </n-radio-group>
      </template>
      <n-form v-if="!isRangeVerifyMode" :model="verifyForm" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.proofType')" required>
          <n-select v-model:value="verifyForm.proofType" :options="membershipOptions" />
        </n-form-item>
        <n-form-item :label="t('ownership.proofJson')" required>
          <n-input v-model:value="verifyForm.proofJson" type="textarea" :rows="6" :placeholder="t('ownership.pasteProof')" />
        </n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="verifyLoading" @click="handleVerify">{{ t('ownership.verifySingle') }}</n-button></n-form-item>
      </n-form>
      <n-form v-else label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.proofJson')" required>
          <n-input v-model:value="rangeVerifyForm.proofJson" type="textarea" :rows="6" :placeholder="t('ownership.pasteRangeProof')" />
        </n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="rangeVerifyLoading" @click="handleRangeVerify">{{ t('ownership.verifyRange') }}</n-button></n-form-item>
      </n-form>
    </n-card>
    <n-card v-if="verifyResult !== null" size="small" :bordered="true" style="margin-top: 12px;">
      <n-result v-if="verifyResult === true" status="success" :title="t('ownership.singlePassed')" />
      <n-result v-else status="error" :title="t('ownership.singleFailed')" :description="verifyError || ''" />
    </n-card>
    <n-card v-if="rangeVerifyResult !== null" size="small" :bordered="true" style="margin-top: 12px;">
      <n-result v-if="rangeVerifyResult === true" status="success" :title="t('ownership.rangePassed')" />
      <n-result v-else status="error" :title="t('ownership.rangeFailed')" :description="rangeVerifyError || ''" />
    </n-card>
  </div>

  </div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import { NCard, NResult, NRadioGroup, NRadioButton, NInput, useMessage } from 'naive-ui'
import { generateProof, verifyProof, generateRangeProof, verifyRangeProof, parseOwnershipJson } from '@/api/ownership'
import ResultCard from '@/components/ResultCard.vue'
import TableSelect from '@/components/TableSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'
defineProps<{ mode: 'generate' | 'verify' }>()
const { t } = useI18n()
const message = useMessage()
const isRangeMode = ref(false)
const isRangeVerifyMode = ref(false)
const membershipOptions = computed(() => [
  { label: t('ownership.membership'), value: 'membership' },
  { label: t('ownership.nonMembership'), value: 'non-membership' },
])
function hasNonStringRowIds(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasNonStringRowIds)
  if (value === null || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) =>
    ((key === 'rowId' || key === 'rid') && typeof item !== 'string') || hasNonStringRowIds(item),
  )
}
function parseProofObject(text: string): Record<string, unknown> {
  const value = parseOwnershipJson(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Ownership proof must be a JSON object')
  if (hasNonStringRowIds(value)) throw new TypeError('Ownership proof row IDs must be strings')
  return value as Record<string, unknown>
}

const genForm = ref({ proofType: 'membership' as 'membership' | 'non-membership', ownerId: '', tableId: '', rowId: '', columnId: 0 })
const genLoading = ref(false)
const genResult = ref<any>(null)
const genError = ref('')
async function handleGenerate() {
  if (!genForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (!genForm.value.tableId) { message.warning(t('identity.fillTableId')); return }
  genLoading.value = true; genResult.value = null; genError.value = ''
  try {
    const res: any = await generateProof({ ...genForm.value })
    genResult.value = res
    message.success(t('ownership.proofGenerateSuccess'))
    if (res?.jobId) trackJob(res.jobId, 'Ownership')
  } catch (e: any) { genError.value = e?.response?.data?.message || String(e) } finally { genLoading.value = false }
}

const rangeGenForm = ref({ ownerId: '', tableIdFrom: '', tableIdTo: '', rowIdFrom: '', rowIdTo: '' })
const rangeGenLoading = ref(false)
const rangeGenResult = ref<any>(null)
const rangeGenError = ref('')
async function handleRangeGenerate() {
  if (!rangeGenForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (!rangeGenForm.value.tableIdFrom || !rangeGenForm.value.tableIdTo) { message.warning(t('identity.fillTableId')); return }
  rangeGenLoading.value = true; rangeGenResult.value = null; rangeGenError.value = ''
  try {
    const res: any = await generateRangeProof({ ...rangeGenForm.value })
    rangeGenResult.value = res
    message.success(t('ownership.rangeProofSubmitted'))
    if (res?.jobId) trackJob(res.jobId, 'Ownership')
  } catch (e: any) { rangeGenError.value = e?.response?.data?.message || String(e) } finally { rangeGenLoading.value = false }
}

const verifyForm = ref({ proofType: 'membership', proofJson: '' })
const verifyLoading = ref(false)
const verifyResult = ref<boolean | null>(null)
const verifyError = ref('')
async function handleVerify() {
  let proofObj: Record<string, unknown>
  try { proofObj = parseProofObject(verifyForm.value.proofJson) }
  catch { message.error(t('ownership.proofJsonInvalid')); return }
  verifyLoading.value = true; verifyResult.value = null; verifyError.value = ''
  try {
    const res = await verifyProof(verifyForm.value.proofType, proofObj)
    verifyResult.value = (res as any)?.valid ?? (res as any)?.success ?? true
    if (!verifyResult.value) verifyError.value = (res as any)?.reason || t('ownership.proofInvalid')
  } catch (e: any) {
    verifyResult.value = false
    verifyError.value = e?.response?.data?.message || String(e)
  } finally { verifyLoading.value = false }
}

const rangeVerifyForm = ref({ proofJson: '' })
const rangeVerifyLoading = ref(false)
const rangeVerifyResult = ref<boolean | null>(null)
const rangeVerifyError = ref('')
async function handleRangeVerify() {
  let proofObj: Record<string, unknown>
  try { proofObj = parseProofObject(rangeVerifyForm.value.proofJson) }
  catch { message.error(t('ownership.proofJsonInvalid')); return }
  rangeVerifyLoading.value = true; rangeVerifyResult.value = null; rangeVerifyError.value = ''
  try {
    const res = await verifyRangeProof(proofObj)
    rangeVerifyResult.value = (res as any)?.valid ?? (res as any)?.success ?? true
    if (!rangeVerifyResult.value) rangeVerifyError.value = (res as any)?.reason || t('ownership.proofInvalid')
  } catch (e: any) {
    rangeVerifyResult.value = false
    rangeVerifyError.value = e?.response?.data?.message || String(e)
  } finally { rangeVerifyLoading.value = false }
}
</script>
