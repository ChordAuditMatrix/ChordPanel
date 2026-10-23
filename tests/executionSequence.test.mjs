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

const { matchDispatchPacketStage, peerEventMatchesStage } =
  await vite.ssrLoadModule('/src/features/execution/data/executionSequence.ts')

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
