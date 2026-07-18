import { reactive } from 'vue'
import { t } from '@/stores/i18n'

/**
 * Create a pagination config using Naive UI's built-in quick-jump features.
 * When page count exceeds pageSlot, an ellipsis is shown; clicking it jumps 5 pages.
 * showQuickJumpDropdown allows jumping to any page via a dropdown.
 */
export function usePagination(_getDataLength?: () => number) {
  const pagination = reactive({
    page: 1,
    pageSize: 20,
    showSizePicker: true,
    pageSizes: [10, 20, 50],
    pageSlot: 7,
    showQuickJumpDropdown: true,
    prefix: ({ itemCount }: { itemCount: number }) => t('common.totalItems', { n: itemCount }),
    onUpdatePage: (p: number) => { pagination.page = p },
    onUpdatePageSize: (ps: number) => { pagination.pageSize = ps; pagination.page = 1 },
  })
  return pagination
}
