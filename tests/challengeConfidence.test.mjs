import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
})
after(async () => { await vite.close() })

const {
  displayConfidencePercentage,
  parseChallengeSamplingMetadata,
  theoreticalDetectionProbability,
} = await vite.ssrLoadModule('/src/features/execution/data/challengeConfidence.ts')

function metadata(overrides = {}) {
  return {
    targetConfidence: '0.99',
    assumedCorruptionRatio: '0.01',
    assumedCorruptedBlockCount: '1',
    blockCount: '4',
    challengeCount: '1',
    ...overrides,
  }
}

test('metadata keeps target probability, assumption and actual count separate from effective c', () => {
  const result = parseChallengeSamplingMetadata(metadata({ challengedTagCount: '0' }))
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, {
    targetConfidence: 0.99,
    assumedCorruptionRatio: 0.01,
    assumedCorruptedBlockCount: '1',
    blockCount: '4',
    challengeCount: '1',
    challengedTagCount: '0',
  })
  const withoutActual = parseChallengeSamplingMetadata(metadata())
  assert.equal(withoutActual.ok, true)
  assert.equal(withoutActual.value.challengedTagCount, null)
})

test('missing or unconfigured metadata never supplies a default confidence', () => {
  assert.deepEqual(parseChallengeSamplingMetadata(null), { ok: false, reason: 'noMetadata' })
  assert.deepEqual(parseChallengeSamplingMetadata({}), { ok: false, reason: 'notConfigured' })
  assert.deepEqual(parseChallengeSamplingMetadata({ targetConfidence: '0.99' }), {
    ok: false,
    reason: 'invalidMetadata',
  })
})

test('invalid fractions and malformed, negative, or out-of-range counts are rejected', () => {
  for (const invalid of [
    metadata({ targetConfidence: '0' }),
    metadata({ targetConfidence: '1.01' }),
    metadata({ assumedCorruptionRatio: 'NaN' }),
    metadata({ blockCount: '4.0' }),
    metadata({ blockCount: '-1' }),
    metadata({ blockCount: '18446744073709551616' }),
    metadata({ assumedCorruptedBlockCount: '0' }),
    metadata({ assumedCorruptedBlockCount: '5' }),
    metadata({ challengeCount: '0' }),
    metadata({ challengeCount: '5' }),
    metadata({ challengedTagCount: '4.5' }),
  ]) {
    assert.deepEqual(parseChallengeSamplingMetadata(invalid), { ok: false, reason: 'invalidMetadata' })
  }
})

test('hypergeometric probability matches exact small-population cases in both symmetric forms', () => {
  const a = parseChallengeSamplingMetadata(metadata({ challengeCount: '1' }))
  assert.equal(a.ok, true)
  const first = theoreticalDetectionProbability(a.value)
  assert.equal(first.ok, true)
  assert.ok(Math.abs(first.value - 0.25) < 1e-14)

  const b = parseChallengeSamplingMetadata(metadata({ challengeCount: '2' }))
  assert.equal(b.ok, true)
  const second = theoreticalDetectionProbability(b.value)
  assert.equal(second.ok, true)
  assert.ok(Math.abs(second.value - 0.5) < 1e-14)

  const c = parseChallengeSamplingMetadata(metadata({
    assumedCorruptedBlockCount: '3',
    blockCount: '8',
    challengeCount: '2',
  }))
  assert.equal(c.ok, true)
  const probability = theoreticalDetectionProbability(c.value)
  assert.equal(probability.ok, true)
  assert.ok(Math.abs(probability.value - 9 / 14) < 1e-14)
})

test('a sample larger than the healthy remainder has exact probability one without Number conversion', () => {
  const snapshot = {
    targetConfidence: 0.99,
    assumedCorruptionRatio: 0.1,
    assumedCorruptedBlockCount: '5',
    blockCount: '9007199254741000',
    challengeCount: '9007199254740996',
    challengedTagCount: null,
  }
  assert.deepEqual(theoreticalDetectionProbability(snapshot), {
    ok: true,
    value: 1,
    derivation: 'hypergeometric',
  })
})

test('unsafe and expensive computations remain unavailable for uint64-sized input', () => {
  const unsafe = parseChallengeSamplingMetadata(metadata({
    blockCount: '9007199254740993',
    assumedCorruptedBlockCount: '1',
    challengeCount: '1',
  }))
  assert.equal(unsafe.ok, true)
  assert.deepEqual(theoreticalDetectionProbability(unsafe.value), {
    ok: false,
    reason: 'unsafeForClientComputation',
  })

  const expensive = parseChallengeSamplingMetadata(metadata({
    blockCount: '1000000',
    assumedCorruptedBlockCount: '100001',
    challengeCount: '100001',
  }))
  assert.equal(expensive.ok, true)
  assert.deepEqual(theoreticalDetectionProbability(expensive.value), {
    ok: false,
    reason: 'computationTooExpensive',
  })
})

test('percentage formatting is bounded and does not emit NaN or infinity', () => {
  assert.equal(displayConfidencePercentage(0.9901), '99.01%')
  assert.throws(() => displayConfidencePercentage(Number.NaN), RangeError)
  assert.throws(() => displayConfidencePercentage(1.01), RangeError)
})
