<template>
  <div class="server-paged-table">
    <n-data-table
      :columns="columns"
      :data="data"
      :loading="loading"
      :pagination="false"
      :remote="remote"
      :row-props="rowProps"
      :scroll-x="resolvedScrollX"
      size="small"
      :bordered="false"
      @update:sorter="emit('update:sorter', $event)"
    />
    <div class="pagination">
      <span>{{ t('common.totalItems', { n: total }) }}</span>
      <n-pagination
        :page="page"
        :page-size="pageSize"
        :item-count="total"
        :page-sizes="pageSizes"
        show-size-picker
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends object">
import { computed, watch, type HTMLAttributes } from 'vue'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import { useI18n } from '@/stores/i18n'

const props = withDefaults(defineProps<{
  columns: DataTableColumns<T>
  data: T[]
  loading?: boolean
  page: number
  pageSize: number
  pageSizes?: number[]
  total: number
  rowProps?: (row: T) => HTMLAttributes
  scrollX?: number
  remote?: boolean
}>(), {
  loading: false,
  remote: false,
  pageSizes: () => [10, 20, 50],
  rowProps: () => ({}),
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
  'update:sorter': [sorter: DataTableSortState | null]
}>()

const { t } = useI18n()
const resolvedScrollX = computed(() => props.scrollX ?? props.columns.reduce((sum, column) => {
  const width = 'width' in column && typeof column.width === 'number'
    ? column.width
    : 'minWidth' in column && typeof column.minWidth === 'number'
      ? column.minWidth
      : 100
  return sum + width
}, 0))
watch(() => [props.total, props.page, props.pageSize, props.loading] as const, ([total, page, pageSize, loading]) => {
  if (loading) return
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  if (page > lastPage) emit('update:page', lastPage)
})
</script>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
@media (max-width: 639px) {
  .pagination { justify-content: center; }
}
.server-paged-table :deep(.n-pagination) {
  max-width: 100%;
}
</style>
