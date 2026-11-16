import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})
after(async () => { await vite.close() })

const helpers = await vite.ssrLoadModule('/src/views/audit/auditMaintenance.ts')
const sessionModule = await vite.ssrLoadModule('/src/views/audit/auditMaintenanceSession.ts')
const t = key => key

test('1-based indices preview sorts, de-duplicates and merges adjacent blocks', () => {
  const parsed = helpers.buildBlockSelection('indices', '5, 1, 2, 2', '')
  assert.equal(parsed.ok, true)
  assert.deepEqual([...parsed.selection.preview.indices], [1, 2, 5])
  assert.equal(parsed.selection.preview.canonicalRanges, 'ranges-v1:1+2,5+1')
  assert.equal(parsed.selection.preview.blockCountText, '3')
  assert.equal(parsed.selection.preview.rangeCount, 2)
  assert.equal(parsed.selection.preview.firstBlockText, '1')
  assert.equal(parsed.selection.preview.lastBlockText, '5')
  assert.equal(parsed.selection.preview.normalized, true)
  // The request keeps the operator's historical index array verbatim.
  assert.deepEqual([...parsed.selection.blockIndices], [5, 1, 2, 2])
})

test('canonical ranges preview keeps the exact wire text and BigInt totals', () => {
  const parsed = helpers.buildBlockSelection('ranges', '', ' ranges-v1:1+10,15+5 ')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.selection.blockRanges, 'ranges-v1:1+10,15+5')
  assert.equal(parsed.selection.preview.canonicalRanges, 'ranges-v1:1+10,15+5')
  assert.equal(parsed.selection.preview.blockCountText, '15')
  assert.equal(parsed.selection.preview.rangeCount, 2)
  assert.equal(parsed.selection.preview.firstBlockText, '1')
  assert.equal(parsed.selection.preview.lastBlockText, '19')

  const huge = helpers.buildBlockSelection(
    'ranges',
    '',
    'ranges-v1:9223372036854775807+9223372036854775807',
  )
  assert.equal(huge.ok, true)
  // blockCountText is the number of blocks in the range (count), not its
  // exclusive end; lastBlockText is first+count-1.
  assert.equal(huge.selection.preview.blockCountText, '9223372036854775807')
  assert.equal(huge.selection.preview.lastBlockText, '18446744073709551613')
})

test('selection validation reuses the documented block parser errors', () => {
  const zero = helpers.buildBlockSelection('indices', '0', '')
  assert.equal(zero.ok, false)
  assert.equal(zero.errorKey, 'audit.workbench.maintenance.errors.indexInvalid')

  const unmerged = helpers.buildBlockSelection('ranges', '', 'ranges-v1:1+10,11+5')
  assert.equal(unmerged.ok, false)
  assert.equal(unmerged.errorKey, 'audit.workbench.maintenance.errors.rangesUnmerged')
})

test('target and submission snapshots are frozen before the request', () => {
  const parsed = helpers.buildBlockSelection('indices', '1, 2, 5', '')
  assert.equal(parsed.ok, true)
  const target = helpers.buildMaintenanceTarget({
    ownerId: ' owner ',
    operatorId: '7',
    algorithmMode: 'explicit',
    requestedAlgorithmId: ' algorithm ',
    operation: 'Update',
    selection: parsed.selection,
  })
  assert.equal(target.ownerId, 'owner')
  assert.equal(target.canonicalRanges, 'ranges-v1:1+2,5+1')
  assert.equal(Object.isFrozen(target), true)

  const submission = helpers.buildOperationSubmission(
    helpers.maintenanceTargetFields(target, t),
    '2026-11-16T00:00:00.000Z',
  )
  assert.equal(Object.isFrozen(submission), true)
  assert.equal(Object.isFrozen(submission.fields), true)
  assert.equal(submission.submittedAt, '2026-11-16T00:00:00.000Z')
  assert.equal(submission.fields.some(field => field.value === 'algorithm'), true)
  assert.throws(() => { target.ownerId = 'mutated' })
})

test('HTTP failures keep the real status and backend code', () => {
  const http = helpers.readOperationFailure({
    message: 'Request failed',
    response: {
      status: 409,
      data: { error: 'MaterialGcPassInProgress', message: 'another pass runs', detail: 'single-flight' },
    },
  })
  assert.equal(http.kind, 'http')
  assert.equal(http.httpStatus, 409)
  assert.equal(http.code, 'MaterialGcPassInProgress')
  assert.equal(http.message, 'another pass runs')
  assert.equal(http.detail, 'single-flight')

  const canceled = helpers.readOperationFailure({ code: 'ERR_CANCELED', name: 'CanceledError', message: 'canceled' })
  assert.equal(canceled.kind, 'canceled')
  assert.equal(canceled.httpStatus, null)

  const network = helpers.readOperationFailure({ code: 'ERR_NETWORK', message: 'Network Error' })
  assert.equal(network.kind, 'network')
})

test('business outcomes distinguish dispatch, pass report and re-arm replay', () => {
  assert.equal(helpers.maintenanceSuccessOutcome(202).outcome, 'accepted')
  assert.equal(helpers.maintenanceSuccessOutcome(200).unexpectedStatus, true)
  assert.equal(helpers.materialGcPassSuccessOutcome(200).businessKey, 'audit.workbench.materialGc.businessPass')

  const created = helpers.rearmSuccessOutcome(202, { outcome: 'Created' })
  assert.equal(created.outcome, 'accepted')
  const replay = helpers.rearmSuccessOutcome(200, { outcome: 'AlreadyActive' })
  assert.equal(replay.outcome, 'existing')
  assert.equal(replay.unexpectedStatus, false)
  assert.equal(helpers.rearmSuccessOutcome(202, { outcome: 'AlreadyActive' }).unexpectedStatus, true)
})

test('GC failure meanings map to the documented single-flight and re-arm gates', () => {
  const passFailure = helpers.readOperationFailure({
    response: { status: 409, data: { error: 'MaterialGcPassInProgress', message: 'busy' } },
  })
  assert.equal(
    helpers.failureBusinessKey(passFailure, 'pass'),
    'audit.workbench.materialGc.businessPassInProgress',
  )

  const rearmFailure = helpers.readOperationFailure({
    response: { status: 409, data: { error: 'MaterialGcRearmBlocked', message: 'no' } },
  })
  assert.equal(
    helpers.failureBusinessKey(rearmFailure, 'rearm'),
    'audit.workbench.materialGc.businessRearmBlocked',
  )
})

test('cursor continuation is explicit and never inferred from a failed run', () => {
  const continuation = helpers.materialGcContinuation({
    versionsExamined: 3,
    versionsRetired: 1,
    moreWorkPending: true,
    nextLifecycleCursor: 'cursor-1',
    reports: [],
  })
  assert.deepEqual(continuation, {
    moreWorkPending: true,
    cursor: 'cursor-1',
    canContinue: true,
  })
  assert.equal(helpers.materialGcContinuation(null).canContinue, false)
  assert.equal(helpers.materialGcContinuation({
    versionsExamined: 1,
    versionsRetired: 0,
    moreWorkPending: true,
    nextLifecycleCursor: null,
    reports: [],
  }).canContinue, false)
})

test('report rows prefill only the exact re-arm identities they carry', () => {
  assert.deepEqual(helpers.rearmPrefillFromReport({
    ownerId: 'owner',
    algorithmId: 'algorithm',
    versionId: 'version',
    jobId: 'job',
    step: 'TagReclaim',
    outcome: 'Blocked',
  }), {
    ownerId: 'owner',
    algorithmId: 'algorithm',
    versionId: 'version',
    sourceJobId: 'job',
  })
  assert.equal(helpers.rearmPrefillFromReport({ ownerId: 'owner', versionId: 'version' }), null)
  assert.equal(helpers.rearmNextStepKey({ outcome: 'Created' }), 'audit.workbench.materialGc.nextStepAfterRearm')
})

test('owner binding pages refuse another owner and duplicate algorithms', () => {
  const page = helpers.readOwnerAuditBindingPage({
    items: [
      { userId: 'owner', purpose: 'Audit', algorithmId: 'a', algorithmVersion: 2 },
      { userId: 'owner', purpose: 'Audit', algorithmId: 'a', algorithmVersion: 2 },
      { userId: 'other', purpose: 'Audit', algorithmId: 'b', algorithmVersion: 1 },
      { userId: 'owner', purpose: 'Identity', algorithmId: 'c', algorithmVersion: 1 },
    ],
    total: 4,
    totalPages: 2,
  }, ' owner ')
  assert.deepEqual(page.items, [{ algorithmId: 'a', algorithmVersion: 2 }])
  assert.equal(page.totalPages, 2)
  assert.equal(helpers.readOwnerAuditBindingPage({ items: [] }, ''), null)
})

test('session-owned form, report and cursor state survives a tab remount', () => {
  sessionModule.resetAuditMaintenanceSession()
  const state = sessionModule.auditMaintenanceSession
  state.maintenance.indicesText = '1, 2'
  state.gc.cursor = 'cursor-1'
  state.gc.pass.round = 3
  // A remount reads the same module object instead of component-local refs.
  assert.equal(sessionModule.auditMaintenanceSession.maintenance.indicesText, '1, 2')
  assert.equal(sessionModule.auditMaintenanceSession.gc.cursor, 'cursor-1')
  assert.equal(sessionModule.auditMaintenanceSession.gc.pass.round, 3)
  sessionModule.resetAuditMaintenanceSession()
  assert.equal(state.maintenance.indicesText, '')
})
