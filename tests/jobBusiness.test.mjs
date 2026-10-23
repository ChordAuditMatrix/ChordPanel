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

const {
  formatJobDuration,
  isCanonicalJobType,
  jobBusinessObjects,
  jobErrorLabel,
  jobVerification,
  isCancelledJob,
  jobOperation,
  jobOperationLabel,
  jobTypeBusinessLabel,
} = await vite.ssrLoadModule('/src/utils/jobBusiness.ts')
const t = key => key

test('business operation labels require an exact persisted auditOperation token', () => {
  assert.deepEqual(jobOperation(undefined), { state: 'absent' })
  assert.deepEqual(jobOperation({ auditOperation: 'TagGeneration' }), {
    state: 'known',
    token: 'TagGeneration',
    labelKey: 'job.workbench.operation.tagGeneration',
  })
  assert.deepEqual(jobOperation({ auditOperation: ' TagGeneration ' }), {
    state: 'unknown',
    token: ' TagGeneration ',
  })
  assert.equal(jobOperationLabel(jobOperation({ auditOperation: 'ChallengeProof' }), t), 'job.workbench.operation.challengeProof')
  assert.deepEqual(jobOperation({ auditOperation: 'FutureOperation' }), {
    state: 'unknown',
    token: 'FutureOperation',
  })
  assert.equal(jobOperationLabel(jobOperation({ auditOperation: 'FutureOperation' }), t), null)
})

test('generic Audit JobType never implies tag generation or challenge proof', () => {
  assert.equal(isCanonicalJobType('Audit'), true)
  assert.equal(isCanonicalJobType('Identity'), false)
  assert.equal(jobTypeBusinessLabel('Audit', t), 'job.typeAudit')
  assert.equal(jobTypeBusinessLabel('Identity', t), 'job.workbench.global.typePending')
  assert.equal(jobTypeBusinessLabel('Identity', t, true), 'Identity')
  assert.equal(jobOperationLabel(jobOperation({}), t), null)
})

test('business object projection reads only allowlisted metadata fields and keeps exact IDs', () => {
  assert.deepEqual(jobBusinessObjects({
    tableId: '0007',
    tableIds: ['8', 9],
    rowId: '0010',
    algorithmId: 'sm9-tag-v2',
    verifyType: 'Table',
    auditOperation: 'ChallengeProof',
    displayName: 'synthetic-name',
    algorithmSelectionSnapshot: { algorithmId: 'ignored' },
    empty: '',
  }, new Map([['sm9-tag-v2', 'SM9 Tagger']])), [
    { key: 'tableId', labelKey: 'job.workbench.object.table', value: '0007' },
    { key: 'tableIds', labelKey: 'job.workbench.object.tables', value: '8, 9' },
    { key: 'rowId', labelKey: 'job.workbench.object.row', value: '0010' },
    {
      key: 'algorithmId',
      labelKey: 'job.workbench.object.algorithm',
      value: 'SM9 Tagger (sm9-tag-v2)',
      valueSource: 'currentCatalog',
    },
    { key: 'verifyType', labelKey: 'job.workbench.object.scope', value: 'Table' },
  ])
  assert.deepEqual(jobBusinessObjects({ algorithmId: 'unlisted-id' }), [
    { key: 'algorithmId', labelKey: 'job.workbench.object.algorithm', value: 'unlisted-id' },
  ])
  assert.deepEqual(jobBusinessObjects({ tableId: 0 }), [
    { key: 'tableId', labelKey: 'job.workbench.object.table', value: '0' },
  ])
  assert.deepEqual(jobBusinessObjects({}), [])
})

test('Job error codes are translated when known and preserved verbatim when unknown', () => {
  assert.equal(jobErrorLabel(undefined, t), null)
  assert.equal(jobErrorLabel('None', t), null)
  assert.equal(jobErrorLabel('Cancelled', t), 'job.workbench.errorCode.Cancelled')
  assert.equal(jobErrorLabel('NewBackendCode', t), 'NewBackendCode')
})

test('zero or absent duration is missing data, not a progress or instant estimate', () => {
  for (const value of [undefined, null, 0, -1, Number.NaN]) assert.equal(formatJobDuration(value), '-')
  assert.equal(formatJobDuration(1250), '1250 ms')
})

test('verification outcome and execution status remain independent facts', () => {
  assert.equal(jobVerification({ verified: false }), false)
  assert.equal(jobVerification({ verified: 'false' }), false)
  assert.equal(jobVerification({ verified: true }), true)
  assert.equal(jobVerification({ verified: 'unknown' }), null)
  assert.equal(jobVerification({}), null)
  assert.equal(isCancelledJob({ errorCode: 'Cancelled' }), true)
  assert.equal(isCancelledJob({ errorCode: 'InternalError' }), false)
})
