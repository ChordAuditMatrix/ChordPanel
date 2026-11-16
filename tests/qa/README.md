# Local Fixture QA (`tests/qa/`)

**Purpose:** Run ChordPanel against recorded traces and clearly labeled synthetic visual states with one command. No live backend or production data is used.

**Guarantees:** For recorded Jobs, Observations, Links, Protocol events, and recorded Parts replay captured HTTP exchanges. The `tag-generation-independent-progress` Summary/Parts pair is a separate QA-only projection, not backend evidence. The `job-graph-multipage` Job/flow graph is hand-authored synthetic display data: the backend documents that no graph response was ever captured and that a graph fixture must not be written by hand, so these routes never replay a recording; its Trace protocol page is an explicitly empty synthetic page, not a capture. The `task-state-incomplete` Job and its 23 Tasks are synthetic Job/Task rows. The challenge-animation view adds running context only to the Summary and Job-detail responses; its Observations, Links, and Protocol events remain unchanged recordings. By default every write route returns `501`; an explicit, labelled write simulation can be enabled for the documented POST routes without changing fixture state.

---

## 1. Start

```bash
npm run qa:fixtures                                  # Fixture API (random port) + Vite at http://localhost:5173
QA_API_PORT=7100 QA_VITE_PORT=5180 npm run qa:fixtures
npm run qa:api                                       # Start only the fixture API; reuse an existing dev server
QA_SIMULATE_WRITES=1 npm run qa:fixtures             # Explicit write simulation (see §5)
npm run qa:fixtures -- --simulate-writes             # Same opt-in through the CLI flag
```

`qa:fixtures` validates recorded fixtures first, including Job ownership and Link-to-Packet joins. It then starts the fixture API on `127.0.0.1`, starts Vite with `tests/qa/vite.qa.config.mjs`, and points `VITE_DEV_PROXY_TARGET` at the API. The terminal prints the QA index, inventory URL, and direct links for each scenario.

- **Page badge:** On desktop, it appears at the top right. On narrow screens, it sits above the app header and reserves layout space so scrolling content is not covered. The text is `本地夹具 · 非真实后端`, with a `夹具首页` link; its DOM selector is `[data-chordpanel-qa-badge]`. The QA index page is also Chinese (`本地夹具 · 非真实后端` warning) while keeping protocol fields and fixture IDs in their exact form. The QA Vite config injects it only for `qa:fixtures`; running `npm run dev` against the fixture API does not show it.
- **QA index:** `http://127.0.0.1:<api>/qa` lists scenarios and direct links, including the synthetic graph scenario and the Task-state Job. The machine-readable inventory is at `http://127.0.0.1:<api>/qa/health`; graph pages are listed under `graphs` with their stream page counts, and `taskFixtures` / `writeSimulation` state the task fixture and whether the write simulation is on.
- **Environment variables:** `QA_API_PORT` (default `0`, choose an available port), `QA_VITE_PORT` (default `5173`), `QA_APP_ORIGIN` (app URL used in index links), `QA_LOG=1` (print per-request logs), `QA_SIMULATE_WRITES=1` (enable the isolated write simulation), and `QA_SIMULATE_LONG_WAIT_MS` (long-wait delay, default `12000`).

To use an existing dev server:

```bash
npm run qa:api                                       # Note the printed http://127.0.0.1:<port>
VITE_DEV_PROXY_TARGET=http://127.0.0.1:<port> npm run dev
```

---

## 2. Scenarios

| Scenario / view ID | Job | Fixture data | Direct page |
| --- | --- | --- | --- |
| `legacy-challenge` | `13c37093-ca9d-4486-b8bd-2e5b27630353` | Summary, challenge-category Observations, frontend-recorded Protocol | `/executions/13c37093-ca9d-4486-b8bd-2e5b27630353` |
| `exact-challenge` | `6e445de9-26f7-460a-b22d-b937e12d5f81` | Observations, Links, Protocol; unknown fields in the derived Summary envelope remain unknown | `/executions/6e445de9-26f7-460a-b22d-b937e12d5f81` |
| `challenge-animation-running` | Same Job as above | Reuses the same captured resources; only Summary execution kind and Job status are synthetic. Job details omit synthetic task IDs; Tasks returns 501. | `/executions/6e445de9-26f7-460a-b22d-b937e12d5f81?qaView=challenge-animation-running` |
| `tag-multipart` | `d6448cc3-04be-4fe8-8097-5a4bdf236b24` | Summary and Parts, including captured Window state | `/executions/d6448cc3-04be-4fe8-8097-5a4bdf236b24` |
| `tag-generation-independent-progress` | `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` (test-only ID) | Synthetic Summary and Parts; no Tasks, Windows, or Observations | `/executions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` |
| `identity-worker` | `371f5280-b7ae-4252-841b-d3365b5dfd4b` | Backend-recorded Observations and Links; Summary execution kind and verification scope are synthetic; Tasks returns 501 | `/executions/371f5280-b7ae-4252-841b-d3365b5dfd4b` |
| `identity-worker-summary-preview` | Same Job as above | Reuses the recorded Observations and Links; adds an explicitly synthetic Summary and Succeeded Job status with Worker-stage coverage, named user references, root-hash presence and display-only Job metadata. `verified` stays unknown. | `/executions/371f5280-b7ae-4252-841b-d3365b5dfd4b?qaView=identity-worker-summary-preview` |
| `algorithm-snapshot` | `a9029fd6-f840-48b1-a051-5d3d7a68388b` | Summary with the immutable `algorithmSelection` snapshot | `/executions/a9029fd6-f840-48b1-a051-5d3d7a68388b` |
| `job-graph-multipage` | `77777777-7777-4777-8777-777777777777` (test-only ID) | Hand-authored synthetic Job graph (6 streams, 1–3 pages each) and a 3-page flow listing; no recorded resource | `/executions/77777777-7777-4777-8777-777777777777?graph=1` (opens the Execution graph view and loads it) |
| `task-state-incomplete` | `88888888-8888-4888-8888-888888888888` (test-only ID) | Synthetic Job/Task rows: Running with no completion time, `taskIdsComplete=false`, 20 stored IDs for 23 Task rows across three pages | `/jobs?jobId=88888888-8888-4888-8888-888888888888` |

The `task-state-incomplete` Job is a page-level Task fixture, not telemetry: two Tasks are still Running with no `completedAtMs`, one is Pending, one is Accepted, one is Cancelled and two are Failed. The stored `taskIds` list names only 20 of the 23 rows, so the Job detail warning and the Task table pagination can be checked together. It never claims that the Job or a Task completed.

The `job-graph-multipage` scenario is not selected by `qaView`: both graph panels are read on demand from the Execution graph view, so a direct page URL starts with no graph request. The QA index and the `?graph=1` landing link open the graph view and read its first page instead. Its Job detail carries the synthetic `flowId`, which is what makes the flow panel appear.

The `challenge-animation-running` view is selected by the `qaView` query parameter. The page's API Referer lets the QA server distinguish Summary and Job-detail responses. The default `exact-challenge` view is unchanged and continues to return `executionKind=null` and `job.status=null`. Synthetic TagGeneration counts and Part states are static projections, not backend progress or concurrency.

The `identity-worker-summary-preview` view reuses the exact backend-recorded Identity Observations and Links. Its Summary context, Succeeded Job status, user names, coverage, and Job metadata root-hash value are synthetic visual data; the verification verdict stays unknown. Use it to check that the Worker-stage Observation Coverage row appears when data exists, then use the default `identity-worker` view to check that the row stays hidden when coverage is absent.

---

## 3. Data authenticity

Recorded files live under `tests/fixtures/observability/`. Each file represents one Job's HTTP exchange: `request.path/query` plus `response.body`. Recorded resources replay the original response body. Views do not edit these files or create a second set of Observations, Links, or Protocol events.

The synthetic graph scenario lives at `tests/qa/fixtures/synthetic/trace-graph-scenario.json`. It is not an HTTP exchange: the loader refuses any file that contains a `request` or `response` key, and every response carries `X-ChordPanel-QA-Source: synthetic` plus `X-ChordPanel-QA-Scenario: job-graph-multipage`. It does not claim to be backend graph evidence and does not fill any backend fixture gap.

The independent TagGeneration sample lives at `tests/qa/fixtures/synthetic/tag-generation-independent-progress-parts.json`. It contains only Summary and Part display data and reuses a test-only Job ID. It contains no Task, Window, Observation, Link, or Protocol data. The Summary counts `plannedBlockCount="4"`, `generatedBlockCount="3"`, and `storageAccountedTagCount="1"` are synthetic decimal strings. Part states are static UI projections, not live concurrency. `/tasks` returns 501.

Allowed projections of captured resources are marked in `X-ChordPanel-QA-Projection`:

| Projection | Trigger | Behavior |
| --- | --- | --- |
| Pagination | `page` / `pageSize` on Parts or Links | Slice captured rows; retain the recorded `total`. |
| Filtering | `nodeId` on Links or `messageTypes` on Protocol | Filter captured rows only; do not add rows. |
| `windows-omitted` | Captured Parts without `includeWindows=true` | Omit the `windows` field as required by the contract; do not replace it with an empty array. |
| `synthetic-graph+qa-bound-cap` | Job graph page | Serve the authored synthetic page for each stream. The authored page cap (2) is applied instead of the requested bound so an ordinary `pageSize=200` session still pages; the applied bound is reported in `streams.<name>.pageSize`. |
| `synthetic-flow-graph+qa-bound-cap` | Flow graph page | Same rule for the flow's Job-node listing. |

Uncaptured data is reported explicitly; an empty page is used only when the response itself states that the scope has no available records:

- **Uncaptured resource** → `501 trace_resource_not_captured`; `detail` lists the resources available for that Job. The synthetic graph Job's protocol page is the sole authored exception: it returns an explicit empty page whose coverage states the protocol scope is not instrumented, not a recording with zero packets.
- **Unknown Job** → `404 job_not_found`.
- **Uncaptured page or cursor** → `501 trace_page_not_captured` or `501 trace_cursor_not_captured`.
- **A recorded filtered collection queried with another filter value** → `501 trace_filter_not_captured`.
- **A recorded Job graph** → `501 trace_resource_not_captured`; graph pages exist only for the synthetic scenario.
- **A malformed/tampered/re-bound graph cursor** → `400 trace_cursor_invalid`; **an out-of-range graph bound** → `400 trace_page_size_invalid`. The QA route never clamps or silently rebinds them.

### Graph routes (synthetic only)

`GET /v1/jobs/{jobId}/trace/graph` and `GET /v1/flows/{flowId}/trace/graph` answer only the synthetic scenario Job `77777777-7777-4777-8777-777777777777` and its flow `f10a0000-0000-4000-8000-000000000001`. Any other Job answers `501 trace_resource_not_captured`, and an unknown Job/flow answers `404 job_not_found` / `404 flow_not_found`. The backend states that a graph fixture must come from a real capture, so no recorded Job is served here.

The app renders those two answers as an explicit **not provided** panel, not as an empty graph: the Chinese explanation and the QA demo entry stay visible, while the backend `message`/`detail` are kept in a default-collapsed **原始错误详情** section as verbatim diagnostic evidence. The panel never adds rows. In a QA run only, the panel also shows a demo entry to the synthetic `777…777` graph (the same entry the QA index uses); a normal dev or production page has no such test-only Job link. Other recorded Jobs and the sibling Jobs of the synthetic flow reach this state by pressing the page's **执行图** button, because every execution page offers the graph view while only the synthetic scenario has graph data.

The authored scenario is a display fixture for UI states, not a claim about backend data:

- **Explicitly empty protocol page.** `GET /v1/jobs/777…777/trace/protocol` answers `200` with `items=[]`, `coverage=notInstrumented` and `reasons=["ProtocolPacketUnavailable"]`, because the scenario authors no protocol packet records. The Summary repeats the same protocol coverage and reason. The page states that the scope has no available records; it is not a captured recording and does not claim that no communication happened.
- **Six independent streams.** `tasks` (3 pages), `parts` (2), `observations` (2), `activities` (3), `edges` (1) and `triggers` (2). Each response carries a first page of every stream; a cursor parameter continues only its own stream. `streams.<name>.pageSize` reports the applied bound, `returned` and `hasMore` are decimal strings, and `hasMore=false` still carries a `nextCursor` position after the last row.
- **Page cap.** The authored page cap is `2` (the `edges` stream has one page of 3 rows), so a browser session that requests the documented `pageSize=200` still walks several pages. The cap is disclosed in every `streams.<name>.pageSize` and in `X-ChordPanel-QA-Projection`; the route never hides an applied bound.
- **Cursor rules.** Tokens are versioned, checksummed and bound to the path subject, the stream, the applied bound and the page position. A token from another stream, a tampered token, a malformed token and a cursor sent with a different resolving bound all answer `400 trace_cursor_invalid`; a bound outside `[1, 200]` answers `400 trace_page_size_invalid`. Neither is clamped or silently restarted.
- **Incomplete coverage.** Page 1 reports `coverage.tasks=partial`, `coverage.observations=partial`, `coverage.activities=partial`, `coverage.triggers=partial`, `coverage.parts=complete` and `coverage.edges=complete`, with the deduplicated reason `SourceRecordUnavailable`. The Task stream stays partial on its later pages because it contains an empty reference, a foreign Task row, a missing Task row and an unattributed row; no stream is presented as complete by inventing rows.
- **Missing Task rows and unknown stop.** Task references 3 and 4 state `statusState=missingRow` and `unattributedRow` with `status=null`. Reference 0 is a Running Task with `remoteStopStatus=unknown` and no `completedAtMs`, so the Job is still Running and cannot prove a remote stop.
- **Activity across pages.** `act-layout-1` appears on two Activity pages with the facts of each page only: page 1 says `started` with `observationCount="2"`, page 2 says `succeeded` with `observationCount="1"`. The pages are never merged into one span state, matching the documented "page proves only its own facts" behavior. Page 2 also introduces `act-dispatch-1` with a `jobOnly` parent.
- **Conflicting and orphaned activities.** Page 3 carries `act-conflict-1` with `conflicting=true`, `lifecycle=null`, `state=null` and `parentState=conflicting`, plus its `partial` derived edge; the UI must show conflicting evidence instead of inventing a state. `act-orphan-1` names `task:…009`, which no Task page returns, so its derived relation stays unresolved (endpoint not loaded).
- **Unresolved relations.** Link `77777777:link:0003` has `to=null` (the backend recorded no target identity) and is listed as unresolved, never drawn with a guessed endpoint. Part page 2 references `task:…003` (loaded as a missing-row Task) and `task:…009` (not loaded), so a persisted Part→Task relation can also remain unresolved until its endpoint appears.
- **Trigger retry.** Notification `qa-notification-retry` is retried: page 1 carries attempt 1 with `currentAttempt=false`, page 2 carries attempt 2 with `currentAttempt=true`; a second notification, `qa-notification-dispatch`, is current. This is the post-retry projection a mutable-stream re-read returns, not two reads at different times.
- **Flow listing.** Three pages with 2/2/1 Job nodes. `parentEdges` contain only relations whose two ends are in the same page: page 1 has `777…777 → 777…778`, page 2 has `777…779 → 777…77a`, and page 3 has none because its parent lives on page 2. `coverage` is `partial` with `SourceRecordUnavailable` while pages remain, and `complete` on the last page. The response has no total.
- **Synthetic marker.** Graph bodies carry `qaSyntheticGraph: true`; the source header is always `synthetic`, and the scenario header is `job-graph-multipage`. `/qa/health` lists the scenario under `graphs` with its stream page counts.

### Derived summaries (QA only)

The `6e44` Job has no captured Summary. `exact-challenge` returns a derived envelope whose unspecified fields remain `null`. `challenge-animation-running` is a separate synthetic visual view: it sets only `executionKind=challengeProof` and `job.status=Running`; verdict, references, counts, and coverage remain unknown. Its `GET /api/v1/jobs/6e445de9-26f7-460a-b22d-b937e12d5f81` response also reports `Running`, keeps end time and duration unknown, includes only synthetic Pending/Running history, and omits synthetic `taskIds`; `/tasks` returns 501. The default view and synthetic Jobs-list record remain unchanged. `X-ChordPanel-QA-Scenario` identifies the view. Observations, Links, and Protocol still use the exact same backend recordings; no paths, arrows, or events are added or removed.

The `371f` Summary adds only `executionKind=identityVerification` and `references.verifyType=cell`; status, `verified`, counts, and coverage remain unknown. The `cell` scope is synthetic visual context, not backend evidence. `/tasks` returns 501.

The `identity-worker-summary-preview` view is an explicit display fixture: it adds `coverage.workerStages=complete`, owner and initiator references, matching root-hash presence/counts, `_rootHash` metadata, and a Succeeded Job status. These values are marked synthetic by the scenario and response headers; the captured Observation and Link files remain unchanged, and `references.verified` remains `null`.

The `tag-generation-independent-progress` scenario uses a fully synthetic Summary/Part view and does not change the captured 4/4 data in `tag-multipart`. Its two Parts display `2/2/1` and `2/1/0` (planned/generated/storage-accounted), totaling `4/3/1`. No Task, Window, or Observation is linked to these Parts; their state does not represent live concurrency or network traffic.

### Same filenames are not interchangeable

Two checkouts contain files with the same name, but those files belong to **different Jobs**:

| Filename | Frontend checkout | Backend checkout |
| --- | --- | --- |
| `challenge-verified-true-summary.json` | Job `13c37093…` | Job `a9029fd6…` |
| `challenge-verified-true-observations.json` | Job `13c37093…` | Job `6e445de9…` |
| `protocol-linked-packets.json` | Job `13c37093…` | Job `6e445de9…` |
| `identity-verified-true-observations.json` | None | Job `371f5280…` |

Backend copies use a Job-ID prefix and must never overwrite another Job's same-named file: `challenge-observations-6e445de9.json`, `challenge-links-6e445de9.json`, `protocol-linked-packets-6e445de9.json`, `identity-observations-371f5280.json`, `identity-links-371f5280.json`, and `challenge-summary-a9029fd6.json`. Their bytes must match the backend fixtures exactly.

Startup validates each fixture and refuses to run if any check fails:

1. The Job in each recorded path matches the manifest, and the path suffix (`/trace`, `/trace/observations`, etc.) matches the declared resource.
2. Every `jobId` and `executionTraceId` in the body, including each item, matches the declared Job.
3. When a scenario has both Links and Protocol, each packet must join through a `protocolPacket` Link from the same Job and node (`dispatchPacketId === packetId`).
4. A Job may have only one scenario, and a file may belong to only one Job.

---

## 4. Synthetic data (not telemetry)

`tests/qa/fixtures/synthetic/base.json` provides System Status, Nodes (three: one Audit and two Storage, including Draining / Unavailable), Jobs, Tasks, Users, Algorithms, AuditTables, and a tagged-range sample for layout checks only. It also carries the five synthetic Jobs of the graph flow (`77777777-…-777777777777` to `…77b`, all with the same synthetic `flowId` and `parentJobId` links) so every node of the flow listing opens a QA Job page. Node-level protocol events have no captured fixture and return 501. The `tagged-ranges` response is synthetic visual data, not a backend recording.

- All values are **synthetic visual data**, not backend data. Responses include `X-ChordPanel-QA-Source: synthetic`, and Job `metadata.qaFixture` is also `synthetic`.
- The five recorded Jobs in the Jobs list keep their **recorded IDs** so links work, but status, owners, tasks, history, and other fields remain synthetic.
- The Task-state Job `88888888-…-888888888888` is synthetic and long-running on purpose. Its `taskIdsComplete=false` states that the stored list is only a lower bound, and its 23 Task rows include Running rows without a completion time. The Task table pages at 10 rows even though the Job names only 20 IDs; no row is marked completed on the Job's behalf.

Node details contain no Tasks and no invented `requestId`. The QA Job `33333333-3333-4333-8333-333333333333` uses an algorithm ID only to test current-catalog name display; its status message, metadata, and Task results are synthetic samples, not backend records. Other synthetic base data is only for local layout checks. Node-level Protocol Event requests are uncaptured, so the server does not use an empty list to imply that the node has no events.

Timestamps stay near the fixture time (around `1792…`) and do not follow the system clock, so responses are reproducible.

---

## 5. Read-only behavior

By default, every request other than `GET` and `HEAD` returns `501 qa_read_only` without changing state:

- `POST/PATCH/DELETE /v1/users*`
- `POST /v1/algorithms/profiles*` (initialize, deinitialize, bind, unbind)
- `POST /v1/audit-tables*` (bootstrap / register / validate / retire / addressing)
- `POST /v1/nodes/{id}/drain|resume`, `POST /v1/jobs/{id}/cancel`
- `POST /v1/identity/*`, `/v1/ownership/*`, `/v1/audit/*`

Write-heavy pages such as Audit, Ownership, and Identity may show a 501 error in QA. This is expected behavior, not a defect.

### Opt-in write simulation

Start with `QA_SIMULATE_WRITES=1` or `--simulate-writes` only when a task walkthrough needs the new operation forms to answer. This mode is isolated and labelled, never changes fixture state, and never claims that an operation completed:

- Every simulated response carries `X-ChordPanel-QA-Source: synthetic-write-simulation`, `X-ChordPanel-QA-Scenario: task-write-simulation`, and `qaSimulatedWrite: true`.
- Accepted maintenance, source-change and re-arm answers are `202` (or the documented accepted status) and point at the synthetic **Pending** Jobs in `base.json`. Nothing is marked Succeeded; source-change returns a dispatch `jobId`/`statusUrl`, and re-arm still needs a separate GC pass.
- A GC pass returns only the bounded report authored by the selector. The long-wait selector delays `QA_SIMULATE_LONG_WAIT_MS` (default `12000`) and reports `InFlight`; it does not claim completion.
- Refusals use the documented codes so conflict/non-retryable states are visible: `409 SourceChangeConflict`, `409 SourceBaselineDecisionConflict`, `409 NoAuditAlgorithmBinding`, `409 NonAuditAlgorithmBinding`, `405 MethodNotAllowed`, `409 MaterialGcPassInProgress`, `409 MaterialGcRearmBlocked`, and `200 retried=false` for a non-retryable ownership refresh.
- Writes outside the listed routes still answer `501`; GET data is identical to the default mode, so no Job, Task, Observation or Link changes.

Deterministic selectors (documented by `writeSimulation.mjs`). **All dispatch fields and cursors are read from the JSON body `params` of the real unified envelope**, matching `src/api/audit.ts`, `src/api/auditData.ts` and `src/api/ownership.ts`; the query string does not select a simulation state:

| Area | Selector | Result |
| --- | --- | --- |
| Source change | `params.notificationId=qa-source-accepted` or the browser example `qa-notification-42` / `qa-source-conflict` | `202` accepted / `409 SourceChangeConflict` |
| Drift decision | `recoveryId=qa-drift-approved` / `qa-drift-conflict` | `200 Approved` / `409 SourceBaselineDecisionConflict` |
| Maintenance | owner `2222…` or algorithm `qa-static-algorithm` | binding conflict (`409`) or static algorithm (`405`); otherwise `202 Pending` |
| GC pass | no cursor / `qa-gc-cursor-2` / `qa-gc-long-wait` / `qa-gc-conflict` | progress + blocked report / final page / delayed `InFlight` / `409` busy |
| GC re-arm | `versionId=qa-version-retryable` / `qa-version-active` / `qa-version-blocked` | `202 Created` / `200 AlreadyActive` / `409 Blocked` |
| Ownership refresh | `pendingRevision=7` / `8` | `retried=true` / `retried=false` with “no retryable…” message |

**Limits:** the simulation is a display fixture, not a backend stand-in. It proves only that the UI can render the documented answer shapes. It does not persist anything, does not implement real idempotency, authorization or race behavior, and its selectors are fixed instead of derived from a real failure report. The long wait is a fixed delay; a real remote GC step can take much longer. Do not treat a simulated `202`/`200` as evidence that ChordAuditMatrix accepted or completed anything.

Implemented GET routes (every other GET returns `501 qa_route_not_implemented`):

```text
GET /v1/system/status
GET /v1/nodes
GET /v1/nodes/{nodeId}
GET /v1/nodes/{nodeId}/protocol-events
GET /v1/jobs
GET /v1/jobs/{jobId}
GET /v1/jobs/{jobId}/tasks
GET /v1/jobs/{jobId}/trace
GET /v1/jobs/{jobId}/trace/observations
GET /v1/jobs/{jobId}/trace/parts
GET /v1/jobs/{jobId}/trace/links
GET /v1/jobs/{jobId}/trace/protocol
GET /v1/jobs/{jobId}/trace/graph
GET /v1/flows/{flowId}/trace/graph
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

Node-level `GET /v1/nodes/{nodeId}/protocol-events` has no captured fixture and always returns `501 protocol_events_not_captured`. It differs from Job Trace `/trace/protocol`; the two routes cannot substitute for each other.

For the synthetic graph Job `777…777`, the ordinary Trace reads are derived from the authored graph rows and labelled `synthetic-graph+qa-authored-trace`: Summary (Job status/created time and stream coverage only, progress counters stay `null`), Observations, Parts and Links. `/trace/protocol` answers the scenario's explicitly empty page with `coverage=notInstrumented` and `reasons=["ProtocolPacketUnavailable"]`; no protocol packet is provided. `/tasks` returns the one Task row the scenario proves available; the missing, foreign and empty graph references are not turned into Task rows.

**Limits of these synthetic reads:** they are not a backend capture, do not provide `executionKind`, algorithm selection, progress counters or protocol packet records, and cannot prove that every Task the backend would return is listed. They exist so the graph page can finish its task-level reads and evidence jumps instead of showing 404 "load failed" panels. The default fixture behavior still answers `501` for every resource and write route it does not have.

Known unsupported routes include `/v1/jobs/aggregate` (501; unused by the frontend) and layout-jobs (501). The `tagged-ranges` GET returns a `synthetic`-marked UI fixture, not a backend recording. Unless the opt-in simulation above is enabled, every write route returns 501.

---

## 6. Response headers

| Header | Meaning |
| --- | --- |
| `Cache-Control: no-store` | Every response |
| `X-ChordPanel-QA: fixtures` | Every response |
| `X-ChordPanel-QA-Source` | `fixture:frontend` / `fixture:backend` / `derived-summary` / `synthetic-visual-summary` / `synthetic-visual-part` / `synthetic` / `synthetic-write-simulation` / `fixture-missing` / `read-only` / `meta` / `error`. Graph pages are always `synthetic`. |
| `X-ChordPanel-QA-Scenario` | Scenario/view ID; the `challenge-animation-running` view returns this ID, and simulated writes return `task-write-simulation`. |
| `X-ChordPanel-QA-Fixture` | Recording filename / derived-envelope context / synthetic Parts path |
| `X-ChordPanel-QA-Captured-Query` | Query string from the recording; `-` means none. |
| `X-ChordPanel-QA-Projection` | `verbatim` / `captured-filter=…` / `windows-omitted` / `filter=…` / `repaged` / `qa-derived-null-fields` / `qa-derived-synthetic-identity-scope` / `qa-derived-synthetic-identity-summary` / `qa-derived-synthetic-challenge-running` / `qa-derived-synthetic-tag-generation-progress` / `qa-synthetic-identity-details` / `qa-synthetic-static-part` / `synthetic-visual` / `synthetic-graph+qa-bound-cap` / `synthetic-flow-graph+qa-bound-cap` / `synthetic-graph+qa-authored-trace` / `synthetic-write-simulation` |

Error bodies follow the frontend contract: `{ "error": "<code>", "message": "...", "detail": "..." }`.

---

## 7. Add a recording

1. Place an exact HTTP recording in `tests/fixtures/observability/`. Prefix backend copies with the first eight characters of the Job ID; never overwrite a same-named file for another Job.
2. Add one Job scenario to `manifest.mjs`. For another QA-only visual state of the same Job, add an alternate `view` and reuse the captured data instead of registering a second Job.
3. Put clearly synthetic visual data in `tests/qa/fixtures/synthetic/`, register it through `syntheticFile` or derived Summary context, and explain it in the scenario note. Never put synthetic data in the Observability recording directory.
4. Startup validates Job/resource ownership and Link-to-Packet joins. Uncaptured resources must continue to return 501.
5. Register only one backend-recorded Summary per Job. Use a derived Summary on an alternate view for synthetic context; the second Summary captured for `d6448` is intentionally not registered.
6. Never author a graph "recording". The backend states that a per-Job graph fixture must be captured from a real opt-in run; until then, graph UI states belong to the explicitly synthetic scenario in `fixtures/synthetic/`, and the loader rejects an exchange-shaped file.

---

## 8. Tests

```bash
node --test tests/qa/qaServer.test.mjs
```

Coverage includes manifest/Job ownership (including cross-Job mixing and broken Link-to-Packet joins), alternate views, unknown fields in derived Summaries, synthetic TagGeneration 4/3/1 totals and the absence of Task/Window/linked IDs, challenge views that change only two Summary context fields while keeping Job API status consistent, the long-running Task-state Job with `taskIdsComplete=false` and three Task pages, byte-for-byte parity for SHA-256-locked Observation/Link/Protocol recordings and each response body, 404/501 behavior, projection pagination, read-only write routes, Host restrictions, and the QA inventory.

Graph coverage adds: loader rejection of exchange-shaped or non-multi-page scenarios, first-page stream bounds and per-source coverage, continuation of exactly one stream by its own cursor, missing/unattributed Task rows, an Activity span whose pages state different boundaries, conflicting Activity evidence and an orphaned parent relation, missing/unloaded link endpoints, a Running Task with an unknown remote stop, a retried notification whose earlier attempt is not current, foreign/tampered/re-bound cursors (`400`), out-of-range bounds (`400`), recorded/unknown Jobs (`501`/`404`), authored Summary/Observations/Parts/Links reads for the graph Job plus its explicitly empty `notInstrumented` protocol page, the graph Job's one available Task row, the three-page flow listing with page-local parent edges, `flow_not_found`, Job-detail `flowId`, and `/qa/health` graph inventory.

The opt-in write simulation has its own server tests: default mode still rejects every documented write with `501`; simulation mode labels every answer, keeps Job count unchanged, returns Pending dispatches only, covers binding conflicts, source-change/drift conflicts, GC progress/blocked/long-wait/continuation, re-arm Created/AlreadyActive/Blocked, retryable/non-retryable refresh, and still rejects routes outside the simulation.

## 9. Module layout

| File | Responsibility |
| --- | --- |
| `httpUtils.mjs` | Provenance headers, path/query normalization, JSON writing. |
| `response.mjs` | Response descriptors returned by route modules. |
| `captureFiles.mjs` | Reading and validating one recorded HTTP exchange (Job/resource ownership, Link-to-Packet join). |
| `traceFixtures.mjs` | Registry composition, one-owner rules, synthetic Part loading, `availableResources`. |
| `derivedSummary.mjs` | QA-only derived Summary envelope. |
| `scenarioViews.mjs` | `qaView` referrer → scenario view selection. |
| `traceRoutes.mjs` | Recorded Summary/Observations/Parts/Links/Protocol routes and paging/filter projections. |
| `syntheticRoutes.mjs` | System/Nodes/Jobs/Tasks/Users/Algorithms/AuditTables/tagged-range routes. |
| `graphScenario.mjs` | Synthetic graph fixture validation, cursor codec, per-stream and flow page projection. |
| `graphRoutes.mjs` | Graph path matching and 400/404/501 resolution for recorded and synthetic Jobs/flows. |
| `graphTraceRoutes.mjs` | Authored Summary/Observations/Parts/Links for the synthetic graph Job, plus its explicitly empty `notInstrumented` protocol page. |
| `writeSimulation.mjs` | Opt-in, labelled, non-persistent answers for the documented write routes. |
| `server.mjs` | HTTP composition root, loopback guard, read-only guard, QA index and inventory. |
