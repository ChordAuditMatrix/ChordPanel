<template>
  <div class="cell-editor">
    <div class="cell-add-row">
      <n-input-number v-model:value="newCell.tableId" :placeholder="t('common.tableId')" :show-button="false" size="small" style="width: 90px;" />
      <n-input-number v-model:value="newCell.rowId" :placeholder="t('common.rowId')" :show-button="false" size="small" style="width: 90px;" />
      <n-input-number v-model:value="newCell.columnId" :placeholder="t('common.columnId')" :show-button="false" size="small" style="width: 90px;" />
      <n-button size="small" type="primary" quaternary @click="addCell">{{ t('cellEditor.addCell') }}</n-button>
    </div>
    <n-data-table v-if="cells.length" :columns="columns" :data="tableData" size="small" :bordered="false" :pagination="false" style="margin-top: 8px;" />
    <div v-else class="cell-empty-wrap">
      <n-empty :description="t('cellEditor.empty')" size="small" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { NButton } from 'naive-ui'
import type { DataCell } from '@/api/ownership'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = defineProps<{ modelValue: DataCell[] }>()
const emit = defineEmits<{ 'update:modelValue': [DataCell[]] }>()

const cells = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const newCell = ref({ tableId: 0, rowId: 0, columnId: 0 })

function addCell() {
  const c = { ...newCell.value }
  const exists = cells.value.some(x => x.tableId === c.tableId && x.rowId === c.rowId && x.columnId === c.columnId)
  if (exists) return
  cells.value = [...cells.value, c]
  newCell.value = { tableId: 0, rowId: 0, columnId: 0 }
}

function removeCell(index: number) {
  const arr = [...cells.value]
  arr.splice(index, 1)
  cells.value = arr
}

const columns = computed(() => [
  { title: '#', key: 'index', width: 50, render: (_: any, i: number) => i + 1 },
  { title: t('common.tableId'), key: 'tableId', width: 100 },
  { title: t('common.rowId'), key: 'rowId', width: 100 },
  { title: t('common.columnId'), key: 'columnId', width: 100 },
  {
    title: '', key: 'actions', width: 60,
    render: (_: any, i: number) => h(NButton, { size: 'tiny', quaternary: true, type: 'error', onClick: () => removeCell(i) }, () => t('cellEditor.delete')),
  },
])

const tableData = computed(() => cells.value.map((c, i) => ({ ...c, index: i })))
</script>

<style scoped>
.cell-editor {
  width: 100%;
}
.cell-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.cell-empty-wrap {
  margin-top: 8px;
  /* Offset form-item label width so the empty state is centered across the full row (including label) */
  margin-left: -100px;
  width: calc(100% + 100px);
  display: flex;
  justify-content: center;
}
.cell-empty-wrap :deep(.n-empty__icon) {
  font-size: 28px;
}
</style>
