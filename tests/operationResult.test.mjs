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

const model = await vite.ssrLoadModule('/src/components/operationResult.ts')
const en = (await vite.ssrLoadModule('/src/locales/en.ts')).default
const zhCN = (await vite.ssrLoadModule('/src/locales/zh-CN.ts')).default

function getByPath(object, path) {
  return path.split('.').reduce((value, part) => value?.[part], object)
}

test('an accepted job answer never claims completion', () => {
  assert.equal(model.classifyOperationOutcome({ jobId: 'job-1' }), 'accepted')
  assert.equal(model.classifyOperationOutcome({ status: 'Accepted' }), 'accepted')
  assert.equal(model.classifyOperationOutcome({ httpStatus: 202 }), 'accepted')
  assert.equal(model.classifyOperationOutcome({ jobId: 'job-1', outcome: 'Created' }), 'accepted')
})

test('a completed payload with a tracking job id is not a pending dispatch', () => {
  assert.equal(model.classifyOperationOutcome({
    jobId: 'job-1',
    proofType: 'membership',
    rootHash: 'root-1',
  }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ jobId: 'job-1', ownerId: 'owner-1' }), 'accepted')
  assert.equal(model.classifyOperationOutcome({ jobId: 'job-1', status: 'Dispatched' }), 'accepted')
})

test('already-existing, blocked and not-retried answers keep their own state', () => {
  assert.equal(model.classifyOperationOutcome({ outcome: 'AlreadyActive', jobId: 'job-1' }), 'existing')
  assert.equal(model.classifyOperationOutcome({ alreadyExists: true }), 'existing')
  assert.equal(model.classifyOperationOutcome({ status: 'AlreadyExists', jobId: 'job-1' }), 'existing')
  assert.equal(model.classifyOperationOutcome({ outcome: 'Blocked', jobId: 'job-1' }), 'blocked')
  assert.equal(model.classifyOperationOutcome({ retried: false }), 'not-retried')
  assert.equal(model.classifyOperationOutcome({ outcome: 'NotRetried' }), 'not-retried')
  assert.equal(model.classifyOperationOutcome({ retried: true }), 'succeeded')
})

test('an inconclusive payload is unknown instead of assumed success', () => {
  assert.equal(model.classifyOperationOutcome({}), 'unknown')
  assert.equal(model.classifyOperationOutcome('done'), 'unknown')
  assert.equal(model.classifyOperationOutcome([1]), 'unknown')
  assert.equal(model.classifyOperationOutcome({ valid: undefined }), 'unknown')
  assert.equal(model.classifyOperationOutcome(null), null)
  assert.equal(model.classifyOperationOutcome(undefined), null)
})

test('a listing envelope never proves that an operation completed', () => {
  assert.equal(model.classifyOperationOutcome({ total: 12, cells: [] }), 'unknown')
  assert.equal(model.classifyOperationOutcome({ total: 0 }), 'unknown')
  assert.equal(model.classifyOperationOutcome({ cells: [{ tableId: '1', rowId: '7', columnId: 0 }] }), 'unknown')
  assert.equal(model.classifyOperationOutcome({ page: 2, pageSize: 20, totalPages: 3, total: 41 }), 'unknown')
  assert.equal(model.classifyOperationOutcome({
    ownerId: 'owner-1',
    total: 3,
    cells: [{ tableId: '1', rowId: '7', columnId: 0 }],
    tableIds: ['1'],
    tableSummaries: [{ tableId: '1', rowCount: 1, cellCount: 1 }],
  }), 'unknown')
  // A tracking job id still says the work is pending, never done.
  assert.equal(model.classifyOperationOutcome({ jobId: 'job-1', total: 3, cells: [] }), 'accepted')
  assert.equal(model.classifyOperationOutcome({ status: 'Pending', total: 3 }), 'unknown')
  // A bare count is no proof either; committed mutations answer with a root.
  assert.equal(model.classifyOperationOutcome({ ownerId: 'o1', cellsAdded: 2 }), 'unknown')
})

test('a proof or verdict counts only when it actually carries a value', () => {
  assert.equal(model.classifyOperationOutcome({ valid: null }), 'unknown')
  assert.equal(model.classifyOperationOutcome({ verdict: '   ' }), 'unknown')
  assert.equal(model.classifyOperationOutcome({ verdict: null, total: 2 }), 'unknown')
})

test('a real request error always classifies as failed', () => {
  assert.equal(model.classifyOperationOutcome({ jobId: 'job-1' }, 'backend rejected the request'), 'failed')
  assert.equal(model.classifyOperationOutcome(undefined, 'network error'), 'failed')
})

test('completed synchronous answers stay distinct from accepted work', () => {
  assert.equal(model.classifyOperationOutcome({ baselineDecision: 'Approved' }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ ownerId: 'o1', deleted: true }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ ownerId: 'o1', deleted: false }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ valid: false }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ verdict: 'invalid' }), 'succeeded')
  // Ownership mutations answer with committed roots, even when a tracking job exists.
  assert.equal(model.classifyOperationOutcome({ ownerId: 'o1', cellsAdded: 2, rootHash: 'root-1' }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({
    sourceOwnerId: 'a', targetOwnerId: 'b', cellsMoved: 2,
    sourceRootHash: 'root-a', targetRootHash: 'root-b', jobId: 'job-2',
  }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ ownerId: 'o1', rootNodeId: 'node-1' }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ proofType: 'membership', layers: [] }), 'succeeded')
  // An explicit completion word in the answer is evidence too.
  assert.equal(model.classifyOperationOutcome({ outcome: 'Created' }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ outcome: 'ok' }), 'succeeded')
  assert.equal(model.classifyOperationOutcome({ status: 'Completed' }), 'succeeded')
})

test('outcome tones keep accepted, existing, not-retried and failed distinguishable', () => {
  const tones = new Map([
    ['succeeded', 'success'],
    ['accepted', 'info'],
    ['existing', 'info'],
    ['not-retried', 'default'],
    ['blocked', 'warning'],
    ['unknown', 'default'],
    ['failed', 'error'],
  ])
  for (const [kind, tone] of tones) {
    assert.equal(model.operationOutcomeTone(kind), tone)
  }
  assert.equal(new Set(tones.values()).size > 1, true)
})

test('every outcome label key exists in both locales', () => {
  const kinds = Object.keys(model.OPERATION_OUTCOME_LABEL_KEYS)
  assert.equal(kinds.length, 7)
  for (const key of Object.values(model.OPERATION_OUTCOME_LABEL_KEYS)) {
    assert.equal(typeof getByPath(en, key), 'string', `missing en ${key}`)
    assert.equal(typeof getByPath(zhCN, key), 'string', `missing zh-CN ${key}`)
  }
  assert.equal(getByPath(en, 'operationResult.outcome.accepted').includes('pending'), true)
  assert.equal(getByPath(en, 'operationResult.outcome.accepted').includes('running'), false)
  assert.equal(getByPath(zhCN, 'operationResult.outcome.accepted').includes('待确认'), true)
})

test('submission snapshots are frozen copies, not aliases of the live form', () => {
  const source = {
    fields: [
      { labelKey: 'ownership.ownerId', value: 'owner-1', mono: true },
      { labelKey: 'ownership.workbench.refresh.facts.pendingRevision', value: '4' },
    ],
    submittedAt: '2026-11-16T05:00:00.000Z',
    requestId: 'req-1',
    traceId: 'trace-1',
  }
  const frozen = model.freezeSubmissionSnapshot(source)
  assert.equal(Object.isFrozen(frozen), true)
  assert.equal(Object.isFrozen(frozen.fields), true)
  assert.equal(Object.isFrozen(frozen.fields[0]), true)
  assert.notEqual(frozen.fields, source.fields)
  assert.notEqual(frozen.fields[0], source.fields[0])

  source.fields[0].value = 'owner-2'
  source.fields.push({ labelKey: 'extra', value: 'late edit' })
  assert.equal(frozen.fields[0].value, 'owner-1')
  assert.equal(frozen.fields.length, 2)
})

test('trace and request context are read only when the answer echoes them', () => {
  assert.equal(model.resultTraceId({ traceId: ' trace-1 ' }), 'trace-1')
  assert.equal(model.resultTraceId({ traceId: '' }), '')
  assert.equal(model.resultTraceId('trace-1'), '')
  assert.equal(model.resultRequestId({ requestId: 'req-1' }), 'req-1')
  assert.equal(model.resultRequestId({ correlationId: 'corr-1' }), 'corr-1')
  assert.equal(model.resultRequestId(null), '')
})
