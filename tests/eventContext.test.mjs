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

const {
  readEventPage,
  normalizeEventFilters,
  normalizeMessageTypes,
  sameEventFilters,
  eventDirection,
  extractExactReferences,
  eventsForCorrelationOnPage,
} = await vite.ssrLoadModule('/src/views/event/eventContext.ts')
const { getProtocolEvents } = await vite.ssrLoadModule('/src/api/protocolEvent.ts')
const { default: api } = await vite.ssrLoadModule('/src/api/request.ts')
test('correlation sequence contains only matching events from the loaded page', () => {
  const loadedPage = [
    event({ packetId: 'later', correlationId: 'corr-1', timestampMs: 30 }),
    event({ packetId: 'other', correlationId: 'corr-2', timestampMs: 10 }),
    event({ packetId: 'earlier', correlationId: 'corr-1', timestampMs: 20 }),
  ]
  assert.deepEqual(
    eventsForCorrelationOnPage(loadedPage, 'corr-1').map(item => item.packetId),
    ['earlier', 'later'],
  )
  assert.deepEqual(eventsForCorrelationOnPage(loadedPage, undefined), [])
})

function event(overrides = {}) {
  return {
    packetId: 'pkt-1',
    fromNodeId: 'admin-1',
    toNodeId: 'audit-1',
    messageType: 'TaskDispatchReq',
    timestampMs: 1_700_000_000_000,
    ...overrides,
  }
}

test('readEventPage keeps valid rows and preserves the reported total', () => {
  const page = readEventPage({
    items: [event(), { packetId: 'broken' }, null, event({ packetId: 'pkt-2' })],
    total: 42,
  })
  assert.equal(page.items.length, 2)
  assert.deepEqual(page.items.map(item => item.packetId), ['pkt-1', 'pkt-2'])
  assert.equal(page.total, 42)
})

test('readEventPage rejects responses without an items array', () => {
  assert.throws(() => readEventPage(null), TypeError)
  assert.throws(() => readEventPage({ total: 1 }), TypeError)
  assert.throws(() => readEventPage({ items: 'nope' }), TypeError)
})

test('readEventPage falls back to the item count when total is not numeric', () => {
  assert.equal(readEventPage({ items: [event()], total: '3' }).total, 1)
  assert.equal(readEventPage({ items: [] }).total, 0)
})

test('normalizeEventFilters requires a node and drops blank optional filters', () => {
  assert.equal(normalizeEventFilters({
    nodeId: '   ', fromNodeId: '', toNodeId: '', messageTypes: '', correlationId: '', requestId: '', traceId: '',
  }), null)

  const filters = normalizeEventFilters({
    nodeId: ' audit-1 ',
    fromNodeId: ' ',
    toNodeId: ' storage-1 ',
    messageTypes: ' TaskDispatchReq,  TaskDispatchAck ,',
    correlationId: ' corr-1 ',
    requestId: '',
    traceId: ' trace-1 ',
  })
  assert.deepEqual(filters, {
    nodeId: 'audit-1',
    fromNodeId: undefined,
    toNodeId: 'storage-1',
    messageTypes: 'TaskDispatchReq,TaskDispatchAck',
    correlationId: 'corr-1',
    requestId: undefined,
    traceId: 'trace-1',
  })
})

test('normalizeMessageTypes collapses commas and empty segments', () => {
  assert.equal(normalizeMessageTypes(''), undefined)
  assert.equal(normalizeMessageTypes(' , ,'), undefined)
  assert.equal(normalizeMessageTypes('A,,B'), 'A,B')
})

test('sameEventFilters compares applied constraints, not object identity', () => {
  const base = normalizeEventFilters({
    nodeId: 'audit-1', fromNodeId: '', toNodeId: '', messageTypes: '', correlationId: 'c1', requestId: '', traceId: '',
  })
  const same = normalizeEventFilters({
    nodeId: 'audit-1', fromNodeId: '', toNodeId: '', messageTypes: '', correlationId: 'c1', requestId: '', traceId: '',
  })
  const different = normalizeEventFilters({
    nodeId: 'audit-1', fromNodeId: '', toNodeId: '', messageTypes: '', correlationId: 'c2', requestId: '', traceId: '',
  })
  assert.equal(sameEventFilters(base, same), true)
  assert.equal(sameEventFilters(base, different), false)
  assert.equal(sameEventFilters(base, null), false)
  assert.equal(sameEventFilters(null, null), true)
})

test('eventDirection stays unknown when the payload has no transport direction', () => {
  assert.equal(eventDirection(event()), 'unknown')
  assert.equal(eventDirection({ direction: 'sideways' }), 'unknown')
  assert.equal(eventDirection(null), 'unknown')
  assert.equal(eventDirection({ direction: 'inbound' }), 'inbound')
  assert.equal(eventDirection({ direction: 'outbound' }), 'outbound')
})

test('extractExactReferences reads only explicit top-level job/task IDs', () => {
  assert.deepEqual(extractExactReferences(event()), { jobId: '', taskId: '' })

  const withPayload = event({
    payload: { jobId: ' job-1 ', taskId: 42, nested: { jobId: 'job-nested' } },
  })
  assert.deepEqual(extractExactReferences(withPayload), { jobId: 'job-1', taskId: '' })

  const authOnly = event({ authExt: { taskId: 'task-1' } })
  assert.deepEqual(extractExactReferences(authOnly), { jobId: '', taskId: 'task-1' })

  const preferred = event({ payload: { jobId: 'job-payload' }, authExt: { jobId: 'job-auth' } })
  assert.equal(extractExactReferences(preferred).jobId, 'job-payload')
})

test('protocol event API preserves the exact filters and remote paging parameters', async () => {
  const originalAdapter = api.defaults.adapter
  let request
  api.defaults.adapter = async config => {
    request = config
    return {
      data: { items: [], total: 0 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
  try {
    await getProtocolEvents('node/a', {
      page: 3,
      pageSize: 25,
      fromNodeId: 'source',
      toNodeId: 'target',
      messageTypes: 'TaskDispatchReq,TaskDispatchAck',
      correlationId: 'corr-exact',
      requestId: 'request-exact',
      traceId: 'trace-exact',
      ascending: true,
    })
    assert.equal(request.url, '/v1/nodes/node%2Fa/protocol-events')
    assert.deepEqual(request.params, {
      page: 3,
      pageSize: 25,
      fromNodeId: 'source',
      toNodeId: 'target',
      messageTypes: 'TaskDispatchReq,TaskDispatchAck',
      correlationId: 'corr-exact',
      requestId: 'request-exact',
      traceId: 'trace-exact',
      ascending: true,
    })
  } finally {
    api.defaults.adapter = originalAdapter
  }
})
