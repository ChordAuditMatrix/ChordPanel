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

const { createTraceGraphModel, createTraceGraphState } = await vite.ssrLoadModule(
  '/src/features/execution/data/traceGraphModel.ts',
)
const { useExecutionJobGraph } = await vite.ssrLoadModule(
  '/src/features/execution/useExecutionJobGraph.ts',
)

function harness(overrides = {}) {
  const calls = { first: 0, more: [], refresh: 0, opened: [] }
  const jobId = ref('job-1')
  const detail = ref({ flowId: 'flow-1' })
  const graph = createTraceGraphState('job-1')
  const session = {
    loadGraphFirstPage: async () => {
      calls.first += 1
      graph.loaded = true
      return { kind: 'read' }
    },
    loadGraphMore: async stream => {
      calls.more.push(stream)
      return { kind: 'read' }
    },
    refreshGraph: async () => {
      calls.refresh += 1
      return { kind: 'read' }
    },
  }
  const graphView = useExecutionJobGraph({
    jobId,
    jobDetail: computed(() => detail.value),
    graph,
    session,
    openRelatedJob: relatedJobId => { calls.opened.push(relatedJobId) },
    ...overrides,
  })
  return { calls, graph, jobId, detail, session, graphView }
}

function graphResponse(jobId) {
  const stream = (overrides = {}) => ({
    pageSize: '200',
    returned: '0',
    hasMore: false,
    nextCursor: null,
    mutableSource: false,
    coverage: 'complete',
    ...overrides,
  })
  return {
    schemaVersion: 1,
    executionTraceId: `job:${jobId}`,
    jobId,
    cursorConsistency: 'eventual',
    job: {
      nodeId: `job:${jobId}`,
      kind: 'job',
      jobId,
      status: 'Running',
      errorCode: 'None',
      terminal: false,
      createdAtMs: 100,
      statusSource: 'jobAggregate',
    },
    taskNodes: [],
    partNodes: [],
    activityNodes: [],
    activityEdges: [],
    observations: [],
    edges: [],
    triggerEdges: [],
    streams: {
      tasks: { ...stream(), referencesTotal: '0', referencesTracked: false },
      parts: { ...stream(), windowsMaterialized: false },
      observations: stream(),
      activities: stream(),
      edges: stream(),
      triggers: stream(),
    },
    taskReferenceCount: '0',
    hasMore: false,
    coverage: {
      job: 'complete',
      tasks: 'complete',
      parts: 'complete',
      observations: 'complete',
      activities: 'complete',
      edges: 'complete',
      triggers: 'complete',
      reasons: [],
    },
    provenance: {
      jobStatus: 'jobAggregate',
      taskMembership: 'jobAggregate.taskIds',
      taskStatus: 'taskRepository',
      parts: 'executionPartProjections',
      observations: 'executionObservations',
      activities: 'executionObservations.activity',
      activityParent: 'executionObservations.taskId',
      edges: 'executionLinks',
      notificationTriggers: 'sourceChangeNotifications.processingJobIds',
      taskReferencesTracked: false,
    },
  }
}

function deferredClient(page) {
  const gates = []
  let calls = 0
  return {
    gates,
    client: {
      getTraceGraph(jobId) {
        calls += 1
        if (calls === 1) return Promise.resolve(page(jobId))
        let resolve
        const promise = new Promise(done => { resolve = done })
        gates.push(resolve)
        return promise
      },
    },
  }
}

test('the graph stays closed and unread until the user opens it', () => {
  const { calls, graphView } = harness()
  assert.equal(graphView.graphVisible.value, false)
  assert.equal(graphView.graphProjection.value.nodes.length, 0)
  assert.equal(calls.first, 0)
})

test('opening the graph loads one first page and never duplicates it', async () => {
  const { calls, graph, graphView } = harness()
  graphView.showJobGraph()
  assert.equal(graphView.graphVisible.value, true)
  assert.equal(calls.first, 1)

  graph.loaded = true
  await graphView.loadJobGraph()
  assert.equal(calls.first, 1)

  graph.loaded = false
  graph.loading = true
  await graphView.loadJobGraph()
  assert.equal(calls.first, 1)

  graph.loading = false
  await graphView.loadJobGraph()
  assert.equal(calls.first, 2)
})

test('stream paging, refresh and related-job navigation forward only real intents', () => {
  const { calls, graphView } = harness()
  graphView.loadGraphStream('tasks')
  graphView.loadGraphStream('edges')
  graphView.refreshJobGraph()
  graphView.openRelatedJob('job-2')
  graphView.openRelatedJob('')

  assert.deepEqual(calls.more, ['tasks', 'edges'])
  assert.equal(calls.refresh, 1)
  assert.deepEqual(calls.opened, ['job-2'])
})

test('a Job change closes the graph and a missing flow stays unreported', () => {
  const { detail, graphView } = harness()
  graphView.showJobGraph()
  assert.equal(graphView.graphVisible.value, true)
  assert.equal(graphView.flowGraphId.value, 'flow-1')

  detail.value = null
  assert.equal(graphView.flowGraphId.value, null)

  graphView.resetJobGraph()
  assert.equal(graphView.graphVisible.value, false)
})

test('flow identity keeps loading, failure, absence and confirmed no-flow apart', () => {
  const loading = ref(true)
  const failed = ref(false)
  const harnessed = harness({
    jobDetailLoading: computed(() => loading.value),
    jobDetailFailed: computed(() => failed.value),
  })
  assert.equal(harnessed.graphView.flowIdentity.value.kind, 'detailLoading')
  loading.value = false
  harnessed.detail.value = null
  assert.equal(harnessed.graphView.flowIdentity.value.kind, 'detailMissing')
  failed.value = true
  assert.equal(harnessed.graphView.flowIdentity.value.kind, 'detailError')
  assert.equal(harnessed.graphView.flowGraphId.value, null)

  failed.value = false
  harnessed.detail.value = { flowId: '' }
  assert.equal(harnessed.graphView.flowIdentity.value.kind, 'noFlow')
  assert.equal(harnessed.graphView.flowGraphId.value, null)

  harnessed.detail.value = { flowId: 'flow-9' }
  assert.deepEqual(harnessed.graphView.flowIdentity.value, { kind: 'flow', flowId: 'flow-9' })
})

test('read stamps mark the local load and the later refresh of this Job', async () => {
  const graph = createTraceGraphState('job-1')
  const jobId = ref('job-1')
  const detail = ref({ flowId: 'flow-1' })
  const view = useExecutionJobGraph({
    jobId,
    jobDetail: computed(() => detail.value),
    graph,
    session: {
      loadGraphFirstPage: async () => {
        graph.loaded = true
        return { kind: 'read' }
      },
      loadGraphMore: async () => {
        graph.loaded = true
        return { kind: 'read' }
      },
      refreshGraph: async () => {
        graph.loaded = true
        return { kind: 'read' }
      },
    },
    openRelatedJob: () => {},
  })

  assert.equal(view.graphLoadedAtMs.value, null)
  await view.loadJobGraph()
  assert.notEqual(view.graphLoadedAtMs.value, null)
  assert.equal(view.graphRefreshedAtMs.value, null)

  view.refreshJobGraph()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.notEqual(view.graphRefreshedAtMs.value, null)
  assert.ok(view.graphRefreshedAtMs.value >= view.graphLoadedAtMs.value)

  view.loadGraphStream('edges')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.ok(view.graphRefreshedAtMs.value >= view.graphLoadedAtMs.value)

  view.resetJobGraph()
  assert.equal(view.graphLoadedAtMs.value, null)
  assert.equal(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphReadAtMs.value, null)
})

test('a failed refresh keeps the stamps of the last successful read', async () => {
  const graph = createTraceGraphState('job-1')
  const failure = new Error('graph refresh failed')
  const view = useExecutionJobGraph({
    jobId: ref('job-1'),
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: async () => {
        graph.loaded = true
        return { kind: 'read' }
      },
      loadGraphMore: async () => ({ kind: 'skipped' }),
      refreshGraph: async () => {
        graph.error = failure
        return { kind: 'failed', error: failure }
      },
    },
    openRelatedJob: () => {},
  })

  await view.loadJobGraph()
  const loadedAt = view.graphLoadedAtMs.value
  const readAt = view.graphReadAtMs.value
  assert.notEqual(loadedAt, null)
  assert.equal(view.graphRefreshedAtMs.value, null)

  view.refreshJobGraph()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphLoadedAtMs.value, loadedAt)
  assert.equal(view.graphReadAtMs.value, readAt)
})

test('a failed first page records no read time at all', async () => {
  const failure = new Error('offline')
  const graph = createTraceGraphState('job-1')
  const view = useExecutionJobGraph({
    jobId: ref('job-1'),
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: async () => ({ kind: 'failed', error: failure }),
      loadGraphMore: async () => ({ kind: 'skipped' }),
      refreshGraph: async () => ({ kind: 'skipped' }),
    },
    openRelatedJob: () => {},
  })

  await view.loadJobGraph()
  assert.equal(view.graphLoadedAtMs.value, null)
  assert.equal(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphReadAtMs.value, null)
})

test('a request with nothing left to read leaves the stamps untouched', async () => {
  const graph = createTraceGraphState('job-1')
  const view = useExecutionJobGraph({
    jobId: ref('job-1'),
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: async () => {
        graph.loaded = true
        return { kind: 'read' }
      },
      loadGraphMore: async () => ({ kind: 'skipped' }),
      refreshGraph: async () => ({ kind: 'skipped' }),
    },
    openRelatedJob: () => {},
  })

  await view.loadJobGraph()
  const loadedAt = view.graphLoadedAtMs.value

  view.loadGraphStream('edges')
  view.refreshJobGraph()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(view.graphLoadedAtMs.value, loadedAt)
  assert.equal(view.graphRefreshedAtMs.value, null)
})

test('a read reported for the Job that requested it never stamps the Job selected now', async () => {
  const graph = createTraceGraphState('job-1')
  const jobId = ref('job-1')
  let settleRefresh = null
  const view = useExecutionJobGraph({
    jobId,
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: async () => {
        graph.loaded = true
        return { kind: 'read' }
      },
      loadGraphMore: async () => ({ kind: 'skipped' }),
      refreshGraph: () => new Promise(resolve => { settleRefresh = resolve }),
    },
    openRelatedJob: () => {},
  })

  await view.loadJobGraph()
  assert.notEqual(view.graphLoadedAtMs.value, null)

  view.refreshJobGraph()
  jobId.value = 'job-2'
  graph.jobId = 'job-2'
  graph.loaded = false
  view.resetJobGraph()
  settleRefresh({ kind: 'read' })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(view.graphLoadedAtMs.value, null)
  assert.equal(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphReadAtMs.value, null)
})

test('a graph loaded before the first observed read keeps no invented load time', async () => {
  const graph = createTraceGraphState('job-1')
  graph.loaded = true
  const view = useExecutionJobGraph({
    jobId: ref('job-1'),
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: async () => ({ kind: 'read' }),
      loadGraphMore: async () => ({ kind: 'read' }),
      refreshGraph: async () => ({ kind: 'read' }),
    },
    openRelatedJob: () => {},
  })

  view.refreshJobGraph()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(view.graphLoadedAtMs.value, null)
  assert.notEqual(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphReadAtMs.value, view.graphRefreshedAtMs.value)
})

test('a failed refresh through the real model records no read time', async () => {
  const failure = new Error('graph refresh failed')
  const calls = []
  const client = {
    getTraceGraph(jobId) {
      calls.push(jobId)
      if (calls.length === 1) return Promise.resolve(graphResponse(jobId))
      return Promise.reject(failure)
    },
  }
  const graph = createTraceGraphState('job-1')
  const model = createTraceGraphModel(client, graph)
  const view = useExecutionJobGraph({
    jobId: ref('job-1'),
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: () => model.loadFirstPage(),
      loadGraphMore: stream => model.loadMore(stream),
      refreshGraph: () => model.refresh(),
    },
    openRelatedJob: () => {},
  })

  await view.loadJobGraph()
  const loadedAt = view.graphLoadedAtMs.value
  assert.notEqual(loadedAt, null)

  view.refreshJobGraph()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(graph.error, failure)
  assert.equal(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphLoadedAtMs.value, loadedAt)
})

test('a refresh superseded by a Job switch records no read time on either Job', async () => {
  const { gates, client } = deferredClient(graphResponse)
  const graph = createTraceGraphState('job-1')
  const model = createTraceGraphModel(client, graph)
  const jobId = ref('job-1')
  const view = useExecutionJobGraph({
    jobId,
    jobDetail: computed(() => ({ flowId: 'flow-1' })),
    graph,
    session: {
      loadGraphFirstPage: () => model.loadFirstPage(),
      loadGraphMore: stream => model.loadMore(stream),
      refreshGraph: () => model.refresh(),
    },
    openRelatedJob: () => {},
  })

  await view.loadJobGraph()
  assert.notEqual(view.graphLoadedAtMs.value, null)

  view.refreshJobGraph()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(gates.length, 1)

  jobId.value = 'job-2'
  model.setJobId('job-2')
  view.resetJobGraph()
  gates[0](graphResponse('job-1'))
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(view.graphLoadedAtMs.value, null)
  assert.equal(view.graphRefreshedAtMs.value, null)
  assert.equal(view.graphReadAtMs.value, null)
  assert.equal(graph.jobId, 'job-2')
  assert.equal(graph.loaded, false)
})
