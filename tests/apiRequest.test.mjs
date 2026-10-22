import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import axios from 'axios'
import { createServer } from 'vite'
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    get length() { return 0 },
  },
})

const root = process.cwd()
const settingsId = '\0api-request-settings'
const i18nId = '\0api-request-i18n'

const dependencyStub = {
  name: 'api-request-dependencies',
  enforce: 'pre',
  resolveId(id) {
    if (id === '@/stores/settings') return settingsId
    if (id === '@/stores/i18n') return i18nId
  },
  load(id) {
    if (id === settingsId) {
      return 'export const backendOnline={value:true}; export const settings={value:{backendUrl:""}}; export function resolveApiBaseUrl(){return "/api"}'
    }
    if (id === i18nId) return 'export function t(key){return key}'
  },
}

const vite = await createServer({
  configFile: false,
  root,
  plugins: [dependencyStub],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const { default: api } = await vite.ssrLoadModule('/src/api/request.ts')
const { useErrorModal } = await vite.ssrLoadModule('/src/components/error/useError.ts')
const { show: errorShown, currentError } = useErrorModal()

test('Axios cancellation remains a rejection without global error logging or modal', async () => {
  const logs = []
  const originalError = console.error
  console.error = (...args) => logs.push(args)
  try {
    let cancellation
    await assert.rejects(api.get('/cancelled', {
      adapter: config => {
        cancellation = new axios.CanceledError('cancelled', config)
        return Promise.reject(cancellation)
      },
    }), error => error === cancellation)

    assert.equal(errorShown.value, false)
    assert.equal(logs.length, 0)
  } finally {
    console.error = originalError
  }
})

test('HTTP failures still reach the global error modal path', async () => {
  const logs = []
  const originalError = console.error
  console.error = (...args) => logs.push(args)
  try {
    errorShown.value = false
    let failure
    await assert.rejects(api.get('/failure', {
      adapter: config => {
        failure = new Error('service unavailable')
        failure.config = config
        failure.response = {
          status: 503,
          statusText: 'Service Unavailable',
          data: { error: 'Unavailable', message: 'service unavailable' },
          config,
        }
        return Promise.reject(failure)
      },
    }), error => error === failure)

    assert.equal(errorShown.value, true)
    assert.equal(currentError.status, 503)
    assert.equal(currentError.message, 'service unavailable')
    assert.equal(logs.length, 1)
  } finally {
    console.error = originalError
  }
})
