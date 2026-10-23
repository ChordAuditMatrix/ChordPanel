import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const { createNodeDetailLoader, isNodeDetailFresh } = await vite.ssrLoadModule('/src/components/node/nodeDetailCache.ts')

function deferred() {
  let resolvePromise
  let rejectPromise
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

test('freshness follows the TTL and rejects never-loaded entries', () => {
  assert.equal(isNodeDetailFresh(0, 1000, 30000), false)
  assert.equal(isNodeDetailFresh(1000, 1000, 30000), true)
  assert.equal(isNodeDetailFresh(1000, 31000, 30000), false)
  assert.equal(isNodeDetailFresh(2000, 1000, 30000), false)
})

test('details load once, reuse the cached entry and refresh only when forced', async () => {
  let calls = 0
  const loader = createNodeDetailLoader(async nodeId => {
    calls += 1
    return { nodeId, role: 'Admin' }
  })

  const first = await loader.load('node-1')
  assert.equal(calls, 1)
  assert.equal(first.status, 'ready')
  assert.equal(first.detail.nodeId, 'node-1')

  const cached = await loader.load('node-1')
  assert.equal(calls, 1)
  assert.equal(cached.detail.role, 'Admin')

  const refreshed = await loader.load('node-1', { force: true })
  assert.equal(calls, 2)
  assert.equal(refreshed.status, 'ready')
})

test('concurrent loads share one in-flight request', async () => {
  const pending = deferred()
  let calls = 0
  const loader = createNodeDetailLoader(async nodeId => {
    calls += 1
    return pending.promise
  })

  const first = loader.load('node-2')
  const second = loader.load('node-2')
  assert.equal(loader.entries['node-2'].status, 'loading')

  pending.resolve({ nodeId: 'node-2' })
  await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(loader.entries['node-2'].status, 'ready')
})

test('cancelling drops the late response and keeps the previous detail', async () => {
  const refresh = deferred()
  let calls = 0
  const loader = createNodeDetailLoader(async nodeId => {
    calls += 1
    if (calls === 1) return { nodeId, role: 'Audit' }
    return refresh.promise
  })

  await loader.load('node-3')
  const refreshCall = loader.load('node-3', { force: true })
  loader.cancel('node-3')
  refresh.resolve({ nodeId: 'node-3', role: 'Storage' })
  await refreshCall

  assert.equal(calls, 2)
  assert.equal(loader.entries['node-3'].status, 'ready')
  assert.equal(loader.entries['node-3'].detail.role, 'Audit')
})

test('errors keep the last good detail and never overwrite it with a partial response', async () => {
  let call = 0
  const loader = createNodeDetailLoader(async nodeId => {
    call += 1
    if (call === 1) return { nodeId, role: 'Admin' }
    throw new Error('refresh failed')
  })

  await loader.load('node-5')
  const loadedAt = loader.entries['node-5'].loadedAt
  const failed = await loader.load('node-5', { force: true })

  assert.equal(failed.status, 'error')
  assert.equal(failed.detail.role, 'Admin')
  assert.equal(failed.loadedAt, loadedAt)
})

test('a response without a nodeId is rejected as an error', async () => {
  const loader = createNodeDetailLoader(async () => ({ role: 'Admin' }))
  const entry = await loader.load('node-6')

  assert.equal(entry.status, 'error')
  assert.equal(entry.detail, null)
  assert.ok(entry.error instanceof TypeError)
})

test('prune removes stale entries but keeps loading entries', async () => {
  const pending = deferred()
  let calls = 0
  const loader = createNodeDetailLoader(async nodeId => {
    calls += 1
    if (calls === 1) return { nodeId }
    return pending.promise
  }, { maxAgeMs: 1000 })

  await loader.load('node-7')
  const loading = loader.load('node-8')
  const now = Date.now()
  loader.prune(now + 5000)

  assert.equal(loader.entries['node-7'], undefined)
  assert.equal(loader.entries['node-8'].status, 'loading')
  pending.resolve({ nodeId: 'node-8' })
  await loading
})
