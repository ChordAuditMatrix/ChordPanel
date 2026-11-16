import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createProjectVite } from './shared/viteHarness.mjs'

const vite = await createProjectVite()

after(async () => { await vite.close() })

const {
  TOPOLOGY_ACTIVITY_PAGE_SIZE,
  clampTopologyActivityPage,
  projectTopologyActivityPage,
  projectTopologyNodeComponents,
  projectTopologyNodes,
  projectTopologyPeerMarkers,
  projectTopologyResponseNode,
  resolveTopologyFlow,
  resolveTopologyLocalPulse,
  topologyActivityPageCount,
  topologyActivityPageForSelection,
  topologyTravelDurationMs,
} = await vite.ssrLoadModule('/src/features/execution/data/executionTopologyLayout.ts')

const components = new Map([
  ['admin-1', 'Admin'],
  ['audit-1', 'Audit'],
  ['storage-1', 'Storage'],
])

function packet(overrides = {}) {
  return {
    kind: 'confirmedPacket',
    activityId: 'packet-1',
    jobId: 'job-1',
    fromNodeId: 'admin-1',
    toNodeId: 'audit-1',
    ...overrides,
  }
}

function peer(overrides = {}) {
  return {
    kind: 'peerCorrelation',
    activityId: 'peer-1',
    jobId: 'job-1',
    originNodeId: 'audit-1',
    nodeId: 'storage-1',
    direction: null,
    ...overrides,
  }
}

function localStage(overrides = {}) {
  return {
    kind: 'localStage',
    activityId: 'local-1',
    jobId: 'job-1',
    observationId: 'obs-1',
    sourceQuality: 'observed',
    component: 'Audit',
    nodeId: 'audit-1',
    ...overrides,
  }
}

test('observed worker identity wins over Job metadata, which fills only missing roles', () => {
  const map = projectTopologyNodeComponents({
    localStages: [
      { nodeId: 'audit-1', component: 'Audit' },
      { nodeId: 'audit-1', component: 'Storage' },
    ],
    roleNodeIds: {
      Admin: 'admin-1',
      Audit: 'audit-meta',
      Storage: 'storage-1',
    },
  })

  assert.deepEqual([...map.entries()], [
    ['audit-1', 'Audit'],
    ['admin-1', 'Admin'],
    ['audit-meta', 'Audit'],
    ['storage-1', 'Storage'],
  ])
  assert.equal(map.get('audit-1'), 'Audit')

  const blankRoles = projectTopologyNodeComponents({
    localStages: [],
    roleNodeIds: { Admin: '', Audit: null, Storage: 'storage-1' },
  })
  assert.deepEqual([...blankRoles.entries()], [['storage-1', 'Storage']])
})

test('fixed node geometry keeps role order, labels and evidence flags', () => {
  const nodes = projectTopologyNodes({
    componentByNodeId: new Map([
      ['admin-1', 'Admin'],
      ['long-audit-node-id-123456', 'Audit'],
    ]),
    localComponents: new Set(['Audit']),
    selectedNodeId: 'long-audit-node-id-123456',
    addressedComponent: 'Storage',
  })

  assert.deepEqual(nodes.map(node => node.component), ['Admin', 'Audit', 'Storage'])
  assert.deepEqual(nodes.map(node => node.labelKey), [
    'execution.topology.admin',
    'execution.topology.audit',
    'execution.topology.storage',
  ])
  assert.equal(nodes[0].centerX, 107)
  assert.equal(nodes[0].labelY, 158)
  assert.equal(nodes[0].idY, 173)
  assert.equal(nodes[0].nodeIdText, 'admin-1')
  assert.equal(nodes[1].nodeIdText, 'long-audit-node-id-…')
  assert.equal(nodes[1].hasLocal, true)
  assert.equal(nodes[1].selected, true)
  assert.equal(nodes[1].addressed, false)
  assert.equal(nodes[2].nodeId, null)
  assert.equal(nodes[2].selected, false)
  assert.equal(nodes[2].addressed, true)
})

test('a confirmed packet draws only its resolved role edge with an optional token', () => {
  const auditFlow = resolveTopologyFlow(packet(), components, { animationActivityId: 'packet-1' })
  assert.deepEqual(auditFlow, {
    x1: 182,
    y1: 150,
    x2: 450,
    y2: 70,
    path: 'M 182 150 L 450 70',
    durationMs: 856,
    animated: true,
    targetRole: 'Audit',
    token: true,
  })

  const storageFlow = resolveTopologyFlow(packet({ toNodeId: 'storage-1' }), components)
  assert.equal(storageFlow.targetRole, 'Storage')
  assert.equal(storageFlow.path, 'M 182 170 L 450 250')
  assert.equal(storageFlow.token, true)
  assert.equal(storageFlow.animated, false)

  assert.equal(resolveTopologyFlow(packet({ toNodeId: 'unknown-1' }), components), null)
  assert.equal(resolveTopologyFlow(packet({ toNodeId: 'admin-1' }), components), null)
  assert.equal(resolveTopologyFlow(null, components), null)

  // A dispatch token follows the resolved target role; the sender role is not
  // re-used to invent an edge the fixed route does not own.
  const targetOnly = resolveTopologyFlow(packet({ fromNodeId: 'unknown-1' }), components)
  assert.equal(targetOnly.targetRole, 'Audit')
  assert.equal(targetOnly.token, true)

  const reduced = resolveTopologyFlow(packet(), components, {
    animationActivityId: 'packet-1',
    reducedMotion: true,
  })
  assert.equal(reduced.animated, false)
  assert.equal(reduced.durationMs, 856)
})

test('peer direction draws a relationship trace only for exact Audit/Storage endpoints', () => {
  const toStorage = resolveTopologyFlow(peer({
    direction: {
      observationId: 'obs-peer',
      eventType: 'ChallengeDeliveredToStorage',
      fromNodeId: 'audit-1',
      toNodeId: 'storage-1',
    },
  }), components, { animationActivityId: 'peer-1' })

  assert.deepEqual(toStorage, {
    x1: 533,
    y1: 88,
    x2: 533,
    y2: 232,
    path: 'M 533 88 L 533 232',
    durationMs: 693,
    animated: true,
    targetRole: 'Storage',
    token: false,
  })

  const toAudit = resolveTopologyFlow(peer({
    direction: {
      observationId: 'obs-peer',
      eventType: 'ProofReturnedToAudit',
      fromNodeId: 'storage-1',
      toNodeId: 'audit-1',
    },
  }), components)
  assert.equal(toAudit.path, 'M 533 232 L 533 88')
  assert.equal(toAudit.targetRole, 'Audit')
  assert.equal(toAudit.token, false)

  assert.equal(resolveTopologyFlow(peer(), components), null)
  assert.equal(resolveTopologyFlow(localStage(), components), null)
  assert.equal(resolveTopologyFlow(peer({
    direction: { eventType: 'ProofReturnedToAudit', fromNodeId: 'unknown-1', toNodeId: 'audit-1' },
  }), components), null)
})

test('travel time is derived from the drawn segment and capped', () => {
  assert.equal(topologyTravelDurationMs(0, 0, 3, 4), 526)
  assert.equal(topologyTravelDurationMs(0, 0, 10_000, 0), 1_000)
  assert.equal(topologyTravelDurationMs(0, 0, 0, 0), 520)
})

test('the destination frame expands the resolved role box and keeps motion state', () => {
  const flow = resolveTopologyFlow(packet(), components, { animationActivityId: 'packet-1' })
  assert.deepEqual(projectTopologyResponseNode(flow), {
    x: 454,
    y: 28,
    width: 158,
    height: 64,
    durationMs: 856,
    animated: true,
  })
  assert.equal(projectTopologyResponseNode(null), null)
})

test('a local node pulse requires the selected observed fact and respects reduced motion', () => {
  const nodes = projectTopologyNodes({
    componentByNodeId: components,
    localComponents: new Set(['Audit']),
  })
  const pulse = resolveTopologyLocalPulse({
    activity: localStage(),
    animationActivityId: 'local-1',
    nodes,
  })
  assert.deepEqual(pulse, {
    activityId: 'local-1',
    x: 452,
    y: 26,
    width: 162,
    height: 68,
  })

  assert.equal(resolveTopologyLocalPulse({
    activity: localStage(),
    animationActivityId: 'local-1',
    reducedMotion: true,
    nodes,
  }), null)
  assert.equal(resolveTopologyLocalPulse({
    activity: localStage({ activityId: 'other' }),
    animationActivityId: 'local-1',
    nodes,
  }), null)
  assert.equal(resolveTopologyLocalPulse({
    activity: localStage({ nodeId: 'missing-1' }),
    animationActivityId: 'local-1',
    nodes,
  }), null)
})

test('peer markers keep the first eight and replace the last slot with a selected outlier', () => {
  const peers = Array.from({ length: 10 }, (_, index) => peer({
    activityId: `peer-${index + 1}`,
  }))

  const firstTwo = projectTopologyPeerMarkers(peers.slice(0, 2), null)
  assert.deepEqual(firstTwo.map(marker => marker.index), [1, 2])
  assert.equal(firstTwo[0].x, 515)
  assert.equal(firstTwo[1].x, 551)
  assert.ok(firstTwo[0].y > 90 && firstTwo[0].y < firstTwo[1].y && firstTwo[1].y < 218)

  const selectedOutlier = projectTopologyPeerMarkers(peers, peers[9])
  assert.equal(selectedOutlier.length, 8)
  assert.equal(selectedOutlier[7].activityId, 'peer-10')
  assert.equal(selectedOutlier[7].index, 10)
  assert.equal(selectedOutlier[0].activityId, 'peer-1')

  const selectedVisible = projectTopologyPeerMarkers(peers, peers[0])
  assert.deepEqual(selectedVisible.map(marker => marker.activityId), [
    'peer-1', 'peer-2', 'peer-3', 'peer-4', 'peer-5', 'peer-6', 'peer-7', 'peer-8',
  ])
})

test('activity paging clamps to a single page and follows selection across boundaries', () => {
  assert.equal(TOPOLOGY_ACTIVITY_PAGE_SIZE, 50)
  assert.equal(topologyActivityPageCount(0), 1)
  assert.equal(topologyActivityPageCount(50), 1)
  assert.equal(topologyActivityPageCount(51), 2)

  assert.equal(clampTopologyActivityPage(0, 101), 1)
  assert.equal(clampTopologyActivityPage(2, 101), 2)
  assert.equal(clampTopologyActivityPage(9, 101), 3)

  const activities = Array.from({ length: 120 }, (_, index) => ({ activityId: `a-${index}` }))
  assert.equal(topologyActivityPageForSelection(activities, 'a-99'), 2)
  assert.equal(topologyActivityPageForSelection(activities, 'a-100'), 3)
  assert.equal(topologyActivityPageForSelection(activities, 'missing'), null)
  assert.equal(topologyActivityPageForSelection(activities, null), null)

  const thirdPage = projectTopologyActivityPage(activities, 3)
  assert.equal(thirdPage.page, 3)
  assert.equal(thirdPage.pageCount, 3)
  assert.equal(thirdPage.visibleActivities.length, 20)
  assert.equal(thirdPage.visibleActivities[0].activityId, 'a-100')

  const clamped = projectTopologyActivityPage(activities, 9)
  assert.equal(clamped.page, 3)
  assert.equal(clamped.visibleActivities[0].activityId, 'a-100')
})
