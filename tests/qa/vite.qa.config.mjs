/**
 * Vite configuration for fixture QA runs (`npm run qa:fixtures`).
 *
 * The project config (`/vite.config.ts`) stays the single source of truth for
 * plugins, aliases and the dev proxy; this file loads it as a *config file*
 * (so `__dirname` keeps resolving to the repo root inside it) and only adds what
 * a QA run needs:
 *
 * - the fixture API as the `/api` proxy target (never ChordAuditMatrix),
 * - a separate dependency cache, so QA runs do not thrash the normal dev cache,
 * - the "local fixtures, not a live backend" badge.
 *
 * VITE_DEV_PROXY_TARGET must be set by `tests/qa/run.mjs`; opening this config
 * without the fixture server would silently proxy to a real backend, so it fails
 * loudly instead.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'
import { qaScenarioViews } from './manifest.mjs'
import { qaBadgePlugin } from './qaBadgePlugin.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')

export default async function qaConfig(env) {
  const apiOrigin = (process.env.VITE_DEV_PROXY_TARGET ?? '').replace(/\/+$/, '')
  if (!apiOrigin) {
    throw new Error(
      'tests/qa/vite.qa.config.mjs needs VITE_DEV_PROXY_TARGET pointing at the fixture API. '
      + 'Start it with `npm run qa:fixtures` instead of running Vite directly.',
    )
  }

  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: env?.mode ?? 'qa' },
    path.join(repoRoot, 'vite.config.ts'),
    repoRoot,
  )
  const base = loaded?.config ?? {}

  return {
    ...base,
    root: repoRoot,
    cacheDir: path.join(repoRoot, 'node_modules/.vite-qa'),
    plugins: [...(base.plugins ?? []), qaBadgePlugin({ apiOrigin, scenarios: qaScenarioViews })],
    server: {
      ...(base.server ?? {}),
      proxy: {
        ...(base.server?.proxy ?? {}),
        '/api': { target: apiOrigin, changeOrigin: true },
      },
    },
  }
}
