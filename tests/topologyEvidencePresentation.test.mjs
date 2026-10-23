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

const { presentTopologyActivity } = await vite.ssrLoadModule(
  '/src/views/dashboard/topologyEvidencePresentation.ts',
)

const sharedLabels = {
  proofAccepted: 'Proof accepted',
  challengeDelivered: 'Challenge delivered',
}

test('topology summaries hide raw activity IDs while technical details retain exact copy values', () => {
  const cases = [
    {
      activity: {
        kind: 'confirmedPacket',
        activityId: 'confirmedPacket:7:link-v1|550e8400-e29b-41d4-a716-446655440000',
        messageType: 'TaskDispatchReq',
        fromNodeId: 'admin-node-1',
        toNodeId: 'audit-node-1',
      },
      kind: 'Confirmed protocol packet',
      path: 'TaskDispatchReq · admin-node-1 → audit-node-1',
    },
    {
      activity: {
        kind: 'peerCorrelation',
        activityId: 'peerCorrelation:7:link-v1|6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        originNodeId: 'audit-node-1',
        nodeId: 'storage-node-1',
        direction: null,
      },
      kind: 'Linked peer interaction',
      path: 'audit-node-1 ↔ storage-node-1',
    },
    {
      activity: {
        kind: 'localStage',
        activityId: 'localStage:7:observation-v1|fixture-0003',
        component: 'Storage',
        nodeId: 'storage-node-1',
      },
      kind: 'Node-local event',
      path: 'Storage · storage-node-1',
    },
  ]

  for (const { activity, kind, path } of cases) {
    const presentation = presentTopologyActivity(activity, { ...sharedLabels, kind })
    assert.deepEqual(presentation.summary, { kind, path })
    assert.equal(JSON.stringify(presentation.summary).includes(activity.activityId), false)
    assert.equal(presentation.technical.activityId, activity.activityId)
  }
})
