import { ref, reactive } from 'vue'
import { t } from '@/stores/i18n'

export interface ApiError {
  status: number
  statusText: string
  error?: string
  message: string
  detail?: string
  url?: string
  method?: string
  timestamp?: string
}

const show = ref(false)
const currentError = reactive<ApiError>({
  status: 0,
  statusText: '',
  message: '',
})

function showError(err: ApiError) {
  Object.assign(currentError, {
    status: err.status || 0,
    statusText: err.statusText || '',
    error: err.error || '',
    message: err.message || t('common.unknownError'),
    detail: err.detail || '',
    url: err.url || '',
    method: err.method || '',
    timestamp: err.timestamp || new Date().toISOString(),
  })
  show.value = true
}

function hideError() {
  show.value = false
}

export function useErrorModal() {
  return { show, currentError, showError, hideError }
}
