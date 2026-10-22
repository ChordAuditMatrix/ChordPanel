import axios, { type AxiosRequestConfig } from 'axios'
import { useSettings, resolveApiBaseUrl } from '@/stores/settings'
import { useErrorModal } from '@/components/error/useError'
import { t } from '@/stores/i18n'

const { backendOnline, settings } = useSettings()
const { showError } = useErrorModal()

// Dynamic baseURL:
// - In dev (import.meta.env.DEV) requests go through the vite proxy '/api'
//   (proxy target: VITE_DEV_PROXY_TARGET, see vite.config.ts)
// - In production builds, prepend settings.backendUrl; an empty backendUrl
//   means same-origin '/api'
// - When the user changes backendUrl, subsequent requests point to the new address
const api = axios.create({
  baseURL: '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Compute baseURL per request based on current settings
// - dev: vite proxy handles '/api' → backend
// - prod: prepend '/api' to the user-configured backendUrl so requests
//   resolve to <backendUrl>/api/v1/... (matches the dev proxy path);
//   empty backendUrl keeps requests same-origin
api.interceptors.request.use((config) => {
  config.baseURL = resolveApiBaseUrl(settings.value.backendUrl, import.meta.env.DEV)
  return config
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error.response?.data?.message || error.message || t('common.requestFailed')
    const cancellation = axios.isCancel(error) || error?.code === 'ERR_CANCELED'
    if (!cancellation) console.error('[API Error]', msg)

    // Expected cancellation is neither a backend failure nor a user-facing error.
    const config = error.config as (AxiosRequestConfig & { _silent?: boolean }) | undefined
    const silent = config?._silent === true
    if (!silent && !cancellation) {
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
