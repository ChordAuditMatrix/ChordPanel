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

const flow = await vite.ssrLoadModule('/src/features/recovery/recoveryFlow.ts')
const t = (key, params) => params ? `${key}:${JSON.stringify(params)}` : key

const sourceBase = {
  ownerId: 'owner-1',
  operatorId: '2',
  notificationId: 'mysql-binlog-42',
  cells: [],
}

test('source-change scope is an explicit choice, never implied by empty cells', () => {
  const missingScope = flow.createSourceChangeSnapshot({
    ...sourceBase,
    scope: null,
  })
  assert.equal(missingScope.ok, false)
  assert.equal(missingScope.errorKey, 'recovery.scope.required')

  const emptyCells = flow.createSourceChangeSnapshot({
    ...sourceBase,
    scope: 'cells',
  })
  assert.equal(emptyCells.ok, false)
  assert.equal(emptyCells.errorKey, 'recovery.scope.cellsEmpty')

  const wholeFile = flow.createSourceChangeSnapshot({
    ...sourceBase,
    scope: 'whole-file',
    cells: [{ key: 'ignored', tableId: '7', rowId: 'row-1', columnId: 1 }],
    capturedAt: '2026-11-16T10:00:00.000Z',
    requestRef: 'source-change:test',
  })
  assert.equal(wholeFile.ok, true)
  assert.equal(wholeFile.snapshot.scope, 'whole-file')
  assert.deepEqual(wholeFile.snapshot.tuples, [])
  assert.equal(wholeFile.snapshot.tupleCount, 0)
  assert.equal(wholeFile.snapshot.requestRef, 'source-change:test')
})

test('structured cells keep exact ids and validate each field with its row index', () => {
  const parsed = flow.sourceChangeCellsToTuples([
    { key: 'a', tableId: '9223372036854775807', rowId: '0010', columnId: 4294967295 },
    { key: 'b', tableId: '0', rowId: 'row-2', columnId: 0 },
  ])
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.tuples, [
    { tableId: '9223372036854775807', rowId: '0010', columnId: 4294967295 },
    { tableId: '0', rowId: 'row-2', columnId: 0 },
  ])
  assert.equal(parsed.payloadBytes, 2 * 96 + '0010'.length + 'row-2'.length)

  const tableTooLarge = flow.sourceChangeCellsToTuples([
    { key: 'a', tableId: '9223372036854775808', rowId: 'r', columnId: 0 },
  ])
  assert.equal(tableTooLarge.ok, false)
  assert.equal(tableTooLarge.errorKey, 'audit.workbench.sourceChange.errors.tableId')
  assert.deepEqual(tableTooLarge.errorParams, { index: '1' })

  const missingRowId = flow.sourceChangeCellsToTuples([
    { key: 'a', tableId: '1', rowId: '   ', columnId: 0 },
  ])
  assert.equal(missingRowId.errorKey, 'audit.workbench.sourceChange.errors.rowId')

  const badColumn = flow.sourceChangeCellsToTuples([
    { key: 'a', tableId: '1', rowId: 'r', columnId: null },
  ])
  assert.equal(badColumn.errorKey, 'audit.workbench.sourceChange.errors.columnId')
})

test('a frozen source-change snapshot does not follow later form edits', () => {
  const cells = [{ key: 'a', tableId: '7', rowId: '0010', columnId: 3 }]
  const built = flow.createSourceChangeSnapshot({
    ...sourceBase,
    scope: 'cells',
    cells,
    capturedAt: '2026-11-16T10:00:00.000Z',
    requestRef: 'source-change:frozen',
  })
  assert.equal(built.ok, true)
  assert.equal(Object.isFrozen(built.snapshot), true)
  assert.equal(Object.isFrozen(built.snapshot.tuples), true)
  assert.equal(Object.isFrozen(built.snapshot.tuples[0]), true)

  cells[0].rowId = 'changed'
  assert.equal(built.snapshot.tuples[0].rowId, '0010')
  assert.equal(built.snapshot.tuples[0].tableId, '7')

  const facts = flow.sourceChangeSnapshotFacts(built.snapshot, t)
  const scopeFact = facts.find(fact => fact.labelKey === 'recovery.snapshot.scope')
  assert.equal(scopeFact.value, 'recovery.scope.cells')
  assert.equal(facts.some(fact => fact.labelKey === 'recovery.snapshot.requestRef'), true)
  assert.equal(facts.some(fact => fact.labelKey === 'recovery.scope.payloadBytes'), true)

  assert.equal(flow.sourceChangeConsequenceKeys(built.snapshot).includes('recovery.confirm.sourceCells'), true)
  const submission = flow.sourceChangeSubmission(built.snapshot, t)
  assert.equal(submission.requestId, 'source-change:frozen')
  assert.equal(submission.fields.some(fact => fact.labelKey === 'audit.workbench.sourceChange.notificationId'), true)
  assert.equal(submission.fields.some(fact => fact.labelKey === 'recovery.snapshot.requestRef'), false)
})

test('drift reports keep the revision explicit and never parse the opaque recovery id', () => {
  const reportInput = {
    kind: 'source-drift',
    ownerId: ' owner-1 ',
    recoveryId: 'source-drift-recovery:owner-1:99',
    driftRevision: 3,
    sourceLabel: 'source-drift report',
    reportRef: 'drift-report-7',
    reportedAt: '2026-11-16T09:00:00.000Z',
  }
  const parsed = flow.normalizeDriftRecoveryReport(reportInput)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.report.ownerId, 'owner-1')
  assert.equal(parsed.report.recoveryId, 'source-drift-recovery:owner-1:99')
  assert.equal(parsed.report.driftRevision, 3)

  const available = flow.planDriftReportPrefill(reportInput, 'owner-1')
  assert.equal(available.status, 'available')
  assert.equal(available.report.driftRevision, 3)

  const mismatch = flow.planDriftReportPrefill(reportInput, 'owner-2')
  assert.equal(mismatch.status, 'owner-mismatch')
  assert.equal(mismatch.report.ownerId, 'owner-1')

  assert.equal(flow.planDriftReportPrefill(null, 'owner-1').status, 'missing')
  assert.equal(flow.planDriftReportPrefill({ ownerId: 'owner-1', recoveryId: 'r' }, 'owner-1').status, 'invalid')
  assert.equal(flow.planDriftReportPrefill({
    ownerId: 'owner-1',
    recoveryId: 'r',
    driftRevision: 0,
  }, 'owner-1').status, 'invalid')
})

test('refresh reports prefill only the exact same owner and revision', () => {
  const parsed = flow.normalizeRefreshFailureReport({
    ownerId: 'owner-1',
    pendingRevision: 0,
    sourceLabel: 'refresh failure log',
    reportRef: 'refresh-9',
  })
  assert.equal(parsed.ok, true)
  assert.equal(parsed.report.pendingRevision, 0)
  assert.equal(flow.planRefreshReportPrefill({
    ownerId: 'owner-1',
    pendingRevision: 0,
  }, 'owner-1').status, 'available')
  assert.equal(flow.planRefreshReportPrefill({
    ownerId: 'owner-1',
    pendingRevision: 0,
  }, 'owner-2').status, 'owner-mismatch')
  assert.equal(flow.normalizeRefreshFailureReport({ ownerId: 'o', pendingRevision: -1 }).ok, false)
  assert.equal(flow.normalizeRefreshFailureReport({ ownerId: 'o', pendingRevision: 1.5 }).ok, false)

  const report = parsed.report
  assert.equal(flow.refreshReportMatches(report, 'owner-1', 0), true)
  assert.equal(flow.refreshReportMatches(report, 'owner-1', 1), false)
  assert.equal(flow.refreshReportMatches(report, 'owner-2', 0), false)
})

test('drift snapshots freeze the reviewed target and expose traceable facts', () => {
  const report = flow.normalizeDriftRecoveryReport({
    ownerId: 'owner-1',
    recoveryId: 'source-drift-recovery:owner-1:99',
    driftRevision: 3,
    sourceLabel: 'source-drift report',
    reportRef: 'drift-report-7',
    reportedAt: '2026-11-16T09:00:00.000Z',
  }).report
  const built = flow.createDriftTargetSnapshot({
    ownerId: 'owner-1',
    operatorId: '2',
    recoveryId: report.recoveryId,
    driftRevision: report.driftRevision,
    origin: flow.originFromDriftReport(report),
    capturedAt: '2026-11-16T10:00:00.000Z',
    requestRef: 'drift-approval:test',
  })
  assert.equal(built.ok, true)
  assert.equal(Object.isFrozen(built.snapshot), true)
  assert.equal(Object.isFrozen(built.snapshot.origin), true)
  assert.equal(built.snapshot.origin.kind, 'report')
  assert.equal(built.snapshot.origin.reportRef, 'drift-report-7')

  const facts = flow.driftSnapshotFacts(built.snapshot, t)
  const labels = facts.map(fact => fact.labelKey)
  assert.equal(labels.includes('audit.workbench.drift.recoveryId'), true)
  assert.equal(labels.includes('recovery.snapshot.origin'), true)
  assert.equal(labels.includes('recovery.snapshot.reportRef'), true)
  assert.equal(facts.find(fact => fact.labelKey === 'recovery.snapshot.origin').value, 'recovery.snapshot.originReport')

  const submission = flow.driftSubmission(built.snapshot, t)
  assert.equal(submission.requestId, 'drift-approval:test')
  assert.equal(submission.submittedAt, '2026-11-16T10:00:00.000Z')
  assert.equal(Object.isFrozen(submission.fields), true)

  assert.equal(flow.driftConsequenceKeys().length, 4)
  assert.equal(typeof flow.DRIFT_ACK_KEY, 'string')
  assert.equal(flow.DRIFT_ACK_KEY.length > 0, true)
})

test('retried false is classified as neutral, not as a failure or success', () => {
  assert.deepEqual(flow.classifyRefreshRetry({ retried: false }), {
    kind: 'not-retried',
    headlineKey: 'ownership.workbench.refresh.notRetried',
  })
  assert.deepEqual(flow.classifyRefreshRetry({ retried: true }), {
    kind: 'succeeded',
    headlineKey: 'ownership.workbench.refresh.retried',
  })
  assert.deepEqual(flow.classifyRefreshRetry({}), {
    kind: 'unknown',
    headlineKey: 'recovery.refresh.outcomeUnknown',
  })
  assert.equal(flow.classifyRefreshRetry(null), null)

  assert.equal(flow.refreshConsequenceKeys().includes('recovery.confirm.refreshNeutralFalse'), true)
  assert.equal(flow.refreshConsequenceKeys().includes('recovery.confirm.refreshNotAutomatic'), true)
  assert.equal(flow.REFRESH_ACK_KEY.length > 0, true)
})

test('refresh snapshots retain the reviewed revision, reason and origin for the result', () => {
  const report = flow.normalizeRefreshFailureReport({
    ownerId: 'owner-1',
    pendingRevision: 4,
    sourceLabel: 'refresh failure log',
    reportRef: 'refresh-9',
  }).report
  const built = flow.createRefreshTargetSnapshot({
    ownerId: 'owner-1',
    operatorId: '2',
    pendingRevision: report.pendingRevision,
    reason: 'transient generateTags refusal resolved',
    origin: flow.originFromRefreshReport(report),
    capturedAt: '2026-11-16T10:00:00.000Z',
    requestRef: 'refresh-retry:test',
  })
  assert.equal(built.ok, true)
  assert.equal(Object.isFrozen(built.snapshot), true)
  assert.equal(built.snapshot.pendingRevision, 4)
  assert.equal(built.snapshot.reason, 'transient generateTags refusal resolved')
  assert.equal(built.snapshot.origin.kind, 'report')
  assert.equal(built.snapshot.origin.reportSource, 'refresh failure log')

  const facts = flow.refreshSnapshotFacts(built.snapshot, t)
  const labels = facts.map(fact => fact.labelKey)
  assert.equal(labels.includes('ownership.workbench.refresh.pendingRevision'), true)
  assert.equal(labels.includes('ownership.workbench.refresh.reason'), true)
  assert.equal(labels.includes('recovery.snapshot.reportRef'), true)

  const submission = flow.refreshSubmission(built.snapshot, t)
  assert.equal(submission.requestId, 'refresh-retry:test')
  assert.equal(submission.fields.some(fact =>
    fact.labelKey === 'ownership.workbench.refresh.reason'), true)
  assert.equal(submission.fields.some(fact =>
    fact.labelKey === 'recovery.snapshot.requestRef'), false)

  assert.equal(flow.createRequestRef('probe', 'fixed'), 'probe:fixed')
})
