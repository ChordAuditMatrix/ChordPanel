import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const root = process.cwd()
const requestMockId = '\0system-status-test-request'

const requestMock = {
  name: 'system-status-test-request-mock',
  enforce: 'pre',
  resolveId(id) {
    if (id === './request') return requestMockId
  },
  load(id) {
    if (id === requestMockId) {
      return 'const api = { get: () => Promise.resolve(null) }; export default api'
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

const { parseSystemStatusResponse } = await vite.ssrLoadModule('/src/api/system.ts')

test('keeps configured Admin identity separate from registered node counts', () => {
  const status = parseSystemStatusResponse({
    admin: { adminId: 'admin-primary', cpuUsage: 12.5 },
    cluster: { totalNodes: 2, nodesByRole: { Audit: 1, Storage: 1 } },
    tasks: { activeTaskCount: 0 },
    uptime: 'PT45S',
    timestampMs: 1_798_505_818_000,
  })

  assert.equal(status.admin.adminId, 'admin-primary')
  assert.equal(status.cluster.totalNodes, 2)
  assert.deepEqual(status.cluster.nodesByRole, { Audit: 1, Storage: 1 })
})

test('does not invent an Admin identity when older status responses omit it', () => {
  const status = parseSystemStatusResponse({
    admin: { cpuUsage: 0 },
    cluster: { totalNodes: 0, nodesByRole: {} },
    tasks: {},
  })

  assert.equal(status.admin.adminId, undefined)
  assert.equal(status.cluster.totalNodes, 0)
  assert.deepEqual(status.cluster.nodesByRole, {})
})

test('rejects a non-object system status response', () => {
  assert.throws(() => parseSystemStatusResponse(null), /Invalid system status response/)
  assert.throws(() => parseSystemStatusResponse([]), /Invalid system status response/)
})
