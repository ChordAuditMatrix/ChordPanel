import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  plugins: [
    vue(),
    // Render the real Naive UI buttons/tags: unresolved SSR components become
    // comment placeholders, which would hide slots and aria state from this test.
    Components({ dirs: [], resolvers: [NaiveUiResolver()], dts: false }),
  ],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const { default: ExecutionViewHeader } = await vite.ssrLoadModule(
  '/src/features/execution/components/ExecutionViewHeader.vue',
)

function props(overrides = {}) {
  return {
    jobId: 'job-1',
    kind: 'challengeProof',
    isHistoricalReplay: false,
    jobStatus: 'Running',
    jobStatusTag: 'info',
    initialLoading: false,
    createdAtMs: 1,
    updatedAtMs: 2,
    summaryPlaceholder: '—',
    taskTotalLabel: '3',
    observationCountLabel: '4',
    confirmedPacketCountLabel: '1',
    peerCorrelationCountLabel: '2',
    hasCoverageDetails: false,
    coverage: null,
    viewMode: 'sequence',
    graphVisible: false,
    followLatest: true,
    isPlaying: false,
    hasObservations: true,
    reloading: false,
    resynchronizing: false,
    returnLabel: '返回',
    ...overrides,
  }
}

async function render(overrides = {}) {
  return renderToString(createSSRApp(ExecutionViewHeader, props(overrides)))
}

/** aria-pressed values of sequence, topology and graph, in template order. */
function viewPressed(html) {
  const start = html.indexOf('execution-action-group--views')
  const end = html.indexOf('execution-action-group--replay', start)
  assert.ok(start >= 0 && end > start, 'view action group is rendered before the replay group')
  const group = html.slice(start, end)
  return [...group.matchAll(/aria-pressed="(true|false)"/g)].map(match => match[1])
}

test('sequence, topology and graph expose one pressed view and switch state correctly', async () => {
  assert.deepEqual(viewPressed(await render({ viewMode: 'sequence', graphVisible: false })), [
    'true',
    'false',
    'false',
  ])
  assert.deepEqual(viewPressed(await render({ viewMode: 'topology', graphVisible: false })), [
    'false',
    'true',
    'false',
  ])
  // Opening the graph while either canvas view is current releases both.
  assert.deepEqual(viewPressed(await render({ viewMode: 'sequence', graphVisible: true })), [
    'false',
    'false',
    'true',
  ])
  assert.deepEqual(viewPressed(await render({ viewMode: 'topology', graphVisible: true })), [
    'false',
    'false',
    'true',
  ])
})

test('returning from the graph to a canvas view is representable as an exclusive pressed state', async () => {
  const graph = await render({ viewMode: 'topology', graphVisible: true })
  assert.deepEqual(viewPressed(graph), ['false', 'false', 'true'])

  const sequence = await render({ viewMode: 'sequence', graphVisible: false })
  assert.deepEqual(viewPressed(sequence), ['true', 'false', 'false'])

  const topology = await render({ viewMode: 'topology', graphVisible: false })
  assert.deepEqual(viewPressed(topology), ['false', 'true', 'false'])
})

function replayGroup(html) {
  const start = html.indexOf('execution-action-group--replay')
  const end = html.indexOf('execution-action-group--data', start)
  assert.ok(start >= 0 && end > start, 'replay action group is rendered before the data group')
  return html.slice(start, end)
}

test('replay state and empty observation tails stay visible and disabled', async () => {
  const replay = await render({ isHistoricalReplay: true, followLatest: false, hasObservations: false })
  assert.match(replay, /历史回放/)
  assert.match(replay, /role="group"/)
  assert.match(replay, /aria-label="执行回放"/)

  assert.match(replayGroup(replay), /disabled/)
})

test('header keeps accessible group labels and the three data actions', async () => {
  const html = await render()
  const groups = [...html.matchAll(/role="group"/g)]
  assert.equal(groups.length, 3)
  assert.match(html, /aria-label="视图模式"/)
  assert.match(html, /aria-label="执行回放"/)
  assert.match(html, /aria-label="刷新与报告"/)
  assert.match(html, /job-1/)
})
