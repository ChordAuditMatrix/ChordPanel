import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { compileScript, parse } from 'vue/compiler-sfc'
import { createRenderer, nextTick } from 'vue'
import { createProjectVite } from './shared/viteHarness.mjs'

const root = process.cwd()
const uiVirtualId = 'virtual:operation-result-surface-naive-ui'
const i18nVirtualId = 'virtual:operation-result-surface-i18n'
const jobTrackingVirtualId = 'virtual:operation-result-surface-job-tracking'
const catalogVirtualId = 'virtual:operation-result-surface-catalog'
const ownershipApiVirtualId = 'virtual:operation-result-surface-ownership-api'
const routerVirtualId = 'virtual:operation-result-surface-router'
const uiMockId = '\0operation-result-surface-naive-ui'
const i18nMockId = '\0operation-result-surface-i18n'
const jobTrackingMockId = '\0operation-result-surface-job-tracking'
const catalogMockId = '\0operation-result-surface-catalog'
const ownershipApiMockId = '\0operation-result-surface-ownership-api'
const routerMockId = '\0operation-result-surface-router'
const auditJobLinkMockId = '\0operation-result-surface-audit-job-link'
const ownershipJobLinkMockId = '\0operation-result-surface-ownership-job-link'

const moduleMocks = new Map([
  [uiVirtualId, uiMockId],
  [i18nVirtualId, i18nMockId],
  [jobTrackingVirtualId, jobTrackingMockId],
  [catalogVirtualId, catalogMockId],
  [ownershipApiVirtualId, ownershipApiMockId],
  [routerVirtualId, routerMockId],
  ['naive-ui', uiMockId],
  ['@/stores/i18n', i18nMockId],
  [resolve(root, 'src/stores/i18n.ts'), i18nMockId],
  ['@/stores/jobTracking', jobTrackingMockId],
  [resolve(root, 'src/stores/jobTracking.ts'), jobTrackingMockId],
  ['@/stores/referenceCatalog', catalogMockId],
  [resolve(root, 'src/stores/referenceCatalog.ts'), catalogMockId],
  ['@/api/ownership', ownershipApiMockId],
  [resolve(root, 'src/api/ownership.ts'), ownershipApiMockId],
  ['vue-router', routerMockId],
])

const componentMocks = new Map([
  ['./AuditJobLink.vue', auditJobLinkMockId],
  [resolve(root, 'src/views/audit/AuditJobLink.vue'), auditJobLinkMockId],
  ['./OwnershipJobLink.vue', ownershipJobLinkMockId],
  [resolve(root, 'src/views/ownership/OwnershipJobLink.vue'), ownershipJobLinkMockId],
])

// `ssrLoadModule` makes @vitejs/plugin-vue emit SSR render functions that call
// `useSSRContext()`. Mounting those with a client-style renderer fails on the
// missing SSR module map, so these SFCs are compiled as client components.
const clientSfcIds = new Set([
  resolve(root, 'src/components/OperationResultSurface.vue'),
  resolve(root, 'src/views/audit/AuditOperationResult.vue'),
  resolve(root, 'src/views/ownership/OwnershipResultPanel.vue'),
])

const mockPlugin = {
  name: 'operation-result-surface-mocks',
  enforce: 'pre',
  resolveId(id) {
    const requested = id.split('?')[0]
    const normalized = requested.replace(/^\/@fs\//, '/')
    const absolute = normalized.startsWith('/src/') ? resolve(root, normalized.slice(1)) : normalized
    const aliased = normalized.startsWith('@/') ? resolve(root, 'src', normalized.slice(2)) : normalized
    const moduleId = moduleMocks.get(requested)
      ?? moduleMocks.get(normalized)
      ?? moduleMocks.get(absolute)
    if (moduleId) return moduleId
    if (clientSfcIds.has(absolute)) return `${absolute}.client-test.ts`
    if (clientSfcIds.has(aliased)) return `${aliased}.client-test.ts`
    return componentMocks.get(requested)
      ?? componentMocks.get(normalized)
      ?? componentMocks.get(absolute)
      ?? componentMocks.get(aliased)
  },
  load(id) {
    if (id.endsWith('.vue.client-test.ts')) {
      const filename = id.slice(0, -'.client-test.ts'.length)
      const source = readFileSync(filename, 'utf8')
      const { descriptor, errors } = parse(source, { filename })
      if (errors.length) throw errors[0]
      return compileScript(descriptor, { id: filename, inlineTemplate: true }).content
    }
    if (id === uiMockId) {
      return `
import { defineComponent, h } from 'vue'
const control = name => defineComponent({
  name,
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h(name, attrs, slots.default?.())
  },
})
export const NAlert = control('NAlert')
export const NButton = control('NButton')
export const NCollapse = control('NCollapse')
export const NIcon = control('NIcon')
export const NTag = control('NTag')
export const NCollapseItem = defineComponent({
  name: 'NCollapseItem',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('NCollapseItem', attrs, [slots.header?.(), slots.default?.()])
  },
})
`
    }
    if (id === i18nMockId) return `export const useI18n = () => ({ t: key => key })`
    if (id === ownershipApiMockId) return `export const parseOwnershipJson = text => JSON.parse(text)`
    if (id === jobTrackingMockId) return `export const useJobTracking = () => ({ snapshots: {} })`
    if (id === catalogMockId) {
      return `
import { ref } from 'vue'
const usersById = ref(new Map([['owner-1', 'Alice']]))
export const useReferenceCatalog = () => ({ usersById, ensureUsersLoaded: async () => {} })
`
    }
    if (id === routerMockId) {
      return `
import { defineComponent, h } from 'vue'
export const RouterLink = defineComponent({
  name: 'RouterLink',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots }) {
    return () => h('RouterLink', { to: props.to }, slots.default?.())
  },
})
`
    }
    if (id === auditJobLinkMockId || id === ownershipJobLinkMockId) {
      const name = id === auditJobLinkMockId ? 'AuditJobLink' : 'OwnershipJobLink'
      return `
import { defineComponent, h } from 'vue'
export default defineComponent({
  name: '${name}',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h('${name}', attrs)
  },
})
`
    }
  },
}

// SSR externalizes bare node_modules imports before plugin resolution, so the
// mocked modules must be aliased as well (same pattern as ownershipConsumers).
const vite = await createProjectVite({
  plugins: [mockPlugin],
  alias: [
    { find: 'naive-ui', replacement: uiVirtualId },
    { find: 'vue-router', replacement: routerVirtualId },
    { find: '@/stores/i18n', replacement: i18nVirtualId },
    { find: '@/stores/jobTracking', replacement: jobTrackingVirtualId },
    { find: '@/stores/referenceCatalog', replacement: catalogVirtualId },
    { find: '@/api/ownership', replacement: ownershipApiVirtualId },
  ],
})

after(async () => { await vite.close() })

const Surface = (await vite.ssrLoadModule('/src/components/OperationResultSurface.vue')).default
const AuditResult = (await vite.ssrLoadModule('/src/views/audit/AuditOperationResult.vue')).default
const OwnershipResult = (await vite.ssrLoadModule('/src/views/ownership/OwnershipResultPanel.vue')).default

const renderer = createRenderer({
  createElement: type => ({ type, props: {}, children: [], parent: null }),
  createText: text => ({ type: '#text', text, parent: null }),
  createComment: text => ({ type: '#comment', text, parent: null }),
  insertStaticContent(content, parent, anchor) {
    const node = { type: '#static', text: content, props: {}, children: [], parent: null }
    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1
    if (anchorIndex === -1) parent.children.push(node)
    else parent.children.splice(anchorIndex, 0, node)
    node.parent = parent
    return [node, node]
  },
  setText(node, text) { node.text = text },
  setElementText(node, text) {
    node.children = text === '' ? [] : [{ type: '#text', text, parent: node }]
  },
  patchProp(node, key, _previous, next) { node.props[key] = next },
  insert(node, parent, anchor = null) {
    if (node.parent) {
      const previousIndex = node.parent.children.indexOf(node)
      if (previousIndex !== -1) node.parent.children.splice(previousIndex, 1)
    }
    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1
    if (anchorIndex === -1) parent.children.push(node)
    else parent.children.splice(anchorIndex, 0, node)
    node.parent = parent
  },
  remove(node) {
    if (!node.parent) return
    const index = node.parent.children.indexOf(node)
    if (index !== -1) node.parent.children.splice(index, 1)
    node.parent = null
  },
  parentNode: node => node.parent,
  nextSibling(node) {
    if (!node.parent) return null
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
  },
})

function descendants(node) {
  return [node, ...(node.children ?? []).flatMap(descendants)]
}
function textContent(node) {
  if (node.type === '#text' || node.type === '#comment' || node.type === '#static') return node.text
  return (node.children ?? []).map(textContent).join('')
}
function findNode(rootNode, predicate) {
  return descendants(rootNode).find(predicate)
}
function outcomeBadge(container) {
  const badge = findNode(container, node => node.type === 'NTag')
  assert.ok(badge, 'missing outcome badge')
  return textContent(badge)
}
async function withComponent(component, props, run) {
  const container = { type: 'root', props: {}, children: [], parent: null }
  const app = renderer.createApp(component, props)
  app.mount(container)
  try {
    await nextTick()
    await run(container)
  } finally {
    app.unmount()
  }
}

test('a real failure wins over any declared outcome and keeps the facts', async () => {
  await withComponent(Surface, {
    title: 'Maintenance result',
    outcome: 'succeeded',
    error: 'backend rejected the request',
    facts: [{ labelKey: 'audit.ownerId', value: 'owner-1', mono: true }],
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.failed/)
    const text = textContent(container)
    assert.match(text, /backend rejected the request/)
    assert.match(text, /owner-1/)
  })
})

test('accepted, existing, not-retried and unknown answers stay clearly distinct', async () => {
  const cases = [
    { result: { jobId: 'job-1' }, key: 'operationResult.outcome.accepted' },
    { result: { outcome: 'AlreadyActive', jobId: 'job-1' }, key: 'operationResult.outcome.existing' },
    { result: { retried: false }, key: 'operationResult.outcome.notRetried' },
    { result: {}, key: 'operationResult.outcome.unknown' },
  ]
  for (const testCase of cases) {
    await withComponent(Surface, { title: 'Result', result: testCase.result }, async container => {
      assert.match(outcomeBadge(container), new RegExp(testCase.key.replace(/\./g, '\\.')))
    })
  }
})

test('a listing-shaped answer is shown as unknown, not as a completed operation', async () => {
  const listing = {
    ownerId: 'owner-1',
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    cells: [
      { tableId: '1', rowId: '7', columnId: 0 },
      { tableId: '1', rowId: '8', columnId: 0 },
    ],
    tableIds: ['1'],
    tableSummaries: [{ tableId: '1', rowCount: 2, cellCount: 2 }],
  }
  await withComponent(Surface, { title: 'Result', result: listing }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.unknown/)
    assert.doesNotMatch(outcomeBadge(container), /operationResult\.outcome\.succeeded/)
  })
  await withComponent(AuditResult, { title: 'Result', result: listing }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.unknown/)
  })
  await withComponent(OwnershipResult, { title: 'Result', result: listing }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.unknown/)
  })
})

test('an explicit caller outcome still wins over an inconclusive answer', async () => {
  await withComponent(Surface, {
    title: 'Result',
    result: { total: 2, cells: [] },
    outcome: 'succeeded',
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.succeeded/)
  })
  await withComponent(OwnershipResult, {
    title: 'Result',
    result: { ownerId: 'owner-1', total: 2 },
    outcome: 'accepted',
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.accepted/)
  })
})

test('a committed ownership answer keeps rendering as succeeded', async () => {
  await withComponent(OwnershipResult, {
    title: 'Result',
    result: { ownerId: 'owner-1', cellsAdded: 2, rootHash: 'root-1', jobId: 'job-1' },
    facts: [{ labelKey: 'ownership.ownerId', value: 'owner-1', mono: true }],
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.succeeded/)
    assert.match(textContent(container), /owner-1/)
  })
  await withComponent(Surface, {
    title: 'Result',
    result: { sourceOwnerId: 'a', targetOwnerId: 'b', cellsMoved: 2, sourceRootHash: 'root-a', targetRootHash: 'root-b' },
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.succeeded/)
  })
})

test('raw JSON is folded by default and expands when explicitly requested', async () => {
  for (const defaultOpen of [false, true]) {
    await withComponent(Surface, {
      title: 'Result',
      result: { jobId: 'job-1', nested: { retried: false } },
      defaultOpen,
    }, async container => {
      const collapse = findNode(container, node => node.type === 'NCollapse')
      assert.ok(collapse)
      const expanded = collapse.props.defaultExpandedNames ?? collapse.props['default-expanded-names']
      assert.deepEqual(expanded, defaultOpen ? ['json'] : [])
      const pre = findNode(container, node => node.type === 'pre')
      assert.ok(pre)
      assert.match(textContent(pre), /"jobId": "job-1"/)
      assert.match(textContent(pre), /"retried": false/)
    })
  }
})

test('the submitted target snapshot renders as a frozen copy', async () => {
  const submission = {
    fields: [
      { labelKey: 'ownership.ownerId', value: 'owner-1', mono: true },
      { labelKey: 'ownership.workbench.refresh.facts.pendingRevision', value: '4' },
    ],
    submittedAt: '2026-11-16T05:00:00.000Z',
    requestId: 'req-1',
    traceId: 'trace-1',
  }
  await withComponent(Surface, { title: 'Result', result: { retried: false }, submission }, async container => {
    const section = findNode(container, node => (
      node.type === 'section' && node.props['aria-label'] === 'operationResult.submission'
    ))
    assert.ok(section)
    const before = textContent(section)
    assert.match(before, /owner-1/)
    assert.match(before, /2026-11-16T05:00:00\.000Z/)
    assert.match(before, /req-1/)
    assert.match(before, /trace-1/)
    const traceLink = findNode(section, node => node.type === 'RouterLink')
    assert.deepEqual(traceLink.props.to, { name: 'events', query: { traceId: 'trace-1' } })

    submission.fields[0].value = 'owner-2'
    submission.fields.push({ labelKey: 'late', value: 'late edit' })
    await nextTick()
    assert.equal(textContent(section), before)
  })
})

test('the audit wrapper keeps its delegated job link and forwards the snapshot', async () => {
  await withComponent(AuditResult, {
    title: 'Maintenance result',
    result: { jobId: 'job-1', algorithmId: 'alg-1' },
    jobId: 'job-1',
    facts: [{ labelKey: 'audit.workbench.operations.facts.jobId', value: 'job-1', mono: true }],
    submission: {
      fields: [{ labelKey: 'audit.ownerId', value: 'owner-1', mono: true }],
      submittedAt: '2026-11-16T05:00:00.000Z',
    },
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.accepted/)
    const jobLink = findNode(container, node => node.type === 'AuditJobLink')
    assert.ok(jobLink, 'missing delegated job link')
    assert.equal(jobLink.props.jobId ?? jobLink.props['job-id'], 'job-1')
    assert.equal(jobLink.props.track, true)
    const text = textContent(container)
    assert.match(text, /owner-1/)
    assert.match(text, /2026-11-16T05:00:00\.000Z/)
  })
})

test('the audit wrapper keeps a real error visible next to the job link', async () => {
  await withComponent(AuditResult, {
    title: 'Maintenance result',
    error: 'dispatch failed',
    jobId: 'job-1',
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.failed/)
    assert.match(textContent(container), /dispatch failed/)
    assert.ok(findNode(container, node => node.type === 'AuditJobLink'))
  })
})

test('the ownership wrapper keeps owner-name resolution and folded JSON', async () => {
  await withComponent(OwnershipResult, {
    title: 'Ownership result',
    result: { ownerId: 'owner-1', valid: true },
    facts: [{ labelKey: 'ownership.ownerId', value: 'owner-1', mono: true }],
  }, async container => {
    assert.match(outcomeBadge(container), /operationResult\.outcome\.succeeded/)
    const text = textContent(container)
    assert.match(text, /Alice/)
    assert.match(text, /owner-1/)
    const collapse = findNode(container, node => node.type === 'NCollapse')
    assert.deepEqual(
      collapse.props.defaultExpandedNames ?? collapse.props['default-expanded-names'],
      [],
    )
    assert.match(textContent(findNode(container, node => node.type === 'pre')), /"valid": true/)
  })
})
