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
  readUserDetail,
  readUserBindingPage,
  readUserJobPage,
  compareSearchCoverage,
} = await vite.ssrLoadModule('/src/views/user/userDetail.ts')


test('readUserDetail accepts the documented identity envelope', () => {
  assert.deepEqual(readUserDetail({
    userId: 'usr_1', userName: 'alice', createdAtMs: 10, updatedAtMs: 20,
  }), { userId: 'usr_1', userName: 'alice', createdAtMs: 10, updatedAtMs: 20 })
})

test('readUserDetail rejects incomplete identity payloads', () => {
  assert.equal(readUserDetail(null), null)
  assert.equal(readUserDetail({ userName: 'alice', createdAtMs: 1, updatedAtMs: 2 }), null)
  assert.equal(readUserDetail({ userId: '', userName: 'alice', createdAtMs: 1, updatedAtMs: 2 }), null)
  assert.equal(readUserDetail({ userId: 'u1', userName: 'alice', createdAtMs: '1', updatedAtMs: 2 }), null)
  assert.equal(readUserDetail({ userId: 'u1', userName: 'alice', createdAtMs: 1 }), null)
})


test('readUserBindingPage keeps exact user matches and deduplicates algorithm instances', () => {
  const page = readUserBindingPage({
    total: 3,
    totalPages: 2,
    items: [
      { userId: 'user-1', algorithmId: 'algo-1', algorithmVersion: 4, purpose: 'IdentityAuthentication' },
      { userId: 'another-user', algorithmId: 'algo-2', algorithmVersion: 2, purpose: 'Audit' },
      { userId: 'user-1', algorithmId: 'algo-1', algorithmVersion: 4, purpose: 'IdentityAuthentication' },
      { userId: 'user-1', algorithmId: 'algo-3', algorithmVersion: 1 },
    ],
  }, 'user-1')

  assert.deepEqual(page, {
    items: [{
      userId: 'user-1',
      algorithmId: 'algo-1',
      algorithmVersion: 4,
      purpose: 'IdentityAuthentication',
    }],
    total: 3,
    totalPages: 2,
  })
})
test('readUserBindingPage derives continuation pages when totalPages is missing', () => {
  const page = readUserBindingPage({
    total: 201,
    items: [{ userId: 'user-1', algorithmId: 'algo-1', algorithmVersion: 1, purpose: 'Audit' }],
  }, 'user-1')

  assert.equal(page.totalPages, 3)
})


test('readUserBindingPage rejects an unusable page envelope', () => {
  assert.equal(readUserBindingPage(null, 'user-1'), null)
  assert.equal(readUserBindingPage({ items: [] }, 'user-1'), null)
  assert.equal(readUserBindingPage({ total: 0, items: 'invalid' }, 'user-1'), null)
})

test('readUserJobPage keeps only rows with the required job fields', () => {
  const page = readUserJobPage({
    total: 7,
    items: [
      { jobId: 'job-1', jobType: 'Audit', status: 'Succeeded', createdAtMs: 1 },
      { jobId: 'job-2', jobType: 'Audit', status: 'Running' },
      null,
      { jobId: 'job-3', status: 'Failed', createdAtMs: 2 },
    ],
  })
  assert.equal(page.total, 7)
  assert.deepEqual(page.items.map(item => item.jobId), ['job-1'])
})

test('readUserJobPage rejects responses without an items array', () => {
  assert.equal(readUserJobPage(null), null)
  assert.equal(readUserJobPage({ total: 3 }), null)
  assert.deepEqual(readUserJobPage({ items: [] }), { items: [], total: 0 })
})

test('compareSearchCoverage distinguishes complete, partial and unknown catalogs', () => {
  assert.equal(compareSearchCoverage(12, 12), 'complete')
  assert.equal(compareSearchCoverage(13, 12), 'complete')
  assert.equal(compareSearchCoverage(4, 12), 'partial')
  assert.equal(compareSearchCoverage(0, 0), 'complete')
  assert.equal(compareSearchCoverage(4, null), 'unknown')
  assert.equal(compareSearchCoverage(4, Number.NaN), 'unknown')
  assert.equal(compareSearchCoverage(4, -1), 'unknown')
})
