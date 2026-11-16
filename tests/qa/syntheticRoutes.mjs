/**
 * Synthetic (non-telemetry) routes.
 *
 * System status, Nodes, Jobs, Tasks, Users, Algorithms, AuditTables and
 * tagged-range previews answer from `fixtures/synthetic/base.json`. Every
 * response is labelled `X-ChordPanel-QA-Source: synthetic`; nothing here is a
 * recorded backend exchange.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, toInt } from './httpUtils.mjs'
import { errorResponse, jsonResponse } from './response.mjs'
import { selectScenarioView } from './scenarioViews.mjs'

const SYNTHETIC_FIXTURE = 'fixtures/synthetic/base.json'

/**
 * @param {object} args
 * @param {any} args.synthetic Parsed `fixtures/synthetic/base.json`.
 * @param {{ jobs: Map<string, any> }} args.registry
 * @param {string} args.path Normalized request path.
 * @param {URLSearchParams} args.query
 * @param {string | undefined} args.referer
 */
export function routeSyntheticRequest({ synthetic, registry, path, query, referer }) {
  const base = { scenario: null, fixture: SYNTHETIC_FIXTURE }

  if (path === '/v1/system/status') {
    return syntheticResponse(base, synthetic.systemStatus)
  }

  if (path === '/v1/nodes') {
    return syntheticResponse(base, pageOf(synthetic.nodes, query))
  }

  if (/^\/v1\/nodes\/[^/]+\/protocol-events$/.test(path)) {
    return errorResponse({
      status: 501,
      source: 'fixture-missing',
      code: 'protocol_events_not_captured',
      scenario: base.scenario,
      fixture: base.fixture,
      message: 'Node-level protocol-event records are not included in the checked-in fixture set.',
      detail: 'Trace protocol captures are a different API resource and are not substituted here.',
    })
  }

  const nodeDetail = /^\/v1\/nodes\/([^/]+)$/.exec(path)
  if (nodeDetail) {
    const nodeId = decodeURIComponent(nodeDetail[1])
    const detail = synthetic.nodeDetails?.[nodeId]
    if (!detail) {
      return syntheticError(404, 'node_not_found',
        `Node ${nodeId} is not part of the synthetic QA node set.`,
        `Known nodes: ${Object.keys(synthetic.nodeDetails ?? {}).join(', ')}`)
    }
    return syntheticResponse(base, detail)
  }

  if (path === '/v1/jobs') {
    const rows = sortJobs(filterJobs(synthetic.jobs, query), query).map(jobSummaryOf)
    return syntheticResponse(base, pageOf(rows, query))
  }

  if (path === '/v1/jobs/aggregate') {
    return syntheticError(501, 'qa_route_not_implemented',
      'The QA fixture server does not implement Job aggregation.',
      'The frontend does not call /v1/jobs/aggregate.')
  }

  const jobTasks = /^\/v1\/jobs\/([^/]+)\/tasks$/.exec(path)
  if (jobTasks) {
    const jobId = decodeURIComponent(jobTasks[1])
    const entry = registry.jobs.get(jobId)
    const view = entry ? selectScenarioView(entry, referer) : null
    const taskBase = view ? { ...base, scenario: view.id } : base
    const tasks = synthetic.tasks?.[jobId]
    if (!tasks || view?.tasksUnavailable === true) {
      if (entry) {
        return errorResponse({
          status: 501,
          source: 'fixture-missing',
          code: 'tasks_not_captured',
          scenario: taskBase.scenario,
          fixture: taskBase.fixture,
          message: `No Task response is configured for QA Trace Job ${jobId}.`,
          detail: 'This QA scenario provides no Task response; the server will not synthesize Task IDs or statuses.',
        })
      }
      return syntheticError(404, 'job_not_found',
        `Job ${jobId} has no synthetic task list.`,
        `Known Jobs: ${Object.keys(synthetic.tasks ?? {}).join(', ')}`)
    }
    const sorted = [...tasks].sort((left, right) => (left.submittedAtMs ?? 0) - (right.submittedAtMs ?? 0))
    return syntheticResponse(taskBase, pageOf(sorted, query))
  }

  const jobDetailMatch = /^\/v1\/jobs\/([^/]+)$/.exec(path)
  if (jobDetailMatch) {
    const jobId = decodeURIComponent(jobDetailMatch[1])
    const job = synthetic.jobs.find(candidate => candidate.jobId === jobId)
    if (!job) {
      return syntheticError(404, 'job_not_found',
        `Job ${jobId} is not part of the synthetic QA job set.`,
        `Known Jobs: ${synthetic.jobs.map(candidate => candidate.jobId).join(', ')}`)
    }
    const entry = registry.jobs.get(jobId)
    const view = entry ? selectScenarioView(entry, referer) : null
    const jobDetail = {
      ...job,
      status: view?.jobStatus ?? job.status ?? null,
      history: Array.isArray(job.history) ? job.history : [],
    }
    const hasSyntheticIdentityDetails = view?.resources.summary?.syntheticIdentitySummary === true
    if (hasSyntheticIdentityDetails) {
      jobDetail.metadata = {
        ...jobDetail.metadata,
        _rootHash: 'qa-root-hash-visual-only-371f5280',
      }
    }
    if (view?.jobStatus === 'Running') {
      jobDetail.status = 'Running'
      jobDetail.endedAtMs = null
      jobDetail.totalDurationMs = null
      jobDetail.history = jobDetail.history.filter(item => item.status === 'Pending' || item.status === 'Running')
    } else if (view?.jobStatus) {
      jobDetail.status = view.jobStatus
    }
    if (view?.tasksUnavailable === true) delete jobDetail.taskIds
    return syntheticResponse(
      {
        ...base,
        scenario: view?.id ?? null,
        ...(hasSyntheticIdentityDetails
          ? {
              fixture: 'synthetic-identity-summary-preview',
              projection: 'qa-synthetic-identity-details',
            }
          : {}),
      },
      jobDetail,
    )
  }

  if (path === '/v1/users') {
    return syntheticResponse(base, pageOf(sortUsers(synthetic.users, query), query))
  }

  const userDetail = /^\/v1\/users\/([^/]+)$/.exec(path)
  if (userDetail) {
    const userId = decodeURIComponent(userDetail[1])
    const user = synthetic.users.find(candidate => candidate.userId === userId)
    if (!user) {
      return syntheticError(404, 'user_not_found',
        `User ${userId} is not part of the synthetic QA user set.`,
        `Known users: ${synthetic.users.map(candidate => candidate.userId).join(', ')}`)
    }
    return syntheticResponse(base, user)
  }

  if (path === '/v1/algorithms/strategies') {
    return syntheticResponse(base, pageOf(synthetic.strategies, query))
  }

  if (path === '/v1/algorithms/profiles') {
    const type = query.get('type')
    const purpose = query.get('purpose')
    const profiles = synthetic.profiles.filter(profile =>
      (!type || profile.algorithmType === type) && (!purpose || profile.purpose === purpose))
    return syntheticResponse(base, pageOf(profiles, query))
  }

  const profileBindings = /^\/v1\/algorithms\/profiles\/([^/]+)\/bindings$/.exec(path)
  if (profileBindings) {
    const algorithmId = decodeURIComponent(profileBindings[1])
    const bindings = synthetic.bindings.filter(binding => binding.algorithmId === algorithmId)
    return syntheticResponse(base, pageOf(bindings, query))
  }

  if (path === '/v1/algorithms/bindings') {
    const algorithmName = query.get('algorithmName')
    const userId = query.get('userId')
    const algorithmIds = new Set(
      synthetic.profiles
        .filter(profile => !algorithmName || profile.algorithmName === algorithmName)
        .map(profile => profile.algorithmId),
    )
    const bindings = synthetic.bindings.filter(binding =>
      algorithmIds.has(binding.algorithmId) && (!userId || binding.userId === userId))
    return syntheticResponse(base, pageOf(bindings, query))
  }

  if (path === '/v1/audit-tables') {
    const status = query.get('status')
    const tableName = query.get('tableName')?.trim().toLowerCase()
    const tables = synthetic.auditTables.filter(table =>
      (!status || table.status === status)
      && (!tableName || table.tableName.toLowerCase().includes(tableName)))
    return syntheticResponse(base, pageOf(tables, query))
  }

  const auditTable = /^\/v1\/audit-tables\/([^/]+)$/.exec(path)
  if (auditTable) {
    const tableId = decodeURIComponent(auditTable[1])
    const table = synthetic.auditTables.find(candidate => candidate.tableId === tableId)
    if (!table) {
      return syntheticError(404, 'audit_table_not_found',
        `Audit table ${tableId} is not part of the synthetic QA table set.`,
        `Known tables: ${synthetic.auditTables.map(candidate => candidate.tableId).join(', ')}`)
    }
    return syntheticResponse(base, table)
  }

  const taggedRangesMatch = /^\/v1\/audit-data\/([^/]+)\/tagged-ranges$/.exec(path)
  if (taggedRangesMatch) {
    const ownerId = decodeURIComponent(taggedRangesMatch[1])
    const owner = synthetic.taggedRanges?.[ownerId]
    if (!owner) {
      return syntheticError(404, 'qa_owner_not_in_fixture',
        `Owner ${ownerId} has no synthetic tagged-range visual fixture.`,
        `Fixture owners: ${Object.keys(synthetic.taggedRanges ?? {}).join(', ')}`)
    }

    const algorithmId = query.get('algorithmId')?.trim() || owner.defaultAlgorithmId
    const ranges = owner.rangesByAlgorithmId?.[algorithmId]
    if (!Array.isArray(ranges)) {
      return syntheticError(404, 'qa_algorithm_not_in_fixture',
        `Algorithm ${algorithmId} has no synthetic tagged-range visual fixture for owner ${ownerId}.`,
        `Fixture algorithms: ${Object.keys(owner.rangesByAlgorithmId ?? {}).join(', ')}`)
    }

    return syntheticResponse(base, { algorithmId, ranges }, 'synthetic-visual')
  }

  return syntheticError(501, 'qa_route_not_implemented',
    'The QA fixture server does not implement this route.',
    `GET ${path} is outside the fixture surface; see tests/qa/README.md.`)
}

function syntheticResponse(base, body, projection = null) {
  return jsonResponse({
    source: 'synthetic',
    fixture: base.fixture ?? SYNTHETIC_FIXTURE,
    scenario: base.scenario ?? null,
    projection: projection ?? base.projection ?? null,
    body,
  })
}

function syntheticError(status, code, message, detail) {
  return errorResponse({
    status,
    source: 'synthetic',
    code,
    message,
    detail,
    fixture: SYNTHETIC_FIXTURE,
  })
}

// ── Synthetic paging helpers ─────────────────────────────────────────────────

export function pageOf(items, query, pageSizeDefault = DEFAULT_PAGE_SIZE) {
  const page = toInt(query.get('page'), 1, 1, 1e6)
  const pageSize = toInt(query.get('pageSize'), pageSizeDefault, 1, MAX_PAGE_SIZE)
  const total = items.length
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  }
}

/** The list route returns `JobSummary`; history/task ids stay on the detail route. */
function jobSummaryOf(job) {
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    status: job.status,
    errorCode: job.errorCode,
    statusMessage: job.statusMessage,
    dataOwner: job.dataOwner,
    initiator: job.initiator,
    createdAtMs: job.createdAtMs,
    startedAtMs: job.startedAtMs,
    endedAtMs: job.endedAtMs,
    totalDurationMs: job.totalDurationMs,
  }
}

function filterJobs(jobs, query) {
  const status = query.get('status')
  const jobType = query.get('jobType')
  const owner = query.get('dataOwnerUserId')
  const metadataFilters = []
  for (const [key, value] of query) {
    if (key.startsWith('metadata.')) metadataFilters.push([key.slice('metadata.'.length), value])
  }
  return jobs.filter(job => {
    if (status && String(job.status).toLowerCase() !== status.toLowerCase()) return false
    if (jobType && job.jobType !== jobType) return false
    if (owner && job.dataOwner?.userId !== owner) return false
    for (const [key, value] of metadataFilters) {
      if (String(job.metadata?.[key] ?? '') !== value) return false
    }
    return true
  })
}

function sortJobs(jobs, query) {
  const ascending = query.get('ascending') !== 'false'
  const sorted = [...jobs].sort((left, right) => (left.createdAtMs ?? 0) - (right.createdAtMs ?? 0))
  return ascending ? sorted : sorted.reverse()
}

function sortUsers(users, query) {
  const sortBy = query.get('sortBy') === 'updatedAtMs' ? 'updatedAtMs' : 'createdAtMs'
  const ascending = query.get('ascending') === 'true'
  const sorted = [...users].sort((left, right) => (left[sortBy] ?? 0) - (right[sortBy] ?? 0))
  return ascending ? sorted : sorted.reverse()
}
