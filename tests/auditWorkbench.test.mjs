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
  mergeTaggedRanges,
  metadataText,
  normalizeSelectionMode,
  normalizeTaggedRanges,
  resolveJobAlgorithmId,
  resolveRangeAlgorithmId,
  samplingNumbers,
} = await vite.ssrLoadModule('/src/views/audit/auditWorkbench.ts')
const { BLOCK_GRID_PAGE_SIZE, projectBlockGridPage } =
  await vite.ssrLoadModule('/src/components/blockGridModel.ts')

test('tagged-ranges response validates all block intervals and keeps the resolved algorithm', () => {
  assert.deepEqual(normalizeTaggedRanges({
    algorithmId: '  audit-algorithm  ',
    ranges: [{ blockStart: 12, blockCount: 4 }, { blockStart: 0, blockCount: 3 }],
  }), {
    algorithmId: 'audit-algorithm',
    ranges: [{ blockStart: 12, blockCount: 4 }, { blockStart: 0, blockCount: 3 }],
  })
  assert.deepEqual(normalizeTaggedRanges({ algorithmId: '', ranges: [] }), { algorithmId: null, ranges: [] })
  for (const invalid of [
    null,
    [],
    {},
    { ranges: {} },
    { ranges: [null] },
    { ranges: [{ blockStart: -1, blockCount: 1 }] },
    { ranges: [{ blockStart: 0, blockCount: -1 }] },
    { ranges: [{ blockStart: 0.5, blockCount: 1 }] },
    { ranges: [{ blockStart: Number.MAX_SAFE_INTEGER, blockCount: 1 }] },
  ]) {
    assert.equal(normalizeTaggedRanges(invalid), null)
  }
})

test('tagged-range union merges unsorted overlaps and adjacency without double-counting', () => {
  assert.deepEqual(mergeTaggedRanges([
    { blockStart: 7, blockCount: 4 },
    { blockStart: 0, blockCount: 4 },
    { blockStart: 3, blockCount: 4 },
    { blockStart: 20, blockCount: 0 },
  ]), {
    ranges: [{ blockStart: 0, blockCount: 11 }],
    coveredBlocks: '11',
  })
  assert.deepEqual(mergeTaggedRanges([]), { ranges: [], coveredBlocks: '0' })
})
test('block grid bounds rendered cells while preserving total tagged counts across pages', () => {
  const taggedRanges = mergeTaggedRanges([
    { blockStart: 125, blockCount: 30 },
    { blockStart: 0, blockCount: 5 },
    { blockStart: 100, blockCount: 30 },
    { blockStart: 400, blockCount: 10 },
  ]).ranges
  const first = projectBlockGridPage({
    totalBlocks: 1_000_000,
    rangeStart: 100,
    rangeCount: 500,
    page: 1,
    taggedRanges,
  })
  assert.equal(BLOCK_GRID_PAGE_SIZE, 240)
  assert.equal(first.pageCount, 3)
  assert.equal(first.page, 1)
  assert.equal(first.pageStart, 100)
  assert.equal(first.pageEndExclusive, 340)
  assert.equal(first.cells.length, 240)
  assert.equal(first.taggedCount, 65)
  assert.equal(first.cells[0].tagged, true)
  assert.equal(first.cells[239].tagged, false)

  const second = projectBlockGridPage({
    totalBlocks: 1_000_000,
    rangeStart: 100,
    rangeCount: 500,
    page: 2,
    taggedRanges,
  })
  assert.equal(second.pageStart, 340)
  assert.equal(second.cells[60].index, 400)
  assert.equal(second.cells[60].tagged, true)

  const last = projectBlockGridPage({
    totalBlocks: 1_000_000,
    rangeStart: 100,
    rangeCount: 500,
    page: 3,
    taggedRanges,
  })
  assert.equal(last.pageStart, 580)
  assert.equal(last.pageEndExclusive, 600)
  assert.equal(last.cells.length, 20)
})

test('block grid clamps a page and the selected range to the layout bounds', () => {
  const projection = projectBlockGridPage({
    totalBlocks: 10,
    rangeStart: 8,
    rangeCount: 20,
    page: 99,
    taggedRanges: [{ blockStart: 9, blockCount: 10 }],
  })
  assert.equal(projection.rangeStart, 8)
  assert.equal(projection.rangeCount, 2)
  assert.equal(projection.pageCount, 1)
  assert.equal(projection.page, 1)
  assert.equal(projection.pageStart, 8)
  assert.equal(projection.pageEndExclusive, 10)
  assert.equal(projection.taggedCount, 1)
  assert.deepEqual(projection.cells, [
    { index: 8, tagged: false },
    { index: 9, tagged: true },
  ])
})

test('selection mode and historical algorithm IDs come only from request/Job snapshots', () => {
  assert.equal(normalizeSelectionMode('Automatic'), 'automatic')
  assert.equal(normalizeSelectionMode('explicit'), 'explicit')
  assert.equal(normalizeSelectionMode('backend-default'), null)
  assert.equal(metadataText({ storageNodeId: ' Storage-7 ' }, 'storageNodeId'), 'Storage-7')
  assert.equal(metadataText({ storageNodeId: '' }, 'storageNodeId'), null)
  assert.equal(resolveJobAlgorithmId('creation-snapshot-id', { algorithmId: 'job-snapshot-id' }), 'job-snapshot-id')
  assert.equal(resolveJobAlgorithmId('creation-snapshot-id', {}), 'creation-snapshot-id')
  assert.equal(resolveJobAlgorithmId('', {}), null)
})

test('range query prefers explicit selection and otherwise reuses only the same-owner generation snapshot', () => {
  const base = { selectedAlgorithmId: '', generatedAlgorithmId: 'generated-id', generatedOwnerId: 'owner-a', ownerId: 'owner-a' }
  assert.equal(resolveRangeAlgorithmId(base), 'generated-id')
  assert.equal(resolveRangeAlgorithmId({ ...base, ownerId: 'owner-b' }), undefined)
  assert.equal(resolveRangeAlgorithmId({ ...base, selectedAlgorithmId: 'manual-id', ownerId: 'owner-b' }), 'manual-id')
})

test('challenge probability uses only persisted sampling metadata and keeps uncomputable values unavailable', () => {
  const ready = samplingNumbers({
    targetConfidence: '0.99',
    assumedCorruptionRatio: '0.25',
    assumedCorruptedBlockCount: '1',
    blockCount: '4',
    challengeCount: '1',
  })
  assert.equal(ready.metadataError, null)
  assert.equal(ready.snapshot.targetConfidence, 0.99)
  assert.equal(ready.snapshot.assumedCorruptionRatio, 0.25)
  assert.ok(Math.abs(ready.probability - 0.25) < Number.EPSILON)
  assert.deepEqual(samplingNumbers(null), {
    snapshot: null,
    metadataError: 'noMetadata',
    probability: null,
    probabilityError: null,
  })
  const unsafe = samplingNumbers({
    targetConfidence: '0.99',
    assumedCorruptionRatio: '0.01',
    assumedCorruptedBlockCount: '1',
    blockCount: '9007199254740992',
    challengeCount: '1',
  })
  assert.equal(unsafe.snapshot !== null, true)
  assert.equal(unsafe.probability, null)
  assert.equal(unsafe.probabilityError, 'unsafeForClientComputation')
})
