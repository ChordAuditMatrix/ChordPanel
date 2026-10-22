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

const { matchesChallengeDispatchPacket, peerEventMatchesStage } =
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

test('a dispatch packet maps only through exact same-namespace evidence', () => {
  assert.equal(matchesChallengeDispatchPacket(stage(), packet()), true)
  assert.equal(matchesChallengeDispatchPacket(stage(), packet({ requestId: null })), true)
  assert.equal(matchesChallengeDispatchPacket(stage(), packet({ taskId: null })), true)
  assert.equal(matchesChallengeDispatchPacket(stage({
    evidence: [{
      ...stage().evidence[0],
      refs: { packetId: 'packet-1', requestId: null, taskId: null },
    }],
  }), packet({ requestId: null, taskId: null })), true)
})

test('dispatch mapping rejects cross-namespace coincidence, conflicts and reconstructed facts', () => {
  assert.equal(matchesChallengeDispatchPacket(stage({
    evidence: [{
      ...stage().evidence[0],
      refs: { packetId: 'task-1', requestId: null, taskId: null },
    }],
  }), packet({ requestId: null, taskId: null })), false)

  assert.equal(matchesChallengeDispatchPacket(stage({
    evidence: [{
      ...stage().evidence[0],
      refs: { packetId: null, requestId: 'other-request', taskId: 'task-1' },
    }],
  }), packet()), false)

  assert.equal(matchesChallengeDispatchPacket(stage({
    evidence: [{ ...stage().evidence[0], source: { quality: 'reconstructed' } }],
  }), packet()), false)
  assert.equal(matchesChallengeDispatchPacket(stage({
    evidence: [{ ...stage().evidence[0], source: { component: 'Storage', quality: 'observed' } }],
  }), packet()), false)

  assert.equal(matchesChallengeDispatchPacket(stage({ id: 'settlement' }), packet()), false)
  assert.equal(matchesChallengeDispatchPacket(stage({
    evidence: [{ ...stage().evidence[0], eventType: 'RemoteDispatchRecorded' }],
  }), packet()), false)
})

test('peer directions are placed only on their named challenge stages', () => {
  assert.equal(peerEventMatchesStage('challengeDelivery', 'ChallengeDeliveredToStorage'), true)
  assert.equal(peerEventMatchesStage('proofReturn', 'ProofReturnedToAudit'), true)
  assert.equal(peerEventMatchesStage('challengeDelivery', 'ProofReturnedToAudit'), false)
  assert.equal(peerEventMatchesStage('proofReturn', 'ChallengeDeliveredToStorage'), false)
  assert.equal(peerEventMatchesStage('settlement', 'ProofReturnedToAudit'), false)
})
