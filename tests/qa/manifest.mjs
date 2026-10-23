/**
 * QA-only fixture manifest.
 *
 * Each registered scenario owns one Job and its recorded resources. A scenario
 * may expose extra visual views that reuse those exact resources and override
 * only explicitly synthetic Summary context.
 * Captured exchanges are served verbatim (only paged / filtered / projected as
 * documented in `server.mjs`). Explicit derived summaries and synthetic Part
 * fixtures are QA-only and named in the scenario note and response headers.
 * No scenario fabricates Observations, ProtocolEvents, Packets, Links, Tasks or
 * correlation IDs. Synthetic Summary and Part projections are explicitly QA-only.
 *
 * Rules that keep the fixture set honest:
 *
 * - One file per (Job, resource). Files are never merged by name across
 *   checkouts: `tests/fixtures/observability/challenge-verified-true-summary.json`
 *   is the frontend capture of Job 13c37093, while the backend capture of the
 *   same *name* belongs to Job a9029fd6. Backend copies therefore carry the
 *   Job prefix in their filename.
 * - `origin` records where the bytes came from; it is provenance only and never
 *   influences routing.
 * - A Job with no captured Summary may declare `summary: { derived: true }`.
 *   The server then answers with a QA-only envelope whose unknown fields are
 *   `null`. Alternate `views` can override only explicitly named synthetic UI
 *   context and reuse the parent Job's exact recorded resources.
 * - Synthetic TagGeneration Parts live under `SYNTHETIC_TRACE_FIXTURE_DIR`.
 *   They contain static display states only: no Task IDs, Windows, Observations,
 *   Links, Packets, ProtocolEvents or correlation identifiers.
 * - Every synthetic Summary or Part response is labeled in its view note and
 *   `X-ChordPanel-QA-Source` / `X-ChordPanel-QA-Projection` headers.
 * - Non-telemetry surfaces (System, Nodes, Jobs, Tasks, Users, Algorithms,
 *   AuditTables and tagged-range previews) come from `fixtures/synthetic/base.json`
 *   and are labeled synthetic visual data. Node-level protocol events are absent.

/** Directory (relative to the repo root) holding recorded HTTP exchanges. */
export const TRACE_FIXTURE_DIR = 'tests/fixtures/observability'

/** Synthetic visual data for the non-telemetry CRUD surfaces. */
export const SYNTHETIC_FIXTURE_FILE = 'tests/qa/fixtures/synthetic/base.json'
/** Directory holding explicitly synthetic Trace Part fixtures. */
export const SYNTHETIC_TRACE_FIXTURE_DIR = 'tests/qa/fixtures/synthetic'

/** Existing test-only Job ID convention used for synthetic fixture validation. */
export const SYNTHETIC_TAG_PROGRESS_JOB_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

/**
 * @typedef {'summary' | 'observations' | 'parts' | 'links' | 'protocol'} TraceResourceName
 *
 * @typedef {object} ResourceRef
 * @property {string} [file] Recorded exchange file inside TRACE_FIXTURE_DIR.
 * @property {string} [syntheticFile] Synthetic visual Part payload under SYNTHETIC_TRACE_FIXTURE_DIR.
 * @property {'frontend' | 'backend'} [origin] Which checkout the bytes came from.
 * @property {true} [derived] QA-only Summary envelope.
 * @property {'cell' | 'row' | 'table'} [syntheticIdentityScope] Synthetic identity UI scope only.
 * @property {true} [syntheticChallengeRunning] Synthetic challenge Summary context only.
 * @property {true} [syntheticTagGenerationProgress] Synthetic TagGeneration progress only.
 *
 * @typedef {object} TraceScenarioView
 * @property {string} id ASCII view id used by the QA response header.
 * @property {string} label Human-readable QA index label.
 * @property {string} landing In-app route selecting this visual view.
 * @property {string} note Provenance and limits for this view.
 * @property {Partial<Record<TraceResourceName, ResourceRef>>} [resources] Overrides; omitted resources reuse the parent capture.
 * @property {'Pending' | 'Running' | 'Succeeded' | 'Failed'} [jobStatus] QA-only Job API status for view consistency.
 * @property {true} [tasksUnavailable] Do not expose synthetic Task records or IDs for this view.
 *
 * @typedef {object} TraceScenario
 * @property {string} id ASCII id, also used in response headers.
 * @property {string} label Human readable label (banner / QA index).
 * @property {string} jobId Job that owns every capture below.
 * @property {string} landing In-app route that shows this Job's execution page.
 * @property {string} note What the scenario is good for, and what is missing.
 * @property {Partial<Record<TraceResourceName, ResourceRef>>} resources
 * @property {Array<TraceScenarioView>} [views] Alternate QA-only presentations of the same Job.
 * @property {'Pending' | 'Running' | 'Succeeded' | 'Failed'} [jobStatus] QA-only Job API status for this scenario.
 */

/** @type {TraceScenario[]} */
export const traceScenarios = [
  {
    id: 'legacy-challenge',
    label: '挑战证据 · 旧采集（13c37093，前端录制）',
    jobId: '13c37093-ca9d-4486-b8bd-2e5b27630353',
    landing: '/executions/13c37093-ca9d-4486-b8bd-2e5b27630353',
    note: 'Frontend-recorded challenge trace: summary, 7 challenge Observations and 2 protocol packets. '
      + 'No Link capture and no Part capture, so /links and /parts answer 501.',
    resources: {
      summary: { file: 'challenge-verified-true-summary.json', origin: 'frontend' },
      observations: { file: 'challenge-verified-true-observations.json', origin: 'frontend' },
      protocol: { file: 'protocol-linked-packets.json', origin: 'frontend' },
    },
  },
  {
    id: 'exact-challenge',
    label: '挑战证据 · 精确关联（6e445de9，后端录制）',
    jobId: '6e445de9-26f7-460a-b22d-b937e12d5f81',
    landing: '/executions/6e445de9-26f7-460a-b22d-b937e12d5f81',
    note: 'Backend-recorded challenge trace with exact task/packet correlation: 8 Observations, 7 Links '
      + '(taskDispatch / protocolPacket / taskCompletion / peerCorrelation) and 2 protocol packets. '
      + 'No summary and no Part capture: the summary is a QA-only envelope, /parts answers 501.',
    resources: {
      summary: { derived: true },
      observations: { file: 'challenge-observations-6e445de9.json', origin: 'backend' },
      links: { file: 'challenge-links-6e445de9.json', origin: 'backend' },
      protocol: { file: 'protocol-linked-packets-6e445de9.json', origin: 'backend' },
    },
    views: [
      {
        id: 'challenge-animation-running',
        label: '挑战证据 · 箭头动效检查（合成运行态）',
        landing: '/executions/6e445de9-26f7-460a-b22d-b937e12d5f81?qaView=challenge-animation-running',
        note: 'Synthetic visual state for checking the arrow animation against the exact recorded '
          + 'Observations, Links and Protocol packets. Only Summary executionKind and Job status are '
          + 'synthetic; no captured resource or correlation fact is changed.',
        jobStatus: 'Running',
        tasksUnavailable: true,
        resources: {
          summary: { derived: true, syntheticChallengeRunning: true },
        },
      },
    ],
  },
  {
    id: 'tag-multipart',
    label: '标签生成 · 多 Part 与 Window（d6448cc3，前端录制）',
    jobId: 'd6448cc3-04be-4fe8-8097-5a4bdf236b24',
    landing: '/executions/d6448cc3-04be-4fe8-8097-5a4bdf236b24',
    note: 'Tag-generation trace: summary (parts coverage complete) and 3 Parts with window state. '
      + 'No Observation, Link or protocol capture, so those routes answer 501. The second summary '
      + 'captured for this Job (tag-generation-part-projection-missing-summary.json) is deliberately '
      + 'not registered: one Job keeps a single recorded Summary; alternate QA views may use derived context.',
    resources: {
      summary: { file: 'tag-generation-multipart-summary.json', origin: 'frontend' },
      parts: { file: 'tag-generation-multipart-parts.json', origin: 'frontend' },
    },
  },
  {
    id: 'tag-generation-independent-progress',
    label: '标签生成 · 合成独立进度 4/3/1（静态 QA 视觉态）',
    jobId: SYNTHETIC_TAG_PROGRESS_JOB_ID,
    landing: `/executions/${SYNTHETIC_TAG_PROGRESS_JOB_ID}`,
    note: 'Synthetic QA-only Summary and Part projection: planned/generated/storage-accounted block '
      + 'counts are 4/3/1. Part states are static display fixtures, not live concurrency. No Task, '
      + 'Window, Observation, Link or Protocol response is provided; /tasks answers 501.',
    jobStatus: 'Running',
    resources: {
      summary: { derived: true, syntheticTagGenerationProgress: true },
      parts: { syntheticFile: 'tag-generation-independent-progress-parts.json' },
    },
  },
  {
    id: 'identity-worker',
    label: '身份验证 · Worker 阶段（371f5280，后端录制）',
    jobId: '371f5280-b7ae-4252-841b-d3365b5dfd4b',
    landing: '/executions/371f5280-b7ae-4252-841b-d3365b5dfd4b',
    note: 'Backend-recorded identity verification: 6 Observations (category=identity) and 3 Links '
      + '(taskDispatch / protocolPacket / taskCompletion). Its QA-only Summary sets a synthetic '
      + 'identity execution kind and cell scope so the UI can display and cross-check the captured '
      + 'Worker stages; all other Summary fields remain null. No Part or protocol packet capture: '
      + '/parts and /protocol answer 501.',
    resources: {
      summary: { derived: true, syntheticIdentityScope: 'cell' },
      observations: { file: 'identity-observations-371f5280.json', origin: 'backend' },
      links: { file: 'identity-links-371f5280.json', origin: 'backend' },
    },
  },
  {
    id: 'algorithm-snapshot',
    label: '挑战证据 · 算法快照（a9029fd6，后端录制）',
    jobId: 'a9029fd6-f840-48b1-a051-5d3d7a68388b',
    landing: '/executions/a9029fd6-f840-48b1-a051-5d3d7a68388b',
    note: 'Backend-recorded summary carrying the immutable algorithmSelection snapshot (DHTDynamic, '
      + 'TPA, capabilities mask 6). Nothing else was captured for this Job: /observations, /parts, '
      + '/links and /protocol answer 501.',
    resources: {
      summary: { file: 'challenge-summary-a9029fd6.json', origin: 'backend' },
    },
  },
]

/** Flatten default and alternate browser views without duplicating Job ownership. */
export const qaScenarioViews = traceScenarios.flatMap(scenario => [
  {
    id: scenario.id,
    label: scenario.label,
    jobId: scenario.jobId,
    landing: scenario.landing,
  },
  ...(scenario.views ?? []).map(view => ({
    id: view.id,
    label: view.label,
    jobId: scenario.jobId,
    landing: view.landing,
  })),
])

