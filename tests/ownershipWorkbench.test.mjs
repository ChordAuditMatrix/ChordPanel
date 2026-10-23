import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const mockRequestId = '\0ownership-workbench-test-request'
const requestMock = {
  name: 'ownership-workbench-test-request-mock',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:ownership-workbench-test-request') return mockRequestId
    if (id === './request') return mockRequestId
  },
  load(id) {
    if (id !== mockRequestId) return
    return `
const api = {
  get() { return Promise.resolve({}) },
  post() { return Promise.resolve({}) },
  delete() { return Promise.resolve({}) },
}
export default api
`
  },
}

const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  plugins: [requestMock],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const helpers = await vite.ssrLoadModule('/src/views/ownership/ownershipWorkbench.ts')
const ownershipApi = await vite.ssrLoadModule('/src/api/ownership.ts')
const t = key => key
const labels = facts => facts.map(fact => fact.labelKey)
const valueOf = (facts, labelKey) => facts.find(fact => fact.labelKey === labelKey)?.value

test('membership proof summary reads only documented response fields', () => {
  const facts = helpers.proofSummaryFacts({
    proofType: 'membership',
    ownerId: 'owner-1',
    tableId: '5',
    rowId: '0010',
    columnId: 2,
    allColumnIds: [0, 2, 3],
    layers: [{ level: 2, isRootLayer: false }, { level: 1, isRootLayer: true }],
    ridNodeHash: 'rid-hash',
    rootHash: 'root-hash',
    jobId: 'job-1',
  }, t)

  assert.equal(valueOf(facts, 'ownership.proofType'), 'ownership.membership')
  assert.equal(valueOf(facts, 'ownership.rowId'), '0010')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryColumns'), '3')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryTargetPresent'), 'common.yes')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryLayerCount'), '2')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryRootLayer'), 'common.yes')
  assert.equal(labels(facts).includes('ownership.workbench.proof.summaryMissingDimension'), false)
  // Hashes stay in the folded evidence layer, not in the readable summary.
  assert.equal(labels(facts).some(label => label.includes('summaryRootHash') || label.includes('summaryNodeHash')), false)
})

test('membership summary reports a target column that is absent from the leaf', () => {
  const facts = helpers.proofSummaryFacts({
    proofType: 'membership',
    columnId: 7,
    allColumnIds: [0, 2],
  }, t)

  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryTargetPresent'), 'common.no')
})

test('non-membership summary exposes the missing dimension, not column facts', () => {
  const facts = helpers.proofSummaryFacts({
    proofType: 'non-membership',
    ownerId: 'owner-1',
    tableId: '9',
    rowId: '',
    columnId: 4,
    missingDimension: 'Column',
    targetKeys: [4, 5],
    targetStringKeys: ['a'],
    targetChildHashes: [{ position: 0, hash: 'h0' }, { position: 1, hash: 'h1' }],
    targetIsOidRoot: false,
    targetNodeHash: 'target-hash',
    layers: [],
  }, t)

  assert.equal(valueOf(facts, 'ownership.proofType'), 'ownership.nonMembership')
  assert.equal(valueOf(facts, 'ownership.rowId'), '""')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryMissingDimension'), 'Column')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryNumericKeys'), '2')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryStringKeys'), '1')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryChildHashes'), '2')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryOidRoot'), 'common.no')
  assert.equal(valueOf(facts, 'ownership.workbench.proof.summaryLayerCount'), '0')
  assert.equal(labels(facts).includes('ownership.workbench.proof.summaryTargetPresent'), false)
  assert.equal(labels(facts).includes('ownership.workbench.proof.summaryRootLayer'), false)
})

test('verification verdict stays unknown unless the backend returned a boolean', () => {
  assert.equal(helpers.verificationVerdict({ valid: true }), 'valid')
  assert.equal(helpers.verificationVerdict({ valid: false }), 'invalid')
  assert.equal(helpers.verificationVerdict({ jobId: 'job-1' }), 'unknown')
  assert.equal(helpers.verificationVerdict(null), 'unknown')
  assert.equal(helpers.verificationVerdict({ valid: 'true' }), 'unknown')
})

test('proof input parsing keeps row ids exact and reports format problems separately', () => {
  const valid = helpers.parseProofInput('{"ownerId":"o1","rowId":"0010","tableId":5}')
  assert.equal(valid.ok, true)
  assert.equal(valid.value.rowId, '0010')

  const large = helpers.parseProofInput('{"tableId":123456789012345678901}')
  assert.equal(large.ok, true)
  assert.equal(helpers.exactJsonText(large.value).includes('123456789012345678901'), true)

  assert.deepEqual(helpers.parseProofInput('   '), {
    ok: false,
    reasonKey: 'ownership.workbench.verify.emptyInput',
  })
  assert.deepEqual(helpers.parseProofInput('{oops'), {
    ok: false,
    reasonKey: 'ownership.workbench.verify.invalidJson',
  })
  assert.deepEqual(helpers.parseProofInput('[]'), {
    ok: false,
    reasonKey: 'ownership.workbench.verify.notObject',
  })
  assert.deepEqual(helpers.parseProofInput('{"rowId":10}'), {
    ok: false,
    reasonKey: 'ownership.workbench.verify.rowIdNotString',
  })
  assert.equal(helpers.parseProofInput('{"layers":[{"rowId":0}]}').ok, false)
  assert.equal(helpers.parseProofInput('{"rowIdFrom":"0001"}').ok, true)
})

test('proof identity facts echo submitted values without coercion', () => {
  const facts = helpers.proofIdentityFacts({
    ownerId: 'o1',
    tableId: '5',
    rowId: '0001',
    columnId: 2,
    rootHash: 'root',
  })

  assert.equal(valueOf(facts, 'ownership.rowId'), '0001')
  assert.equal(valueOf(facts, 'ownership.columnId'), '2')
  assert.equal(labels(facts).includes('ownership.tableIdFrom'), false)
})

test('job metadata facts stay empty until the job returns metadata', () => {
  assert.deepEqual(helpers.jobMetadataFacts(null, t), [])
  assert.deepEqual(helpers.jobMetadataFacts({ status: 'Running' }, t), [])

  const facts = helpers.jobMetadataFacts({
    status: 'Succeeded',
    metadata: {
      cellsImported: '3',
      overwrite: 'false',
      _verificationResult: 'true',
      _rootHash: 'root',
      _allTableIds: '[1,2,3]',
      _rangeProof: '{"ownerId":"o1"}',
    },
  }, t)

  assert.equal(valueOf(facts, 'ownership.workbench.jobMeta.cellsImported'), '3')
  assert.equal(valueOf(facts, 'ownership.workbench.jobMeta.overwrite'), 'common.no')
  assert.equal(valueOf(facts, 'ownership.workbench.jobMeta.verdict'), 'ownership.workbench.verify.valid')
  assert.equal(valueOf(facts, 'ownership.workbench.jobMeta.rootHash'), 'root')
  assert.equal(valueOf(facts, 'ownership.workbench.jobMeta.tableCount'), '3')
  assert.equal(valueOf(facts, 'ownership.workbench.jobMeta.rangeProofReady'), 'common.yes')
})

test('job metadata facts ignore unknown members instead of inventing counts', () => {
  assert.deepEqual(helpers.jobMetadataFacts({ status: 'Succeeded', metadata: { ownerId: 'o1' } }, t), [])
})

test('ownership result navigation follows only the exact backend jobId', () => {
  const response = { ownerId: 'owner-1', jobId: 'job / 7' }
  const jobId = helpers.resultJobId(response)

  assert.equal(jobId, 'job / 7')
  assert.equal(helpers.ownershipJobPath(jobId), '/executions/job%20%2F%207')
  assert.equal(helpers.resultJobId({ metadata: { jobId: 'not-a-top-level-job' } }), null)
  assert.equal(helpers.resultJobId({ jobId: '' }), null)
})


test('cell mutation facts omit hashes the response did not return', () => {
  const facts = helpers.cellMutationFacts({ ownerId: 'o1', cellsAdded: 1 }, 'add')
  assert.deepEqual(labels(facts), [
    'ownership.mutation.owner',
    'ownership.workbench.mutation.submittedCells',
  ])
})

test('cell mutation facts use the echoed counters and both move hashes', () => {
  const addFacts = helpers.cellMutationFacts({ ownerId: 'o1', cellsAdded: 2, rootHash: 'r1', jobId: 'j' }, 'add')
  assert.deepEqual(labels(addFacts), [
    'ownership.mutation.owner',
    'ownership.workbench.mutation.submittedCells',
    'ownership.workbench.mutation.rootHash',
  ])
  assert.equal(valueOf(addFacts, 'ownership.workbench.mutation.submittedCells'), '2')

  const moveFacts = helpers.cellMutationFacts({
    sourceOwnerId: 'a',
    targetOwnerId: 'b',
    cellsMoved: 1,
    sourceRootHash: 'ra',
    targetRootHash: 'rb',
  }, 'move')
  assert.deepEqual(labels(moveFacts), [
    'ownership.workbench.mutation.sourceOwner',
    'ownership.workbench.mutation.targetOwner',
    'ownership.workbench.mutation.submittedCells',
    'ownership.workbench.mutation.sourceRootHash',
    'ownership.workbench.mutation.targetRootHash',
  ])
})

test('tree facts keep create and delete outcomes distinct', () => {
  const createFacts = helpers.treeFacts({ ownerId: 'o1', rootHash: 'root', rootNodeId: 'node' }, 'create', t)
  assert.deepEqual(labels(createFacts), [
    'ownership.mutation.owner',
    'ownership.workbench.mutation.rootHash',
    'ownership.workbench.mutation.rootNodeId',
  ])

  const deleteFacts = helpers.treeFacts({ ownerId: 'o1', deleted: false }, 'delete', t)
  assert.equal(valueOf(deleteFacts, 'ownership.workbench.mutation.deleted'), 'common.no')
  assert.equal(helpers.treeDeleteNotice({ deleted: false }), 'ownership.workbench.manage.deleteNoTree')
  assert.equal(helpers.treeDeleteNotice({ deleted: true }), null)
})

test('ownership path keeps exact row text and separates missing levels', () => {
  const complete = helpers.ownershipPathSegments({
    ownerId: 'o1',
    tableId: '5',
    tableName: 'orders',
    rowId: '0010',
    columnId: '3',
  }, t)

  assert.deepEqual(complete.map(segment => segment.value), ['o1', 'orders · 5', '0010', '3'])
  assert.equal(complete.every(segment => segment.missing === false), true)
  assert.equal(complete[1].raw, '5')
  assert.equal(complete[3].raw, '3')
  assert.equal(complete.every(segment => segment.copyable === true), true)
  assert.equal(
    helpers.ownershipPathText({ ownerId: ' o1 ', tableId: '5', rowId: '0010', columnId: '3' }),
    'ownerId=o1; tableId=5; rowId="0010"; columnId=3',
  )

  const allTables = helpers.ownershipPathSegments({ ownerId: 'o1' }, t)
  assert.equal(allTables[1].value, 'ownership.workbench.query.allTables')
  assert.equal(allTables[1].missing, false)
  assert.equal(allTables[1].copyable, false)
  assert.equal(allTables[2].missing, true)
  assert.equal(allTables[2].value, 'ownership.workbench.query.notSelected')
  assert.equal(helpers.ownershipPathText({ ownerId: 'o1' }), 'ownerId=o1')

  const pendingTable = helpers.ownershipPathSegments({ ownerId: 'o1', tableScope: true }, t)
  assert.equal(pendingTable[1].value, 'ownership.workbench.query.notSelected')
  assert.equal(pendingTable[1].missing, true)

  const emptyRow = helpers.ownershipPathSegments({ ownerId: 'o1', rowId: '' }, t)
  assert.equal(emptyRow[2].missing, false)
  assert.equal(emptyRow[2].value, '""')
  assert.equal(emptyRow[2].copyable, false)
  assert.equal(helpers.ownershipPathText({ ownerId: 'o1', rowId: '' }), 'ownerId=o1; rowId=""')

  const empty = helpers.ownershipPathSegments({ ownerId: '' }, t)
  assert.equal(empty[0].missing, true)
  assert.equal(empty[1].missing, true)
})

test('exact JSON text keeps LosslessNumber literals instead of object wrappers', async () => {
  const parsed = ownershipApi.parseOwnershipJson('{"tableId":123456789012345678901,"rowId":"0010"}')
  const text = helpers.exactJsonText(parsed)
  assert.equal(text.includes('123456789012345678901'), true)
  assert.equal(text.includes('isLosslessNumber'), false)
  assert.equal(text.includes('"0010"'), true)
})
