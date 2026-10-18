<template>
  <FormPage max-width="560px">
    <n-tabs type="line" size="small">
      <n-tab-pane name="verify" display-directive="show:lazy" :tab="t('identity.verify')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="verifyForm" label-placement="left" label-width="100">
            <n-form-item :show-label="false">
              <n-radio-group v-model:value="verifyScope" size="small">
                <n-radio-button value="cell">{{ t('identity.verifyCell') }}</n-radio-button>
                <n-radio-button value="row">{{ t('identity.verifyRow') }}</n-radio-button>
                <n-radio-button value="table">{{ t('identity.verifyTable') }}</n-radio-button>
              </n-radio-group>
            </n-form-item>
            <n-form-item :label="t('identity.tableId')" required><TableSelect v-model="verifyForm.tableId" style="width:100%" /></n-form-item>
            <n-form-item v-if="verifyScope !== 'table'" :label="t('identity.rowId')" required><n-input v-model:value="verifyForm.rowId" /></n-form-item>
            <n-form-item v-if="verifyScope === 'cell'" :label="t('identity.columnId')" required><n-input v-model:value="verifyForm.columnId" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="verifyLoading" @click="handleVerify">{{ t('identity.verifyBtn') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <ResultCard :result="verifyResult" :error="verifyError" />
      </n-tab-pane>

      <n-tab-pane name="resign" display-directive="show:lazy" :tab="t('identity.resign')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="resignForm" label-placement="left" label-width="100">
            <n-form-item :label="t('identity.ownerId')" required><UserSelect v-model="resignForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('identity.algorithmId')" required><AlgorithmSelect v-model="resignForm.algorithmId" purpose="Identity" style="width:100%" @change="handleAlgorithmChange" /></n-form-item>
            <n-form-item :show-label="false">
              <n-popconfirm @positive-click="handleResign">
                <template #trigger><n-button type="warning" :loading="resignLoading">{{ t('identity.triggerResign') }}</n-button></template>
                {{ t('identity.resignConfirm') }}
              </n-popconfirm>
            </n-form-item>
          </n-form>
        </n-card>
        <ResultCard :result="resignResult" :error="resignError" />
      </n-tab-pane>
    </n-tabs>
  </FormPage>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { verifyCell, verifyRow, verifyTable, resign } from '@/api/identity'
import type { AlgorithmProfile } from '@/api/algorithm'
import ResultCard from '@/components/ResultCard.vue'
import FormPage from '@/components/FormPage.vue'
import TableSelect from '@/components/TableSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import { trackJob } from '@/stores/jobTracking'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const { t } = useI18n()
const verifyScope = ref<'cell' | 'row' | 'table'>('cell')
const verifyForm = ref({ tableId: '', rowId: '', columnId: '' })
const verifyLoading = ref(false); const verifyResult = ref<any>(null); const verifyError = ref('')
let verifyRequestSequence = 0
watch(
  [verifyScope, () => verifyForm.value.tableId, () => verifyForm.value.rowId, () => verifyForm.value.columnId],
  () => {
    verifyRequestSequence += 1
    verifyLoading.value = false
    verifyResult.value = null
    verifyError.value = ''
  },
)
const resignForm = ref({ ownerId: '', algorithmId: '' })
const resignLoading = ref(false); const resignResult = ref<any>(null); const resignError = ref('')
// Profile chosen via AlgorithmSelect; its algorithmType is the single source of the resign type.
const selectedProfile = ref<AlgorithmProfile | null>(null)

function handleAlgorithmChange(profile: AlgorithmProfile | null) {
  selectedProfile.value = profile
}

async function handleVerify() {
  const scope = verifyScope.value
  const { tableId, rowId, columnId } = verifyForm.value
  if (!tableId) { message.warning(t('identity.fillTableId')); return }
  if (scope === 'cell' && !columnId) { message.warning(t('identity.fillComplete')); return }
  const requestSequence = ++verifyRequestSequence
  verifyLoading.value = true; verifyResult.value = null; verifyError.value = ''
  try {
    const res: any = scope === 'cell'
      ? await verifyCell(tableId, rowId, columnId)
      : scope === 'row'
        ? await verifyRow(tableId, rowId)
        : await verifyTable(tableId)
    if (res?.jobId) trackJob(res.jobId, 'Identity')
    if (requestSequence !== verifyRequestSequence || scope !== verifyScope.value) return
    verifyResult.value = res
  }
  catch (e: any) {
    if (requestSequence !== verifyRequestSequence || scope !== verifyScope.value) return
    verifyError.value = e?.response?.data?.message || String(e)
  }
  finally {
    if (requestSequence === verifyRequestSequence && scope === verifyScope.value) verifyLoading.value = false
  }
}

async function handleResign() {
  const ownerId = resignForm.value.ownerId
  const profile = selectedProfile.value
  if (!ownerId || !resignForm.value.algorithmId || !profile || profile.algorithmId !== resignForm.value.algorithmId || !profile.algorithmType) {
    message.warning(t('identity.fillComplete')); return
  }
  resignLoading.value = true; resignResult.value = null; resignError.value = ''
  try {
    const res: any = await resign(ownerId, profile.algorithmId, profile.algorithmType)
    resignResult.value = res
    message.success(t('identity.resignSubmitted'))
    // Resigning is an async job — surface it in the global async job drawer
    if (res?.jobId) trackJob(res.jobId, 'Identity')
  }
  catch (e: any) { resignError.value = e?.response?.data?.message || String(e) } finally { resignLoading.value = false }
}
</script>

<style scoped>
</style>
