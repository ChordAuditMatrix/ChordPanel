#!/usr/bin/env node
/**
 * One command for fixture QA: start the loopback fixture API, then the Vite dev
 * server pointed at it.
 *
 *   npm run qa:fixtures            # fixture API + app on http://localhost:5173
 *   npm run qa:fixtures -- --api-only
 *   QA_API_PORT=7100 QA_VITE_PORT=5180 npm run qa:fixtures
 *
 * Everything the app requests through `/api` is answered by `tests/qa/server.mjs`;
 * ChordAuditMatrix is never contacted. Write routes answer 501 and the page shows
 * a "local fixtures, not a live backend" badge.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SYNTHETIC_FIXTURE_FILE,
  SYNTHETIC_TRACE_FIXTURE_DIR,
  TRACE_FIXTURE_DIR,
  qaScenarioViews,
  traceScenarios,
} from './manifest.mjs'
import { createQaServer } from './server.mjs'
import { availableResources, loadTraceRegistry } from './traceFixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')

const args = new Set(process.argv.slice(2))
const apiOnly = args.has('--api-only')
const verbose = process.env.QA_LOG === '1'

if (args.has('--help') || args.has('-h')) {
  process.stdout.write(
    'Usage: node tests/qa/run.mjs [--api-only]\n'
    + '\n'
    + '  --api-only   start only the fixture API (point an existing Vite dev server at it\n'
    + '               with VITE_DEV_PROXY_TARGET=http://127.0.0.1:<port>)\n'
    + '\n'
    + 'Env: QA_API_PORT (0 = ephemeral), QA_VITE_PORT (default 5173), QA_APP_ORIGIN, QA_LOG=1\n',
  )
  process.exit(0)
}

function log(line) {
  process.stdout.write(`${line}\n`)
}

function fail(message) {
  process.stderr.write(`[qa] ${message}\n`)
  process.exit(1)
}

let registry
try {
  registry = loadTraceRegistry({
    fixtureDir: path.join(repoRoot, TRACE_FIXTURE_DIR),
    syntheticFixtureDir: path.join(repoRoot, SYNTHETIC_TRACE_FIXTURE_DIR),
    scenarios: traceScenarios,
  })
} catch (cause) {
  fail(`fixture validation failed: ${cause instanceof Error ? cause.message : String(cause)}`)
}

let synthetic
try {
  synthetic = JSON.parse(readFileSync(path.join(repoRoot, SYNTHETIC_FIXTURE_FILE), 'utf8'))
} catch (cause) {
  fail(`cannot read ${SYNTHETIC_FIXTURE_FILE}: ${cause instanceof Error ? cause.message : String(cause)}`)
}

const apiPort = Number(process.env.QA_API_PORT ?? '0')
const vitePort = Number(process.env.QA_VITE_PORT ?? '5173')
let appOrigin = (process.env.QA_APP_ORIGIN ?? `http://localhost:${vitePort}`).replace(/\/+$/, '')

const server = createQaServer({
  registry,
  synthetic,
  // Read lazily: the QA index must follow the port Vite actually bound.
  appOrigin: () => appOrigin,
  logger: verbose ? line => log(`[qa] ${line}`) : () => {},
})

let shuttingDown = false
let child = null

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  server.close(() => process.exit(code))
  // Do not hang on keep-alive sockets.
  setTimeout(() => process.exit(code), 1500).unref()
}

server.on('error', cause => {
  fail(`fixture API failed to start: ${cause instanceof Error ? cause.message : String(cause)}`)
})

await new Promise(resolve => server.listen(apiPort, '127.0.0.1', resolve))
const address = server.address()
const resolvedApiPort = address && typeof address === 'object' ? address.port : apiPort
const apiOrigin = `http://127.0.0.1:${resolvedApiPort}`

log('')
log('  ChordPanel QA fixtures — 本地 fixture · 非实时后端')
log('  ─────────────────────────────────────────────────────────')
log(`  fixture API   ${apiOrigin}`)
log(`  QA index      ${apiOrigin}/qa`)
log(`  inventory     ${apiOrigin}/qa/health`)
log('')
log(`  ${registry.jobs.size} Trace Jobs · ${qaScenarioViews.length} QA views (validated: Job ownership + Link/Packet joins)`)

for (const entry of registry.jobs.values()) {
  for (const view of entry.views.values()) {
    log(`   · ${view.id.padEnd(32)} ${entry.jobId}  [${availableResources(view).join(', ')}]`)
  }
}
log('')
log('  Trace routes replay recorded exchanges verbatim; uncaptured resources answer 501,')
log('  unknown Jobs 404, every write route 501 read-only. Synthetic System/Nodes/Jobs/Tasks/')
log('  Users/Algorithms/AuditTables data is QA-only visual data.')
log('')

/**
 * Vite does not export its CLI through package `exports`, so resolve the file
 * directly. `.bin/vite` is the fallback for hoisted/odd installs.
 */
function resolveViteCli() {
  const candidates = [
    path.join(repoRoot, 'node_modules/vite/bin/vite.js'),
    path.join(repoRoot, 'node_modules/.bin/vite'),
  ]
  const found = candidates.find(candidate => existsSync(candidate))
  if (!found) fail('cannot locate the Vite CLI; run `npm install` first')
  return found
}

if (apiOnly) {
  log(`  Point a dev server at it:  VITE_DEV_PROXY_TARGET=${apiOrigin} npm run dev`)
  log('')
} else {
  const viteBin = resolveViteCli()
  const configPath = path.join(here, 'vite.qa.config.mjs')

  child = spawn(
    process.execPath,
    [viteBin, '--config', configPath, '--mode', 'qa', '--port', String(vitePort)],
    {
      cwd: repoRoot,
      stdio: ['inherit', 'pipe', 'inherit'],
      env: {
        ...process.env,
        VITE_DEV_PROXY_TARGET: apiOrigin,
        QA_APP_ORIGIN: appOrigin,
      },
    },
  )

  const ansi = /\u001b\[[0-9;]*m/g
  child.stdout.on('data', chunk => {
    const text = chunk.toString()
    process.stdout.write(text)
    for (const line of text.split('\n')) {
      const clean = line.replace(ansi, '')
      const local = /Local:\s+(https?:\/\/\S+)/.exec(clean)
      if (local) {
        appOrigin = local[1].replace(/\/+$/, '')
        log('')
        log(`  app           ${appOrigin}`)
        for (const entry of registry.jobs.values()) {
          for (const view of entry.views.values()) {
            log(`   · ${view.id.padEnd(32)} ${appOrigin}${view.landing}`)
          }
        }
        log('')
      }
    }
  })

  child.on('error', cause => fail(`could not start Vite: ${cause instanceof Error ? cause.message : String(cause)}`))
  child.on('exit', code => shutdown(code ?? 0))
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
