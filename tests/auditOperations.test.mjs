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

const helpers = await vite.ssrLoadModule('/src/views/audit/auditOperations.ts')
const t = key => key

test('source-change tuples: empty input means a whole-file rebuild', () => {
  assert.deepEqual(helpers.parseSourceChangeTuples('  '), {
    ok: true,
    tuples: undefined,
    wholeFile: true,
    payloadBytes: 0,
  })
  assert.deepEqual(helpers.parseSourceChangeTuples('[]'), {
    ok: true,
    tuples: undefined,
    wholeFile: true,
    payloadBytes: 0,
  })
})

test('source-change tuples keep an exact table id and reject server-owned fields', () => {
  const parsed = helpers.parseSourceChangeTuples('[{"tableId":"9223372036854775807","rowId":"0010","columnId":3}]')
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.tuples, [{ tableId: '9223372036854775807', rowId: '0010', columnId: 3 }])

  const forbidden = helpers.parseSourceChangeTuples('[{"tableId":1,"rowId":"r","columnId":0,"dataLength":9}]')
  assert.equal(forbidden.ok, false)
  assert.equal(forbidden.errorKey, 'audit.workbench.sourceChange.errors.forbiddenField')

  const tooLarge = helpers.parseSourceChangeTuples('[{"tableId":"9223372036854775808","rowId":"r","columnId":0}]')
  assert.equal(tooLarge.ok, false)
  assert.equal(tooLarge.errorKey, 'audit.workbench.sourceChange.errors.tableId')

  const unsafeNumber = helpers.parseSourceChangeTuples('[{"tableId":9007199254740993,"rowId":"r","columnId":0}]')
  assert.equal(unsafeNumber.ok, false)
})

test('source-change identity follows the documented byte budgets', () => {
  assert.equal(helpers.sourceChangeIdentityError('', 'n'), 'audit.workbench.sourceChange.errors.ownerRequired')
  assert.equal(helpers.sourceChangeIdentityError('o', ''), 'audit.workbench.sourceChange.errors.notificationIdRequired')
  assert.equal(helpers.sourceChangeIdentityError('o', 'n'), null)
  assert.equal(
    helpers.sourceChangeIdentityError('o', 'x'.repeat(513)),
    'audit.workbench.sourceChange.errors.notificationIdTooLong',
  )
})

test('block indices are 1-based, bounded and safe integers', () => {
  assert.deepEqual(helpers.parseBlockIndices('1, 3 5'), { ok: true, blockIndices: [1, 3, 5] })
  for (const invalid of ['', '0', '-1', '1.5', 'abc', '1,']) {
    const parsed = helpers.parseBlockIndices(invalid)
    assert.equal(parsed.ok, false, invalid)
  }
  const tooLong = helpers.parseBlockIndices(Array.from({ length: 4097 }, (_, index) => String(index + 1)).join(','))
  assert.equal(tooLong.ok, false)
  assert.equal(tooLong.errorKey, 'audit.workbench.maintenance.errors.indicesTooMany')
})

test('canonical ranges-v1 text is accepted only when ascending and merged', () => {
  assert.deepEqual(helpers.parseBlockRanges('ranges-v1:1+10,15+5'), {
    ok: true,
    blockRanges: 'ranges-v1:1+10,15+5',
  })
  assert.equal(helpers.parseBlockRanges('ranges-v1:1+10,11+5').errorKey,
    'audit.workbench.maintenance.errors.rangesUnmerged')
  assert.equal(helpers.parseBlockRanges('ranges-v1:1+10,5+2').errorKey,
    'audit.workbench.maintenance.errors.rangesOverlap')
  assert.equal(helpers.parseBlockRanges('1+10').errorKey,
    'audit.workbench.maintenance.errors.rangesPrefix')
  assert.equal(helpers.parseBlockRanges('ranges-v1:1').errorKey,
    'audit.workbench.maintenance.errors.rangesMalformed')
  assert.equal(helpers.parseBlockRanges('ranges-v1:0+1').errorKey,
    'audit.workbench.maintenance.errors.rangesMalformed')
})

test('pass and re-arm facts report only documented fields', () => {
  const passFacts = helpers.materialGcPassFacts({
    versionsExamined: 3,
    versionsRetired: 1,
    moreWorkPending: true,
    nextLifecycleCursor: 'cursor-1',
    reports: [],
    ignored: 'not shown',
  }, t)
  assert.deepEqual(passFacts.map(fact => fact.labelKey), [
    'audit.workbench.materialGc.facts.versionsExamined',
    'audit.workbench.materialGc.facts.versionsRetired',
    'audit.workbench.materialGc.facts.moreWorkPending',
    'audit.workbench.materialGc.facts.nextLifecycleCursor',
  ])

  const rearmFacts = helpers.materialGcRearmFacts({
    outcome: 'Created',
    jobId: 'job-1',
    anchorJobId: 'anchor-1',
    detail: '',
  }, t)
  assert.equal(rearmFacts.find(fact => fact.labelKey === 'audit.workbench.operations.facts.jobId')?.value, 'job-1')
  assert.equal(rearmFacts.find(fact => fact.labelKey === 'audit.workbench.operations.facts.outcome')?.value,
    'audit.workbench.materialGc.rearmOutcomes.created')
})
