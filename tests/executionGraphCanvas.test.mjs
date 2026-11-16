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

const canvasModule = await vite.ssrLoadModule(
  '/src/features/execution/data/traceGraphCanvasLayout.ts',
)
const flowModule = await vite.ssrLoadModule(
  '/src/features/execution/data/traceFlowGraphLayout.ts',
)
const { layoutTraceGraphCanvas } = canvasModule
const { layoutTraceFlowGraphCanvas } = flowModule

const JOB_REF = 'job:job-1'
const TASK_REF = 'task:task-1'
let projectedEdgeSequence = 0

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
      generateTaskRef: { kind: 'task', ref: 'task:task-0' },
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
      parentRef: { kind: 'task', ref: 'task:task-0' },
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

function projectedEdge(overrides = {}) {
  return {
    id: `edge-${++projectedEdgeSequence}`,
    kind: 'link',
    from: { kind: 'job', ref: JOB_REF },
    to: { kind: 'job', ref: JOB_REF },
    persistedLink: true,
    confidence: 'exact',
    coverage: 'complete',
    linkKey: 'link-1',
    pageKey: null,
    ...overrides,
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

function nodeById(layout, id) {
  const node = layout.nodes.find(candidate => candidate.id === id)
  assert.ok(node, `missing node ${id}`)
  return node
}

test('the canvas maps every projected node kind to its own lane', () => {
  const projection = graphProjection(
    [
      jobNode(),
      taskNode(0),
      { ...taskNode(1), ref: null, task: { ...taskNode(1).task, nodeId: null, taskId: null, referenceState: 'empty', status: null, statusState: 'invalidReference', statusSource: null } },
      partNode(),
      activityNode('first', 'act-1'),
      activityNode('cursor-2', 'act-1'),
    ],
    [],
  )

  const layout = layoutTraceGraphCanvas(projection)
  const lanes = new Map(layout.nodes.map(node => [node.id, node.lane]))

  assert.equal(lanes.get('row:job:job:job-1'), 'job')
  assert.equal(lanes.get('row:task:0'), 'task')
  assert.equal(lanes.get('row:task:1'), 'task')
  assert.equal(lanes.get('row:part:part:job-1:0'), 'part')
  assert.equal(lanes.get('row:activity:first:activity:job-1:act-1'), 'activity')
  assert.equal(lanes.get('row:activity:cursor-2:activity:job-1:act-1'), 'activity')

  // An empty reference stays a Task row without a synthetic identity.
  const emptyTask = nodeById(layout, 'row:task:1')
  assert.equal(emptyTask.ref, null)
  assert.equal(emptyTask.resolution, 'loaded')

  // The same activity identity on two pages stays two page-scoped rows.
  const activityRows = layout.nodes.filter(node => node.kind === 'activity')
  assert.equal(activityRows.length, 2)
  assert.deepEqual(activityRows.map(node => node.pageKey).sort(), ['cursor-2', 'first'])
  assert.equal(new Set(layout.nodes.map(node => node.id)).size, layout.nodes.length)
  assert.ok(layout.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)))
  assert.ok(layout.width > 0 && layout.height > 0)
  const nodeIds = new Set(layout.nodes.map(node => node.id))
  for (const edge of layout.edges) {
    assert.ok(nodeIds.has(edge.from), `edge ${edge.id} source must be a drawn node`)
    assert.ok(nodeIds.has(edge.to), `edge ${edge.id} target must be a drawn node`)
    assert.match(edge.path, /^M /)
  }
})

test('relation families keep their backend evidence and never become Link rows', () => {
  const projection = graphProjection(
    [jobNode(), taskNode(0), taskNode(1), partNode(), activityNode('first', 'act-1')],
    [
      projectedEdge({
        id: 'link-1',
        from: { kind: 'task', ref: TASK_REF },
        to: { kind: 'node', ref: 'node:Storage-1' },
        linkKey: 'link-1',
      }),
      projectedEdge({
        id: 'activity-1',
        kind: 'activityParent',
        persistedLink: false,
        linkKey: null,
        pageKey: 'first',
        from: { kind: 'task', ref: TASK_REF },
        to: { kind: 'activity', ref: 'activity:job-1:act-1' },
      }),
      projectedEdge({
        id: 'trigger-1',
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
  const link = layout.edges.find(edge => edge.id === 'link-1')
  const activity = layout.edges.find(edge => edge.id === 'activity-1')
  const trigger = layout.edges.find(edge => edge.id === 'trigger-1')
  const partTask = layout.edges.find(edge => edge.family === 'partTaskRef')

  assert.equal(link.family, 'link')
  assert.equal(link.evidence, 'persisted')
  assert.equal(link.persistedLink, true)

  // `node:` is an explicit endpoint kind without a node stream; it is drawn as
  // endpoint-only evidence, never as a loaded execution node.
  const worker = nodeById(layout, link.to)
  assert.equal(worker.resolution, 'endpointOnly')
  assert.equal(worker.lane, 'endpoint')
  assert.equal(worker.projected, null)

  assert.equal(activity.family, 'activityParent')
  assert.equal(activity.evidence, 'derived')
  assert.equal(activity.persistedLink, false)
  assert.equal(activity.to, 'row:activity:first:activity:job-1:act-1')

  assert.equal(trigger.family, 'notificationTrigger')
  assert.equal(trigger.evidence, 'persisted')
  assert.equal(trigger.persistedLink, false)
  const notification = nodeById(layout, trigger.from)
  assert.equal(notification.lane, 'notification')
  assert.equal(notification.resolution, 'endpointOnly')
  assert.equal(notification.kind, 'notification')

  // A Part's persisted generateTaskId is a field reference, not Link proof.
  assert.ok(partTask)
  assert.equal(partTask.from, 'row:part:part:job-1:0')
  assert.equal(partTask.to, 'row:task:0')
  assert.equal(partTask.persistedLink, false)
  assert.equal(partTask.basis, 'partGenerateTaskId')

  // Exactly the projection edges plus the one Part field reference; no
  // Job→Task membership edge is synthesized.
  assert.equal(layout.edges.length, 4)
  assert.equal(layout.familyCounts.link, 1)
  assert.equal(layout.familyCounts.notificationTrigger, 1)
  assert.equal(layout.familyCounts.activityParent, 1)
  assert.equal(layout.familyCounts.partTaskRef, 1)
})

test('relations with unloaded endpoints are listed, never drawn as nodes', () => {
  const childRef = { kind: 'job', ref: 'job:child-1' }
  const projection = graphProjection(
    [jobNode()],
    [
      projectedEdge({ id: 'link-child-1', to: childRef }),
      projectedEdge({ id: 'link-child-2', to: childRef, linkKey: 'link-2' }),
      projectedEdge({ id: 'link-no-target', to: null, linkKey: 'link-3' }),
    ],
  )

  const layout = layoutTraceGraphCanvas(projection)
  assert.equal(layout.edges.length, 0)
  assert.equal(layout.unresolvedEdges.length, 3)
  assert.equal(layout.unresolvedEdgeCount, 3)

  const childRelations = layout.unresolvedEdges
    .filter(edge => edge.toRef?.ref === 'job:child-1')
  assert.equal(childRelations.length, 2)
  assert.ok(childRelations.every(edge => edge.reason === 'endpointNotLoaded'))
  assert.ok(childRelations.every(edge => edge.pageKey === null))

  const missing = layout.unresolvedEdges.find(edge => edge.id === 'link-no-target')
  assert.equal(missing.reason, 'targetMissing')
  assert.equal(missing.toRef, null)

  // An unloaded endpoint produces no placeholder node and no line.
  assert.deepEqual(layout.nodes.map(node => node.id), ['row:job:job:job-1'])
  assert.equal(layout.unresolvedEdgeCount, 3)
})

test('a repeated Task identity is not attributed to one arbitrary reference row', () => {
  const duplicatedRef = { kind: 'task', ref: 'task:dup' }
  const first = taskNode(0)
  first.ref = duplicatedRef
  first.task.nodeId = 'task:dup'
  first.task.taskId = 'dup'
  first.task.referenceState = 'duplicate'
  const second = taskNode(1)
  second.ref = duplicatedRef
  second.task.nodeId = 'task:dup'
  second.task.taskId = 'dup'
  second.task.referenceState = 'duplicate'

  const layout = layoutTraceGraphCanvas(graphProjection(
    [jobNode(), first, second],
    [projectedEdge({ id: 'link-dup', from: { kind: 'job', ref: JOB_REF }, to: duplicatedRef })],
  ))

  assert.equal(layout.edges.length, 0)
  assert.equal(layout.unresolvedEdges.length, 1)
  assert.equal(layout.unresolvedEdges[0].reason, 'ambiguousReference')
  // Both real reference rows remain drawn; neither is chosen as the edge target.
  assert.equal(layout.nodes.filter(node => node.kind === 'task' && node.resolution === 'loaded').length, 2)
  assert.equal(layout.nodes.length, 3)
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

test('the flow canvas draws only page-returned parent relations', () => {
  const nodes = [
    flowNode('a'),
    flowNode('b', { parentJobId: 'a' }),
    flowNode('c', { parentJobId: 'b' }),
    flowNode('d', { parentJobId: 'outside' }),
    flowNode('e', { parentJobId: 'a' }),
  ]

  const layout = layoutTraceFlowGraphCanvas(nodes, [flowEdge('a', 'b')])
  const byJob = new Map(layout.nodes.map(node => [node.jobId, node]))

  assert.equal(layout.edges.length, 1)
  assert.equal(layout.edges[0].from, 'a')
  assert.equal(layout.edges[0].to, 'b')
  assert.equal(byJob.get('b').depth, 1)

  // b→c is loaded on both sides, but this page pair returned no edge.
  assert.equal(byJob.get('c').parentLoadedWithoutPageEdge, true)
  assert.equal(byJob.get('c').parentOutsideLoadedPages, false)
  assert.equal(layout.parentLoadedWithoutPageEdgeCount, 2)

  // d's parent is not loaded at all; e's parent is loaded but has no edge.
  assert.equal(byJob.get('d').parentOutsideLoadedPages, true)
  assert.equal(byJob.get('e').parentLoadedWithoutPageEdge, true)
  assert.equal(layout.parentOutsideLoadedCount, 1)

  // parentJobId alone never becomes an edge.
  assert.ok(!layout.edges.some(edge => edge.to === 'c' || edge.to === 'e'))
  assert.ok(layout.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)))
})

test('a flow edge with an unloaded endpoint is skipped instead of drawn', () => {
  const layout = layoutTraceFlowGraphCanvas(
    [flowNode('a'), flowNode('b')],
    [flowEdge('a', 'b'), flowEdge('b', 'missing')],
  )

  assert.equal(layout.edges.length, 1)
  assert.equal(layout.skippedEdgeCount, 1)
  assert.equal(layout.edges[0].to, 'b')
})

function centerOf(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

test('relation distance, not the row family, decides where a node sits', () => {
  const taskRef0 = { kind: 'task', ref: 'task:task-0' }
  const taskRef1 = { kind: 'task', ref: 'task:task-1' }
  const partRef = { kind: 'part', ref: 'part:job-1:0' }
  const projection = graphProjection(
    [jobNode(), taskNode(0), taskNode(1), partNode()],
    [
      projectedEdge({ id: 'job-task0', from: { kind: 'job', ref: JOB_REF }, to: taskRef0 }),
      projectedEdge({ id: 'task0-task1', from: taskRef0, to: taskRef1 }),
      projectedEdge({ id: 'job-part', from: { kind: 'job', ref: JOB_REF }, to: partRef }),
    ],
  )

  const layout = layoutTraceGraphCanvas(projection)
  assert.equal(layout.anchorNodeId, 'row:job:job:job-1')
  assert.equal(layout.delegation.jobId, 'job-1')

  const ringById = new Map(layout.nodes.map(node => [node.id, node.ring]))
  assert.equal(ringById.get('row:job:job:job-1'), 0)
  assert.equal(ringById.get('row:task:0'), 1)
  assert.equal(ringById.get('row:part:part:job-1:0'), 1)
  // The chain relation is proven, so the second Task sits one ring further out.
  assert.equal(ringById.get('row:task:1'), 2)

  const anchor = nodeById(layout, 'row:job:job:job-1')
  const anchorCenter = centerOf(anchor)
  const radiusByRing = new Map(layout.rings.map(ring => [ring.ring, ring.radius]))
  for (const node of layout.nodes) {
    if (node.ring === 0) continue
    const center = centerOf(node)
    const distance = Math.hypot(center.x - anchorCenter.x, center.y - anchorCenter.y)
    assert.ok(
      Math.abs(distance - radiusByRing.get(node.ring)) < 0.001,
      `node ${node.id} must sit on the radius of its relation ring`,
    )
  }
  assert.deepEqual(layout.isolatedNodeIds, [])
})

test('a row no drawn relation reaches keeps the outer ring and is reported', () => {
  const projection = graphProjection(
    [jobNode(), taskNode(0), taskNode(1)],
    [
      projectedEdge({
        id: 'job-task0',
        from: { kind: 'job', ref: JOB_REF },
        to: { kind: 'task', ref: 'task:task-0' },
      }),
    ],
  )

  const layout = layoutTraceGraphCanvas(projection)
  const lonely = nodeById(layout, 'row:task:1')
  assert.equal(lonely.ring, 2)
  assert.equal(lonely.degree, 0)
  assert.deepEqual(layout.isolatedNodeIds, ['row:task:1'])
  // Isolation is reported, never repaired by a guessed relation.
  assert.ok(layout.edges.every(edge => edge.to !== 'row:task:1'))
})

test('folding a group removes its nodes and reports the folded relations', () => {
  const projection = graphProjection(
    [jobNode(), taskNode(0), partNode()],
    [
      projectedEdge({
        id: 'job-task0',
        from: { kind: 'job', ref: JOB_REF },
        to: { kind: 'task', ref: 'task:task-0' },
      }),
    ],
  )

  const layout = layoutTraceGraphCanvas(projection, { collapsed: ['part'] })
  assert.deepEqual(layout.collapsedGroups, ['part'])
  assert.ok(layout.nodes.every(node => node.lane !== 'part'))
  // The persisted Part→Task field stays a fact, but it is folded, not unresolved.
  assert.equal(layout.foldedEdgeCount, 1)
  assert.equal(layout.foldedEdges[0].family, 'partTaskRef')
  assert.equal(layout.foldedEdges[0].foldedGroup, 'part')
  assert.equal(layout.familyCounts.partTaskRef, 0)
  assert.equal(layout.unresolvedEdgeCount, 0)
  assert.equal(layout.edges.length, 1)

  const partGroup = layout.groups.find(group => group.kind === 'part')
  assert.equal(partGroup.nodeCount, 1)
  assert.equal(partGroup.drawnNodeCount, 0)
  assert.equal(partGroup.collapsed, true)
  // A folded group leaves no orphan endpoint behind.
  assert.ok(layout.nodes.every(node => node.resolution === 'loaded'))
})
