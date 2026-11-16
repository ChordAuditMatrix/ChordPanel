import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import * as vue from 'vue'

const root = process.cwd()
const settingsModuleId = '\0page-polling-test-settings'

// The polling composable reads settings.pollInterval and the app's real store
// touches localStorage at import time, so the test supplies a reactive stand-in
// that exposes the same useSettings() shape.
const settingsMock = {
  name: 'page-polling-test-settings',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:page-polling-test-settings') return settingsModuleId
  },
  load(id) {
    if (id === settingsModuleId) {
      return `
import { ref } from 'vue'
export const settings = ref({ pollInterval: 5000 })
export function setPollInterval(value) { settings.value.pollInterval = value }
export function useSettings() { return { settings } }
`
    }
  },
}

const vite = await createServer({
  configFile: false,
  root,
  plugins: [settingsMock],
  resolve: {
    alias: [
      { find: '@/stores/settings', replacement: 'virtual:page-polling-test-settings' },
      { find: '@', replacement: resolve(root, 'src') },
    ],
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const settings = await vite.ssrLoadModule('virtual:page-polling-test-settings')
const { setupGlobalPolling, usePagePolling } =
  await vite.ssrLoadModule('/src/composables/usePagePolling.ts')

const testApp = vue.createRenderer({
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
}).createApp

// Drain the promise chains behind invoke() plus any Vue watcher flush jobs.
async function flush() {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve()
    await vue.nextTick()
  }
}

function createClock() {
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const hadDocument = Object.hasOwn(globalThis, 'document')
  const originalDocument = globalThis.document
  let now = 0
  let nextTimerId = 1
  const timers = new Map()
  const listeners = new Map()

  const documentStub = {
    hidden: false,
    addEventListener(name, listener) {
      const current = listeners.get(name) ?? new Set()
      current.add(listener)
      listeners.set(name, current)
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener)
    },
    dispatch(name) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener()
    },
  }

  globalThis.document = documentStub
  globalThis.setInterval = (callback, delay = 0) => {
    const id = nextTimerId++
    const ms = Math.max(1, Number(delay) || 0)
    timers.set(id, { callback, ms, nextAt: now + ms })
    return id
  }
  globalThis.clearInterval = (id) => { timers.delete(id) }

  return {
    document: documentStub,
    get timerCount() { return timers.size },
    get intervalMs() { return [...timers.values()][0]?.ms ?? null },
    async advanceBy(duration) {
      const target = now + duration
      let fired = 0
      for (;;) {
        const next = [...timers.values()]
          .filter(timer => timer.nextAt <= target)
          .sort((left, right) => left.nextAt - right.nextAt)[0]
        if (!next) break
        assert.ok(fired++ < 1000, 'fake clock did not settle')
        now = next.nextAt
        next.nextAt = now + next.ms
        next.callback()
        await flush()
      }
      now = target
      await flush()
    },
    restore() {
      globalThis.setInterval = originalSetInterval
      globalThis.clearInterval = originalClearInterval
      if (hadDocument) globalThis.document = originalDocument
      else delete globalThis.document
    },
  }
}

/**
 * Mounts a component that mirrors AppLayout + a view: global polling is
 * installed with a fixed route and the page handler registers during setup, so
 * onMounted/onUnmounted and the route's handler set run through real Vue
 * lifecycle hooks.
 */
function mountPollingPage(handler, routePath) {
  const hostNode = { type: 'root', children: [], parent: null }
  const app = testApp({
    setup() {
      const { register } = usePagePolling()
      setupGlobalPolling(() => routePath)
      register(handler, routePath)
      return () => null
    },
  })
  app.mount(hostNode)

  let mounted = true
  return {
    unmount() {
      if (!mounted) return
      mounted = false
      app.unmount()
    },
  }
}

test('a pending async handler is not re-entered by later timer ticks', async () => {
  const clock = createClock()
  settings.setPollInterval(1000)
  const calls = []
  const pendingResolvers = []
  const handler = () => {
    calls.push('call')
    return new Promise((resolvePending) => { pendingResolvers.push(resolvePending) })
  }

  let page = null
  try {
    page = mountPollingPage(handler, '/polling/in-flight')
    await flush()
    assert.equal(calls.length, 1, 'registering a page fetches immediately')
    assert.equal(clock.timerCount, 1)
    assert.equal(clock.intervalMs, 1000)

    await clock.advanceBy(3000)
    assert.equal(calls.length, 1, 'an unresolved request blocks re-entry across several ticks')
    assert.equal(clock.timerCount, 1, 'the interval itself keeps running while the request is in flight')

    pendingResolvers.shift()()
    await flush()
    await clock.advanceBy(1000)
    assert.equal(calls.length, 2, 'polling resumes once the in-flight request settles')
  } finally {
    for (const resolvePending of pendingResolvers.splice(0)) resolvePending()
    await flush()
    page?.unmount()
    clock.restore()
  }
})

test('hiding the document pauses polling without tearing down the interval', async () => {
  const clock = createClock()
  settings.setPollInterval(500)
  const calls = []
  const handler = () => { calls.push('call') }

  let page = null
  try {
    page = mountPollingPage(handler, '/polling/hidden')
    await flush()
    assert.equal(calls.length, 1)

    clock.document.hidden = true
    clock.document.dispatch('visibilitychange')
    await flush()
    assert.equal(calls.length, 1, 'becoming hidden does not trigger an extra fetch')
    assert.equal(clock.timerCount, 1)

    await clock.advanceBy(2500)
    assert.equal(calls.length, 1, 'timer ticks are skipped while the document is hidden')
  } finally {
    page?.unmount()
    clock.restore()
  }
})

test('becoming visible refreshes immediately and resumes the cadence', async () => {
  const clock = createClock()
  settings.setPollInterval(1000)
  const calls = []
  const handler = () => { calls.push('call') }

  let page = null
  try {
    page = mountPollingPage(handler, '/polling/resume')
    await flush()
    assert.equal(calls.length, 1)

    clock.document.hidden = true
    clock.document.dispatch('visibilitychange')
    await clock.advanceBy(2000)
    assert.equal(calls.length, 1)

    clock.document.hidden = false
    clock.document.dispatch('visibilitychange')
    await flush()
    assert.equal(calls.length, 2, 'returning to the tab refreshes without waiting for the next tick')

    await clock.advanceBy(1000)
    assert.equal(calls.length, 3, 'scheduled polling continues after the resume refresh')
  } finally {
    page?.unmount()
    clock.restore()
  }
})

test('async handler rejections are logged and do not wedge later polls', async () => {
  const clock = createClock()
  settings.setPollInterval(1000)
  const failure = new Error('polling failed')
  const calls = []
  const handler = () => {
    calls.push('call')
    return calls.length === 1 ? Promise.reject(failure) : Promise.resolve()
  }
  const recorded = []
  const originalConsoleError = console.error
  console.error = (...args) => { recorded.push(args) }

  let page = null
  try {
    page = mountPollingPage(handler, '/polling/error')
    await flush()
    assert.equal(calls.length, 1)
    const reported = recorded.filter(args => args[0] === '[polling] handler error')
    assert.equal(reported.length, 1, 'the rejection is reported exactly once')
    assert.equal(reported[0][1], failure)

    await clock.advanceBy(1000)
    assert.equal(calls.length, 2, 'the in-flight guard is released after a rejection')
  } finally {
    console.error = originalConsoleError
    page?.unmount()
    clock.restore()
  }
})

test('unmounting stops polling and detaches the visibility listener', async () => {
  const clock = createClock()
  settings.setPollInterval(1000)
  const calls = []
  const handler = () => { calls.push('call') }

  let page = null
  try {
    page = mountPollingPage(handler, '/polling/unmount')
    await flush()
    assert.equal(calls.length, 1)

    page.unmount()
    page = null
    await flush()
    assert.equal(clock.timerCount, 0, 'the global interval is cleared on unmount')

    await clock.advanceBy(5000)
    assert.equal(calls.length, 1)
    clock.document.hidden = false
    clock.document.dispatch('visibilitychange')
    await flush()
    assert.equal(calls.length, 1, 'the visibility listener is detached on unmount')
  } finally {
    page?.unmount()
    clock.restore()
  }
})
