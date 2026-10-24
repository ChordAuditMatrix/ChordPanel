import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
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

const details = await vite.ssrLoadModule('/src/features/execution/data/executionStageDetails.ts')
const { default: ExecutionStageDetailsPanel } = await vite.ssrLoadModule(
  '/src/features/execution/components/ExecutionStageDetailsPanel.vue',
)
const { currentLocaleRef } = await vite.ssrLoadModule('/src/stores/i18n.ts')
const JOB_ID = 'job-stage-details'

function observation(eventType, overrides = {}) {
  const base = {
    schemaVersion: 1,
    observationId: `obs-${eventType}`,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
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
    coverage: 'complete',
    outcome: null,
    job: null,
  }
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...overrides.source },
    refs: { ...base.refs, ...overrides.refs },
    metrics: { ...base.metrics, ...overrides.metrics },
  }
}

function traceSummary(references = {}, executionKind = 'identityVerification') {
  return {
    schemaVersion: 1,
    executionTraceId: `job:${JOB_ID}`,
    jobId: JOB_ID,
    executionKind,
    job: { status: 'Succeeded', errorCode: 'None', createdAtMs: 0, endedAtMs: 100 },
    references: {
      owner: null,
      initiator: null,
      algorithmId: null,
      tableId: null,
      storageNodeId: null,
      verifyType: null,
      columnId: null,
      verified: null,
      rootHashPresent: null,
      ownerCount: null,
      ownerRootHashCount: null,
      ...references,
    },
    progress: {},
    coverage: {},
    observedAtMs: 100,
  }
}

async function renderPanel(props, locale = 'zh-CN') {
  currentLocaleRef.value = locale
  return renderToString(createSSRApp(ExecutionStageDetailsPanel, props))
}

const emptyPanelData = {
  activeJobId: JOB_ID,
  stageLabel: 'Current stage',
  isReplay: false,
  observations: [],
  metricRows: [],
  users: [],
  ownerCount: null,
  ownerCountSource: null,
  unlistedOwnerCount: null,
  rootHash: null,
  partFacts: [],
  focusPartIndex: null,
  emptyText: 'No count metrics are available for this stage',
}

test('stage users use explicit IDs, exact task matches, and never infer identities from counts', () => {
  const stageObservation = observation('IdentityOwnersResolved', {
    category: 'identity',
    phase: 'verify',
    refs: { taskId: 'identity-task' },
    metrics: { ownerCount: '2' },
  })
  const common = {
    activeJobId: JOB_ID,
    kind: 'identityVerification',
    stageId: 'ownersResolved',
    observations: [stageObservation],
    summary: traceSummary({
      owner: { userId: 'owner-a', userName: null },
      initiator: { userId: 'operator-1', userName: null },
    }),
    jobSnapshot: {
      jobId: JOB_ID,
      dataOwner: { userId: 'owner-a', userName: 'Job owner A' },
      initiator: { userId: 'operator-1', userName: 'Operator' },
    },
    jobDetail: null,
    tasks: [{
      jobId: JOB_ID,
      taskId: 'identity-task',
      taskType: 'IdentityVerification',
      status: 'Running',
      resultSummary: { ownerIds: '["owner-b"]' },
    }],
    userNamesById: new Map([['owner-b', 'Directory owner B']]),
  }

  const live = details.projectStageUserReferences({ ...common, mode: 'live' })
  assert.deepEqual(live.users.map(user => [user.role, user.userId, user.userName]), [
    ['owner', 'owner-a', 'Job owner A'],
    ['resolvedOwner', 'owner-b', 'Directory owner B'],
    ['initiator', 'operator-1', 'Operator'],
  ])
  assert.equal(live.ownerCount, '2')
  assert.equal(live.ownerCountSource, 'observation')
  assert.equal(live.unlistedOwnerCount, null)

  const replay = details.projectStageUserReferences({ ...common, mode: 'replay' })
  assert.deepEqual(replay.users.map(user => user.userId), ['owner-a', 'operator-1'])
  assert.equal(replay.ownerCount, '2')
  assert.equal(replay.unlistedOwnerCount, '1')

  const countOnly = details.projectStageUserReferences({
    ...common,
    mode: 'replay',
    summary: traceSummary(),
    jobSnapshot: null,
    tasks: [],
  })
  assert.deepEqual(countOnly.users, [])
  assert.equal(countOnly.unlistedOwnerCount, '2')

  const summaryCount = details.projectStageUserReferences({
    ...common,
    mode: 'replay',
    stageId: 'verification',
    observations: [observation('IdentityVerificationCompleted')],
    summary: traceSummary({ ownerCount: '2' }),
    jobSnapshot: null,
    tasks: [],
  })
  assert.equal(summaryCount.ownerCount, '2')
  assert.equal(summaryCount.ownerCountSource, 'traceSummary')
})
test('lists every owner from the backend comma-delimited Task resultSummary', () => {
  const projection = details.projectStageUserReferences({
    activeJobId: JOB_ID,
    kind: 'identityVerification',
    stageId: 'ownersResolved',
    mode: 'live',
    observations: [observation('IdentityOwnersResolved', {
      category: 'identity',
      phase: 'verify',
      refs: { taskId: 'identity-task' },
      metrics: { ownerCount: '2' },
    })],
    summary: traceSummary(),
    jobSnapshot: null,
    jobDetail: null,
    tasks: [{
      jobId: JOB_ID,
      taskId: 'identity-task',
      taskType: 'IdentityVerification',
      status: 'Succeeded',
      resultSummary: { ownerIds: 'owner-a,owner-b' },
    }],
    userNamesById: new Map([
      ['owner-a', 'Owner A'],
      ['owner-b', 'Owner B'],
    ]),
  })
  assert.deepEqual(projection.users.map(user => [user.userId, user.userName]), [
    ['owner-a', 'Owner A'],
    ['owner-b', 'Owner B'],
  ])
  assert.equal(projection.ownerCount, '2')
  assert.equal(projection.unlistedOwnerCount, null)
})

test('Challenge and Tag views expose only the owner and initiator IDs provided by Trace', () => {
  const challengeUsers = details.projectStageUserReferences({
    activeJobId: JOB_ID,
    kind: 'challengeProof',
    stageId: 'proofGeneration',
    mode: 'live',
    observations: [observation('ProofGenerationStarted', { refs: { requestId: 'request-1' } })],
    summary: traceSummary({
      owner: { userId: 'challenge-owner', userName: 'Challenge owner' },
      initiator: { userId: 'operator-1', userName: 'Operator' },
    }, 'challengeProof'),
    jobSnapshot: null,
    jobDetail: null,
    tasks: [],
    userNamesById: new Map(),
  })
  assert.deepEqual(challengeUsers.users.map(user => user.userId), ['challenge-owner', 'operator-1'])
  assert.equal(challengeUsers.ownerCount, null)

  const tagUsers = details.projectStageUserReferences({
    activeJobId: JOB_ID,
    kind: 'tagGeneration',
    stageId: 'generation',
    mode: 'live',
    observations: [],
    summary: traceSummary({ owner: { userId: 'tag-owner', userName: null } }, 'tagGeneration'),
    jobSnapshot: null,
    jobDetail: null,
    tasks: [],
    userNamesById: new Map(),
  })
  assert.deepEqual(tagUsers.users.map(user => user.userId), ['tag-owner'])
})

test('Identity root-hash details require a visible completion and a matching Job', () => {
  const completion = observation('IdentityVerificationCompleted', {
    category: 'identity',
    phase: 'verify',
    metrics: { rootHashPresentCount: '1', ownerRootHashCount: '2' },
  })
  const input = {
    activeJobId: JOB_ID,
    kind: 'identityVerification',
    stageId: 'verification',
    observations: [completion],
    summary: traceSummary({ rootHashPresent: true, ownerRootHashCount: '2' }),
    jobDetail: { jobId: JOB_ID, metadata: { _rootHash: '0xabc123', rootHash: '0xignored' } },
  }
  const result = details.projectIdentityRootHashDetails(input)
  assert.deepEqual(result.presenceFacts.map(fact => [fact.present, fact.source]), [
    [true, 'traceSummary'],
    [true, 'observation'],
  ])
  assert.deepEqual(result.ownerRootHashCount, { value: '2', source: 'traceSummary' })
  assert.deepEqual(result.rootHashValue, { value: '0xabc123', source: 'jobMetadata' })

  const beforeCompletion = details.projectIdentityRootHashDetails({ ...input, observations: [] })
  assert.equal(beforeCompletion.completionVisible, false)
  assert.deepEqual(beforeCompletion.presenceFacts, [])
  assert.equal(beforeCompletion.rootHashValue, null)
  const otherJobMetadata = details.projectIdentityRootHashDetails({
    ...input,
    jobDetail: { jobId: 'another-job', metadata: { rootHash: '0xnot-this-job' } },
  })
  assert.equal(otherJobMetadata.rootHashValue, null)
  assert.equal(details.projectIdentityRootHashDetails({ ...input, kind: 'challengeProof' }), null)
})

test('stage panel renders Identity root hash, Tag Part/Window details, and Challenge references', async () => {
  const identityObservation = observation('IdentityVerificationCompleted', {
    category: 'identity',
    phase: 'verify',
    metrics: { rootHashPresentCount: '1', ownerRootHashCount: '2' },
  })
  const identityRootHash = details.projectIdentityRootHashDetails({
    activeJobId: JOB_ID,
    kind: 'identityVerification',
    stageId: 'verification',
    observations: [identityObservation],
    summary: traceSummary({ rootHashPresent: true, ownerRootHashCount: '2' }),
    jobDetail: { jobId: JOB_ID, metadata: { rootHash: '0xidentity-root' } },
  })
  const identityHtml = await renderPanel({
    ...emptyPanelData,
    kind: 'identityVerification',
    stageId: 'verification',
    stageLabel: 'Identity verification result',
    observations: [identityObservation],
    users: [{
      role: 'owner',
      userId: 'owner-a',
      userName: 'Owner A',
      source: 'traceSummary',
      nameSource: 'currentCatalog',
    }, {
      role: 'resolvedOwner',
      userId: 'owner-b',
      userName: null,
      source: 'taskResult',
      nameSource: 'currentCatalog',
    }],
    rootHash: identityRootHash,
  })
  assert.match(identityHtml, /Owner A/)
  assert.match(identityHtml, /owner-a/)
  const identityText = identityHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')
  assert.match(identityText, /Owner A \(owner-a\)/)
  assert.match(identityHtml, /当前用户目录/)
  assert.match(identityText, /任务结果 · 当前用户目录/)
  assert.match(identityText, /owner-b/)
  assert.match(identityHtml, /根哈希值/)
  assert.match(identityHtml, /0xidentity-root/)
  assert.match(identityHtml, /Trace 摘要/)
  assert.match(identityHtml, /当前用户目录/)

  const tagObservation = observation('TagWindowGenerated', {
    category: 'part',
    phase: 'generate',
    source: { component: 'Admin' },
    refs: { partIndex: 3, windowIndex: 7, attempt: 1 },
    metrics: { generatedCount: '4' },
  })
  const tagPartFact = {
    partIndex: 3,
    attempt: 1,
    status: 'running',
    source: 'observation',
    plannedBlockCount: '20',
    generatedBlockCount: '4',
    storageAccountedTagCount: null,
    generateTaskId: 'generate-task-3',
    generateTaskStatus: 'Running',
    windowsRequested: true,
    windows: [{
      windowIndex: 7,
      status: 'generated',
      taskId: 'dump-task-7',
      taskStatus: 'Running',
      generatedCount: '4',
      storageAccountedTagCount: null,
    }],
    lastObservationId: tagObservation.observationId,
  }
  const tagHtml = await renderPanel({
    ...emptyPanelData,
    kind: 'tagGeneration',
    stageId: 'generation',
    stageLabel: 'Part computation',
    observations: [tagObservation],
    focusPartIndex: 3,
    partFacts: [tagPartFact],
  })
  assert.match(tagHtml, /分片任务 3/)
  assert.match(tagHtml, /窗口 7/)
  assert.match(tagHtml, /generate-task-3/)
  assert.match(tagHtml, /dump-task-7/)
  assert.match(tagHtml, /观测记录/)
  assert.match(tagHtml, /不可用/)
  const completedSnapshotPart = {
    ...tagPartFact,
    status: 'completed',
    source: 'snapshot',
    generateTaskId: 'snapshot-generate-task',
    generateTaskStatus: 'Succeeded',
    windowsRequested: false,
    windows: [],
  }
  const tagSnapshotHtml = await renderPanel({
    ...emptyPanelData,
    kind: 'tagGeneration',
    stageId: 'generation',
    stageLabel: 'Part computation',
    partFacts: [completedSnapshotPart],
  })
  assert.match(tagSnapshotHtml, /snapshot-generate-task/)
  assert.match(tagSnapshotHtml, /分片投影/)
  assert.match(tagSnapshotHtml, /未请求窗口数据/)

  const replayWithoutVisibleParts = await renderPanel({
    ...emptyPanelData,
    kind: 'tagGeneration',
    stageId: 'generation',
    stageLabel: 'Part computation',
    isReplay: true,
    partFacts: [completedSnapshotPart],
  })
  assert.doesNotMatch(replayWithoutVisibleParts, /snapshot-generate-task/)

  const challengeObservation = observation('ProofGenerationStarted', {
    category: 'challenge',
    phase: 'generate',
    source: { component: 'Storage' },
    refs: { requestId: 'proof-request-9', challengeCorrelationId: 'challenge-correlation-9' },
  })
  const challengeHtml = await renderPanel({
    ...emptyPanelData,
    kind: 'challengeProof',
    stageId: 'proofGeneration',
    stageLabel: 'Proof generation',
    observations: [challengeObservation],
    users: [{
      role: 'owner',
      userId: 'challenge-owner',
      userName: 'Challenge owner',
      source: 'traceSummary',
      nameSource: 'traceSummary',
    }],
  })
  assert.match(challengeHtml, /challenge-owner/)
  assert.match(challengeHtml, /proof-request-9/)
  assert.match(challengeHtml, /challenge-correlation-9/)
  assert.match(challengeHtml, /Storage 已开始计算密码学证明/)
})

test('stage detail panel uses translated labels in English and Chinese', async () => {
  const props = {
    ...emptyPanelData,
    kind: 'challengeProof',
    stageId: 'proofGeneration',
    stageLabel: 'Proof generation',
    isReplay: true,
  }
  const english = await renderPanel(props, 'en')
  assert.match(english, /Stage details/)
  assert.match(english, /Historical replay at the selected position/)
  assert.match(english, /No user IDs are present in the available records/)
  assert.match(english, /No observations are visible for this stage/)
  assert.doesNotMatch(english, /execution\.stageDetails\./)

  const chinese = await renderPanel(props, 'zh-CN')
  assert.match(chinese, /阶段详细数据/)
  assert.match(chinese, /历史回放（当前指针）/)
  assert.doesNotMatch(chinese, /execution\.stageDetails\./)
})
