import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const requestModuleId = '\0trace-api-validation-request'

// Validation tests must not open an HTTP connection or depend on deployment state.
const requestStub = {
  name: 'trace-api-validation-request-stub',
  enforce: 'pre',
  resolveId(id) {
    if (id === './request') return requestModuleId
  },
  load(id) {
    if (id === requestModuleId) return 'export default {}'
  },
}

const vite = await createServer({
  configFile: false,
  root,
  plugins: [requestStub],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const trace = await vite.ssrLoadModule('/src/api/trace.ts')

test('Trace list page sizes retain the backend boundary [1, 200]', () => {
  assert.equal(trace.validateTracePageSize(undefined), undefined)
  assert.equal(trace.validateTracePageSize(1), 1)
  assert.equal(trace.validateTracePageSize(200), 200)

  for (const value of [0, 201, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => trace.validateTracePageSize(value), RangeError)
  }
})

test('offset pages and part indexes preserve their backend ordinal limits', () => {
  assert.equal(trace.validateTracePage(undefined), undefined)
  assert.equal(trace.validateTracePage(1), 1)
  assert.equal(trace.validateTracePage(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER)
  for (const value of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => trace.validateTracePage(value), RangeError)
  }

  assert.equal(trace.validateTracePartIndex(0), 0)
  assert.equal(trace.validateTracePartIndex(2147483647), 2147483647)
  for (const value of [-1, 2147483648, 1.5, Number.NaN]) {
    assert.throws(() => trace.validateTracePartIndex(value), RangeError)
  }
})

test('closed filters reject values the Trace controller cannot parse', () => {
  assert.equal(trace.validateTraceObservationCategory('challenge'), 'challenge')
  assert.equal(trace.validateTraceObservationCategory(undefined), undefined)
  assert.throws(() => trace.validateTraceObservationCategory('bogus'), TypeError)

  assert.equal(trace.validateTraceNodeId('Storage-1'), 'Storage-1')
  assert.equal(trace.validateTraceNodeId(undefined), undefined)
  assert.throws(() => trace.validateTraceNodeId(''), TypeError)
  assert.throws(() => trace.validateTraceNodeId(7), TypeError)

  assert.deepEqual(trace.validateTraceProtocolMessageTypes(['TaskDispatchReq', 'NodeToNodeReq']), [
    'TaskDispatchReq',
    'NodeToNodeReq',
  ])
  assert.throws(() => trace.validateTraceProtocolMessageTypes(['bogus']), TypeError)
  assert.throws(() => trace.validateTraceProtocolMessageTypes('TaskDispatchReq'), TypeError)
})

test('window inclusion and opaque cursor limits do not invent query values', () => {
  assert.equal(trace.validateTraceIncludeWindows(undefined), false)
  assert.equal(trace.validateTraceIncludeWindows(false), false)
  assert.equal(trace.validateTraceIncludeWindows(true), true)
  assert.throws(() => trace.validateTraceIncludeWindows('true'), TypeError)

  assert.equal(trace.validateTraceCursor(undefined), undefined)
  assert.equal(trace.validateTraceCursor(''), undefined)
  assert.equal(trace.validateTraceCursor('opaque-cursor'), 'opaque-cursor')
  assert.equal(trace.validateTraceCursor('x'.repeat(8192)), 'x'.repeat(8192))
  assert.throws(() => trace.validateTraceCursor('x'.repeat(8193)), RangeError)
  assert.throws(() => trace.validateTraceCursor(5), TypeError)
})
test('Trace requests reject an empty Job ID before constructing a route', async () => {
  await assert.rejects(trace.getTraceSummary(''), TypeError)
  await assert.rejects(trace.getTraceProtocol('', {}), TypeError)
})
