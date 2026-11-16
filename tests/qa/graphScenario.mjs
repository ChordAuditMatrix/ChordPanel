/**
 * QA-only Job graph / flow graph scenario.
 *
 * The backend documents its graph contract but states that **no captured graph
 * response fixture exists** and that one must be captured from a real opt-in run
 * before it may be treated as fixture-verified — it "must not be written by
 * hand". This module therefore never claims to replay a recording:
 *
 * - The payload lives under `fixtures/synthetic/` and carries `qaSynthetic`.
 * - A file that looks like an HTTP exchange (`request` / `response`) is refused.
 * - The server labels every answer `X-ChordPanel-QA-Source: synthetic` and adds a
 *   QA scenario header. Nothing here is evidence about ChordAuditMatrix.
 *
 * The authored pages exist so the *UI states* can be exercised: per-stream
 * cursors, incomplete coverage, an Activity span whose facts cross a page
 * boundary, and a notification retry whose earlier attempt is no longer current.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fail } from './captureFiles.mjs'

/** The six independent streams of one Job graph response, in contract order. */
export const GRAPH_STREAMS = ['tasks', 'parts', 'observations', 'activities', 'edges', 'triggers']

const STREAM_PAGE_SIZE_KEYS = {
  tasks: 'taskPageSize',
  parts: 'partPageSize',
  observations: 'observationPageSize',
  activities: 'activityPageSize',
  edges: 'edgePageSize',
  triggers: 'triggerPageSize',
}

const STREAM_CURSOR_KEYS = {
  tasks: 'taskCursor',
  parts: 'partCursor',
  observations: 'observationCursor',
  activities: 'activityCursor',
  edges: 'edgeCursor',
  triggers: 'triggerCursor',
}

const MUTABLE_STREAMS = new Set(['tasks', 'parts', 'triggers'])
const COVERAGE_STATES = new Set(['complete', 'partial', 'unavailable', 'expired', 'notInstrumented'])
const TASK_STATUS_STATES = new Set([
  'available',
  'missingRow',
  'unattributedRow',
  'foreignRow',
  'storeUnavailable',
  'invalidReference',
])
const REFERENCE_STATES = new Set(['valid', 'empty', 'duplicate'])
const ACTIVITY_STATES = new Set(['started', 'progressed', 'succeeded', 'failed', 'cancelled', 'timedOut'])
const ACTIVITY_PARENT_STATES = new Set(['jobOnly', 'taskObserved', 'conflicting'])
const GRAPH_REF_KINDS = new Set([
  'job',
  'task',
  'part',
  'packet',
  'peer',
  'request',
  'node',
  'activity',
  'notification',
])

const DEFAULT_GRAPH_PAGE_SIZE = 100
const MAX_GRAPH_PAGE_SIZE = 200
const FLOW_STREAM = 'flowJobs'
const CURSOR_VERSION = 'qa1'

/** A request the synthetic graph routes refuse instead of guessing. */
export class GraphRequestError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

function decimalString(value, where) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(`${where} must be a decimal string`)
  return value
}

function nonEmptyString(value, where) {
  if (typeof value !== 'string' || value.length === 0) fail(`${where} must be a non-empty string`)
  return value
}

function assertRef(ref, where) {
  if (!ref || typeof ref !== 'object') fail(`${where} must be a typed reference object`)
  if (!GRAPH_REF_KINDS.has(ref.kind)) fail(`${where}.kind is not a documented graph reference kind`)
  if (typeof ref.ref !== 'string' || !ref.ref.startsWith(`${ref.kind}:`)) {
    fail(`${where}.ref must start with "${ref.kind}:"`)
  }
  return ref
}

function assertCoverage(value, where) {
  if (!COVERAGE_STATES.has(value)) fail(`${where} is not a documented coverage state`)
  return value
}

function assertNoRecordingEnvelope(value, where) {
  if (value === null || typeof value !== 'object') return
  if ('request' in value || 'response' in value) {
    fail(`${where} looks like an HTTP exchange; synthetic graph data must not pretend to be a recording`)
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRecordingEnvelope(item, `${where}[${index}]`))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    assertNoRecordingEnvelope(child, `${where}.${key}`)
  }
}

function validateStreamPage(stream, page, where) {
  if (!page || typeof page !== 'object') fail(`${where} must be an object`)
  if (!Array.isArray(page.rows)) fail(`${where}.rows must be an array`)
  assertCoverage(page.coverage, `${where}.coverage`)
  if (page.reasons !== undefined) {
    if (!Array.isArray(page.reasons) || page.reasons.some(item => typeof item !== 'string')) {
      fail(`${where}.reasons must be a string array when declared`)
    }
  }
  if (stream === 'activities') {
    if (!Array.isArray(page.edges)) fail(`${where}.edges must be an array`)
    decimalString(page.groups, `${where}.groups`)
  }
}

function validateTaskRows(rows, where) {
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`
    if (!Number.isInteger(row.referenceIndex) || row.referenceIndex < 0) fail(`${at}.referenceIndex must be an integer`)
    if (!REFERENCE_STATES.has(row.referenceState)) fail(`${at}.referenceState is not documented`)
    if (!TASK_STATUS_STATES.has(row.statusState)) fail(`${at}.statusState is not documented`)
    if (row.referenceState === 'empty') {
      if (row.taskId !== null || row.nodeId !== null) fail(`${at}: an empty reference has no Task identity`)
    } else if (row.nodeId !== `task:${String(row.taskId)}`) {
      fail(`${at}: nodeId must be "task:<taskId>"`)
    }
    if (row.status !== null && row.statusState !== 'available') {
      fail(`${at}: a status may only be stated by an available Task row`)
    }
    if (row.statusSource !== null && row.statusSource !== 'taskRepository') {
      fail(`${at}.statusSource must be taskRepository or null`)
    }
  })
}

function validatePartRows(rows, jobId, where) {
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`
    if (row.jobId !== jobId) fail(`${at}.jobId must be ${jobId}`)
    if (typeof row.nodeId !== 'string' || !row.nodeId.startsWith(`part:${jobId}:`)) {
      fail(`${at}.nodeId must start with "part:${jobId}:"`)
    }
    if (!Number.isInteger(row.partIndex) || row.partIndex < 0) fail(`${at}.partIndex must be an integer`)
    decimalString(row.plannedBlockCount, `${at}.plannedBlockCount`)
    if (!Array.isArray(row.ranges)) fail(`${at}.ranges must be an array`)
    row.ranges.forEach((range, rangeIndex) => {
      decimalString(range.blockStart, `${at}.ranges[${rangeIndex}].blockStart`)
      decimalString(range.blockCount, `${at}.ranges[${rangeIndex}].blockCount`)
    })
    if (row.generateTaskRef !== null) assertRef(row.generateTaskRef, `${at}.generateTaskRef`)
  })
}

function validateObservationRows(rows, jobId, where) {
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`
    if (row.jobId !== jobId) fail(`${at}.jobId must be ${jobId}`)
    if (row.executionTraceId !== `job:${jobId}`) fail(`${at}.executionTraceId must be job:${jobId}`)
    nonEmptyString(row.observationId, `${at}.observationId`)
    if (!Number.isInteger(row.recordedAtMs)) fail(`${at}.recordedAtMs must be an integer`)
    if (row.activity !== null && row.activity !== undefined) {
      nonEmptyString(row.activity.id, `${at}.activity.id`)
      if (row.activity.lifecycle !== null
        && !['started', 'progressed', 'completed', 'failed'].includes(row.activity.lifecycle)) {
        fail(`${at}.activity.lifecycle is not documented`)
      }
    }
  })
}

function validateActivityRows(rows, edges, jobId, where) {
  const byId = new Map()
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`
    nonEmptyString(row.activityId, `${at}.activityId`)
    if (row.nodeId !== `activity:${jobId}:${row.activityId}`) {
      fail(`${at}.nodeId must be "activity:${jobId}:<activityId>"`)
    }
    if (row.state !== null && !ACTIVITY_STATES.has(row.state)) fail(`${at}.state is not documented`)
    if (!ACTIVITY_PARENT_STATES.has(row.parentState)) fail(`${at}.parentState is not documented`)
    assertRef(row.parentRef, `${at}.parentRef`)
    decimalString(row.observationCount, `${at}.observationCount`)
    byId.set(row.nodeId, row)
  })
  edges.forEach((edge, index) => {
    const at = `${where}.edges[${index}]`
    assertRef(edge.from, `${at}.from`)
    assertRef(edge.to, `${at}.to`)
    if (edge.basis !== 'persistedObservationParent') fail(`${at}.basis must be persistedObservationParent`)
    const node = byId.get(edge.to.ref)
    if (!node) fail(`${at}.to must name an Activity node of the same page`)
    if (edge.from.ref !== node.parentRef.ref) fail(`${at}.from must equal the node's parentRef`)
    if (edge.parentState !== node.parentState) fail(`${at}.parentState must equal the node's parentState`)
  })
  for (const node of byId.values()) {
    if (!edges.some(edge => edge.to.ref === node.nodeId)) {
      fail(`${where}: every Activity node needs exactly one derived parent edge`)
    }
  }
}

function validateEdgeRows(rows, jobId, where) {
  const keys = new Set()
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`
    if (row.jobId !== jobId) fail(`${at}.jobId must be ${jobId}`)
    nonEmptyString(row.linkKey, `${at}.linkKey`)
    if (keys.has(row.linkKey)) fail(`${at}.linkKey is repeated`)
    keys.add(row.linkKey)
    assertRef(row.from, `${at}.from`)
    if (row.to !== null) assertRef(row.to, `${at}.to`)
  })
}

function validateTriggerRows(rows, jobId, where) {
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`
    nonEmptyString(row.ownerId, `${at}.ownerId`)
    nonEmptyString(row.notificationId, `${at}.notificationId`)
    if (!Number.isInteger(row.attempt) || row.attempt < 1) fail(`${at}.attempt must be a positive integer`)
    if (typeof row.currentAttempt !== 'boolean') fail(`${at}.currentAttempt must be a boolean`)
    if (row.basis !== 'persistedProcessingJobAssociation') {
      fail(`${at}.basis must be persistedProcessingJobAssociation`)
    }
    if (row.from?.ref !== `notification:${row.notificationId}`) {
      fail(`${at}.from.ref must be notification:<notificationId>`)
    }
    if (row.to?.ref !== `job:${jobId}`) fail(`${at}.to.ref must be job:${jobId}`)
    decimalString(row.receivedSourceDataRevision, `${at}.receivedSourceDataRevision`)
  })
}

function validateProtocolPage(page) {
  if (!page || typeof page !== 'object') fail('graph scenario.protocolPage must be an object')
  assertCoverage(page.coverage, 'graph scenario.protocolPage.coverage')
  if (!Array.isArray(page.items)) fail('graph scenario.protocolPage.items must be an array')
  if (page.items.length > 0) {
    fail('graph scenario.protocolPage.items must stay empty: this synthetic scenario authors no protocol packet records')
  }
  if (!Array.isArray(page.reasons) || page.reasons.some(item => typeof item !== 'string')) {
    fail('graph scenario.protocolPage.reasons must be a string array')
  }
  if (page.coverage !== 'notInstrumented' && page.coverage !== 'unavailable') {
    fail('graph scenario.protocolPage.coverage must state that protocol records are unavailable')
  }
  if (!page.reasons.includes('ProtocolPacketUnavailable')) {
    fail('graph scenario.protocolPage.reasons must name ProtocolPacketUnavailable')
  }
}

function validateJobNode(job, jobId) {
  if (job.kind !== 'job') fail('graph.job.kind must be "job"')
  if (job.jobId !== jobId) fail(`graph.job.jobId must be ${jobId}`)
  if (job.nodeId !== `job:${jobId}`) fail(`graph.job.nodeId must be job:${jobId}`)
  nonEmptyString(job.status, 'graph.job.status')
  nonEmptyString(job.errorCode, 'graph.job.errorCode')
  if (typeof job.terminal !== 'boolean') fail('graph.job.terminal must be a boolean')
  if (job.createdAtMs !== null && !Number.isInteger(job.createdAtMs)) fail('graph.job.createdAtMs must be an integer or null')
  if (job.statusSource !== 'jobAggregate') fail('graph.job.statusSource must be jobAggregate')
}

function validateStreams(scenario) {
  const seenActivityIds = new Map()
  const attemptsByNotification = new Map()

  for (const stream of GRAPH_STREAMS) {
    const definition = scenario.streams?.[stream]
    if (!definition || typeof definition !== 'object') fail(`graph.streams.${stream} is missing`)
    if (!Number.isInteger(definition.pageCap) || definition.pageCap < 1 || definition.pageCap > MAX_GRAPH_PAGE_SIZE) {
      fail(`graph.streams.${stream}.pageCap must be an integer in [1, ${MAX_GRAPH_PAGE_SIZE}]`)
    }
    if (definition.mutableSource !== MUTABLE_STREAMS.has(stream)) {
      fail(`graph.streams.${stream}.mutableSource must state the documented mutability (${MUTABLE_STREAMS.has(stream)})`)
    }
    if (!Array.isArray(definition.pages) || definition.pages.length === 0) {
      fail(`graph.streams.${stream}.pages must not be empty`)
    }
    if (stream === 'tasks') {
      decimalString(definition.referencesTotal, 'graph.streams.tasks.referencesTotal')
      if (typeof definition.referencesTracked !== 'boolean') fail('graph.streams.tasks.referencesTracked must be a boolean')
    }
    if (stream === 'parts' && definition.windowsMaterialized !== false) {
      fail('graph.streams.parts.windowsMaterialized must be false')
    }

    let nextReferenceIndex = 0
    definition.pages.forEach((page, pageIndex) => {
      const where = `graph.streams.${stream}.pages[${pageIndex}]`
      validateStreamPage(stream, page, where)
      if (page.rows.length > definition.pageCap) {
        fail(`${where}.rows has ${page.rows.length} rows but the page cap is ${definition.pageCap}`)
      }
      if (stream === 'tasks') {
        validateTaskRows(page.rows, `${where}.rows`)
        page.rows.forEach(row => {
          if (row.referenceIndex !== nextReferenceIndex) {
            fail(`${where}: task referenceIndex must be sequential across pages (expected ${nextReferenceIndex})`)
          }
          nextReferenceIndex += 1
        })
      }
      if (stream === 'parts') validatePartRows(page.rows, scenario.jobId, `${where}.rows`)
      if (stream === 'observations') validateObservationRows(page.rows, scenario.jobId, `${where}.rows`)
      if (stream === 'activities') {
        validateActivityRows(page.rows, page.edges, scenario.jobId, where)
        for (const row of page.rows) {
          const pages = seenActivityIds.get(row.activityId) ?? new Set()
          pages.add(pageIndex)
          seenActivityIds.set(row.activityId, pages)
        }
      }
      if (stream === 'edges') validateEdgeRows(page.rows, scenario.jobId, `${where}.rows`)
      if (stream === 'triggers') {
        validateTriggerRows(page.rows, scenario.jobId, `${where}.rows`)
        for (const row of page.rows) {
          const seen = attemptsByNotification.get(row.notificationId) ?? []
          seen.push(row)
          attemptsByNotification.set(row.notificationId, seen)
        }
      }
    })
  }

  const crossing = [...seenActivityIds.entries()].filter(([, pages]) => pages.size > 1)
  if (crossing.length === 0) {
    fail('the scenario must cover an Activity span whose facts cross a page boundary')
  }
  const retried = [...attemptsByNotification.entries()].filter(([, rows]) => rows.length > 1)
  if (retried.length === 0) {
    fail('the scenario must cover a notification retry whose earlier attempt is no longer current')
  }
  for (const [notificationId, rows] of retried) {
    const current = rows.filter(row => row.currentAttempt)
    if (current.length !== 1) {
      fail(`notification ${notificationId}: exactly one attempt must be current across the authored pages`)
    }
    if (!rows.some(row => !row.currentAttempt)) {
      fail(`notification ${notificationId}: the earlier attempt must state currentAttempt=false`)
    }
  }
}

function validateFlow(flow, flowId, jobId) {
  if (flow.flowId !== flowId) fail(`flow.flowId must be ${flowId}`)
  if (!Number.isInteger(flow.pageCap) || flow.pageCap < 1 || flow.pageCap > MAX_GRAPH_PAGE_SIZE) {
    fail(`flow.pageCap must be an integer in [1, ${MAX_GRAPH_PAGE_SIZE}]`)
  }
  if (!Array.isArray(flow.pages) || flow.pages.length < 2) {
    fail('flow.pages must contain at least two pages so the flow listing can be paged')
  }
  if (flow.provenance?.flowMembership !== 'jobAggregate.flowId'
    || flow.provenance?.jobStatus !== 'jobAggregate'
    || flow.provenance?.parentEdges !== 'jobAggregate.parentJobId') {
    fail('flow.provenance must name the documented flow sources')
  }

  const seenJobs = new Set()
  let containsGraphJob = false
  flow.pages.forEach((page, pageIndex) => {
    const where = `flow.pages[${pageIndex}]`
    if (!Array.isArray(page.jobNodes)) fail(`${where}.jobNodes must be an array`)
    if (!Array.isArray(page.parentEdges)) fail(`${where}.parentEdges must be an array`)
    if (page.jobNodes.length > flow.pageCap) fail(`${where}.jobNodes exceeds the page cap`)
    assertCoverage(page.coverage, `${where}.coverage`)
    if (page.reasons !== undefined
      && (!Array.isArray(page.reasons) || page.reasons.some(item => typeof item !== 'string'))) {
      fail(`${where}.reasons must be a string array when declared`)
    }
    const nodeRefs = new Set()
    for (const [nodeIndex, node] of page.jobNodes.entries()) {
      const at = `${where}.jobNodes[${nodeIndex}]`
      if (node.kind !== 'job') fail(`${at}.kind must be "job"`)
      if (node.flowId !== flowId) fail(`${at}.flowId must be ${flowId}`)
      if (node.nodeId !== `job:${node.jobId}`) fail(`${at}.nodeId must be job:<jobId>`)
      if (seenJobs.has(node.jobId)) fail(`${at}.jobId is listed twice in the flow`)
      seenJobs.add(node.jobId)
      nodeRefs.add(node.nodeId)
      if (node.jobId === jobId) containsGraphJob = true
      nonEmptyString(node.status, `${at}.status`)
      if (typeof node.terminal !== 'boolean') fail(`${at}.terminal must be a boolean`)
      if (node.revision !== null) decimalString(node.revision, `${at}.revision`)
    }
    page.parentEdges.forEach((edge, edgeIndex) => {
      const at = `${where}.parentEdges[${edgeIndex}]`
      if (edge.kind !== 'jobParent' || edge.basis !== 'jobAggregate.parentJobId') {
        fail(`${at} must be a jobParent edge based on jobAggregate.parentJobId`)
      }
      assertRef(edge.from, `${at}.from`)
      assertRef(edge.to, `${at}.to`)
      if (!nodeRefs.has(edge.from.ref) || !nodeRefs.has(edge.to.ref)) {
        fail(`${at} must have both ends inside this page`)
      }
    })
  })
  if (!containsGraphJob) fail(`flow.pages must include the graph Job ${jobId}`)
}

/**
 * Read and validate the synthetic graph scenario.
 * @param {string} filePath
 */
export function loadGraphScenario(filePath) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (cause) {
    fail(`graph scenario: cannot read ${filePath} (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    fail(`graph scenario: ${filePath} is not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  assertNoRecordingEnvelope(parsed, 'graph scenario')
  if (parsed?.qaSynthetic !== true) fail('graph scenario must declare "qaSynthetic": true')
  nonEmptyString(parsed.note, 'graph scenario.note')
  nonEmptyString(parsed.jobId, 'graph scenario.jobId')
  nonEmptyString(parsed.flowId, 'graph scenario.flowId')
  if (!Number.isInteger(parsed.schemaVersion)) fail('graph scenario.schemaVersion must be an integer')
  validateJobNode(parsed.job, parsed.jobId)
  decimalString(parsed.taskReferenceCount, 'graph scenario.taskReferenceCount')
  assertCoverage(parsed.jobCoverage, 'graph scenario.jobCoverage')
  if (!Array.isArray(parsed.coverageReasons) || parsed.coverageReasons.some(item => typeof item !== 'string')) {
    fail('graph scenario.coverageReasons must be a string array')
  }
  validateProtocolPage(parsed.protocolPage)
  const provenance = parsed.provenance
  for (const key of [
    'jobStatus',
    'taskMembership',
    'taskStatus',
    'parts',
    'observations',
    'activities',
    'activityParent',
    'edges',
    'notificationTriggers',
  ]) {
    nonEmptyString(provenance?.[key], `graph scenario.provenance.${key}`)
  }
  if (typeof provenance?.taskReferencesTracked !== 'boolean') {
    fail('graph scenario.provenance.taskReferencesTracked must be a boolean')
  }
  validateStreams(parsed)
  validateFlow(parsed.flow, parsed.flowId, parsed.jobId)

  return {
    ...parsed,
    streamNames: GRAPH_STREAMS,
    pageSizeKeys: STREAM_PAGE_SIZE_KEYS,
    cursorKeys: STREAM_CURSOR_KEYS,
  }
}

function cursorChecksum(parts) {
  return createHash('sha256').update(parts.join('|')).digest('base64url').slice(0, 16)
}

/** Opaque position of one stream: subject, stream, applied bound and page index. */
export function encodeGraphCursor({ subject, stream, bound, pageIndex }) {
  const payload = [subject, stream, String(bound), String(pageIndex)].join('.')
  return `${CURSOR_VERSION}.${stream}.${bound}.${pageIndex}.${cursorChecksum([subject, stream, String(bound), String(pageIndex)])}`
}

function decodeGraphCursor(token, { subject, stream, bound }) {
  const parts = String(token).split('.')
  if (parts.length !== 5 || parts[0] !== CURSOR_VERSION) {
    throw new GraphRequestError('trace_cursor_invalid',
      'The graph cursor is not a token this QA route issued.',
      'A cursor is opaque; restart the stream instead of editing it.')
  }
  const [, tokenStream, rawBound, rawIndex, checksum] = parts
  if (checksum !== cursorChecksum([subject, tokenStream, rawBound, rawIndex])) {
    throw new GraphRequestError('trace_cursor_invalid',
      'The graph cursor bytes do not match its checksum.',
      'A cursor is checksum-validated; restart the stream instead of resuming a shifted position.')
  }
  if (tokenStream !== stream) {
    throw new GraphRequestError('trace_cursor_invalid',
      `The graph cursor belongs to the ${tokenStream} stream, not ${stream}.`,
      'Each stream has its own cursor.')
  }
  const tokenBound = Number(rawBound)
  const pageIndex = Number(rawIndex)
  if (!Number.isInteger(tokenBound) || tokenBound !== bound) {
    throw new GraphRequestError('trace_cursor_invalid',
      'The graph cursor was issued with another page bound.',
      `Requested bound: ${bound}; token bound: ${rawBound}.`)
  }
  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    throw new GraphRequestError('trace_cursor_invalid',
      'The graph cursor does not name a continuation page.', 'Restart the stream from its first page.')
  }
  return pageIndex
}

function parseBound(raw, fallback, where) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > MAX_GRAPH_PAGE_SIZE) {
    throw new GraphRequestError('trace_page_size_invalid',
      `${where} must be an integer in [1, ${MAX_GRAPH_PAGE_SIZE}].`,
      `Received: ${String(raw)}. The QA route never silently corrects a bound.`)
  }
  return value
}

/**
 * The QA route deliberately applies the authored page cap so an ordinary
 * browser session (which requests `pageSize=200`) still walks several pages.
 * The applied bound is reported in every stream, never hidden.
 */
function appliedBound(requested, cap) {
  return Math.min(requested, cap)
}

function pageAt(definition, pageIndex, stream) {
  if (pageIndex === definition.pages.length) {
    return {
      rows: [],
      edges: [],
      groups: '0',
      coverage: 'complete',
      reasons: [],
      pastEnd: true,
    }
  }
  const page = definition.pages[pageIndex]
  if (!page) {
    throw new GraphRequestError('trace_cursor_invalid',
      `The ${stream} cursor names a page this QA scenario never authored.`,
      `Authored pages: ${definition.pages.length}.`)
  }
  return page
}

function streamPageDescriptor({ subject, stream, definition, requested, cursorToken }) {
  const bound = appliedBound(requested, definition.pageCap)
  const pageIndex = cursorToken
    ? decodeGraphCursor(cursorToken, { subject, stream, bound })
    : 0
  const page = pageAt(definition, pageIndex, stream)
  const hasMore = pageIndex < definition.pages.length - 1
  const nextCursor = page.pastEnd
    ? encodeGraphCursor({ subject, stream, bound, pageIndex })
    : encodeGraphCursor({ subject, stream, bound, pageIndex: pageIndex + 1 })
  return {
    bound,
    pageIndex,
    page,
    pageSummary: {
      pageSize: String(bound),
      returned: String(page.rows.length),
      hasMore,
      nextCursor,
      mutableSource: definition.mutableSource,
      coverage: page.coverage,
    },
  }
}

/**
 * One bounded page of every stream. Cursor parameters continue only their own
 * stream; every other stream answers its first page, exactly as the documented
 * multi-stream request does.
 *
 * @param {ReturnType<typeof loadGraphScenario>} scenario
 * @param {URLSearchParams} query
 */
export function projectJobGraphPage(scenario, query) {
  const requestedDefault = parseBound(query.get('pageSize'), DEFAULT_GRAPH_PAGE_SIZE, 'pageSize')
  const pages = {}
  const bounds = {}
  for (const stream of GRAPH_STREAMS) {
    const requested = parseBound(
      query.get(STREAM_PAGE_SIZE_KEYS[stream]),
      requestedDefault,
      STREAM_PAGE_SIZE_KEYS[stream],
    )
    const projected = streamPageDescriptor({
      subject: scenario.jobId,
      stream,
      definition: scenario.streams[stream],
      requested,
      cursorToken: query.get(STREAM_CURSOR_KEYS[stream]),
    })
    pages[stream] = projected
    bounds[stream] = projected.bound
  }

  const coverage = {
    job: scenario.jobCoverage,
    tasks: pages.tasks.page.coverage,
    parts: pages.parts.page.coverage,
    observations: pages.observations.page.coverage,
    activities: pages.activities.page.coverage,
    edges: pages.edges.page.coverage,
    triggers: pages.triggers.page.coverage,
    reasons: scenario.coverageReasons,
  }

  const body = {
    schemaVersion: scenario.schemaVersion,
    executionTraceId: `job:${scenario.jobId}`,
    jobId: scenario.jobId,
    cursorConsistency: 'eventual',
    job: scenario.job,
    taskNodes: pages.tasks.page.rows,
    partNodes: pages.parts.page.rows,
    activityNodes: pages.activities.page.rows,
    activityEdges: pages.activities.page.edges,
    observations: pages.observations.page.rows,
    edges: pages.edges.page.rows,
    triggerEdges: pages.triggers.page.rows,
    streams: {
      tasks: {
        ...pages.tasks.pageSummary,
        referencesTotal: scenario.streams.tasks.referencesTotal,
        referencesTracked: scenario.streams.tasks.referencesTracked,
      },
      parts: {
        ...pages.parts.pageSummary,
        windowsMaterialized: false,
      },
      observations: pages.observations.pageSummary,
      activities: {
        ...pages.activities.pageSummary,
        groups: pages.activities.page.groups,
      },
      edges: pages.edges.pageSummary,
      triggers: pages.triggers.pageSummary,
    },
    taskReferenceCount: scenario.taskReferenceCount,
    hasMore: GRAPH_STREAMS.some(stream => pages[stream].pageSummary.hasMore),
    coverage,
    provenance: scenario.provenance,
    /** QA-only marker: this page is a synthetic scenario, not a captured graph. */
    qaSyntheticGraph: true,
  }
  return { body, bounds, pages }
}

/**
 * One bounded page of the synthetic flow listing.
 *
 * @param {ReturnType<typeof loadGraphScenario>} scenario
 * @param {URLSearchParams} query
 */
export function projectFlowGraphPage(scenario, query) {
  const flow = scenario.flow
  const requested = parseBound(query.get('pageSize'), DEFAULT_GRAPH_PAGE_SIZE, 'pageSize')
  const bound = appliedBound(requested, flow.pageCap)
  const cursorToken = query.get('jobCursor')
  const pageIndex = cursorToken
    ? decodeGraphCursor(cursorToken, { subject: flow.flowId, stream: FLOW_STREAM, bound })
    : 0
  const page = flow.pages[pageIndex]
  if (!page) {
    if (pageIndex !== flow.pages.length) {
      throw new GraphRequestError('trace_cursor_invalid',
        'The flow cursor names a page this QA scenario never authored.',
        `Authored pages: ${flow.pages.length}.`)
    }
    return {
      bound,
      pageIndex,
      body: {
        schemaVersion: scenario.schemaVersion,
        flowId: flow.flowId,
        cursorConsistency: 'eventual',
        jobNodes: [],
        parentEdges: [],
        pageSize: String(bound),
        returned: '0',
        hasMore: false,
        nextCursor: encodeGraphCursor({ subject: flow.flowId, stream: FLOW_STREAM, bound, pageIndex }),
        coverage: 'complete',
        reasons: [],
        provenance: flow.provenance,
        qaSyntheticGraph: true,
      },
    }
  }
  const hasMore = pageIndex < flow.pages.length - 1
  return {
    bound,
    pageIndex,
    body: {
      schemaVersion: scenario.schemaVersion,
      flowId: flow.flowId,
      cursorConsistency: 'eventual',
      jobNodes: page.jobNodes,
      parentEdges: page.parentEdges,
      pageSize: String(bound),
      returned: String(page.jobNodes.length),
      hasMore,
      nextCursor: encodeGraphCursor({
        subject: flow.flowId,
        stream: FLOW_STREAM,
        bound,
        pageIndex: pageIndex + 1,
      }),
      coverage: page.coverage,
      reasons: page.reasons ?? scenario.coverageReasons,
      provenance: flow.provenance,
      qaSyntheticGraph: true,
    },
  }
}
