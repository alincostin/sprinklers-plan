export interface Vec2 {
  x: number
  y: number
}

export const distance = (a: Vec2, b: Vec2): number =>
  Math.hypot(b.x - a.x, b.y - a.y)

export const snapToGrid = (p: Vec2, gridSize: number): Vec2 => ({
  x: Math.round(p.x / gridSize) * gridSize,
  y: Math.round(p.y / gridSize) * gridSize,
})

/**
 * Project point `p` onto the line through `origin` in direction `dir`,
 * used for Shift-constrained (keep-the-line-straight) movement.
 */
export const projectOntoDirection = (p: Vec2, origin: Vec2, dir: Vec2): Vec2 => {
  const len = Math.hypot(dir.x, dir.y)
  if (len === 0) return origin
  const ux = dir.x / len
  const uy = dir.y / len
  const t = (p.x - origin.x) * ux + (p.y - origin.y) * uy
  return { x: origin.x + t * ux, y: origin.y + t * uy }
}

/**
 * Move segment endpoint `end` along the segment direction so that the
 * segment from `start` gets the exact `length` — used by the dimension input.
 */
export const setSegmentLength = (start: Vec2, end: Vec2, length: number): Vec2 => {
  const d = distance(start, end)
  if (d === 0) return { x: start.x + length, y: start.y }
  const s = length / d
  return { x: start.x + (end.x - start.x) * s, y: start.y + (end.y - start.y) * s }
}
