<template>
  <FormPage max-width="560px">
    <n-tabs type="line" size="small">
      <n-tab-pane name="cell" :tab="t('identity.verifyCell')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="cellForm" label-placement="left" label-width="100">
            <n-form-item :label="t('identity.tableId')"><n-input v-model:value="cellForm.tableId" /></n-form-item>
            <n-form-item :label="t('identity.rowId')"><n-input v-model:value="cellForm.rowId" /></n-form-item>
            <n-form-item :label="t('identity.columnId')"><n-input v-model:value="cellForm.columnId" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="cellLoading" @click="handleVerifyCell">{{ t('identity.verifyBtn') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <ResultCard :result="cellResult" :error="cellError" />
      </n-tab-pane>

      <n-tab-pane name="row" :tab="t('identity.verifyRow')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="rowForm" label-placement="left" label-width="100">
            <n-form-item :label="t('identity.tableId')"><n-input v-model:value="rowForm.tableId" /></n-form-item>
            <n-form-item :label="t('identity.rowId')"><n-input v-model:value="rowForm.rowId" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="rowLoading" @click="handleVerifyRow">{{ t('identity.verifyBtn') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <ResultCard :result="rowResult" :error="rowError" />
      </n-tab-pane>

      <n-tab-pane name="table" :tab="t('identity.verifyTable')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="tableForm" label-placement="left" label-width="100">
            <n-form-item :label="t('identity.tableId')"><n-input v-model:value="tableForm.tableId" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="tableLoading" @click="handleVerifyTable">{{ t('identity.verifyBtn') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <ResultCard :result="tableResult" :error="tableError" />
      </n-tab-pane>

      <n-tab-pane name="resign" :tab="t('identity.resign')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <n-form :model="resignForm" label-placement="left" label-width="100">
            <n-form-item :label="t('identity.ownerId')"><UserSelect v-model="resignForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('identity.algorithmId')"><AlgorithmSelect v-model="resignForm.algorithmId" purpose="Identity" style="width:100%" /></n-form-item>
            <n-form-item :label="t('identity.algorithmType')"><n-select v-model:value="resignForm.algorithmType" :options="algoTypeOptions" :loading="strategyLoading" :placeholder="t('identity.selectAlgorithmType')" /></n-form-item>
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
import { ref, onMounted, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { verifyCell, verifyRow, verifyTable, resign } from '@/api/identity'
import { listAlgorithmTypes } from '@/api/algorithm'
import ResultCard from '@/components/ResultCard.vue'
import FormPage from '@/components/FormPage.vue'
import UserSelect from '@/components/UserSelect.vue'
import AlgorithmSelect from '@/components/AlgorithmSelect.vue'
import { useI18n } from '@/stores/i18n'

const message = useMessage()
const { t } = useI18n()
const cellForm = ref({ tableId: '', rowId: '', columnId: '' })
const cellLoading = ref(false); const cellResult = ref<any>(null); const cellError = ref('')
const rowForm = ref({ tableId: '', rowId: '' })
const rowLoading = ref(false); const rowResult = ref<any>(null); const rowError = ref('')
const tableForm = ref({ tableId: '' })
const tableLoading = ref(false); const tableResult = ref<any>(null); const tableError = ref('')
const resignForm = ref({ ownerId: '', algorithmId: '', algorithmType: '' })
const resignLoading = ref(false); const resignResult = ref<any>(null); const resignError = ref('')

// Dynamically load the algorithm type list (filtered by purpose=Identity), used for the resign algorithmType options
const algoTypes = ref<string[]>([])
const strategyLoading = ref(false)
const algoTypeOptions = computed(() =>
  algoTypes.value.map(t => ({ label: t, value: t }))
)
async function loadAlgoTypes() {
  strategyLoading.value = true
  try {
    algoTypes.value = await listAlgorithmTypes('Identity')
  } catch { /* ignore */ } finally { strategyLoading.value = false }
}
onMounted(loadAlgoTypes)

async function handleVerifyCell() {
  if (!cellForm.value.tableId) { message.warning(t('identity.fillTableId')); return }
  cellLoading.value = true; cellResult.value = null; cellError.value = ''
  try { cellResult.value = await verifyCell(cellForm.value.tableId, cellForm.value.rowId, cellForm.value.columnId) }
  catch (e: any) { cellError.value = e?.response?.data?.message || String(e) } finally { cellLoading.value = false }
}
async function handleVerifyRow() {
  rowLoading.value = true; rowResult.value = null; rowError.value = ''
  try { rowResult.value = await verifyRow(rowForm.value.tableId, rowForm.value.rowId) }
  catch (e: any) { rowError.value = e?.response?.data?.message || String(e) } finally { rowLoading.value = false }
}
async function handleVerifyTable() {
  tableLoading.value = true; tableResult.value = null; tableError.value = ''
  try { tableResult.value = await verifyTable(tableForm.value.tableId) }
  catch (e: any) { tableError.value = e?.response?.data?.message || String(e) } finally { tableLoading.value = false }
}
async function handleResign() {
  if (!resignForm.value.ownerId || !resignForm.value.algorithmId) { message.warning(t('identity.fillComplete')); return }
  resignLoading.value = true; resignResult.value = null; resignError.value = ''
  try { resignResult.value = await resign(resignForm.value.ownerId, resignForm.value.algorithmId, resignForm.value.algorithmType); message.success(t('identity.resignSubmitted')) }
  catch (e: any) { resignError.value = e?.response?.data?.message || String(e) } finally { resignLoading.value = false }
}
</script>

<style scoped>
</style>
