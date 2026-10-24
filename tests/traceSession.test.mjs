import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
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

const modelModule = await vite.ssrLoadModule('/src/features/execution/data/traceSessionModel.ts')
const { createTraceSessionModel, mergeObservations, tracePollingIntervals } = modelModule
const observationFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/challenge-verified-true-observations.json'),
  'utf8',
))
const partFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/tag-generation-multipart-parts.json'),
  'utf8',
))
const protocolFixture = JSON.parse(await readFile(
  resolve(root, 'tests/fixtures/observability/protocol-linked-packets.json'),
  'utf8',
))
const observations = observationFixture.response.body.items
const observationCursor = observationFixture.response.body.nextCursor
const jobId = observationFixture.response.body.items[0].jobId

function observationPage(items, nextCursor, hasMore = false) {
  return { items, nextCursor, hasMore, cursorConsistency: 'eventual' }
}

function traceClient(overrides = {}) {
  return {
    getTraceSummary: async () => { throw new Error('summary source not configured in this test') },
    getTraceObservations: async () => observationPage([], null),
    getTraceParts: async () => ({ items: [], total: 0, page: 1, pageSize: 200, hasMore: false, coverage: 'notInstrumented' }),
    getTraceLinks: async () => ({ items: [], total: 0, page: 1, pageSize: 200, hasMore: false }),
    getTraceProtocol: async () => ({ items: [], nextCursor: null, hasMore: false, coverage: 'notInstrumented', reasons: [] }),
    ...overrides,
  }
}

test('merges immutable observations by observationId and Admin recordedAtMs order', () => {
  const completed = observations.find(item => item.eventType === 'ChallengeJobCompleted')
  const proofStarted = observations.find(item => item.eventType === 'ProofGenerationStarted')
  assert.ok(completed)
  assert.ok(proofStarted)

  const duplicate = { ...proofStarted, metrics: { challengedTagCount: '999' } }
  const merged = mergeObservations([completed, proofStarted], [observations[0], duplicate, observations[0]])

  assert.equal(new Set(merged.map(item => item.observationId)).size, merged.length)
  assert.equal(merged.find(item => item.observationId === proofStarted.observationId), proofStarted)
  assert.deepEqual(merged.map(item => item.observationId), [
    observations[0].observationId,
    completed.observationId,
    proofStarted.observationId,
  ])
  assert.ok(proofStarted.eventTimeMs < completed.eventTimeMs)
  assert.ok(completed.recordedAtMs < proofStarted.recordedAtMs)
})

test('eventual polling retains the exhausted cursor, deduplicates overlap and inserts late source facts', async () => {
  const lateProofStart = observations.find(item => item.eventType === 'ProofGenerationStarted')
  const reconstructedCompletion = observations.find(item => item.eventType === 'ChallengeJobCompleted')
  assert.ok(lateProofStart)
  assert.ok(reconstructedCompletion)
  const firstHistory = observations.filter(item => item.observationId !== lateProofStart.observationId)
  const calls = []
  let page = 0
  const model = createTraceSessionModel(traceClient({
    getTraceObservations: async (_jobId, params) => {
      calls.push(params)
      page += 1
      return page === 1
        ? observationPage(firstHistory, observationCursor, false)
        : observationPage([reconstructedCompletion, lateProofStart, reconstructedCompletion], 'poll-watermark-2', false)
    },
  }))
  model.setJobId(jobId)

  // The initial history hydration contributes state, not packet/animation replay.
  assert.deepEqual(await model.refreshObservations(true), [])
  assert.equal(model.state.observationCursor, observationCursor)
  assert.equal(model.state.cursorConsistency, 'eventual')

  const fresh = await model.refreshObservations(false)
  assert.deepEqual(fresh.map(item => item.observationId), [lateProofStart.observationId])
  assert.equal(calls[1].cursor, observationCursor)
  assert.equal(calls[1].pageSize, 200)
  assert.equal(model.state.observationCursor, 'poll-watermark-2')
  assert.equal(model.state.observations.data.length, observations.length)
  assert.equal(new Set(model.state.observations.data.map(item => item.observationId)).size, observations.length)
  assert.ok(model.state.observations.data.indexOf(reconstructedCompletion)
    < model.state.observations.data.indexOf(lateProofStart))
})
test('initial observation scan follows every hasMore cursor before switching to its poll watermark', async () => {
  const calls = []
  let call = 0
  const model = createTraceSessionModel(traceClient({
    getTraceObservations: async (_jobId, params) => {
      calls.push(params)
      call += 1
      return call === 1
        ? observationPage(observations.slice(0, 3), 'scan-cursor-1', true)
        : observationPage(observations.slice(3), observationCursor, false)
    },
  }))
  model.setJobId(jobId)

  await model.refreshObservations(true)

  assert.deepEqual(calls.map(params => params.cursor), [undefined, 'scan-cursor-1'])
  assert.equal(model.state.observations.data.length, observations.length)
  assert.equal(model.state.observationCursor, observationCursor)
  assert.equal(model.state.observations.loaded, true)
})

test('empty overlap pages keep their watermark and explicit resync rereads older history without replay', async () => {
  const lateProofStart = observations.find(item => item.eventType === 'ProofGenerationStarted')
  assert.ok(lateProofStart)
  const initialHistory = observations.filter(item => item.observationId !== lateProofStart.observationId)
  const calls = []
  let page = 0
  const model = createTraceSessionModel(traceClient({
    getTraceObservations: async (_jobId, params) => {
      calls.push(params)
      page += 1
      if (page === 1) return observationPage(initialHistory, observationCursor, false)
      if (page === 2) return observationPage([], observationCursor, false)
      return observationPage(observations, observationCursor, false)
    },
  }))
  model.setJobId(jobId)

  await model.refreshObservations(true)
  assert.deepEqual(await model.refreshObservations(false), [])
  assert.equal(model.state.observationCursor, observationCursor)
  assert.equal(model.state.observations.data.length, initialHistory.length)

  assert.deepEqual(await model.refreshObservations(true), [])
  assert.equal(calls[1].cursor, observationCursor)
  assert.equal(calls[2].cursor, undefined)
  assert.equal(model.state.observationCursor, observationCursor)
  assert.equal(model.state.observations.data.length, observations.length)
  assert.ok(model.state.observations.data.some(item => item.observationId === lateProofStart.observationId))
})

test('a slow in-flight observation request is single-flight and its success is retained', async () => {
  let resolvePage
  let requestCount = 0
  const model = createTraceSessionModel(traceClient({
    getTraceObservations: async () => {
      requestCount += 1
      return new Promise(resolve => { resolvePage = resolve })
    },
  }))
  model.setJobId(jobId)

  const first = model.refreshObservations(true)
  const overlappingPoll = model.refreshObservations(false)
  assert.equal(requestCount, 1)
  resolvePage(observationPage([observations[0]], observationCursor, false))
  await Promise.all([first, overlappingPoll])

  assert.equal(model.state.observations.loaded, true)
  assert.equal(model.state.observations.data.length, 1)
  assert.equal(model.state.observations.data[0].observationId, observations[0].observationId)
})

test('an observation API failure preserves previously loaded facts and exposes the error', async () => {
  const failure = new Error('observability repository read failed')
  let fail = false
  const model = createTraceSessionModel(traceClient({
    getTraceObservations: async () => {
      if (fail) throw failure
      return observationPage(observations, observationCursor, false)
    },
  }))
  model.setJobId(jobId)

  await model.refreshObservations(true)
  const previous = model.state.observations.data
  fail = true
  await model.refreshObservations(false)

  assert.equal(model.state.observations.data, previous)
  assert.equal(model.state.observations.loaded, true)
  assert.equal(model.state.observations.error, failure)
})

test('parts keep decimal counts and page coverage, and windows stay absent until requested', async () => {
  const backendPage = partFixture.response.body
  const model = createTraceSessionModel(traceClient({
    getTraceParts: async (_jobId, params) => ({
      ...backendPage,
      items: params.includeWindows
        ? backendPage.items
        : backendPage.items.map(({ windows, ...part }) => part),
    }),
  }))
  model.setJobId(backendPage.items[0].jobId)

  await model.loadParts()
  assert.equal(model.state.parts.data.length, 3)
  assert.equal(model.state.partsPageCoverage[1], 'complete')
  assert.equal(model.state.parts.data[0].plannedBlockCount, '2')
  assert.equal(model.state.parts.data[0].windows, undefined)

  await model.loadPartWindows(1)
  assert.equal(model.state.parts.data[0].windows.length, 1)
  assert.equal(model.state.parts.data[0].windows[0].blockCount, '2')
  assert.equal(model.state.partsPageCoverage[1], 'complete')
})

test('protocol coverage and missing-packet reasons remain attached to the page', async () => {
  const backendPage = protocolFixture.response.body
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async () => backendPage,
  }))
  model.setJobId(jobId)

  await model.loadProtocol()

  assert.equal(model.state.protocol.data.length, 2)
  assert.equal(model.state.protocolPageCoverage.length, 1)
  assert.equal(model.state.protocolPageCoverage[0].coverage, 'partial')
  assert.deepEqual(model.state.protocolPageCoverage[0].reasons, ['ProtocolPacketUnavailable'])
  assert.equal(model.state.protocol.data[0].direction, 'outbound')
})

test('a burst of 1,000 observations remains unique after duplicate overlap', () => {
  const template = observations[0]
  const burst = Array.from({ length: 1000 }, (_unused, index) => ({
    ...template,
    observationId: `burst-${index}`,
    recordedAtMs: template.recordedAtMs + index,
  }))

  const merged = mergeObservations(burst, [...burst].reverse())
  assert.equal(merged.length, 1000)
  assert.equal(new Set(merged.map(item => item.observationId)).size, 1000)
})
test('switching Jobs does not reuse an in-flight projection request from the old Job', async () => {
  const backendPage = partFixture.response.body
  let resolveOldPage
  let requestCount = 0
  const model = createTraceSessionModel(traceClient({
    getTraceParts: async requestedJobId => {
      requestCount += 1
      if (requestedJobId === 'job-old') {
        return new Promise(resolve => { resolveOldPage = resolve })
      }
      return {
        ...backendPage,
        items: backendPage.items.map(({ windows, ...part }) => ({ ...part, jobId: requestedJobId })),
      }
    },
  }))
  model.setJobId('job-old')
  const oldJobLoad = model.loadParts()
  assert.equal(requestCount, 1)

  model.setJobId('job-new')
  const newJobLoad = model.loadParts()
  assert.equal(requestCount, 2)
  resolveOldPage({
    ...backendPage,
    items: backendPage.items.map(({ windows, ...part }) => ({ ...part, jobId: 'job-old' })),
  })
  await Promise.all([oldJobLoad, newJobLoad])

  assert.equal(model.state.parts.loaded, true)
  assert.ok(model.state.parts.data.every(part => part.jobId === 'job-new'))
})

test('a source update during a slow page read queues one follow-up projection refresh', async () => {
  const backendPage = partFixture.response.body
  let resolveFirstPage
  let requestCount = 0
  const model = createTraceSessionModel(traceClient({
    getTraceParts: async () => {
      requestCount += 1
      if (requestCount === 1) {
        return new Promise(resolve => { resolveFirstPage = resolve })
      }
      return {
        ...backendPage,
        items: backendPage.items.map(({ windows, ...part }, index) => ({
          ...part,
          updatedAtMs: index === 0 ? part.updatedAtMs + 1 : part.updatedAtMs,
        })),
      }
    },
  }))
  model.setJobId(backendPage.items[0].jobId)

  const initialLoad = model.loadParts()
  const eventTriggeredRefresh = model.loadParts()
  assert.equal(requestCount, 1)
  resolveFirstPage({
    ...backendPage,
    items: backendPage.items.map(({ windows, ...part }) => part),
  })
  await Promise.all([initialLoad, eventTriggeredRefresh])

  assert.equal(requestCount, 2)
  assert.equal(model.state.parts.data[0].updatedAtMs, backendPage.items[0].updatedAtMs + 1)
})
test('poll refreshes Links and Protocol independently of Observation events', async () => {
  const summaryFixture = JSON.parse(await readFile(
    resolve(root, 'tests/fixtures/observability/challenge-verified-true-summary.json'),
    'utf8',
  ))
  const summary = summaryFixture.response.body
  const packet = protocolFixture.response.body.items[0]
  let links = []
  let protocolEvents = []
  let linkReads = 0
  let protocolReads = 0
  const link = {
    jobId: summary.jobId,
    linkKey: 'protocol-packet:poll-refresh',
    linkKind: 'protocolPacket',
    matchBasis: 'packetCorrelation',
    confidence: 'exact',
    sourceQuality: 'observed',
    sourceRef: `packet:${packet.nodeId}:${packet.packetId}`,
    taskId: null,
    nodeId: packet.nodeId,
    originNodeId: null,
    requestId: packet.correlationId,
    dispatchPacketId: packet.packetId,
    correlationId: packet.correlationId,
    peerConversationId: null,
    operationId: null,
    relatedJobId: null,
    attempt: null,
    observedAtMs: packet.timestampMs,
  }
  const model = createTraceSessionModel(traceClient({
    getTraceSummary: async () => summary,
    getTraceObservations: async () => observationPage([], null),
    getTraceLinks: async () => {
      linkReads += 1
      return { items: links, total: links.length, page: 1, pageSize: 200, hasMore: false }
    },
    getTraceProtocol: async () => {
      protocolReads += 1
      return { ...protocolFixture.response.body, items: protocolEvents }
    },
  }))
  model.setJobId(summary.jobId)

  await model.loadInitial()
  assert.equal(linkReads, 1)
  assert.equal(protocolReads, 1)
  links = [link]
  protocolEvents = [packet]

  await model.poll()

  assert.equal(linkReads, 2)
  assert.equal(protocolReads, 2)
  assert.deepEqual(model.state.links.data, [link])
  assert.deepEqual(model.state.protocol.data, [packet])
  model.dispose()
})

test('real summary fixtures keep Job status, cryptographic verification and coverage independent', async () => {
  const scenarios = [
    {
      fixture: 'challenge-verified-true-summary.json',
      status: 'Succeeded',
      verified: true,
      workerStages: 'complete',
    },
    {
      fixture: 'challenge-verified-false-summary.json',
      status: 'Failed',
      verified: false,
      workerStages: 'partial',
    },
    {
      fixture: 'worker-telemetry-audit-disabled-summary.json',
      status: 'Succeeded',
      verified: true,
      workerStages: 'partial',
    },
    {
      fixture: 'worker-telemetry-storage-disabled-summary.json',
      status: 'Succeeded',
      verified: true,
      workerStages: 'partial',
    },
    {
      fixture: 'maintenance-recovery-summary.json',
      status: 'Succeeded',
      verified: null,
      workerStages: 'notInstrumented',
    },
  ]

  for (const scenario of scenarios) {
    const fixture = JSON.parse(await readFile(
      resolve(root, `tests/fixtures/observability/${scenario.fixture}`),
      'utf8',
    ))
    const summary = fixture.response.body
    const model = createTraceSessionModel(traceClient({
      getTraceSummary: async () => summary,
    }))
    model.setJobId(summary.jobId)
    await model.loadInitial()

    const loaded = model.state.summary.data
    assert.equal(loaded.job.status, scenario.status, scenario.fixture)
    assert.equal(loaded.references.verified, scenario.verified, scenario.fixture)
    assert.equal(loaded.coverage.workerStages, scenario.workerStages, scenario.fixture)
    assert.equal(loaded.coverage.job, 'complete', scenario.fixture)
    assert.deepEqual(loaded.coverage.reasons, fixture.expected.coverage.reasons, scenario.fixture)
    if (scenario.fixture === 'maintenance-recovery-summary.json') {
      assert.equal(loaded.executionKind, 'maintenance')
    } else {
      assert.equal(loaded.executionKind, 'challengeProof')
    }
    model.dispose()
  }
})
test('background sessions pass optional silent transport metadata without swallowing failures', async () => {
  for (const silent of [false, true]) {
    const requestOptions = []
    const summaryFailure = new Error('trace summary unavailable')
    const model = createTraceSessionModel(traceClient({
      getTraceSummary: async (_jobId, options) => {
        requestOptions.push(options)
        throw summaryFailure
      },
      getTraceObservations: async (_jobId, _params, options) => {
        requestOptions.push(options)
        return observationPage([], null)
      },
      getTraceParts: async (_jobId, _params, options) => {
        requestOptions.push(options)
        return { items: [], total: 0, page: 1, pageSize: 200, hasMore: false, coverage: 'notInstrumented' }
      },
      getTraceLinks: async (_jobId, _params, options) => {
        requestOptions.push(options)
        return { items: [], total: 0, page: 1, pageSize: 200, hasMore: false }
      },
      getTraceProtocol: async (_jobId, _params, options) => {
        requestOptions.push(options)
        return { items: [], nextCursor: null, hasMore: false, coverage: 'notInstrumented', reasons: [] }
      },
    }), undefined, { silent })
    model.setJobId(`silent-mode-${silent}`)
    await model.loadInitial()

    assert.ok(requestOptions.length >= 5)
    assert.ok(requestOptions.every(options => silent ? options.silent === true : !('silent' in options)))
    assert.equal(model.state.summary.error, summaryFailure)
    model.dispose()
  }
})
test('Trace polling scales resource-specific cadence without changing the global interval', () => {
  assert.deepEqual(tracePollingIntervals(5_000, true), {
    summary: 1_000,
    observations: 1_000,
    parts: 2_000,
    links: 4_000,
    protocol: 4_000,
  })
  assert.deepEqual(tracePollingIntervals(10_000, true), {
    summary: 2_000,
    observations: 2_000,
    parts: 4_000,
    links: 8_000,
    protocol: 8_000,
  })
  assert.equal(tracePollingIntervals(5_000, false).parts, 5_000)
})

test('targeted Trace polls refresh Parts on demand and full resync discovers late rows without loading Windows', async () => {
  const partPage = partFixture.response.body
  const calls = { summary: 0, observations: 0, parts: [], links: 0, protocol: 0 }
  let observationRequest = 0
  const tagPartObservation = {
    ...observations[0],
    observationId: 'tag-part-start-late',
    executionTraceId: `job:${jobId}`,
    jobId,
    eventType: 'TagPartGenerationStarted',
    category: 'part',
    phase: 'generate',
    source: { component: 'Admin', nodeId: null, quality: 'observed' },
    refs: {
      ...observations[0].refs,
      requestId: null,
      challengeCorrelationId: null,
      packetId: null,
      taskId: 'generate-0',
      partIndex: 0,
      windowIndex: null,
      attempt: 0,
    },
  }
  const lateObservation = {
    ...tagPartObservation,
    observationId: 'tag-window-late',
    eventType: 'TagWindowGenerated',
    refs: { ...tagPartObservation.refs, windowIndex: 0 },
  }
  const model = createTraceSessionModel(traceClient({
    getTraceSummary: async () => {
      calls.summary += 1
      return {}
    },
    getTraceObservations: async () => {
      calls.observations += 1
      observationRequest += 1
      if (observationRequest === 1) return observationPage([], 'cursor-initial')
      if (observationRequest === 2) return observationPage([tagPartObservation], 'cursor-part')
      return observationPage([tagPartObservation, lateObservation], 'cursor-late')
    },
    getTraceParts: async (_requestedJobId, params) => {
      calls.parts.push(params.includeWindows === true)
      return {
        ...partPage,
        items: params.includeWindows
          ? partPage.items
          : partPage.items.map(({ windows, ...part }) => part),
      }
    },
    getTraceLinks: async () => {
      calls.links += 1
      return { items: [], total: 0, page: 1, pageSize: 200, hasMore: false }
    },
    getTraceProtocol: async () => {
      calls.protocol += 1
      return { items: [], nextCursor: null, hasMore: false, coverage: 'notInstrumented', reasons: [] }
    },
  }))
  model.setJobId(jobId)
  await model.loadInitial(jobId)

  await model.poll({ summary: true, observations: false, parts: false, links: false, protocol: false })
  assert.deepEqual(calls, {
    summary: 2,
    observations: 1,
    parts: [false],
    links: 1,
    protocol: 1,
  })

  const periodicParts = await model.poll({
    summary: false,
    observations: false,
    parts: true,
    links: false,
    protocol: false,
  })
  assert.equal(periodicParts.partsRefreshed, true)
  assert.equal(calls.parts.length, 2)

  const eventDrivenParts = await model.poll({
    summary: false,
    observations: true,
    parts: false,
    links: false,
    protocol: false,
  })
  assert.equal(eventDrivenParts.partsRefreshed, true)
  assert.equal(calls.parts.length, 3)
  assert.ok(model.state.observations.data.some(row => row.observationId === tagPartObservation.observationId))

  await model.poll({
    summary: true,
    observations: true,
    parts: true,
    links: true,
    protocol: true,
    fullResync: true,
  })
  assert.ok(model.state.observations.data.some(row => row.observationId === lateObservation.observationId))
  assert.equal(calls.parts.length, 4)
  assert.ok(calls.parts.every(includeWindows => includeWindows === false))
  model.dispose()
})

test('overlapping Trace polls queue at most one follow-up for the same resource', async () => {
  let summaryRequests = 0
  let activeRequests = 0
  let maxConcurrentRequests = 0
  let releasePrimary
  let releaseFollowup
  let signalFollowupStarted
  const followupStarted = new Promise(resolve => { signalFollowupStarted = resolve })
  const model = createTraceSessionModel(traceClient({
    getTraceSummary: async () => {
      summaryRequests += 1
      if (summaryRequests === 1) return {}
      activeRequests += 1
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests)
      if (summaryRequests === 2) {
        return new Promise(resolve => {
          releasePrimary = () => {
            activeRequests -= 1
            resolve({})
          }
        })
      }
      if (summaryRequests === 3) {
        signalFollowupStarted()
        return new Promise(resolve => {
          releaseFollowup = () => {
            activeRequests -= 1
            resolve({})
          }
        })
      }
      activeRequests -= 1
      return {}
    },
  }))
  model.setJobId(jobId)
  await model.loadInitial(jobId)
  const summaryOnly = {
    summary: true,
    observations: false,
    parts: false,
    links: false,
    protocol: false,
  }
  const polls = Array.from({ length: 8 }, () => model.poll(summaryOnly))
  assert.equal(summaryRequests, 2)
  releasePrimary()
  await followupStarted
  assert.equal(summaryRequests, 3)
  releaseFollowup()
  await Promise.all(polls)
  assert.equal(summaryRequests, 3)
  assert.equal(maxConcurrentRequests, 1)
  model.dispose()
})
