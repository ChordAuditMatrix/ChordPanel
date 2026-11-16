/**
 * Synthetic graph routes.
 *
 * These routes answer only the explicitly synthetic graph scenario loaded from
 * `fixtures/synthetic/trace-graph-scenario.json`. Recorded Trace Jobs answer
 * `501 trace_resource_not_captured`, because the backend documents that no graph
 * response was ever captured and that a graph fixture must not be hand-written.
 * Unknown Jobs/flows answer `404`.
 */

import { GraphRequestError, projectFlowGraphPage, projectJobGraphPage } from './graphScenario.mjs'

const JOB_GRAPH_PATH = /^\/v1\/jobs\/([^/]+)\/trace\/graph$/
const FLOW_GRAPH_PATH = /^\/v1\/flows\/([^/]+)\/trace\/graph$/

/**
 * Match one graph path.
 * @param {string} path Normalized path.
 * @returns {{ kind: 'jobGraph' | 'flowGraph', subject: string } | null}
 */
export function matchGraphRequestPath(path) {
  const job = JOB_GRAPH_PATH.exec(path)
  if (job) return { kind: 'jobGraph', subject: decodeURIComponent(job[1]) }
  const flow = FLOW_GRAPH_PATH.exec(path)
  if (flow) return { kind: 'flowGraph', subject: decodeURIComponent(flow[1]) }
  return null
}
import { errorResponse, jsonResponse } from './response.mjs'
import { availableResources } from './traceFixtures.mjs'
import { unknownJobResponse } from './traceRoutes.mjs'

function graphErrorResponse(cause, extra = {}) {
  return errorResponse({
    status: 400,
    source: 'synthetic',
    code: cause.code,
    message: cause.message,
    detail: cause.detail,
    ...extra,
  })
}

function graphNotCapturedResponse({ jobId, registry, scenarioMeta }) {
  const entry = registry.jobs.get(jobId)
  const detail = entry
    ? `Recorded resources for this Job: ${availableResources(entry).join(', ') || 'none'}. `
      + 'A graph fixture must be captured from a real backend run; this server does not write one by hand.'
    : 'No synthetic graph scenario is authored for this Job. '
      + `Graph scenario Jobs: ${scenarioMeta ? scenarioMeta.jobId : 'none'}.`
  return errorResponse({
    status: 501,
    source: 'fixture-missing',
    code: 'trace_resource_not_captured',
    message: `No execution-graph capture exists for Job ${jobId}.`,
    detail,
    fixture: entry ? null : scenarioMeta?.fixture ?? null,
  })
}

/**
 * @param {object} args
 * @param {ReturnType<import('./graphScenario.mjs').loadGraphScenario> | null} args.graphScenario
 * @param {{ id: string, jobId: string, flowId: string, fixture: string } | null} args.scenarioMeta
 * @param {{ jobs: Map<string, any> }} args.registry
 * @param {any} args.synthetic
 * @param {string} args.jobId
 * @param {URLSearchParams} args.query
 */
export function routeJobGraphRequest({ graphScenario, scenarioMeta, registry, synthetic, jobId, query }) {
  try {
    if (graphScenario && scenarioMeta && jobId === graphScenario.jobId) {
      const { body } = projectJobGraphPage(graphScenario, query)
      return jsonResponse({
        source: 'synthetic',
        scenario: scenarioMeta.id,
        fixture: scenarioMeta.fixture,
        projection: 'synthetic-graph+qa-bound-cap',
        body,
      })
    }
  } catch (cause) {
    if (cause instanceof GraphRequestError) {
      return graphErrorResponse(cause, {
        scenario: scenarioMeta?.id ?? null,
        fixture: scenarioMeta?.fixture ?? null,
      })
    }
    throw cause
  }

  const knownJob = registry.jobs.has(jobId)
    || synthetic.jobs.some(job => job.jobId === jobId)
  if (knownJob) {
    return graphNotCapturedResponse({ jobId, registry, scenarioMeta })
  }
  return unknownJobResponse(jobId, [
    ...registry.jobs.keys(),
    ...synthetic.jobs.map(job => job.jobId),
  ])
}

/**
 * @param {object} args
 * @param {ReturnType<import('./graphScenario.mjs').loadGraphScenario> | null} args.graphScenario
 * @param {{ id: string, flowId: string, fixture: string } | null} args.scenarioMeta
 * @param {string} args.flowId
 * @param {URLSearchParams} args.query
 */
export function routeFlowGraphRequest({ graphScenario, scenarioMeta, flowId, query }) {
  try {
    if (graphScenario && flowId === graphScenario.flowId) {
      const { body } = projectFlowGraphPage(graphScenario, query)
      return jsonResponse({
        source: 'synthetic',
        scenario: scenarioMeta?.id ?? null,
        fixture: scenarioMeta?.fixture ?? null,
        projection: 'synthetic-flow-graph+qa-bound-cap',
        body,
      })
    }
  } catch (cause) {
    if (cause instanceof GraphRequestError) {
      return graphErrorResponse(cause, {
        scenario: scenarioMeta?.id ?? null,
        fixture: scenarioMeta?.fixture ?? null,
      })
    }
    throw cause
  }

  return errorResponse({
    status: 404,
    source: 'error',
    code: 'flow_not_found',
    message: `Flow ${flowId} is not part of the local QA graph scenario.`,
    detail: `Known QA graph flows: ${graphScenario ? graphScenario.flowId : 'none'}.`,
    fixture: scenarioMeta?.fixture ?? null,
  })
}
