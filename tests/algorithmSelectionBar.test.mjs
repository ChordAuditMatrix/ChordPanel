import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  plugins: [vue()],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const { default: AlgorithmSelectionBar } = await vite.ssrLoadModule(
  '/src/features/execution/components/AlgorithmSelectionBar.vue',
)
const { capabilityNameLabel, strategyPurposeLabel } = await vite.ssrLoadModule(
  '/src/views/algorithm/strategyLabels.ts',
)
const zhCN = (await vite.ssrLoadModule('/src/locales/zh-CN.ts')).default
const en = (await vite.ssrLoadModule('/src/locales/en.ts')).default
const translate = key => key.split('.').reduce((value, part) => value?.[part], zhCN) ?? key

function selection(overrides = {}) {
  return {
    mode: 'Explicit',
    algorithmId: 'snapshot-algorithm-id',
    algorithmName: 'DHT dynamic',
    algorithmType: 'DHTDynamic',
    purpose: 'Audit',
    profileVersion: 1,
    strategyVersion: '1.0.0',
    strategyKind: 'Dynamic',
    capabilitiesMask: 6,
    capabilities: ['IdentityAuthentication', 'DynamicUpdate'],
    stateMaintenanceParty: 'TPA',
    selectedAtMs: 1,
    ...overrides,
  }
}

async function renderSelection(selected, props = {}) {
  return renderToString(createSSRApp(AlgorithmSelectionBar, {
    selection: selected,
    algorithmId: 'snapshot-algorithm-id',
    ...props,
  }))
}

test('algorithm selection shows unreported, empty, and declared capabilities distinctly', async () => {
  const unreported = await renderSelection(selection({ capabilities: null }))
  assert.match(unreported, /未提供能力/)
  assert.doesNotMatch(unreported, /selection-capability-chip/)

  const empty = await renderSelection(selection({ capabilities: [] }))
  assert.match(empty, /未声明能力/)
  assert.doesNotMatch(empty, /selection-capability-chip/)

  const declared = await renderSelection(selection())
  assert.match(declared, /基于身份的密码学（IBC）/)
  assert.match(declared, /动态更新（DynamicUpdate）/)
  assert.match(declared, /title="[^"]*IdentityAuthentication/)
})

test('algorithm purpose labels stay separate from Audit capability labels', async () => {
  assert.equal(strategyPurposeLabel('Audit', translate), '审计算法/策略')
  assert.equal(strategyPurposeLabel('Identity', translate), '身份验证算法')
  assert.equal(strategyPurposeLabel('OtherPurpose', translate), 'OtherPurpose')
  assert.equal(capabilityNameLabel('IdentityAuthentication', translate), '基于身份的密码学（IBC）')

  const identity = await renderSelection(selection({
    algorithmName: null,
    algorithmType: 'SM9Noncert',
    purpose: 'Identity',
    strategyKind: 'Online',
    capabilities: null,
  }), {
    algorithmNameFromCatalog: 'my-sm9noncert',
  })
  assert.match(identity, /my-sm9noncert/)
  assert.match(identity, /当前目录名称/)
  assert.match(identity, /身份验证算法/)
  assert.match(identity, /在线（Online）/)
  assert.match(identity, /不适用/)
  assert.match(identity, /能力掩码: 不适用/)
  assert.match(identity, /此名称来自当前算法目录，不是历史执行快照/)
  assert.doesNotMatch(identity, /未提供能力/)
  assert.doesNotMatch(identity, /基于身份的密码学（IBC）/)
  const identityWithoutCatalogName = await renderSelection(selection({
    algorithmName: null,
    purpose: 'Identity',
    capabilities: null,
  }))
  assert.match(identityWithoutCatalogName, /未提供算法名称/)
  assert.match(identityWithoutCatalogName, /不适用/)

  const auditSnapshot = await renderSelection(selection({ algorithmName: 'Historical Audit Name' }), {
    algorithmNameFromCatalog: 'Current Catalog Name',
  })
  assert.match(auditSnapshot, /Historical Audit Name/)
  assert.doesNotMatch(auditSnapshot, /Current Catalog Name/)
  assert.doesNotMatch(auditSnapshot, /当前目录名称/)
})
test('algorithm source and capability applicability copy exists in both locales', () => {
  assert.equal(zhCN.execution.algorithmSelection.nameCurrentCatalog, '当前目录名称')
  assert.equal(zhCN.execution.algorithmSelection.capabilitiesNotApplicable, '不适用')
  assert.equal(en.execution.algorithmSelection.nameCurrentCatalog, 'Current catalog name')
  assert.equal(en.execution.algorithmSelection.capabilitiesNotApplicable, 'Not applicable')
})

test('missing immutable selection fields remain unknown without catalog labels', async () => {
  const html = await renderSelection(null)
  assert.match(html, /未提供算法名称/)
  assert.match(html, /未提供算法类型/)
  assert.match(html, /未知/)
  assert.match(html, /未提供能力/)
  assert.match(html, /title="[^"]*snapshot-algorithm-id/)
  assert.doesNotMatch(html, /aria-label="[^"]*snapshot-algorithm-id/)
})
