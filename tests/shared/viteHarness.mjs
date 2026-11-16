import { resolve } from 'node:path'
import { createServer } from 'vite'

/**
 * Creates an isolated Vite middleware server for a single test file.
 *
 * Tests load app modules through `vite.ssrLoadModule(...)` so the real Vite
 * pipeline (including Vue SFC compilation when `plugins: [vue()]` is passed)
 * is exercised. Never share one server across test files: every file owns its
 * own module graph and must close the server it created.
 *
 * @param {object} [options]
 * @param {import('vite').PluginOption[]} [options.plugins]
 *   Extra plugins, e.g. `[vue()]` or a per-test module stub.
 * @param {import('vite').Alias[]} [options.alias]
 *   Extra aliases. They are matched before the project `@` alias.
 * @param {string} [options.root] Project root; defaults to the test process cwd.
 * @returns {Promise<import('vite').ViteDevServer>}
 */
export function createProjectVite({ plugins = [], alias = [], root = process.cwd() } = {}) {
  return createServer({
    configFile: false,
    root,
    plugins,
    resolve: { alias: [...alias, { find: '@', replacement: resolve(root, 'src') }] },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'silent',
  })
}
