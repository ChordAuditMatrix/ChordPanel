/**
 * Vite dev-server plugin that stamps the app with an unmissable
 * "local fixtures, not a live backend" badge.
 *
 * The badge is injected into `index.html` at serve time only, so production
 * bundles and the normal dev server are untouched. It is intentionally not
 * dismissable-by-default state: the close button removes it for the current page
 * only, and every reload brings it back.
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const BADGE_CSS = `
.chordpanel-qa-badge {
  position: fixed;
  top: 10px;
  right: 184px;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(360px, calc(100vw - 24px));
  padding: 5px 9px;
  border: 1px solid #d6a149;
  border-radius: 8px;
  background: #fff8e8;
  color: #5b4516;
  font: 11px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.chordpanel-qa-badge strong { font-weight: 650; white-space: nowrap; }
.chordpanel-qa-badge a { color: #2769dc; text-decoration: underline; white-space: nowrap; }
.chordpanel-qa-badge button {
  all: unset;
  cursor: pointer;
  color: inherit;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}
.chordpanel-qa-badge button:focus-visible {
  outline: 2px solid #2769dc;
  outline-offset: 2px;
}
body:has(.app-dark) .chordpanel-qa-badge {
  border-color: #d29922;
  background: #1c2c45;
  color: #eaf1fc;
}
@media (max-width: 900px) {
  .chordpanel-qa-badge {
    top: 8px;
    right: 12px;
    max-width: calc(100vw - 24px);
    flex-wrap: wrap;
  }
  .chordpanel-qa-badge strong { white-space: normal; }
  body:has(.chordpanel-qa-badge) .app-layout {
    margin-top: 64px;
  }
  body:has(.chordpanel-qa-badge) .app-layout > .n-layout {
    height: calc(100vh - 64px) !important;
  }
  body:has(.chordpanel-qa-badge) .app-layout .main-shell {
    height: 100% !important;
  }
  body:has(.chordpanel-qa-badge) .apple-header {
    top: 64px !important;
  }
  body:has(.chordpanel-qa-badge) .app-sidebar--mobile {
    top: 64px !important;
    height: calc(100dvh - 64px) !important;
  }
  body:has(.chordpanel-qa-badge) .sidebar-backdrop {
    top: 64px;
  }
}
`

/**
 * @param {object} options
 * @param {string} options.apiOrigin Fixture API origin (also the Vite proxy target).
 * @param {{ id: string, label: string, jobId: string }[]} options.scenarios
 */
export function qaBadgePlugin({ apiOrigin, scenarios }) {
  const origin = escapeHtml(apiOrigin.replace(/\/+$/, ''))
  const labelList = scenarios.map(scenario => escapeHtml(scenario.label)).join(' · ')
  const badge = `
    <strong>Local fixture · Not a live backend</strong>
    <a href="${origin}/qa" target="_blank" rel="noreferrer">QA index</a>
    <button type="button" aria-label="Close QA badge" title="${labelList}" onclick="this.closest('.chordpanel-qa-badge').remove()">×</button>
  `


  return {
    name: 'chordpanel-qa-badge',
    apply: 'serve',
    transformIndexHtml() {
      return [
        { tag: 'style', attrs: { 'data-chordpanel-qa': 'badge' }, children: BADGE_CSS, injectTo: 'head' },
        {
          tag: 'div',
          attrs: { class: 'chordpanel-qa-badge', 'data-chordpanel-qa-badge': '', role: 'status' },
          children: badge,
          injectTo: 'body-prepend',
        },
      ]
    },
  }
}
