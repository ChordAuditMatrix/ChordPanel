/**
 * Opt-in write simulation for QA task walkthroughs.
 *
 * The fixture server is read-only by default: every non-GET/HEAD request answers
 * `501 qa_read_only`. That guarantee stays intact because this module is only
 * consulted when `createQaServer({ simulateWrites: true })` is passed, which
 * `run.mjs` does only for `QA_SIMULATE_WRITES=1` or `--simulate-writes`.
 *
 * A simulated answer is never backend evidence and never changes fixture state:
 *
 * - The response is labelled `X-ChordPanel-QA-Source: synthetic-write-simulation`
 *   and `X-ChordPanel-QA-Scenario: task-write-simulation`.
 * - Every body carries `qaSimulatedWrite: true`.
 * - Success answers describe only what the real route would synchronously prove:
 *   maintenance/source-change/re-arm are `202` dispatches of Pending Jobs, a GC
 *   pass returns its own bounded report, and a refresh retry reports `retried`.
 *   Nothing is marked Succeeded and no fixture Job changes.
 * - Refusals use the backend's documented status/error code (`409`, `405`, `400`)
 *   so the UI can exercise conflict and non-retryable paths.
 *
 * Selectors are deterministic and documented in `tests/qa/README.md`; no random
 * values are used, so a browser walkthrough is reproducible.
 */

import { jsonResponse } from './response.mjs'

export const WRITE_SIMULATION_SCENARIO = 'task-write-simulation'
export const WRITE_SIMULATION_SOURCE = 'synthetic-write-simulation'
export const WRITE_SIMULATION_FIXTURE = 'fixtures/synthetic/base.json'
export const WRITE_SIMULATION_PROJECTION = 'synthetic-write-simulation'

/** Synthetic Jobs referenced by simulated dispatch answers; they live in base.json. */
export const WRITE_SIMULATION_JOB_IDS = {
  maintenance: '99999999-9999-4999-8999-999999999991',
  sourceChange: '99999999-9999-4999-8999-999999999992',
  materialGcAnchor: '99999999-9999-4999-8999-999999999993',
  materialGcSuccessor: '99999999-9999-4999-8999-999999999994',
}

/** The demo values a browser walkthrough can type to reach each display state. */
export const WRITE_SIMULATION_SELECTORS = {
  sourceChange: {
    acceptedNotificationId: 'qa-source-accepted',
    conflictNotificationId: 'qa-source-conflict',
  },
  drift: {
    approvedRecoveryId: 'qa-drift-approved',
    conflictRecoveryId: 'qa-drift-conflict',
  },
  maintenance: {
    staticAlgorithmId: 'qa-static-algorithm',
    unboundOwnerId: '22222222-2222-4222-8222-222222222222',
  },
  materialGc: {
    cursorNextPage: 'qa-gc-cursor-2',
    cursorLongWait: 'qa-gc-long-wait',
    cursorConflict: 'qa-gc-conflict',
    versionRetryable: 'qa-version-retryable',
    versionAlreadyActive: 'qa-version-active',
    versionBlocked: 'qa-version-blocked',
  },
  ownershipRefresh: {
    retryableRevision: 7,
    nonRetryableRevision: 8,
  },
}

/** Route inventory shown by `/qa/health` and the QA index while simulation is on. */
export const WRITE_SIMULATION_ROUTES = [
  {
    method: 'POST',
    path: '/v1/audit-data/{ownerId}/source-change-jobs',
    answer: '202 accepted dispatch or 409 SourceChangeConflict',
  },
  {
    method: 'POST',
    path: '/v1/audit-data/{ownerId}/source-drift-recoveries/{recoveryId}/approve-baseline',
    answer: '200 recorded decision or 409 SourceBaselineDecisionConflict',
  },
  {
    method: 'POST',
    path: '/v1/audit/maintenance and /v1/audit/algorithms/{algorithmId}/maintenance',
    answer: '202 Pending dispatch, 405 static algorithm, 409 binding conflict',
  },
  {
    method: 'POST',
    path: '/v1/audit/material-gc/run-pass',
    answer: '200 bounded pass report (progress, blocked, in-flight after a long wait) or 409 busy',
  },
  {
    method: 'POST',
    path: '/v1/audit/material-gc/rearm',
    answer: '202 Created, 200 AlreadyActive, or 409 MaterialGcRearmBlocked',
  },
  {
    method: 'POST',
    path: '/v1/ownership/refresh/retry',
    answer: '200 retried=true/false; false is non-retryable and re-arms nothing',
  },
]

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Every simulated route follows the real unified envelope: dispatch fields live
 * in the JSON body `params`, never in the query string. Missing/invalid `params`
 * is treated as an empty object so route validation produces the documented
 * refusal instead of reading a query fallback the frontend never sends.
 */
function paramsOf(body) {
  const params = body && typeof body === 'object' && !Array.isArray(body) ? body.params : null
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return {}
  return params
}

function simulatedResponse(status, body, projection = WRITE_SIMULATION_PROJECTION) {
  return jsonResponse({
    status,
    source: WRITE_SIMULATION_SOURCE,
    scenario: WRITE_SIMULATION_SCENARIO,
    fixture: WRITE_SIMULATION_FIXTURE,
    projection,
    body: { qaSimulatedWrite: true, ...body },
  })
}

function simulatedError(status, code, message, detail) {
  return simulatedResponse(status, { error: code, message, detail })
}

function ownerIdFromBody(body) {
  const request = body && typeof body === 'object' ? body.request : null
  return request && typeof request === 'object' ? text(request.dataOwnerId ?? request.ownerId) : ''
}

function isNonAuditOwner(ownerId) {
  return ownerId === WRITE_SIMULATION_SELECTORS.maintenance.unboundOwnerId
}

function sourceChange({ params }) {
  const notificationId = text(params.notificationId)
  if (!notificationId) {
    return simulatedError(400, 'BadRequest', 'notificationId is required.',
      'The QA simulation only echoes a validation refusal; nothing was written.')
  }
  if (notificationId === WRITE_SIMULATION_SELECTORS.sourceChange.conflictNotificationId) {
    return simulatedError(409, 'SourceChangeConflict',
      'The same owner and notification ID already exist with a different payload.',
      'QA simulation: no notification or Job was created.')
  }
  return simulatedResponse(202, {
    jobId: WRITE_SIMULATION_JOB_IDS.sourceChange,
    statusUrl: `/api/v1/jobs/${WRITE_SIMULATION_JOB_IDS.sourceChange}`,
  })
}

function driftDecision({ ownerId, recoveryId, params }) {
  if (recoveryId === WRITE_SIMULATION_SELECTORS.drift.conflictRecoveryId) {
    return simulatedError(409, 'SourceBaselineDecisionConflict',
      'The recovery identity or drift revision is no longer current; nothing was approved.',
      'QA simulation: no baseline decision was recorded.')
  }
  const requested = Number(params.driftRevision)
  const driftRevision = Number.isSafeInteger(requested) && requested > 0 ? requested : 8
  return simulatedResponse(200, {
    ownerId,
    recoveryId,
    driftRevision,
    baselineDecision: 'Approved',
  })
}

function maintenance({ explicitAlgorithmId, ownerId, params }) {
  const maintenanceOp = text(params.maintenanceOp)
  if (!maintenanceOp) {
    return simulatedError(400, 'BadRequest', 'Missing required field: params.maintenanceOp',
      'QA simulation: nothing was dispatched.')
  }
  if (explicitAlgorithmId === WRITE_SIMULATION_SELECTORS.maintenance.staticAlgorithmId) {
    return simulatedError(405, 'MethodNotAllowed',
      'The selected algorithm does not support dynamic maintenance; no fallback is attempted.',
      'QA simulation: nothing was dispatched.')
  }
  if (isNonAuditOwner(ownerId)) {
    const code = explicitAlgorithmId ? 'NonAuditAlgorithmBinding' : 'NoAuditAlgorithmBinding'
    return simulatedError(409, code,
      explicitAlgorithmId
        ? 'The explicit algorithm is not the owner\'s Audit binding.'
        : 'The owner has no dynamic Audit algorithm binding.',
      'QA simulation: nothing was dispatched. Use QA Data Owner 11111111-1111-4111-8111-111111111111 for the accepted path.')
  }
  return simulatedResponse(202, {
    jobId: WRITE_SIMULATION_JOB_IDS.maintenance,
    algorithmId: explicitAlgorithmId || 'd93b1655-af7d-411e-9de2-e80cbd21e185',
    fileId: ownerId || '11111111-1111-4111-8111-111111111111',
    maintenanceOp,
    status: 'Pending',
    message: 'Maintenance task dispatched',
  })
}

function gcPass({ params, longWaitMs }) {
  const cursor = text(params.afterVersionId)
  const selector = WRITE_SIMULATION_SELECTORS.materialGc
  if (cursor === selector.cursorConflict) {
    return {
      response: simulatedError(409, 'MaterialGcPassInProgress',
        'Another material-GC pass still runs in this process; nothing was done.',
        'QA simulation: no pass ran.'),
    }
  }
  if (cursor === selector.cursorLongWait) {
    return {
      delayMs: longWaitMs,
      response: simulatedResponse(200, {
        versionsExamined: 1,
        versionsRetired: 0,
        moreWorkPending: true,
        nextLifecycleCursor: selector.cursorLongWait,
        reports: [{
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-long-wait',
          jobId: WRITE_SIMULATION_JOB_IDS.materialGcAnchor,
          step: 'TagReclaim',
          outcome: 'InFlight',
          detail: '夹具模拟：有上限的远程步骤仍在等待，不声称已经完成。',
        }],
      }),
    }
  }
  if (cursor === selector.cursorNextPage) {
    return {
      response: simulatedResponse(200, {
        versionsExamined: 1,
        versionsRetired: 0,
        moreWorkPending: false,
        nextLifecycleCursor: null,
        reports: [{
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-retryable',
          jobId: WRITE_SIMULATION_JOB_IDS.materialGcAnchor,
          step: 'TagWithdraw',
          outcome: 'Progressed',
          detail: '夹具模拟：本轮将把该版本推进一个持久步骤。',
        }],
      }),
    }
  }
  if (cursor) {
    return {
      response: simulatedError(400, 'BadRequest',
        'The QA simulation only knows the cursor it returned.',
        `Received: ${cursor}. Use ${selector.cursorNextPage}, ${selector.cursorLongWait} or ${selector.cursorConflict}.`),
    }
  }
  return {
    response: simulatedResponse(200, {
      versionsExamined: 2,
      versionsRetired: 1,
      moreWorkPending: true,
      nextLifecycleCursor: selector.cursorNextPage,
      reports: [
        {
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-blocked',
          jobId: WRITE_SIMULATION_JOB_IDS.materialGcAnchor,
          step: 'Retirement',
          outcome: 'Blocked',
          detail: '夹具模拟：安全检查拒绝了该版本，未继续推进。',
        },
        {
          ownerId: '11111111-1111-4111-8111-111111111111',
          algorithmId: 'd93b1655-af7d-411e-9de2-e80cbd21e185',
          versionId: 'qa-version-retryable',
          jobId: WRITE_SIMULATION_JOB_IDS.materialGcAnchor,
          step: 'StateWithdraw',
          outcome: 'Progressed',
          detail: '夹具模拟：已推进一个持久步骤，不代表整个集群已完成回收。',
        },
      ],
    }),
  }
}

function gcRearm({ ownerId, algorithmId, versionId }) {
  if (!ownerId || !algorithmId || !versionId) {
    return simulatedError(400, 'BadRequest',
      'params.ownerId, params.algorithmId and params.versionId must be non-empty strings.',
      'QA simulation: no successor was created.')
  }
  const selector = WRITE_SIMULATION_SELECTORS.materialGc
  if (versionId === selector.versionBlocked) {
    return simulatedError(409, 'MaterialGcRearmBlocked',
      'The obligation is not safe to re-arm; no successor was created.',
      'QA simulation: the failed anchor is unchanged.')
  }
  if (versionId === selector.versionAlreadyActive) {
    return simulatedResponse(200, {
      outcome: 'AlreadyActive',
      jobId: WRITE_SIMULATION_JOB_IDS.materialGcSuccessor,
      anchorJobId: WRITE_SIMULATION_JOB_IDS.materialGcAnchor,
      detail: '',
    })
  }
  return simulatedResponse(202, {
    outcome: 'Created',
    jobId: WRITE_SIMULATION_JOB_IDS.materialGcSuccessor,
    anchorJobId: WRITE_SIMULATION_JOB_IDS.materialGcAnchor,
    detail: '夹具模拟：后继委托保持 Pending，需要另行运行一轮回收。',
  })
}

function ownershipRefresh({ params }) {
  const ownerId = text(params.ownerId)
  const rawRevision = typeof params.pendingRevision === 'number'
    ? String(params.pendingRevision)
    : text(params.pendingRevision)
  const reason = text(params.reason)
  if (!ownerId || !/^\d+$/.test(rawRevision) || !reason) {
    return simulatedError(400, 'BadRequest',
      'ownerId, pendingRevision and reason are required; pendingRevision must be an unsigned integer.',
      'QA simulation: nothing was re-armed.')
  }
  const pendingRevision = Number(rawRevision)
  if (!Number.isSafeInteger(pendingRevision)) {
    return simulatedError(400, 'BadRequest', 'pendingRevision is out of range.',
      'QA simulation: nothing was re-armed.')
  }
  const retryable = pendingRevision === WRITE_SIMULATION_SELECTORS.ownershipRefresh.retryableRevision
  return simulatedResponse(200, {
    ownerId,
    pendingRevision,
    retried: retryable,
    reason,
    ...(retryable
      ? {}
      : { message: 'no retryable ownership refresh failure exists for that revision' }),
  })
}

/**
 * Resolve one write request against the isolated simulation.
 *
 * @param {object} args
 * @param {string} args.method HTTP method.
 * @param {string} args.path Normalized path.
 * @param {any} args.body Parsed JSON body, or `null` when empty.
 * @param {number} [args.longWaitMs] Delay for the explicit long-wait selector.
 * @returns {{ response: import('./response.mjs').JsonResponse, delayMs?: number } | null}
 *   `null` means this route is not simulated and the caller must keep the
 *   default read-only rejection.
 */
export function routeSimulatedWrite({ method, path, body, longWaitMs = 0 }) {
  if (method !== 'POST') return null
  const params = paramsOf(body)

  const sourceChangeMatch = /^\/v1\/audit-data\/([^/]+)\/source-change-jobs$/.exec(path)
  if (sourceChangeMatch) return { response: sourceChange({ params }) }

  const driftMatch = /^\/v1\/audit-data\/([^/]+)\/source-drift-recoveries\/([^/]+)\/approve-baseline$/.exec(path)
  if (driftMatch) {
    return {
      response: driftDecision({
        ownerId: decodeURIComponent(driftMatch[1]),
        recoveryId: decodeURIComponent(driftMatch[2]),
        params,
      }),
    }
  }

  if (path === '/v1/audit/maintenance') {
    return {
      response: maintenance({ explicitAlgorithmId: '', ownerId: ownerIdFromBody(body), params }),
    }
  }
  const maintenanceMatch = /^\/v1\/audit\/algorithms\/([^/]+)\/maintenance$/.exec(path)
  if (maintenanceMatch) {
    const explicitAlgorithmId = decodeURIComponent(maintenanceMatch[1])
    const ownerId = ownerIdFromBody(body)
    if (!explicitAlgorithmId) {
      return {
        response: simulatedError(400, 'BadRequest', 'algorithmId must not be empty.',
          'QA simulation: nothing was dispatched.'),
      }
    }
    return { response: maintenance({ explicitAlgorithmId, ownerId, params }) }
  }

  if (path === '/v1/audit/material-gc/run-pass') {
    return gcPass({ params, longWaitMs })
  }

  if (path === '/v1/audit/material-gc/rearm') {
    return {
      response: gcRearm({
        ownerId: text(params.ownerId),
        algorithmId: text(params.algorithmId),
        versionId: text(params.versionId),
      }),
    }
  }

  if (path === '/v1/ownership/refresh/retry') {
    return { response: ownershipRefresh({ params }) }
  }

  return null
}
