/**
 * Challenge sampling confidence, independent of presentation.
 * Inputs come from the persisted Job metadata, never from Trace summary.
 * A modelled detection probability, cryptographic `verified`, Job status and
 * Observability coverage are distinct facts.
 */
export type ConfidenceError =
  | 'noMetadata'
  | 'notConfigured'
  | 'invalidMetadata'
  | 'unsafeForClientComputation'
  | 'computationTooExpensive'

export interface ChallengeSamplingSnapshot {
  targetConfidence: number
  assumedCorruptionRatio: number
  assumedCorruptedBlockCount: string
  blockCount: string
  challengeCount: string
  challengedTagCount: string | null
}

export type ConfidenceParseResult =
  | { ok: true; value: ChallengeSamplingSnapshot }
  | { ok: false; reason: ConfidenceError }

export type ProbabilityResult =
  | { ok: true; value: number; derivation: 'hypergeometric' }
  | { ok: false; reason: ConfidenceError }

const DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/
const UINT64_MAX = 18_446_744_073_709_551_615n
const MAX_COMPUTATION_TERMS = 100_000

function countValue(raw: unknown): bigint | null {
  if (typeof raw !== 'string' || !DECIMAL_INTEGER.test(raw)) return null
  try {
    const value = BigInt(raw)
    return value <= UINT64_MAX ? value : null
  } catch {
    return null
  }
}

function fractionValue(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : null
}

export function parseChallengeSamplingMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ConfidenceParseResult {
  if (metadata == null) return { ok: false, reason: 'noMetadata' }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { ok: false, reason: 'invalidMetadata' }
  }

  const keys = [
    'targetConfidence',
    'assumedCorruptionRatio',
    'assumedCorruptedBlockCount',
    'blockCount',
    'challengeCount',
  ]
  if (keys.every(key => metadata[key] == null)) return { ok: false, reason: 'notConfigured' }

  const targetConfidence = fractionValue(metadata.targetConfidence)
  const assumedCorruptionRatio = fractionValue(metadata.assumedCorruptionRatio)
  const blockCount = countValue(metadata.blockCount)
  const assumedCorruptedBlockCount = countValue(metadata.assumedCorruptedBlockCount)
  const challengeCount = countValue(metadata.challengeCount)

  if (
    targetConfidence === null
    || assumedCorruptionRatio === null
    || blockCount === null
    || assumedCorruptedBlockCount === null
    || challengeCount === null
    || blockCount === 0n
    || assumedCorruptedBlockCount < 1n
    || assumedCorruptedBlockCount > blockCount
    || challengeCount < 1n
    || challengeCount > blockCount
  ) {
    return { ok: false, reason: 'invalidMetadata' }
  }

  // This optional postcondition is not a substitute for the effective sample c.
  const challengedTagCount = metadata.challengedTagCount == null
    ? null
    : countValue(metadata.challengedTagCount)
  if (metadata.challengedTagCount != null && challengedTagCount === null) {
    return { ok: false, reason: 'invalidMetadata' }
  }

  return {
    ok: true,
    value: {
      targetConfidence,
      assumedCorruptionRatio,
      assumedCorruptedBlockCount: assumedCorruptedBlockCount.toString(),
      blockCount: blockCount.toString(),
      challengeCount: challengeCount.toString(),
      challengedTagCount: challengedTagCount?.toString() ?? null,
    },
  }
}

/**
 * P(detect >= 1 corrupted block) = 1 - C(N-t,c) / C(N,c).
 * The log-space calculation uses log1p/expm1 for small probabilities. A
 * bounded term limit keeps large jobs responsive; unsafe or costly cases stay
 * explicitly unavailable instead of receiving a fabricated percentage.
 */
export function theoreticalDetectionProbability(
  snapshot: ChallengeSamplingSnapshot,
): ProbabilityResult {
  const Nbig = countValue(snapshot.blockCount)
  const tbig = countValue(snapshot.assumedCorruptedBlockCount)
  const cbig = countValue(snapshot.challengeCount)

  if (
    Nbig === null
    || tbig === null
    || cbig === null
    || Nbig === 0n
    || tbig < 1n
    || tbig > Nbig
    || cbig < 1n
    || cbig > Nbig
  ) {
    return { ok: false, reason: 'invalidMetadata' }
  }

  // If the sample is larger than the entire healthy remainder, a hit is certain.
  if (cbig > Nbig - tbig) return { ok: true, value: 1, derivation: 'hypergeometric' }

  if (
    Nbig > BigInt(Number.MAX_SAFE_INTEGER)
    || tbig > BigInt(Number.MAX_SAFE_INTEGER)
    || cbig > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return { ok: false, reason: 'unsafeForClientComputation' }
  }

  const N = Number(Nbig)
  const t = Number(tbig)
  const c = Number(cbig)
  const terms = Math.min(t, c)
  if (terms > MAX_COMPUTATION_TERMS) {
    return { ok: false, reason: 'computationTooExpensive' }
  }

  let logMissProbability = 0
  // Equivalent symmetric products; use fewer factors.
  if (t <= c) {
    for (let index = 0; index < t; index += 1) {
      logMissProbability += Math.log1p(-c / (N - index))
    }
  } else {
    for (let index = 0; index < c; index += 1) {
      logMissProbability += Math.log1p(-t / (N - index))
    }
  }

  const probability = -Math.expm1(logMissProbability)
  if (!Number.isFinite(probability)) return { ok: false, reason: 'invalidMetadata' }
  return {
    ok: true,
    value: Math.max(0, Math.min(1, probability)),
    derivation: 'hypergeometric',
  }
}

export function displayConfidencePercentage(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('Probability must be a finite fraction in [0, 1]')
  }
  return `${(fraction * 100).toFixed(2)}%`
}
