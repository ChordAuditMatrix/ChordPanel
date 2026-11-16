/**
 * Builds the Job registry the QA server routes on.
 *
 * Recorded exchanges are read and validated by `captureFiles.mjs`; this module
 * only decides which manifest entry owns which file, enforces one owner per
 * file/Job, and loads explicitly synthetic Part payloads. The derived Summary
 * builder lives in `derivedSummary.mjs` and is re-exported here for existing
 * callers.
 */

import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  TRACE_RESOURCE_NAMES,
  fail,
  readCapture,
  validateCapture,
  validateProtocolLinkJoin,
} from './captureFiles.mjs'

export { TRACE_RESOURCE_NAMES } from './captureFiles.mjs'
export { buildDerivedSummaryEnvelope } from './derivedSummary.mjs'
export { selectScenarioView } from './scenarioViews.mjs'

const FORBIDDEN_SYNTHETIC_PART_FIELDS = new Set([
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
    if (FORBIDDEN_SYNTHETIC_PART_FIELDS.has(key)) {
      fail(`${where}: synthetic Parts cannot add ${key}`)
    }
    assertNoSyntheticPartIds(child, `${where}.${key}`)
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

  function loadResourceRef({ ref, resource, jobId, scenarioId }) {
    const label = `${scenarioId}/${resource}`
    if (ref.derived === true) {
      if (resource !== 'summary') fail(`${label}: only a summary may be a derived QA envelope`)
      if (ref.file !== undefined || ref.syntheticFile !== undefined) {
        fail(`${label}: a derived summary cannot also reference a fixture file`)
      }
      if (ref.syntheticIdentitySummary !== undefined && ref.syntheticIdentitySummary !== true) {
        fail(`${label}: syntheticIdentitySummary must be true when declared`)
      }
      if (ref.syntheticChallengeRunning !== undefined && ref.syntheticChallengeRunning !== true) {
        fail(`${label}: syntheticChallengeRunning must be true when declared`)
      }
      if (ref.syntheticTagGenerationProgress !== undefined && ref.syntheticTagGenerationProgress !== true) {
        fail(`${label}: syntheticTagGenerationProgress must be true when declared`)
      }
      const visualContextCount = [
        ref.syntheticIdentityScope !== undefined,
        ref.syntheticIdentitySummary === true,
        ref.syntheticChallengeRunning === true,
        ref.syntheticTagGenerationProgress === true,
      ].filter(Boolean).length
      if (visualContextCount > 1) fail(`${label}: choose only one synthetic Summary visual context`)
      return {
        kind: 'derived',
        jobId,
        syntheticIdentityScope: ref.syntheticIdentityScope ?? null,
        syntheticIdentitySummary: ref.syntheticIdentitySummary === true,
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
