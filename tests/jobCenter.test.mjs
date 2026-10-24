import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import vue from '@vitejs/plugin-vue'

const naiveUiTestStub = {
  name: 'job-center-naive-ui-test-stub',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:job-center-naive-ui') return '\0job-center-naive-ui'
  },
  load(id) {
    if (id === '\0job-center-naive-ui') return 'export const NCode = {}; export const NTag = {}'
  },
}

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  plugins: [naiveUiTestStub, vue()],
  root,
  resolve: {
    alias: [
      { find: 'naive-ui', replacement: 'virtual:job-center-naive-ui' },
      { find: '@', replacement: resolve(root, 'src') },
    ],
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const {
  JOB_STATS,
  clampJobPage,
  jobNavigationContent,
  jobStatusPresentation,
  readJobIdQuery,
  summarizeJobStatusMessage,
} = await vite.ssrLoadModule('/src/views/job/jobCenter.ts')
const { isJobRecovering, isTerminalJob } = await vite.ssrLoadModule('/src/stores/jobTracking.ts')
const { executionRoute, reportRoute, jobCenterRoute } = await vite.ssrLoadModule('/src/utils/jobRoutes.ts')
const { t, currentLocaleRef } = await vite.ssrLoadModule('/src/stores/i18n.ts')
const JobStatusMessage = (await vite.ssrLoadModule('/src/components/JobStatusMessage.vue')).default
const { useReferenceCatalog } = await vite.ssrLoadModule('/src/stores/referenceCatalog.ts')
const { hasAlgorithmIdReference } = await vite.ssrLoadModule('/src/utils/algorithmReferences.ts')

test('global counters use only the backend JobStatus vocabulary', () => {
  assert.deepEqual(JOB_STATS.map(item => [item.key, item.status]), [
    ['total', null],
    ['running', 'Running'],
    ['succeeded', 'Succeeded'],
    ['failed', 'Failed'],
  ])
  assert.equal(JOB_STATS.some(item => item.status === 'Cancelled'), false)
})
test('Job status cells label supported, recovering, and unknown states without throwing', () => {
  const key = value => value
  assert.deepEqual(jobStatusPresentation('Running', false, key), {
    type: 'info',
    label: 'job.statusRunning',
  })
  assert.deepEqual(jobStatusPresentation('Failed', true, key), {
    type: 'warning',
    label: 'job.statusRecovering',
  })
  assert.deepEqual(jobStatusPresentation('FutureState', false, key), {
    type: 'default',
    label: 'FutureState',
  })
})
test('Job participant identity formatting prioritizes names and preserves IDs', () => {
  const { formatUserIdentity, formatUserIdentityParts, usersById } = useReferenceCatalog()
  const userId = 'job-identity-test-user'
  usersById.value.delete(userId)
  try {
    const payloadIdentity = { userId, userName: ' QA Operator ' }
    assert.deepEqual(formatUserIdentityParts(payloadIdentity), { name: 'QA Operator', id: userId })
    assert.equal(formatUserIdentity(payloadIdentity), 'QA Operator (job-identity-test-user)')
    assert.deepEqual(formatUserIdentityParts({ userId }), { name: '', id: userId })
    assert.equal(formatUserIdentity({ userId }), userId)
    assert.deepEqual(formatUserIdentityParts({ userName: 'Name only' }), { name: 'Name only', id: '' })
    assert.equal(formatUserIdentity({ userName: 'Name only' }), 'Name only')
    assert.equal(formatUserIdentityParts(null).name, '')
    assert.equal(formatUserIdentity(null), '-')
    usersById.value.set(userId, 'Catalog name')
    assert.deepEqual(formatUserIdentityParts({ userId }), { name: 'Catalog name', id: userId })
    assert.equal(formatUserIdentity({ userId }), 'Catalog name (job-identity-test-user)')
  } finally {
    usersById.value.delete(userId)
  }
})
test('algorithm metadata prefers the exact profile name and keeps the algorithm ID in parentheses', () => {
  const { algorithmsById, formatValue } = useReferenceCatalog()
  const algorithmId = 'identity-profile-test-id'
  const previous = algorithmsById.value
  algorithmsById.value = new Map([[algorithmId, 'my-sm9noncert']])

  try {
    assert.equal(
      formatValue('algorithmId', algorithmId, {}),
      `my-sm9noncert (${algorithmId})`,
    )
    assert.equal(formatValue('algorithmId', algorithmId, { algorithmName: 'Persisted Name' }), `Persisted Name (${algorithmId})`)
    assert.equal(formatValue('algorithmId', 'unlisted-profile-id', {}), 'unlisted-profile-id')
    assert.equal(
      summarizeJobStatusMessage(JSON.stringify({ algorithmId }), formatValue),
      `algorithmId: my-sm9noncert (${algorithmId})`,
    )
  } finally {
    algorithmsById.value = previous
  }
})
test('algorithm-ID lookup only activates for non-empty scalar algorithm references', () => {
  assert.equal(hasAlgorithmIdReference({ nested: { algorithmId: 'profile-id' } }), true)
  assert.equal(hasAlgorithmIdReference([{ algorithmId: 42 }]), true)
  assert.equal(hasAlgorithmIdReference({ algorithmId: '' }), false)
  assert.equal(hasAlgorithmIdReference({ algorithmIds: ['profile-id'] }), false)
  assert.equal(hasAlgorithmIdReference({ nested: { algorithmId: null } }), false)
})

test('status summaries compact arbitrary text and generic JSON while retaining both ends of long messages', () => {
  const raw = '{"stage":"dispatch","detail":"QA synthetic failure"}'
  assert.equal(summarizeJobStatusMessage(raw), 'stage: dispatch · detail: QA synthetic failure')
  assert.equal(
    summarizeJobStatusMessage('Stage\ndispatch\nDetail\nQA synthetic failure'),
    'Stage dispatch Detail QA synthetic failure',
  )
  const long = `{"stage":"dispatch","detail":"${'diagnostic detail '.repeat(12)}QA synthetic failure"}`
  const summary = summarizeJobStatusMessage(long)
  assert.ok(summary.length <= 72)
  assert.equal(summary.startsWith('stage: dispatch · detail:'), true)
  assert.equal(summary.includes('QA synthetic failure'), true)
  assert.equal(summary.includes('\n'), false)
  assert.equal(summarizeJobStatusMessage('{"detail":"first line\\nsecond line"}'), 'detail: first line second line')
})

test('compact Job progress discloses the exact original message as selectable text', async () => {
  const raw = 'Stage\ndispatch\nDetail\nQA synthetic failure\n<raw & exact>'
  const html = await renderToString(createSSRApp(JobStatusMessage, { message: raw, compact: true }))
  const escapedRaw = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  assert.ok(html.includes('<details'))
  const expandedText = html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)?.[1]
  assert.equal(expandedText, escapedRaw)
})

test('Job navigation labels and help text state each view and its data limits in both locales', () => {
  const previousLocale = currentLocaleRef.value
  const expectedCopy = {
    'zh-CN': [
      ['执行记录', '打开此委托的执行记录；Summary / Protocol 可能不可用。'],
      ['委托详情与任务', '委托详情与任务列表来自各自 API，结果可能不完整。'],
      ['只读报告', '只汇总当前已加载数据；覆盖范围可能不完整。'],
    ],
    en: [
      ['Execution record', 'Open this Job’s execution record. Summary/Protocol may be unavailable.'],
      ['Job details / tasks', 'Job details and tasks come from their respective APIs and may be incomplete.'],
      ['Read-only report', 'Summarizes currently loaded data only; coverage may be incomplete.'],
    ],
  }
  try {
    for (const [locale, expected] of Object.entries(expectedCopy)) {
      currentLocaleRef.value = locale
      const content = ['execution', 'details', 'report'].map(action => {
        const { labelKey, helpKey } = jobNavigationContent(action)
        return [t(labelKey), t(helpKey)]
      })
      assert.deepEqual(content, expected)
    }
  } finally {
    currentLocaleRef.value = previousLocale
  }
})

test('recovery requests stay active and cancellation remains Failed plus its error code', () => {
  assert.equal(isJobRecovering({ status: 'Failed', recoveryRequested: true }), true)
  assert.equal(isJobRecovering({ status: 'Running', maintenanceRecovery: 'Requested' }), true)
  assert.equal(isTerminalJob({ status: 'Failed', recoveryRequested: true }), false)
  assert.equal(isTerminalJob({ status: 'Failed', errorCode: 'Cancelled' }), true)
  assert.equal(isTerminalJob({ status: 'Failed', errorCode: 'InternalError' }), true)
  assert.equal(isTerminalJob({ status: 'Running' }), false)
})

test('clamps server pagination after filters or refreshed totals change', () => {
  assert.equal(clampJobPage(2, 55, 20), 2)
  assert.equal(clampJobPage(5, 55, 20), 3)
  assert.equal(clampJobPage(5, 0, 20), 1)
  assert.equal(clampJobPage(0, 12, 10), 1)
  assert.equal(clampJobPage(Number.NaN, 12, 10), 1)
  assert.equal(clampJobPage(3, 12, 0), 3)
  assert.equal(clampJobPage(3, 12, -1), 3)
  assert.equal(clampJobPage(3, 12, Number.NaN), 3)
  assert.equal(clampJobPage(3, 12, 0.5), 3)
})

test('restores the selected Job from a scalar or repeated query parameter', () => {
  assert.equal(readJobIdQuery('job-1'), 'job-1')
  assert.equal(readJobIdQuery('  job-2  '), 'job-2')
  assert.equal(readJobIdQuery(['', 'job-3', 'job-4']), 'job-3')
  assert.equal(readJobIdQuery([' ', 5]), '')
  assert.equal(readJobIdQuery(5), '')
  assert.equal(readJobIdQuery(null), '')
})
test('deep links point to the existing execution, report and selected Job routes', () => {
  assert.deepEqual(executionRoute('job-1'), { name: 'executionDetail', params: { jobId: 'job-1' } })
  assert.deepEqual(reportRoute('job-1'), { name: 'executionReport', params: { jobId: 'job-1' } })
  assert.deepEqual(jobCenterRoute('job-1'), { name: 'jobs', query: { jobId: 'job-1' } })
  assert.deepEqual(jobCenterRoute(), { name: 'jobs' })
})
