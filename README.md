<p align="center">
  <img src="./public/logo.png" alt="ChordPanel Logo" width="160" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-blue" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-6.4-646CFF" alt="Vite 6.4">
  <img src="https://img.shields.io/badge/Naive%20UI-2.41-18a058" alt="Naive UI">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License: GPL-3.0">
</p>

# ChordPanel

A professional administration panel for [ChordAuditMatrix](https://github.com/ChordAuditMatrix/ChordAuditMatrix), providing API-backed monitoring, audit management, ownership control, and identity verification.

## Features

- **System Dashboard** — API-backed system health, real Admin/Audit/Storage nodes, running Jobs, queue and rejection counts, and current anomalies. Activity is scoped to one selected Running Job; the backend does not expose a global Observability stream. Static architecture edges are not presented as live traffic.
- **Execution Explorer and Reports** — Per-Job Trace Summary, Observations, Parts, Links, Protocol, and Job/Task facts; time-sequence and topology views, structured event logs, historical replay, and a verifiable report. Execution detail and the Identity workbench use resource-specific polling, pause while hidden, and perform bounded terminal syncs; manual replay remains separate from live state.
- **User Management** — Create, rename, and delete system users
- **Node Management** — Node summaries with role, runtime, task, and lifecycle details; supports drain/resume operations.
- **Algorithm Management** — Algorithm profile lifecycle (initialize/bind/deinitialize) with strategy browsing
- **Job Tracking** — Job/Task details show stable IDs, put resolved user and algorithm names before their IDs, and label algorithm names resolved from the current catalog. Supplementary task results, subtasks, and status history remain available; polling refreshes full Job metadata and Task summaries through terminal transitions. The header progress button shows the count of tracked Jobs currently running, and the global progress drawer remains available.
- **Data Table Mapping** — Manage registered tables and TIDs in one resource workspace; select mappings from workflows that require a table.
- **Audit Management** — Audit-tag generation and challenge-proof initiation with automatic or explicit algorithm selection, block layout queries, and algorithm-scoped tagged-range visualization; accepted submissions link directly to their Job execution view.
- **Tag Generation Evidence** — Real Part, Window, and Task data separates computation progress from Storage confirmation; planned concurrency is not presented as actual concurrency.
- **Challenge Proof** — The execution view shows the real Audit/Storage communication direction and a theoretical hypergeometric detection probability separately from cryptographic verification, Job status, and Observability coverage.
- **Ownership Management** — Merkle proof generation/verification (single + range), mapping-aware paginated ownership queries, ownership tree CRUD, cell add/remove/move, import, and export.
- **Identity Verification** — Switch between cell, row, and table scopes in one workflow; choose TIDs from registered table mappings and re-sign with the selected Identity profile. The workbench tracks dispatched verification Jobs inline, showing Worker observations, Job status, Trace verdict, and coverage as separate facts.
- **Protocol Events** — Select current or historical node IDs, filter by source/target nodes, message type, or correlation ID, and browse server-paginated events with payload details.
- **Internationalization** — Simplified Chinese (`zh-CN`) and English (`en`) are supported through the reactive `useI18n` store.
- **Navigation and appearance** — The sidebar stays docked and collapses from 240px to 72px, with the preference saved across reloads; narrow screens use an off-canvas drawer. Light/dark mode follows the system until explicitly overridden in the sidebar. Page bases are pure white/black with solid neutral surfaces and hairline borders.
- **Settings** — Configure the backend origin and polling interval without changing the server's localhost-only bind; theme and language controls remain in the sidebar.

### Algorithm selection

- Leave the audit algorithm empty and the audit system automatically selects the algorithm for that operation; selecting a profile explicitly overrides the configured strategy.
- Tagged-range queries take an optional algorithm: leave it unspecified and the audit system automatically selects the data owner's algorithm, which the response reports back. After tag generation, the page queries ranges with the algorithm that generation actually used; you may still select a specific algorithm to inspect existing ranges.
- For re-signing, select the owner and one Identity algorithm profile. Its `algorithmType` is sent automatically with `algorithmId`; there is no separate type selector.

## Tech Stack

| Layer | Technology |
|:---|:---|
| Framework | Vue 3.5 (Composition API) |
| Language | TypeScript 5.8 |
| Build | Vite 6.4 |
| UI Library | Naive UI 2.41 |
| Router | Vue Router 4 |
| State | Pinia |
| Icons | Ionicons 5 (vicons) |
| HTTP | Axios (with dynamic backend proxy) |
| i18n | Custom reactive store (no dependencies) |

## Project Structure

```
src/
├── api/            # Backend API layer (per-domain modules)
├── components/     # Shared controls and reusable presentation panels
├── composables/    # usePagePolling, useAdaptiveWidth, useWindowSize
├── layout/         # AppLayout (sidebar + header + offline overlay)
├── locales/        # i18n translations (zh-CN.ts, en.ts)
├── router/         # Vue Router config
├── stores/         # Pinia stores (i18n, theme, settings, jobTracking)
├── features/       # Execution Trace data, projections, and evidence views
└── views/          # Domain pages composed from focused panels
```

## Getting Started

### Prerequisites

- Node.js ≥ 20.19
- [ChordAuditMatrix](https://github.com/ChordAuditMatrix/ChordAuditMatrix) backend running on `127.0.0.1:8080` (the default dev proxy target)

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

The dev server listens on `http://localhost:5173` only (localhost-bound; it is not exposed to the network). Requests to `/api/*` are proxied to the backend, by default `http://127.0.0.1:8080`. To point the proxy at a different backend without changing the dev-server listen scope, set `VITE_DEV_PROXY_TARGET` (shell environment or `.env.local`, see [`.env.example`](.env.example)):

```bash
VITE_DEV_PROXY_TARGET=http://192.168.1.10:8080 npm run dev
```

### Production Build

```bash
npm run build
npm run preview
```

The build output in `dist/` is a fully static SPA. By default it calls the API **same-origin**: relative `/api/v1/...` and `/api/identity/...` requests, so no backend address has to be configured. Deploy it behind a reverse proxy that forwards `/api/v1/*` and `/api/identity/*` to ChordAuditMatrix and falls back to `index.html` for SPA routes (the reverse-proxy configuration lives in the deployment environment, not in this repository). In Vite 6.4, `npm run preview` inherits the configured `server.proxy`, so it forwards `/api/*` to `VITE_DEV_PROXY_TARGET`; this checks the production bundle and same-origin browser path, but not the deployment server's reverse-proxy configuration.

A backend on a different origin can be set at runtime in the Settings modal (stored in `localStorage`); enter only the origin (e.g. `http://10.0.0.5:8080`), not a path such as `/api/v1`. Leaving the field empty (the default) keeps requests same-origin. Browsers that still carry the pre-refactor default `http://127.0.0.1:8080` are migrated to empty automatically; custom addresses are preserved.

## CI/CD

GitHub Actions workflows live in [`.github/workflows/`](.github/workflows/):

| Workflow | Trigger | Purpose |
|:---|:---|:---|
| [ci.yml](.github/workflows/ci.yml) | `push` / `pull_request` to `main` or `develop` | `vue-tsc` type-check + `vite build`, uploads `dist/` as an artifact |
| [release.yml](.github/workflows/release.yml) | **Push a `v*` tag** (e.g. `v1.2.3`); also supports manual `workflow_dispatch` | Builds `dist/`, zips it, generates a sectioned changelog from Conventional Commits since the previous tag, and publishes a GitHub Release with the zip attached |

### Releasing a new version

Releases are **tag-driven**: pushing a version tag triggers the `release.yml` workflow automatically.

1. Ensure all merged commits on `main` follow [Conventional Commits](https://www.conventionalcommits.org/) (see below).
2. Create and push a version tag:

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

   - Stable: `v1.2.3`
   - Pre-release (auto-detected from suffix): `v1.2.3-rc.1`, `v1.2.3-alpha.1`, `v1.2.3-beta.1`, `v1.2.3-pre.1`

3. The workflow builds the frontend, generates the changelog from commits between the previous tag and `HEAD`, and publishes a GitHub Release named after the tag, attaching `chordpanel-<version>.zip` (the prebuilt frontend).

> **Ad-hoc / re-run:** The workflow also accepts a manual `workflow_dispatch` run with an explicit `version` (must start with `v`); it will create the tag and publish the release the same way.

## Contributing

This project follows [**Conventional Commits**](https://www.conventionalcommits.org/) so that release notes can be generated automatically.

Commit message format:

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

Recognized `type` values (used to group entries in the release notes):

| Type | Section in changelog |
|:---|:---|
| `feat` | ✨ Features |
| `fix` | 🐛 Bug Fixes |
| `perf` | ⚡ Performance |
| `refactor` | ♻️ Refactor |
| `docs` | 📝 Documentation |
| `test` | ✅ Tests |
| `chore` | 🔧 Chore |
| `build` | 📦 Build |
| `ci` | 👷 CI |
| `style` | 💄 Style |

Examples:

```
feat(audit): add tagged-range BlockGrid visualization
fix(proxy): prevent vite dev server from hanging on GET requests
docs(readme): add CI/CD section
chore(deps): bump naive-ui to 2.41.0
```

A `!` after the type/scope marks a breaking change (e.g. `feat(api)!: drop v0 legacy endpoints`).

## Configuration

All runtime settings are persisted in `localStorage`:

| Setting | Default | Description |
|:---|:---|:---|
| Backend URL | *(empty)* | Backend origin for production builds; empty = same-origin `/api`. Enter only the origin (e.g. `http://10.0.0.5:8080`), not a path like `/api/v1`. |
| Poll Interval | `5000` ms | Data refresh interval |
| Theme | Auto | `light` / `dark` / system |

## License

Copyright (C) 2021-2026, Dylan Liu

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

See [LICENSE](LICENSE) for details.
