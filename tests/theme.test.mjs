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

const { resolveThemePreference } = await vite.ssrLoadModule('/src/stores/theme.ts')

test('explicit theme overrides system preference while unset follows it', () => {
  assert.equal(resolveThemePreference('dark', false), true)
  assert.equal(resolveThemePreference('dark', true), true)
  assert.equal(resolveThemePreference('light', false), false)
  assert.equal(resolveThemePreference('light', true), false)
  assert.equal(resolveThemePreference(null, true), true)
  assert.equal(resolveThemePreference(null, false), false)
})
