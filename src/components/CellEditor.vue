<template>
  <div class="cell-editor">
    <div class="cell-add-row">
      <TableSelect v-model="newCell.tableId" :placeholder="t('common.tableId')" size="small" style="width: 180px;" />
      <n-input v-model:value="newCell.rowId" :placeholder="t('common.rowId')" size="small" style="width: 120px;" />
      <n-input-number v-model:value="newCell.columnId" :placeholder="t('common.columnId')" :show-button="false" size="small" style="width: 90px;" />
      <n-button size="small" type="primary" quaternary @click="addCell">{{ t('cellEditor.addCell') }}</n-button>
    </div>
    <div v-if="cells.length" class="cell-table-scroll">
      <n-data-table :columns="columns" :data="tableData" size="small" :bordered="false" :pagination="false" style="margin-top: 8px;" />
    </div>
    <div v-else class="cell-empty-wrap">
      <n-empty :description="t('cellEditor.empty')" size="small" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { NButton } from 'naive-ui'
import TableSelect from '@/components/TableSelect.vue'
import type { DataCell } from '@/api/ownership'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = defineProps<{ modelValue: DataCell[] }>()
const emit = defineEmits<{ 'update:modelValue': [DataCell[]] }>()

const cells = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const newCell = ref<{ tableId: string; rowId: string | null; columnId: number }>({ tableId: '', rowId: null, columnId: 0 })

function addCell() {
  const { tableId, rowId, columnId } = newCell.value
  if (!tableId || rowId === null) return
  const cell: DataCell = { tableId, rowId, columnId }
  const exists = cells.value.some(x => String(x.tableId) === tableId && x.rowId === rowId && x.columnId === columnId)
  if (exists) return
  cells.value = [...cells.value, cell]
  newCell.value = { tableId: '', rowId: null, columnId: 0 }
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
.cell-table-scroll {
  max-height: min(42vh, 400px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
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
