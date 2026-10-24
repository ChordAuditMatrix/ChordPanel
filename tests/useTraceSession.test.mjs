import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import * as vue from 'vue'

const root = process.cwd()
const apiModuleId = '\0trace-session-test-api'
const settingsModuleId = '\0trace-session-test-settings'
const trackingModuleId = '\0trace-session-test-tracking'

const mocks = {
  name: 'trace-session-test-mocks',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:trace-session-test-api') return apiModuleId
    if (id === 'virtual:trace-session-test-settings') return settingsModuleId
    if (id === 'virtual:trace-session-test-tracking') return trackingModuleId
  },
  load(id) {
    if (id === apiModuleId) {
      return `
const handlers = { summary: null, observations: null, parts: null, links: null, protocol: null }
export const calls = { summary: [], observations: [], parts: [], links: [], protocol: [] }
function defaultSummary(jobId) {
  return {
    schemaVersion: 1,
    executionTraceId: 'job:' + jobId,
    jobId,
    executionKind: 'challengeProof',
    job: { status: 'Running', errorCode: 'None', createdAtMs: 1, endedAtMs: null },
    references: { verified: null },
    progress: {},
    coverage: { reasons: [] },
    observedAtMs: 1,
  }
}
export function resetTraceApi(next = {}) {
  for (const key of Object.keys(handlers)) handlers[key] = next[key] ?? null
  for (const rows of Object.values(calls)) rows.length = 0
}
export async function getTraceSummary(jobId, options) {
  const call = calls.summary.length + 1
  calls.summary.push({ jobId, options })
  return handlers.summary ? handlers.summary(jobId, call, options) : defaultSummary(jobId)
}
export async function getTraceObservations(jobId, params, options) {
  const call = calls.observations.length + 1
  calls.observations.push({ jobId, params, options })
  return handlers.observations
    ? handlers.observations(jobId, params, call, options)
    : { items: [], nextCursor: params.cursor ?? 'cursor-initial', hasMore: false, cursorConsistency: 'eventual' }
}
export async function getTraceParts(jobId, params, options) {
  const call = calls.parts.length + 1
  calls.parts.push({ jobId, params, options })
  return handlers.parts
    ? handlers.parts(jobId, params, call, options)
    : { items: [], total: 0, page: params.page, pageSize: params.pageSize, hasMore: false, coverage: 'notInstrumented' }
}
export async function getTraceLinks(jobId, params, options) {
  const call = calls.links.length + 1
  calls.links.push({ jobId, params, options })
  return handlers.links
    ? handlers.links(jobId, params, call, options)
    : { items: [], total: 0, page: params.page, pageSize: params.pageSize, hasMore: false }
}
export async function getTraceProtocol(jobId, params, options) {
  const call = calls.protocol.length + 1
  calls.protocol.push({ jobId, params, options })
  return handlers.protocol
    ? handlers.protocol(jobId, params, call, options)
    : { items: [], nextCursor: null, hasMore: false, coverage: 'notInstrumented', reasons: [] }
}
`
    }
    if (id === settingsModuleId) {
      return `
import { ref } from 'vue'
export const settings = ref({ pollInterval: 5000 })
export function setPollInterval(value) { settings.value.pollInterval = value }
export function useSettings() { return { settings } }
`
    }
    if (id === trackingModuleId) {
      return `
import { reactive } from 'vue'
export const snapshots = reactive({})
export const taskSnapshots = reactive({})
export const taskPages = reactive({})
export const calls = { taskPages: [], subscriptions: [], releases: [] }
export function resetTracking() {
  for (const object of [snapshots, taskSnapshots, taskPages]) {
    for (const key of Object.keys(object)) delete object[key]
  }
  calls.taskPages.length = 0
  calls.subscriptions.length = 0
  calls.releases.length = 0
}
export function publishJob(jobId, status) {
  snapshots[jobId] = { jobId, status, snapshotLoaded: true }
}
export function isJobRecovering() { return false }
export function isTerminalJob(job) {
  return ['succeeded', 'failed', 'canceled', 'cancelled'].includes(job?.status?.toLowerCase())
}
export function useJobTracking() {
  return {
    snapshots,
    taskSnapshots,
    taskPages,
    setTaskPage(jobId, page, pageSize) {
      calls.taskPages.push({ jobId, page, pageSize })
      taskPages[jobId] = { page, pageSize, total: 0, loading: false, error: false, sortOrder: 'descend' }
    },
    subscribeJob(jobId) {
      calls.subscriptions.push(jobId)
      if (!snapshots[jobId]) snapshots[jobId] = { jobId, status: 'Running', snapshotLoaded: false }
      let released = false
      return () => {
        if (released) return
        released = true
        calls.releases.push(jobId)
      }
    },
    retryTaskPage() { return Promise.resolve() },
  }
}
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
      { find: '@/api/trace', replacement: 'virtual:trace-session-test-api' },
      { find: '@/stores/settings', replacement: 'virtual:trace-session-test-settings' },
      { find: '@/stores/jobTracking', replacement: 'virtual:trace-session-test-tracking' },
      { find: '@', replacement: resolve(root, 'src') },
    ],
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const api = await vite.ssrLoadModule('virtual:trace-session-test-api')
const settings = await vite.ssrLoadModule('virtual:trace-session-test-settings')
const tracking = await vite.ssrLoadModule('virtual:trace-session-test-tracking')
const { useTraceSession } = await vite.ssrLoadModule('/src/features/execution/data/useTraceSession.ts')

function createRenderer() {
  const renderer = vue.createRenderer({
    createElement: type => ({ type, children: [], props: {}, parent: null }),
    createText: text => ({ type: '#text', text, parent: null }),
    createComment: text => ({ type: '#comment', text, parent: null }),
    setText(node, text) { node.text = text },
    setElementText(node, text) { node.text = text; node.children = [] },
    patchProp(node, key, _previous, next) { node.props[key] = next },
    insert(node, parent, anchor = null) {
      if (node.parent) {
        const oldIndex = node.parent.children.indexOf(node)
        if (oldIndex >= 0) node.parent.children.splice(oldIndex, 1)
      }
      node.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, node)
      else parent.children.push(node)
    },
    remove(node) {
      if (!node.parent) return
      const index = node.parent.children.indexOf(node)
      if (index >= 0) node.parent.children.splice(index, 1)
      node.parent = null
    },
    parentNode: node => node.parent,
    nextSibling(node) {
      if (!node.parent) return null
      return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
    },
  })
  return renderer
}

async function flush() {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve()
    await vue.nextTick()
  }
}

function createBrowserClock() {
  const originalDateNow = Date.now
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const hadWindow = Object.hasOwn(globalThis, 'window')
  const hadDocument = Object.hasOwn(globalThis, 'document')
  let now = 1_000_000
  let nextTimerId = 1
  const timers = new Map()
  const listeners = new Map()
  const document = {
    visibilityState: 'visible',
    addEventListener(name, listener) {
      const current = listeners.get(name) ?? new Set()
      current.add(listener)
      listeners.set(name, current)
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener)
    },
    dispatch(name) {
      for (const listener of listeners.get(name) ?? []) listener()
    },
  }
  const window = {
    setTimeout(callback, delay = 0) {
      const id = nextTimerId++
      timers.set(id, { callback, at: now + Math.max(0, Number(delay) || 0) })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
  }
  globalThis.window = window
  globalThis.document = document
  Date.now = () => now

  return {
    document,
    timers,
    async advanceBy(duration) {
      const target = now + duration
      let steps = 0
      while (steps++ < 100) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0]
        if (!next) break
        const [id, timer] = next
        now = timer.at
        timers.delete(id)
        timer.callback()
        await flush()
      }
      assert.ok(steps < 100, 'fake clock did not settle')
      now = target
      await flush()
    },
    restore() {
      Date.now = originalDateNow
      if (hadWindow) globalThis.window = originalWindow
      else delete globalThis.window
      if (hadDocument) globalThis.document = originalDocument
      else delete globalThis.document
    },
  }
}

async function mountSession(jobId, options = {}) {
  let session
  const jobIdRef = vue.ref(jobId)
  const rootNode = { type: 'root', children: [], parent: null }
  const app = createRenderer().createApp({
    setup() {
      session = useTraceSession(jobIdRef, options)
      return () => null
    },
  })
  app.mount(rootNode)
  await flush()
  assert.equal(session.state.initialLoaded, true)
  return { app, jobIdRef, session }
}

function resourceCallCount(resource) {
  return api.calls[resource].length
}

test('adaptive polling follows resource cadence, pauses while hidden and cancels on unmount', async () => {
  const clock = createBrowserClock()
  api.resetTraceApi()
  tracking.resetTracking()
  settings.setPollInterval(5000)
  const { app } = await mountSession('adaptive-job', { pollingProfile: 'adaptive' })

  try {
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      { summary: 1, observations: 1, parts: 1, links: 1, protocol: 1 },
    )
    assert.deepEqual([...clock.timers.values()].map(timer => timer.at - Date.now()), [1000])

    await clock.advanceBy(1000)
    assert.equal(resourceCallCount('summary'), 2)
    assert.equal(resourceCallCount('observations'), 2)
    assert.equal(resourceCallCount('parts'), 1)
    assert.equal(resourceCallCount('links'), 1)
    assert.equal(resourceCallCount('protocol'), 1)
    assert.deepEqual([...clock.timers.values()].map(timer => timer.at - Date.now()), [1000])

    clock.document.visibilityState = 'hidden'
    clock.document.dispatch('visibilitychange')
    assert.equal(clock.timers.size, 0)
    const hiddenCounts = Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)]))
    await clock.advanceBy(10_000)
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      hiddenCounts,
    )

    clock.document.visibilityState = 'visible'
    clock.document.dispatch('visibilitychange')
    await flush()
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      { summary: 3, observations: 3, parts: 2, links: 2, protocol: 2 },
    )
    assert.equal(clock.timers.size, 1)

    app.unmount()
    await flush()
    assert.equal(clock.timers.size, 0)
    assert.deepEqual(tracking.calls.releases, ['adaptive-job'])
    const unmountedCounts = Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)]))
    await clock.advanceBy(10_000)
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      unmountedCounts,
    )
  } finally {
    app.unmount()
    clock.restore()
  }
})

test('default Trace polling keeps the configured global cadence on background surfaces', async () => {
  const clock = createBrowserClock()
  api.resetTraceApi()
  tracking.resetTracking()
  settings.setPollInterval(3000)
  const { app } = await mountSession('global-job')

  try {
    assert.deepEqual([...clock.timers.values()].map(timer => timer.at - Date.now()), [3000])
    clock.document.visibilityState = 'hidden'
    clock.document.dispatch('visibilitychange')
    assert.equal(clock.timers.size, 1)

    await clock.advanceBy(2999)
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      { summary: 1, observations: 1, parts: 1, links: 1, protocol: 1 },
    )
    await clock.advanceBy(1)
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      { summary: 2, observations: 2, parts: 2, links: 2, protocol: 2 },
    )
  } finally {
    app.unmount()
    clock.restore()
  }
})

test('poll cycles coalesce while a request is slow and terminal sync discovers late observations', async () => {
  const clock = createBrowserClock()
  api.resetTraceApi()
  tracking.resetTracking()
  settings.setPollInterval(5000)
  let releaseSlowSummary
  let activeSummaries = 0
  let maxActiveSummaries = 0
  api.resetTraceApi({
    summary(jobId, call) {
      activeSummaries += 1
      maxActiveSummaries = Math.max(maxActiveSummaries, activeSummaries)
      const finish = () => {
        activeSummaries -= 1
        return {
          schemaVersion: 1,
          executionTraceId: `job:${jobId}`,
          jobId,
          executionKind: 'challengeProof',
          job: { status: 'Running', errorCode: 'None', createdAtMs: 1, endedAtMs: null },
          references: { verified: null },
          progress: {},
          coverage: { reasons: [] },
          observedAtMs: 1,
        }
      }
      if (call !== 2) return Promise.resolve(finish())
      return new Promise(resolve => {
        releaseSlowSummary = () => resolve(finish())
      })
    },
    observations(jobId, params, call) {
      const late = {
        observationId: 'late-after-terminal',
        jobId,
        recordedAtMs: 20,
      }
      if (call === 1) return { items: [], nextCursor: 'cursor-1', hasMore: false, cursorConsistency: 'eventual' }
      if (params.cursor === undefined && call > 1) {
        return { items: [late], nextCursor: 'cursor-resync', hasMore: false, cursorConsistency: 'eventual' }
      }
      return { items: [], nextCursor: `cursor-${call}`, hasMore: false, cursorConsistency: 'eventual' }
    },
  })
  const { app, session } = await mountSession('terminal-job', { pollingProfile: 'adaptive' })

  try {
    await clock.advanceBy(1000)
    assert.equal(resourceCallCount('summary'), 2)
    assert.equal(typeof releaseSlowSummary, 'function')
    const queuedPoll = session.poll()
    assert.equal(resourceCallCount('summary'), 2)

    releaseSlowSummary()
    await queuedPoll
    await flush()
    assert.equal(resourceCallCount('summary'), 3)
    assert.equal(maxActiveSummaries, 1)

    tracking.publishJob('terminal-job', 'Succeeded')
    await flush()
    await clock.advanceBy(1000)
    await clock.advanceBy(1000)
    assert.ok(session.state.observations.data.some(row => row.observationId === 'late-after-terminal'))
    assert.equal(resourceCallCount('summary'), 6)
    assert.equal(clock.timers.size, 0)

    const terminalCounts = Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)]))
    await clock.advanceBy(10_000)
    assert.deepEqual(
      Object.fromEntries(Object.keys(api.calls).map(resource => [resource, resourceCallCount(resource)])),
      terminalCounts,
    )
  } finally {
    app.unmount()
    clock.restore()
  }
})

test('switching Jobs cannot let a late old response overwrite the new Trace session', async () => {
  const clock = createBrowserClock()
  api.resetTraceApi()
  tracking.resetTracking()
  settings.setPollInterval(5000)
  let releaseOldSummary
  api.resetTraceApi({
    summary(jobId, call) {
      const summary = {
        schemaVersion: 1,
        executionTraceId: `job:${jobId}`,
        jobId,
        executionKind: 'challengeProof',
        job: { status: 'Running', errorCode: 'None', createdAtMs: 1, endedAtMs: null },
        references: { verified: null },
        progress: {},
        coverage: { reasons: [] },
        observedAtMs: 1,
      }
      if (jobId === 'old-job' && call === 2) {
        return new Promise(resolve => { releaseOldSummary = () => resolve({ ...summary, job: { ...summary.job, status: 'Failed' } }) })
      }
      return Promise.resolve(summary)
    },
  })
  const { app, jobIdRef, session } = await mountSession('old-job', { pollingProfile: 'adaptive' })

  try {
    await clock.advanceBy(1000)
    assert.equal(typeof releaseOldSummary, 'function')
    jobIdRef.value = 'new-job'
    await flush()
    assert.equal(session.state.jobId, 'new-job')
    assert.equal(session.state.summary.data?.jobId, 'new-job')
    assert.deepEqual(tracking.calls.releases, ['old-job'])
    releaseOldSummary()
    await flush()
    assert.equal(session.state.summary.data?.jobId, 'new-job')
    assert.equal(session.state.summary.data?.job.status, 'Running')
  } finally {
    app.unmount()
    await flush()
    clock.restore()
  }
})
test('failed resources back off without clearing Trace facts and retry within the capped delay', async () => {
  const clock = createBrowserClock()
  api.resetTraceApi({
    summary(jobId, call) {
      if (call <= 3) throw new Error('temporary Trace outage')
      return {
        schemaVersion: 1,
        executionTraceId: `job:${jobId}`,
        jobId,
        executionKind: 'challengeProof',
        job: { status: 'Running', errorCode: 'None', createdAtMs: 1, endedAtMs: null },
        references: { verified: null },
        progress: {},
        coverage: { reasons: [] },
        observedAtMs: 1,
      }
    },
  })
  tracking.resetTracking()
  settings.setPollInterval(60_000)
  const { app, session } = await mountSession('backoff-job', { pollingProfile: 'adaptive' })

  try {
    assert.equal(session.state.summary.data, null)
    assert.ok(session.state.summary.error)
    await clock.advanceBy(12_000)
    assert.equal(resourceCallCount('summary'), 1)
    await clock.advanceBy(12_000)
    assert.equal(resourceCallCount('summary'), 2)

    await clock.advanceBy(47_999)
    assert.equal(resourceCallCount('summary'), 2)
    await clock.advanceBy(1)
    assert.equal(resourceCallCount('summary'), 3)

    await clock.advanceBy(59_999)
    assert.equal(resourceCallCount('summary'), 3)
    await clock.advanceBy(1)
    assert.equal(resourceCallCount('summary'), 4)
    assert.equal(session.state.summary.error, null)
    assert.equal(session.state.summary.data?.jobId, 'backoff-job')
  } finally {
    app.unmount()
    clock.restore()
  }
})
