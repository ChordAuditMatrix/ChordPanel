import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  plugins: [vue()],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})
after(async () => { await vite.close() })

const { projectExecutionStages } = await vite.ssrLoadModule('/src/features/execution/data/executionStages.ts')
const { default: ExecutionStageRail } = await vite.ssrLoadModule(
  '/src/features/execution/components/ExecutionStageRail.vue',
)
const { default: IdentityTaskRelationDetails } = await vite.ssrLoadModule(
  '/src/features/execution/components/IdentityTaskRelationDetails.vue',
)
const { currentLocaleRef } = await vite.ssrLoadModule('/src/stores/i18n.ts')

function observation(eventType) {
  return {
    schemaVersion: 1,
    observationId: `observation-${eventType}`,
    executionTraceId: 'job-1',
    jobId: 'job-1',
    eventType,
    category: null,
    phase: null,
    source: { component: 'Audit', nodeId: 'audit-1', quality: 'observed' },
    refs: {
      taskId: null,
      requestId: null,
      challengeCorrelationId: null,
      packetId: null,
      operationId: null,
      algorithmId: null,
      partIndex: null,
      windowIndex: null,
      identityScope: null,
      algorithmType: null,
      attempt: null,
    },
    eventTimeMs: 100,
    recordedAtMs: 100,
    metrics: {},
    coverage: null,
    outcome: null,
    job: null,
  }
}

async function renderRail(executionKind, observations, displayFacts = [], selectedStageId = null) {
  const projection = projectExecutionStages(executionKind, observations)
  return renderToString(createSSRApp({
    render: () => h(ExecutionStageRail, {
      executionKind,
      stages: projection.stages,
      dispatchLink: null,
      settlementLink: null,
      selectedStageId,
      displayFacts,
      selectable: true,
    }),
  }))
}

test('Identity, Tag and Challenge use one concise, selectable stage rail', async () => {
  currentLocaleRef.value = 'en'
  const tag = await renderRail('tagGeneration', [observation('TagGenerationPlanCommitted')], [
    { stageId: 'plan', status: 'completed', source: 'observation', evidenceCount: 1, lastObservationId: 'observation-TagGenerationPlanCommitted', failureObservationId: null },
  ])
  assert.match(tag, /Execution stage summary/)
  assert.match(tag, /generation plan/i)
  assert.match(tag, /Completed/)
  assert.equal((tag.match(/<button\b/g) ?? []).length, 5)
  assert.doesNotMatch(tag, /Evidence: 1|ownerCount|signatureCount|TagGenerationPlanCommitted/)

  const challenge = await renderRail('challengeProof', [observation('ProofGenerationStarted')], [
    { stageId: 'proofGeneration', status: 'active', source: 'observation', evidenceCount: 1, lastObservationId: 'observation-ProofGenerationStarted', failureObservationId: null },
  ])
  assert.match(challenge, /Proof generation/)
  assert.match(challenge, /Executing/)
  assert.equal((challenge.match(/<button\b/g) ?? []).length, 10)
  assert.doesNotMatch(challenge, /Evidence: 1|Task completion/)

  const identity = await renderRail('identityVerification', [], [], 'dispatch')
  assert.equal((identity.match(/<button\b/g) ?? []).length, 7)
  assert.match(identity, /aria-pressed="true"[^>]*aria-label="Dispatch/)
  assert.doesNotMatch(identity, /Evidence: \d|Worker processing stage|available records do not confirm/)

  const identityEnd = await renderRail('identityVerification', [], [], 'settlement')
  assert.match(identityEnd, /aria-pressed="true"[^>]*aria-label="Task completion/)
  assert.doesNotMatch(identityEnd, /Evidence: \d|does not show that identity verification passed/)
})
test('Identity relation endpoints expose only their exact Link details below the rail', async () => {
  currentLocaleRef.value = 'en'
  const link = {
    jobId: 'job-1',
    linkKey: 'taskDispatch:task-1',
    linkKind: 'taskDispatch',
    matchBasis: 'taskBook',
    confidence: 'exact',
    sourceQuality: 'observed',
    sourceRef: 'IdentityVerificationTaskBook',
    taskId: 'task-1',
    nodeId: 'audit-1',
    originNodeId: 'admin-1',
    requestId: 'request-1',
    dispatchPacketId: null,
    correlationId: null,
    peerConversationId: null,
    operationId: null,
    relatedJobId: null,
    attempt: 1,
    observedAtMs: 123456,
    nodeAction: 'IdentityVerification',
    originPacketId: null,
  }
  const rendered = await renderToString(createSSRApp({
    render: () => h(IdentityTaskRelationDetails, { relation: 'dispatch', link, isReplay: false }),
  }))
  assert.match(rendered, /task-1/)
  assert.match(rendered, /audit-1/)
  assert.match(rendered, /Exact correlation/)
  assert.match(rendered, /does not confirm network delivery/)

  const missing = await renderToString(createSSRApp({
    render: () => h(IdentityTaskRelationDetails, { relation: 'settlement', link: null, isReplay: true }),
  }))
  assert.match(missing, /No task-completion record is available/)
  assert.doesNotMatch(missing, /task-1|audit-1/)
})
