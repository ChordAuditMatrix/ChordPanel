/**
 * Authored Trace reads for the synthetic graph Job.
 *
 * The graph scenario already authors Task references, Part projections,
 * Observations and Link rows. The Execution page also asks the ordinary Trace
 * endpoints for the same Job; without them the page shows resource-level
 * "load failed" panels even though the graph itself is present.
 *
 * This module derives only those resources the authored scenario actually
 * contains, and labels every answer `X-ChordPanel-QA-Source: synthetic` with
 * `X-ChordPanel-QA-Projection: synthetic-graph+qa-authored-trace`. It never
 * invents a Task row, protocol packet, Window, progress counter or completion:
 *
 * - Protocol packets were never authored. `/trace/protocol` answers the
 *   scenario's explicit empty page, whose `notInstrumented` coverage and
 *   `ProtocolPacketUnavailable` reason state that no packet record is
 *   available; the empty page is not presented as a captured recording.
 * - Summary progress counters stay `null`; only the Job status/created time and
 *   the stream coverage the scenario states are copied.
 * - Task rows are returned from `base.json`; the graph's missing/foreign/empty
 *   Task references are not turned into Task rows.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, toInt } from './httpUtils.mjs'
import { jsonResponse } from './response.mjs'

const TRACE_PROJECTION = 'synthetic-graph+qa-authored-trace'

function traceResponse(scenarioMeta, body) {
  return jsonResponse({
    source: 'synthetic',
    scenario: scenarioMeta?.id ?? null,
    fixture: scenarioMeta?.fixture ?? null,
    projection: TRACE_PROJECTION,
    body,
  })
}

function pageRows(rows, query) {
  const page = toInt(query.get('page'), 1, 1, 1e6)
  const pageSize = toInt(query.get('pageSize'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  const start = (page - 1) * pageSize
  return {
    items: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
    hasMore: start + pageSize < rows.length,
  }
}

/** Every authored row of one stream, in page order, deduplicated by identity. */
function streamRows(scenario, stream, identity) {
  const seen = new Set()
  const rows = []
  for (const page of scenario.streams[stream].pages) {
    for (const row of page.rows) {
      const key = identity(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }
  return rows
}

function summaryBody(scenario) {
  const observations = streamRows(scenario, 'observations', row => row.observationId)
  const observedAtMs = observations.reduce(
    (latest, row) => (typeof row.recordedAtMs === 'number' && row.recordedAtMs > latest ? row.recordedAtMs : latest),
    0,
  )
  const protocolPage = scenario.protocolPage
  const coverageReasons = [...scenario.coverageReasons]
  for (const reason of protocolPage.reasons) {
    if (!coverageReasons.includes(reason)) coverageReasons.push(reason)
  }
  return {
    schemaVersion: scenario.schemaVersion,
    executionTraceId: `job:${scenario.jobId}`,
    jobId: scenario.jobId,
    executionKind: null,
    job: {
      status: scenario.job.status,
      errorCode: scenario.job.errorCode,
      createdAtMs: scenario.job.createdAtMs,
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
      job: scenario.jobCoverage,
      tasks: 'partial',
      parts: scenario.streams.parts.pages.some(page => page.coverage !== 'complete') ? 'partial' : 'complete',
      protocol: protocolPage.coverage,
      workerStages: null,
      reasons: coverageReasons,
    },
    observedAtMs: observedAtMs > 0 ? observedAtMs : null,
    qaDerivedSummary: true,
    qaSyntheticGraph: true,
  }
}

/**
 * @param {object} args
 * @param {ReturnType<import('./graphScenario.mjs').loadGraphScenario>} args.graphScenario
 * @param {{ id: string, fixture: string } | null} args.scenarioMeta
 * @param {string} args.resource Trace resource name.
 * @param {URLSearchParams} args.query
 * @returns {import('./response.mjs').JsonResponse | null} `null` when this route does not own the resource.
 */
export function routeGraphTraceRequest({ graphScenario, scenarioMeta, resource, query }) {
  if (resource === 'summary') {
    return traceResponse(scenarioMeta, summaryBody(graphScenario))
  }

  if (resource === 'observations') {
    const cursor = query.get('cursor')
    if (cursor !== null && cursor !== '') {
      return traceResponse(scenarioMeta, {
        items: [],
        nextCursor: null,
        hasMore: false,
        cursorConsistency: 'eventual',
      })
    }
    const observations = streamRows(graphScenario, 'observations', row => row.observationId)
    return traceResponse(scenarioMeta, {
      items: observations,
      nextCursor: null,
      hasMore: false,
      cursorConsistency: 'eventual',
      qaSyntheticGraph: true,
    })
  }

  if (resource === 'parts') {
    const parts = streamRows(graphScenario, 'parts', row => `${row.partIndex}:${row.attempt ?? ''}`)
      .map(row => ({
        jobId: row.jobId,
        partIndex: row.partIndex,
        attempt: row.attempt,
        ranges: row.ranges,
        plannedBlockCount: row.plannedBlockCount,
        status: row.state,
        generateTaskId: row.generateTaskRef ? row.generateTaskRef.ref.replace(/^task:/, '') : null,
        generatedBlockCount: row.generatedBlockCount,
        storageAccountedTagCount: row.storageAccountedTagCount,
        updatedAtMs: row.updatedAtMs,
        coverage: row.coverage,
      }))
    return traceResponse(scenarioMeta, {
      ...pageRows(parts, query),
      coverage: graphScenario.streams.parts.pages.every(page => page.coverage === 'complete')
        ? 'complete'
        : 'partial',
    })
  }

  if (resource === 'links') {
    const links = streamRows(graphScenario, 'edges', row => row.linkKey)
    return traceResponse(scenarioMeta, pageRows(links, query))
  }

  if (resource === 'protocol') {
    const page = graphScenario.protocolPage
    return traceResponse(scenarioMeta, {
      items: page.items,
      nextCursor: null,
      hasMore: false,
      coverage: page.coverage,
      reasons: page.reasons,
      qaSyntheticGraph: true,
    })
  }

  return null
}
