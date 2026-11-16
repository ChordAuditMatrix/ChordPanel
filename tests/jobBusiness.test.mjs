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
  formatJobTarget,
  isCanonicalJobType,
  jobBusinessObjects,
  jobErrorLabel,
  jobHasCryptographicVerification,
  jobVerification,
  isCancelledJob,
  jobOperation,
  jobOperationLabel,
  jobTypeBusinessLabel,
  JOB_OPERATION_OPTIONS,
} = await vite.ssrLoadModule('/src/utils/jobBusiness.ts')
const t = key => key

test('business operation labels require the exact typed jobOperation field', () => {
  assert.deepEqual(jobOperation(undefined), { state: 'absent' })
  assert.deepEqual(jobOperation({}), { state: 'absent' })
  assert.deepEqual(jobOperation({ metadata: { auditOperation: 'TagGeneration' } }), { state: 'absent' })
  assert.deepEqual(jobOperation({ jobOperation: 'TagGeneration' }), {
    state: 'known',
    token: 'TagGeneration',
    labelKey: 'job.workbench.operation.tagGeneration',
  })
  assert.deepEqual(jobOperation({ jobOperation: ' TagGeneration ' }), {
    state: 'unknown',
    token: ' TagGeneration ',
  })
  assert.equal(jobOperationLabel(jobOperation({ jobOperation: 'ChallengeProof' }), t), 'job.workbench.operation.challengeProof')
  assert.deepEqual(jobOperation({ jobOperation: 'FutureOperation' }), {
    state: 'unknown',
    token: 'FutureOperation',
  })
  assert.equal(jobOperationLabel(jobOperation({ jobOperation: 'FutureOperation' }), t), null)
  assert.equal(JOB_OPERATION_OPTIONS.some(option => option.token === 'Unspecified'), false)
  assert.equal(new Set(JOB_OPERATION_OPTIONS.map(option => option.token)).size, JOB_OPERATION_OPTIONS.length)
})
test('cryptographic verification is limited to typed Audit ChallengeProof and IdentityVerification Jobs', () => {
  const audit = jobOperation => ({ jobType: 'Audit', jobOperation, metadata: { verified: true } })
  assert.equal(jobHasCryptographicVerification(audit('ChallengeProof')), true)
  assert.equal(jobHasCryptographicVerification(audit('IdentityVerification')), true)
  assert.equal(jobHasCryptographicVerification({ ...audit('ChallengeProof'), jobType: 'Storage' }), false)
  assert.equal(jobHasCryptographicVerification(audit('TagGeneration')), false)
  assert.equal(jobHasCryptographicVerification(audit('Regeneration')), false)
  assert.equal(jobHasCryptographicVerification({ jobType: 'Audit', metadata: { verified: true } }), false)
  assert.equal(jobHasCryptographicVerification({ jobType: 'Audit', metadata: { auditOperation: 'ChallengeProof' } }), false)
})
test('Job targets keep their persisted kind and ids without guessing missing ids', () => {
  assert.equal(formatJobTarget(undefined, t), null)
  assert.equal(formatJobTarget({ kind: 'System' }, t), 'job.workbench.target.system')
  assert.equal(formatJobTarget({ kind: 'Owner', ownerId: 'owner-1' }, t), 'job.workbench.target.owner: owner-1')
  assert.equal(formatJobTarget({ kind: 'Algorithm', algorithmId: 'sm9' }, t), 'job.workbench.target.algorithm: sm9')
  assert.equal(
    formatJobTarget({ kind: 'OwnerAlgorithm', ownerId: 'owner-1', algorithmId: 'sm9' }, t),
    'job.workbench.target.ownerAlgorithm: owner-1 / sm9',
  )
  assert.equal(formatJobTarget({ kind: 'FutureTarget', ownerId: 'owner-1' }, t), 'FutureTarget: owner-1')
})

test('generic Audit JobType never implies tag generation or challenge proof', () => {
  assert.equal(isCanonicalJobType('Audit'), true)
  assert.equal(isCanonicalJobType('System'), true)
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
  assert.deepEqual(jobBusinessObjects({ auditTableOperation: 'bootstrap' }), [])
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
