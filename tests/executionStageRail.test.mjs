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

async function renderRail(executionKind, observations, displayFacts = []) {
  const projection = projectExecutionStages(executionKind, observations)
  return renderToString(createSSRApp({
    render: () => h(ExecutionStageRail, {
      executionKind,
      stages: projection.stages,
      dispatchLink: null,
      settlementLink: null,
      selectedStageId: null,
      displayFacts,
      selectable: false,
    }),
  }))
}

test('Tag and Challenge render the same evidence-backed stage rail', async () => {
  currentLocaleRef.value = 'en'
  const tag = await renderRail('tagGeneration', [observation('TagGenerationPlanCommitted')])
  assert.match(tag, /Execution stage summary/)
  assert.match(tag, /generation plan/i)
  assert.match(tag, /Evidence recorded/)
  assert.match(tag, /Not observed/)
  assert.doesNotMatch(tag, /Task completion/)

  const challenge = await renderRail('challengeProof', [observation('ProofGenerationStarted')], [
    { stageId: 'proofGeneration', status: 'active', source: 'observation', evidenceCount: 1, lastObservationId: 'observation-ProofGenerationStarted', failureObservationId: null },
  ])
  assert.match(challenge, /Proof generation/)
  assert.match(challenge, /Executing/)
  assert.match(challenge, /Evidence: 1/)
  assert.doesNotMatch(challenge, /Identity execution rail/)
})

test('Identity rail retains its explicit dispatch and settlement relations', async () => {
  currentLocaleRef.value = 'en'
  const identity = await renderRail('identityVerification', [])
  assert.match(identity, /Execution stage summary/)
  assert.match(identity, /Dispatch/)
  assert.match(identity, /Task completion/)
})
