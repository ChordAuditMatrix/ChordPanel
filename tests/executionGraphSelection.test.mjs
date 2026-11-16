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

const { layoutTraceGraphCanvas } = await vite.ssrLoadModule(
  '/src/features/execution/data/traceGraphCanvasLayout.ts',
)
const { describeTraceGraphNode, traceGraphEvidenceKey } = await vite.ssrLoadModule(
  '/src/features/execution/data/traceGraphNodeDetail.ts',
)
const { buildTraceFlowGraphNavigation, findTraceFlowGraphNodeNavigation } = await vite.ssrLoadModule(
  '/src/features/execution/data/traceFlowGraphNavigation.ts',
)
const { resolveExecutionFlowIdentity } = await vite.ssrLoadModule(
  '/src/features/execution/data/executionFlowIdentity.ts',
)

const JOB_REF = 'job:job-1'
const TASK_REF = 'task:task-0'
let edgeSequence = 0

function projectedEdge(overrides = {}) {
  return {
    id: `edge-${++edgeSequence}`,
    kind: 'link',
    from: { kind: 'job', ref: JOB_REF },
    to: { kind: 'job', ref: JOB_REF },
    persistedLink: true,
    confidence: 'exact',
    coverage: 'complete',
    linkKey: `link-${edgeSequence}`,
    pageKey: null,
    ...overrides,
  }
}

function jobNode() {
  return {
    kind: 'job',
    ref: { kind: 'job', ref: JOB_REF },
    job: {
      nodeId: JOB_REF,
      kind: 'job',
      jobId: 'job-1',
      status: 'Running',
      errorCode: 'None',
      terminal: false,
      createdAtMs: 1,
      statusSource: 'jobAggregate',
    },
  }
}

function taskNode(index, overrides = {}) {
  return {
    kind: 'task',
    ref: { kind: 'task', ref: `task:task-${index}` },
    task: {
      nodeId: `task:task-${index}`,
      kind: 'task',
      taskId: `task-${index}`,
      referenceIndex: index,
      referenceState: 'valid',
      status: 'Succeeded',
      statusState: 'available',
      statusSource: 'taskRepository',
      remoteStopStatus: null,
      createdAtMs: 1,
      completedAtMs: 2,
      ...overrides,
    },
  }
}

function partNode(overrides = {}) {
  return {
    kind: 'part',
    ref: { kind: 'part', ref: 'part:job-1:0' },
    part: {
      nodeId: 'part:job-1:0',
      kind: 'part',
      jobId: 'job-1',
      partIndex: 0,
      attempt: null,
      state: 'generated',
      coverage: 'complete',
      ranges: [],
      plannedBlockCount: '8',
      generatedBlockCount: '8',
      storageAccountedTagCount: '8',
      updatedAtMs: 2,
      generateTaskRef: { kind: 'task', ref: TASK_REF },
      ...overrides,
    },
  }
}

function activityNode(pageKey, activityId) {
  return {
    kind: 'activity',
    ref: { kind: 'activity', ref: `activity:job-1:${activityId}` },
    pageKey,
    activity: {
      nodeId: `activity:job-1:${activityId}`,
      kind: 'activity',
      activityId,
      activityKind: 'tagLayoutPlanning',
      lifecycle: 'completed',
      state: 'succeeded',
      terminal: true,
      conflicting: false,
      parentState: 'taskObserved',
      parentRef: { kind: 'task', ref: TASK_REF },
      taskId: 'task-0',
      requestId: null,
      remoteNodeId: 'Admin-1',
      nodeRole: 'Admin',
      algorithmId: null,
      category: 'layout',
      phase: 'plan',
      observationCount: '1',
      firstObservedAtMs: 1,
      lastObservedAtMs: 2,
      progress: null,
    },
  }
}

function graphProjection(nodes, edges) {
  return {
    job: null,
    nodes,
    edges,
    activityPages: [],
    gaps: [],
    reasons: [],
    complete: true,
  }
}

const PROVENANCE = {
  jobStatus: 'jobAggregate',
  taskMembership: 'taskBook',
  taskStatus: 'taskRepository',
  parts: 'partProjection',
  observations: 'observed',
  activities: 'observed',
  activityParent: 'observed',
  edges: 'linkStore',
  notificationTriggers: 'notificationStore',
  taskReferencesTracked: true,
}

test('a selected node states its source, status evidence and drawn relations', () => {
  const projection = graphProjection(
    [jobNode(), taskNode(0), partNode()],
    [
      projectedEdge({ id: 'job-task0', from: { kind: 'job', ref: JOB_REF }, to: { kind: 'task', ref: TASK_REF } }),
      projectedEdge({
        id: 'job-notification',
        kind: 'notificationTrigger',
        persistedLink: false,
        linkKey: null,
        confidence: null,
        from: { kind: 'notification', ref: 'notification:n-1' },
        to: { kind: 'job', ref: JOB_REF },
      }),
    ],
  )
  const layout = layoutTraceGraphCanvas(projection)

  const task = describeTraceGraphNode(layout, 'row:task:0', PROVENANCE)
  assert.equal(task.identity, TASK_REF)
  assert.equal(task.incomingCount, 2)
  assert.equal(task.outgoingCount, 0)
  assert.equal(task.provenanceField, 'taskStatus')
  assert.equal(task.provenanceValue, 'taskRepository')
  assert.equal(task.evidenceTarget, 'task')
  assert.equal(task.evidenceKey, 'task:0')
  assert.deepEqual(
    task.relations.map(relation => relation.family).sort(),
    ['link', 'partTaskRef'],
  )

  const job = describeTraceGraphNode(layout, 'row:job:job:job-1', PROVENANCE)
  assert.equal(job.outgoingCount, 1)
  assert.equal(job.incomingCount, 1)
  assert.equal(job.provenanceField, 'jobStatus')
  assert.equal(job.evidenceTarget, null)
  assert.equal(job.evidenceKey, null)

  const notification = layout.nodes.find(node => node.kind === 'notification')
  const endpointDetail = describeTraceGraphNode(layout, notification.id, PROVENANCE)
  assert.equal(endpointDetail.node.resolution, 'endpointOnly')
  assert.equal(endpointDetail.evidenceTarget, null)
  assert.equal(endpointDetail.provenanceField, null)
})

test('unresolved and folded relations are reported on the node they name', () => {
  const projection = graphProjection(
    [jobNode(), taskNode(0)],
    [
      projectedEdge({
        id: 'job-child',
        from: { kind: 'job', ref: JOB_REF },
        to: { kind: 'job', ref: 'job:child-1' },
      }),
      // A drawn relation the Task group can fold; folding it must not turn the
      // unloaded Job endpoint above into a drawn or a folded relation.
      projectedEdge({
        id: 'job-task0',
        from: { kind: 'job', ref: JOB_REF },
        to: { kind: 'task', ref: TASK_REF },
      }),
    ],
  )
  const layout = layoutTraceGraphCanvas(projection)
  const job = describeTraceGraphNode(layout, 'row:job:job:job-1', PROVENANCE)
  assert.equal(job.unresolvedRelations.length, 1)
  assert.equal(job.unresolvedRelations[0].reason, 'endpointNotLoaded')
  assert.equal(job.relations.length, 1)
  assert.equal(job.relations[0].family, 'link')

  const foldedLayout = layoutTraceGraphCanvas(projection, { collapsed: ['task'] })
  const foldedJob = describeTraceGraphNode(foldedLayout, 'row:job:job:job-1', PROVENANCE)
  assert.equal(foldedJob.foldedRelations.length, 1)
  assert.equal(foldedJob.foldedRelations[0].family, 'link')
  // The folded relation is not an unresolved relation and is not a drawn one.
  assert.equal(foldedJob.unresolvedRelations.length, 1)
  assert.equal(foldedJob.relations.length, 0)
})

test('activity and part evidence keys stay page- and identity-scoped', () => {
  assert.equal(traceGraphEvidenceKey(partNode()), 'part:part:job-1:0')
  assert.equal(
    traceGraphEvidenceKey(activityNode('first', 'act-1')),
    'activity:first:activity:job-1:act-1',
  )
  assert.equal(traceGraphEvidenceKey(activityNode('cursor-2', 'act-1')), 'activity:cursor-2:activity:job-1:act-1')
  assert.equal(traceGraphEvidenceKey(jobNode()), null)
})

function flowNode(jobId, overrides = {}) {
  return {
    nodeId: `job:${jobId}`,
    kind: 'job',
    jobId,
    flowId: 'flow-1',
    parentJobId: null,
    jobOperation: 'TagGeneration',
    status: 'Succeeded',
    errorCode: 'None',
    terminal: true,
    createdAtMs: 1,
    revision: '1',
    statusSource: 'jobAggregate',
    ...overrides,
  }
}

function flowEdge(from, to) {
  return {
    from: { kind: 'job', ref: `job:${from}` },
    to: { kind: 'job', ref: `job:${to}` },
    kind: 'jobParent',
    basis: 'jobAggregate.parentJobId',
  }
}

test('flow navigation separates a persisted parent field from a page-returned edge', () => {
  const navigation = buildTraceFlowGraphNavigation(
    [
      flowNode('a'),
      flowNode('b', { parentJobId: 'a' }),
      flowNode('c', { parentJobId: 'b' }),
      flowNode('d', { parentJobId: 'outside' }),
      flowNode('e', { parentJobId: 'a' }),
    ],
    [flowEdge('a', 'b')],
  )

  const a = findTraceFlowGraphNodeNavigation(navigation, 'a')
  assert.deepEqual(a.childJobIds.sort(), ['b', 'e'])
  assert.deepEqual(a.childRelationJobIds, ['b'])
  assert.deepEqual(a.childFieldOnlyJobIds, ['e'])
  assert.equal(a.parentJobId, null)

  const b = findTraceFlowGraphNodeNavigation(navigation, 'b')
  assert.equal(b.parentJobId, 'a')
  assert.equal(b.parentLoaded, true)
  assert.equal(b.parentRelationProven, true)
  assert.deepEqual(b.childFieldOnlyJobIds, ['c'])

  const c = findTraceFlowGraphNodeNavigation(navigation, 'c')
  assert.equal(c.parentLoaded, true)
  assert.equal(c.parentRelationProven, false)

  const d = findTraceFlowGraphNodeNavigation(navigation, 'd')
  assert.equal(d.parentLoaded, false)
  assert.equal(navigation.parentOutsideLoadedCount, 1)
  assert.equal(findTraceFlowGraphNodeNavigation(navigation, 'missing'), null)
})

test('flow identity separates loading, failure, absence and a confirmed no-flow Job', () => {
  assert.equal(
    resolveExecutionFlowIdentity({ jobDetail: { flowId: 'f' }, detailLoading: true, detailFailed: false }).kind,
    'detailLoading',
  )
  assert.equal(
    resolveExecutionFlowIdentity({ jobDetail: null, detailLoading: false, detailFailed: true }).kind,
    'detailError',
  )
  assert.equal(
    resolveExecutionFlowIdentity({ jobDetail: null, detailLoading: false, detailFailed: false }).kind,
    'detailMissing',
  )
  assert.equal(
    resolveExecutionFlowIdentity({ jobDetail: { flowId: '   ' }, detailLoading: false, detailFailed: false }).kind,
    'noFlow',
  )
  assert.equal(
    resolveExecutionFlowIdentity({ jobDetail: {}, detailLoading: false, detailFailed: false }).kind,
    'noFlow',
  )
  const flow = resolveExecutionFlowIdentity({
    jobDetail: { flowId: ' flow-1 ' },
    detailLoading: false,
    detailFailed: false,
  })
  assert.deepEqual(flow, { kind: 'flow', flowId: 'flow-1' })
})
