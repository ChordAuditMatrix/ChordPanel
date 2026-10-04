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
import { ref, computed } from 'vue'
import { useI18n } from '@/stores/i18n'
import { useWindowSize } from '@/composables/useWindowSize'

const { t } = useI18n()
const { winW } = useWindowSize()

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

// Narrow viewports keep only a compact page window and drop the quick-jump dropdown,
// so the pagination row never clips inside a small card.
const isNarrow = computed(() => winW.value < 640)

const page = ref(1)
const pageSize = ref(props.pageSize)

const pagination = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  pageSlot: isNarrow.value ? 3 : 7,
  showQuickJumpDropdown: !isNarrow.value,
  prefix: ({ itemCount }: { itemCount: number }) => t('common.totalItems', { n: itemCount }),
  onUpdatePage: (p: number) => { page.value = p },
  onUpdatePageSize: (ps: number) => { pageSize.value = ps; page.value = 1 },
}))
</script>

<style scoped>
/* Let the pagination row wrap instead of clipping when the container is narrow */
.n-data-table :deep(.n-data-table__pagination) {
  flex-wrap: wrap;
  row-gap: 6px;
}
</style>
