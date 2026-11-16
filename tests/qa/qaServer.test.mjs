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
  SYNTHETIC_GRAPH_FLOW_ID,
  SYNTHETIC_GRAPH_JOB_ID,
  SYNTHETIC_GRAPH_SCENARIO_FILE,
  SYNTHETIC_TAG_PROGRESS_JOB_ID,
  SYNTHETIC_TRACE_FIXTURE_DIR,
  TASK_STATE_JOB_ID,
  TRACE_FIXTURE_DIR,
  graphQaScenario,
  qaScenarioViews,
  taskStateScenario,
  traceScenarios,
} from './manifest.mjs'
import { loadGraphScenario } from './graphScenario.mjs'
import { createQaServer } from './server.mjs'
import {
  availableResources,
  buildDerivedSummaryEnvelope,
  loadTraceRegistry,
} from './traceFixtures.mjs'
import {
  WRITE_SIMULATION_JOB_IDS,
  WRITE_SIMULATION_SCENARIO,
  WRITE_SIMULATION_SELECTORS,
  WRITE_SIMULATION_SOURCE,
} from './writeSimulation.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const fixtureDir = path.join(repoRoot, TRACE_FIXTURE_DIR)
const syntheticFixtureDir = path.join(repoRoot, SYNTHETIC_TRACE_FIXTURE_DIR)
const synthetic = JSON.parse(readFileSync(path.join(repoRoot, SYNTHETIC_FIXTURE_FILE), 'utf8'))
const graphScenarioPath = path.join(repoRoot, SYNTHETIC_GRAPH_SCENARIO_FILE)

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
  server = createQaServer({
    registry,
    synthetic,
    graphScenario: loadGraphScenario(graphScenarioPath),
    graphScenarioMeta: graphQaScenario,
    appOrigin: 'http://localhost:5173',
  })
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

async function requestJson(base, pathname, { method = 'GET', body } = {}) {
  const options = { method, headers: {} }
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const response = await fetch(`${base}${pathname}`, options)
  const text = await response.text()
  return { response, body: text ? JSON.parse(text) : null }
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
    assert.equal(qaScenarioViews.length, traceScenarios.length + 2)
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
    const identityJob = registry.jobs.get('371f5280-b7ae-4252-841b-d3365b5dfd4b')
    const identityDefault = identityJob.views.get('identity-worker')
    const identityPreview = identityJob.views.get('identity-worker-summary-preview')
    for (const resource of ['observations', 'links']) {
      assert.strictEqual(identityPreview.resources[resource], identityDefault.resources[resource])
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
  it('creates a synthetic Identity summary preview without inferring a verdict', () => {
    const envelope = buildDerivedSummaryEnvelope('371f5280-b7ae-4252-841b-d3365b5dfd4b', {
      syntheticIdentitySummary: true,
    })
    assert.equal(envelope.executionKind, 'identityVerification')
    assert.equal(envelope.job.status, 'Succeeded')
    assert.equal(envelope.references.verifyType, 'cell')
    assert.equal(envelope.references.owner.userName, 'QA Data Owner')
    assert.equal(envelope.references.initiator.userName, 'QA Operator')
    assert.equal(envelope.references.rootHashPresent, true)
    assert.equal(envelope.references.ownerCount, '1')
    assert.equal(envelope.references.ownerRootHashCount, '1')
    assert.equal(envelope.coverage.workerStages, 'complete')
    assert.equal(envelope.references.verified, null)
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
    assert.equal(body.coverage.workerStages, null)
  })
  it('serves the Identity summary preview with synthetic coverage and detail metadata', async () => {
    const identityJob = '371f5280-b7ae-4252-841b-d3365b5dfd4b'
    const referrerPath = `/executions/${identityJob}?qaView=identity-worker-summary-preview`
    const summary = await getJson(`/api/v1/jobs/${identityJob}/trace`, { referrerPath })
    assert.equal(summary.response.headers.get('x-chordpanel-qa-source'), 'synthetic-visual-summary')
    assert.equal(summary.response.headers.get('x-chordpanel-qa-scenario'), 'identity-worker-summary-preview')
    assert.equal(summary.response.headers.get('x-chordpanel-qa-projection'), 'qa-derived-synthetic-identity-summary')
    assert.equal(summary.body.coverage.workerStages, 'complete')
    assert.equal(summary.body.references.rootHashPresent, true)
    assert.equal(summary.body.references.verified, null)
    assert.equal(summary.body.job.status, 'Succeeded')

    const job = await getJson(`/api/v1/jobs/${identityJob}`, { referrerPath })
    assert.equal(job.response.headers.get('x-chordpanel-qa-projection'), 'qa-synthetic-identity-details')
    assert.equal(job.body.metadata._rootHash, 'qa-root-hash-visual-only-371f5280')
    assert.equal(job.body.status, 'Succeeded')
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

  it('filters Jobs by typed operation in the Job Center', async () => {
    const { body } = await getJson(
      '/api/v1/jobs?page=1&pageSize=20&jobType=Storage&jobOperation=TagGeneration',
    )
    assert.ok(body.total > 0)
    assert.ok(body.items.every(job => job.jobOperation === 'TagGeneration'))
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

  it('serves a long-running Job whose stored Task ID list is incomplete and whose Tasks page', async () => {
    const detail = await getJson(`/api/v1/jobs/${TASK_STATE_JOB_ID}`)
    assert.equal(detail.response.status, 200)
    assert.equal(detail.body.status, 'Running')
    assert.equal(detail.body.endedAtMs, undefined)
    assert.equal(detail.body.totalDurationMs, undefined)
    assert.equal(detail.body.taskIdsComplete, false)
    assert.equal(detail.body.taskIds.length, 20)
    assert.equal(detail.body.metadata.qaTaskStateScenario, 'incomplete-task-list-long-running')

    const first = await getJson(`/api/v1/jobs/${TASK_STATE_JOB_ID}/tasks?page=1&pageSize=10`)
    assert.equal(first.response.status, 200)
    assert.equal(first.body.total, 23)
    assert.equal(first.body.items.length, 10)
    assert.equal(first.body.totalPages, 3)

    const last = await getJson(`/api/v1/jobs/${TASK_STATE_JOB_ID}/tasks?page=3&pageSize=10`)
    assert.equal(last.body.items.length, 3)
    assert.equal(last.body.items[0].taskId, '7b000000-0000-4000-8000-000000000015')
    // The three Tasks on the last page are not named by Job.taskIds.
    for (const task of last.body.items) {
      assert.equal(detail.body.taskIds.includes(task.taskId), false)
    }

    const all = await getJson(`/api/v1/jobs/${TASK_STATE_JOB_ID}/tasks?page=1&pageSize=50`)
    const running = all.body.items.filter(task => task.status === 'Running')
    assert.equal(running.length, 2)
    assert.ok(running.every(task => task.completedAtMs === undefined))
    assert.ok(all.body.items.some(task => task.status === 'Cancelled'))
    assert.ok(all.body.items.some(task => task.status === 'Failed'))

    const health = await getJson('/qa/health')
    assert.deepEqual(health.body.taskFixtures, [taskStateScenario])
  })

})

describe('synthetic graph scenario', () => {
  it('refuses a graph fixture that pretends to be an HTTP exchange', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-graph-'))
    const file = path.join(dir, 'graph.json')
    writeFileSync(file, JSON.stringify({
      qaSynthetic: true,
      note: 'masquerading recording',
      request: { method: 'GET', path: `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`, query: {} },
      response: { status: 200, body: {} },
    }))
    assert.throws(
      () => loadGraphScenario(file),
      /must not pretend to be a recording/,
    )
  })

  it('requires the authored pages to cover a crossed Activity span and a notification retry', () => {
    const original = JSON.parse(readFileSync(graphScenarioPath, 'utf8'))
    const broken = structuredClone(original)
    broken.streams.triggers.pages[1].rows = []
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-graph-'))
    const file = path.join(dir, 'graph.json')
    writeFileSync(file, JSON.stringify(broken))
    assert.throws(
      () => loadGraphScenario(file),
      /notification retry whose earlier attempt is no longer current/,
    )

    const brokenActivities = structuredClone(original)
    brokenActivities.streams.activities.pages[1].rows = []
    brokenActivities.streams.activities.pages[1].edges = []
    writeFileSync(file, JSON.stringify(brokenActivities))
    assert.throws(
      () => loadGraphScenario(file),
      /Activity span whose facts cross a page boundary/,
    )
  })

  it('keeps the authored scenario multi-stream and multi-page', () => {
    const scenario = loadGraphScenario(graphScenarioPath)
    assert.equal(scenario.jobId, SYNTHETIC_GRAPH_JOB_ID)
    assert.equal(scenario.flowId, SYNTHETIC_GRAPH_FLOW_ID)
    assert.equal(scenario.qaSynthetic, true)
    for (const stream of ['tasks', 'parts', 'observations', 'activities', 'triggers']) {
      assert.ok(scenario.streams[stream].pages.length > 1, `${stream} must be paged`)
    }
    assert.equal(scenario.streams.edges.pages.length, 1)
    assert.ok(scenario.flow.pages.length > 1)
    assert.equal(scenario.streams.tasks.mutableSource, true)
    assert.equal(scenario.streams.triggers.mutableSource, true)
    assert.equal(scenario.streams.observations.mutableSource, false)
  })
})

describe('graph routes', () => {
  it('serves a labeled synthetic multi-stream Job graph page', async () => {
    const { response, body } = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-chordpanel-qa'), 'fixtures')
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'synthetic')
    assert.equal(response.headers.get('x-chordpanel-qa-scenario'), graphQaScenario.id)
    assert.equal(response.headers.get('x-chordpanel-qa-fixture'), graphQaScenario.fixture)
    assert.equal(response.headers.get('x-chordpanel-qa-projection'), 'synthetic-graph+qa-bound-cap')
    assert.equal(body.qaSyntheticGraph, true)
    assert.equal(body.jobId, SYNTHETIC_GRAPH_JOB_ID)
    assert.equal(body.executionTraceId, `job:${SYNTHETIC_GRAPH_JOB_ID}`)
    assert.equal(body.job.status, 'Running')
    assert.equal(body.job.terminal, false)
    assert.equal(body.taskReferenceCount, '5')

    const streams = body.streams
    assert.deepEqual(Object.keys(streams).sort(), ['activities', 'edges', 'observations', 'parts', 'tasks', 'triggers'])
    assert.equal(streams.tasks.pageSize, '2')
    assert.equal(streams.tasks.returned, '2')
    assert.equal(streams.tasks.hasMore, true)
    assert.equal(streams.tasks.mutableSource, true)
    assert.equal(streams.tasks.referencesTotal, '5')
    assert.equal(streams.parts.windowsMaterialized, false)
    assert.equal(streams.parts.hasMore, true)
    assert.equal(streams.activities.groups, '1')
    assert.equal(streams.triggers.returned, '1')

    assert.equal(body.coverage.job, 'complete')
    assert.equal(body.coverage.tasks, 'partial')
    assert.equal(body.coverage.parts, 'complete')
    assert.equal(body.coverage.activities, 'partial')
    assert.deepEqual(body.coverage.reasons, ['SourceRecordUnavailable'])
    assert.equal(body.hasMore, true)
    assert.equal(body.cursorConsistency, 'eventual')

    assert.deepEqual(body.taskNodes.map(node => node.referenceIndex), [0, 1])
    assert.equal(body.taskNodes[0].statusState, 'available')
    assert.equal(body.taskNodes[0].remoteStopStatus, 'unknown')
    assert.equal(body.taskNodes[1].referenceState, 'empty')
    assert.equal(body.taskNodes[1].nodeId, null)
    assert.equal(body.triggerEdges[0].attempt, 1)
    assert.equal(body.triggerEdges[0].currentAttempt, false)
    assert.equal(body.triggerEdges[0].to.ref, `job:${SYNTHETIC_GRAPH_JOB_ID}`)
  })

  it('continues exactly one stream from its own cursor', async () => {
    const first = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`)
    const tasksCursor = first.body.streams.tasks.nextCursor
    assert.equal(typeof tasksCursor, 'string')

    const second = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?pageSize=200&taskCursor=${encodeURIComponent(tasksCursor)}`,
    )
    assert.equal(second.response.status, 200)
    assert.deepEqual(second.body.taskNodes.map(node => node.referenceIndex), [2])
    assert.equal(second.body.taskNodes[0].statusState, 'foreignRow')
    assert.equal(second.body.streams.tasks.hasMore, true)
    assert.equal(second.body.streams.tasks.pageSize, '2')

    const third = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?taskCursor=${encodeURIComponent(second.body.streams.tasks.nextCursor)}`,
    )
    assert.equal(third.response.status, 200)
    assert.deepEqual(third.body.taskNodes.map(node => [node.referenceIndex, node.statusState]), [
      [3, 'missingRow'],
      [4, 'unattributedRow'],
    ])
    assert.equal(third.body.taskNodes[0].status, null)
    assert.equal(third.body.streams.tasks.hasMore, false)
    assert.equal(third.body.streams.tasks.coverage, 'partial')
    // A cursor continues only its own stream; every other stream answers page 1.
    assert.deepEqual(third.body.observations.map(item => item.observationId), [
      '7f000000-0000-4000-8000-000000000001',
      '7f000000-0000-4000-8000-000000000002',
    ])
    assert.equal(third.body.streams.observations.hasMore, true)
  })

  it('reports a span whose facts cross a page boundary without merging the pages', async () => {
    const first = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`)
    const activitiesCursor = first.body.streams.activities.nextCursor
    const second = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?activityCursor=${encodeURIComponent(activitiesCursor)}`,
    )
    assert.equal(second.response.status, 200)
    const firstPageNode = first.body.activityNodes.find(node => node.activityId === 'act-layout-1')
    const secondPageNode = second.body.activityNodes.find(node => node.activityId === 'act-layout-1')
    assert.ok(firstPageNode)
    assert.ok(secondPageNode)
    assert.equal(firstPageNode.nodeId, secondPageNode.nodeId)
    assert.equal(firstPageNode.state, 'started')
    assert.equal(firstPageNode.observationCount, '2')
    assert.equal(secondPageNode.state, 'succeeded')
    assert.equal(secondPageNode.observationCount, '1')
    assert.equal(secondPageNode.terminal, true)
    assert.ok(second.body.activityNodes.some(node => node.activityId === 'act-dispatch-1'))
    assert.equal(second.body.streams.activities.groups, '2')
    assert.equal(second.body.streams.activities.hasMore, true)
    assert.equal(second.body.streams.activities.coverage, 'partial')
    for (const node of second.body.activityNodes) {
      const edge = second.body.activityEdges.find(candidate => candidate.to.ref === node.nodeId)
      assert.ok(edge, `missing derived parent edge for ${node.nodeId}`)
      assert.equal(edge.basis, 'persistedObservationParent')
      assert.equal(edge.from.ref, node.parentRef.ref)
    }

    const third = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?activityCursor=${encodeURIComponent(second.body.streams.activities.nextCursor)}`,
    )
    assert.equal(third.response.status, 200)
    assert.equal(third.body.streams.activities.hasMore, false)
    assert.equal(third.body.streams.activities.coverage, 'partial')
    const conflicting = third.body.activityNodes.find(node => node.activityId === 'act-conflict-1')
    assert.ok(conflicting)
    assert.equal(conflicting.conflicting, true)
    assert.equal(conflicting.lifecycle, null)
    assert.equal(conflicting.state, null)
    assert.equal(conflicting.parentState, 'conflicting')
    const conflictEdge = third.body.activityEdges.find(edge => edge.to.ref === conflicting.nodeId)
    assert.ok(conflictEdge)
    assert.equal(conflictEdge.parentState, 'conflicting')
    assert.equal(conflictEdge.confidence, 'partial')
    const orphan = third.body.activityNodes.find(node => node.activityId === 'act-orphan-1')
    assert.ok(orphan)
    assert.equal(orphan.parentRef.ref, 'task:7a000000-0000-4000-8000-000000000009')
    assert.equal(third.body.taskNodes.some(node => node.nodeId === orphan.parentRef.ref), false)
  })

  it('pages Parts and keeps relations with missing or unloaded endpoints unresolved', async () => {
    const first = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`)
    assert.equal(first.body.streams.parts.hasMore, true)
    const partsPage = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?partCursor=${encodeURIComponent(first.body.streams.parts.nextCursor)}`,
    )
    assert.equal(partsPage.response.status, 200)
    assert.deepEqual(partsPage.body.partNodes.map(node => node.partIndex), [2, 3])
    assert.equal(partsPage.body.partNodes[0].generateTaskRef.ref, 'task:7a000000-0000-4000-8000-000000000003')
    assert.equal(partsPage.body.partNodes[1].generateTaskRef.ref, 'task:7a000000-0000-4000-8000-000000000009')
    assert.equal(partsPage.body.streams.parts.hasMore, false)
    assert.equal(partsPage.body.streams.parts.coverage, 'partial')

    const missingTarget = first.body.edges.find(edge => edge.linkKey === '77777777:link:0003')
    assert.ok(missingTarget)
    assert.equal(missingTarget.to, null)
    assert.equal(first.body.job.terminal, false)
    assert.equal(first.body.taskNodes[0].remoteStopStatus, 'unknown')
    assert.equal(first.body.taskNodes[0].completedAtMs, null)
  })

  it('shows a retried notification whose earlier attempt is no longer current', async () => {
    const first = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`)
    const triggersCursor = first.body.streams.triggers.nextCursor
    const second = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?triggerCursor=${encodeURIComponent(triggersCursor)}`,
    )
    assert.equal(second.response.status, 200)
    const retryAttempts = second.body.triggerEdges
      .filter(edge => edge.notificationId === 'qa-notification-retry')
      .map(edge => [edge.attempt, edge.currentAttempt])
    assert.deepEqual(retryAttempts, [[2, true]])
    assert.equal(first.body.triggerEdges[0].attempt, 1)
    assert.equal(first.body.triggerEdges[0].currentAttempt, false)
    assert.ok(second.body.triggerEdges.some(edge =>
      edge.notificationId === 'qa-notification-dispatch' && edge.currentAttempt === true))
    assert.equal(second.body.streams.triggers.hasMore, false)
    assert.equal(second.body.streams.triggers.coverage, 'complete')
  })

  it('refuses unknown, foreign, tampered and re-bound graph cursors', async () => {
    const first = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph`)
    const activitiesCursor = first.body.streams.activities.nextCursor
    const tasksCursor = first.body.streams.tasks.nextCursor

    const wrongStream = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?taskCursor=${encodeURIComponent(activitiesCursor)}`,
    )
    assert.equal(wrongStream.response.status, 400)
    assert.equal(wrongStream.body.error, 'trace_cursor_invalid')
    assert.match(wrongStream.body.message, /activities stream, not tasks/)

    const tampered = `${activitiesCursor.slice(0, -1)}${activitiesCursor.endsWith('A') ? 'B' : 'A'}`
    const badChecksum = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?activityCursor=${encodeURIComponent(tampered)}`,
    )
    assert.equal(badChecksum.response.status, 400)
    assert.equal(badChecksum.body.error, 'trace_cursor_invalid')

    const rebounded = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?pageSize=1&taskCursor=${encodeURIComponent(tasksCursor)}`,
    )
    assert.equal(rebounded.response.status, 400)
    assert.equal(rebounded.body.error, 'trace_cursor_invalid')

    const malformed = await getJson(
      `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?edgeCursor=not-a-token`,
    )
    assert.equal(malformed.response.status, 400)
    assert.equal(malformed.body.error, 'trace_cursor_invalid')
  })

  it('rejects an out-of-range graph bound instead of clamping it', async () => {
    for (const bound of ['0', '201', '1.5', 'abc']) {
      const { response, body } = await getJson(
        `/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/graph?pageSize=${encodeURIComponent(bound)}`,
      )
      assert.equal(response.status, 400, `bound ${bound}`)
      assert.equal(body.error, 'trace_page_size_invalid')
    }
  })

  it('answers 501 for a recorded Job graph and 404 for an unknown Job', async () => {
    const recorded = await getJson(`/api/v1/jobs/${EXACT}/trace/graph`)
    assert.equal(recorded.response.status, 501)
    assert.equal(recorded.body.error, 'trace_resource_not_captured')
    assert.equal(recorded.response.headers.get('x-chordpanel-qa-source'), 'fixture-missing')
    assert.match(recorded.body.detail, /must be captured from a real backend run/)

    const unknown = await getJson('/api/v1/jobs/11111111-2222-4333-8444-555555555555/trace/graph')
    assert.equal(unknown.response.status, 404)
    assert.equal(unknown.body.error, 'job_not_found')
  })

  it('pages the synthetic flow listing with page-local parent edges', async () => {
    const first = await getJson(`/api/v1/flows/${SYNTHETIC_GRAPH_FLOW_ID}/trace/graph`)
    assert.equal(first.response.status, 200)
    assert.equal(first.response.headers.get('x-chordpanel-qa-source'), 'synthetic')
    assert.equal(first.response.headers.get('x-chordpanel-qa-scenario'), graphQaScenario.id)
    assert.equal(first.response.headers.get('x-chordpanel-qa-projection'), 'synthetic-flow-graph+qa-bound-cap')
    assert.equal(first.body.qaSyntheticGraph, true)
    assert.equal(first.body.flowId, SYNTHETIC_GRAPH_FLOW_ID)
    assert.equal(first.body.pageSize, '2')
    assert.equal(first.body.returned, '2')
    assert.equal(first.body.hasMore, true)
    assert.equal(first.body.coverage, 'partial')
    assert.deepEqual(first.body.reasons, ['SourceRecordUnavailable'])
    assert.deepEqual(first.body.jobNodes.map(node => node.jobId), [
      SYNTHETIC_GRAPH_JOB_ID,
      `${SYNTHETIC_GRAPH_JOB_ID.slice(0, -1)}8`,
    ])
    assert.equal(first.body.parentEdges.length, 1)
    assert.equal(first.body.parentEdges[0].kind, 'jobParent')

    const second = await getJson(
      `/api/v1/flows/${SYNTHETIC_GRAPH_FLOW_ID}/trace/graph?jobCursor=${encodeURIComponent(first.body.nextCursor)}`,
    )
    assert.equal(second.response.status, 200)
    assert.equal(second.body.returned, '2')
    assert.equal(second.body.hasMore, true)
    assert.equal(second.body.parentEdges.length, 1)
    assert.equal(second.body.parentEdges[0].to.ref, `job:${second.body.jobNodes[1].jobId}`)

    const third = await getJson(
      `/api/v1/flows/${SYNTHETIC_GRAPH_FLOW_ID}/trace/graph?jobCursor=${encodeURIComponent(second.body.nextCursor)}`,
    )
    assert.equal(third.response.status, 200)
    assert.equal(third.body.returned, '1')
    assert.equal(third.body.hasMore, false)
    assert.equal(third.body.coverage, 'complete')
    assert.deepEqual(third.body.reasons, [])
    assert.deepEqual(third.body.parentEdges, [])
  })

  it('rejects an unknown flow and a re-bound flow cursor', async () => {
    const unknown = await getJson('/api/v1/flows/not-a-qa-flow/trace/graph')
    assert.equal(unknown.response.status, 404)
    assert.equal(unknown.body.error, 'flow_not_found')

    const first = await getJson(`/api/v1/flows/${SYNTHETIC_GRAPH_FLOW_ID}/trace/graph`)
    const rebounded = await getJson(
      `/api/v1/flows/${SYNTHETIC_GRAPH_FLOW_ID}/trace/graph?pageSize=1&jobCursor=${encodeURIComponent(first.body.nextCursor)}`,
    )
    assert.equal(rebounded.response.status, 400)
    assert.equal(rebounded.body.error, 'trace_cursor_invalid')
  })

  it('serves authored Trace reads for the graph Job with an explicitly empty protocol page', async () => {
    const summary = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace`)
    assert.equal(summary.response.status, 200)
    assert.equal(summary.response.headers.get('x-chordpanel-qa-source'), 'synthetic')
    assert.equal(summary.response.headers.get('x-chordpanel-qa-projection'), 'synthetic-graph+qa-authored-trace')
    assert.equal(summary.body.jobId, SYNTHETIC_GRAPH_JOB_ID)
    assert.equal(summary.body.job.status, 'Running')
    assert.equal(summary.body.job.endedAtMs, null)
    assert.equal(summary.body.coverage.tasks, 'partial')
    assert.equal(summary.body.coverage.protocol, 'notInstrumented')
    assert.ok(summary.body.coverage.reasons.includes('ProtocolPacketUnavailable'))
    assert.equal(summary.body.progress.generatedBlockCount, null)
    assert.equal(summary.body.qaDerivedSummary, true)

    const parts = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/parts?page=1&pageSize=200`)
    assert.equal(parts.response.status, 200)
    assert.equal(parts.body.total, 4)
    assert.equal(parts.body.items.length, 4)
    assert.equal(parts.body.coverage, 'partial')
    assert.equal(parts.body.items[0].generateTaskId, '7a000000-0000-4000-8000-000000000001')
    assert.equal(parts.body.items[3].generateTaskId, '7a000000-0000-4000-8000-000000000009')

    const observations = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/observations`)
    assert.equal(observations.response.status, 200)
    assert.equal(observations.body.items.length, 3)
    assert.equal(observations.body.hasMore, false)
    assert.equal(observations.body.nextCursor, null)

    const links = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/links?page=1&pageSize=200`)
    assert.equal(links.response.status, 200)
    assert.equal(links.body.total, 3)
    assert.equal(links.body.items[2].linkKey, '77777777:link:0003')
    assert.equal(links.body.items[2].to, null)

    const protocol = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/trace/protocol`)
    assert.equal(protocol.response.status, 200)
    assert.equal(protocol.response.headers.get('x-chordpanel-qa-source'), 'synthetic')
    assert.equal(protocol.response.headers.get('x-chordpanel-qa-projection'), 'synthetic-graph+qa-authored-trace')
    assert.deepEqual(protocol.body.items, [])
    assert.equal(protocol.body.hasMore, false)
    assert.equal(protocol.body.nextCursor, null)
    assert.equal(protocol.body.coverage, 'notInstrumented')
    assert.deepEqual(protocol.body.reasons, ['ProtocolPacketUnavailable'])
    assert.equal(protocol.body.qaSyntheticGraph, true)

    const tasks = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}/tasks?page=1&pageSize=20`)
    assert.equal(tasks.response.status, 200)
    assert.equal(tasks.body.total, 1)
    assert.equal(tasks.body.items[0].taskId, '7a000000-0000-4000-8000-000000000001')
    assert.equal(tasks.body.items[0].status, 'Running')
    assert.equal(tasks.body.items[0].completedAtMs, undefined)

    const job = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}`)
    assert.equal(job.body.taskIdsComplete, false)
    assert.deepEqual(job.body.taskIds, ['7a000000-0000-4000-8000-000000000001'])
  })

  it('exposes the flow identity on the synthetic Job detail and in the graph inventory', async () => {
    const job = await getJson(`/api/v1/jobs/${SYNTHETIC_GRAPH_JOB_ID}`)
    assert.equal(job.response.status, 200)
    assert.equal(job.body.flowId, SYNTHETIC_GRAPH_FLOW_ID)
    assert.equal(job.body.metadata.qaGraphScenario, 'synthetic')

    const health = await getJson('/qa/health')
    assert.equal(health.body.graphs.length, 1)
    const graph = health.body.graphs[0]
    assert.equal(graph.id, graphQaScenario.id)
    assert.equal(graph.jobId, SYNTHETIC_GRAPH_JOB_ID)
    assert.equal(graph.flowId, SYNTHETIC_GRAPH_FLOW_ID)
    assert.equal(graph.flowPages, 3)
    assert.deepEqual(graph.streams.map(stream => stream.name), [
      'tasks', 'parts', 'observations', 'activities', 'edges', 'triggers',
    ])
    assert.deepEqual(graph.streams.map(stream => [stream.name, stream.pages]), [
      ['tasks', 3],
      ['parts', 2],
      ['observations', 2],
      ['activities', 3],
      ['edges', 1],
      ['triggers', 2],
    ])
  })
})

describe('opt-in write simulation', () => {
  let simServer
  let simOrigin

  before(async () => {
    const registry = loadTraceRegistry({ fixtureDir, syntheticFixtureDir, scenarios: traceScenarios })
    simServer = createQaServer({
      registry,
      synthetic,
      graphScenario: loadGraphScenario(graphScenarioPath),
      graphScenarioMeta: graphQaScenario,
      simulateWrites: true,
      simulateLongWaitMs: 40,
      appOrigin: 'http://localhost:5173',
    })
    simServer.listen(0, '127.0.0.1')
    await once(simServer, 'listening')
    simOrigin = `http://127.0.0.1:${simServer.address().port}`
  })

  after(async () => {
    const closed = once(simServer, 'close')
    simServer.closeAllConnections?.()
    simServer.close()
    await closed
  })

  it('labels every simulated answer and keeps the inventory honest', async () => {
    const health = await requestJson(simOrigin, '/qa/health')
    assert.equal(health.body.mode, 'fixtures+write-simulation')
    assert.equal(health.body.liveBackend, false)
    assert.equal(health.body.writeSimulation.enabled, true)
    assert.equal(health.body.writeSimulation.scenario, WRITE_SIMULATION_SCENARIO)
    assert.equal(health.body.writeSimulation.longWaitMs, 40)
    assert.ok(health.body.writeSimulation.routes.length > 0)

    const { response, body } = await requestJson(simOrigin, '/v1/ownership/refresh/retry', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: {
          ownerId: '11111111-1111-4111-8111-111111111111',
          pendingRevision: 7,
          reason: 'qa',
        },
      },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-chordpanel-qa-source'), WRITE_SIMULATION_SOURCE)
    assert.equal(response.headers.get('x-chordpanel-qa-scenario'), WRITE_SIMULATION_SCENARIO)
    assert.equal(body.qaSimulatedWrite, true)
  })

  it('answers maintenance with a Pending dispatch and binding conflicts without changing state', async () => {
    const beforeJobs = await requestJson(simOrigin, '/api/v1/jobs?page=1&pageSize=50')
    const accepted = await requestJson(simOrigin, '/v1/audit/maintenance', {
      method: 'POST',
      body: {
        request: { initiatorId: '1', dataOwnerId: '11111111-1111-4111-8111-111111111111' },
        params: { maintenanceOp: 'Update', blockRanges: 'ranges-v1:1+2' },
      },
    })
    assert.equal(accepted.response.status, 202)
    assert.equal(accepted.body.jobId, WRITE_SIMULATION_JOB_IDS.maintenance)
    assert.equal(accepted.body.status, 'Pending')
    assert.equal(accepted.body.maintenanceOp, 'Update')
    assert.equal(accepted.body.fileId, '11111111-1111-4111-8111-111111111111')

    const job = await requestJson(simOrigin, `/api/v1/jobs/${WRITE_SIMULATION_JOB_IDS.maintenance}`)
    assert.equal(job.body.status, 'Pending')
    assert.equal(job.body.endedAtMs, undefined)

    const autoConflict = await requestJson(simOrigin, '/v1/audit/maintenance', {
      method: 'POST',
      body: {
        request: { initiatorId: '1', dataOwnerId: '22222222-2222-4222-8222-222222222222' },
        params: { maintenanceOp: 'Update', blockRanges: 'ranges-v1:1+2' },
      },
    })
    assert.equal(autoConflict.response.status, 409)
    assert.equal(autoConflict.body.error, 'NoAuditAlgorithmBinding')
    assert.equal(autoConflict.body.qaSimulatedWrite, true)

    const explicitConflict = await requestJson(simOrigin, '/v1/audit/algorithms/d93b1655-af7d-411e-9de2-e80cbd21e185/maintenance', {
      method: 'POST',
      body: {
        request: { initiatorId: '1', dataOwnerId: '22222222-2222-4222-8222-222222222222' },
        params: { maintenanceOp: 'Update', blockRanges: 'ranges-v1:1+2' },
      },
    })
    assert.equal(explicitConflict.response.status, 409)
    assert.equal(explicitConflict.body.error, 'NonAuditAlgorithmBinding')

    const staticAlgorithm = await requestJson(simOrigin, '/v1/audit/algorithms/qa-static-algorithm/maintenance', {
      method: 'POST',
      body: {
        request: { initiatorId: '1', dataOwnerId: '11111111-1111-4111-8111-111111111111' },
        params: { maintenanceOp: 'Update', blockRanges: 'ranges-v1:1+2' },
      },
    })
    assert.equal(staticAlgorithm.response.status, 405)
    assert.equal(staticAlgorithm.body.error, 'MethodNotAllowed')

    const afterJobs = await requestJson(simOrigin, '/api/v1/jobs?page=1&pageSize=50')
    assert.equal(afterJobs.body.total, beforeJobs.body.total)
  })

  it('separates source-change replay, conflict and drift decisions', async () => {
    const accepted = await requestJson(simOrigin, '/v1/audit-data/11111111-1111-4111-8111-111111111111/source-change-jobs', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { notificationId: 'qa-notification-42' },
      },
    })
    assert.equal(accepted.response.status, 202)
    assert.equal(accepted.body.jobId, WRITE_SIMULATION_JOB_IDS.sourceChange)

    const conflict = await requestJson(simOrigin, '/v1/audit-data/11111111-1111-4111-8111-111111111111/source-change-jobs', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { notificationId: 'qa-source-conflict', tuples: [] },
      },
    })
    assert.equal(conflict.response.status, 409)
    assert.equal(conflict.body.error, 'SourceChangeConflict')

    const approved = await requestJson(simOrigin, '/v1/audit-data/11111111-1111-4111-8111-111111111111/source-drift-recoveries/qa-drift-approved/approve-baseline', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { driftRevision: 8 },
      },
    })
    assert.equal(approved.response.status, 200)
    assert.equal(approved.body.baselineDecision, 'Approved')

    const driftConflict = await requestJson(simOrigin, '/v1/audit-data/11111111-1111-4111-8111-111111111111/source-drift-recoveries/qa-drift-conflict/approve-baseline', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { driftRevision: 8 },
      },
    })
    assert.equal(driftConflict.response.status, 409)
    assert.equal(driftConflict.body.error, 'SourceBaselineDecisionConflict')
  })

  it('returns a bounded GC pass, a cursor continuation, a blocked report and a labelled long wait', async () => {
    const first = await requestJson(simOrigin, '/v1/audit/material-gc/run-pass', {
      method: 'POST',
      body: { request: { initiatorId: '1' }, params: {} },
    })
    assert.equal(first.response.status, 200)
    assert.equal(first.body.moreWorkPending, true)
    assert.equal(first.body.nextLifecycleCursor, WRITE_SIMULATION_SELECTORS.materialGc.cursorNextPage)
    assert.ok(first.body.reports.some(report => report.outcome === 'Blocked'))

    const next = await requestJson(simOrigin, '/v1/audit/material-gc/run-pass', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { afterVersionId: WRITE_SIMULATION_SELECTORS.materialGc.cursorNextPage },
      },
    })
    assert.equal(next.response.status, 200)
    assert.equal(next.body.moreWorkPending, false)
    assert.equal(next.body.nextLifecycleCursor, null)

    const busy = await requestJson(simOrigin, '/v1/audit/material-gc/run-pass', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { afterVersionId: WRITE_SIMULATION_SELECTORS.materialGc.cursorConflict },
      },
    })
    assert.equal(busy.response.status, 409)
    assert.equal(busy.body.error, 'MaterialGcPassInProgress')

    const startedAt = Date.now()
    const longWait = await requestJson(simOrigin, '/v1/audit/material-gc/run-pass', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: { afterVersionId: WRITE_SIMULATION_SELECTORS.materialGc.cursorLongWait },
      },
    })
    assert.ok(Date.now() - startedAt >= 30)
    assert.equal(longWait.response.status, 200)
    assert.equal(longWait.body.moreWorkPending, true)
    assert.equal(longWait.body.reports[0].outcome, 'InFlight')
    assert.match(longWait.body.reports[0].detail, /不声称已经完成/)
  })

  it('distinguishes Created, AlreadyActive and Blocked re-arm outcomes', async () => {
    const created = await requestJson(simOrigin, '/v1/audit/material-gc/rearm', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: {
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-retryable',
        },
      },
    })
    assert.equal(created.response.status, 202)
    assert.equal(created.body.outcome, 'Created')
    assert.equal(created.body.jobId, WRITE_SIMULATION_JOB_IDS.materialGcSuccessor)

    const job = await requestJson(simOrigin, `/api/v1/jobs/${WRITE_SIMULATION_JOB_IDS.materialGcSuccessor}`)
    assert.equal(job.body.status, 'Pending')

    const active = await requestJson(simOrigin, '/v1/audit/material-gc/rearm', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: {
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-active',
        },
      },
    })
    assert.equal(active.response.status, 200)
    assert.equal(active.body.outcome, 'AlreadyActive')

    const blocked = await requestJson(simOrigin, '/v1/audit/material-gc/rearm', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: {
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-blocked',
        },
      },
    })
    assert.equal(blocked.response.status, 409)
    assert.equal(blocked.body.error, 'MaterialGcRearmBlocked')
  })

  it('reports a retryable and a non-retryable ownership refresh without changing state', async () => {
    const retried = await requestJson(simOrigin, '/v1/ownership/refresh/retry', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: {
          ownerId: '11111111-1111-4111-8111-111111111111',
          pendingRevision: 7,
          reason: 'qa',
        },
      },
    })
    assert.equal(retried.response.status, 200)
    assert.equal(retried.body.retried, true)
    assert.equal(retried.body.pendingRevision, 7)
    assert.equal(retried.body.message, undefined)

    const notRetried = await requestJson(simOrigin, '/v1/ownership/refresh/retry', {
      method: 'POST',
      body: {
        request: { initiatorId: '1' },
        params: {
          ownerId: '11111111-1111-4111-8111-111111111111',
          pendingRevision: 8,
          reason: 'qa',
        },
      },
    })
    assert.equal(notRetried.response.status, 200)
    assert.equal(notRetried.body.retried, false)
    assert.match(notRetried.body.message, /no retryable ownership refresh failure/)
  })

  it('still rejects writes outside the documented simulation', async () => {
    const { response, body } = await requestJson(simOrigin, '/v1/users', {
      method: 'POST',
      body: { request: { initiatorId: '1' }, params: { name: 'nope' } },
    })
    assert.equal(response.status, 501)
    assert.equal(body.error, 'qa_read_only')
    assert.equal(response.headers.get('x-chordpanel-qa-source'), 'read-only')
  })
})

describe('guard rails', () => {
  it('rejects writes with 501 and never mutates state', async () => {
    const beforeJobs = await getJson('/api/v1/jobs?page=1&pageSize=50')
    const posts = [
      { pathname: '/api/v1/users', body: { request: { initiatorId: '1' }, params: { name: 'nope' } } },
      {
        pathname: '/v1/audit/maintenance',
        body: {
          request: { initiatorId: '1', dataOwnerId: '11111111-1111-4111-8111-111111111111' },
          params: { maintenanceOp: 'Update', blockRanges: 'ranges-v1:1+2' },
        },
      },
      {
        pathname: '/v1/audit/material-gc/run-pass',
        body: { request: { initiatorId: '1' }, params: { afterVersionId: 'qa-gc-cursor-2' } },
      },
      {
        pathname: '/v1/audit/material-gc/rearm',
        body: {
          request: { initiatorId: '1' },
          params: { ownerId: 'x', algorithmId: 'y', versionId: 'z' },
        },
      },
      {
        pathname: '/v1/ownership/refresh/retry',
        body: {
          request: { initiatorId: '1' },
          params: { ownerId: 'x', pendingRevision: 7, reason: 'qa' },
        },
      },
      {
        pathname: '/v1/audit-data/11111111-1111-4111-8111-111111111111/source-change-jobs',
        body: { request: { initiatorId: '1' }, params: { notificationId: 'qa-source-accepted' } },
      },
    ]
    for (const { pathname, body: requestBody } of posts) {
      const response = await fetch(`${origin}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      assert.equal(response.status, 501, pathname)
      const body = await response.json()
      assert.equal(body.error, 'qa_read_only', pathname)
      assert.equal(response.headers.get('x-chordpanel-qa-source'), 'read-only', pathname)
    }

    const users = await getJson('/api/v1/users')
    assert.equal(users.body.total, synthetic.users.length)
    const afterJobs = await getJson('/api/v1/jobs?page=1&pageSize=50')
    assert.equal(afterJobs.body.total, beforeJobs.body.total)
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
    assert.equal(body.writeSimulation.enabled, false)
    assert.deepEqual(body.writeSimulation.routes, [])
    assert.deepEqual(body.taskFixtures, [taskStateScenario])
    assert.equal(body.scenarios.length, qaScenarioViews.length)
    assert.ok(body.scenarios.some(scenario => scenario.id === 'challenge-animation-running'))
    assert.ok(body.scenarios.some(scenario => scenario.id === 'tag-generation-independent-progress'))
    assert.ok(body.scenarios.some(scenario => scenario.id === 'identity-worker-summary-preview'))

    const indexResponse = await fetch(`${origin}/qa`)
    assert.equal(indexResponse.status, 200)
    const index = await indexResponse.text()
    assert.match(index, /<html lang="zh-CN">/)
    assert.match(index, /<title>ChordPanel 本地夹具<\/title>/)
    assert.match(index, /<strong>本地夹具 · 非真实后端<\/strong>/)
    assert.match(index, /challenge-animation-running/)
    assert.match(index, /qaView=challenge-animation-running/)
    assert.match(index, /tag-generation-independent-progress/)
    assert.match(index, /Tag generation · synthetic independent progress 4\/3\/1/)
    assert.match(index, /task-state-incomplete/)
    assert.match(index, /\/jobs\?jobId=88888888-8888-4888-8888-888888888888/)
    assert.match(index, /默认只读，写接口返回 <code>501 qa_read_only<\/code>/)
  })
})
