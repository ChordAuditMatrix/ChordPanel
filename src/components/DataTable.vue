<template>
  <n-data-table
    :columns="columns"
    :data="data"
    :loading="loading"
    :pagination="pagination"
    :row-props="rowProps"
    :scroll-x="scrollX"
    size="small"
    :bordered="false"
    style="margin-top: 12px;"
  />
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  columns: any[]
  data: any[]
  loading?: boolean
  pageSize?: number
  rowProps?: (row: any) => Record<string, any>
}>(), { loading: false, pageSize: 20, rowProps: () => ({}) })

// Compute the minimum total width of all columns as the scroll-x threshold; when it exceeds the container width, a horizontal scrollbar appears instead of truncation
const scrollX = computed(() => {
  return props.columns.reduce((sum: number, c: any) => {
    const w = typeof c.width === 'number' ? c.width : (typeof c.minWidth === 'number' ? c.minWidth : 100)
    return sum + w
  }, 0)
})

const pagination = reactive({
  page: 1,
  pageSize: props.pageSize,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  pageSlot: 7,
  showQuickJumpDropdown: true,
  prefix: ({ itemCount }: { itemCount: number }) => t('common.totalItems', { n: itemCount }),
  onUpdatePage: (p: number) => { pagination.page = p },
  onUpdatePageSize: (ps: number) => { pagination.pageSize = ps; pagination.page = 1 },
})
</script>
