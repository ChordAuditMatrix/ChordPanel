<template>
  <div>
    <n-card size="small" :bordered="true" style="margin-top: 12px;">
      <template #header>
        <n-dropdown trigger="click" :options="cellOpOptions" @select="handleCellOpSelect">
          <n-button size="small" :type="cellOpType === 'add' ? 'primary' : cellOpType === 'remove' ? 'error' : 'warning'">
            {{ cellOpLabel }}<template #icon><n-icon :component="ChevronDownOutline" /></template>
          </n-button>
        </n-dropdown>
      </template>
      <n-form v-if="cellOpType === 'add'" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="addForm.ownerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.cells')" required><CellEditor v-model="addForm.cells" /></n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="addLoading" @click="handleAdd">{{ t('ownership.add') }}</n-button></n-form-item>
      </n-form>
      <n-form v-if="cellOpType === 'remove'" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="removeForm.ownerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.cells')" required><CellEditor v-model="removeForm.cells" /></n-form-item>
        <n-form-item :show-label="false"><n-button type="error" :loading="removeLoading" @click="handleRemove">{{ t('ownership.remove') }}</n-button></n-form-item>
      </n-form>
      <n-form v-if="cellOpType === 'move'" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.sourceOwner')" required><UserSelect v-model="moveForm.sourceOwnerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.targetOwner')" required><UserSelect v-model="moveForm.targetOwnerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.cells')" required><CellEditor v-model="moveForm.cells" /></n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="moveLoading" @click="handleMove">{{ t('ownership.move') }}</n-button></n-form-item>
      </n-form>
    </n-card>

    <n-card size="small" :bordered="true" style="margin-top: 12px;">
      <template #header>
        <n-dropdown trigger="click" :options="bulkOpOptions" @select="handleBulkOpSelect">
          <n-button size="small" :type="bulkOpType === 'import' ? 'primary' : 'info'">
            {{ bulkOpLabel }}<template #icon><n-icon :component="ChevronDownOutline" /></template>
          </n-button>
        </n-dropdown>
      </template>
      <n-form v-if="bulkOpType === 'import'" label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="importForm.ownerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.cells')" required><n-input v-model:value="importForm.jsonText" type="textarea" :rows="6" :placeholder="t('ownership.importJsonPlaceholder')" /></n-form-item>
        <n-form-item :label="t('ownership.overwrite')"><n-switch v-model:value="importForm.overwrite" /></n-form-item>
        <n-form-item :show-label="false"><n-button type="primary" :loading="importLoading" @click="handleImport">{{ t('ownership.importBtn') }}</n-button></n-form-item>
      </n-form>
      <n-form v-else label-placement="left" label-width="100">
        <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="exportForm.ownerId" style="width:100%" /></n-form-item>
        <n-form-item :label="t('ownership.exportFilter')">
          <n-grid :cols="2" :x-gap="12">
            <n-grid-item><TableSelect v-model="exportForm.filter.tableIdFrom" :active-only="false" style="width:100%" :placeholder="t('ownership.tableIdFrom')" /></n-grid-item>
            <n-grid-item><TableSelect v-model="exportForm.filter.tableIdTo" :active-only="false" style="width:100%" :placeholder="t('ownership.tableIdTo')" /></n-grid-item>
            <n-grid-item><n-input-number v-model:value="exportForm.filter.rowIdFrom" :show-button="false" style="width:100%" :placeholder="t('ownership.rowIdFrom')" /></n-grid-item>
            <n-grid-item><n-input-number v-model:value="exportForm.filter.rowIdTo" :show-button="false" style="width:100%" :placeholder="t('ownership.rowIdTo')" /></n-grid-item>
          </n-grid>
        </n-form-item>
        <n-form-item :show-label="false"><n-button type="info" :loading="exportLoading" @click="handleExport">{{ t('ownership.exportBtn') }}</n-button></n-form-item>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type Ref } from 'vue'
import { NCard, NDropdown, NButton, NIcon, NInput, NSwitch, NGrid, NGridItem, useMessage } from 'naive-ui'
import { ChevronDownOutline } from '@vicons/ionicons5'
import { addCells, removeCells, moveCells, importCells, exportCells, parseOwnershipJson } from '@/api/ownership'
import type { DataCell, OwnershipExportFilter, OwnershipImportCell } from '@/api/ownership'
import TableSelect from '@/components/TableSelect.vue'
import UserSelect from '@/components/UserSelect.vue'
import CellEditor from '@/components/CellEditor.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const message = useMessage()
const cellOpType = ref<'add' | 'remove' | 'move'>('add')
const cellOpOptions = computed(() => [
  { label: t('ownership.addOwnership'), key: 'add' },
  { label: t('ownership.removeOwnership'), key: 'remove' },
  { label: t('ownership.moveOwnership'), key: 'move' },
])
const cellOpLabel = computed(() => cellOpType.value === 'add' ? t('ownership.addOwnership') : cellOpType.value === 'remove' ? t('ownership.removeOwnership') : t('ownership.moveOwnership'))
function handleCellOpSelect(key: string) { cellOpType.value = key as 'add' | 'remove' | 'move' }
const bulkOpType = ref<'import' | 'export'>('import')
const bulkOpOptions = computed(() => [
  { label: t('ownership.bulkImport'), key: 'import' },
  { label: t('ownership.bulkExport'), key: 'export' },
])
const bulkOpLabel = computed(() => bulkOpType.value === 'import' ? t('ownership.bulkImport') : t('ownership.bulkExport'))
function handleBulkOpSelect(key: string) { bulkOpType.value = key as 'import' | 'export' }

const props = defineProps<{ result: any; error: string }>()
const emit = defineEmits<{ (event: 'update:result', value: any): void; (event: 'update:error', value: string): void }>()
const manageResult = computed({ get: () => props.result, set: value => emit('update:result', value) })
const manageError = computed({ get: () => props.error, set: value => emit('update:error', value) })
const addForm = ref({ ownerId: '', cells: [] as DataCell[] })
const removeForm = ref({ ownerId: '', cells: [] as DataCell[] })
const moveForm = ref({ sourceOwnerId: '', targetOwnerId: '', cells: [] as DataCell[] })
const addLoading = ref(false)
const removeLoading = ref(false)
const moveLoading = ref(false)
async function handleAdd() {
  if (!addForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (addForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  await submitMutation(addLoading, () => addCells(addForm.value.ownerId, addForm.value.cells), t('ownership.submitted'))
}
async function handleRemove() {
  if (!removeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (removeForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  await submitMutation(removeLoading, () => removeCells(removeForm.value.ownerId, removeForm.value.cells), t('ownership.removed'))
}
async function handleMove() {
  if (!moveForm.value.sourceOwnerId.trim() || !moveForm.value.targetOwnerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (moveForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  await submitMutation(moveLoading, () => moveCells(moveForm.value.sourceOwnerId, moveForm.value.targetOwnerId, moveForm.value.cells), t('ownership.moved'))
}
async function submitMutation<T>(loading: Ref<boolean>, request: () => Promise<T>, successMessage: string) {
  loading.value = true; manageResult.value = null; manageError.value = ''
  try {
    manageResult.value = await request()
    message.success(successMessage)
  } catch (error) {
    const detail = error as { response?: { data?: { message?: string } } }
    manageError.value = detail?.response?.data?.message || String(error)
  } finally {
    loading.value = false
  }
}
const importForm = ref({ ownerId: '', jsonText: '', overwrite: false })
const importLoading = ref(false)
async function handleImport() {
  if (!importForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  let cells: OwnershipImportCell[]
  try {
    const parsed = parseOwnershipJson(importForm.value.jsonText)
    cells = Array.isArray(parsed) ? parsed as OwnershipImportCell[] : []
  } catch { message.error(t('ownership.invalidJson')); return }
  if (!Array.isArray(cells) || cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  importLoading.value = true; manageResult.value = null; manageError.value = ''
  try {
    const res = await importCells(importForm.value.ownerId, cells, importForm.value.overwrite)
    manageResult.value = res
    message.success(t('ownership.importSuccess', { count: (res as any)?.cellsImported ?? cells.length }))
  } catch (e: any) { manageError.value = e?.response?.data?.message || String(e) } finally { importLoading.value = false }
}
const exportForm = ref({ ownerId: '', filter: { tableIdFrom: '', tableIdTo: '', rowIdFrom: null as number | null, rowIdTo: null as number | null } })
const exportLoading = ref(false)
async function handleExport() {
  if (!exportForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  const filter: OwnershipExportFilter = {}
  if (exportForm.value.filter.tableIdFrom) filter.tableIdFrom = exportForm.value.filter.tableIdFrom
  if (exportForm.value.filter.tableIdTo) filter.tableIdTo = exportForm.value.filter.tableIdTo
  if (exportForm.value.filter.rowIdFrom != null) filter.rowIdFrom = exportForm.value.filter.rowIdFrom
  if (exportForm.value.filter.rowIdTo != null) filter.rowIdTo = exportForm.value.filter.rowIdTo
  exportLoading.value = true; manageResult.value = null; manageError.value = ''
  try {
    const res = await exportCells(exportForm.value.ownerId, Object.keys(filter).length ? filter : undefined)
    manageResult.value = res
    message.success(t('ownership.exportSuccess', { count: (res as any)?.cells?.length ?? 0 }))
  } catch (e: any) { manageError.value = e?.response?.data?.message || String(e) } finally { exportLoading.value = false }
}
</script>
