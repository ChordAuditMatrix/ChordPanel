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
  aggregateNodeDirectory,
  classifyNodeAvailability,
  collectNodeJobLinks,
  collectNodeStates,
  filterNodeDirectory,
  nodeJobNavigationRoutes,
  nodeOperationGuard,
  nodeRoleGroupKey,
  nodeStateKey,
  paginateNodeDirectory,
  parseNodeSummaryPage,
  sortNodeDirectory,
} = await vite.ssrLoadModule('/src/components/node/nodeWorkbenchModel.ts')

function node(nodeId, role, isAvailable, state, nodeInstanceId) {
  return { nodeId, role, isAvailable, state, nodeInstanceId }
}

test('job links require a jobId and count the detail tasks that prove them', () => {
  assert.deepEqual(collectNodeJobLinks(undefined), [])
  assert.deepEqual(collectNodeJobLinks([]), [])
  assert.deepEqual(collectNodeJobLinks([{ jobId: '' }, {}]), [])
  assert.deepEqual(
    collectNodeJobLinks([
      { jobId: 'job-a' },
      { jobId: 'job-b' },
      { jobId: 'job-a' },
      { jobId: '' },
    ]),
    [{ jobId: 'job-a', taskCount: 2 }, { jobId: 'job-b', taskCount: 1 }],
  )
})

test('node Job navigation carries the explicit linked Job ID to each destination', () => {
  const jobId = '6e445de9-26f7-460a-b22d-b937e12d5f81'
  assert.deepEqual(nodeJobNavigationRoutes(jobId), {
    job: { name: 'jobs', query: { jobId } },
    execution: { name: 'executionDetail', params: { jobId } },
  })
})

test('node list pages reject malformed rows instead of silently dropping them', () => {
  const parsed = parseNodeSummaryPage({
    items: [{ nodeId: 'node-1', role: 'Admin' }],
    total: 1,
    page: 1,
    pageSize: 1000,
    totalPages: 1,
  })
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.total, 1)

  assert.throws(() => parseNodeSummaryPage({ items: [{ nodeId: 'node-1' }, { role: 'Admin' }] }), TypeError)
  assert.throws(() => parseNodeSummaryPage({ items: 'not-a-list' }), TypeError)
  assert.throws(() => parseNodeSummaryPage(null), TypeError)

  const defaults = parseNodeSummaryPage({ items: [{ nodeId: 'node-2' }] })
  assert.deepEqual(
    { total: defaults.total, page: defaults.page, pageSize: defaults.pageSize, totalPages: defaults.totalPages },
    { total: 1, page: 1, pageSize: 1000, totalPages: 0 },
  )
})

test('availability keeps offline verdicts apart from missing data', () => {
  assert.equal(classifyNodeAvailability({ isAvailable: true }), 'available')
  assert.equal(classifyNodeAvailability({ isAvailable: false }), 'offline')
  assert.equal(classifyNodeAvailability({ isAvailable: undefined }), 'unknown')
  assert.equal(classifyNodeAvailability({}), 'unknown')
  assert.equal(classifyNodeAvailability(null), 'unknown')
})

test('role grouping only accepts the documented role names', () => {
  assert.equal(nodeRoleGroupKey('Admin'), 'Admin')
  assert.equal(nodeRoleGroupKey('Audit'), 'Audit')
  assert.equal(nodeRoleGroupKey('Storage'), 'Storage')
  assert.equal(nodeRoleGroupKey('admin'), 'other')
  assert.equal(nodeRoleGroupKey('Peer'), 'other')
  assert.equal(nodeRoleGroupKey(undefined), 'other')
})

test('directory aggregation counts roles and availability without inventing rows', () => {
  const aggregate = aggregateNodeDirectory([
    node('admin-1', 'Admin', true, 'Idle'),
    node('admin-2', 'Admin', undefined, 'BusyAccepting'),
    node('audit-1', 'Audit', false, 'Unavailable'),
    node('storage-1', 'Storage', true, 'BusyDraining'),
    node('peer-1', 'Peer', undefined, 'Custom'),
  ])

  assert.equal(aggregate.total, 5)
  assert.equal(aggregate.available, 2)
  assert.equal(aggregate.offline, 1)
  assert.equal(aggregate.unknown, 2)
  assert.equal(aggregate.draining, 1)

  const byRole = Object.fromEntries(aggregate.roles.map(role => [role.key, role]))
  assert.deepEqual(
    { total: byRole.Admin.total, available: byRole.Admin.available, unknown: byRole.Admin.unknown },
    { total: 2, available: 1, unknown: 1 },
  )
  assert.deepEqual(
    { total: byRole.Audit.total, offline: byRole.Audit.offline },
    { total: 1, offline: 1 },
  )
  assert.deepEqual(
    { total: byRole.Storage.total, available: byRole.Storage.available },
    { total: 1, available: 1 },
  )
  assert.deepEqual(
    { total: byRole.other.total, unknown: byRole.other.unknown },
    { total: 1, unknown: 1 },
  )
  assert.deepEqual(aggregate.roles.map(role => role.key), ['Admin', 'Audit', 'Storage', 'other'])
})

test('filters combine role, availability, state and identity search', () => {
  const nodes = [
    node('admin-1', 'Admin', true, 'Idle', 'inst-A'),
    node('admin-2', 'Admin', false, 'Unavailable', 'inst-B'),
    node('audit-1', 'Audit', undefined, 'Idle', 'inst-C'),
    node('peer-1', 'Peer', true, 'BusyDraining', 'inst-D'),
  ]
  const ids = list => list.map(item => item.nodeId)

  assert.deepEqual(ids(filterNodeDirectory(nodes, { role: 'Admin' })), ['admin-1', 'admin-2'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { role: 'other' })), ['peer-1'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { availability: 'unknown' })), ['audit-1'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { availability: 'offline' })), ['admin-2'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { state: 'Idle' })), ['admin-1', 'audit-1'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { query: 'inst-c' })), ['audit-1'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { query: 'ADMIN-2' })), ['admin-2'])
  assert.deepEqual(ids(filterNodeDirectory(nodes, { query: '   ' })), ['admin-1', 'admin-2', 'audit-1', 'peer-1'])
  assert.deepEqual(
    ids(filterNodeDirectory(nodes, { role: 'Admin', availability: 'available', query: 'inst' })),
    ['admin-1'],
  )
})

test('sorting is stable by documented role order then identity', () => {
  const sorted = sortNodeDirectory([
    node('storage-2', 'Storage', true, 'Idle'),
    node('peer-9', 'Peer', true, 'Idle'),
    node('audit-2', 'Audit', true, 'Idle'),
    node('admin-b', 'Admin', true, 'Idle'),
    node('storage-1', 'Storage', true, 'Idle'),
    node('admin-a', 'Admin', true, 'Idle'),
    node('admin-a', 'Admin', true, 'Idle', 'instance-2'),
  ])

  assert.deepEqual(sorted.map(item => `${item.nodeId}:${item.nodeInstanceId ?? ''}`), [
    'admin-a:',
    'admin-a:instance-2',
    'admin-b:',
    'audit-2:',
    'storage-1:',
    'storage-2:',
    'peer-9:',
  ])
})

test('pagination clamps the requested page and keeps empty directories on page 1', () => {
  const nodes = [1, 2, 3, 4, 5].map(index => node(`node-${index}`, 'Admin', true, 'Idle'))

  const secondPage = paginateNodeDirectory(nodes, 2, 2)
  assert.deepEqual(secondPage.items.map(item => item.nodeId), ['node-3', 'node-4'])
  assert.equal(secondPage.page, 2)
  assert.equal(secondPage.pageCount, 3)

  const clamped = paginateNodeDirectory(nodes, 99, 2)
  assert.equal(clamped.page, 3)
  assert.deepEqual(clamped.items.map(item => item.nodeId), ['node-5'])

  const invalid = paginateNodeDirectory(nodes, 0, 0)
  assert.equal(invalid.page, 1)
  assert.equal(invalid.pageSize, 20)
  assert.equal(invalid.items.length, 5)

  const empty = paginateNodeDirectory([], 4, 10)
  assert.equal(empty.page, 1)
  assert.equal(empty.pageCount, 1)
  assert.deepEqual(empty.items, [])
})

test('state options keep documented states first and include unknown values', () => {
  const states = collectNodeStates([
    node('n1', 'Admin', true, 'Zeta'),
    node('n2', 'Admin', true, 'BusyDraining'),
    node('n3', 'Admin', true, 'Idle'),
    node('n4', 'Admin', true, 'Idle'),
    node('n5', 'Admin', true, 'Custom'),
    node('n6', 'Admin', true, ''),
    node('n7', 'Admin', true, undefined),
  ])

  assert.deepEqual(states, ['Idle', 'BusyDraining', 'Custom', 'Zeta'])
  assert.equal(nodeStateKey('Idle'), 'node.workbench.state.idle')
  assert.equal(nodeStateKey('BusyDraining'), 'node.workbench.state.busyDraining')
  assert.equal(nodeStateKey('NotADocumentedState'), null)
  assert.equal(nodeStateKey(undefined), null)
})

test('drain and resume keep the documented runtime guard', () => {
  assert.deepEqual(nodeOperationGuard({ runtimeState: { state: 'BusyDraining' } }), {
    canDrain: false,
    canResume: true,
    stateUnknown: false,
  })
  assert.deepEqual(nodeOperationGuard({ runtimeState: { state: 'Idle' } }), {
    canDrain: true,
    canResume: false,
    stateUnknown: false,
  })
  assert.deepEqual(nodeOperationGuard({ runtimeState: { state: 'Unavailable' } }), {
    canDrain: true,
    canResume: false,
    stateUnknown: false,
  })
  assert.deepEqual(nodeOperationGuard({}), {
    canDrain: true,
    canResume: false,
    stateUnknown: true,
  })
  assert.deepEqual(nodeOperationGuard(null), {
    canDrain: true,
    canResume: false,
    stateUnknown: true,
  })
})
