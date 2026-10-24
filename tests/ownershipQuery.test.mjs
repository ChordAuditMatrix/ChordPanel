import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const root = process.cwd()
const mockRequestId = '\0ownership-query-test-request'
const requestMock = {
  name: 'ownership-query-test-request-mock',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:ownership-query-test-request') return mockRequestId
    if (id === './request') return mockRequestId
  },
  load(id) {
    if (id !== mockRequestId) return
    return `
export const calls = []
const api = {
  get(url, config) {
    calls.push({ method: 'get', url, config })
    return Promise.resolve({
      ownerId: 'owner-1',
      cells: [{ tableId: '5', rowId: '0010', columnId: 3 }],
      total: 1,
      page: config.params.page,
      pageSize: config.params.pageSize,
      totalPages: 1,
      tableIds: ['5'],
      tableSummaries: [{ tableId: '5', rowCount: 1, cellCount: 1 }],
    })
  },
}
export default api
`
  },
}

const vite = await createServer({
  configFile: false,
  root,
  plugins: [requestMock],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const requestApi = await vite.ssrLoadModule('virtual:ownership-query-test-request')
const ownershipApi = await vite.ssrLoadModule('/src/api/ownership.ts')

test('queryCells accepts the documented response without a jobId', async () => {
  requestApi.calls.length = 0

  const response = await ownershipApi.queryCells('owner-1', { page: 1, pageSize: 20 })

  assert.deepEqual(response, {
    ownerId: 'owner-1',
    cells: [{ tableId: '5', rowId: '0010', columnId: 3 }],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    tableIds: ['5'],
    tableSummaries: [{ tableId: '5', rowCount: 1, cellCount: 1 }],
  })
  assert.equal(requestApi.calls.length, 1)
  assert.equal(requestApi.calls[0].url, '/v1/ownership/cells/query')
  assert.deepEqual(requestApi.calls[0].config.params, { ownerId: 'owner-1', page: 1, pageSize: 20 })
})

test('queryCells can drop the client timeout and forward an abort signal', async () => {
  requestApi.calls.length = 0
  const controller = new AbortController()

  await ownershipApi.queryCells('owner-1', { page: 1, pageSize: 20 }, {
    signal: controller.signal,
    timeoutMs: 0,
  })

  const config = requestApi.calls[0].config
  assert.equal(config.timeout, 0)
  assert.equal(config.signal, controller.signal)
})

test('queryCells preserves string row ids while requesting a remote table page', async () => {
  requestApi.calls.length = 0

  const response = await ownershipApi.queryCells('owner-1', {
    page: 2,
    pageSize: 10,
    tableId: '5',
    rowId: '0010',
  })

  assert.equal(response.cells[0].rowId, '0010')
  assert.equal(response.page, 2)
  assert.equal(response.pageSize, 10)
  assert.deepEqual(requestApi.calls[0].config.params, {
    ownerId: 'owner-1',
    page: 2,
    pageSize: 10,
    tableId: '5',
    rowId: '0010',
  })
})
