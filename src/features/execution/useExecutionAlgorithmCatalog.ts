import { computed, ref, watch, type ComputedRef } from 'vue'
import { getStrategies, type AlgorithmProfile, type AlgorithmStrategy } from '@/api/algorithm'
import { fetchAllPages } from '@/api/pagination'
import type { TraceAlgorithmSelection } from '@/api/trace'
import { useReferenceCatalog } from '@/stores/referenceCatalog'

export interface ExecutionAlgorithmCatalogInput {
  displayedAlgorithmId: ComputedRef<string | null>
  displayedAlgorithmSelection: ComputedRef<TraceAlgorithmSelection | null>
}

/**
 * Algorithm identity shown on the execution page.
 *
 * The profile comes from the shared reference catalog; the strategy directory
 * is a page-local, lazily fetched list used only to explain a strategy version
 * when the recorded selection does not carry one. Neither surface invents a
 * missing identifier or asks the user to wait before the page renders.
 */
export function useExecutionAlgorithmCatalog(input: ExecutionAlgorithmCatalogInput) {
  const { algorithmEntitiesById, ensureAlgorithmsLoaded } = useReferenceCatalog()
  const strategyDirectory = ref<AlgorithmStrategy[] | null>(null)
  let strategyDirectoryFlight: Promise<void> | null = null

  function ensureStrategyDirectoryLoaded(): Promise<void> {
    if (strategyDirectory.value !== null) return Promise.resolve()
    if (strategyDirectoryFlight) return strategyDirectoryFlight
    let flight: Promise<void>
    flight = fetchAllPages(params => getStrategies(params), 1000)
      .then(items => {
        strategyDirectory.value = items
      })
      .catch(() => {
        strategyDirectory.value = []
      })
      .finally(() => {
        if (strategyDirectoryFlight === flight) strategyDirectoryFlight = null
      })
    strategyDirectoryFlight = flight
    return flight
  }

  const algorithmCatalogProfile = computed<AlgorithmProfile | null>(() => {
    const algorithmId = input.displayedAlgorithmId.value
    const profile = algorithmId ? algorithmEntitiesById.value.get(algorithmId) : null
    return profile?.algorithmId === algorithmId ? profile : null
  })

  const algorithmCatalogStrategy = computed<AlgorithmStrategy | null>(() => {
    const profile = algorithmCatalogProfile.value
    const catalog = strategyDirectory.value
    const algorithmId = input.displayedAlgorithmId.value
    const selection = input.displayedAlgorithmSelection.value
    if (!algorithmId || !catalog || (selection?.algorithmId && selection.algorithmId !== algorithmId)) return null
    const expectedType = selection?.algorithmType?.trim() || profile?.algorithmType
    const expectedPurpose = selection?.purpose?.trim() || profile?.purpose
    if (!expectedType || !expectedPurpose) return null
    if (profile && (profile.algorithmType !== expectedType || profile.purpose !== expectedPurpose)) return null
    const matches = catalog.filter(strategy =>
      strategy.algorithmType === expectedType && strategy.purpose === expectedPurpose,
    )
    return matches.length === 1 ? matches[0] : null
  })

  watch([
    input.displayedAlgorithmId,
    () => input.displayedAlgorithmSelection.value?.algorithmName,
    () => input.displayedAlgorithmSelection.value?.algorithmType,
    () => input.displayedAlgorithmSelection.value?.purpose,
    () => input.displayedAlgorithmSelection.value?.strategyKind,
    () => input.displayedAlgorithmSelection.value?.capabilities,
  ], ([algorithmId, snapshotName, snapshotType, snapshotPurpose, snapshotStrategyKind, snapshotCapabilities]) => {
    if (
      algorithmId
      && (
        !snapshotName?.trim()
        || !snapshotType?.trim()
        || !snapshotPurpose?.trim()
        || !snapshotStrategyKind?.trim()
        || (snapshotCapabilities === null && snapshotPurpose !== 'Identity')
      )
    ) {
      void ensureAlgorithmsLoaded()
    }
  }, { immediate: true })

  watch([
    input.displayedAlgorithmId,
    algorithmCatalogProfile,
    () => input.displayedAlgorithmSelection.value?.strategyKind,
    () => input.displayedAlgorithmSelection.value?.algorithmType,
    () => input.displayedAlgorithmSelection.value?.purpose,
    () => input.displayedAlgorithmSelection.value?.capabilities,
  ], ([algorithmId, profile, snapshotStrategyKind, snapshotType, snapshotPurpose, snapshotCapabilities]) => {
    const type = snapshotType?.trim() || profile?.algorithmType
    const purpose = snapshotPurpose?.trim() || profile?.purpose
    if (
      algorithmId
      && type
      && purpose
      && (
        !snapshotStrategyKind?.trim()
        || (snapshotCapabilities === null && purpose !== 'Identity')
      )
    ) {
      void ensureStrategyDirectoryLoaded()
    }
  }, { immediate: true })

  return {
    algorithmCatalogProfile,
    algorithmCatalogStrategy,
    ensureStrategyDirectoryLoaded,
  }
}
