export interface BlockGridRange {
  blockStart: number
  blockCount: number
}

export interface BlockGridCell {
  index: number
  tagged: boolean
}

export interface BlockGridPageProjection {
  rangeStart: number
  rangeCount: number
  page: number
  pageCount: number
  pageStart: number
  pageEndExclusive: number
  taggedCount: number
  cells: BlockGridCell[]
}

/** Maximum block cells materialized by the tagged-range visualizer at once. */
export const BLOCK_GRID_PAGE_SIZE = 240

/** Project one bounded block-grid page from a sorted, merged range union. */
export function projectBlockGridPage(input: {
  totalBlocks: number
  rangeStart?: number
  rangeCount?: number
  page: number
  taggedRanges: readonly BlockGridRange[]
}): BlockGridPageProjection {
  const totalBlocks = isSafeIndex(input.totalBlocks) ? input.totalBlocks : 0
  const requestedStart = isSafeIndex(input.rangeStart) ? input.rangeStart : 0
  const rangeStart = Math.min(requestedStart, totalBlocks)
  const requestedCount = input.rangeCount === undefined
    ? totalBlocks - rangeStart
    : isSafeIndex(input.rangeCount)
      ? input.rangeCount
      : 0
  const rangeCount = Math.min(requestedCount, totalBlocks - rangeStart)
  const rangeEndExclusive = rangeStart + rangeCount
  const pageCount = Math.max(1, Math.ceil(rangeCount / BLOCK_GRID_PAGE_SIZE))
  const requestedPage = Number.isSafeInteger(input.page) && input.page > 0
    ? Math.trunc(input.page)
    : 1
  const page = Math.min(requestedPage, pageCount)
  const pageStart = rangeStart + (page - 1) * BLOCK_GRID_PAGE_SIZE
  const pageEndExclusive = Math.min(rangeEndExclusive, pageStart + BLOCK_GRID_PAGE_SIZE)
  const cells = Array.from({ length: pageEndExclusive - pageStart }, (_, offset) => ({
    index: pageStart + offset,
    tagged: false,
  }))
  let taggedCount = 0

  for (const range of input.taggedRanges) {
    if (!isSafeIndex(range.blockStart) || !isSafeIndex(range.blockCount)) continue
    const rangeTaggedStart = Math.max(rangeStart, range.blockStart)
    const rangeTaggedEnd = Math.min(rangeEndExclusive, range.blockStart + range.blockCount)
    if (rangeTaggedEnd <= rangeTaggedStart) continue

    taggedCount += rangeTaggedEnd - rangeTaggedStart
    const visibleStart = Math.max(pageStart, rangeTaggedStart)
    const visibleEnd = Math.min(pageEndExclusive, rangeTaggedEnd)
    for (let index = visibleStart; index < visibleEnd; index += 1) {
      cells[index - pageStart].tagged = true
    }
  }

  return {
    rangeStart,
    rangeCount,
    page,
    pageCount,
    pageStart,
    pageEndExclusive,
    taggedCount,
    cells,
  }
}

function isSafeIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
