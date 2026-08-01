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
 * Magnetic snap, per axis: each coordinate locks onto its nearest grid line
 * only when within `threshold` of it, and stays free otherwise.
 */
export const magneticSnap = (p: Vec2, gridSize: number, threshold: number): Vec2 => {
  const sx = Math.round(p.x / gridSize) * gridSize
  const sy = Math.round(p.y / gridSize) * gridSize
  return {
    x: Math.abs(sx - p.x) <= threshold ? sx : p.x,
    y: Math.abs(sy - p.y) <= threshold ? sy : p.y,
  }
}

/**
 * Project point `p` onto the line through `origin` in direction `dir`,
 * used for Shift-constrained (keep-the-line-straight) dragging.
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
 * Keep only the component of `delta` along `dir` — Shift-constrained
 * arrow-key movement (the adjacent segment stays straight).
 */
export const constrainToDirection = (delta: Vec2, dir: Vec2): Vec2 => {
  const len = Math.hypot(dir.x, dir.y)
  if (len === 0) return delta
  const ux = dir.x / len
  const uy = dir.y / len
  const t = delta.x * ux + delta.y * uy
  return { x: t * ux, y: t * uy }
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

/** Shoelace area of a polygon, in m². */
export const polygonArea = (pts: Vec2[]): number => {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** Consecutive point pairs of the terrain outline (wraps around when closed). */
export const segmentsOf = <T extends Vec2>(pts: T[], closed: boolean): [T, T][] => {
  if (pts.length < 2) return []
  const pairs: [T, T][] = []
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) pairs.push([pts[i], pts[(i + 1) % pts.length]])
  return pairs
}
