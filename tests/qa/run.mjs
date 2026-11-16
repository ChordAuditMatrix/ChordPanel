#!/usr/bin/env node
/**
 * One command for fixture QA: start the loopback fixture API, then the Vite dev
 * server pointed at it.
 *
 *   npm run qa:fixtures            # fixture API + app on http://localhost:5173
 *   npm run qa:fixtures -- --api-only
 *   QA_API_PORT=7100 QA_VITE_PORT=5180 npm run qa:fixtures
 *   QA_SIMULATE_WRITES=1 npm run qa:fixtures
 *
 * Everything the app requests through `/api` is answered by `tests/qa/server.mjs`;
 * ChordAuditMatrix is never contacted. Write routes answer 501 by default; only
 * the explicit simulation flag makes documented POST routes answer labelled,
 * non-persistent synthetic results. The page shows a Chinese
 * "本地夹具 · 非真实后端" badge.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRAPH_STREAMS, loadGraphScenario } from './graphScenario.mjs'
import {
  SYNTHETIC_FIXTURE_FILE,
  SYNTHETIC_GRAPH_SCENARIO_FILE,
  SYNTHETIC_TRACE_FIXTURE_DIR,
  TRACE_FIXTURE_DIR,
  graphQaScenario,
  qaScenarioViews,
  taskStateScenario,
  traceScenarios,
} from './manifest.mjs'
import { createQaServer } from './server.mjs'
import { availableResources, loadTraceRegistry } from './traceFixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')

const args = new Set(process.argv.slice(2))
const apiOnly = args.has('--api-only')
const simulateWrites = args.has('--simulate-writes') || process.env.QA_SIMULATE_WRITES === '1'
const verbose = process.env.QA_LOG === '1'
const simulateLongWaitMs = Number(process.env.QA_SIMULATE_LONG_WAIT_MS ?? '12000')

if (args.has('--help') || args.has('-h')) {
  process.stdout.write(
    'Usage: node tests/qa/run.mjs [--api-only] [--simulate-writes]\n'
    + '\n'
    + '  --api-only          start only the fixture API (point an existing Vite dev server at it\n'
    + '                      with VITE_DEV_PROXY_TARGET=http://127.0.0.1:<port>)\n'
    + '  --simulate-writes   explicitly enable labelled, non-persistent answers for the documented\n'
    + '                      POST routes; every other write still answers 501\n'
    + '\n'
    + 'Env: QA_API_PORT (0 = ephemeral), QA_VITE_PORT (default 5173), QA_APP_ORIGIN, QA_LOG=1,\n'
    + '     QA_SIMULATE_WRITES=1, QA_SIMULATE_LONG_WAIT_MS (default 12000)\n',
  )
  process.exit(0)
}

if (!Number.isFinite(simulateLongWaitMs) || simulateLongWaitMs < 0) {
  process.stderr.write('[qa] QA_SIMULATE_LONG_WAIT_MS 必须是非负的毫秒数\n')
  process.exit(1)
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
  fail(`夹具校验失败：${cause instanceof Error ? cause.message : String(cause)}`)
}

let synthetic
try {
  synthetic = JSON.parse(readFileSync(path.join(repoRoot, SYNTHETIC_FIXTURE_FILE), 'utf8'))
} catch (cause) {
  fail(`无法读取 ${SYNTHETIC_FIXTURE_FILE}：${cause instanceof Error ? cause.message : String(cause)}`)
}

let graphScenario
try {
  graphScenario = loadGraphScenario(path.join(repoRoot, SYNTHETIC_GRAPH_SCENARIO_FILE))
} catch (cause) {
  fail(`执行图场景校验失败：${cause instanceof Error ? cause.message : String(cause)}`)
}

const apiPort = Number(process.env.QA_API_PORT ?? '0')
const vitePort = Number(process.env.QA_VITE_PORT ?? '5173')
let appOrigin = (process.env.QA_APP_ORIGIN ?? `http://localhost:${vitePort}`).replace(/\/+$/, '')

const server = createQaServer({
  registry,
  synthetic,
  graphScenario,
  graphScenarioMeta: graphQaScenario,
  simulateWrites,
  simulateLongWaitMs,
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
  fail(`夹具接口启动失败：${cause instanceof Error ? cause.message : String(cause)}`)
})

await new Promise(resolve => server.listen(apiPort, '127.0.0.1', resolve))
const address = server.address()
const resolvedApiPort = address && typeof address === 'object' ? address.port : apiPort
const apiOrigin = `http://127.0.0.1:${resolvedApiPort}`

log('')
log('  ChordPanel 本地夹具 — 非真实后端')
log('  ─────────────────────────────────────────────────────────')
log(`  夹具接口      ${apiOrigin}`)
log(`  夹具首页      ${apiOrigin}/qa`)
log(`  机器可读清单  ${apiOrigin}/qa/health`)
log('')
log(`  ${registry.jobs.size} 条 Trace 委托 · ${qaScenarioViews.length} 个界面场景 · 1 个合成委托关系图`)
log('  （已校验：委托归属、Link/协议包关联、执行图游标与覆盖承诺）')

for (const entry of registry.jobs.values()) {
  for (const view of entry.views.values()) {
    log(`   · ${view.id.padEnd(32)} ${entry.jobId}  [${availableResources(view).join(', ')}]`)
  }
}
log(`   · ${graphQaScenario.id.padEnd(32)} ${graphScenario.jobId}  [执行图：${GRAPH_STREAMS.join('、')} · 流程]`)
log(`   · ${taskStateScenario.id.padEnd(32)} ${taskStateScenario.jobId}  [委托/任务：23 条任务，taskIds 不完整]`)
if (simulateWrites) {
  log('')
  log('  写入模拟已开启（显式、隔离）：')
  log('  列出的 POST 路由返回带标记的合成受理/拒绝结果。')
  log('  不更改夹具状态；维护、数据源变更和重新登记均保持 Pending；')
  log(`  垃圾回收长等待选择器延迟 ${simulateLongWaitMs} 毫秒。其他写接口仍返回 501。`)
}
log('')
log('  Trace 路由原样回放录制交换；未采集资源返回 501，未知委托返回 404，其余写接口保持')
log('  501 只读。System/Nodes/Jobs/Tasks/Users/Algorithms/AuditTables 均为合成界面数据。')
log('  委托/流程执行图是人工编写的合成场景，不是抓包结果。')
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
  if (!found) fail('找不到 Vite 命令行工具；请先运行 `npm install`')
  return found
}

if (apiOnly) {
  log(`  将开发服务器指向该地址：  VITE_DEV_PROXY_TARGET=${apiOrigin} npm run dev`)
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
        log(`   · ${graphQaScenario.id.padEnd(32)} ${appOrigin}${graphQaScenario.landing}  (执行图视图直接打开)`)
        log('')
      }
    }
  })

  child.on('error', cause => fail(`无法启动 Vite：${cause instanceof Error ? cause.message : String(cause)}`))
  child.on('exit', code => shutdown(code ?? 0))
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
