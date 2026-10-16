<template>
  <div>
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
        <n-form-item :label="t('ownership.tableId')"><TableSelect v-model="queryForm.tableId" :active-only="false" style="width:100%" :placeholder="t('ownership.tableIdOptional')" /></n-form-item>
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
      <n-tree :data="queryTreeData" key-field="key" label-field="label" :default-expanded-keys="expandedKeys" :render-label="renderTreeLabel" block-line expand-on-click :virtual-scroll="false" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { NCard, NResult, NTag, NSpace, NPopconfirm, useMessage } from 'naive-ui'
import type { TreeOption } from 'naive-ui'
import { queryCells, createTree, deleteTree } from '@/api/ownership'
import type { DataCell } from '@/api/ownership'
import UserSelect from '@/components/UserSelect.vue'
import TableSelect from '@/components/TableSelect.vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()
const message = useMessage()
const emit = defineEmits<{ (event: 'operation', result: any, error: string): void }>()
const queryForm = ref({ ownerId: '', tableId: '' })
const queryLoading = ref(false)
const queryResult = ref<any>(null)
const queryError = ref('')
const queryTreeData = computed(() => {
  const items: DataCell[] = (queryResult.value?.cells ?? queryResult.value?.items ?? queryResult.value ?? []) as DataCell[]
  if (!items.length) return []
  const tableMap = new Map<string, Map<number, number[]>>()
  for (const cell of items) {
    const tableId = String(cell.tableId)
    if (!tableMap.has(tableId)) tableMap.set(tableId, new Map())
    const rowMap = tableMap.get(tableId)!
    if (!rowMap.has(cell.rowId)) rowMap.set(cell.rowId, [])
    rowMap.get(cell.rowId)!.push(cell.columnId)
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
    return { key: `t-${tableId}`, label: t('ownership.tableLabel', { id: tableId }), count: rows.length, level: 0, children: rows }
  })
})
const queryCellCount = computed(() => {
  const items: DataCell[] = (queryResult.value?.cells ?? queryResult.value?.items ?? queryResult.value ?? []) as DataCell[]
  return items.length
})
const expandedKeys = computed(() => queryTreeData.value.map((tree: any) => tree.key))
function renderTreeLabel({ option }: { option: TreeOption }) {
  const opt = option as any
  const children = h('span', { style: 'margin-left: 6px;' }, opt.label)
  if (opt.count != null) return h('span', { style: 'display: inline-flex; align-items: center;' }, [children, h('span', { style: 'margin-left: 8px; font-size: 11px; opacity: 0.5; background: rgba(127,127,127,0.15); padding: 0 6px; border-radius: 8px;' }, `${opt.count}`)])
  return children
}
async function handleQuery() {
  if (!queryForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  queryLoading.value = true; queryResult.value = null; queryError.value = ''
  try { queryResult.value = await queryCells(queryForm.value.ownerId, { tableId: queryForm.value.tableId || undefined }) }
  catch (e: any) { queryError.value = e?.response?.data?.message || String(e) } finally { queryLoading.value = false }
}
const treeForm = ref({ ownerId: '' })
const createTreeLoading = ref(false)
const deleteTreeLoading = ref(false)
async function handleCreateTree() {
  if (!treeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  createTreeLoading.value = true
  try {
    const result = await createTree(treeForm.value.ownerId)
    emit('operation', result, '')
    message.success(t('ownership.treeCreated'))
  } catch (e: any) {
    const error = e?.response?.data?.message || String(e)
    emit('operation', null, error)
  } finally { createTreeLoading.value = false }
}
async function handleDeleteTree() {
  if (!treeForm.value.ownerId.trim()) { message.warning(t('ownership.fillOwnerId')); return }
  deleteTreeLoading.value = true
  try {
    const result = await deleteTree(treeForm.value.ownerId)
    emit('operation', result, '')
    message.success(t('ownership.treeDeleted'))
  } catch (e: any) {
    const error = e?.response?.data?.message || String(e)
    emit('operation', null, error)
  } finally { deleteTreeLoading.value = false }
}
</script>
