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
  CHALLENGE_FLOW,
  challengeDispatchStage,
  matchDispatchPacketStage,
  peerEventMatchesStage,
  placeConfirmedDispatches,
  projectSequenceRoles,
} = await vite.ssrLoadModule('/src/features/execution/data/executionSequence.ts')

function stage(overrides = {}) {
  return {
    id: 'dispatch',
    evidence: [{
      eventType: 'ChallengeDispatchAccepted',
      source: { component: 'Audit', quality: 'observed' },
      refs: { packetId: null, requestId: 'request-1', taskId: 'task-1' },
    }],
    ...overrides,
  }
}

function packet(overrides = {}) {
  return {
    packetId: 'packet-1',
    requestId: 'request-1',
    taskId: 'task-1',
    ...overrides,
  }
}

test('dispatch packets map to exactly one stage through same-namespace observed references', () => {
  assert.equal(matchDispatchPacketStage([stage()], packet()), 'dispatch')
  assert.equal(matchDispatchPacketStage([stage()], packet({ requestId: null })), 'dispatch')
  assert.equal(matchDispatchPacketStage([stage()], packet({ taskId: null })), 'dispatch')
  assert.equal(matchDispatchPacketStage([stage({
    evidence: [{
      ...stage().evidence[0],
      refs: { packetId: 'packet-1', requestId: null, taskId: null },
    }],
  })], packet({ requestId: null, taskId: null })), 'dispatch')

  const tagRange = stage({
    id: 'tagRange',
    evidence: [{
      eventType: 'TagRangeQueryDispatched',
      source: { component: 'Admin', quality: 'observed' },
      refs: { packetId: null, requestId: 'range-request', taskId: 'range-task' },
    }],
  })
  assert.equal(
    matchDispatchPacketStage([stage(), tagRange], packet({
      requestId: 'range-request',
      taskId: 'range-task',
    })),
    'tagRange',
  )
})

test('unconfirmed, conflicting, reconstructed, or ambiguous dispatch stage joins stay unassigned', () => {
  assert.equal(matchDispatchPacketStage([stage()], packet({ requestId: null, taskId: null })), null)

  assert.equal(matchDispatchPacketStage([stage({
    evidence: [{
      ...stage().evidence[0],
      refs: { packetId: 'task-1', requestId: null, taskId: null },
    }],
  })], packet({ requestId: null, taskId: null })), null)

  assert.equal(matchDispatchPacketStage([stage({
    evidence: [{
      ...stage().evidence[0],
      refs: { packetId: null, requestId: 'request-1', taskId: 'other-task' },
    }],
  })], packet()), null)

  assert.equal(matchDispatchPacketStage([stage({
    evidence: [{ ...stage().evidence[0], source: { quality: 'reconstructed' } }],
  })], packet()), null)

  const secondStage = stage({
    id: 'tagRange',
    evidence: [{
      eventType: 'TagRangeQueryDispatched',
      source: { component: 'Admin', quality: 'observed' },
      refs: { packetId: null, requestId: 'request-1', taskId: null },
    }],
  })
  assert.equal(matchDispatchPacketStage([stage(), secondStage], packet({ taskId: null })), null)
})

test('peer directions are placed only on their named challenge stages', () => {
  assert.equal(peerEventMatchesStage('challengeDelivery', 'ChallengeDeliveredToStorage'), true)
  assert.equal(peerEventMatchesStage('proofReturn', 'ProofReturnedToAudit'), true)
  assert.equal(peerEventMatchesStage('challengeDelivery', 'ProofReturnedToAudit'), false)
  assert.equal(peerEventMatchesStage('proofReturn', 'ChallengeDeliveredToStorage'), false)
  assert.equal(peerEventMatchesStage('settlement', 'ProofReturnedToAudit'), false)
})

function dispatchPacket(overrides = {}) {
  return {
    activityId: 'confirmedPacket:link:packet-1:audit-1',
    fromNodeId: 'admin-1',
    toNodeId: 'audit-1',
    ...overrides,
  }
}

test('confirmed dispatch rides the fixed role route even without a stage observation', () => {
  const roles = projectSequenceRoles({
    localStages: [{ nodeId: 'audit-1', component: 'Audit' }],
    confirmedPackets: [dispatchPacket()],
    peerCorrelations: [],
  })
  assert.equal(roles.get('admin-1'), 'Admin')
  assert.equal(roles.get('audit-1'), 'Audit')

  const placement = placeConfirmedDispatches('challengeProof', roles, [dispatchPacket()])
  assert.deepEqual(placement.stagePackets.get('dispatch')?.map(item => item.activityId), [
    dispatchPacket().activityId,
  ])
  assert.equal(placement.stagePackets.has('tagRange'), false)
  assert.equal(placement.placedActivityIds.has(dispatchPacket().activityId), true)
})

test('challenge role routes stay unique and unresolved roles stay unplaced', () => {
  assert.equal(challengeDispatchStage('Admin', 'Audit'), 'dispatch')
  assert.equal(challengeDispatchStage('Admin', 'Storage'), 'tagRange')
  assert.equal(challengeDispatchStage('Audit', 'Storage'), null)
  assert.equal(challengeDispatchStage('Admin', 'Admin'), null)
  assert.equal(CHALLENGE_FLOW.dispatch.opKey, 'dispatch')

  const roles = projectSequenceRoles({
    localStages: [{ nodeId: 'audit-1', component: 'Audit' }],
    confirmedPackets: [],
    peerCorrelations: [],
  })
  assert.equal(roles.has('admin-1'), false)
  const unresolved = placeConfirmedDispatches('challengeProof', roles, [
    dispatchPacket({ fromNodeId: 'admin-1', toNodeId: 'audit-1' }),
  ])
  assert.equal(unresolved.stagePackets.size, 0)

  const conflicted = projectSequenceRoles({
    localStages: [
      { nodeId: 'node-1', component: 'Audit' },
      { nodeId: 'node-1', component: 'Storage' },
    ],
    confirmedPackets: [],
    peerCorrelations: [],
  })
  assert.equal(conflicted.has('node-1'), false)
})

test('identity dispatch belongs to the dispatch relation row, never a worker stage', () => {
  const roles = new Map([['admin-1', 'Admin'], ['audit-1', 'Audit']])
  const placement = placeConfirmedDispatches('identityVerification', roles, [dispatchPacket()])
  assert.deepEqual(placement.identityDispatchPackets.map(item => item.activityId), [
    dispatchPacket().activityId,
  ])
  assert.equal(placement.stagePackets.size, 0)
  assert.equal(placement.placedActivityIds.has(dispatchPacket().activityId), true)

  const storageTarget = new Map([['admin-1', 'Admin'], ['storage-1', 'Storage']])
  const challenged = placeConfirmedDispatches('identityVerification', storageTarget, [
    dispatchPacket({ toNodeId: 'storage-1' }),
  ])
  assert.equal(challenged.identityDispatchPackets.length, 0)
  assert.equal(challenged.placedActivityIds.size, 0)
})
