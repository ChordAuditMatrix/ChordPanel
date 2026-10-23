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

async function renderSelection(selected) {
  return renderToString(createSSRApp(AlgorithmSelectionBar, {
    selection: selected,
    algorithmId: 'snapshot-algorithm-id',
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

  const identity = await renderSelection(selection({ purpose: 'Identity', strategyKind: 'Online', capabilities: [] }))
  assert.match(identity, /身份验证算法/)
  assert.match(identity, /在线（Online）/)
  assert.doesNotMatch(identity, /基于身份的密码学（IBC）/)
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
