/**
 * Selects the scenario view a browser page points at.
 *
 * Alternate QA views reuse a Job's exact recorded resources and differ only in
 * explicitly synthetic context. The view is carried by the page's `qaView`
 * query parameter, which the QA Vite config puts in the request Referer, so no
 * fixture file has to encode a browser state.
 */

/**
 * @param {{ views?: Map<string, any>, scenarioId?: string }} entry
 * @param {string | undefined} referer
 */
export function selectScenarioView(entry, referer) {
  const fallback = entry.views?.get(entry.scenarioId) ?? entry
  if (typeof referer !== 'string') return fallback
  try {
    const viewId = new URL(referer).searchParams.get('qaView')
    return (viewId && entry.views?.get(viewId)) || fallback
  } catch {
    return fallback
  }
}
