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
const mergeModule = await vite.ssrLoadModule('/src/features/execution/data/traceSessionMerge.ts')
const { createTraceSessionModel, tracePollingIntervals } = modelModule
const { mergeObservations } = mergeModule
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
test('poll refreshes the loaded Link depth and captures new protocol facts', async () => {
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
  // The cursor chain is re-read from its first page in backend order, bounded by
  // the loaded depth, so a fact that appeared after the initial read is captured.
  assert.equal(protocolReads, 2)
  assert.deepEqual(model.state.links.data, [link])
  assert.deepEqual(model.state.protocol.data, [packet])
  assert.equal(model.state.protocolPageCoverage.length, 1)

  await model.loadAllProtocol()
  assert.equal(protocolReads, 3)
  assert.deepEqual(model.state.protocol.data, [packet])
  model.dispose()
})

function protocolEvent(packetId) {
  return {
    nodeId: 'Storage-1',
    packetId,
    messageType: 'TaskDispatchReq',
    sourceRef: `packet:Storage-1:${packetId}`,
    timestampMs: 1,
    authenticatedNodeId: null,
    fromNodeId: 'Admin',
    toNodeId: 'Storage-1',
    correlationId: null,
    direction: 'outbound',
    matchBasis: 'packetCorrelation',
    confidence: 'exact',
    sourceQuality: 'observed',
  }
}

function protocolPage(items, hasMore, nextCursor) {
  return { items, nextCursor, hasMore, coverage: 'partial', reasons: [] }
}

function pagedPart(index) {
  return {
    jobId: 'job-paged',
    partIndex: index,
    attempt: null,
    ranges: [],
    plannedBlockCount: '0',
    status: 'planned',
    generateTaskId: null,
    generatedBlockCount: null,
    storageAccountedTagCount: null,
    updatedAtMs: null,
    coverage: 'complete',
  }
}

function pagedLink(linkKey) {
  return {
    jobId: 'job-paged',
    linkKey,
    linkKind: 'protocolPacket',
    matchBasis: 'packetCorrelation',
    confidence: 'exact',
    sourceQuality: 'observed',
    sourceRef: `packet:${linkKey}`,
    taskId: null,
    nodeId: 'Storage-1',
    originNodeId: null,
    requestId: null,
    dispatchPacketId: null,
    correlationId: null,
    peerConversationId: null,
    operationId: null,
    relatedJobId: null,
    attempt: null,
    observedAtMs: 1,
  }
}

test('a running protocol poll re-reads the visible depth without deepening it', async () => {
  let pageItems = [protocolEvent('p1')]
  let requests = 0
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async (_jobId, params) => {
      requests += 1
      // Every read starts in backend cursor order; a middle cursor is impossible.
      if (params.cursor !== undefined) throw new Error('bounded refresh must start at page 1')
      return protocolPage(pageItems, true, 'cursor-2')
    },
  }))
  model.setJobId('job-protocol-live')
  await model.loadInitial()
  assert.equal(requests, 1)
  assert.equal(model.state.protocolPaging.complete, false)

  // New facts arrive inside the already visible first page.
  pageItems = [protocolEvent('p1'), protocolEvent('p2')]
  await model.poll({ summary: false, observations: false, parts: false, links: false, protocol: true })

  assert.equal(requests, 2)
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1', 'p2'])
  // One page re-read: the ledger is replaced, not appended, and the visible depth
  // is not silently extended past what the user loaded.
  assert.equal(model.state.protocolPageCoverage.length, 1)
  assert.equal(model.state.protocolPaging.hasMore, true)
  assert.equal(model.state.protocolPaging.nextCursor, 'cursor-2')
  assert.equal(model.state.protocolPaging.complete, false)
  model.dispose()
})

test('a complete protocol ledger refreshes one bounded page past its old end', async () => {
  let appended = false
  let requests = 0
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async (_jobId, params) => {
      requests += 1
      if (params.cursor === undefined) {
        return protocolPage([protocolEvent('p1')], true, 'c2')
      }
      if (params.cursor === 'c2') {
        return appended
          ? protocolPage([protocolEvent('p2'), protocolEvent('p3')], true, 'c3')
          : protocolPage([protocolEvent('p2')], false, null)
      }
      if (params.cursor === 'c3') {
        return protocolPage([protocolEvent('p4')], false, null)
      }
      throw new Error(`unexpected cursor ${params.cursor}`)
    },
  }))
  model.setJobId('job-protocol-tail')
  await model.loadInitial()
  await model.loadAllProtocol()
  assert.equal(model.state.protocolPaging.complete, true)
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1', 'p2'])
  const readsBefore = requests

  appended = true
  await model.poll({ summary: false, observations: false, parts: false, links: false, protocol: true })

  // Two loaded pages plus one extra page: the appended tail becomes visible, and
  // the refresh stops at that bound instead of walking forever.
  assert.equal(requests - readsBefore, 3)
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1', 'p2', 'p3', 'p4'])
  assert.equal(model.state.protocolPageCoverage.length, 3)
  assert.equal(model.state.protocolPaging.complete, true)
  model.dispose()
})

test('a complete protocol refresh reads every newly available page', async () => {
  let refreshStarted = false
  const cursors = []
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async (_jobId, params) => {
      cursors.push(params.cursor ?? null)
      if (!refreshStarted) return protocolPage([protocolEvent('p1')], false, null)
      if (params.cursor === undefined) return protocolPage([protocolEvent('p1')], true, 'c2')
      if (params.cursor === 'c2') return protocolPage([protocolEvent('p2')], true, 'c3')
      if (params.cursor === 'c3') return protocolPage([protocolEvent('p3')], false, null)
      throw new Error(`unexpected cursor ${params.cursor}`)
    },
  }), undefined, { pageMode: 'complete' })
  model.setJobId('job-complete-protocol-refresh')
  await model.loadInitial()
  refreshStarted = true

  await model.poll({ summary: false, observations: false, parts: false, links: false, protocol: true })

  assert.deepEqual(cursors, [null, null, 'c2', 'c3'])
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1', 'p2', 'p3'])
  assert.equal(model.state.protocolPaging.complete, true)
  model.dispose()
})

test('an ordinary poll retries a protocol first load that failed', async () => {
  let attempts = 0
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('protocol join unavailable')
      return protocolPage([protocolEvent('p1')], true, 'c2')
    },
  }))
  model.setJobId('job-protocol-retry')
  await model.loadInitial()

  // The initial load failed: no rows, no cursor, only the error survives.
  assert.equal(attempts, 1)
  assert.equal(model.state.protocol.loaded, false)
  assert.equal(model.state.protocol.error.message, 'protocol join unavailable')

  await model.poll({ summary: false, observations: false, parts: false, links: false, protocol: true })

  // A normal poll must restart the bounded chain; a no-op refresh pinned the
  // protocol surface to its failure for the rest of the session.
  assert.equal(attempts, 2)
  assert.equal(model.state.protocol.error, null)
  assert.equal(model.state.protocol.loaded, true)
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1'])
  assert.deepEqual(model.state.protocolPageCoverage, [{ cursor: null, coverage: 'partial', reasons: [] }])
  assert.deepEqual(model.state.protocolPaging, {
    nextPage: 2,
    hasMore: true,
    total: null,
    complete: false,
    nextCursor: 'c2',
  })

  // The recovery re-read is still bounded: the next poll costs one page and does
  // not silently deepen the ledger.
  await model.poll({ summary: false, observations: false, parts: false, links: false, protocol: true })
  assert.equal(attempts, 3)
  assert.equal(model.state.protocolPageCoverage.length, 1)
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1'])
  model.dispose()
})

test('a protocol page that claims more rows without a cursor commits nothing', async () => {
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async () => ({
      items: [protocolEvent('p1')],
      nextCursor: null,
      hasMore: true,
      coverage: 'partial',
      reasons: [],
    }),
  }))
  model.setJobId('job-protocol-inconsistent')
  await model.loadProtocol()

  // The read is inconsistent: rows were returned but no position follows, so the
  // ledger must stay unloaded instead of presenting them as a completable page.
  assert.equal(model.state.protocol.loaded, false)
  assert.equal(model.state.protocol.data, null)
  assert.equal(model.state.protocol.error.message, 'Trace protocol page hasMore without nextCursor')
  assert.equal(model.state.protocolPaging.nextCursor, null)
  model.dispose()
})

test('an observation-only full resync leaves the bounded protocol ledger untouched', async () => {
  let protocolRequests = 0
  const observationCursors = []
  const model = createTraceSessionModel(traceClient({
    getTraceObservations: async (_jobId, params) => {
      observationCursors.push(params.cursor ?? null)
      return observationPage([observations[0]], 'observation-watermark', false)
    },
    getTraceProtocol: async (_jobId, params) => {
      protocolRequests += 1
      if (params.cursor === undefined) return protocolPage([protocolEvent('p1')], true, 'c2')
      if (params.cursor === 'c2') return protocolPage([protocolEvent('p2')], false, null)
      throw new Error(`unexpected cursor ${params.cursor}`)
    },
  }))
  model.setJobId('job-observation-resync')
  await model.loadInitial()

  // The first screen holds one bounded protocol page, not the whole join.
  assert.equal(protocolRequests, 1)
  const paging = { ...model.state.protocolPaging }
  const coverage = [...model.state.protocolPageCoverage]
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1'])

  await model.poll({
    summary: false,
    observations: true,
    parts: false,
    links: false,
    protocol: false,
    fullResync: true,
  })

  // The resync recovered observations from their first cursor; an explicit
  // `protocol: false` must keep the join out of it and preserve the visible depth.
  assert.deepEqual(observationCursors, [null, null])
  assert.equal(protocolRequests, 1)
  assert.deepEqual(model.state.protocolPaging, paging)
  assert.deepEqual(model.state.protocolPageCoverage, coverage)
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1'])
  assert.equal(model.state.protocol.loaded, true)
  model.dispose()
})

test('the first screen is one page per resource and continuations append safely', async () => {
  const partCalls = []
  const linkCalls = []
  const model = createTraceSessionModel(traceClient({
    getTraceParts: async (_jobId, params) => {
      partCalls.push(params.page)
      return params.page === 1
        ? { items: [pagedPart(0), pagedPart(1)], total: 3, page: 1, pageSize: 200, hasMore: true, coverage: 'partial' }
        : { items: [pagedPart(1), pagedPart(2)], total: 3, page: 2, pageSize: 200, hasMore: false, coverage: 'complete' }
    },
    getTraceLinks: async (_jobId, params) => {
      linkCalls.push(params.page)
      return params.page === 1
        ? { items: [pagedLink('l1')], total: 2, page: 1, pageSize: 200, hasMore: true }
        : { items: [pagedLink('l2')], total: 2, page: 2, pageSize: 200, hasMore: false }
    },
  }))
  model.setJobId('job-paged')
  await model.loadInitial()

  assert.deepEqual(partCalls, [1])
  assert.deepEqual(linkCalls, [1])
  assert.deepEqual(model.state.partsPaging, { nextPage: 2, hasMore: true, total: 3, complete: false })
  assert.equal(model.state.linksPaging.total, 2)
  assert.equal(model.state.linksPaging.complete, false)

  await model.loadMoreParts()

  assert.deepEqual(partCalls, [1, 2])
  // The repeated Part identity is merged, not duplicated.
  assert.deepEqual(model.state.parts.data.map(part => part.partIndex), [0, 1, 2])
  assert.equal(model.state.partsPaging.complete, true)
  assert.equal(model.state.partsPaging.total, 3)

  await model.loadMoreLinks()

  assert.deepEqual(linkCalls, [1, 2])
  assert.deepEqual(model.state.links.data.map(link => link.linkKey), ['l1', 'l2'])
  assert.equal(model.state.linksPaging.complete, true)
  // A completed resource does not read again.
  await model.loadMoreParts()
  assert.deepEqual(partCalls, [1, 2])
  model.dispose()
})

test('a refresh queued behind an in-flight Part continuation keeps the newly loaded page', async () => {
  const partCalls = []
  let secondPageReads = 0
  let resolveSecondPage
  const pageOne = { items: [pagedPart(0)], total: 3, page: 1, pageSize: 200, hasMore: true, coverage: 'partial' }
  const pageTwo = { items: [pagedPart(1)], total: 3, page: 2, pageSize: 200, hasMore: true, coverage: 'partial' }
  const model = createTraceSessionModel(traceClient({
    getTraceParts: async (_jobId, params) => {
      partCalls.push(params.page)
      if (params.page === 1) return pageOne
      if (secondPageReads === 0) {
        secondPageReads += 1
        return new Promise(resolve => { resolveSecondPage = () => resolve(pageTwo) })
      }
      return pageTwo
    },
  }))
  model.setJobId('job-paged')
  await model.loadInitial()

  const continuation = model.loadMoreParts()
  // The user's page-two request is still in flight when the poll's refresh lands.
  assert.deepEqual(partCalls, [1, 2])
  const queuedRefresh = model.refreshLoadedParts()
  resolveSecondPage()
  await Promise.all([continuation, queuedRefresh])

  // The queued refresh re-reads the depth the continuation committed. Reading the
  // first-page depth captured at request time replaces the held rows with the old
  // prefix, so the page the user just revealed would disappear.
  assert.deepEqual(partCalls, [1, 2, 1, 2])
  assert.deepEqual(model.state.parts.data.map(part => part.partIndex), [0, 1])
  // Page coverage evidence for the revealed page is retained as well.
  assert.deepEqual(Object.keys(model.state.partsPageCoverage).sort(), ['1', '2'])
  assert.deepEqual(model.state.partsPaging, { nextPage: 3, hasMore: true, total: 3, complete: false })
  model.dispose()
})

test('a refresh queued behind an in-flight Link continuation keeps the newly loaded page', async () => {
  const linkCalls = []
  let secondPageReads = 0
  let resolveSecondPage
  const pageOne = { items: [pagedLink('l1')], total: 2, page: 1, pageSize: 200, hasMore: true }
  const pageTwo = { items: [pagedLink('l2')], total: 2, page: 2, pageSize: 200, hasMore: false }
  const model = createTraceSessionModel(traceClient({
    getTraceLinks: async (_jobId, params) => {
      linkCalls.push(params.page)
      if (params.page === 1) return pageOne
      if (secondPageReads === 0) {
        secondPageReads += 1
        return new Promise(resolve => { resolveSecondPage = () => resolve(pageTwo) })
      }
      return pageTwo
    },
  }))
  model.setJobId('job-paged')
  await model.loadInitial()

  const continuation = model.loadMoreLinks()
  assert.deepEqual(linkCalls, [1, 2])
  const queuedRefresh = model.refreshLoadedLinks()
  resolveSecondPage()
  await Promise.all([continuation, queuedRefresh])

  assert.deepEqual(linkCalls, [1, 2, 1, 2])
  assert.deepEqual(model.state.links.data.map(link => link.linkKey), ['l1', 'l2'])
  assert.deepEqual(model.state.linksPaging, { nextPage: 3, hasMore: false, total: 2, complete: true })
  model.dispose()
})

test('a refresh queued behind an in-flight protocol continuation keeps the newly loaded page', async () => {
  const cursors = []
  let secondPageReads = 0
  let resolveSecondPage
  const pageOne = protocolPage([protocolEvent('p1')], true, 'c2')
  const pageTwo = protocolPage([protocolEvent('p2')], true, 'c3')
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async (_jobId, params) => {
      cursors.push(params.cursor ?? null)
      if (params.cursor === undefined) return pageOne
      if (params.cursor === 'c2') {
        if (secondPageReads === 0) {
          secondPageReads += 1
          return new Promise(resolve => { resolveSecondPage = () => resolve(pageTwo) })
        }
        return pageTwo
      }
      throw new Error(`unexpected cursor ${params.cursor}`)
    },
  }))
  model.setJobId('job-protocol-paged')
  await model.loadInitial()
  assert.deepEqual(cursors, [null])

  const continuation = model.loadMoreProtocol()
  assert.deepEqual(cursors, [null, 'c2'])
  const queuedRefresh = model.refreshLoadedProtocol()
  resolveSecondPage()
  await Promise.all([continuation, queuedRefresh])

  // The queued refresh re-walks the cursor chain up to the depth the continuation
  // committed. Reusing the pre-continuation budget would rewrite the ledger with
  // only the older page and hide the page the user just loaded.
  assert.deepEqual(cursors, [null, 'c2', null, 'c2'])
  assert.deepEqual(model.state.protocol.data.map(event => event.packetId), ['p1', 'p2'])
  assert.equal(model.state.protocolPageCoverage.length, 2)
  assert.deepEqual(model.state.protocolPaging, {
    nextPage: 3,
    hasMore: true,
    total: null,
    complete: false,
    nextCursor: 'c3',
  })
  model.dispose()
})

test('a protocol response for the previous Job is discarded after a switch', async () => {
  let resolveOldPage
  const model = createTraceSessionModel(traceClient({
    getTraceProtocol: async (requestedJobId) => {
      if (requestedJobId === 'job-old') {
        return new Promise((resolve) => { resolveOldPage = resolve })
      }
      return protocolPage([protocolEvent('new')], false, null)
    },
  }))
  model.setJobId('job-old')
  const oldLoad = model.loadProtocol()
  model.setJobId('job-new')
  resolveOldPage(protocolPage([protocolEvent('old')], false, null))
  await oldLoad

  assert.equal(model.state.jobId, 'job-new')
  assert.equal(model.state.protocol.data, null)
  assert.equal(model.state.protocol.loaded, false)
  assert.equal(model.state.protocol.loading, false)
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
