/**
 * Loopback-only fixture API used by `npm run qa:fixtures`.
 *
 * Design constraints (see README.md for the user-facing version):
 *
 * - Read-only by default. Every non-GET/HEAD request answers 501 `qa_read_only`;
 *   an explicit opt-in (`simulateWrites`) answers only the documented write
 *   routes with labelled, non-persistent synthetic results.
 * - Trace routes serve *recorded* responses from `tests/fixtures/observability`.
 *   The only permitted transformations are paging, filtering and the documented
 *   `includeWindows` projection of existing facts. A resource that was never
 *   captured answers 501 `trace_resource_not_captured`; a Job outside the fixture
 *   set answers 404 `job_not_found`.
 * - Graph routes answer only the explicitly synthetic graph scenario. Recorded
 *   Jobs answer 501 because the backend has no captured graph response.
 * - Non-telemetry surfaces answer from `fixtures/synthetic/base.json` and are
 *   labelled `X-ChordPanel-QA-Source: synthetic`.
 * - Every response carries `Cache-Control: no-store` plus `X-ChordPanel-QA*`
 *   provenance headers so a fixture response can never be mistaken for live
 *   backend output.
 *
 * Route decisions live in `traceRoutes.mjs`, `graphRoutes.mjs` and
 * `syntheticRoutes.mjs`; this file is the HTTP composition root plus the QA
 * index and inventory.
 */

import { createServer } from 'node:http'
import { GRAPH_STREAMS } from './graphScenario.mjs'
import { matchGraphRequestPath, routeFlowGraphRequest, routeJobGraphRequest } from './graphRoutes.mjs'
import { routeGraphTraceRequest } from './graphTraceRoutes.mjs'
import {
  QA_CAPTURED_QUERY_HEADER,
  QA_FIXTURE_HEADER,
  QA_HEADER,
  QA_PROJECTION_HEADER,
  QA_SCENARIO_HEADER,
  QA_SOURCE_HEADER,
  escapeHtml,
  normalizePath,
  writeBody,
} from './httpUtils.mjs'
import { errorResponse } from './response.mjs'
import { routeSyntheticRequest } from './syntheticRoutes.mjs'
import { availableResources } from './traceFixtures.mjs'
import { matchTraceRequestPath, routeTraceRequest } from './traceRoutes.mjs'
import {
  WRITE_SIMULATION_ROUTES,
  WRITE_SIMULATION_SCENARIO,
  WRITE_SIMULATION_SOURCE,
  routeSimulatedWrite,
} from './writeSimulation.mjs'
import { taskStateScenario } from './manifest.mjs'

export {
  QA_CAPTURED_QUERY_HEADER,
  QA_FIXTURE_HEADER,
  QA_HEADER,
  QA_PROJECTION_HEADER,
  QA_SCENARIO_HEADER,
  QA_SOURCE_HEADER,
} from './httpUtils.mjs'

function writeResponse(res, method, response) {
  if (res.destroyed || res.writableEnded) return
  const headers = {
    [QA_SOURCE_HEADER]: response.source,
    ...(response.scenario ? { [QA_SCENARIO_HEADER]: response.scenario } : {}),
    ...(response.fixture ? { [QA_FIXTURE_HEADER]: response.fixture } : {}),
    ...(response.capturedQuery ? { [QA_CAPTURED_QUERY_HEADER]: response.capturedQuery } : {}),
    ...(response.projection ? { [QA_PROJECTION_HEADER]: response.projection } : {}),
  }
  writeBody(res, method, response.status, response.body, headers)
}

/** Read a small JSON request body for the opt-in write simulation only. */
function readJsonBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error(`request body exceeds ${limit} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (cause) {
        reject(cause)
      }
    })
    req.on('error', reject)
  })
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @param {object} options
 * @param {{ jobs: Map<string, any> }} options.registry Output of `loadTraceRegistry`.
 * @param {any} options.synthetic Parsed `fixtures/synthetic/base.json`.
 * @param {ReturnType<import('./graphScenario.mjs').loadGraphScenario> | null} [options.graphScenario]
 * @param {{ id: string, label: string, jobId: string, flowId: string, landing: string, note: string, fixture: string } | null} [options.graphScenarioMeta]
 * @param {string | (() => string)} [options.appOrigin] Vite origin used for links in the QA index.
 * @param {boolean} [options.simulateWrites] Explicit opt-in to labelled, non-persistent write answers.
 * @param {number} [options.simulateLongWaitMs] Delay used by the material-GC long-wait selector.
 * @param {(line: string) => void} [options.logger]
 */
export function createQaServer({
  registry,
  synthetic,
  graphScenario = null,
  graphScenarioMeta = null,
  appOrigin = 'http://localhost:5173',
  simulateWrites = false,
  simulateLongWaitMs = 12_000,
  logger = () => {},
}) {
  const knownJobs = [...registry.jobs.keys()]
  const resolveAppOrigin = typeof appOrigin === 'function' ? appOrigin : () => appOrigin
  const longWaitMs = Number.isFinite(simulateLongWaitMs) && simulateLongWaitMs > 0
    ? simulateLongWaitMs
    : 0

  /** @type {import('node:http').Server} */
  const server = createServer((req, res) => {
    const startedAt = Date.now()
    res.on('finish', () => {
      logger(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - startedAt}ms)`)
    })
    handle(req, res).catch(cause => {
      logger(`internal error: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`)
      if (!res.headersSent && !res.destroyed) {
        writeResponse(res, req.method ?? 'GET', errorResponse({
          status: 500,
          source: 'error',
          code: 'qa_internal_error',
          message: '本地夹具服务处理请求时失败。',
          detail: cause instanceof Error ? cause.message : String(cause),
        }))
      } else {
        res.end()
      }
    })
  })

  server.on('listening', () => {
    const address = server.address()
    logger(`[qa] fixture API listening on http://127.0.0.1:${address && typeof address === 'object' ? address.port : '?'}`)
  })

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = normalizePath(url.pathname)
    const referer = req.headers.referer
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const host = (req.headers.host ?? '').toLowerCase()
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])

    // DNS-rebinding guard: the fixture server must only answer its own loopback names.
    if (!allowedHosts.has(host)) {
      return writeResponse(res, method, errorResponse({
        status: 403,
        source: 'error',
        code: 'qa_loopback_only',
        message: '本地夹具服务仅响应 127.0.0.1 / localhost。',
        detail: `收到的 Host：${host || '（无）'}`,
      }))
    }

    if (method !== 'GET' && method !== 'HEAD') {
      if (simulateWrites && method === 'POST') {
        let body = null
        try {
          body = await readJsonBody(req)
        } catch (cause) {
          return writeResponse(res, method, errorResponse({
            status: 400,
            source: WRITE_SIMULATION_SOURCE,
            code: 'BadRequest',
            message: '无法读取写入模拟所需的 JSON 请求体。',
            detail: cause instanceof Error ? cause.message : String(cause),
            scenario: WRITE_SIMULATION_SCENARIO,
          }))
        }
        const simulated = routeSimulatedWrite({
          method,
          path,
          query: url.searchParams,
          body,
          longWaitMs,
        })
        if (simulated) {
          if (simulated.delayMs && simulated.delayMs > 0) await delay(simulated.delayMs)
          return writeResponse(res, method, simulated.response)
        }
      }
      return writeResponse(res, method, errorResponse({
        status: 501,
        source: 'read-only',
        code: 'qa_read_only',
        message: simulateWrites
          ? '该写接口不在显式夹具模拟范围内；未更改任何状态。'
          : '本地夹具服务为只读模式，未实现写接口。',
        detail: `${method} ${url.pathname} 已拒绝，未触碰任何状态。`,
      }))
    }

    if (path === '/qa' || path === '/qa/') return sendIndex(res, method, url)
    if (path === '/qa/health') return sendHealth(res, method)

    const traceMatch = matchTraceRequestPath(path)
    if (traceMatch) {
      if (graphScenario && traceMatch.jobId === graphScenario.jobId) {
        const graphTrace = routeGraphTraceRequest({
          graphScenario,
          scenarioMeta: graphScenarioMeta,
          resource: traceMatch.resource,
          query: url.searchParams,
        })
        if (graphTrace) return writeResponse(res, method, graphTrace)
      }
      return writeResponse(res, method, routeTraceRequest({
        registry,
        jobId: traceMatch.jobId,
        resource: traceMatch.resource,
        query: url.searchParams,
        referer,
      }))
    }

    const graphMatch = matchGraphRequestPath(path)
    if (graphMatch) {
      if (graphMatch.kind === 'jobGraph') {
        return writeResponse(res, method, routeJobGraphRequest({
          graphScenario,
          scenarioMeta: graphScenarioMeta,
          registry,
          synthetic,
          jobId: graphMatch.subject,
          query: url.searchParams,
        }))
      }
      return writeResponse(res, method, routeFlowGraphRequest({
        graphScenario,
        scenarioMeta: graphScenarioMeta,
        flowId: graphMatch.subject,
        query: url.searchParams,
      }))
    }

    return writeResponse(res, method, routeSyntheticRequest({
      synthetic,
      registry,
      path,
      query: url.searchParams,
      referer,
    }))
  }

  function sendHealth(res, method) {
    const graphInventory = graphScenario && graphScenarioMeta
      ? [{
          id: graphScenarioMeta.id,
          label: graphScenarioMeta.label,
          jobId: graphScenario.jobId,
          flowId: graphScenario.flowId,
          landing: graphScenarioMeta.landing,
          fixture: graphScenarioMeta.fixture,
          note: graphScenarioMeta.note,
          streams: GRAPH_STREAMS.map(stream => ({
            name: stream,
            pages: graphScenario.streams[stream].pages.length,
            pageCap: graphScenario.streams[stream].pageCap,
            mutableSource: graphScenario.streams[stream].mutableSource,
          })),
          flowPages: graphScenario.flow.pages.length,
          flowPageCap: graphScenario.flow.pageCap,
        }]
      : []

    writeBody(res, method, 200, {
      ok: true,
      mode: simulateWrites ? 'fixtures+write-simulation' : 'fixtures',
      liveBackend: false,
      jobs: knownJobs,
      scenarios: [...registry.jobs.values()].flatMap(entry =>
        [...entry.views.values()].map(view => ({
          id: view.id,
          label: view.label,
          jobId: entry.jobId,
          landing: view.landing,
          resources: availableResources(view),
        })),
      ),
      taskFixtures: [taskStateScenario],
      graphs: graphInventory,
      writeSimulation: {
        enabled: simulateWrites,
        source: WRITE_SIMULATION_SOURCE,
        scenario: WRITE_SIMULATION_SCENARIO,
        longWaitMs: simulateWrites ? longWaitMs : null,
        routes: simulateWrites ? WRITE_SIMULATION_ROUTES : [],
        note: simulateWrites
          ? 'Isolated QA write simulation: labelled synthetic answers, no fixture state changes, and no completion is claimed.'
          : 'Disabled. Every write route answers 501 qa_read_only.',
      },
    }, { [QA_SOURCE_HEADER]: 'meta' })
  }

  function sendIndex(res, method, url) {
    const appBase = resolveAppOrigin().replace(/\/+$/, '')
    const scenarioRows = [...registry.jobs.values()].flatMap(entry =>
      [...entry.views.values()].map(view => {
        const resources = availableResources(view).join(', ')
        const href = `${appBase}${view.landing ?? `/executions/${entry.jobId}`}`
        return `<tr>
          <td><code>${escapeHtml(view.id)}</code><br><span>${escapeHtml(view.label ?? '')}</span></td>
          <td><code>${escapeHtml(entry.jobId)}</code></td>
          <td>${escapeHtml(resources)}</td>
          <td><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></td>
        </tr>`
      }),
    ).join('\n')

    const graphRow = graphScenario && graphScenarioMeta
      ? `<tr>
          <td><code>${escapeHtml(graphScenarioMeta.id)}</code><br><span>${escapeHtml(graphScenarioMeta.label)}</span></td>
          <td><code>${escapeHtml(graphScenario.jobId)}</code><br><span>流程 <code>${escapeHtml(graphScenario.flowId)}</code></span></td>
          <td>委托图：${GRAPH_STREAMS.map(stream =>
            `${escapeHtml(stream)}（${graphScenario.streams[stream].pages.length} 页）`).join('、')}
            · 流程：${graphScenario.flow.pages.length} 页</td>
          <td><a href="${escapeHtml(`${appBase}${graphScenarioMeta.landing}`)}">${escapeHtml(`${appBase}${graphScenarioMeta.landing}`)}</a>
            <br><span>直接打开执行图视图并读取合成数据。</span></td>
        </tr>`
      : ''

    const taskRow = `<tr>
      <td><code>${escapeHtml(taskStateScenario.id)}</code><br><span>${escapeHtml(taskStateScenario.label)}</span></td>
      <td><code>${escapeHtml(taskStateScenario.jobId)}</code></td>
      <td>委托/任务夹具：23 条合成任务，taskIdsComplete=false，包含长时间运行状态</td>
      <td><a href="${escapeHtml(`${appBase}${taskStateScenario.landing}`)}">${escapeHtml(`${appBase}${taskStateScenario.landing}`)}</a></td>
    </tr>`

    const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>ChordPanel 本地夹具</title>
<style>
  body { font: 14px/1.6 -apple-system, system-ui, sans-serif; margin: 32px; color: #1d1d1f; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .warn { border: 1px solid #c99700; background: #fff8e1; padding: 10px 12px; border-radius: 8px; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e5ea; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6e6e73; }
  code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  p { max-width: 78ch; }
</style>
</head>
<body>
<h1>ChordPanel 本地夹具 API</h1>
<p>仅限本机访问的夹具服务 · <code>${escapeHtml(url.origin)}</code></p>
<div class="warn">
  <strong>本地夹具 · 非真实后端</strong><br>
  Trace 录制从 <code>tests/fixtures/observability/</code> 原样回放。合成摘要和分片视图均逐行标注；
  标签生成 4/3/1 的分片状态是静态界面夹具，不代表真实并发或后端事实。挑战动画视图复用完全相同的
  录制观测、关系与协议包，只有摘要界面上下文和委托详情状态是合成的。委托/流程执行图是人工编写的
  合成展示数据，不是抓包结果。非遥测路由返回合成界面数据。${simulateWrites
    ? '写入模拟已开启：列出的 POST 路由返回带标记的合成受理/拒绝结果，不更改夹具状态，也不声称执行完成。'
    : '默认只读，写接口返回 <code>501 qa_read_only</code>。'}
  本服务不会连接 ChordAuditMatrix。
</div>
<table>
  <thead><tr><th>场景</th><th>委托</th><th>可用夹具数据</th><th>页面</th></tr></thead>
  <tbody>${scenarioRows}${graphRow}${taskRow}</tbody>
</table>
<p>机器可读清单：<a href="/qa/health"><code>/qa/health</code></a>。
Trace 响应带 <code>X-ChordPanel-QA-Scenario</code>；备用视图由页面 <code>qaView</code> 来源选择。
每个响应都带 <code>X-ChordPanel-QA</code> 和 <code>X-ChordPanel-QA-Source</code>。</p>
</body>
</html>`

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(html)),
      'Cache-Control': 'no-store',
      [QA_HEADER]: 'fixtures',
      [QA_SOURCE_HEADER]: 'meta',
    })
    if (method === 'HEAD') {
      res.end()
      return
    }
    res.end(html)
  }

  return server
}
