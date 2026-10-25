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

const { resolveThemePreference, resolveSystemThemeChange, useTheme } =
  await vite.ssrLoadModule('/src/stores/theme.ts')
const theme = useTheme()

after(async () => { await vite.close() })

test('explicit theme overrides system preference while unset follows it', () => {
  assert.equal(resolveThemePreference('dark', false), true)
  assert.equal(resolveThemePreference('dark', true), true)
  assert.equal(resolveThemePreference('light', false), false)
  assert.equal(resolveThemePreference('light', true), false)
  assert.equal(resolveThemePreference(null, true), true)
  assert.equal(resolveThemePreference(null, false), false)
})

test('system changes update Auto mode but keep explicit preferences fixed', () => {
  assert.equal(resolveSystemThemeChange(null, true, false), true)
  assert.equal(resolveSystemThemeChange(null, false, true), false)
  assert.equal(resolveSystemThemeChange('light', true, false), false)
  assert.equal(resolveSystemThemeChange('dark', false, true), true)
})

test('theme preference can return to Auto and remove its persisted override', () => {
  const storage = new Map()
  const originalWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
  }
  try {
    assert.equal(theme.preference.value, null)
    theme.setThemePreference('dark')
    assert.equal(theme.preference.value, 'dark')
    assert.equal(theme.isDark.value, true)
    assert.equal(storage.get('chord-panel-theme'), 'dark')

    theme.setThemePreference(null)
    assert.equal(theme.preference.value, null)
    assert.equal(theme.isDark.value, false)
    assert.equal(storage.has('chord-panel-theme'), false)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})
