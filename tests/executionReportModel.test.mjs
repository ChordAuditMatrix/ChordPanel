import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

const { reportAlgorithmEvidence } = await vite.ssrLoadModule('/src/views/execution/executionReportModel.ts')
const fixture = name => JSON.parse(readFileSync(resolve(root, `tests/fixtures/observability/${name}`), 'utf8'))
const summaryWithSnapshot = fixture('challenge-summary-a9029fd6.json').response.body
const summaryWithoutSnapshot = fixture('challenge-verified-true-summary.json').response.body

test('report algorithm details require an immutable Summary snapshot', () => {
  const result = reportAlgorithmEvidence(summaryWithSnapshot, [])
  assert.equal(result.selection.algorithmId, 'd93b1655-af7d-411e-9de2-e80cbd21e185')
  assert.equal(result.selection.algorithmName, 'smoke-release-enabled-dht-p20065_1956268103043500')
  assert.equal(result.observation, null)

  assert.deepEqual(reportAlgorithmEvidence(summaryWithoutSnapshot, []), {
    selection: null,
    observation: null,
  })
})
