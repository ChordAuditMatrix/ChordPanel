import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const root = process.cwd()
const mockRequestId = '\0audit-layout-test-request'

const requestMock = {
  name: 'audit-layout-test-request-mock',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:audit-layout-test-request') return mockRequestId
    // The only local module in this test's graph that imports its HTTP layer
    // as './request' is src/api/audit.ts, so matching the specifier is exact.
    if (id === './request') return mockRequestId
  },
  load(id) {
    if (id === mockRequestId) {
      return `
export const calls = []
const api = {
  post(url, data) {
    calls.push({ method: 'post', url, data })
    return Promise.resolve({ jobId: 'job-layout-1', statusUrl: '/api/v1/jobs/job-layout-1' })
  },
}
export default api
`
    }
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

const requestApi = await vite.ssrLoadModule('virtual:audit-layout-test-request')
const auditApi = await vite.ssrLoadModule('/src/api/audit.ts')
const { parseLayoutJobMetadata } = await vite.ssrLoadModule('/src/utils/auditLayout.ts')

test('createLayoutJob posts to the layout-jobs route without a request body', async () => {
  requestApi.calls.length = 0
  const accepted = await auditApi.createLayoutJob('owner/1')

  assert.equal(requestApi.calls.length, 1)
  assert.equal(requestApi.calls[0].method, 'post')
  assert.equal(requestApi.calls[0].url, '/v1/audit-data/owner%2F1/layout-jobs')
  assert.equal(requestApi.calls[0].data, undefined)
  assert.deepEqual(accepted, { jobId: 'job-layout-1', statusUrl: '/api/v1/jobs/job-layout-1' })
})

test('the replaced synchronous blocks route is no longer exported', () => {
  assert.equal(auditApi.getBlockLayout, undefined)
})

test('parses the string-encoded layout metadata of a succeeded Job', () => {
  assert.deepEqual(
    parseLayoutJobMetadata({ layoutPhase: 'completed', totalBlocks: '12', totalCells: '1024', blockSize: '1024' }),
    { totalBlocks: 12, totalCells: 1024, blockSize: 1024 },
  )
})

test('accepts a ready zero-block layout of an empty owner', () => {
  assert.deepEqual(
    parseLayoutJobMetadata({ layoutPhase: 'completed', totalBlocks: '0', totalCells: '0', blockSize: '1024' }),
    { totalBlocks: 0, totalCells: 0, blockSize: 1024 },
  )
})

test('returns null when totalBlocks is missing or not numeric', () => {
  assert.equal(parseLayoutJobMetadata({ layoutPhase: 'completed', totalCells: '10' }), null)
  assert.equal(parseLayoutJobMetadata({ totalBlocks: 'unknown' }), null)
  assert.equal(parseLayoutJobMetadata(undefined), null)
  assert.equal(parseLayoutJobMetadata(null), null)
})

test('keeps totalCells and blockSize optional, tolerating numeric values and blanks', () => {
  assert.deepEqual(parseLayoutJobMetadata({ totalBlocks: '3' }), { totalBlocks: 3, totalCells: null, blockSize: null })
  assert.deepEqual(
    parseLayoutJobMetadata({ totalBlocks: 5, totalCells: '', blockSize: '  ', cellsProcessed: '5' }),
    { totalBlocks: 5, totalCells: null, blockSize: null },
  )
})
