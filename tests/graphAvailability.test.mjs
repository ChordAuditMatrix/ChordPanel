import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, effectScope, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'
import { renderToString } from '@vue/server-renderer'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  plugins: [vue()],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const {
  isGraphViewRequested,
  readGraphUnavailable,
} = await vite.ssrLoadModule('/src/features/execution/data/graphAvailability.ts')
const { useGraphDeepLink } = await vite.ssrLoadModule(
  '/src/features/execution/useExecutionJobGraph.ts',
)
const { default: GraphUnavailableNotice } = await vite.ssrLoadModule(
  '/src/features/execution/components/GraphUnavailableNotice.vue',
)


function graphNotCapturedError(overrides = {}) {
  return {
    response: {
      status: 501,
      data: {
        error: 'trace_resource_not_captured',
        message: 'No execution-graph capture exists for Job job-1.',
        detail: 'A graph fixture must be captured from a real backend run.',
        ...overrides,
      },
    },
  }
}

function flowNotFoundError() {
  return {
    response: {
      status: 404,
      data: {
        error: 'flow_not_found',
        message: 'Flow flow-1 is not part of the local QA graph scenario.',
        detail: 'Known QA graph flows: f10a0000-0000-4000-8000-000000000001.',
      },
    },
  }
}

async function renderNotice(error) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/executions/:jobId',
      name: 'executionDetail',
      component: { template: '<div />' },
    }],
  })
  const app = createSSRApp(GraphUnavailableNotice, { error })
  app.use(router)
  await router.push('/executions/current-job')
  await router.isReady()
  return renderToString(app)
}

test('only the two not-provided graph codes become an unavailable state', () => {
  assert.deepEqual(readGraphUnavailable(graphNotCapturedError()), {
    code: 'trace_resource_not_captured',
    message: 'No execution-graph capture exists for Job job-1.',
    detail: 'A graph fixture must be captured from a real backend run.',
  })
  assert.deepEqual(readGraphUnavailable(flowNotFoundError()), {
    code: 'flow_not_found',
    message: 'Flow flow-1 is not part of the local QA graph scenario.',
    detail: 'Known QA graph flows: f10a0000-0000-4000-8000-000000000001.',
  })

  // Other 501s, cursor errors, transport failures and non-JSON bodies stay
  // ordinary errors; they must not acquire the not-provided explanation.
  assert.equal(readGraphUnavailable({
    response: { status: 501, data: { error: 'qa_read_only', message: 'read only' } },
  }), null)
  assert.equal(readGraphUnavailable({
    response: { status: 400, data: { error: 'trace_cursor_invalid', message: 'bad cursor' } },
  }), null)
  assert.equal(readGraphUnavailable(new Error('network failed')), null)
  assert.equal(readGraphUnavailable({ response: { status: 501, data: 'plain text' } }), null)
  assert.equal(readGraphUnavailable(null), null)
})

test('?graph=1 is an exact display flag, not a general query truthiness check', () => {
  assert.equal(isGraphViewRequested({ graph: '1' }), true)
  assert.equal(isGraphViewRequested({ graph: '0' }), false)
  assert.equal(isGraphViewRequested({ graph: ['1'] }), false)
  assert.equal(isGraphViewRequested({}), false)
  assert.equal(isGraphViewRequested(null), false)
})


test('the not-provided notice keeps raw backend text collapsed and offers no synthetic graph link', async () => {
  const html = await renderNotice(graphNotCapturedError())
  const detailsStart = html.indexOf('<details')
  const detailsEnd = html.indexOf('</details>', detailsStart)

  assert.ok(detailsStart >= 0, 'raw details are rendered')
  assert.ok(detailsEnd > detailsStart, 'raw details have a closing tag')
  const openingTag = html.slice(detailsStart, html.indexOf('>', detailsStart) + 1)
  assert.doesNotMatch(openingTag, /\sopen(?:=|\s|>)/, 'raw details start collapsed')

  assert.ok(html.indexOf('未提供该委托的执行图') < detailsStart)
  assert.ok(html.indexOf('不是空图') < detailsStart)
  assert.ok(html.indexOf('原始错误详情') > detailsStart)
  assert.ok(html.indexOf('No execution-graph capture exists') > detailsStart)
  assert.ok(html.indexOf('No execution-graph capture exists') < detailsEnd)
  assert.ok(html.indexOf('A graph fixture must be captured') < detailsEnd)
  assert.doesNotMatch(html, /data-graph-demo-link|打开合成执行图演示/)
})


test('a flow-not-found answer uses the flow wording, not the Job wording', async () => {
  const html = await renderNotice(flowNotFoundError())
  assert.match(html, /未提供该流程的委托图/)
  assert.doesNotMatch(html, /未提供该委托的执行图/)
  assert.ok(html.indexOf('原始错误详情') > 0)
})

test('an unrelated error does not render the not-provided or raw-details panel', async () => {
  const html = await renderNotice({
    response: { status: 501, data: { error: 'qa_read_only', message: 'read only' } },
  })
  assert.doesNotMatch(html, /未提供该委托的执行图/)
  assert.doesNotMatch(html, /原始错误详情/)
})

test('?graph=1 opens the graph immediately and again after an in-place Job change', async () => {
  const jobId = ref(null)
  const requested = ref(false)
  let calls = 0
  const scope = effectScope()
  scope.run(() => useGraphDeepLink({
    jobId,
    requested,
    showGraph: () => { calls += 1 },
  }))
  await nextTick()
  assert.equal(calls, 0)

  requested.value = true
  await nextTick()
  assert.equal(calls, 0, 'no Job identity means no graph read')

  jobId.value = 'job-1'
  await nextTick()
  assert.equal(calls, 1)

  jobId.value = 'job-2'
  await nextTick()
  assert.equal(calls, 2, 'the deep link follows the newly selected Job')

  requested.value = false
  await nextTick()
  assert.equal(calls, 2, 'leaving ?graph=1 does not issue another open')

  scope.stop()
})

test('a direct ?graph=1 URL with a loaded Job opens on mount', async () => {
  const jobId = ref('job-1')
  const requested = ref(true)
  let calls = 0
  const scope = effectScope()
  scope.run(() => useGraphDeepLink({
    jobId,
    requested,
    showGraph: () => { calls += 1 },
  }))
  await nextTick()
  assert.equal(calls, 1)
  scope.stop()
})
