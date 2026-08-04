<template>
  <FormPage max-width="640px">
    <n-tabs type="line" size="small" v-model:value="activeTab">
      <!-- Generate proof -->
      <n-tab-pane name="generate" :tab="t('ownership.generate')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>
            <n-radio-group v-model:value="isRangeMode" size="small">
              <n-radio-button :value="false">{{ t('ownership.singleProof') }}</n-radio-button>
              <n-radio-button :value="true">{{ t('ownership.rangeProof') }}</n-radio-button>
            </n-radio-group>
          </template>
          <!-- Single proof form -->
          <n-form v-if="!isRangeMode" :model="genForm" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.proofType')" required>
              <n-select v-model:value="genForm.proofType" :options="membershipOptions" />
            </n-form-item>
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="genForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.tableId')" required><n-input-number v-model:value="genForm.tableId" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.rowId')" required><n-input-number v-model:value="genForm.rowId" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.columnId')" required><n-input-number v-model:value="genForm.columnId" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="genLoading" @click="handleGenerate">{{ t('ownership.generateSingle') }}</n-button></n-form-item>
          </n-form>
          <!-- Range proof form -->
          <n-form v-else :model="rangeGenForm" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="rangeGenForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.tableIdFrom')" required><n-input-number v-model:value="rangeGenForm.tableIdFrom" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.tableIdTo')" required><n-input-number v-model:value="rangeGenForm.tableIdTo" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.rowIdFrom')" required><n-input-number v-model:value="rangeGenForm.rowIdFrom" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.rowIdTo')" required><n-input-number v-model:value="rangeGenForm.rowIdTo" :show-button="false" style="width:100%" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="rangeGenLoading" @click="handleRangeGenerate">{{ t('ownership.generateRange') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <ResultCard :result="genResult" :error="genError" :title="t('ownership.singleResult')" max-width="640px" />
        <ResultCard :result="rangeGenResult" :error="rangeGenError" :title="t('ownership.rangeResult')" max-width="640px" />
      </n-tab-pane>

      <!-- Verify proof -->
      <n-tab-pane name="verify" :tab="t('ownership.verify')">
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>
            <n-radio-group v-model:value="isRangeVerifyMode" size="small">
              <n-radio-button :value="false">{{ t('ownership.singleVerify') }}</n-radio-button>
              <n-radio-button :value="true">{{ t('ownership.rangeVerify') }}</n-radio-button>
            </n-radio-group>
          </template>
          <!-- Single verification -->
          <n-form v-if="!isRangeVerifyMode" :model="verifyForm" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.proofType')" required>
              <n-select v-model:value="verifyForm.proofType" :options="membershipOptions" />
            </n-form-item>
            <n-form-item :label="t('ownership.proofJson')" required>
              <n-input v-model:value="verifyForm.proofJson" type="textarea" :rows="6" :placeholder="t('ownership.pasteProof')" />
            </n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="verifyLoading" @click="handleVerify">{{ t('ownership.verifySingle') }}</n-button></n-form-item>
          </n-form>
          <!-- Range verification -->
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
      </n-tab-pane>

      <!-- Manage -->
      <n-tab-pane name="manage" :tab="t('ownership.manage')">
        <!-- Tree management -->
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>{{ t('ownership.treeManagement') }}</template>
          <n-form label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="treeForm.ownerId" style="width:100%" /></n-form-item>
          </n-form>
          <n-space>
            <n-button type="primary" :loading="createTreeLoading" @click="handleCreateTree">{{ t('ownership.createTreeBtn') }}</n-button>
            <n-popconfirm @positive-click="handleDeleteTree">
              <template #trigger>
                <n-button type="error" :loading="deleteTreeLoading" :disabled="!treeForm.ownerId">{{ t('ownership.deleteTreeBtn') }}</n-button>
              </template>
              {{ t('ownership.deleteTreeConfirm') }}
            </n-popconfirm>
          </n-space>
        </n-card>

        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>{{ t('ownership.queryOwnership') }}</template>
          <n-form :model="queryForm" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="queryForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.tableId')"><n-input-number v-model:value="queryForm.tableId" :show-button="false" style="width:100%" :placeholder="t('ownership.tableIdOptional')" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="queryLoading" @click="handleQuery">{{ t('ownership.query') }}</n-button></n-form-item>
          </n-form>
        </n-card>
        <n-card v-if="queryError" :title="t('ownership.queryFailed')" size="small" :bordered="true" style="margin-top: 12px;">
          <n-result status="error" :description="t('ownership.operationFailed')" :title="queryError" />
        </n-card>
        <n-card v-else-if="queryTreeData.length" size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>
            <span>{{ t('ownership.queryResult') }}</span>
            <n-tag size="small" round style="margin-left: 8px;">{{ t('ownership.cellsCount', { count: queryCellCount }) }}</n-tag>
          </template>
          <n-tree
            :data="queryTreeData"
            key-field="key"
            label-field="label"
            :default-expanded-keys="expandedKeys"
            :render-label="renderTreeLabel"
            block-line
            expand-on-click
            :virtual-scroll="false"
          />
        </n-card>

        <!-- Add / Remove / Move combined -->
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>
            <n-dropdown trigger="click" :options="cellOpOptions" @select="handleCellOpSelect">
              <n-button size="small" :type="cellOpType === 'add' ? 'primary' : cellOpType === 'remove' ? 'error' : 'warning'">
                {{ cellOpLabel }}
                <template #icon><n-icon :component="ChevronDownOutline" /></template>
              </n-button>
            </n-dropdown>
          </template>
          <!-- Add -->
          <n-form v-if="cellOpType === 'add'" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="addForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.cells')" required>
              <CellEditor v-model="addForm.cells" />
            </n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="addLoading" @click="handleAdd">{{ t('ownership.add') }}</n-button></n-form-item>
          </n-form>
          <!-- Remove -->
          <n-form v-if="cellOpType === 'remove'" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="removeForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.cells')" required>
              <CellEditor v-model="removeForm.cells" />
            </n-form-item>
            <n-form-item :show-label="false"><n-button type="error" :loading="removeLoading" @click="handleRemove">{{ t('ownership.remove') }}</n-button></n-form-item>
          </n-form>
          <!-- Move -->
          <n-form v-if="cellOpType === 'move'" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.sourceOwner')" required><UserSelect v-model="moveForm.sourceOwnerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.targetOwner')" required><UserSelect v-model="moveForm.targetOwnerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.cells')" required>
              <CellEditor v-model="moveForm.cells" />
            </n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="moveLoading" @click="handleMove">{{ t('ownership.move') }}</n-button></n-form-item>
          </n-form>
        </n-card>

        <!-- Bulk import / export -->
        <n-card size="small" :bordered="true" style="margin-top: 12px;">
          <template #header>
            <n-dropdown trigger="click" :options="bulkOpOptions" @select="handleBulkOpSelect">
              <n-button size="small" :type="bulkOpType === 'import' ? 'primary' : 'info'">
                {{ bulkOpLabel }}
                <template #icon><n-icon :component="ChevronDownOutline" /></template>
              </n-button>
            </n-dropdown>
          </template>
          <!-- Import -->
          <n-form v-if="bulkOpType === 'import'" label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="importForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.cells')" required>
              <n-input v-model:value="importForm.jsonText" type="textarea" :rows="6" :placeholder="t('ownership.importJsonPlaceholder')" />
            </n-form-item>
            <n-form-item :label="t('ownership.overwrite')"><n-switch v-model:value="importForm.overwrite" /></n-form-item>
            <n-form-item :show-label="false"><n-button type="primary" :loading="importLoading" @click="handleImport">{{ t('ownership.importBtn') }}</n-button></n-form-item>
          </n-form>
          <!-- Export -->
          <n-form v-else label-placement="left" label-width="100">
            <n-form-item :label="t('ownership.ownerId')" required><UserSelect v-model="exportForm.ownerId" style="width:100%" /></n-form-item>
            <n-form-item :label="t('ownership.exportFilter')">
              <n-grid :cols="2" :x-gap="12">
                <n-grid-item><n-input-number v-model:value="exportForm.filter.tableIdFrom" :show-button="false" style="width:100%" :placeholder="t('ownership.tableIdFrom')" /></n-grid-item>
                <n-grid-item><n-input-number v-model:value="exportForm.filter.tableIdTo" :show-button="false" style="width:100%" :placeholder="t('ownership.tableIdTo')" /></n-grid-item>
                <n-grid-item><n-input-number v-model:value="exportForm.filter.rowIdFrom" :show-button="false" style="width:100%" :placeholder="t('ownership.rowIdFrom')" /></n-grid-item>
                <n-grid-item><n-input-number v-model:value="exportForm.filter.rowIdTo" :show-button="false" style="width:100%" :placeholder="t('ownership.rowIdTo')" /></n-grid-item>
              </n-grid>
            </n-form-item>
            <n-form-item :show-label="false"><n-button type="info" :loading="exportLoading" @click="handleExport">{{ t('ownership.exportBtn') }}</n-button></n-form-item>
          </n-form>
        </n-card>

        <ResultCard :result="manageResult" :error="manageError" :title="t('ownership.operationResult')" max-width="640px" />
      </n-tab-pane>
    </n-tabs>
  </FormPage>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { NCard, NResult, NTag, NDropdown, NButton, NIcon, NRadioGroup, NRadioButton, NSpace, NPopconfirm, NInput, NSwitch, NGrid, NGridItem, useMessage } from 'naive-ui'
import type { TreeOption } from 'naive-ui'
import { ChevronDownOutline } from '@vicons/ionicons5'
import { generateProof, verifyProof, generateRangeProof, verifyRangeProof, addCells, removeCells, moveCells, queryCells, createTree, deleteTree, importCells, exportCells } from '@/api/ownership'
import type { DataCell, OwnershipExportFilter } from '@/api/ownership'
import ResultCard from '@/components/ResultCard.vue'
import FormPage from '@/components/FormPage.vue'
import UserSelect from '@/components/UserSelect.vue'
import CellEditor from '@/components/CellEditor.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const message = useMessage()
const activeTab = ref('generate')

// Generate: single/range toggle
const isRangeMode = ref(false)

// Verify: single/range toggle
const isRangeVerifyMode = ref(false)

// Manage: operation type dropdown
const cellOpType = ref<'add' | 'remove' | 'move'>('add')
const cellOpOptions = computed(() => [
  { label: t('ownership.addOwnership'), key: 'add' },
  { label: t('ownership.removeOwnership'), key: 'remove' },
  { label: t('ownership.moveOwnership'), key: 'move' },
])
const cellOpLabel = computed(() => {
  if (cellOpType.value === 'add') return t('ownership.addOwnership')
  if (cellOpType.value === 'remove') return t('ownership.removeOwnership')
  return t('ownership.moveOwnership')
})
function handleCellOpSelect(key: string) {
  cellOpType.value = key as 'add' | 'remove' | 'move'
}

const membershipOptions = computed(() => [
  { label: t('ownership.membership'), value: 'membership' },
  { label: t('ownership.nonMembership'), value: 'non-membership' },
])

// Single proof generation
const genForm = ref({ proofType: 'membership' as 'membership' | 'non-membership', ownerId: '', tableId: 0, rowId: 0, columnId: 0 })
const genLoading = ref(false)
const genResult = ref<any>(null)
const genError = ref('')

async function handleGenerate() {
  if (!genForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  genLoading.value = true; genResult.value = null; genError.value = ''
  try {
    genResult.value = await generateProof({ ...genForm.value })
    message.success(t('ownership.proofGenerateSuccess'))
  } catch (e: any) { genError.value = e?.response?.data?.message || String(e) } finally { genLoading.value = false }
}

// Range proof generation
const rangeGenForm = ref({ ownerId: '', tableIdFrom: 0, tableIdTo: 0, rowIdFrom: 0, rowIdTo: 0 })
const rangeGenLoading = ref(false)
const rangeGenResult = ref<any>(null)
const rangeGenError = ref('')

async function handleRangeGenerate() {
  if (!rangeGenForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  rangeGenLoading.value = true; rangeGenResult.value = null; rangeGenError.value = ''
  try {
    rangeGenResult.value = await generateRangeProof({ ...rangeGenForm.value })
    message.success(t('ownership.rangeProofSubmitted'))
  } catch (e: any) { rangeGenError.value = e?.response?.data?.message || String(e) } finally { rangeGenLoading.value = false }
}

// Single proof verification
const verifyForm = ref({ proofType: 'membership', proofJson: '' })
const verifyLoading = ref(false)
const verifyResult = ref<boolean | null>(null)
const verifyError = ref('')

async function handleVerify() {
  let proofObj: Record<string, unknown>
  try { proofObj = JSON.parse(verifyForm.value.proofJson) }
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

// Range proof verification
const rangeVerifyForm = ref({ proofJson: '' })
const rangeVerifyLoading = ref(false)
const rangeVerifyResult = ref<boolean | null>(null)
const rangeVerifyError = ref('')

async function handleRangeVerify() {
  let proofObj: Record<string, unknown>
  try { proofObj = JSON.parse(rangeVerifyForm.value.proofJson) }
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

// Query
const queryForm = ref({ ownerId: '', tableId: null as number | null })
const queryLoading = ref(false)
const queryResult = ref<any>(null)
const queryError = ref('')

// Convert the cells list into tree data: tableId → rowId → columnId
const queryTreeData = computed(() => {
  const items: DataCell[] = (queryResult.value?.cells ?? queryResult.value?.items ?? queryResult.value ?? []) as DataCell[]
  if (!items.length) return []
  const tableMap = new Map<number, Map<number, number[]>>()
  for (const c of items) {
    if (!tableMap.has(c.tableId)) tableMap.set(c.tableId, new Map())
    const rowMap = tableMap.get(c.tableId)!
    if (!rowMap.has(c.rowId)) rowMap.set(c.rowId, [])
    rowMap.get(c.rowId)!.push(c.columnId)
  }
  return Array.from(tableMap.entries()).map(([tableId, rowMap]) => {
    const rows = Array.from(rowMap.entries()).map(([rowId, cols]) => ({
      key: `t-${tableId}-r-${rowId}`,
      label: t('ownership.rowLabel', { id: rowId }),
      count: cols.length,
      level: 1,
      children: cols.map(col => ({
        key: `t-${tableId}-r-${rowId}-c-${col}`,
        label: t('ownership.columnLabel', { id: col }),
        isLeaf: true,
        level: 2,
      })),
    }))
    return {
      key: `t-${tableId}`,
      label: t('ownership.tableLabel', { id: tableId }),
      count: rows.length,
      level: 0,
      children: rows,
    }
  })
})
const queryCellCount = computed(() => {
  const items: DataCell[] = (queryResult.value?.cells ?? queryResult.value?.items ?? queryResult.value ?? []) as DataCell[]
  return items.length
})
const expandedKeys = computed(() => queryTreeData.value.map((t: any) => t.key))

// Custom tree node rendering: label + count tag
function renderTreeLabel({ option }: { option: TreeOption }) {
  const opt = option as any
  const children = h('span', { style: 'margin-left: 6px;' }, opt.label)
  if (opt.count != null) {
    return h('span', { style: 'display: inline-flex; align-items: center;' }, [
      children,
      h('span', {
        style: 'margin-left: 8px; font-size: 11px; opacity: 0.5; background: rgba(127,127,127,0.15); padding: 0 6px; border-radius: 8px;',
      }, `${opt.count}`),
    ])
  }
  return children
}

async function handleQuery() {
  if (!queryForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  queryLoading.value = true; queryResult.value = null; queryError.value = ''
  try {
    queryResult.value = await queryCells(queryForm.value.ownerId, { tableId: queryForm.value.tableId ?? undefined })
  } catch (e: any) { queryError.value = e?.response?.data?.message || String(e) } finally { queryLoading.value = false }
}

// Add / remove / move management
const addForm = ref({ ownerId: '', cells: [] as DataCell[] })
const removeForm = ref({ ownerId: '', cells: [] as DataCell[] })
const moveForm = ref({ sourceOwnerId: '', targetOwnerId: '', cells: [] as DataCell[] })
const addLoading = ref(false)
const removeLoading = ref(false)
const moveLoading = ref(false)
const manageResult = ref<any>(null)
const manageError = ref('')

async function handleAdd() {
  if (!addForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (addForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  addLoading.value = true; manageResult.value = null; manageError.value = ''
  try { manageResult.value = await addCells(addForm.value.ownerId, addForm.value.cells); message.success(t('ownership.submitted')) }
  catch (e: any) { manageError.value = e?.response?.data?.message || String(e) } finally { addLoading.value = false }
}

async function handleRemove() {
  if (!removeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (removeForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  removeLoading.value = true; manageResult.value = null; manageError.value = ''
  try { manageResult.value = await removeCells(removeForm.value.ownerId, removeForm.value.cells); message.success(t('ownership.removed')) }
  catch (e: any) { manageError.value = e?.response?.data?.message || String(e) } finally { removeLoading.value = false }
}

async function handleMove() {
  if (!moveForm.value.sourceOwnerId.trim() || !moveForm.value.targetOwnerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  if (moveForm.value.cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  moveLoading.value = true; manageResult.value = null; manageError.value = ''
  try { manageResult.value = await moveCells(moveForm.value.sourceOwnerId, moveForm.value.targetOwnerId, moveForm.value.cells); message.success(t('ownership.moved')) }
  catch (e: any) { manageError.value = e?.response?.data?.message || String(e) } finally { moveLoading.value = false }
}

// ── Tree management ──
const treeForm = ref({ ownerId: '' })
const createTreeLoading = ref(false)
const deleteTreeLoading = ref(false)
const treeResult = ref<any>(null)
const treeError = ref('')

async function handleCreateTree() {
  if (!treeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  createTreeLoading.value = true; treeResult.value = null; treeError.value = ''
  try {
    treeResult.value = await createTree(treeForm.value.ownerId)
    manageResult.value = treeResult.value
    message.success(t('ownership.treeCreated'))
  } catch (e: any) {
    treeError.value = e?.response?.data?.message || String(e)
    manageError.value = treeError.value
  } finally { createTreeLoading.value = false }
}

async function handleDeleteTree() {
  if (!treeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  deleteTreeLoading.value = true; treeResult.value = null; treeError.value = ''
  try {
    treeResult.value = await deleteTree(treeForm.value.ownerId)
    manageResult.value = treeResult.value
    message.success(t('ownership.treeDeleted'))
  } catch (e: any) {
    treeError.value = e?.response?.data?.message || String(e)
    manageError.value = treeError.value
  } finally { deleteTreeLoading.value = false }
}

// ── Bulk import / export ──
const bulkOpType = ref<'import' | 'export'>('import')
const bulkOpOptions = computed(() => [
  { label: t('ownership.bulkImport'), key: 'import' },
  { label: t('ownership.bulkExport'), key: 'export' },
])
const bulkOpLabel = computed(() => bulkOpType.value === 'import' ? t('ownership.bulkImport') : t('ownership.bulkExport'))
function handleBulkOpSelect(key: string) { bulkOpType.value = key as 'import' | 'export' }

const importForm = ref({ ownerId: '', jsonText: '', overwrite: false })
const importLoading = ref(false)

async function handleImport() {
  if (!importForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  let cells: Array<{ tableId: number; rowId: number; columnId: number }>
  try { cells = JSON.parse(importForm.value.jsonText) }
  catch { message.error(t('ownership.invalidJson')); return }
  if (!Array.isArray(cells) || cells.length === 0) { message.warning(t('ownership.fillAtLeastOneCell')); return }
  importLoading.value = true; manageResult.value = null; manageError.value = ''
  try {
    const res = await importCells(importForm.value.ownerId, cells, importForm.value.overwrite)
    manageResult.value = res
    message.success(t('ownership.importSuccess', { count: (res as any)?.cellsImported ?? cells.length }))
  } catch (e: any) {
    manageError.value = e?.response?.data?.message || String(e)
  } finally { importLoading.value = false }
}

const exportForm = ref({
  ownerId: '',
  filter: { tableIdFrom: null as number | null, tableIdTo: null as number | null, rowIdFrom: null as number | null, rowIdTo: null as number | null },
})
const exportLoading = ref(false)

async function handleExport() {
  if (!exportForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  const filter: OwnershipExportFilter = {}
  if (exportForm.value.filter.tableIdFrom != null) filter.tableIdFrom = exportForm.value.filter.tableIdFrom
  if (exportForm.value.filter.tableIdTo != null) filter.tableIdTo = exportForm.value.filter.tableIdTo
  if (exportForm.value.filter.rowIdFrom != null) filter.rowIdFrom = exportForm.value.filter.rowIdFrom
  if (exportForm.value.filter.rowIdTo != null) filter.rowIdTo = exportForm.value.filter.rowIdTo
  exportLoading.value = true; manageResult.value = null; manageError.value = ''
  try {
    const res = await exportCells(exportForm.value.ownerId, Object.keys(filter).length ? filter : undefined)
    manageResult.value = res
    const count = (res as any)?.cells?.length ?? 0
    message.success(t('ownership.exportSuccess', { count }))
  } catch (e: any) {
    manageError.value = e?.response?.data?.message || String(e)
  } finally { exportLoading.value = false }
}
</script>

<style scoped>
</style>
