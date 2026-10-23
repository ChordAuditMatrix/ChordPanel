/**
 * Loads and validates the recorded trace fixtures declared by `manifest.mjs`.
 *
 * The loader is the only place that touches fixture bytes. It never rewrites a
 * captured body: it extracts `response.body` from the recorded HTTP exchange and
 * proves that the file belongs to the Job that claims it.
 *
 * Validation is deliberately strict, because the two checkouts contain
 * same-named files that describe *different* Jobs:
 *
 * 1. The recorded request path must target `scenario.jobId` and the resource the
 *    manifest declares (a summary file can never be served as `/observations`).
 * 2. Every Job identifier inside the body (`jobId`, `executionTraceId`, and each
 *    item's `jobId`) must equal `scenario.jobId`.
 * 3. When a scenario captures both Links and protocol packets, every packet must
 *    be reachable from a `protocolPacket` Link of the same node. This is the
 *    join the UI performs, so a mismatched pair means files from two different
 *    captures were mixed.
 */

import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/** Trace resources exposed by `/v1/jobs/{jobId}/trace*`. */
const TRACE_RESOURCE_NAMES = ['summary', 'observations', 'parts', 'links', 'protocol']

const TRACE_PATH = /^\/api\/v1\/jobs\/([^/]+)\/trace(?:\/(observations|parts|links|protocol))?$/

/**
 * Map a captured request path to the trace resource it answers.
 * Returns null when the path is not a trace route.
 * @param {string} path
 * @returns {string | null}
 */
function resourceFromTracePath(path) {
  const match = TRACE_PATH.exec(path)
  if (!match) return null
  return match[2] ?? 'summary'
}

/** Job id of a captured trace request path, or null. */
function jobIdFromTracePath(path) {
  const match = TRACE_PATH.exec(path)
  return match ? match[1] : null
}

/**
 * QA-only Summary envelope for a Job whose Summary was never captured.
 *
 * By default, unknown Job facts remain null. Explicit visual contexts set only
 * the fields needed by their QA surface; none of them becomes a backend fact.
 *
 * @param {string} jobId
 * @param {{
 *   syntheticIdentityScope?: 'cell' | 'row' | 'table',
 *   syntheticChallengeRunning?: true,
 *   syntheticTagGenerationProgress?: true,
 * }} [visualContext]
 */
export function buildDerivedSummaryEnvelope(jobId, visualContext = {}) {
  const envelope = {
    schemaVersion: 1,
    executionTraceId: `job:${jobId}`,
    jobId,
    executionKind: null,
    job: {
      status: null,
      errorCode: null,
      createdAtMs: null,
      endedAtMs: null,
    },
    references: {
      owner: null,
      initiator: null,
      algorithmId: null,
      tableId: null,
      storageNodeId: null,
      verifyType: null,
      rowId: null,
      columnId: null,
      verified: null,
      rootHashPresent: null,
      ownerCount: null,
      ownerRootHashCount: null,
    },
    progress: {
      plannedPartCount: null,
      completedPartCount: null,
      plannedBlockCount: null,
      generatedBlockCount: null,
      storageAccountedTagCount: null,
      persistedCount: null,
      duplicateCount: null,
      replacedCount: null,
    },
    coverage: {
      job: null,
      tasks: null,
      parts: null,
      protocol: null,
      workerStages: null,
      reasons: [],
    },
    observedAtMs: null,
    /** QA-only marker: this envelope is not a recorded backend response. */
    qaDerivedSummary: true,
  }

  if (visualContext.syntheticIdentityScope !== undefined) {
    if (!['cell', 'row', 'table'].includes(visualContext.syntheticIdentityScope)) {
      throw new Error(`Invalid synthetic identity scope: ${visualContext.syntheticIdentityScope}`)
    }
    envelope.executionKind = 'identityVerification'
    envelope.references.verifyType = visualContext.syntheticIdentityScope
  }
  if (visualContext.syntheticChallengeRunning === true) {
    envelope.executionKind = 'challengeProof'
    envelope.job.status = 'Running'
  }
  if (visualContext.syntheticTagGenerationProgress === true) {
    envelope.executionKind = 'tagGeneration'
    envelope.job.status = 'Running'
    envelope.progress.plannedBlockCount = '4'
    envelope.progress.generatedBlockCount = '3'
    envelope.progress.storageAccountedTagCount = '1'
  }

  return envelope
}

function fail(message) {
  throw new Error(`[qa fixtures] ${message}`)
}

function assertJobId(actual, expected, where) {
  if (actual === undefined || actual === null) return
  if (actual !== expected) {
    fail(`${where} belongs to Job ${String(actual)} but the manifest declares ${expected}. `
      + 'Same-named captures from different checkouts must not be mixed.')
  }
}

function readCapture(filePath, label) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (cause) {
    fail(`${label}: cannot read ${filePath} (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    fail(`${label}: ${filePath} is not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  const request = parsed?.request
  const response = parsed?.response
  if (typeof request?.path !== 'string' || typeof request?.method !== 'string') {
    fail(`${label}: ${filePath} has no recorded request envelope`)
  }
  if (!response || typeof response.status !== 'number' || response.body === undefined) {
    fail(`${label}: ${filePath} has no recorded response envelope`)
  }
  return { request, response }
}

/**
 * Verify that one recorded file really answers the declared Job + resource.
 * @param {object} args
 * @param {string} args.label
 * @param {string} args.jobId
 * @param {string} args.resource
 * @param {{ request: object, response: object }} args.capture
 */
function validateCapture({ label, jobId, resource, capture }) {
  const { request, response } = capture
  if (request.method !== 'GET') fail(`${label}: expected a GET capture, got ${request.method}`)

  const pathJobId = jobIdFromTracePath(request.path)
  if (pathJobId === null) {
    fail(`${label}: recorded path ${request.path} is not a trace route`)
  }
  if (pathJobId !== jobId) {
    fail(`${label}: recorded path targets Job ${pathJobId} but the manifest declares ${jobId}. `
      + 'Same-named captures from different checkouts must not be mixed.')
  }
  const pathResource = resourceFromTracePath(request.path)
  if (pathResource !== resource) {
    fail(`${label}: recorded path ${request.path} answers "${pathResource}" but the manifest declares "${resource}"`)
  }
  if (response.status !== 200) {
    fail(`${label}: recorded status is ${response.status}, expected 200`)
  }

  const body = response.body
  if (body === null || typeof body !== 'object') fail(`${label}: response body is not an object`)

  if (resource === 'summary') {
    assertJobId(body.jobId, jobId, `${label}: summary.jobId`)
    assertJobId(body.executionTraceId, `job:${jobId}`, `${label}: summary.executionTraceId`)
    return
  }

  const items = body.items
  if (!Array.isArray(items)) fail(`${label}: response body has no items array`)
  items.forEach((item, index) => {
    assertJobId(item?.jobId, jobId, `${label}: items[${index}].jobId`)
    if (typeof item?.executionTraceId === 'string') {
      assertJobId(item.executionTraceId, `job:${jobId}`, `${label}: items[${index}].executionTraceId`)
    }
  })
}

/**
 * A protocol packet must be reachable from a `protocolPacket` Link of the same
 * node; otherwise the two files cannot describe the same execution.
 * @param {{ label: string, protocol: { body: any }, links: { body: any } }} args
 */
function validateProtocolLinkJoin({ label, protocol, links }) {
  const linkItems = Array.isArray(links.body.items) ? links.body.items : []
  const packetLinks = linkItems.filter(link => link?.linkKind === 'protocolPacket')
  const protocolItems = Array.isArray(protocol.body.items) ? protocol.body.items : []

  for (const [index, packet] of protocolItems.entries()) {
    const joinable = packetLinks.some(link =>
      link.nodeId === packet?.nodeId && link.dispatchPacketId === packet?.packetId)
    if (!joinable) {
      fail(`${label}: protocol items[${index}] (${String(packet?.nodeId)}/${String(packet?.packetId)}) `
        + 'is not reachable from a protocolPacket Link. The protocol and link captures do not belong together.')
    }
  }
}

/**
 * Read every recorded or synthetic fixture declared by the manifest and build
 * the Job registry the QA server routes on.
 *
 * @param {object} args
 * @param {string} args.fixtureDir Absolute directory holding recorded exchanges.
 * @param {string} [args.syntheticFixtureDir] Directory holding QA-only visual Part payloads.
 * @param {import('./manifest.mjs').TraceScenario[]} args.scenarios
 */
export function loadTraceRegistry({ fixtureDir, syntheticFixtureDir, scenarios }) {
  /** @type {Map<string, any>} */
  const jobs = new Map()
  /** @type {Map<string, string>} */
  const fileOwners = new Map()
  /** @type {Map<string, string>} */
  const syntheticFileOwners = new Map()
  /** @type {Map<string, string>} */
  const viewOwners = new Map()

  const forbiddenSyntheticPartFields = new Set([
    'observation',
    'observations',
    'observationId',
    'protocol',
    'links',
    'packet',
    'packets',
    'requestId',
    'packetId',
    'dispatchPacketId',
    'task',
    'tasks',
    'taskIds',
    'taskId',
    'generateTaskId',
    'tagDumpTaskId',
    'window',
    'windows',
    'windowIndex',
    'windowCorrelationId',
    'challengeCorrelationId',
    'linkKey',
    'correlationId',
  ])

  function assertNoSyntheticPartIds(value, where) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoSyntheticPartIds(item, `${where}[${index}]`))
      return
    }
    if (value === null || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenSyntheticPartFields.has(key)) {
        fail(`${where}: synthetic Parts cannot add ${key}`)
      }
      assertNoSyntheticPartIds(child, `${where}.${key}`)
    }
  }

  function loadResourceRef({ ref, resource, jobId, scenarioId }) {
    const label = `${scenarioId}/${resource}`
    if (ref.derived === true) {
      if (resource !== 'summary') fail(`${label}: only a summary may be a derived QA envelope`)
      if (ref.file !== undefined || ref.syntheticFile !== undefined) {
        fail(`${label}: a derived summary cannot also reference a fixture file`)
      }
      if (ref.syntheticIdentityScope !== undefined && !['cell', 'row', 'table'].includes(ref.syntheticIdentityScope)) {
        fail(`${label}: syntheticIdentityScope must be cell, row or table`)
      }
      if (ref.syntheticChallengeRunning !== undefined && ref.syntheticChallengeRunning !== true) {
        fail(`${label}: syntheticChallengeRunning must be true when declared`)
      }
      if (ref.syntheticTagGenerationProgress !== undefined && ref.syntheticTagGenerationProgress !== true) {
        fail(`${label}: syntheticTagGenerationProgress must be true when declared`)
      }
      const visualContextCount = [
        ref.syntheticIdentityScope !== undefined,
        ref.syntheticChallengeRunning === true,
        ref.syntheticTagGenerationProgress === true,
      ].filter(Boolean).length
      if (visualContextCount > 1) fail(`${label}: choose only one synthetic Summary visual context`)
      return {
        kind: 'derived',
        jobId,
        syntheticIdentityScope: ref.syntheticIdentityScope ?? null,
        syntheticChallengeRunning: ref.syntheticChallengeRunning === true,
        syntheticTagGenerationProgress: ref.syntheticTagGenerationProgress === true,
      }
    }

    if (typeof ref.syntheticFile === 'string') {
      if (resource !== 'parts') fail(`${label}: only Parts may use a synthetic Trace fixture`)
      if (ref.file !== undefined) fail(`${label}: a synthetic Trace fixture cannot also reference a recorded file`)
      if (!syntheticFixtureDir) fail(`${label}: syntheticFixtureDir is required for ${ref.syntheticFile}`)
      const syntheticRoot = resolve(syntheticFixtureDir)
      const syntheticPath = resolve(syntheticRoot, ref.syntheticFile)
      const relativePath = relative(syntheticRoot, syntheticPath)
      if (!relativePath || relativePath.startsWith('..')) {
        fail(`${label}: synthetic Trace fixture must stay inside ${syntheticRoot}`)
      }
      const owner = syntheticFileOwners.get(ref.syntheticFile)
      if (owner !== undefined) {
        fail(`${label}: ${ref.syntheticFile} is already claimed by "${owner}"`)
      }
      syntheticFileOwners.set(ref.syntheticFile, label)
      let body
      try {
        body = JSON.parse(readFileSync(syntheticPath, 'utf8'))
      } catch (cause) {
        fail(`${label}: cannot read valid JSON from ${syntheticPath} (${cause instanceof Error ? cause.message : String(cause)})`)
      }
      if (!body || typeof body !== 'object' || !Array.isArray(body.items)) {
        fail(`${label}: synthetic Parts must contain an items array`)
      }
      body.items.forEach((part, index) => {
        if (part?.jobId !== jobId) fail(`${label}: items[${index}].jobId must match ${jobId}`)
      })
      assertNoSyntheticPartIds(body, label)
      return { kind: 'synthetic', file: ref.syntheticFile, body }
    }

    if (typeof ref.file !== 'string' || ref.file.length === 0) {
      fail(`${label}: resource reference needs "file", "syntheticFile" or "derived": true`)
    }
    const owner = fileOwners.get(ref.file)
    if (owner !== undefined) {
      fail(`${label}: ${ref.file} is already claimed by "${owner}"; a recorded file describes one Job only`)
    }
    fileOwners.set(ref.file, label)
    const capture = readCapture(join(fixtureDir, ref.file), label)
    validateCapture({ label, jobId, resource, capture })
    return {
      kind: 'capture',
      file: ref.file,
      origin: ref.origin ?? 'unknown',
      request: { path: capture.request.path, query: capture.request.query ?? {} },
      body: capture.response.body,
    }
  }

  for (const scenario of scenarios) {
    if (viewOwners.has(scenario.id)) {
      fail(`scenario/view id "${scenario.id}" is already declared by Job ${viewOwners.get(scenario.id)}`)
    }
    viewOwners.set(scenario.id, scenario.jobId)
    if (jobs.has(scenario.jobId)) {
      fail(`scenario "${scenario.id}" reuses Job ${scenario.jobId} declared by `
        + `"${jobs.get(scenario.jobId).scenarioId}"; one Job may have alternate views but exactly one manifest entry`)
    }
    const entry = {
      jobId: scenario.jobId,
      scenarioId: scenario.id,
      label: scenario.label,
      landing: scenario.landing,
      note: scenario.note,
      jobStatus: scenario.jobStatus ?? null,
      resources: {},
      views: new Map(),
    }
    jobs.set(scenario.jobId, entry)

    for (const resource of TRACE_RESOURCE_NAMES) {
      const ref = scenario.resources?.[resource]
      if (ref) entry.resources[resource] = loadResourceRef({
        ref,
        resource,
        jobId: scenario.jobId,
        scenarioId: scenario.id,
      })
    }

    entry.views.set(scenario.id, {
      id: scenario.id,
      scenarioId: scenario.id,
      jobId: scenario.jobId,
      label: scenario.label,
      landing: scenario.landing,
      note: scenario.note,
      jobStatus: scenario.jobStatus ?? null,
      resources: entry.resources,
    })

    for (const view of scenario.views ?? []) {
      if (viewOwners.has(view.id)) {
        fail(`scenario/view id "${view.id}" is already declared by Job ${viewOwners.get(view.id)}`)
      }
      viewOwners.set(view.id, scenario.jobId)
      const resources = { ...entry.resources }
      for (const resource of TRACE_RESOURCE_NAMES) {
        const ref = view.resources?.[resource]
        if (ref) resources[resource] = loadResourceRef({
          ref,
          resource,
          jobId: scenario.jobId,
          scenarioId: view.id,
        })
      }
      entry.views.set(view.id, {
        id: view.id,
        scenarioId: view.id,
        jobId: scenario.jobId,
        label: view.label,
        landing: view.landing,
        note: view.note,
        jobStatus: view.jobStatus ?? null,
        tasksUnavailable: view.tasksUnavailable === true,
        resources,
      })
    }

    for (const [viewId, view] of entry.views) {
      const { links, protocol } = view.resources
      if (links?.kind === 'capture' && protocol?.kind === 'capture') {
        validateProtocolLinkJoin({ label: `${viewId}/protocol`, protocol, links })
      }
    }
  }

  return { jobs }
}

/**
 * Resource names captured (or derived) for a Job, in wire order.
 * @param {{ resources: Record<string, unknown> }} entry
 */
export function availableResources(entry) {
  return TRACE_RESOURCE_NAMES.filter(name => entry.resources[name] !== undefined)
}
