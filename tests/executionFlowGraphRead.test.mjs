import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { computed, ref } from 'vue'
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

const { createTraceFlowGraphState } = await vite.ssrLoadModule(
  '/src/features/execution/data/traceFlowGraphModel.ts',
)
const { useExecutionFlowGraphRead } = await vite.ssrLoadModule(
  '/src/features/execution/useExecutionFlowGraphRead.ts',
)

function harness(flowId = 'flow-1') {
  const currentFlowId = ref(flowId)
  const graph = createTraceFlowGraphState(flowId)
  const read = useExecutionFlowGraphRead({
    flowId: computed(() => currentFlowId.value),
    graph,
  })
  return { currentFlowId, graph, read }
}

test('a read of the current flow stamps the load and then the refresh', () => {
  const { read } = harness()
  read.applyRead('flow-1', { kind: 'read' })
  assert.notEqual(read.loadedAtMs.value, null)
  assert.equal(read.refreshedAtMs.value, null)

  read.applyRead('flow-1', { kind: 'read' })
  assert.notEqual(read.refreshedAtMs.value, null)
  assert.ok(read.refreshedAtMs.value >= read.loadedAtMs.value)
})

test('failed, skipped and stale reads never move the stamps', () => {
  const { read } = harness()
  read.applyRead('flow-1', { kind: 'failed', error: new Error('offline') })
  read.applyRead('flow-1', { kind: 'skipped' })
  assert.equal(read.loadedAtMs.value, null)
  assert.equal(read.refreshedAtMs.value, null)

  read.applyRead('flow-1', { kind: 'read' })
  const loadedAt = read.loadedAtMs.value
  read.applyRead('flow-1', { kind: 'failed', error: new Error('offline') })
  read.applyRead('flow-1', { kind: 'skipped' })
  read.applyRead('flow-1', { kind: 'stale' })
  assert.equal(read.loadedAtMs.value, loadedAt)
  assert.equal(read.refreshedAtMs.value, null)
})

test('a read of the previous flow never stamps the flow selected now', () => {
  const { graph, currentFlowId, read } = harness()
  read.applyRead('flow-1', { kind: 'read' })
  const loadedAt = read.loadedAtMs.value

  currentFlowId.value = 'flow-2'
  graph.flowId = 'flow-2'
  read.resetRead()
  read.applyRead('flow-1', { kind: 'read' })

  assert.equal(read.loadedAtMs.value, null)
  assert.equal(read.refreshedAtMs.value, null)
  assert.notEqual(loadedAt, null)
})

test('a read is applied only when the flow slice matches the requested flow', () => {
  const { graph, read } = harness()
  graph.flowId = 'flow-other'
  read.applyRead('flow-1', { kind: 'read' })
  assert.equal(read.loadedAtMs.value, null)
  assert.equal(read.refreshedAtMs.value, null)
})

test('a flow change drops the stamps so the next read is a load', () => {
  const { read } = harness()
  read.applyRead('flow-1', { kind: 'read' })
  read.applyRead('flow-1', { kind: 'read' })
  assert.notEqual(read.refreshedAtMs.value, null)

  read.resetRead()
  assert.equal(read.loadedAtMs.value, null)
  assert.equal(read.refreshedAtMs.value, null)

  read.applyRead('flow-1', { kind: 'read' })
  assert.equal(read.refreshedAtMs.value, null)
  assert.notEqual(read.loadedAtMs.value, null)
})

test('a new flow stamps its own load instead of extending the previous flow', () => {
  const { graph, currentFlowId, read } = harness()
  read.applyRead('flow-1', { kind: 'read' })
  read.applyRead('flow-1', { kind: 'read' })
  assert.notEqual(read.refreshedAtMs.value, null)

  currentFlowId.value = 'flow-2'
  graph.flowId = 'flow-2'
  read.applyRead('flow-2', { kind: 'read' })

  assert.notEqual(read.loadedAtMs.value, null)
  assert.equal(read.refreshedAtMs.value, null)
})
