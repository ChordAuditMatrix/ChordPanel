/**
 * Block-layout summary read from a layout Job's metadata (`GET /api/v1/jobs/{jobId}`).
 *
 * Job metadata is an open `object<string,string>` map: the layout worker writes
 * `totalBlocks`, `totalCells` and `blockSize` as decimal strings, so every value
 * is parsed leniently and is kept as `null` when unusable instead of leaking NaN.
 */
export interface AuditLayoutResult {
  /** Block count of the ready layout (0 for an owner without data). */
  totalBlocks: number
  /** Cell count the layout covers (`totalCells` in the Job metadata). */
  totalCells: number | null
  blockSize: number | null
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const raw = metadata[key]
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const value = Number(raw.trim())
  return Number.isFinite(value) ? value : null
}

/**
 * Parse a succeeded layout Job's metadata into a display summary.
 * `totalBlocks` anchors the summary — it is written together with the ready
 * layout, including `0` for an empty owner — so its absence means the Job
 * carries no usable layout and `null` is returned.
 */
export function parseLayoutJobMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AuditLayoutResult | null {
  if (!metadata) return null
  const totalBlocks = metadataNumber(metadata, 'totalBlocks')
  if (totalBlocks === null) return null
  return {
    totalBlocks,
    totalCells: metadataNumber(metadata, 'totalCells'),
    blockSize: metadataNumber(metadata, 'blockSize'),
  }
}
