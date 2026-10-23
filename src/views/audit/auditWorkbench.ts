/**
 * Audit initiation page model.
 *
 * Pure shaping of the two audit-data answers the page renders: the tagged-range
 * answer (which the controller returns unsorted and unfiltered) and the
 * persisted challenge sampling snapshot. Keeping this out of the components
 * makes the rules that decide what the page may claim testable on their own.
 */
import {
  parseChallengeSamplingMetadata,
  theoreticalDetectionProbability,
  type ChallengeSamplingSnapshot,
  type ConfidenceError,
} from '@/features/execution/data/challengeConfidence'

export interface TaggedRange {
  blockStart: number
  blockCount: number
}

export interface TaggedRangesSnapshot {
  /** Algorithm the answer was actually read for; null when the field is absent. */
  algorithmId: string | null
  ranges: TaggedRange[]
}

export interface MergedTaggedRanges {
  /** Non-empty ranges sorted by start, adjacent/overlapping ranges combined. */
  ranges: TaggedRange[]
  /** Exact number of distinct blocks covered by the answer. */
  coveredBlocks: string
}

export type AlgorithmSelectionMode = 'automatic' | 'explicit'

function isSafeIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Validate one `GET /audit-data/{ownerId}/tagged-ranges` answer.
 *
 * Every range must be an exact non-negative block interval. A malformed entry
 * rejects the whole answer: dropping single ranges would silently understate
 * what Storage reported as tagged.
 */
export function normalizeTaggedRanges(answer: unknown): TaggedRangesSnapshot | null {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return null
  const record = answer as Record<string, unknown>
  if (!Array.isArray(record.ranges)) return null
  const ranges: TaggedRange[] = []
  for (const item of record.ranges) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
    const { blockStart, blockCount } = item as Record<string, unknown>
    if (!isSafeIndex(blockStart) || !isSafeIndex(blockCount)) return null
    if (!Number.isSafeInteger(blockStart + blockCount)) return null
    ranges.push({ blockStart, blockCount })
  }
  const algorithmId = typeof record.algorithmId === 'string' && record.algorithmId.trim() !== ''
    ? record.algorithmId.trim()
    : null
  return { algorithmId, ranges }
}

/**
 * Sort and merge the returned intervals so the covered-block count is the
 * exact union. Storage answers are neither sorted nor guaranteed disjoint.
 * Zero-length ranges carry no tagged block and are left out of the union.
 */
export function mergeTaggedRanges(ranges: readonly TaggedRange[]): MergedTaggedRanges {
  const ordered = ranges
    .filter(range => range.blockCount > 0)
    .map(range => ({ blockStart: range.blockStart, blockCount: range.blockCount }))
    .sort((left, right) => left.blockStart - right.blockStart || left.blockCount - right.blockCount)
  const merged: TaggedRange[] = []
  let coveredBlocks = 0n
  for (const range of ordered) {
    const last = merged[merged.length - 1]
    const end = range.blockStart + range.blockCount
    if (last && range.blockStart <= last.blockStart + last.blockCount) {
      const lastEnd = last.blockStart + last.blockCount
      if (end > lastEnd) {
        coveredBlocks += BigInt(end - lastEnd)
        last.blockCount = end - last.blockStart
      }
      continue
    }
    merged.push({ blockStart: range.blockStart, blockCount: range.blockCount })
    coveredBlocks += BigInt(range.blockCount)
  }
  return { ranges: merged, coveredBlocks: coveredBlocks.toString() }
}

/** `algorithmSelectionMode` from the challenge-proof response, case-insensitive. */
export function normalizeSelectionMode(value: unknown): AlgorithmSelectionMode | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'automatic') return 'automatic'
  if (normalized === 'explicit') return 'explicit'
  return null
}

/** A non-empty string member of the persisted Job metadata, else null. */
export function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata) return null
  const value = metadata[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The algorithm this Job was created with. The durable Job metadata is the
 * authoritative snapshot; the creation response only fills the gap while the
 * detail request is in flight. The current algorithm catalog is never used to
 * complete or rename a historical selection.
 */
export function resolveJobAlgorithmId(
  acceptedAlgorithmId: unknown,
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const snapshot = metadataText(metadata, 'algorithmId')
  if (snapshot) return snapshot
  return typeof acceptedAlgorithmId === 'string' && acceptedAlgorithmId.trim() !== ''
    ? acceptedAlgorithmId.trim()
    : null
}

export interface SamplingNumbers {
  /** Parsed persisted snapshot; null when the metadata is missing or invalid. */
  snapshot: ChallengeSamplingSnapshot | null
  /** Why the snapshot itself is unusable; null when it parsed. */
  metadataError: ConfidenceError | null
  /** Modelled detection probability; null when it cannot be computed. */
  probability: number | null
  /** Why the probability is unavailable although the snapshot parsed. */
  probabilityError: ConfidenceError | null
}

/**
 * Read the sampling snapshot from `GET /v1/jobs/{jobId}` metadata only, then
 * model the hypergeometric detection probability. Target probability withholds
 * any default: an absent snapshot stays absent instead of becoming a made-up
 * percentage.
 */
export function samplingNumbers(
  metadata: Record<string, unknown> | null | undefined,
): SamplingNumbers {
  const parsed = parseChallengeSamplingMetadata(metadata)
  if (!parsed.ok) {
    return { snapshot: null, metadataError: parsed.reason, probability: null, probabilityError: null }
  }
  const probability = theoreticalDetectionProbability(parsed.value)
  return {
    snapshot: parsed.value,
    metadataError: null,
    probability: probability.ok ? probability.value : null,
    probabilityError: probability.ok ? null : probability.reason,
  }
}

/** Which algorithm ID a tagged-range query should send, if any. */
export function resolveRangeAlgorithmId(options: {
  selectedAlgorithmId: string
  generatedAlgorithmId: string | null
  generatedOwnerId: string | null
  ownerId: string
}): string | undefined {
  const selected = options.selectedAlgorithmId.trim()
  if (selected) return selected
  const ownerId = options.ownerId.trim()
  const generated = options.generatedAlgorithmId?.trim()
  return generated && options.generatedOwnerId?.trim() === ownerId ? generated : undefined
}
