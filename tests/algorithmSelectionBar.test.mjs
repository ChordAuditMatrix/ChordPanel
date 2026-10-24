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
    strategyKind: null,
    capabilities: null,
  }), {
    catalogProfile: {
      algorithmId: 'snapshot-algorithm-id',
      algorithmName: 'my-sm9noncert',
      algorithmType: 'SM9Noncert',
      purpose: 'Identity',
      version: 1,
    },
    catalogStrategy: {
      algorithmType: 'SM9Noncert',
      version: '1.0.0',
      purpose: 'Identity',
      strategyKind: 'Online',
      capabilities: null,
      capabilitiesMask: null,
      stateMaintenanceParty: null,
    },
  })
  assert.match(identity, /my-sm9noncert/)
  assert.doesNotMatch(identity, /来自当前算法目录|来自当前策略目录|当前目录名称/)
  assert.match(identity, /身份验证算法/)
  assert.match(identity, /在线（Online）/)
  assert.doesNotMatch(identity, /selection-capabilities|能力|不适用/)
  assert.doesNotMatch(identity, /未提供能力/)
  assert.doesNotMatch(identity, /基于身份的密码学（IBC）/)
  const identityWithoutCatalogName = await renderSelection(selection({
    algorithmName: null,
    purpose: 'Identity',
    capabilities: null,
  }))
  assert.match(identityWithoutCatalogName, /未提供算法名称/)
  assert.doesNotMatch(identityWithoutCatalogName, /selection-capabilities|不适用/)

  const auditSnapshot = await renderSelection(selection({ algorithmName: 'Historical Audit Name' }), {
    catalogProfile: {
      algorithmId: 'snapshot-algorithm-id',
      algorithmName: 'Current Catalog Name',
      algorithmType: 'DHTDynamic',
      purpose: 'Audit',
      version: 1,
    },
  })
  assert.match(auditSnapshot, /Historical Audit Name/)
  assert.doesNotMatch(auditSnapshot, /Current Catalog Name/)
  assert.doesNotMatch(auditSnapshot, /来自当前算法目录/)
})
test('strategy catalog fallback requires exact profile type and purpose', async () => {
  const html = await renderSelection(selection({
    algorithmName: null,
    algorithmType: 'SM9Noncert',
    purpose: 'Identity',
    strategyKind: null,
    capabilities: null,
  }), {
    catalogProfile: {
      algorithmId: 'snapshot-algorithm-id',
      algorithmName: 'my-sm9noncert',
      algorithmType: 'SM9Noncert',
      purpose: 'Identity',
      version: 1,
    },
    catalogStrategy: {
      algorithmType: 'AnotherType',
      version: '1.0.0',
      purpose: 'Identity',
      strategyKind: 'Online',
      capabilities: null,
      capabilitiesMask: null,
      stateMaintenanceParty: null,
    },
  })
  assert.match(html, /未知/)
  assert.doesNotMatch(html, /在线（Online）|当前策略目录/)
  assert.doesNotMatch(html, /selection-capabilities/)
})
test('algorithm profile fallbacks require an exact full ID; current strategies require exact type and purpose', async () => {
  const html = await renderSelection(selection({
    algorithmName: null,
    algorithmType: 'SM9Noncert',
    purpose: 'Identity',
    strategyKind: null,
    capabilities: null,
  }), {
    catalogProfile: {
      algorithmId: 'different-profile-id',
      algorithmName: 'Unrelated profile name',
      algorithmType: 'SM9Noncert',
      purpose: 'Identity',
      version: 1,
    },
    catalogStrategy: {
      algorithmType: 'SM9Noncert',
      version: '1.0.0',
      purpose: 'Identity',
      strategyKind: 'Online',
      capabilities: null,
      capabilitiesMask: null,
      stateMaintenanceParty: null,
    },
  })
  assert.match(html, /未提供算法名称/)
  assert.match(html, /在线（Online）/)
  assert.doesNotMatch(html, /来自当前算法目录|来自当前策略目录|当前策略目录/)
  assert.doesNotMatch(html, /Unrelated profile name|来自当前算法目录/)
  assert.doesNotMatch(html, /selection-capabilities/)
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
