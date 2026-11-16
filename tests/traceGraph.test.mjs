import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const requestModuleId = '\0trace-graph-request-recorder'

/**
 * Records every Trace request instead of opening a socket, so route construction
 * and query parameters are observable without a backend.
 */
const requestStub = {
  name: 'trace-graph-request-recorder',
  enforce: 'pre',
  resolveId(id) {
    if (id === './request') return requestModuleId
  },
  load(id) {
    if (id !== requestModuleId) return
    return `
      export const requests = []
      globalThis.__traceGraphRequests = requests
      export default {
        get(path, config) {
          requests.push({ path, config })
          return Promise.resolve({ path })
        },
      }
    `
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
const graphModule = await vite.ssrLoadModule('/src/features/execution/data/traceGraphModel.ts')
const flowModule = await vite.ssrLoadModule('/src/features/execution/data/traceFlowGraphModel.ts')
const projectionModule = await vite.ssrLoadModule('/src/features/execution/data/traceGraphProjection.ts')
const sessionModule = await vite.ssrLoadModule('/src/features/execution/data/traceSessionModel.ts')

const {
  createTraceGraphModel,
  createTraceGraphState,
  mergeGraphActivityPages,
} = graphModule
const { createTraceFlowGraphModel, createTraceFlowGraphState } = flowModule
const { projectTraceGraph } = projectionModule
const { createTraceSessionModel, createTraceSessionState } = sessionModule
const requests = globalThis.__traceGraphRequests

// ── Graph response builder ──
//
// The backend publishes no captured graph fixture yet, so these pages are built
// from the documented field list instead of copied from a real run.

const JOB_ID = 'job-1'
const JOB_REF = `job:${JOB_ID}`

function stream(overrides = {}) {
  return {
    pageSize: '100',
    returned: '0',
    hasMore: false,
    nextCursor: null,
    mutableSource: false,
    coverage: 'notInstrumented',
    ...overrides,
  }
}

function graphPage(overrides = {}) {
  return {
    schemaVersion: 1,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
    cursorConsistency: 'eventual',
    job: {
      nodeId: JOB_REF,
      kind: 'job',
      jobId: JOB_ID,
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
      tasks: stream(),
      parts: stream(),
      observations: stream(),
      activities: stream(),
      edges: stream(),
      triggers: stream(),
    },
    taskReferenceCount: '0',
    hasMore: false,
    coverage: {
      job: 'complete',
      tasks: 'notInstrumented',
      parts: 'notInstrumented',
      observations: 'notInstrumented',
      activities: 'notInstrumented',
      edges: 'notInstrumented',
      triggers: 'notInstrumented',
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
    ...overrides,
  }
}

function taskNode(referenceIndex, overrides = {}) {
  return {
    nodeId: `task:task-${referenceIndex}`,
    kind: 'task',
    taskId: `task-${referenceIndex}`,
    referenceIndex,
    referenceState: 'valid',
    status: 'Running',
    statusState: 'available',
    statusSource: 'taskRepository',
    remoteStopStatus: null,
    createdAtMs: 200,
    completedAtMs: null,
    ...overrides,
  }
}

function observation(observationId, recordedAtMs, overrides = {}) {
  return {
    schemaVersion: 1,
    observationId,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
    eventType: 'TagLayoutPlanningStarted',
    category: 'layout',
    phase: 'plan',
    source: { component: 'Admin', nodeId: null, quality: 'observed' },
    refs: {
      taskId: null,
      requestId: null,
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      attempt: null,
    },
    eventTimeMs: recordedAtMs,
    recordedAtMs,
    metrics: {},
    activity: null,
    coverage: 'complete',
    outcome: null,
    job: null,
    ...overrides,
  }
}

function activityNode(overrides = {}) {
  return {
    nodeId: `activity:${JOB_ID}:layout-1`,
    kind: 'activity',
    activityId: 'layout-1',
    activityKind: 'tagLayoutPlanning',
    lifecycle: 'started',
    state: 'started',
    terminal: false,
    conflicting: false,
    parentState: 'jobOnly',
    parentRef: { kind: 'job', ref: JOB_REF },
    taskId: null,
    requestId: null,
    remoteNodeId: null,
    nodeRole: 'Admin',
    algorithmId: null,
    category: 'layout',
    phase: 'plan',
    observationCount: '1',
    firstObservedAtMs: 10,
    lastObservedAtMs: 10,
    progress: null,
    ...overrides,
  }
}

function badRequest() {
  return Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400 },
  })
}

/** Stub client; a page entry that is an `Error` is thrown instead of returned. */
function stubClient(pages) {
  const calls = []
  return {
    calls,
    client: {
      async getTraceGraph(jobId, params) {
        calls.push({ jobId, params })
        const page = pages[Math.min(calls.length - 1, pages.length - 1)]
        if (page instanceof Error) throw page
        return typeof page === 'function' ? page(params, calls.length) : page
      },
    },
  }
}

// ── Wire vocabulary ──

test('graph request validation keeps every stream bound inside [1, 200]', () => {
  assert.deepEqual(trace.validateTraceGraphQuery({}), {})
  assert.deepEqual(
    trace.validateTraceGraphQuery({ pageSize: 200, taskPageSize: 1, triggerPageSize: 7 }),
    { pageSize: 200, taskPageSize: 1, triggerPageSize: 7 },
  )
  for (const key of ['pageSize', 'taskPageSize', 'partPageSize', 'observationPageSize', 'activityPageSize', 'edgePageSize', 'triggerPageSize']) {
    assert.throws(() => trace.validateTraceGraphQuery({ [key]: 0 }), RangeError)
    assert.throws(() => trace.validateTraceGraphQuery({ [key]: 201 }), RangeError)
    assert.throws(() => trace.validateTraceGraphQuery({ [key]: 1.5 }), RangeError)
  }
})

test('graph cursors stay opaque and empty tokens are omitted', () => {
  assert.deepEqual(
    trace.validateTraceGraphQuery({ taskCursor: '', observationCursor: 'opaque' }),
    { observationCursor: 'opaque' },
  )
  for (const key of ['taskCursor', 'partCursor', 'observationCursor', 'activityCursor', 'edgeCursor', 'triggerCursor']) {
    assert.throws(() => trace.validateTraceGraphQuery({ [key]: 'x'.repeat(8193) }), RangeError)
    assert.throws(() => trace.validateTraceGraphQuery({ [key]: 5 }), TypeError)
  }
  assert.equal(trace.validateTraceFlowId('flow-1'), 'flow-1')
  assert.equal(trace.validateTraceFlowId(undefined), undefined)
  assert.throws(() => trace.validateTraceFlowId(''), TypeError)
})

test('observation activity fields and appended vocabulary stay representable', () => {
  const activity = {
    id: 'layout-1',
    kind: 'sourceChangeLayout',
    lifecycle: 'progressed',
    progress: { current: '5', total: null, metric: 'tagCount' },
  }
  assert.equal(activity.kind, 'sourceChangeLayout')
  assert.equal(activity.lifecycle, 'progressed')

  for (const name of ['TaskStatusObserved', 'ChallengeRouteDispatchedToStorage', 'TagLayoutPlanningProgressed', 'SourceChangeLayoutStarted', 'SourceChangeLayoutCompleted', 'SourceChangeLayoutFailed']) {
    assert.ok(trace.TRACE_OBSERVATION_EVENT_TYPES.includes(name), `${name} must be known`)
    assert.equal(trace.isKnownTraceObservationEventType(name), true)
  }
  // Retired backend slots still exist in persisted documents.
  for (const name of ['MaintenanceRecoveryRequested', 'MaintenanceRecoveryRefused']) {
    assert.ok(trace.TRACE_OBSERVATION_EVENT_TYPES.includes(name), `${name} must survive as history`)
    assert.equal(trace.isKnownTraceObservationEventType(name), true)
  }
  assert.equal(trace.isKnownTraceObservationEventType('SomeFutureEvent'), false)
})

test('graph clients build the documented routes and parameters', async () => {
  requests.length = 0
  await trace.getTraceGraph('job 1', {
    pageSize: 5,
    partPageSize: 7,
    observationCursor: 'obs-cursor',
    triggerPageSize: 3,
  })
  assert.equal(requests[0].path, '/v1/jobs/job%201/trace/graph')
  assert.deepEqual(requests[0].config.params, {
    pageSize: 5,
    partPageSize: 7,
    triggerPageSize: 3,
    observationCursor: 'obs-cursor',
  })

  requests.length = 0
  await trace.getFlowTraceGraph('flow 2', { pageSize: 2, jobCursor: 'job-cursor' })
  assert.equal(requests[0].path, '/v1/flows/flow%202/trace/graph')
  assert.deepEqual(requests[0].config.params, { pageSize: 2, jobCursor: 'job-cursor' })

  await assert.rejects(trace.getTraceGraph('', {}), TypeError)
  await assert.rejects(trace.getFlowTraceGraph('', {}), TypeError)
  await assert.rejects(trace.getTraceGraph(JOB_ID, { pageSize: 0 }), RangeError)
})

// ── On-demand paging ──

test('the first load reads one bounded page per stream and never walks the graph', async () => {
  const { client, calls } = stubClient([
    graphPage({
      taskNodes: [taskNode(0)],
      observations: [observation('obs-1', 1000)],
      streams: {
        tasks: stream({ returned: '1', hasMore: true, nextCursor: 'task-cursor-2', mutableSource: true, coverage: 'partial' }),
        parts: stream({ coverage: 'complete' }),
        observations: stream({ returned: '1', hasMore: true, nextCursor: 'obs-cursor-2', coverage: 'partial' }),
        activities: stream({ hasMore: true, nextCursor: 'activity-cursor-2' }),
        edges: stream(),
        triggers: stream(),
      },
      hasMore: true,
    }),
  ])

  const model = createTraceGraphModel(client, createTraceGraphState(JOB_ID))
  await model.loadFirstPage()

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].params, { pageSize: 200 })
  assert.equal(model.state.loaded, true)
  assert.equal(model.state.loading, false)
  assert.equal(model.state.error, null)
  assert.equal(model.state.taskNodes.length, 1)
  assert.equal(model.state.streams.tasks.hasMore, true)
  assert.equal(model.state.streams.observations.coverage, 'partial')
})

test('loadMore continues exactly one stream and leaves other positions untouched', async () => {
  const { client, calls } = stubClient([
    graphPage({
      taskNodes: [taskNode(0)],
      observations: [observation('obs-1', 1000)],
      streams: {
        tasks: stream({ returned: '1', hasMore: true, nextCursor: 'task-cursor-2', mutableSource: true }),
        parts: stream(),
        observations: stream({ returned: '1', hasMore: true, nextCursor: 'obs-cursor-2' }),
        activities: stream(),
        edges: stream(),
        triggers: stream(),
      },
      hasMore: true,
    }),
    graphPage({
      observations: [observation('obs-2', 2000)],
      streams: {
        tasks: stream(),
        parts: stream(),
        // A continuation carries the stream's own next position.
        observations: stream({ returned: '1', hasMore: true, nextCursor: 'obs-cursor-3' }),
        activities: stream(),
        edges: stream(),
        triggers: stream(),
      },
      hasMore: true,
    }),
  ])

  const model = createTraceGraphModel(client, createTraceGraphState(JOB_ID))
  await model.loadFirstPage()
  const taskCursor = model.state.streams.tasks.nextCursor

  await model.loadMore('observations')

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].params, { pageSize: 200, observationCursor: 'obs-cursor-2' })
  assert.deepEqual(model.state.observations.map(item => item.observationId), ['obs-1', 'obs-2'])
  assert.equal(model.state.streams.observations.nextCursor, 'obs-cursor-3')
  // The untouched TASK position is still the one the first page stated.
  assert.equal(model.state.streams.tasks.nextCursor, taskCursor)
})

test('refresh continues append-only streams in one request and re-reads mutable ones', async () => {
  const { client, calls } = stubClient([
    graphPage({
      taskNodes: [taskNode(0)],
      observations: [observation('obs-1', 1000)],
      streams: {
        tasks: stream({ returned: '1', nextCursor: 'task-position-1', mutableSource: true, coverage: 'complete' }),
        parts: stream({ coverage: 'complete' }),
        observations: stream({ returned: '1', nextCursor: 'obs-position-1', coverage: 'complete' }),
        activities: stream({ nextCursor: 'activity-position-1' }),
        edges: stream({ nextCursor: 'edge-position-1' }),
        triggers: stream({ nextCursor: 'trigger-position-1' }),
      },
    }),
    graphPage({
      taskNodes: [taskNode(0, { status: 'Succeeded', completedAtMs: 3000 })],
      observations: [observation('obs-2', 4000)],
    }),
  ])

  const model = createTraceGraphModel(client, createTraceGraphState(JOB_ID))
  await model.loadFirstPage()
  await model.refresh()

  assert.deepEqual(calls[1].params, {
    pageSize: 200,
    observationCursor: 'obs-position-1',
    activityCursor: 'activity-position-1',
    edgeCursor: 'edge-position-1',
  })
  assert.equal(model.state.taskNodes.length, 1)
  assert.equal(model.state.taskNodes[0].status, 'Succeeded')
  assert.deepEqual(model.state.observations.map(item => item.observationId), ['obs-1', 'obs-2'])
})

test('refresh re-reads notification triggers because a retry rewrites currentAttempt', async () => {
  const trigger = (currentAttempt) => ({
    from: { kind: 'notification', ref: 'notification:n-1' },
    to: { kind: 'job', ref: JOB_REF },
    ownerId: 'owner-1',
    notificationId: 'n-1',
    attempt: 1,
    currentAttempt,
    receivedSourceDataRevision: '1',
    receivedAtMs: 900,
    updatedAtMs: 950,
    basis: 'persistedProcessingJobAssociation',
  })
  const { client, calls } = stubClient([
    graphPage({
      triggerEdges: [trigger(true)],
      streams: {
        tasks: stream({ mutableSource: true }),
        parts: stream(),
        observations: stream(),
        activities: stream(),
        edges: stream(),
        // The route states this stream is mutable; the model must not continue it.
        triggers: stream({ mutableSource: true, nextCursor: 'trigger-position-1' }),
      },
    }),
    graphPage({
      triggerEdges: [trigger(false)],
    }),
  ])

  const model = createTraceGraphModel(client, createTraceGraphState(JOB_ID))
  await model.loadFirstPage()
  assert.equal(model.state.triggerEdges[0].currentAttempt, true)

  await model.refresh()

  // No trigger cursor: the mutable stream is re-read from its first page.
  assert.equal(calls[1].params.triggerCursor, undefined)
  assert.equal(model.state.triggerEdges.length, 1)
  assert.equal(model.state.triggerEdges[0].currentAttempt, false)
})

test('a rejected cursor restarts only the stream that owned it', async () => {
  const { client, calls } = stubClient([
    graphPage({
      taskNodes: [taskNode(0)],
      observations: [observation('obs-1', 1000)],
      streams: {
        tasks: stream({ returned: '1', hasMore: true, nextCursor: 'task-cursor-2', mutableSource: true, coverage: 'partial' }),
        parts: stream(),
        observations: stream({ returned: '1', hasMore: true, nextCursor: 'obs-cursor-2', coverage: 'partial' }),
        activities: stream(),
        edges: stream({ hasMore: true, nextCursor: 'edge-cursor-2' }),
        triggers: stream(),
      },
      hasMore: true,
    }),
    // The stored Task cursor no longer names a position.
    badRequest(),
    graphPage({
      taskNodes: [taskNode(0, { status: 'Succeeded' })],
      streams: {
        tasks: stream({ returned: '1', hasMore: true, nextCursor: 'task-cursor-fresh', mutableSource: true }),
        parts: stream(),
        // A first page of the other streams; it must not replace their positions.
        observations: stream({ nextCursor: 'obs-page-1' }),
        activities: stream(),
        edges: stream({ nextCursor: 'edge-page-1' }),
        triggers: stream(),
      },
      hasMore: true,
    }),
  ])

  const model = createTraceGraphModel(client, createTraceGraphState(JOB_ID))
  await model.loadFirstPage()

  await model.loadMore('tasks')

  assert.equal(calls.length, 3)
  assert.deepEqual(calls[1].params, { pageSize: 200, taskCursor: 'task-cursor-2' })
  // The restart request carries no cursor at all.
  assert.deepEqual(calls[2].params, { pageSize: 200 })
  assert.equal(model.state.error, null)
  assert.equal(model.state.streams.tasks.nextCursor, 'task-cursor-fresh')
  // Only the rejected stream restarted: the other positions are still the ones
  // their own pages stated.
  assert.equal(model.state.streams.observations.nextCursor, 'obs-cursor-2')
  assert.equal(model.state.streams.edges.nextCursor, 'edge-cursor-2')
  // A restarted mutable stream drops its old rows instead of mixing positions.
  assert.equal(model.state.taskNodes.length, 1)
  assert.equal(model.state.taskNodes[0].status, 'Succeeded')
})

// ── Activity facts stay page-scoped ──

test('two pages of activity facts are kept apart and never combined into one span state', async () => {
  const { client } = stubClient([
    graphPage({
      activityNodes: [activityNode()],
      activityEdges: [{
        from: { kind: 'activity', ref: `activity:${JOB_ID}:layout-1` },
        to: { kind: 'job', ref: JOB_REF },
        parentState: 'jobOnly',
        basis: 'persistedObservationParent',
        confidence: 'exact',
      }],
      streams: {
        tasks: stream(),
        parts: stream(),
        observations: stream(),
        activities: stream({ returned: '1', hasMore: true, nextCursor: 'activity-cursor-2', coverage: 'partial' }),
        edges: stream(),
        triggers: stream(),
      },
      hasMore: true,
    }),
    graphPage({
      activityNodes: [activityNode({
        lifecycle: 'completed',
        state: 'succeeded',
        terminal: true,
        observationCount: '2',
        firstObservedAtMs: 11,
        lastObservedAtMs: 20,
        progress: { current: '5', total: null, metric: 'tagCount' },
      })],
      activityEdges: [{
        from: { kind: 'activity', ref: `activity:${JOB_ID}:layout-1` },
        to: { kind: 'job', ref: JOB_REF },
        parentState: 'jobOnly',
        basis: 'persistedObservationParent',
        confidence: 'exact',
      }],
      streams: {
        tasks: stream(),
        parts: stream(),
        observations: stream(),
        activities: stream({ returned: '1', hasMore: false, nextCursor: 'activity-cursor-3', coverage: 'complete' }),
        edges: stream(),
        triggers: stream(),
      },
    }),
  ])

  const model = createTraceGraphModel(client, createTraceGraphState(JOB_ID))
  await model.loadFirstPage()
  await model.loadMore('activities')

  assert.equal(model.state.activityPages.length, 2)
  const [first, second] = model.state.activityPages
  assert.equal(first.pageKey, 'first')
  assert.equal(first.continued, false)
  assert.equal(first.nodes[0].terminal, false)
  assert.equal(first.nodes[0].state, 'started')
  assert.equal(second.pageKey, 'activity-cursor-2')
  assert.equal(second.continued, true)
  assert.equal(second.nodes[0].terminal, true)
  assert.equal(second.nodes[0].state, 'succeeded')

  const projection = projectTraceGraph(model.state)
  assert.deepEqual(projection.activityPages.map(page => page.pageKey), ['first', 'activity-cursor-2'])
  assert.deepEqual(projection.activityPages.map(page => page.continued), [false, true])
  assert.equal(projection.activityPages[1].hasMore, false)
  assert.equal(projection.activityPages[0].nodeCount, 1)
  // The same span is rendered twice, once per page, each with its own facts.
  const activityRows = projection.nodes.filter(node => node.kind === 'activity')
  assert.equal(activityRows.length, 2)
  assert.deepEqual(activityRows.map(node => node.pageKey), ['first', 'activity-cursor-2'])
})

test('a page of activity facts replaces only its own position', () => {
  const page = (pageKey, node) => ({
    pageKey,
    continued: pageKey !== 'first',
    coverage: 'partial',
    nodes: [node],
    edges: [],
  })
  const existing = [page('first', activityNode())]
  const merged = mergeGraphActivityPages(existing, page('first', activityNode({ observationCount: '3' })))
  assert.equal(merged.length, 1)
  assert.equal(merged[0].nodes[0].observationCount, '3')

  const appended = mergeGraphActivityPages(merged, page('cursor-2', activityNode({ terminal: true })))
  assert.deepEqual(appended.map(item => item.pageKey), ['first', 'cursor-2'])
})

// ── Projection ──

test('the projection separates stored Links from derived associations', () => {
  const state = createTraceGraphState(JOB_ID)
  state.loaded = true
  state.job = graphPage().job
  state.taskNodes = [
    taskNode(0),
    taskNode(1, { nodeId: null, taskId: null, referenceState: 'empty', status: null, statusState: 'invalidReference', statusSource: null }),
  ]
  state.observations = [observation('obs-1', 1000)]
  state.activityPages = [{
    pageKey: 'first',
    continued: false,
    coverage: 'partial',
    nodes: [activityNode()],
    edges: [{
      from: { kind: 'activity', ref: `activity:${JOB_ID}:layout-1` },
      to: { kind: 'job', ref: JOB_REF },
      parentState: 'jobOnly',
      basis: 'persistedObservationParent',
      confidence: 'exact',
    }],
  }]
  state.edges = [
    {
      jobId: JOB_ID,
      linkKey: 'link-1',
      linkKind: 'jobParentChild',
      matchBasis: 'jobMetadata',
      confidence: 'exact',
      sourceQuality: 'observed',
      sourceRef: 'task:task-1',
      taskId: 'task-1',
      nodeId: null,
      originNodeId: null,
      requestId: null,
      dispatchPacketId: null,
      correlationId: null,
      peerConversationId: null,
      operationId: null,
      relatedJobId: null,
      attempt: null,
      observedAtMs: 1500,
      from: { kind: 'task', ref: 'task:task-1' },
      to: { kind: 'job', ref: JOB_REF },
    },
  ]
  state.triggerEdges = [
    {
      from: { kind: 'notification', ref: 'notification:n-1' },
      to: { kind: 'job', ref: JOB_REF },
      ownerId: 'owner-1',
      notificationId: 'n-1',
      attempt: 1,
      currentAttempt: true,
      receivedSourceDataRevision: '7',
      receivedAtMs: 900,
      updatedAtMs: 950,
      basis: 'persistedProcessingJobAssociation',
    },
  ]
  state.coverage = {
    job: 'complete',
    tasks: 'partial',
    parts: 'complete',
    observations: 'complete',
    activities: 'partial',
    edges: 'complete',
    triggers: 'notInstrumented',
    reasons: ['SourceRecordUnavailable'],
  }
  state.streams.edges = { ...state.streams.edges, coverage: 'complete' }
  state.streams.activities = { ...state.streams.activities, coverage: 'partial', hasMore: true }
  state.streams.triggers = { ...state.streams.triggers, coverage: 'notInstrumented' }

  const projection = projectTraceGraph(state)
  assert.equal(projection.complete, false)
  assert.deepEqual(projection.gaps.map(gap => gap.scope), ['tasks', 'activities', 'triggers'])
  assert.deepEqual(projection.reasons, ['SourceRecordUnavailable'])
  assert.equal(projection.activityPages[0].hasMore, true)

  const linkEdges = projection.edges.filter(edge => edge.kind === 'link')
  assert.equal(linkEdges.length, 1)
  assert.equal(linkEdges[0].persistedLink, true)
  assert.equal(linkEdges[0].linkKey, 'link-1')
  assert.equal(linkEdges[0].pageKey, null)

  const derived = projection.edges.filter(edge => edge.kind !== 'link')
  assert.equal(derived.length, 2)
  assert.ok(derived.every(edge => edge.persistedLink === false))
  assert.ok(derived.every(edge => edge.linkKey === null))

  const activityEdge = derived.find(edge => edge.kind === 'activityParent')
  assert.equal(activityEdge.coverage, 'partial')
  assert.equal(activityEdge.pageKey, 'first')
  assert.equal(activityEdge.from.ref, `activity:${JOB_ID}:layout-1`)
  assert.equal(activityEdge.to.ref, JOB_REF)

  const triggerEdge = derived.find(edge => edge.kind === 'notificationTrigger')
  assert.equal(triggerEdge.coverage, 'notInstrumented')
  assert.equal(triggerEdge.from.ref, 'notification:n-1')

  // An empty persisted reference has no identity and never gets a synthetic one.
  const taskNodes = projection.nodes.filter(node => node.kind === 'task')
  assert.equal(taskNodes[1].ref, null)
})

// ── Flow graph paging ──

function flowPage(overrides = {}) {
  return {
    schemaVersion: 1,
    flowId: 'flow-1',
    cursorConsistency: 'eventual',
    jobNodes: [],
    parentEdges: [],
    pageSize: '100',
    returned: '0',
    hasMore: false,
    nextCursor: null,
    coverage: 'notInstrumented',
    reasons: [],
    provenance: {
      flowMembership: 'jobAggregate.flowId',
      jobStatus: 'jobAggregate',
      parentEdges: 'jobAggregate.parentJobId',
    },
    ...overrides,
  }
}

function flowNode(jobId, overrides = {}) {
  return {
    nodeId: `job:${jobId}`,
    kind: 'job',
    jobId,
    flowId: 'flow-1',
    parentJobId: null,
    jobOperation: 'TagGeneration',
    status: 'Running',
    errorCode: 'None',
    terminal: false,
    createdAtMs: 100,
    revision: '3',
    statusSource: 'jobAggregate',
    ...overrides,
  }
}

test('a flow page is a cursor position, not a Job graph', async () => {
  const calls = []
  const pages = [
    flowPage({
      jobNodes: [flowNode('job-1'), flowNode('job-2', { parentJobId: 'job-1' })],
      parentEdges: [{
        from: { kind: 'job', ref: 'job:job-2' },
        to: { kind: 'job', ref: 'job:job-1' },
        kind: 'jobParent',
        basis: 'jobAggregate.parentJobId',
      }],
      pageSize: '2',
      returned: '2',
      hasMore: true,
      nextCursor: 'flow-cursor-2',
      coverage: 'partial',
      reasons: ['SourceRecordUnavailable'],
    }),
    flowPage({
      jobNodes: [flowNode('job-2', { parentJobId: 'job-1', status: 'Succeeded', terminal: true }), flowNode('job-3', { parentJobId: 'job-9' })],
      pageSize: '2',
      returned: '2',
      coverage: 'complete',
    }),
  ]
  const client = {
    async getFlowTraceGraph(flowId, params) {
      calls.push({ flowId, params })
      return pages[Math.min(calls.length - 1, pages.length - 1)]
    },
  }

  const model = createTraceFlowGraphModel(client, createTraceFlowGraphState('flow-1'))
  await model.load()
  assert.deepEqual(calls[0].params, { pageSize: 200, jobCursor: undefined })
  assert.equal(model.state.hasMore, true)
  assert.equal(model.state.nextCursor, 'flow-cursor-2')
  assert.equal(model.state.coverage, 'partial')

  await model.loadMore()
  assert.deepEqual(calls[1].params, { pageSize: 200, jobCursor: 'flow-cursor-2' })
  assert.deepEqual(model.state.jobNodes.map(node => node.jobId), ['job-1', 'job-2', 'job-3'])
  assert.equal(model.state.jobNodes[1].status, 'Succeeded')
  assert.equal(model.state.hasMore, false)
  assert.deepEqual(model.state.reasons, [])
  // A parent outside the page produces no edge; only the in-page edge is drawn.
  assert.equal(model.state.parentEdges.length, 1)

  await model.loadMore()
  assert.equal(calls.length, 2)
})

test('refresh keeps every loaded flow page and updates the visible graph', async () => {
  const calls = []
  const pages = [
    flowPage({
      jobNodes: [flowNode('job-1')],
      pageSize: '1',
      returned: '1',
      hasMore: true,
      nextCursor: 'c2',
    }),
    flowPage({
      jobNodes: [flowNode('job-2', { parentJobId: 'job-1' })],
      pageSize: '1',
      returned: '1',
      hasMore: true,
      nextCursor: 'c3',
    }),
    flowPage({
      jobNodes: [flowNode('job-1', { status: 'Succeeded', terminal: true })],
      pageSize: '1',
      returned: '1',
      hasMore: true,
      nextCursor: 'refresh-c2',
    }),
    flowPage({
      jobNodes: [flowNode('job-2', { parentJobId: 'job-1', status: 'Succeeded', terminal: true })],
      pageSize: '1',
      returned: '1',
      coverage: 'complete',
    }),
  ]
  const model = createTraceFlowGraphModel({
    async getFlowTraceGraph(_flowId, params) {
      calls.push(params.jobCursor ?? null)
      return pages.shift()
    },
  }, createTraceFlowGraphState('flow-1'), { pageSize: 1 })

  await model.load()
  await model.loadMore()
  await model.load()

  assert.deepEqual(calls, [null, 'c2', null, 'refresh-c2'])
  assert.deepEqual(model.state.jobNodes.map(node => node.jobId), ['job-1', 'job-2'])
  assert.ok(model.state.jobNodes.every(node => node.status === 'Succeeded'))
  assert.equal(model.state.hasMore, false)
  model.dispose()
})

test('a flow read reports whether it read, failed or had nothing to read', async () => {
  const failure = new Error('flow refresh failed')
  const calls = []
  const client = {
    async getFlowTraceGraph(flowId, params) {
      calls.push({ flowId, params })
      if (calls.length === 1) return flowPage()
      throw failure
    },
  }
  const model = createTraceFlowGraphModel(client, createTraceFlowGraphState('flow-1'))

  await model.loadMore()
  assert.equal(calls.length, 0, 'a flow with no first page has nothing to continue')

  assert.deepEqual(await model.load(), { kind: 'read' })
  assert.deepEqual(await model.loadMore(), { kind: 'skipped' })
  assert.equal(calls.length, 1)

  assert.deepEqual(await model.load(), { kind: 'failed', error: failure })
  assert.equal(model.state.error, failure)
  assert.equal(model.state.loaded, true)
})

test('a flow request superseded by a flow change settles stale without applying its page', async () => {
  let resolvePage
  let calls = 0
  const client = {
    getFlowTraceGraph() {
      calls += 1
      if (calls === 1) return Promise.resolve(flowPage())
      return new Promise(resolve => { resolvePage = resolve })
    },
  }
  const model = createTraceFlowGraphModel(client, createTraceFlowGraphState('flow-1'))
  await model.load()

  const pending = model.load()
  await new Promise(resolve => setTimeout(resolve, 0))
  model.setFlowId('flow-2')
  resolvePage(flowPage())

  assert.deepEqual(await pending, { kind: 'stale' })
  assert.equal(model.state.flowId, 'flow-2')
  assert.equal(model.state.loaded, false)
})

// ── Trace session integration ──

function sessionClient(overrides = {}) {
  const graphCalls = []
  return {
    graphCalls,
    client: {
      async getTraceSummary() { throw new Error('summary not configured') },
      async getTraceObservations() { return { items: [], nextCursor: null, hasMore: false, cursorConsistency: 'eventual' } },
      async getTraceParts() { return { items: [], total: 0, page: 1, pageSize: 200, hasMore: false, coverage: 'notInstrumented' } },
      async getTraceLinks() { return { items: [], total: 0, page: 1, pageSize: 200, hasMore: false } },
      async getTraceProtocol() { return { items: [], nextCursor: null, hasMore: false, coverage: 'notInstrumented', reasons: [] } },
      async getTraceGraph(jobId, params) {
        graphCalls.push({ jobId, params })
        return graphPage()
      },
      ...overrides,
    },
  }
}

test('the session exposes an opt-in, page-stepped graph slice', async () => {
  const { client, graphCalls } = sessionClient()
  const state = createTraceSessionState(JOB_ID)
  const model = createTraceSessionModel(client, state, { silent: true })

  await model.loadGraphFirstPage()
  assert.equal(graphCalls.length, 1)
  assert.equal(state.graph.loaded, true)
  assert.equal(state.graph.job.jobId, JOB_ID)

  assert.deepEqual(await model.loadGraphMore('tasks'), { kind: 'skipped' })
  // Nothing to continue on this page: the stream reported no further rows.
  assert.equal(graphCalls.length, 1)

  // The default poll never touches the graph route.
  await model.poll()
  assert.equal(graphCalls.length, 1)

  const result = await model.poll({ graph: true })
  assert.equal(result.graphRefreshed, true)
  assert.equal(graphCalls.length, 2)

  const graphState = state.graph
  model.setJobId('job-2')
  assert.equal(state.graph, graphState)
  assert.equal(graphState.jobId, 'job-2')
  assert.equal(graphState.loaded, false)

  model.dispose()
})

test('a session without a graph client keeps the graph slice inert', async () => {
  const { client, graphCalls } = sessionClient()
  delete client.getTraceGraph
  const state = createTraceSessionState(JOB_ID)
  const model = createTraceSessionModel(client, state, { silent: true })

  assert.deepEqual(await model.loadGraphFirstPage(), { kind: 'skipped' })
  await model.loadGraphMore('tasks')
  await model.refreshGraph()
  assert.equal(graphCalls.length, 0)
  assert.equal(state.graph.loaded, false)
  model.dispose()
})
