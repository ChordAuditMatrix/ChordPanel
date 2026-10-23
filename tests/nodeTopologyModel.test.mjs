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

const {
  adminAnchorEndpoints,
  adminControlPlaneStatus,
  dashboardTopologyGroups,
  groupNodesByRole,
  projectNodeEvidence,
  shouldDisplayNodeCount,
} = await vite.ssrLoadModule('/src/views/dashboard/nodeTopologyModel.ts')

const JOB_ID = 'job-1'

function node(nodeId, role, isAvailable) {
  return { nodeId, role, isAvailable }
}

function packet(overrides = {}) {
  return {
    kind: 'confirmedPacket',
    activityId: 'activity-packet',
    jobId: JOB_ID,
    linkKey: 'link-1',
    linkSourceRef: 'link:1',
    packetSourceRef: 'packet:1',
    messageType: 'TaskDispatchReq',
    nodeId: 'audit-1',
    fromNodeId: 'admin-1',
    toNodeId: 'audit-1',
    dispatchPacketId: 'dispatch-1',
    packetId: 'packet-1',
    requestId: 'request-1',
    taskId: null,
    observedAtMs: null,
    packetTimestampMs: null,
    ...overrides,
  }
}

function peer(overrides = {}) {
  return {
    kind: 'peerCorrelation',
    activityId: 'activity-peer',
    jobId: JOB_ID,
    linkKind: 'peerCorrelation',
    linkKey: 'link-2',
    linkSourceRef: 'link:2',
    originNodeId: 'audit-1',
    nodeId: 'storage-1',
    requestId: 'request-2',
    peerConversationId: 'conversation-1',
    dispatchPacketId: 'dispatch-2',
    observedAtMs: null,
    direction: {
      observationId: 'observation-2',
      eventType: 'ChallengeDeliveredToStorage',
      fromNodeId: 'audit-1',
      toNodeId: 'storage-1',
      recordedAtMs: 1_000,
      eventTimeMs: 990,
    },
    ...overrides,
  }
}


function local(overrides = {}) {
  return {
    kind: 'localStage',
    activityId: 'activity-local',
    jobId: JOB_ID,
    observationId: 'observation-3',
    eventType: 'ProofGenerationCompleted',
    component: 'Storage',
    nodeId: 'storage-1',
    refs: {},
    recordedAtMs: 1_000,
    eventTimeMs: null,
    ...overrides,
  }
}

function projection(overrides = {}) {
  return {
    jobId: JOB_ID,
    confirmedPackets: [packet()],
    peerCorrelations: [peer()],
    localStages: [local()],
    ...overrides,
  }
}

const catalog = [
  node('storage-1', 'Storage', true),
  node('admin-1', 'Admin', undefined),
  node('audit-1', 'Audit', false),
  node('mystery-1', 'Witness', true),
  node('admin-lower', 'admin', true),
]

test('groups only exact documented roles and keeps unknown roles', () => {
  const groups = groupNodesByRole(catalog)
  assert.deepEqual(groups.map(group => group.key), ['Admin', 'Audit', 'Storage', 'unknown'])
  assert.deepEqual(groups[0].nodes.map(item => item.nodeId), ['admin-1'])
  assert.deepEqual(groups[3].nodes.map(item => item.nodeId), ['admin-lower', 'mystery-1'])
})

test('dashboard topology preserves the structural Admin group without adding registered nodes', () => {
  const groups = dashboardTopologyGroups([
    node('audit-1', 'Audit', true),
    node('storage-1', 'Storage', false),
  ])

  assert.deepEqual(groups.map(group => group.key), ['Admin', 'Audit', 'Storage'])
  assert.equal(groups.find(group => group.key === 'Admin')?.nodes.length, 0)
  assert.equal(groups.reduce((count, group) => count + group.nodes.length, 0), 2)
})
test('hides only the empty Admin control-plane count and keeps real role counts', () => {
  const emptyAdmin = dashboardTopologyGroups([]).find(group => group.key === 'Admin')
  const registeredAdmin = dashboardTopologyGroups([node('admin-1', 'Admin', true)]).find(group => group.key === 'Admin')
  const emptyAudit = dashboardTopologyGroups([]).find(group => group.key === 'Audit')

  assert.ok(emptyAdmin)
  assert.ok(registeredAdmin)
  assert.ok(emptyAudit)
  assert.equal(shouldDisplayNodeCount(emptyAdmin.key, emptyAdmin.nodes.length), false)
  assert.equal(shouldDisplayNodeCount(registeredAdmin.key, registeredAdmin.nodes.length), true)
  assert.equal(shouldDisplayNodeCount(emptyAudit.key, emptyAudit.nodes.length), true)
})

test('structural groups survive an empty catalog while unknown roles stay hidden', () => {
  const empty = dashboardTopologyGroups([])
  assert.deepEqual(empty.map(group => group.key), ['Admin', 'Audit', 'Storage'])
  assert.equal(empty.reduce((count, group) => count + group.nodes.length, 0), 0)

  // An unknown role is real data and keeps its group; the structural three stay empty.
  const onlyUnknown = dashboardTopologyGroups([node('witness-1', 'Witness', true)])
  assert.deepEqual(onlyUnknown.map(group => group.key), ['Admin', 'Audit', 'Storage', 'unknown'])
  assert.deepEqual(onlyUnknown.find(group => group.key === 'unknown')?.nodes.map(item => item.nodeId), ['witness-1'])
  assert.equal(onlyUnknown.reduce((count, group) => count + group.nodes.length, 0), 1)
})

test('a registered Admin record is kept exactly instead of being replaced by the anchor', () => {
  const groups = dashboardTopologyGroups([node('admin-1', 'Admin', true), node('admin-lower', 'admin', true)])
  const admin = groups.find(group => group.key === 'Admin')

  assert.deepEqual(admin?.nodes.map(item => item.nodeId), ['admin-1'])
  assert.equal(admin?.nodes[0].isAvailable, true)
  // A lowercase `admin` role is not the documented Admin role and stays in `unknown`.
  assert.deepEqual(groups.find(group => group.key === 'unknown')?.nodes.map(item => item.nodeId), ['admin-lower'])
})

test('Admin control-plane status uses explicit availability or real metrics and fails closed', () => {
  assert.equal(adminControlPlaneStatus(null), 'unknown')
  assert.equal(adminControlPlaneStatus({ cpuUsage: 10 }, true), 'unknown')
  assert.equal(adminControlPlaneStatus({ isAvailable: false, cpuUsage: 10 }), 'unavailable')
  assert.equal(adminControlPlaneStatus({ isAvailable: true }), 'available')
  assert.equal(adminControlPlaneStatus({ cpuUsage: 0 }), 'available')
  assert.equal(adminControlPlaneStatus({ cpuUsage: Number.NaN, load: Number.POSITIVE_INFINITY }), 'unknown')
  assert.equal(adminControlPlaneStatus({}), 'unknown')
  assert.equal(adminControlPlaneStatus(undefined), 'unknown')
})

test('an unregistered confirmed sender connects to the Admin anchor while no Admin is registered', () => {
  const nodes = [node('audit-1', 'Audit', true), node('storage-1', 'Storage', false)]
  const dispatch = projection().confirmedPackets[0]
  const selected = projectNodeEvidence(projection(), nodes, 'activity-packet', JOB_ID).selected

  // The sender is missing from the catalog, so the strict rule draws nothing.
  assert.equal(selected.drawableRelation, false)
  assert.deepEqual(selected.missingNodeIds, ['admin-1'])
  assert.deepEqual(adminAnchorEndpoints(selected, dispatch, nodes), {
    sourceNodeId: 'admin-1',
    targetNodeId: 'audit-1',
  })
})

test('the Admin anchor is never used for a registered sender, a missing target, or other evidence', () => {
  const nodes = [node('audit-1', 'Audit', true), node('storage-1', 'Storage', false)]
  const dispatch = projection().confirmedPackets[0]

  // A registered Admin owns the panel: same evidence, no anchor bridge.
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(projection(), catalog, 'activity-packet', JOB_ID).selected,
    dispatch,
    catalog,
  ), null)

  // A registered Admin owns the panel even when the packet names another sender.
  const withAdmin = [node('admin-1', 'Admin', true), node('audit-1', 'Audit', true)]
  const otherSender = projection({ confirmedPackets: [packet({ fromNodeId: 'admin-9' })] })
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(otherSender, withAdmin, 'activity-packet', JOB_ID).selected,
    otherSender.confirmedPackets[0],
    withAdmin,
  ), null)

  // Missing target ids stay missing instead of being redirected to the anchor.
  const missingTarget = projection({ confirmedPackets: [packet({ toNodeId: 'audit-10' })] })
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(missingTarget, nodes, 'activity-packet', JOB_ID).selected,
    missingTarget.confirmedPackets[0],
    nodes,
  ), null)

  // The anchor stands only for the sender this exact packet recorded.
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(projection(), nodes, 'activity-packet', JOB_ID).selected,
    packet({ fromNodeId: 'admin-9' }),
    nodes,
  ), null)
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(projection(), nodes, 'activity-packet', JOB_ID).selected,
    packet({ activityId: 'activity-other' }),
    nodes,
  ), null)

  // Peer and local evidence never bridge to a structural anchor.
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(projection(), nodes, 'activity-peer', JOB_ID).selected,
    projection().peerCorrelations[0],
    nodes,
  ), null)
  assert.equal(adminAnchorEndpoints(
    projectNodeEvidence(projection(), nodes, 'activity-local', JOB_ID).selected,
    projection().localStages[0],
    nodes,
  ), null)
})

test('node order is stable regardless of API response order', () => {
  const first = groupNodesByRole(catalog)
  const shuffled = groupNodesByRole([...catalog].reverse())
  assert.deepEqual(
    shuffled.map(group => group.visibleNodes.map(item => item.nodeId)),
    first.map(group => group.visibleNodes.map(item => item.nodeId)),
  )
})

test('large groups are capped but keep the highlighted nodes drawn', () => {
  const nodes = ['a-node', 'b-node', 'c-node'].map(id => node(id, 'Audit', true))
  const capped = groupNodesByRole(nodes, { maxPerGroup: 2 })
  assert.deepEqual(capped[1].visibleNodes.map(item => item.nodeId), ['a-node', 'b-node'])
  assert.equal(capped[1].hiddenCount, 1)

  const kept = groupNodesByRole(nodes, { maxPerGroup: 2, keepNodeIds: new Set(['c-node']) })
  assert.deepEqual(kept[1].visibleNodes.map(item => item.nodeId), ['a-node', 'c-node'])
  assert.equal(kept[1].hiddenCount, 1)
})

test('evidence matches catalog ids exactly and reports missing ids', () => {
  const result = projectNodeEvidence(
    projection({ confirmedPackets: [packet({ toNodeId: 'audit-10' })] }),
    catalog,
    'activity-packet',
    JOB_ID,
  )
  assert.equal(result.scopeMatched, true)
  assert.deepEqual(result.selected.matchedNodeIds, ['admin-1'])
  assert.deepEqual(result.selected.missingNodeIds, ['audit-10'])
  assert.equal(result.selected.drawableRelation, false)
  assert.equal(result.selected.packetId, 'packet-1')
})

test('peer evidence is directional only when stage evidence establishes it', () => {
  const result = projectNodeEvidence(projection(), catalog, 'activity-peer', JOB_ID)
  assert.deepEqual(result.selected.matchedNodeIds, ['audit-1', 'storage-1'])
  assert.equal(result.selected.sourceNodeId, 'audit-1')
  assert.equal(result.selected.targetNodeId, 'storage-1')
  assert.equal(result.selected.relationDirection, 'directed')
  assert.equal(result.selected.drawableRelation, true)
  assert.equal(result.selected.packetId, null)
})

test('peer relationship without a matching stage remains undirected', () => {
  const result = projectNodeEvidence(
    projection({ peerCorrelations: [peer({ direction: null })] }),
    catalog,
    'activity-peer',
    JOB_ID,
  )
  assert.deepEqual(result.selected.matchedNodeIds, ['audit-1', 'storage-1'])
  assert.equal(result.selected.sourceNodeId, null)
  assert.equal(result.selected.targetNodeId, null)
  assert.equal(result.selected.relationDirection, 'undirected')
  assert.equal(result.selected.drawableRelation, true)
  assert.equal(result.selected.packetId, null)
})


test('local stage highlights only the exact node id', () => {
  const result = projectNodeEvidence(projection(), catalog, 'activity-local', JOB_ID)
  assert.deepEqual(result.selected.matchedNodeIds, ['storage-1'])
  assert.equal(result.selected.targetNodeId, null)
  assert.equal(result.selected.drawableRelation, false)
})

test('evidence is hidden when the scope is another Job or empty', () => {
  const foreign = projectNodeEvidence(projection(), catalog, 'activity-peer', 'job-2')
  assert.equal(foreign.scopeMatched, false)
  assert.equal(foreign.activities.length, 0)
  assert.equal(foreign.selected, null)
  assert.equal(foreign.selectedMissing, true)

  const emptyScope = projectNodeEvidence(projection(), catalog, null, '   ')
  assert.equal(emptyScope.scopeMatched, false)
  assert.equal(emptyScope.activities.length, 0)
})

test('activities from another Job id are never projected', () => {
  const result = projectNodeEvidence(
    projection({ localStages: [local({ jobId: 'job-2' })] }),
    catalog,
    'activity-local',
    JOB_ID,
  )
  assert.equal(result.scopeMatched, true)
  assert.deepEqual(result.activities.map(item => item.activityId), ['activity-packet', 'activity-peer'])
  assert.equal(result.selected, null)
  assert.equal(result.selectedMissing, true)
})
