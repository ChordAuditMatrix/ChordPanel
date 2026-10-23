# 本地 Fixture QA（`tests/qa/`）

**用途**：不连真实后端、不污染生产，用一条命令把 ChordPanel 跑在录制轨迹与明确标记的合成视觉态上，供浏览器 QA。

**保证**：Observations、Links、Protocol 和录制 Parts 只回放已记录的 HTTP 交换。`tag-generation-independent-progress` 的 Summary/Parts 是独立的 QA 合成视觉投影，不是后端事实；挑战动效视图只在 Summary 与 Job 详情响应里设置运行态上下文，其 Observations、Links、Protocol 仍逐条使用原始录制。写接口一律 `501`。

---

## 1. 启动

```bash
npm run qa:fixtures                                  # fixture API（随机端口）+ http://localhost:5173
QA_API_PORT=7100 QA_VITE_PORT=5180 npm run qa:fixtures
npm run qa:api                                       # 只启动 fixture API，复用已有 dev server
```

`qa:fixtures` 做的事：先校验录制 fixture（Job 归属、Link↔Packet 关联），再在 `127.0.0.1` 上起 fixture API，最后用 `tests/qa/vite.qa.config.mjs` 启动 Vite，并把 `VITE_DEV_PROXY_TARGET` 指向该 API。终端会打印 QA 索引、清单地址和每个场景的直达链接。

- **页面上的标记**：桌面端位于顶栏右侧；窄屏时位于应用头部上方，并为应用布局预留空间，页面滚动时不遮挡内容。徽标文案为「本地 Fixture · 非实时后端 / Local Fixture · Not live」，DOM 选择器 `[data-chordpanel-qa-badge]`。徽标由 QA Vite 配置注入，只出现在 `qa:fixtures` 下；用 `npm run dev` 直连 fixture API 时没有徽标。
- **QA 索引**：`http://127.0.0.1:<api>/qa`（场景表 + 直达链接）；机器可读清单 `http://127.0.0.1:<api>/qa/health`。
- 环境变量：`QA_API_PORT`（默认 `0`，随机可用端口）、`QA_VITE_PORT`（默认 `5173`）、`QA_APP_ORIGIN`（索引里链接的 app 地址）、`QA_LOG=1`（打印逐请求日志）。

只用已有 dev server 时：

```bash
npm run qa:api                                       # 记下打印的 http://127.0.0.1:<port>
VITE_DEV_PROXY_TARGET=http://127.0.0.1:<port> npm run dev
```

---

## 2. 场景

| 场景 / 视图 id | Job | Trace 资源 | 直达页面 |
| --- | --- | --- | --- |
| `legacy-challenge` | `13c37093-ca9d-4486-b8bd-2e5b27630353` | summary, observations（category=challenge）, protocol（前端录制） | `/executions/13c37093-ca9d-4486-b8bd-2e5b27630353` |
| `exact-challenge` | `6e445de9-26f7-460a-b22d-b937e12d5f81` | observations, links, protocol（Summary 派生信封保持未知） | `/executions/6e445de9-26f7-460a-b22d-b937e12d5f81` |
| `challenge-animation-running` | 同上 | 与 `exact-challenge` 共用相同捕获文件；Summary 只合成 executionKind 与 Running 状态；Job 详情隐藏合成 taskIds，Task API 返回 501 | `/executions/6e445de9-26f7-460a-b22d-b937e12d5f81?qaView=challenge-animation-running` |
| `tag-multipart` | `d6448cc3-04be-4fe8-8097-5a4bdf236b24` | summary, parts（含捕获的 windows） | `/executions/d6448cc3-04be-4fe8-8097-5a4bdf236b24` |
| `tag-generation-independent-progress` | `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`（测试专用 ID） | 合成 Summary + 合成 Parts；无 Task/Window/Observation | `/executions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` |
| `identity-worker` | `371f5280-b7ae-4252-841b-d3365b5dfd4b` | 后端录制的 observations 与 links；Summary 合成 executionKind 与 verifyType，Task API 返回 501 | `/executions/371f5280-b7ae-4252-841b-d3365b5dfd4b` |
| `algorithm-snapshot` | `a9029fd6-f840-48b1-a051-5d3d7a68388b` | summary（含 `algorithmSelection` 不可变快照） | `/executions/a9029fd6-f840-48b1-a051-5d3d7a68388b` |

`challenge-animation-running` 用页面 URL 上的 `qaView` 选择视图；同一页面的 API Referer 让 QA 服务器区分 Summary 和 Job 详情状态。默认 `exact-challenge` 不变，仍返回 `executionKind=null`、`job.status=null`。TagGeneration 合成计数和 Part 状态只用于静态投影，不代表并发或后端进度。

---

## 3. 数据真实性规则

录制文件位于 `tests/fixtures/observability/`，每份代表一个 Job 的真实 HTTP 交换：`request.path/query` + `response.body`。录制资源按原始 `response.body` 回放；新视图不修改这些文件，也不复制出第二套 Observations、Links 或 Protocol。

TagGeneration 的独立进度样本位于 `tests/qa/fixtures/synthetic/tag-generation-independent-progress-parts.json`。它只含 Summary 与 Part 展示数据，Job ID 复用现有测试专用 ID；不提供 Task、Window、Observation、Link 或 Protocol。Summary 的 `plannedBlockCount="4"`、`generatedBlockCount="3"`、`storageAccountedTagCount="1"` 是合成十进制字符串；Part 状态是静态 UI 投影，不是实时并发。`/tasks` 返回 501。

允许的录制资源投影会写进 `X-ChordPanel-QA-Projection`：

| 投影 | 触发条件 | 做什么 |
| --- | --- | --- |
| 分页 | parts/links 的 `page` / `pageSize` | 在已捕获行上切片，`total` 沿用录制值 |
| 过滤 | links 的 `nodeId`、protocol 的 `messageTypes` | 只筛已捕获行，不补行 |
| `windows-omitted` | 捕获的 parts 且未传 `includeWindows=true` | 按契约省略 `windows` 字段（不是置空） |

明确拒绝（不会用空页面冒充“没有数据”）：

- **未捕获资源** → `501 trace_resource_not_captured`，`detail` 列出该 Job 已有资源。
- **未知 Job** → `404 job_not_found`。
- **录制之外的分页/游标** → `501 trace_page_not_captured` / `501 trace_cursor_not_captured`。
- **录制时已过滤的集合不接受另一个过滤值** → `501 trace_filter_not_captured`。

### 派生 Summary（仅 QA）

`6e44` 默认没有 Summary；`exact-challenge` 仍返回所有未知字段为 `null` 的信封。`challenge-animation-running` 是独立的合成视觉视图，Summary 只把 `executionKind` 设为 `challengeProof`、`job.status` 设为 `Running`；cryptographic verdict、references、计数和 coverage 仍为 unknown。这个视图的 `GET /api/v1/jobs/6e445de9-26f7-460a-b22d-b937e12d5f81` 也返回 `status=Running`，把结束时间和总耗时设为 unknown，只保留 Pending/Running 的合成历史项，并隐藏合成 `taskIds`；`/tasks` 返回 501。默认视图和 Jobs 列表的合成记录不变。`X-ChordPanel-QA-Scenario` 会标记视图；Observations、Links、Protocol 仍引用完全相同的后端录制文件，不增删任何路径、箭头或事件。

身份场景 `371f` 的 Summary 只额外设置 `executionKind=identityVerification` 与 `references.verifyType=cell`，其它状态、verified、计数与 coverage 保持 unknown。`cell` 只用于视觉/投影验收，不是后端事实；`/tasks` 返回 501。

TagGeneration 场景 `tag-generation-independent-progress` 是完全合成的 Summary/Part 测试态，不修改 `tag-multipart` 的 4/4 捕获数据。两条 Part 分别显示 `2/2/1` 与 `2/1/0`（planned/generated/storage-accounted），合计 `4/3/1`。没有任务、窗口或观测关联；这些 Part 状态不表示真实并发或网络传输。

### 同名文件不合并

两个 checkout 存在同名文件，但属于**不同 Job**：

| 文件名 | 前端 checkout | 后端 checkout |
| --- | --- | --- |
| `challenge-verified-true-summary.json` | Job `13c37093…` | Job `a9029fd6…` |
| `challenge-verified-true-observations.json` | Job `13c37093…` | Job `6e445de9…` |
| `protocol-linked-packets.json` | Job `13c37093…` | Job `6e445de9…` |
| `identity-verified-true-observations.json` | （无） | Job `371f5280…` |

因此后端副本一律带 Job 前缀命名：`challenge-observations-6e445de9.json`、`challenge-links-6e445de9.json`、`protocol-linked-packets-6e445de9.json`、`identity-observations-371f5280.json`、`identity-links-371f5280.json`、`challenge-summary-a9029fd6.json`（字节与后端 fixture 完全一致）。

启动时会校验，任一不符直接拒绝启动：

1. 录制路径里的 Job 与 manifest 声明一致，且路径后缀（`/trace`、`/trace/observations`…）与声明的资源一致；
2. body 里所有 `jobId` / `executionTraceId`（含每个 item）与声明的 Job 一致；
3. 同一场景同时有 links 与 protocol 时，每个 packet 必须能由同 Job、同节点的 `protocolPacket` Link 关联到（`dispatchPacketId === packetId`）；
4. 同一 Job 不能有两个场景，同一文件不能被两个 Job 认领。

---

## 4. 合成数据（非遥测）

`tests/qa/fixtures/synthetic/base.json` 提供 System Status、节点（3 个：1 Audit、2 Storage，含 Draining / Unavailable）、Job、Task、User、Algorithm、AuditTable，以及仅供界面布局检查的已标记范围样本。节点级协议事件没有录制夹具，接口明确返回 501；`tagged-ranges` 响应是合成可视化数据，不是后端录制结果。

- 全部是**合成视觉数据**，不来自任何后端；响应头为 `X-ChordPanel-QA-Source: synthetic`，Job 的 `metadata.qaFixture` 也是 `synthetic`。
- Jobs 列表里 5 个录制 Job 的 **ID 与录制一致**（这样能互相跳转），但状态、所有者、任务、历史等字段仍是合成的。

节点详情的任务数组为空，不携带虚构 `requestId`；其他合成基础数据只用于本地界面布局，不是后端事实。节点级 Protocol Event 路由未捕获，因此不会用空列表冒充“该节点没有事件”。
- 时间戳统一停在 fixture 时刻附近（约 `1792…`），不跟随系统时间，响应因此可复现。

---

## 5. 只读

任何非 `GET`/`HEAD` 请求（任何路径）→ `501 qa_read_only`，不接触任何状态：

- `POST/PATCH/DELETE /v1/users*`
- `POST /v1/algorithms/profiles*`（初始化、注销、绑定、解绑）
- `POST /v1/audit-tables*`（bootstrap / 注册 / 校验 / 退役 / addressing）
- `POST /v1/nodes/{id}/drain|resume`、`POST /v1/jobs/{id}/cancel`
- `POST /v1/identity/*`、`/v1/ownership/*`、`/v1/audit/*`

所以 **Audit / Ownership / Identity** 这类以写为主的页面在 QA 下会弹 501 错误，这是预期行为，不是缺陷。

已实现的 GET 路由（其余 GET 一律 `501 qa_route_not_implemented`）：

```
GET /v1/system/status
GET /v1/nodes
GET /v1/nodes/{nodeId}
GET /v1/jobs
GET /v1/jobs/{jobId}
GET /v1/jobs/{jobId}/tasks
GET /v1/jobs/{jobId}/trace
GET /v1/jobs/{jobId}/trace/observations
GET /v1/jobs/{jobId}/trace/parts
GET /v1/jobs/{jobId}/trace/links
GET /v1/jobs/{jobId}/trace/protocol
GET /v1/users
GET /v1/users/{userId}
GET /v1/algorithms/strategies
GET /v1/algorithms/profiles
GET /v1/algorithms/profiles/{id}/bindings
GET /v1/algorithms/bindings
GET /v1/audit-tables
GET /v1/audit-tables/{tableId}
GET /v1/audit-data/{ownerId}/tagged-ranges
GET /qa
GET /qa/health
```

节点级 `GET /v1/nodes/{nodeId}/protocol-events` 没有录制夹具，固定返回 `501 protocol_events_not_captured`。它与 Job Trace 的 `/trace/protocol` 是不同接口，不能互相替代。

已知未覆盖：`/v1/jobs/aggregate`（501，前端未使用）和 layout-jobs（501）。`tagged-ranges` GET 返回带 `synthetic` 标记的界面夹具，并非后端录制响应；所有写接口仍返回 501。

---

## 6. 响应头

| 头 | 含义 |
| --- | --- |
| `Cache-Control: no-store` | 全部响应 |
| `X-ChordPanel-QA: fixtures` | 全部响应 |
| `X-ChordPanel-QA-Source` | `fixture:frontend` / `fixture:backend` / `derived-summary` / `synthetic-visual-summary` / `synthetic-visual-part` / `synthetic` / `fixture-missing` / `read-only` / `meta` / `error` |
| `X-ChordPanel-QA-Scenario` | 场景/视图 id；challenge-animation-running 视图响应此 ID |
| `X-ChordPanel-QA-Fixture` | 录制文件名 / derived-envelope 视觉上下文 / 合成 Parts 文件路径 |
| `X-ChordPanel-QA-Captured-Query` | 录制时的查询串；`-` 表示无 |
| `X-ChordPanel-QA-Projection` | `verbatim` / `captured-filter=…` / `windows-omitted` / `filter=…` / `repaged` / `qa-derived-null-fields` / `qa-derived-synthetic-identity-scope` / `qa-derived-synthetic-challenge-running` / `qa-derived-synthetic-tag-generation-progress` / `qa-synthetic-static-part` / `synthetic-visual` |

错误体沿用前端契约：`{ "error": "<code>", "message": "...", "detail": "..." }`。

---

## 7. 新增一个录制

1. 把真实 HTTP 录制原样放进 `tests/fixtures/observability/`；后端副本改名为 `<resource>-<jobId前8位>.json`，绝不覆盖另一个 Job 的同名文件。
2. 在 `manifest.mjs` 增加一个 Job 场景。需要同一 Job 的另一种 QA 视觉状态时，用 alternate `views` 复用原捕获，不注册第二个 Job。
3. 明确合成视觉数据时，放在 `tests/qa/fixtures/synthetic/`，通过 `syntheticFile` 或 derived Summary 上下文注册，并在场景 note 中说明；不得把它放进 observability 录制目录。
4. 启动时会校验 Job/resource 归属和 Link↔Packet 关联；未捕获资源保持 501。
5. 一个 Job 只注册一个后端录制 Summary。需要合成视觉上下文时，用 alternate view 的 derived Summary；`d6448` 的第二份录制 Summary 因此未注册。

---

## 8. 测试

```bash
node --test tests/qa/qaServer.test.mjs
```

覆盖：manifest/Job 归属校验（含跨 Job 混用、Link↔Packet 断链）、alternate view、派生 Summary 的 unknown 边界、合成 TagGeneration 4/3/1 总和与无 Task/Window/关联 ID、挑战视图只改变两项 Summary 上下文且 Job API 状态一致、SHA-256 锁定的 Observation/Link/Protocol 录制字节和逐项 body parity、404/501、分页投影、只读写接口、Host 限制和 QA inventory。
