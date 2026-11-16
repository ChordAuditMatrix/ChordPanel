/**
 * Deterministic SVG geometry shared by the Job graph and flow graph canvases.
 *
 * Only positions are computed here; no business fact is involved. An edge is
 * drawn strictly between the boxes of its two resolved endpoints, and a
 * self-relation loops above its own box instead of pointing at a neighbour.
 */

export interface GraphCanvasBox {
  x: number
  y: number
  width: number
  height: number
}

export interface GraphCanvasEdgePath {
  /** SVG path between the two boxes, in canvas coordinates. */
  path: string
  /** Midpoint candidate for an optional edge label. */
  labelX: number
  labelY: number
}

const cubic = (x1: number, y1: number, x2: number, y2: number) =>
  `C ${x1} ${y1}, ${x2} ${y2},`

/** A small loop above the node; never reuses another node as the target. */
function selfLoopPath(box: GraphCanvasBox): GraphCanvasEdgePath {
  const startX = box.x + box.width - 26
  const startY = box.y
  const endX = box.x + box.width - 52
  const endY = box.y
  return {
    path: [
      `M ${startX} ${startY}`,
      `C ${startX + 20} ${startY - 34},`,
      `${endX - 12} ${endY - 34},`,
      `${endX} ${endY}`,
    ].join(' '),
    labelX: box.x + box.width - 34,
    labelY: box.y - 26,
  }
}

/**
 * Path from the source box border to the target box border. The orientation
 * follows the relative position of the two boxes, so a relation never starts or
 * ends inside a node card.
 */
export function graphCanvasEdgePath(
  from: GraphCanvasBox,
  to: GraphCanvasBox,
): GraphCanvasEdgePath {
  if (from.x === to.x && from.y === to.y) return selfLoopPath(from)

  const fromCenterX = from.x + from.width / 2
  const toCenterX = to.x + to.width / 2
  const fromCenterY = from.y + from.height / 2
  const toCenterY = to.y + to.height / 2

  // Below the source: start at its bottom edge, enter the target's top edge.
  if (to.y >= from.y + from.height) {
    const startX = fromCenterX
    const startY = from.y + from.height
    const endX = toCenterX
    const endY = to.y
    const bend = Math.max(28, (endY - startY) / 2)
    return {
      path: `M ${startX} ${startY} ${cubic(startX, startY + bend, endX, endY - bend)} ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2,
    }
  }

  // Above the source: start at its top edge, enter the target's bottom edge.
  if (to.y + to.height <= from.y) {
    const startX = fromCenterX
    const startY = from.y
    const endX = toCenterX
    const endY = to.y + to.height
    const bend = Math.max(28, (startY - endY) / 2)
    return {
      path: `M ${startX} ${startY} ${cubic(startX, startY - bend, endX, endY + bend)} ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2,
    }
  }

  // Same lane or overlapping rows: leave the right edge, enter the left edge
  // when possible, otherwise both sides sit too close and the edge loops right.
  if (toCenterX >= fromCenterX) {
    const startX = from.x + from.width
    const startY = fromCenterY
    const endX = to.x
    const endY = toCenterY
    const bend = Math.max(26, (endX - startX) / 2)
    return {
      path: `M ${startX} ${startY} ${cubic(startX + bend, startY, endX - bend, endY)} ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2,
    }
  }

  const startX = from.x
  const startY = fromCenterY
  const endX = to.x + to.width
  const endY = toCenterY
  const bend = Math.max(26, (startX - endX) / 2)
  return {
    path: `M ${startX} ${startY} ${cubic(startX - bend, startY, endX + bend, endY)} ${endX} ${endY}`,
    labelX: (startX + endX) / 2,
    labelY: (startY + endY) / 2,
  }
}

/** Point where the ray from a box centre toward `target` leaves the box border. */
function borderPoint(box: GraphCanvasBox, target: GraphCanvasBox): { x: number; y: number } {
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const deltaX = target.x + target.width / 2 - centerX
  const deltaY = target.y + target.height / 2 - centerY
  if (deltaX === 0 && deltaY === 0) return { x: centerX, y: centerY }
  const scaleX = deltaX === 0 ? Number.POSITIVE_INFINITY : (box.width / 2) / Math.abs(deltaX)
  const scaleY = deltaY === 0 ? Number.POSITIVE_INFINITY : (box.height / 2) / Math.abs(deltaY)
  const scale = Math.min(scaleX, scaleY)
  return { x: centerX + deltaX * scale, y: centerY + deltaY * scale }
}

/**
 * Straight path between two boxes placed by relation distance rather than by a
 * lane grid. The line leaves and enters a border, so it never crosses a card.
 */
export function graphCanvasRadialEdgePath(
  from: GraphCanvasBox,
  to: GraphCanvasBox,
): GraphCanvasEdgePath {
  if (from.x === to.x && from.y === to.y) return selfLoopPath(from)
  const start = borderPoint(from, to)
  const end = borderPoint(to, from)
  return {
    path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2,
  }
}
