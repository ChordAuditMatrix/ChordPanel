import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
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
const settingsId = '\0audit-maintenance-settings'
const i18nId = '\0audit-maintenance-i18n'

const dependencyStub = {
  name: 'audit-maintenance-dependencies',
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
const audit = await vite.ssrLoadModule('/src/api/audit.ts')

function responseFor(config, status, data) {
  return {
    data,
    status,
    statusText: status === 202 ? 'Accepted' : 'OK',
    headers: {},
    config,
    request: {},
  }
}

test('GC pass disables the 10 s client timeout and keeps the real HTTP status', async () => {
  let captured
  api.defaults.adapter = async config => {
    captured = config
    return responseFor(config, 200, {
      versionsExamined: 3,
      versionsRetired: 1,
      moreWorkPending: true,
      nextLifecycleCursor: 'cursor-2',
      reports: [],
    })
  }

  const result = await audit.runMaterialGcPass('cursor-1', '7')
  assert.equal(result.httpStatus, 200)
  assert.equal(result.data.nextLifecycleCursor, 'cursor-2')
  assert.equal(captured.timeout, 0)
  assert.equal(captured._silent, true)
  assert.equal(captured._includeStatus, true)
  const body = JSON.parse(captured.data)
  assert.deepEqual(body.request, { initiatorId: '7' })
  assert.deepEqual(body.params, { afterVersionId: 'cursor-1' })
})

test('maintenance keeps the explicit owner-bound algorithm route and 202 answer', async () => {
  let captured
  api.defaults.adapter = async config => {
    captured = config
    return responseFor(config, 202, {
      jobId: 'job-1',
      algorithmId: 'algorithm-1',
      fileId: 'owner-1',
      maintenanceOp: 'Update',
      status: 'Pending',
      message: 'Maintenance task dispatched',
    })
  }

  const result = await audit.maintainAudit({
    dataOwnerId: ' owner-1 ',
    algorithmId: 'algorithm-1',
    maintenanceOp: 'Update',
    blockRanges: 'ranges-v1:1+2',
  }, '7')
  assert.equal(result.httpStatus, 202)
  assert.equal(captured.url, '/v1/audit/algorithms/algorithm-1/maintenance')
  assert.equal(captured._includeStatus, true)
  const body = JSON.parse(captured.data)
  assert.deepEqual(body.request, { initiatorId: '7', dataOwnerId: 'owner-1' })
  assert.deepEqual(body.params, { maintenanceOp: 'Update', blockRanges: 'ranges-v1:1+2' })
})

test('automatic maintenance omits the algorithm ID from the route', async () => {
  let captured
  api.defaults.adapter = async config => {
    captured = config
    return responseFor(config, 202, {
      jobId: 'job-2',
      algorithmId: 'selected-by-backend',
      fileId: 'owner-1',
      maintenanceOp: 'Insert',
      status: 'Pending',
      message: 'Maintenance task dispatched',
    })
  }

  const result = await audit.maintainAudit({
    dataOwnerId: 'owner-1',
    maintenanceOp: 'Insert',
    blockIndices: [1, 2],
  }, '7')
  assert.equal(result.httpStatus, 202)
  assert.equal(captured.url, '/v1/audit/maintenance')
  const body = JSON.parse(captured.data)
  assert.deepEqual(body.params, { maintenanceOp: 'Insert', blockIndices: [1, 2] })
})

test('re-arm reports the actual 200 replay status', async () => {
  let captured
  api.defaults.adapter = async config => {
    captured = config
    return responseFor(config, 200, {
      outcome: 'AlreadyActive',
      jobId: 'successor-1',
      anchorJobId: 'anchor-1',
      detail: '',
    })
  }

  const result = await audit.rearmMaterialGcVersion('owner-1', 'algorithm-1', 'version-1', '7')
  assert.equal(result.httpStatus, 200)
  assert.equal(result.data.outcome, 'AlreadyActive')
  assert.equal(captured.url, '/v1/audit/material-gc/rearm')
  const body = JSON.parse(captured.data)
  assert.deepEqual(body.params, {
    ownerId: 'owner-1',
    algorithmId: 'algorithm-1',
    versionId: 'version-1',
  })
})

test('the status wrapper is opt-in and leaves ordinary calls unchanged', async () => {
  api.defaults.adapter = async config => responseFor(config, 200, { ok: true })
  const plain = await api.get('/v1/plain')
  assert.deepEqual(plain, { ok: true })
})
