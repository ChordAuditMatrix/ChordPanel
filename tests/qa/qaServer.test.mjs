/**
 * Unit tests for the self-contained QA fixture server.
 *
 * They never touch ChordAuditMatrix and never read anything but the checked-in
 * fixtures, so `node --test` stays hermetic.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  SYNTHETIC_FIXTURE_FILE,
  SYNTHETIC_TAG_PROGRESS_JOB_ID,
  SYNTHETIC_TRACE_FIXTURE_DIR,
  TRACE_FIXTURE_DIR,
  qaScenarioViews,
  traceScenarios,
} from './manifest.mjs'
import { createQaServer } from './server.mjs'
import {
  availableResources,
  buildDerivedSummaryEnvelope,
  loadTraceRegistry,
} from './traceFixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const fixtureDir = path.join(repoRoot, TRACE_FIXTURE_DIR)
const syntheticFixtureDir = path.join(repoRoot, SYNTHETIC_TRACE_FIXTURE_DIR)
const synthetic = JSON.parse(readFileSync(path.join(repoRoot, SYNTHETIC_FIXTURE_FILE), 'utf8'))

const LEGACY = '13c37093-ca9d-4486-b8bd-2e5b27630353'
const EXACT = '6e445de9-26f7-460a-b22d-b937e12d5f81'
const MULTIPART = 'd6448cc3-04be-4fe8-8097-5a4bdf236b24'
const TAG_PROGRESS = SYNTHETIC_TAG_PROGRESS_JOB_ID
const EXACT_RESOURCE_SHA256 = {
  observations: '7644b1b0c4456b544e69a0373509ed567caefa9d97c6df1335cd60f726bb1e1a',
  links: 'd492932356b5602331d82de2c1db018262bf3094887b6ec95cc1ad6710425312',
  protocol: '77d1fc474a943fe7f8a97d0fbcaed4a4e20f755f77ee4fd7580ce3e98c9dd845',
}

/** @type {import('node:http').Server} */
let server
let origin
let port

before(async () => {
  const registry = loadTraceRegistry({ fixtureDir, syntheticFixtureDir, scenarios: traceScenarios })
  server = createQaServer({ registry, synthetic, appOrigin: 'http://localhost:5173' })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  port = address.port
  origin = `http://127.0.0.1:${port}`
})

after(async () => {
  const closed = once(server, 'close')
  server.closeAllConnections?.()
  server.close()
  await closed
})

async function getJson(pathname, { referrerPath, headers = {} } = {}) {
  const options = { headers }
  if (referrerPath) options.referrer = `${origin}${referrerPath}`
  const response = await fetch(`${origin}${pathname}`, options)
  return { response, body: await response.json() }
}

/** Raw request, so the test can forge a non-loopback `Host` header. */
function rawGet(pathname, host) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port, path: pathname, headers: { Host: host } },
      response => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', chunk => { text += chunk })
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }))
      },
    )
    request.on('error', reject)
    request.end()
  })
}

describe('manifest registry', () => {
  it('registers every Job and keeps alternate views on the same captured resource objects', () => {
    const registry = loadTraceRegistry({ fixtureDir, syntheticFixtureDir, scenarios: traceScenarios })
    assert.equal(registry.jobs.size, traceScenarios.length)
    assert.equal(qaScenarioViews.length, traceScenarios.length + 1)
    assert.deepEqual(availableResources(registry.jobs.get(LEGACY)), ['summary', 'observations', 'protocol'])
    assert.deepEqual(availableResources(registry.jobs.get(EXACT)), ['summary', 'observations', 'links', 'protocol'])
    assert.deepEqual(availableResources(registry.jobs.get(MULTIPART)), ['summary', 'parts'])
    assert.deepEqual(availableResources(registry.jobs.get(TAG_PROGRESS)), ['summary', 'parts'])

    const exact = registry.jobs.get(EXACT)
    const defaultView = exact.views.get('exact-challenge')
    const animationView = exact.views.get('challenge-animation-running')
    for (const resource of ['observations', 'links', 'protocol']) {
      assert.strictEqual(animationView.resources[resource], defaultView.resources[resource])
    }
  })
  it('rejects a capture whose recorded path belongs to another Job', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-fixture-'))
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
      request: { method: 'GET', path: `/api/v1/jobs/${EXACT}/trace`, query: {} },
      response: {
        status: 200,
        body: { jobId: EXACT, executionTraceId: `job:${EXACT}` },
      },
    }))
    assert.throws(
      () => loadTraceRegistry({
        fixtureDir: dir,
        scenarios: [{
          id: 'mixed',
          label: 'mixed capture',
          jobId: LEGACY,
          landing: '/executions/x',
          note: '',
          resources: { summary: { file: 'summary.json', origin: 'backend' } },
        }],
      }),
      /targets Job .* but the manifest declares/,
    )
  })

  it('rejects a protocol capture that no Link of the same Job can reach', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-fixture-'))
    const jobId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    writeFileSync(path.join(dir, 'links.json'), JSON.stringify({
      request: { method: 'GET', path: `/api/v1/jobs/${jobId}/trace/links`, query: {} },
      response: {
        status: 200,
        body: {
          items: [{ jobId, linkKind: 'taskDispatch', nodeId: 'Audit-1', dispatchPacketId: null }],
          total: 1,
          page: 1,
          pageSize: 200,
          hasMore: false,
        },
      },
    }))
    writeFileSync(path.join(dir, 'protocol.json'), JSON.stringify({
      request: { method: 'GET', path: `/api/v1/jobs/${jobId}/trace/protocol`, query: {} },
      response: {
        status: 200,
        body: {
          items: [{ nodeId: 'Audit-1', packetId: 'packet-from-another-capture' }],
          hasMore: false,
          nextCursor: null,
          coverage: 'complete',
          reasons: [],
        },
      },
    }))
    assert.throws(
      () => loadTraceRegistry({
        fixtureDir: dir,
        scenarios: [{
          id: 'join',
          label: 'broken join',
          jobId,
          landing: '/executions/x',
          note: '',
          resources: {
            links: { file: 'links.json', origin: 'backend' },
            protocol: { file: 'protocol.json', origin: 'backend' },
          },
        }],
      }),
      /is not reachable from a protocolPacket Link/,
    )
  })

  it('builds a derived summary with null facts only', () => {
    const envelope = buildDerivedSummaryEnvelope(EXACT)
    assert.equal(envelope.jobId, EXACT)
    assert.equal(envelope.executionTraceId, `job:${EXACT}`)
    assert.equal(envelope.executionKind, null)
    assert.equal(envelope.job.status, null)
    assert.equal(envelope.observedAtMs, null)
    assert.deepEqual(envelope.coverage.reasons, [])
    assert.equal(envelope.qaDerivedSummary, true)
  })
  it('marks the identity visual scope as synthetic and leaves all other derived facts unknown', () => {
    const envelope = buildDerivedSummaryEnvelope(EXACT, { syntheticIdentityScope: 'cell' })
    assert.equal(envelope.executionKind, 'identityVerification')
    assert.equal(envelope.references.verifyType, 'cell')
    assert.equal(envelope.references.verified, null)
    assert.equal(envelope.job.status, null)
    assert.equal(envelope.progress.plannedBlockCount, null)
    assert.equal(envelope.qaDerivedSummary, true)
  })
  it('adds the challenge motion context only to execution kind and Job status', () => {
    const unknown = buildDerivedSummaryEnvelope(EXACT)
    const expected = structuredClone(unknown)
    expected.executionKind = 'challengeProof'
    expected.job.status = 'Running'
    assert.deepEqual(
      buildDerivedSummaryEnvelope(EXACT, { syntheticChallengeRunning: true }),
      expected,
    )
  })

  it('adds only synthetic TagGeneration context and independent decimal counters', () => {
    const envelope = buildDerivedSummaryEnvelope(TAG_PROGRESS, { syntheticTagGenerationProgress: true })
    assert.equal(envelope.executionKind, 'tagGeneration')
    assert.equal(envelope.job.status, 'Running')
    assert.deepEqual([
      envelope.progress.plannedBlockCount,
      envelope.progress.generatedBlockCount,
      envelope.progress.storageAccountedTagCount,
    ], ['4', '3', '1'])
    assert.equal(envelope.references.algorithmId, null)
    assert.equal(envelope.references.verified, null)
    assert.equal(envelope.progress.plannedPartCount, null)
    assert.equal(envelope.coverage.parts, null)
    assert.equal(envelope.qaDerivedSummary, true)
  })
})

describe('trace routes', () => {
  it('replays a captured summary verbatim with provenance headers', async () => {
    const { response, body } = await getJson(`/api/v1/jobs/${LEGACY}/trace`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-chordpanel-qa'), 'fixtures')
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'fixture:frontend')
    assert.equal(response.headers.get('x-chordpanel-qa-scenario'), 'legacy-challenge')
    assert.equal(response.headers.get('x-chordpanel-qa-fixture'), 'challenge-verified-true-summary.json')
    assert.equal(body.jobId, LEGACY)
    assert.equal(body.executionKind, 'challengeProof')
    const file = JSON.parse(readFileSync(path.join(fixtureDir, 'challenge-verified-true-summary.json'), 'utf8'))
    assert.deepEqual(body, file.response.body)
  })

  it('answers 404 for a Job outside the fixture set', async () => {
    const { response, body } = await getJson('/api/v1/jobs/11111111-2222-4333-8444-555555555555/trace')
    assert.equal(response.status, 404)
    assert.equal(body.error, 'job_not_found')
  })

  it('answers 501 for a resource that was never captured', async () => {
    const { response, body } = await getJson(`/api/v1/jobs/${LEGACY}/trace/parts`)
    assert.equal(response.status, 501)
    assert.equal(body.error, 'trace_resource_not_captured')
    assert.match(body.detail, /summary, observations, protocol/)
  })

  it('marks derived summaries and keeps every unknown field null', async () => {
    const { response, body } = await getJson(`/api/v1/jobs/${EXACT}/trace`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'derived-summary')
    assert.equal(body.qaDerivedSummary, true)
    assert.equal(body.executionKind, null)
    assert.equal(body.references.algorithmId, null)
    assert.equal(body.progress.plannedPartCount, null)
  })
  it('selects the synthetic challenge motion Summary by the QA view referrer', async () => {
    const referrerPath = `/executions/${EXACT}?qaView=challenge-animation-running`
    const unknown = await getJson(`/api/v1/jobs/${EXACT}/trace`)
    const animation = await getJson(`/api/v1/jobs/${EXACT}/trace`, { referrerPath })

    assert.equal(unknown.body.executionKind, null)
    assert.equal(unknown.body.job.status, null)
    assert.equal(animation.response.headers.get('x-chordpanel-qa-source'), 'synthetic-visual-summary')
    assert.equal(animation.response.headers.get('x-chordpanel-qa-scenario'), 'challenge-animation-running')
    assert.equal(animation.response.headers.get('x-chordpanel-qa-projection'), 'qa-derived-synthetic-challenge-running')
    assert.equal(animation.response.headers.get('x-chordpanel-qa-fixture'), 'derived-envelope+synthetic-challenge-running')
    const expected = structuredClone(unknown.body)
    expected.executionKind = 'challengeProof'
    expected.job.status = 'Running'
    assert.deepEqual(animation.body, expected)

    const jobDetail = await getJson(`/api/v1/jobs/${EXACT}`, { referrerPath })
    const defaultJobDetail = await getJson(`/api/v1/jobs/${EXACT}`)
    assert.equal(jobDetail.response.status, 200, JSON.stringify(jobDetail.body))
    assert.equal(jobDetail.body.status, animation.body.job.status)
    assert.equal(jobDetail.response.headers.get('x-chordpanel-qa-scenario'), 'challenge-animation-running')
    assert.equal(defaultJobDetail.body.status, 'Succeeded')
    assert.equal(jobDetail.body.endedAtMs, null)
    assert.equal(jobDetail.body.totalDurationMs, null)
    assert.ok(jobDetail.body.history.every(item => item.status === 'Pending' || item.status === 'Running'))
    assert.equal(Object.hasOwn(jobDetail.body, 'taskIds'), false)
    const tasks = await getJson(`/api/v1/jobs/${EXACT}/tasks`, { referrerPath })
    assert.equal(tasks.response.status, 501)
    assert.equal(tasks.body.error, 'tasks_not_captured')
    assert.equal(tasks.response.headers.get('x-chordpanel-qa-scenario'), 'challenge-animation-running')
  })

  it('reuses the exact challenge Observations, Links and Protocol captures in the animation view', async () => {
    const referrerPath = `/executions/${EXACT}?qaView=challenge-animation-running`
    const scenario = traceScenarios.find(item => item.id === 'exact-challenge')
    const registry = loadTraceRegistry({ fixtureDir, syntheticFixtureDir, scenarios: traceScenarios })
    const defaultView = registry.jobs.get(EXACT).views.get('exact-challenge')
    const animationView = registry.jobs.get(EXACT).views.get('challenge-animation-running')
    const endpoints = {
      observations: `/api/v1/jobs/${EXACT}/trace/observations?pageSize=200`,
      links: `/api/v1/jobs/${EXACT}/trace/links?page=1&pageSize=200`,
      protocol: `/api/v1/jobs/${EXACT}/trace/protocol?pageSize=200`,
    }

    for (const resource of ['observations', 'links', 'protocol']) {
      const filename = scenario.resources[resource].file
      assert.strictEqual(animationView.resources[resource], defaultView.resources[resource])
      const recordedBytes = readFileSync(path.join(fixtureDir, filename))
      assert.equal(createHash('sha256').update(recordedBytes).digest('hex'), EXACT_RESOURCE_SHA256[resource])
      const recorded = JSON.parse(recordedBytes.toString('utf8'))
      const { response, body } = await getJson(endpoints[resource], { referrerPath })
      assert.equal(response.headers.get('x-chordpanel-qa-scenario'), 'challenge-animation-running')
      assert.equal(response.headers.get('x-chordpanel-qa-source'), 'fixture:backend')
      assert.equal(response.headers.get('x-chordpanel-qa-fixture'), filename)
      assert.deepEqual(body, recorded.response.body)
    }
  })

  it('labels the identity scope-only visual Summary as synthetic, not captured', async () => {
    const identityJob = '371f5280-b7ae-4252-841b-d3365b5dfd4b'
    const { response, body } = await getJson(`/api/v1/jobs/${identityJob}/trace`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'synthetic-visual-summary')
    assert.equal(response.headers.get('x-chordpanel-qa-scenario'), 'identity-worker')
    assert.equal(response.headers.get('x-chordpanel-qa-projection'), 'qa-derived-synthetic-identity-scope')
    assert.equal(body.qaDerivedSummary, true)
    assert.equal(body.executionKind, 'identityVerification')
    assert.equal(body.references.verifyType, 'cell')
    assert.equal(body.references.verified, null)
    assert.equal(body.job.status, null)
    assert.equal(body.progress.plannedBlockCount, null)
  })
  it('does not substitute synthetic Task IDs into the recorded identity Trace Job', async () => {
    const identityJob = '371f5280-b7ae-4252-841b-d3365b5dfd4b'
    const { response, body } = await getJson(`/api/v1/jobs/${identityJob}/tasks`)
    assert.equal(response.status, 501)
    assert.equal(body.error, 'tasks_not_captured')
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'fixture-missing')
    assert.match(body.detail, /will not synthesize Task IDs or statuses/)
  })
  it('serves the captured observation page and discloses its captured filter', async () => {
    const { response, body } = await getJson(`/api/v1/jobs/${EXACT}/trace/observations?pageSize=200`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-chordpanel-qa-projection'), 'captured-filter=category:challenge')
    assert.equal(response.headers.get('x-chordpanel-qa-captured-query'), 'category=challenge&pageSize=200')
    assert.equal(body.items.length, 8)
    for (const item of body.items) assert.equal(item.jobId, EXACT)
  })

  it('refuses to invent a cursor page or a smaller page size', async () => {
    const cursor = await getJson(`/api/v1/jobs/${EXACT}/trace/observations?cursor=not-captured`)
    assert.equal(cursor.response.status, 501)
    assert.equal(cursor.body.error, 'trace_cursor_not_captured')

    const narrow = await getJson(`/api/v1/jobs/${EXACT}/trace/observations?pageSize=2`)
    assert.equal(narrow.response.status, 501)
    assert.equal(narrow.body.error, 'trace_page_size_not_captured')
  })

  it('filters protocol packets by message type without changing the capture', async () => {
    const { response, body } = await getJson(
      `/api/v1/jobs/${EXACT}/trace/protocol?pageSize=200&messageTypes=TaskDispatchReq`,
    )
    assert.equal(response.status, 200)
    assert.equal(body.items.length, 2)
    assert.ok(body.items.every(item => item.messageType === 'TaskDispatchReq'))
  })

  it('omits part windows unless the request asks for them', async () => {
    const withoutWindows = await getJson(`/api/v1/jobs/${MULTIPART}/trace/parts?page=1&pageSize=200`)
    assert.equal(withoutWindows.response.status, 200)
    assert.equal(withoutWindows.response.headers.get('x-chordpanel-qa-projection'), 'windows-omitted')
    assert.ok(withoutWindows.body.items.every(part => !('windows' in part)))

    const withWindows = await getJson(`/api/v1/jobs/${MULTIPART}/trace/parts?page=1&pageSize=200&includeWindows=true`)
    assert.equal(withWindows.response.status, 200)
    assert.equal(withWindows.response.headers.get('x-chordpanel-qa-projection'), 'verbatim')
    assert.ok(withWindows.body.items.some(part => Array.isArray(part.windows) && part.windows.length > 0))
  })
  it('projects synthetic TagGeneration counters independently without Task or Window data', async () => {
    const summary = await getJson(`/api/v1/jobs/${TAG_PROGRESS}/trace`)
    assert.equal(summary.response.status, 200)
    assert.equal(summary.response.headers.get('x-chordpanel-qa-source'), 'synthetic-visual-summary')
    assert.equal(summary.response.headers.get('x-chordpanel-qa-scenario'), 'tag-generation-independent-progress')
    assert.equal(summary.response.headers.get('x-chordpanel-qa-projection'), 'qa-derived-synthetic-tag-generation-progress')
    assert.equal(summary.body.executionKind, 'tagGeneration')
    assert.equal(summary.body.job.status, 'Running')
    const progress = summary.body.progress
    assert.deepEqual([
      progress.plannedBlockCount,
      progress.generatedBlockCount,
      progress.storageAccountedTagCount,
    ], ['4', '3', '1'])
    assert.ok([
      progress.plannedBlockCount,
      progress.generatedBlockCount,
      progress.storageAccountedTagCount,
    ].every(value => typeof value === 'string'))
    assert.ok(Object.values(summary.body.references).every(value => value === null))
    for (const field of ['plannedPartCount', 'completedPartCount', 'persistedCount', 'duplicateCount', 'replacedCount']) {
      assert.equal(progress[field], null)
    }
    for (const [field, value] of Object.entries(summary.body.coverage)) {
      assert.equal(field === 'reasons' ? Array.isArray(value) : value === null, true)
    }

    const parts = await getJson(`/api/v1/jobs/${TAG_PROGRESS}/trace/parts?page=1&pageSize=200`)
    assert.equal(parts.response.status, 200)
    assert.equal(parts.response.headers.get('x-chordpanel-qa-source'), 'synthetic-visual-part')
    assert.equal(parts.response.headers.get('x-chordpanel-qa-scenario'), 'tag-generation-independent-progress')
    assert.equal(parts.response.headers.get('x-chordpanel-qa-fixture'), 'tag-generation-independent-progress-parts.json')
    assert.equal(parts.response.headers.get('x-chordpanel-qa-projection'), 'qa-synthetic-static-part')
    assert.deepEqual(parts.body.items.map(part => part.status), ['generated', 'running'])
    for (const field of [
      'observation', 'observations', 'observationId', 'protocol', 'links', 'packet', 'packets',
      'requestId', 'packetId', 'dispatchPacketId', 'task', 'tasks', 'taskIds', 'taskId',
      'generateTaskId', 'tagDumpTaskId', 'window', 'windows', 'windowIndex',
      'windowCorrelationId', 'challengeCorrelationId', 'linkKey', 'correlationId',
    ]) {
      assert.ok(parts.body.items.every(part => !Object.hasOwn(part, field)))
    }
    const totalFor = field => parts.body.items.reduce((sum, part) => sum + BigInt(part[field] ?? '0'), 0n).toString()
    assert.equal(totalFor('plannedBlockCount'), progress.plannedBlockCount)
    assert.equal(totalFor('generatedBlockCount'), progress.generatedBlockCount)
    assert.equal(totalFor('storageAccountedTagCount'), progress.storageAccountedTagCount)

    const job = await getJson(`/api/v1/jobs/${TAG_PROGRESS}`)
    assert.equal(job.response.status, 200, JSON.stringify(job.body))
    assert.equal(job.body.status, summary.body.job.status)
    assert.equal(Object.hasOwn(job.body, 'taskIds'), false)
    const tasks = await getJson(`/api/v1/jobs/${TAG_PROGRESS}/tasks`)
    assert.equal(tasks.response.status, 501)
    assert.equal(tasks.body.error, 'tasks_not_captured')
    assert.match(tasks.body.detail, /will not synthesize Task IDs or statuses/)
    assert.equal(tasks.response.headers.get('x-chordpanel-qa-scenario'), 'tag-generation-independent-progress')
    for (const resource of ['observations', 'links', 'protocol']) {
      const missing = await getJson(`/api/v1/jobs/${TAG_PROGRESS}/trace/${resource}`)
      assert.equal(missing.response.status, 501)
      assert.equal(missing.body.error, 'trace_resource_not_captured')
    }
  })

  it('serves only link pages that exist', async () => {
    const first = await getJson(`/api/v1/jobs/${EXACT}/trace/links?page=1&pageSize=200`)
    assert.equal(first.response.status, 200)
    assert.equal(first.body.items.length, 7)

    const beyond = await getJson(`/api/v1/jobs/${EXACT}/trace/links?page=2&pageSize=200`)
    assert.equal(beyond.response.status, 200)
    assert.deepEqual(beyond.body.items, [])
    assert.equal(beyond.body.hasMore, false)
  })
})

describe('synthetic routes', () => {
  it('labels every synthetic payload and answers the base pages', async () => {
    const status = await getJson('/api/v1/system/status')
    assert.equal(status.response.status, 200)
    assert.equal(status.response.headers.get('x-chordpanel-qa-source'), 'synthetic')
    assert.equal(typeof status.body.admin.cpuUsage, 'number')

    const jobs = await getJson('/api/v1/jobs?status=Succeeded&page=1&pageSize=2&sortBy=createdAtMs&ascending=false')
    assert.equal(jobs.response.status, 200)
    assert.equal(jobs.body.items.length, 2)
    assert.equal(jobs.body.pageSize, 2)
    assert.ok(jobs.body.items.every(job => job.status === 'Succeeded'))
    assert.ok(jobs.body.items.every(job => !('history' in job)))

    const detail = await getJson(`/api/v1/jobs/${jobs.body.items[0].jobId}`)
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body))
    assert.equal(detail.body.metadata.qaFixture, 'synthetic')
    assert.ok(Array.isArray(detail.body.history))
    const algorithmJob = await getJson('/api/v1/jobs/33333333-3333-4333-8333-333333333333')
    assert.equal(algorithmJob.body.metadata.algorithmId, 'd93b1655-af7d-411e-9de2-e80cbd21e185')
    assert.equal(algorithmJob.body.statusMessage, '{"algorithmId":"d93b1655-af7d-411e-9de2-e80cbd21e185"}')
    const algorithmTask = await getJson('/api/v1/jobs/33333333-3333-4333-8333-333333333333/tasks?page=1&pageSize=20')
    assert.equal(algorithmTask.body.items[0].resultSummary.algorithmId, 'd93b1655-af7d-411e-9de2-e80cbd21e185')

    const tables = await getJson('/api/v1/audit-tables?page=1&pageSize=20')
    assert.equal(tables.response.status, 200)
    assert.equal(typeof tables.body.items[0].tableId, 'string')
    assert.equal(tables.body.totalPages, 1)
  })

  it('does not count the configured Admin identity as a registered node', async () => {
    const { response, body } = await getJson('/api/v1/system/status')
    assert.equal(response.status, 200)
    assert.equal(body.admin.adminId, 'qa-admin-configured')
    assert.equal(body.cluster.totalNodes, 3)
    assert.equal(body.cluster.nodesByRole.Admin, undefined)
    const nodes = await getJson('/api/v1/nodes?page=1&pageSize=20')
    assert.equal(nodes.body.total, 3)
    assert.ok(nodes.body.items.every(node => node.role !== 'Admin'))
  })

  it('rejects uncaptured node-level protocol events instead of inventing packet rows', async () => {
    const { response, body } = await getJson('/api/v1/nodes/Audit-1/protocol-events?page=1&pageSize=20')
    assert.equal(response.status, 501)
    assert.equal(body.error, 'protocol_events_not_captured')
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'fixture-missing')
  })

  it('filters jobs by metadata like the AuditTables bootstrap lookup', async () => {
    const { body } = await getJson(
      '/api/v1/jobs?page=1&pageSize=20&jobType=Replication&status=Pending&metadata.auditTableOperation=bootstrap',
    )
    assert.equal(body.total, 0)
  })

  it('serves explicitly synthetic tagged-range visual data for known owner/algorithm pairs', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    const automatic = await getJson(`/api/v1/audit-data/${ownerId}/tagged-ranges?initiatorId=1`)
    assert.equal(automatic.response.status, 200)
    assert.equal(automatic.response.headers.get('x-chordpanel-qa-source'), 'synthetic')
    assert.equal(automatic.response.headers.get('x-chordpanel-qa-projection'), 'synthetic-visual')
    assert.equal(automatic.body.algorithmId, 'd93b1655-af7d-411e-9de2-e80cbd21e185')
    assert.deepEqual(automatic.body.ranges, [
      { blockStart: 0, blockCount: 32 },
      { blockStart: 48, blockCount: 16 },
      { blockStart: 128, blockCount: 64 },
    ])

    const empty = await getJson(
      `/api/v1/audit-data/${ownerId}/tagged-ranges?algorithmId=fdf2f101-6da8-47aa-9ca5-3f7ab1bd5767`,
    )
    assert.equal(empty.response.status, 200)
    assert.deepEqual(empty.body.ranges, [])

    const unknown = await getJson(
      `/api/v1/audit-data/${ownerId}/tagged-ranges?algorithmId=not-captured`,
    )
    assert.equal(unknown.response.status, 404)
    assert.equal(unknown.body.error, 'qa_algorithm_not_in_fixture')
  })

})

describe('guard rails', () => {
  it('rejects writes with 501 and never mutates state', async () => {
    const response = await fetch(`${origin}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: { initiatorId: '1' }, params: { name: 'nope' } }),
    })
    assert.equal(response.status, 501)
    const body = await response.json()
    assert.equal(body.error, 'qa_read_only')

    const users = await getJson('/api/v1/users')
    assert.equal(users.body.total, synthetic.users.length)
  })

  it('answers 501 for routes outside the fixture surface', async () => {
    const { response, body } = await getJson('/api/v1/ownership/tree')
    assert.equal(response.status, 501)
    assert.equal(body.error, 'qa_route_not_implemented')
  })

  it('refuses non-loopback Host headers', async () => {
    const { status, body } = await rawGet('/qa/health', 'example.test')
    assert.equal(status, 403)
    assert.equal(body.error, 'qa_loopback_only')
  })

  it('exposes synthetic views and their intended execution links in the QA inventory', async () => {
    const { response, body } = await getJson('/qa/health')
    assert.equal(response.status, 200)
    assert.equal(body.mode, 'fixtures')
    assert.equal(body.liveBackend, false)
    assert.equal(body.scenarios.length, qaScenarioViews.length)
    assert.ok(body.scenarios.some(scenario => scenario.id === 'challenge-animation-running'))
    assert.ok(body.scenarios.some(scenario => scenario.id === 'tag-generation-independent-progress'))

    const indexResponse = await fetch(`${origin}/qa`)
    assert.equal(indexResponse.status, 200)
    const index = await indexResponse.text()
    assert.match(index, /challenge-animation-running/)
    assert.match(index, /qaView=challenge-animation-running/)
    assert.match(index, /tag-generation-independent-progress/)
    assert.match(index, /合成独立进度 4\/3\/1/)
  })
})
