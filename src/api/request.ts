import axios from 'axios'
import { useSettings } from '@/stores/settings'
import { useErrorModal } from '@/components/error/useError'
import { t } from '@/stores/i18n'

const { backendOnline, settings } = useSettings()
const { showError } = useErrorModal()

// Dynamic baseURL:
// - In dev (import.meta.env.DEV) requests go through the vite proxy '/api'
// - In production builds, use settings.backendUrl (can be switched at runtime via Settings)
// - When the user changes backendUrl, subsequent requests point to the new address
const api = axios.create({
  baseURL: '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Compute baseURL per request based on current settings
api.interceptors.request.use((config) => {
  const backendUrl = settings.value.backendUrl
  if (import.meta.env.DEV) {
    config.baseURL = '/api'
  } else if (backendUrl) {
    config.baseURL = backendUrl.replace(/\/$/, '')
  } else {
    config.baseURL = '/api'
  }
  return config
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error.response?.data?.message || error.message || t('common.requestFailed')
    console.error('[API Error]', msg)

    // Silent requests (e.g. health checks) do not pop an error modal to avoid false alerts
    const silent = (error.config as any)?._silent === true
    if (!silent) {
      // Detect backend unreachable: vite proxy returns 502 + "Backend unreachable", or axios network error
      const status = error.response?.status
      const errData = error.response?.data
      const isBackendUnreachable =
        status === 502 && errData?.error === 'Backend unreachable'
        || error.code === 'ERR_NETWORK'

      if (isBackendUnreachable) {
        // Backend offline: do not pop error modal, just mark offline so AppLayout shows the overlay
        // Health check will maintain backendOnline state
        backendOnline.value = false
      } else {
        // Real HTTP error (4xx/5xx): build error info and show modal
        showError({
          status: status || 0,
          statusText: error.response?.statusText || (error.code === 'ERR_NETWORK' ? 'Network Error' : 'Error'),
          error: errData?.error,
          message: errData?.message || errData?.error || error.message || t('common.requestFailed'),
          detail: errData?.detail || (typeof errData === 'string' ? errData : ''),
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
        })
      }
    }

    return Promise.reject(error)
  }
)

export default api
