import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const mockApiId = '\0job-tracking-test-api'
const mockSettingsId = '\0job-tracking-test-settings'

const mocks = {
  name: 'job-tracking-test-mocks',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:job-tracking-test-api') return mockApiId
    if (id === 'virtual:job-tracking-test-settings') return mockSettingsId
  },
  load(id) {
    if (id === mockApiId) {
      return `
let handler = async () => { throw new Error('No Job detail response configured') }
let calls = 0
let detailOptions = []
export function setJobDetailHandler(next) { handler = next; calls = 0; detailOptions = [] }
export function jobDetailCallCount() { return calls }
export function jobDetailOptions() { return detailOptions }
export async function getJobDetail(jobId, options) { calls += 1; detailOptions.push(options); return handler(jobId, calls) }

let taskHandler = async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
let taskRequests = []
export function setJobTaskHandler(next) { taskHandler = next; taskRequests = [] }
export function jobTaskRequests() { return taskRequests }
export async function getJobTasks(jobId, params, options) {
  taskRequests.push({ jobId, params, options })
  return taskHandler(jobId, params)
}
`
    }
    if (id === mockSettingsId) {
      return `
import { ref } from 'vue'
const settings = ref({ pollInterval: 60000 })
export function useSettings() { return { settings } }
`
    }
  },
}

const vite = await createServer({
  configFile: false,
  root,
  plugins: [mocks],
  resolve: {
    alias: [
      { find: '@/api/job', replacement: 'virtual:job-tracking-test-api' },
      { find: '@/stores/settings', replacement: 'virtual:job-tracking-test-settings' },
      { find: '@', replacement: resolve(root, 'src') },
    ],
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const api = await vite.ssrLoadModule('virtual:job-tracking-test-api')
const trackingModule = await vite.ssrLoadModule('/src/stores/jobTracking.ts')
const tracking = trackingModule.useJobTracking()

function jobDetail(jobId, status, metadata) {
  return {
    jobId,
    jobType: 'Audit',
    status,
    createdAtMs: 1,
    metadata,
    history: [],
    taskIds: [],
    taskIdsComplete: true,
  }
}

function jobSummary(jobId, status) {
  return { jobId, jobType: 'Audit', status, createdAtMs: 1 }
}

function flushUpdates() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

test('refreshes supplementary metadata when a polled Job becomes terminal', async () => {
  const jobId = 'terminal-metadata-job'
  api.setJobDetailHandler((_id, call) => call === 1
    ? jobDetail(jobId, 'Running', { phase: 'processing' })
    : jobDetail(jobId, 'Succeeded', { phase: 'complete', result: 'fresh' }))
  const release = trackingModule.subscribeJob(jobId)

  try {
    await flushUpdates()
    assert.deepEqual(tracking.snapshots[jobId]?.metadata, { phase: 'processing' })

    trackingModule.publishJobSnapshots([jobSummary(jobId, 'Succeeded')])
    await flushUpdates()

    assert.equal(api.jobDetailCallCount(), 2)
    assert.deepEqual(tracking.snapshots[jobId]?.metadata, { phase: 'complete', result: 'fresh' })
  } finally {
    release()
  }
})

test('queues a terminal detail refresh behind an in-flight stale detail request', async () => {
  const jobId = 'in-flight-terminal-metadata-job'
  let resolveFirst
  api.setJobDetailHandler((_id, call) => call === 1
    ? new Promise(resolve => { resolveFirst = resolve })
    : Promise.resolve(jobDetail(jobId, 'Succeeded', { phase: 'complete', result: 'fresh' })))
  const release = trackingModule.subscribeJob(jobId)

  try {
    assert.equal(typeof resolveFirst, 'function')
    trackingModule.publishJobSnapshots([jobSummary(jobId, 'Succeeded')])
    resolveFirst(jobDetail(jobId, 'Running', { phase: 'processing' }))
    await flushUpdates()

    assert.equal(api.jobDetailCallCount(), 2)
    assert.deepEqual(tracking.snapshots[jobId]?.metadata, { phase: 'complete', result: 'fresh' })
  } finally {
    release()
  }
})
test('running delegate count includes only tracked Jobs whose status is Running', async () => {
  const statuses = new Map([
    ['running-job-a', 'Running'],
    ['running-job-b', 'running'],
    ['pending-job', 'Pending'],
    ['completed-job', 'Succeeded'],
    ['failed-job', 'Failed'],
    ['unknown-job', 'Queued'],
  ])
  api.setJobDetailHandler(jobId => Promise.resolve(jobDetail(jobId, statuses.get(jobId))))
  const jobIds = [...statuses.keys()]
  jobIds.forEach(jobId => trackingModule.trackJob(jobId, 'Audit'))

  try {
    await flushUpdates()
    assert.equal(tracking.runningTrackedCount.value, 2)

    statuses.set('running-job-a', 'Succeeded')
    trackingModule.publishJobSnapshots([jobSummary('running-job-a', 'Succeeded')])
    await flushUpdates()
    assert.equal(tracking.runningTrackedCount.value, 1)

    statuses.set('pending-job', 'Running')
    trackingModule.publishJobSnapshots([jobSummary('pending-job', 'Running')])
    await flushUpdates()
    assert.equal(tracking.runningTrackedCount.value, 2)
  } finally {
    jobIds.forEach(jobId => trackingModule.removeTrackedJob(jobId))
  }
})

test('Job and Task resource loads stay silent while keeping their real failure state', async () => {
  const jobId = 'silent-resource-failure-job'
  api.setJobDetailHandler(() => Promise.reject(new Error('detail unavailable')))
  api.setJobTaskHandler(() => Promise.reject(new Error('tasks unavailable')))
  const release = trackingModule.subscribeJob(jobId)

  try {
    await flushUpdates()

    assert.ok(api.jobDetailOptions().length > 0)
    assert.ok(api.jobDetailOptions().every(options => options?.silent === true))
    assert.ok(api.jobTaskRequests().length > 0)
    assert.ok(api.jobTaskRequests().every(request => request.options?.silent === true))

    // Failures are preserved as resource state; nothing is converted to an
    // empty successful result and the snapshot identity is kept.
    assert.equal(tracking.snapshots[jobId]?.status, 'Pending')
    assert.equal(tracking.snapshots[jobId]?.detailLoadFailed, true)
    assert.equal(tracking.snapshots[jobId]?.detailLoaded, undefined)
    // A failed initial Task load publishes no Task slice at all; consumers
    // normalize the absent slice to `[]`, while `taskPages.error` marks the
    // failure. It must never fabricate a successful empty page.
    assert.equal(tracking.taskSnapshots[jobId], undefined)
    assert.equal(tracking.taskPages[jobId]?.error, true)
    assert.equal(tracking.taskPages[jobId]?.loading, false)
  } finally {
    release()
  }
})

test('inline Task retry stays silent and clears the resource error only on success', async () => {
  const jobId = 'silent-task-retry-job'
  let failing = true
  api.setJobDetailHandler(() => Promise.resolve(jobDetail(jobId, 'Running')))
  api.setJobTaskHandler(() => failing
    ? Promise.reject(new Error('tasks unavailable'))
    : Promise.resolve({
      items: [{ taskId: 'task-1', jobId, taskType: 'Audit', status: 'Running' }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    }))
  const release = trackingModule.subscribeJob(jobId)

  try {
    await flushUpdates()
    assert.equal(tracking.taskPages[jobId]?.error, true)
    assert.deepEqual(tracking.taskSnapshots[jobId], [])

    failing = false
    await tracking.retryTaskPage(jobId)

    assert.equal(tracking.taskPages[jobId]?.error, false)
    assert.equal(tracking.taskPages[jobId]?.total, 1)
    assert.deepEqual(tracking.taskSnapshots[jobId]?.map(task => task.taskId), ['task-1'])
    assert.ok(api.jobTaskRequests().every(request => request.options?.silent === true))
  } finally {
    release()
  }
})
