# Local Fixture QA (`tests/qa/`)

**Purpose:** Run ChordPanel against recorded traces and clearly labeled synthetic visual states with one command. No live backend or production data is used.

**Guarantees:** Observations, Links, Protocol events, and recorded Parts replay captured HTTP exchanges. The `tag-generation-independent-progress` Summary/Parts pair is a separate QA-only projection, not backend evidence. The challenge-animation view adds running context only to the Summary and Job-detail responses; its Observations, Links, and Protocol events remain unchanged recordings. Every write route returns `501`.

---

## 1. Start

```bash
npm run qa:fixtures                                  # Fixture API (random port) + Vite at http://localhost:5173
QA_API_PORT=7100 QA_VITE_PORT=5180 npm run qa:fixtures
npm run qa:api                                       # Start only the fixture API; reuse an existing dev server
```

`qa:fixtures` validates recorded fixtures first, including Job ownership and Link-to-Packet joins. It then starts the fixture API on `127.0.0.1`, starts Vite with `tests/qa/vite.qa.config.mjs`, and points `VITE_DEV_PROXY_TARGET` at the API. The terminal prints the QA index, inventory URL, and direct links for each scenario.

- **Page badge:** On desktop, it appears at the top right. On narrow screens, it sits above the app header and reserves layout space so scrolling content is not covered. The text is `Local fixture · Not a live backend`; its DOM selector is `[data-chordpanel-qa-badge]`. The QA Vite config injects it only for `qa:fixtures`; running `npm run dev` against the fixture API does not show it.
- **QA index:** `http://127.0.0.1:<api>/qa` lists scenarios and direct links. The machine-readable inventory is at `http://127.0.0.1:<api>/qa/health`.
- **Environment variables:** `QA_API_PORT` (default `0`, choose an available port), `QA_VITE_PORT` (default `5173`), `QA_APP_ORIGIN` (app URL used in index links), and `QA_LOG=1` (print per-request logs).

To use an existing dev server:

```bash
npm run qa:api                                       # Note the printed http://127.0.0.1:<port>
VITE_DEV_PROXY_TARGET=http://127.0.0.1:<port> npm run dev
```

---

## 2. Scenarios

| Scenario / view ID | Job | Trace resources | Direct page |
| --- | --- | --- | --- |
| `legacy-challenge` | `13c37093-ca9d-4486-b8bd-2e5b27630353` | Summary, challenge-category Observations, frontend-recorded Protocol | `/executions/13c37093-ca9d-4486-b8bd-2e5b27630353` |
| `exact-challenge` | `6e445de9-26f7-460a-b22d-b937e12d5f81` | Observations, Links, Protocol; unknown fields in the derived Summary envelope remain unknown | `/executions/6e445de9-26f7-460a-b22d-b937e12d5f81` |
| `challenge-animation-running` | Same Job as above | Reuses the same captured resources; only Summary execution kind and Job status are synthetic. Job details omit synthetic task IDs; Tasks returns 501. | `/executions/6e445de9-26f7-460a-b22d-b937e12d5f81?qaView=challenge-animation-running` |
| `tag-multipart` | `d6448cc3-04be-4fe8-8097-5a4bdf236b24` | Summary and Parts, including captured Window state | `/executions/d6448cc3-04be-4fe8-8097-5a4bdf236b24` |
| `tag-generation-independent-progress` | `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` (test-only ID) | Synthetic Summary and Parts; no Tasks, Windows, or Observations | `/executions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` |
| `identity-worker` | `371f5280-b7ae-4252-841b-d3365b5dfd4b` | Backend-recorded Observations and Links; Summary execution kind and verification scope are synthetic; Tasks returns 501 | `/executions/371f5280-b7ae-4252-841b-d3365b5dfd4b` |
| `identity-worker-summary-preview` | Same Job as above | Reuses the recorded Observations and Links; adds an explicitly synthetic Summary and Succeeded Job status with Worker-stage coverage, named user references, root-hash presence and display-only Job metadata. `verified` stays unknown. | `/executions/371f5280-b7ae-4252-841b-d3365b5dfd4b?qaView=identity-worker-summary-preview` |
| `algorithm-snapshot` | `a9029fd6-f840-48b1-a051-5d3d7a68388b` | Summary with the immutable `algorithmSelection` snapshot | `/executions/a9029fd6-f840-48b1-a051-5d3d7a68388b` |

The `challenge-animation-running` view is selected by the `qaView` query parameter. The page's API Referer lets the QA server distinguish Summary and Job-detail responses. The default `exact-challenge` view is unchanged and continues to return `executionKind=null` and `job.status=null`. Synthetic TagGeneration counts and Part states are static projections, not backend progress or concurrency.

The `identity-worker-summary-preview` view reuses the exact backend-recorded Identity Observations and Links. Its Summary context, Succeeded Job status, user names, coverage, and Job metadata root-hash value are synthetic visual data; the verification verdict stays unknown. Use it to check that the Worker-stage Observation Coverage row appears when data exists, then use the default `identity-worker` view to check that the row stays hidden when coverage is absent.

---

## 3. Data authenticity

Recorded files live under `tests/fixtures/observability/`. Each file represents one Job's HTTP exchange: `request.path/query` plus `response.body`. Recorded resources replay the original response body. Views do not edit these files or create a second set of Observations, Links, or Protocol events.

The independent TagGeneration sample lives at `tests/qa/fixtures/synthetic/tag-generation-independent-progress-parts.json`. It contains only Summary and Part display data and reuses a test-only Job ID. It contains no Task, Window, Observation, Link, or Protocol data. The Summary counts `plannedBlockCount="4"`, `generatedBlockCount="3"`, and `storageAccountedTagCount="1"` are synthetic decimal strings. Part states are static UI projections, not live concurrency. `/tasks` returns 501.

Allowed projections of captured resources are marked in `X-ChordPanel-QA-Projection`:

| Projection | Trigger | Behavior |
| --- | --- | --- |
| Pagination | `page` / `pageSize` on Parts or Links | Slice captured rows; retain the recorded `total`. |
| Filtering | `nodeId` on Links or `messageTypes` on Protocol | Filter captured rows only; do not add rows. |
| `windows-omitted` | Captured Parts without `includeWindows=true` | Omit the `windows` field as required by the contract; do not replace it with an empty array. |

Unsupported data is reported explicitly rather than represented as an empty page:

- **Uncaptured resource** → `501 trace_resource_not_captured`; `detail` lists the resources available for that Job.
- **Unknown Job** → `404 job_not_found`.
- **Uncaptured page or cursor** → `501 trace_page_not_captured` or `501 trace_cursor_not_captured`.
- **A recorded filtered collection queried with another filter value** → `501 trace_filter_not_captured`.

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

`tests/qa/fixtures/synthetic/base.json` provides System Status, Nodes (three: one Audit and two Storage, including Draining / Unavailable), Jobs, Tasks, Users, Algorithms, AuditTables, and a tagged-range sample for layout checks only. Node-level protocol events have no captured fixture and return 501. The `tagged-ranges` response is synthetic visual data, not a backend recording.

- All values are **synthetic visual data**, not backend data. Responses include `X-ChordPanel-QA-Source: synthetic`, and Job `metadata.qaFixture` is also `synthetic`.
- The five recorded Jobs in the Jobs list keep their **recorded IDs** so links work, but status, owners, tasks, history, and other fields remain synthetic.

Node details contain no Tasks and no invented `requestId`. The QA Job `33333333-3333-4333-8333-333333333333` uses an algorithm ID only to test current-catalog name display; its status message, metadata, and Task results are synthetic samples, not backend records. Other synthetic base data is only for local layout checks. Node-level Protocol Event requests are uncaptured, so the server does not use an empty list to imply that the node has no events.

Timestamps stay near the fixture time (around `1792…`) and do not follow the system clock, so responses are reproducible.

---

## 5. Read-only behavior

Every request other than `GET` and `HEAD` returns `501 qa_read_only` without changing state:

- `POST/PATCH/DELETE /v1/users*`
- `POST /v1/algorithms/profiles*` (initialize, deinitialize, bind, unbind)
- `POST /v1/audit-tables*` (bootstrap / register / validate / retire / addressing)
- `POST /v1/nodes/{id}/drain|resume`, `POST /v1/jobs/{id}/cancel`
- `POST /v1/identity/*`, `/v1/ownership/*`, `/v1/audit/*`

Write-heavy pages such as Audit, Ownership, and Identity may show a 501 error in QA. This is expected behavior, not a defect.

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

Known unsupported routes include `/v1/jobs/aggregate` (501; unused by the frontend) and layout-jobs (501). The `tagged-ranges` GET returns a `synthetic`-marked UI fixture, not a backend recording. Every write route still returns 501.

---

## 6. Response headers

| Header | Meaning |
| --- | --- |
| `Cache-Control: no-store` | Every response |
| `X-ChordPanel-QA: fixtures` | Every response |
| `X-ChordPanel-QA-Source` | `fixture:frontend` / `fixture:backend` / `derived-summary` / `synthetic-visual-summary` / `synthetic-visual-part` / `synthetic` / `fixture-missing` / `read-only` / `meta` / `error` |
| `X-ChordPanel-QA-Scenario` | Scenario/view ID; the `challenge-animation-running` view returns this ID. |
| `X-ChordPanel-QA-Fixture` | Recording filename / derived-envelope context / synthetic Parts path |
| `X-ChordPanel-QA-Captured-Query` | Query string from the recording; `-` means none. |
| `X-ChordPanel-QA-Projection` | `verbatim` / `captured-filter=…` / `windows-omitted` / `filter=…` / `repaged` / `qa-derived-null-fields` / `qa-derived-synthetic-identity-scope` / `qa-derived-synthetic-identity-summary` / `qa-derived-synthetic-challenge-running` / `qa-derived-synthetic-tag-generation-progress` / `qa-synthetic-identity-details` / `qa-synthetic-static-part` / `synthetic-visual` |

Error bodies follow the frontend contract: `{ "error": "<code>", "message": "...", "detail": "..." }`.

---

## 7. Add a recording

1. Place an exact HTTP recording in `tests/fixtures/observability/`. Prefix backend copies with the first eight characters of the Job ID; never overwrite a same-named file for another Job.
2. Add one Job scenario to `manifest.mjs`. For another QA-only visual state of the same Job, add an alternate `view` and reuse the captured data instead of registering a second Job.
3. Put clearly synthetic visual data in `tests/qa/fixtures/synthetic/`, register it through `syntheticFile` or derived Summary context, and explain it in the scenario note. Never put synthetic data in the Observability recording directory.
4. Startup validates Job/resource ownership and Link-to-Packet joins. Uncaptured resources must continue to return 501.
5. Register only one backend-recorded Summary per Job. Use a derived Summary on an alternate view for synthetic context; the second Summary captured for `d6448` is intentionally not registered.

---

## 8. Tests

```bash
node --test tests/qa/qaServer.test.mjs
```

Coverage includes manifest/Job ownership (including cross-Job mixing and broken Link-to-Packet joins), alternate views, unknown fields in derived Summaries, synthetic TagGeneration 4/3/1 totals and the absence of Task/Window/linked IDs, challenge views that change only two Summary context fields while keeping Job API status consistent, byte-for-byte parity for SHA-256-locked Observation/Link/Protocol recordings and each response body, 404/501 behavior, projection pagination, read-only write routes, Host restrictions, and the QA inventory.
