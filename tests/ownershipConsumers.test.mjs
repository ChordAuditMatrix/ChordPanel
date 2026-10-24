import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { compileScript, parse } from 'vue/compiler-sfc'
import { createRenderer, nextTick } from 'vue'
import { createServer } from 'vite'

const root = process.cwd()
const apiMockId = '\0ownership-consumers-test-api'
const i18nMockId = '\0ownership-consumers-test-i18n'
const catalogMockId = '\0ownership-consumers-test-catalog'
const uiMockId = '\0ownership-consumers-test-naive-ui'
const componentMockIds = new Map([
  ['@/components/TableSelect.vue', '\0ownership-consumers-table-select'],
  [resolve(root, 'src/components/TableSelect.vue'), '\0ownership-consumers-table-select'],
  ['@/components/CellEditor.vue', '\0ownership-consumers-cell-editor'],
  [resolve(root, 'src/components/CellEditor.vue'), '\0ownership-consumers-cell-editor'],
  ['@/components/WorkbenchSection.vue', '\0ownership-consumers-workbench-section'],
  ['@/components/UserSelect.vue', '\0ownership-consumers-user-select'],
  [resolve(root, 'src/components/UserSelect.vue'), '\0ownership-consumers-user-select'],
  [resolve(root, 'src/components/WorkbenchSection.vue'), '\0ownership-consumers-workbench-section'],
  ['@/components/ServerPagedDataTable.vue', '\0ownership-consumers-data-table'],
  [resolve(root, 'src/components/ServerPagedDataTable.vue'), '\0ownership-consumers-data-table'],
  ['./OwnershipResultPanel.vue', '\0ownership-consumers-result-panel'],
  [resolve(root, 'src/views/ownership/OwnershipResultPanel.vue'), '\0ownership-consumers-result-panel'],
])
const moduleMockIds = new Map([
  ['virtual:ownership-consumers-test-api', apiMockId],
  ['virtual:ownership-consumers-test-i18n', i18nMockId],
  ['virtual:ownership-consumers-test-catalog', catalogMockId],
  ['@/api/ownership', apiMockId],
  [resolve(root, 'src/api/ownership.ts'), apiMockId],
  ['@/stores/i18n', i18nMockId],
  [resolve(root, 'src/stores/i18n.ts'), i18nMockId],
  ['@/stores/referenceCatalog', catalogMockId],
  [resolve(root, 'src/stores/referenceCatalog.ts'), catalogMockId],
])
const clientSfcIds = new Set([
  resolve(root, 'src/views/ownership/OwnershipProofPanel.vue'),
  resolve(root, 'src/views/ownership/OwnershipQueryPanel.vue'),
  resolve(root, 'src/views/ownership/OwnershipDataPanel.vue'),
  resolve(root, 'src/views/ownership/OwnershipTreeManagement.vue'),
])

const mockPlugin = {
  name: 'ownership-consumers-test-mocks',
  enforce: 'pre',
  resolveId(id) {
    const requestedId = id.split('?')[0]
    const normalizedId = requestedId.replace(/^\/@fs\//, '/')
    const absoluteId = normalizedId.startsWith('/src/')
      ? resolve(root, normalizedId.slice(1))
      : normalizedId
    const componentMockId = componentMockIds.get(requestedId)
      ?? componentMockIds.get(normalizedId)
      ?? componentMockIds.get(absoluteId)
    if (componentMockId) return componentMockId
    const moduleMockId = moduleMockIds.get(requestedId)
      ?? moduleMockIds.get(normalizedId)
      ?? moduleMockIds.get(absoluteId)
    if (moduleMockId) return moduleMockId
    if (id === 'virtual:ownership-consumers-test-naive-ui' || id === 'naive-ui') return uiMockId
    if (clientSfcIds.has(absoluteId)) return `${absoluteId}.client-test.ts`
  },
  load(id) {
    if (id.endsWith('.vue.client-test.ts')) {
      const filename = id.slice(0, -'.client-test.ts'.length)
      const source = readFileSync(filename, 'utf8')
      const { descriptor, errors } = parse(source, { filename })
      if (errors.length) throw errors[0]
      return compileScript(descriptor, { id: filename, inlineTemplate: true }).content
    }

    if (id === apiMockId) {
      return `
export const calls = []
const record = (method, args, result = {}) => {
  calls.push({ method, args })
  return Promise.resolve(result)
}
export const generateProof = (...args) => record('generateProof', args, { ownerId: args[0].ownerId })
export const generateRangeProof = (...args) => record('generateRangeProof', args)
export const verifyProof = (...args) => record('verifyProof', args)
export const verifyRangeProof = (...args) => record('verifyRangeProof', args)
export let queryBehavior = null
export function setQueryBehavior(next) { queryBehavior = next }
export const queryCells = (...args) => {
  if (queryBehavior) {
    calls.push({ method: 'queryCells', args })
    return queryBehavior(args)
  }
  return record('queryCells', args, {
    ownerId: args[0], cells: [], total: 0, page: 1, pageSize: 20,
    totalPages: 1, tableIds: [], tableSummaries: [],
  })
}
export const addCells = (...args) => record('addCells', args)
export const removeCells = (...args) => record('removeCells', args)
export const moveCells = (...args) => record('moveCells', args)
export const importCells = (...args) => record('importCells', args)
export const exportCells = (...args) => record('exportCells', args)
export const createTree = (...args) => record('createTree', args, { ownerId: args[0] })
export const deleteTree = (...args) => record('deleteTree', args, { ownerId: args[0], deleted: true })
export const parseOwnershipJson = text => JSON.parse(text)
`
    }
    if (id === i18nMockId) return `export const useI18n = () => ({ t: key => key })`
    if (id === catalogMockId) {
      return `
import { ref } from 'vue'
export const useReferenceCatalog = () => ({
  auditTables: ref([]),
  auditTablesById: ref(new Map()),
  auditTablesState: ref({ error: null }),
  userEntitiesById: ref(new Map()),
  ensureAuditTablesLoaded: async () => {},
})
`
    }
    if (id === uiMockId) {
      const names = [
        'NAlert', 'NButton', 'NCard', 'NCheckbox', 'NDataTable', 'NDivider', 'NEmpty',
        'NForm', 'NFormItem', 'NIcon', 'NInput', 'NInputNumber', 'NPopconfirm', 'NRadioButton',
        'NRadioGroup', 'NResult', 'NSelect', 'NSpace', 'NSpin', 'NSwitch', 'NTag', 'NText',
      ]
      return `
import { defineComponent, h } from 'vue'
const control = name => defineComponent({
  name,
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h(name, attrs, slots.default?.())
  },
})
${names.map(name => `export const ${name} = control('${name}')`).join('\n')}
export const useMessage = () => ({ warning() {}, success() {}, error() {} })
`
    }
    const componentName = {
      '\0ownership-consumers-table-select': 'TableSelect',
      '\0ownership-consumers-cell-editor': 'CellEditor',
      '\0ownership-consumers-workbench-section': 'WorkbenchSection',
      '\0ownership-consumers-user-select': 'UserSelect',
      '\0ownership-consumers-data-table': 'ServerPagedDataTable',
      '\0ownership-consumers-result-panel': 'OwnershipResultPanel',
    }[id]
    if (componentName) {
      return `
import { defineComponent, h } from 'vue'
export default defineComponent({
  name: '${componentName}',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('${componentName}', attrs, slots.default?.())
  },
})
`
    }
  },
}

const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: [
    { find: '@/api/ownership', replacement: 'virtual:ownership-consumers-test-api' },
    { find: '@/stores/i18n', replacement: 'virtual:ownership-consumers-test-i18n' },
    { find: '@/stores/referenceCatalog', replacement: 'virtual:ownership-consumers-test-catalog' },
    { find: 'naive-ui', replacement: 'virtual:ownership-consumers-test-naive-ui' },
    { find: '@', replacement: resolve(root, 'src') },
  ] },
  plugins: [mockPlugin],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const api = await vite.ssrLoadModule('virtual:ownership-consumers-test-api')
const ui = await vite.ssrLoadModule('virtual:ownership-consumers-test-naive-ui')
const [ProofPanel, QueryPanel, DataPanel, TreeManagement] = await Promise.all([
  vite.ssrLoadModule('/src/views/ownership/OwnershipProofPanel.vue'),
  vite.ssrLoadModule('/src/views/ownership/OwnershipQueryPanel.vue'),
  vite.ssrLoadModule('/src/views/ownership/OwnershipDataPanel.vue'),
  vite.ssrLoadModule('/src/views/ownership/OwnershipTreeManagement.vue'),
]).then(modules => modules.map(module => module.default))

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
function controlInField(rootNode, label, type) {
  const field = findNode(rootNode, node => node.type === 'NFormItem' && node.props.label === label)
  assert.ok(field, `missing form field ${label}`)
  const control = findNode(field, node => node.type === type)
  assert.ok(control, `missing ${type} control in ${label}`)
  return control
}
function dispatch(node, event, ...args) {
  const handlers = node.props[event]
  assert.ok(handlers, `missing ${event} handler on ${node.type}`)
  for (const handler of Array.isArray(handlers) ? handlers : [handlers]) handler(...args)
}
async function enterField(rootNode, label, value, type = 'NInput', event = 'onUpdate:value') {
  dispatch(controlInField(rootNode, label, type), event, value)
  await nextTick()
}
async function clickButton(rootNode, label) {
  const button = findNode(rootNode, node => node.type === 'NButton' && textContent(node) === label)
  assert.ok(button, `missing button ${label}`)
  const result = button.props.onClick?.()
  await result
  await nextTick()
}
async function withPanel(component, props, run) {
  const container = { type: 'root', props: {}, children: [], parent: null }
  const app = renderer.createApp(component, props)
  for (const [name, control] of Object.entries(ui)) {
    if (!name.startsWith('N')) continue
    const tagName = name.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)
    app.component(tagName, control)
  }
  app.mount(container)
  try {
    await nextTick()
    await run(container)
  } finally {
    app.unmount()
  }
}

for (const testCase of [
  {
    name: 'proof generation sends the selected ownerId',
    component: ProofPanel,
    props: { mode: 'generate' },
    run: async container => {
      const ownerId = 'ownership:tenant-42'
      await enterField(container, 'ownership.ownerId', ownerId, 'UserSelect', 'onUpdate:modelValue')
      dispatch(controlInField(container, 'ownership.tableId', 'TableSelect'), 'onUpdate:modelValue', '5')
      dispatch(controlInField(container, 'ownership.columnId', 'NInputNumber'), 'onUpdate:value', 7)
      await nextTick()
      await clickButton(container, 'ownership.generateSingle')
      assert.deepEqual(api.calls, [{
        method: 'generateProof',
        args: [{ proofType: 'membership', ownerId, tableId: '5', rowId: '', columnId: 7 }],
      }])
    },
  },
  {
    name: 'query keeps the selected ownerId in the request and ownership path',
    component: QueryPanel,
    props: {},
    run: async container => {
      const ownerId = 'ownership:tenant-42'
      await enterField(container, 'ownership.ownerId', ownerId, 'UserSelect', 'onUpdate:modelValue')
      await clickButton(container, 'ownership.query')
      const call = [...api.calls].reverse().find(entry => entry.method === 'queryCells')
      assert.ok(call, 'the query must reach the ownership API')
      assert.equal(call.args[0], ownerId)
      assert.deepEqual(call.args[1], { page: 1, pageSize: 20 })
      assert.equal(call.args[2].timeoutMs, 0)
      assert.ok(call.args[2].signal)
      const pathOwner = findNode(container, node => node.type === 'span'
        && textContent(node) === ownerId
        && (typeof node.props.class === 'string'
          ? node.props.class.split(/\s+/).includes('detail-value')
          : node.props.class?.['detail-value'] === true))
      assert.ok(pathOwner, 'the rendered ownership path must use the selected ownerId')
    },
  },
  {
    name: 'a long ownership query can stop waiting without reporting failure',
    component: QueryPanel,
    props: {},
    run: async container => {
      let signal = null
      api.setQueryBehavior(args => new Promise((resolve, reject) => {
        signal = args[2]?.signal
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), {
          isAxiosError: true,
          code: 'ERR_CANCELED',
        })))
      }))
      try {
        await enterField(container, 'ownership.ownerId', 'ownership:slow', 'UserSelect', 'onUpdate:modelValue')
        await clickButton(container, 'ownership.query')
        await nextTick()
        assert.ok(signal, 'the query must carry a cancellation signal')
        assert.equal(signal.aborted, false)
        assert.ok(findNode(container, node => node.type === 'NButton'
          && textContent(node) === 'ownership.cancelQuery'), 'a running query must offer stop waiting')

        await clickButton(container, 'ownership.cancelQuery')
        assert.equal(signal.aborted, true)
        await nextTick()
        assert.ok(findNode(container, node => textContent(node).includes('ownership.queryCancelled')),
          'cancelling explains that the backend Job keeps running')
        assert.equal(findNode(container, node => textContent(node).includes('ownership.queryFailed')), undefined)
      } finally {
        api.setQueryBehavior(null)
      }
    },
  },
  {
    name: 'cell migration sends independently selected source and target owner IDs',
    component: DataPanel,
    props: {},
    run: async container => {
      const mutationGroup = descendants(container).find(node => node.type === 'NRadioGroup' && node.props.value === 'add')
      assert.ok(mutationGroup)
      dispatch(mutationGroup, 'onUpdate:value', 'move')
      await nextTick()
      await enterField(container, 'ownership.sourceOwner', 'ownership:source-7', 'UserSelect', 'onUpdate:modelValue')
      await enterField(container, 'ownership.targetOwner', 'ownership:target-9', 'UserSelect', 'onUpdate:modelValue')
      const editor = findNode(container, node => node.type === 'CellEditor')
      assert.ok(editor)
      dispatch(editor, 'onUpdate:modelValue', [{ tableId: '5', rowId: '0001', columnId: 2 }])
      await clickButton(container, 'ownership.move')
      assert.deepEqual(api.calls, [{
        method: 'moveCells',
        args: ['ownership:source-7', 'ownership:target-9', [{ tableId: '5', rowId: '0001', columnId: 2 }]],
      }])
    },
  },
  {
    name: 'tree creation sends the selected ownerId',
    component: TreeManagement,
    props: {},
    run: async container => {
      const ownerId = 'ownership:tree-17'
      await enterField(container, 'ownership.ownerId', ownerId, 'UserSelect', 'onUpdate:modelValue')
      await clickButton(container, 'ownership.createTreeBtn')
      assert.deepEqual(api.calls, [{ method: 'createTree', args: [ownerId] }])
    },
  },
]) {
  test(testCase.name, async () => {
    api.calls.length = 0
    await withPanel(testCase.component, testCase.props, testCase.run)
  })
}
