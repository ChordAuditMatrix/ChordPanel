/**
 * Reading and validating one recorded HTTP exchange.
 *
 * This module is the only place that touches recorded bytes. It never rewrites a
 * captured body: it extracts `response.body` and proves that the file belongs to
 * the Job that claims it.
 *
 * Validation is deliberately strict, because the two checkouts contain
 * same-named files that describe *different* Jobs:
 *
 * 1. The recorded request path must target the declared Job and the resource the
 *    manifest declares (a summary file can never be served as `/observations`).
 * 2. Every Job identifier inside the body (`jobId`, `executionTraceId`, and each
 *    item's `jobId`) must equal the declared Job.
 * 3. When a scenario captures both Links and protocol packets, every packet must
 *    be reachable from a `protocolPacket` Link of the same node. This is the join
 *    the UI performs, so a mismatched pair means files from two different
 *    captures were mixed.
 */

import { readFileSync } from 'node:fs'

/** Trace resources exposed by `/v1/jobs/{jobId}/trace*`. */
export const TRACE_RESOURCE_NAMES = ['summary', 'observations', 'parts', 'links', 'protocol']

const TRACE_PATH = /^\/api\/v1\/jobs\/([^/]+)\/trace(?:\/(observations|parts|links|protocol))?$/

/**
 * Map a captured request path to the trace resource it answers.
 * Returns null when the path is not a trace route.
 * @param {string} path
 * @returns {string | null}
 */
export function resourceFromTracePath(path) {
  const match = TRACE_PATH.exec(path)
  if (!match) return null
  return match[2] ?? 'summary'
}

/** Job id of a captured trace request path, or null. */
export function jobIdFromTracePath(path) {
  const match = TRACE_PATH.exec(path)
  return match ? match[1] : null
}

export function fail(message) {
  throw new Error(`[qa fixtures] ${message}`)
}

function assertJobId(actual, expected, where) {
  if (actual === undefined || actual === null) return
  if (actual !== expected) {
    fail(`${where} belongs to Job ${String(actual)} but the manifest declares ${expected}. `
      + 'Same-named captures from different checkouts must not be mixed.')
  }
}

/** Read one recorded exchange and require its request/response envelope. */
export function readCapture(filePath, label) {
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
export function validateCapture({ label, jobId, resource, capture }) {
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
export function validateProtocolLinkJoin({ label, protocol, links }) {
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
