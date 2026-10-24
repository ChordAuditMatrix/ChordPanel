import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { createSSRApp, h } from 'vue'
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

const { default: ChallengeConfidencePanel } = await vite.ssrLoadModule(
  '/src/features/execution/components/ChallengeConfidencePanel.vue',
)
const { default: MathSymbol } = await vite.ssrLoadModule('/src/components/MathSymbol.vue')
const { default: HypergeometricFormula } = await vite.ssrLoadModule('/src/components/HypergeometricFormula.vue')
const { currentLocaleRef } = await vite.ssrLoadModule('/src/stores/i18n.ts')
const { default: zhCN } = await vite.ssrLoadModule('/src/locales/zh-CN.ts')
const { default: en } = await vite.ssrLoadModule('/src/locales/en.ts')

const metadata = {
  targetConfidence: '0.99',
  assumedCorruptionRatio: '0.01',
  assumedCorruptedBlockCount: '1',
  blockCount: '127',
  challengeCount: '126',
}

async function render(component, props, locale) {
  currentLocaleRef.value = locale
  return renderToString(createSSRApp({ render: () => h(component, props) }))
}

test('probability symbols render as variables with subscripts instead of underscore names', async () => {
  const zh = await render(ChallengeConfidencePanel, {
    executionKind: 'challengeProof',
    jobMetadata: metadata,
  }, 'zh-CN')
  assert.match(zh, /<math[^>]*class="math-symbol"/)
  assert.match(zh, /<msub[^>]*>\s*<mi[^>]*>P<\/mi>\s*<mtext[^>]*>detect<\/mtext>/)
  assert.match(zh, /<mi[^>]*>N<\/mi>/)
  assert.match(zh, /<mi[^>]*>c<\/mi>/)
  assert.match(zh, /<mfrac[^>]*linethickness="0"/)
  assert.doesNotMatch(zh, /P_detect/)

  const enHtml = await render(ChallengeConfidencePanel, {
    executionKind: 'challengeProof',
    jobMetadata: metadata,
  }, 'en')
  assert.match(enHtml, /<msub[^>]*>\s*<mi[^>]*>P<\/mi>\s*<mtext[^>]*>detect<\/mtext>/)
  assert.doesNotMatch(enHtml, /P_detect/)
})

test('shared math components render accessible notation', async () => {
  const symbol = await render(MathSymbol, { base: 'P', sub: 'detect' }, 'en')
  assert.match(symbol, /aria-label="P detect"/)
  assert.match(symbol, /<mtext[^>]*>detect<\/mtext>/)
  const formula = await render(HypergeometricFormula, { label: 'formula spoken' }, 'en')
  assert.match(formula, /aria-label="formula spoken"/)
  assert.match(formula, /<mo[^>]*>−<\/mo>/)
})

test('locale strings expose no underscore formula names', () => {
  for (const dictionary of [zhCN, en]) {
    const confidence = dictionary.execution.confidence
    assert.doesNotMatch(confidence.formulaAccessible, /_/)
    const probability = dictionary.audit.workbench.challenge.probability
    assert.equal('theoretical' in probability, true)
    assert.doesNotMatch(probability.theoretical, /_/)
    assert.doesNotMatch(probability.target, /\sp$/)
    assert.doesNotMatch(probability.ratio, /\sq$/)
    assert.match(probability.formulaAccessible, /P detect|检测概率/)
  }
})
