import { useEffect, useRef, useState } from 'react'
import {
  alignmentSnap,
  distance,
  magneticSnap,
  projectOntoDirection,
  constrainToDirection,
  segmentsOf,
  type Alignment,
  type Vec2,
} from '../geometry/geometry'
import { beginTransient, endTransient, redo, undo, useDesignStore } from '../state/store'
import type { TerrainPoint } from '../model/types'
import { UNITS, formatLength, fromUnit, type Unit } from '../units'

const MAGNET_PX = 8
const CLOSE_PX = 12
/** Edge auto-pan (draw hover / point drag): hot band width and top speed. */
const EDGE_PAN_ZONE_PX = 36
const EDGE_PAN_MAX_SPEED = 900 // px/sec at full penetration
/** Pan limit: the design's bbox (the origin before any point exists) must
 * keep at least this much of itself inside the viewport — the view
 * hard-stops rather than wandering into empty space. */
const PAN_LIMIT_MARGIN_PX = 48
/** Snap-grid lines render only when their on-screen spacing is at least this. */
const SNAP_GRID_MIN_PX = 8

/** Zoom limits are unit-independent: the floor is content-based (you cannot
 * zoom out past the terrain filling the viewport, padded); the absolute
 * px-per-meter floor applies only while nothing is drawn. Ceiling is
 * ZOOM_MAX_MAGNIFICATION × physical 1:1 scale (screen-calibrated); past 1:1
 * the scale bar shows a magnification badge instead of forbidding it. */
const ZOOM_MIN_PX_PER_M = 5
const ZOOM_MAX_MAGNIFICATION = 10
/** Margin (px, per side) kept around the terrain at maximum zoom-out. */
const VIEWPORT_FIT_PAD_PX = 24
/** CSS anchors 1in ≡ 96px, so this is one on-screen "physical" meter at
 * nominal calibration. */
const PHYSICAL_PX_PER_M = (96 / 2.54) * 100

/** Point circle sizes in screen px — tweak here to resize all editor points. */
const POINT_RADIUS = 5
const POINT_RADIUS_SELECTED = 6.5
const POINT_STROKE = 2

interface View {
  x: number
  y: number
  scale: number // pixels per meter
}

/** Pan/zoom persist per browser so a reload restores the same view. */
const VIEW_KEY = 'sprinklers-plan:view'
const DEFAULT_VIEW: View = { x: 80, y: 80, scale: 40 }

function loadView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '')
    if (Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.scale) && v.scale > 0) {
      // over-ceiling scales are re-clamped by the calibration effect on
      // mount; off-limits positions by the pan-limit effect once the
      // viewport size is known
      return { x: v.x, y: v.y, scale: v.scale }
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_VIEW
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function boundsOf(pts: readonly Vec2[]): Bounds | null {
  if (pts.length === 0) return null
  let minX = pts[0].x
  let maxX = pts[0].x
  let minY = pts[0].y
  let maxY = pts[0].y
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Zoom-out floor: the scale at which the terrain (padded) exactly fits the
 * viewport. Falls back to the absolute floor when there is nothing to fit. */
function contentMinZoom(w: number, h: number, pts: Vec2[]): number {
  if (pts.length < 2) return ZOOM_MIN_PX_PER_M
  const b = boundsOf(pts)!
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  const pad = 2 * VIEWPORT_FIT_PAD_PX
  const fits: number[] = []
  if (bw > 0 && w > pad) fits.push((w - pad) / bw)
  if (bh > 0 && h > pad) fits.push((h - pad) / bh)
  if (fits.length === 0) return ZOOM_MIN_PX_PER_M
  return Math.min(...fits)
}

/** World bbox the pan limit anchors to: the terrain, or the origin when the
 * design is empty so an empty canvas still cannot wander. Reads getState()
 * so mount-once closures (wheel listener, rAF tick) stay fresh. */
function designBounds(): Bounds {
  const pts = useDesignStore.getState().design.terrain.points
  return boundsOf(pts) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
}

/** Clamp x/y (never scale) so the bbox keeps ≥ margin px on screen.
 * screenX = worldX·s + x ⇒ the bbox spans [minX·s+x, maxX·s+x]:
 *   right edge ≥ M  ⇒  x ≥ M − maxX·s
 *   left edge ≤ w−M ⇒  x ≤ w − M − minX·s
 * The effective margin shrinks to half the viewport so the range is never
 * empty. Returns `v` itself when already inside (lets setView bail out). */
function clampView(v: View, size: { w: number; h: number }, b: Bounds): View {
  if (!size.w || !size.h) return v // pre-ResizeObserver render — size unknown
  const mw = Math.min(PAN_LIMIT_MARGIN_PX, size.w / 2)
  const mh = Math.min(PAN_LIMIT_MARGIN_PX, size.h / 2)
  const s = v.scale
  const x = Math.max(mw - b.maxX * s, Math.min(size.w - mw - b.minX * s, v.x))
  const y = Math.max(mh - b.maxY * s, Math.min(size.h - mh - b.minY * s, v.y))
  return x === v.x && y === v.y ? v : { ...v, x, y }
}

const isEditableTarget = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/** −1..1 penetration toward an edge (left/top negative); clamps to full speed
 * past the edge, where a captured drag still reports positions. */
const edgeFactor = (pos: number, min: number, max: number): number => {
  if (pos < min + EDGE_PAN_ZONE_PX)
    return -Math.min(1, (min + EDGE_PAN_ZONE_PX - pos) / EDGE_PAN_ZONE_PX)
  if (pos > max - EDGE_PAN_ZONE_PX)
    return Math.min(1, (pos - (max - EDGE_PAN_ZONE_PX)) / EDGE_PAN_ZONE_PX)
  return 0
}

/** SVG drawing surface: grid, terrain outline, points, labels, interactions. */
export function Canvas() {
  const design = useDesignStore((s) => s.design)
  const mode = useDesignStore((s) => s.mode)
  const selection = useDesignStore((s) => s.selection)
  const snap = useDesignStore((s) => s.snap)
  const snapStep = useDesignStore((s) => s.snapStep)
  const showGrid = useDesignStore((s) => s.showGrid)
  const alignAid = useDesignStore((s) => s.alignAid)
  // hiding the grid deactivates snapping — there is nothing visible to snap to
  const snapActive = snap && showGrid
  const { addTerrainPoint, closeTerrain, movePoint, select } = useDesignStore.getState()

  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<View>(loadView)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragSnap, setDragSnap] = useState<Vec2 | null>(null)
  const [dragAlign, setDragAlign] = useState<Alignment>({})
  const dragSnapRef = useRef<Vec2 | null>(null)

  const spaceRef = useRef(false)
  const panRef = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null)
  const dragRef = useRef<{ id: string; origin: Vec2; anchor: Vec2 | null } | null>(null)

  // Edge auto-pan runs on a rAF loop where React state would be stale, so it
  // works off refs: the current view, the last raw pointer position, and the
  // modifier keys (the pointer is frozen while the view slides under it).
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const modRef = useRef({ shift: false, alt: false })
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)

  const drawFrom = useDesignStore((s) => s.drawFrom)
  const showScale = useDesignStore((s) => s.showScale)
  const unit = useDesignStore((s) => s.design.unit)

  const pts = design.terrain.points
  const closed = design.terrain.closed
  const segments = segmentsOf(pts, closed)
  // drawing extends from this end; clicking the opposite end closes the outline
  const anchorPt = pts.length > 0 ? pts[drawFrom === 'start' ? 0 : pts.length - 1] : undefined
  const closeIdx = drawFrom === 'start' ? pts.length - 1 : 0

  const toWorld = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - view.x) / view.scale,
      y: (e.clientY - rect.top - view.y) / view.scale,
    }
  }

  // Track viewport size for grid bounds.
  useEffect(() => {
    const el = svgRef.current!
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Persist the view (debounced — pans/zooms arrive in bursts).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(view))
      } catch {
        // storage unavailable
      }
    }, 300)
    return () => clearTimeout(t)
  }, [view])

  // Re-clamp the zoom if a calibration change lowers the ceiling, anchored
  // at the viewport center to avoid a jarring snap on the next wheel tick.
  const calibration = useDesignStore((s) => s.calibration)
  useEffect(() => {
    const maxScale = PHYSICAL_PX_PER_M * calibration * ZOOM_MAX_MAGNIFICATION
    setView((v) => {
      if (v.scale <= maxScale) return v
      const cx = size.w / 2
      const cy = size.h / 2
      const wx = (cx - v.x) / v.scale
      const wy = (cy - v.y) / v.scale
      return clampView(
        { scale: maxScale, x: cx - wx * maxScale, y: cy - wy * maxScale },
        size,
        designBounds(),
      )
    })
  }, [calibration, size.w, size.h])

  // Pan limit, reactive side: re-clamp when the reachable area changes under
  // a fixed view — the bbox shrinks (point delete, undo/redo, drag inward) or
  // is swapped (Import/Paste/New), the viewport resizes, or the scale changes.
  // Also sanitizes a stale persisted view once the ResizeObserver reports a
  // real size (clampView is a no-op while size is 0×0).
  useEffect(() => {
    setView((v) => clampView(v, size, designBounds()))
  }, [pts, size.w, size.h, view.scale])

  // Wheel zoom anchored at the cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const svg = svgRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const st = useDesignStore.getState()
      const maxScale = PHYSICAL_PX_PER_M * st.calibration * ZOOM_MAX_MAGNIFICATION
      const minScale = Math.min(
        maxScale,
        contentMinZoom(rect.width, rect.height, st.design.terrain.points),
      )
      setView((v) => {
        const scale = Math.min(maxScale, Math.max(minScale, v.scale * Math.exp(-e.deltaY * 0.0015)))
        const wx = (mx - v.x) / v.scale
        const wy = (my - v.y) / v.scale
        return clampView(
          { scale, x: mx - wx * scale, y: my - wy * scale },
          { w: rect.width, h: rect.height },
          designBounds(),
        )
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // Global keyboard: space (pan), arrows (nudge), Enter/Escape/Delete, undo/redo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftHeld(true)
        modRef.current.shift = true
      }
      if (e.key === 'Alt') {
        setAltHeld(true)
        modRef.current.alt = true
      }
      if (isEditableTarget(e)) return
      if (e.key === ' ') {
        e.preventDefault()
        spaceRef.current = true
        setSpaceHeld(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }

      const s = useDesignStore.getState()
      if (e.key === 'Enter' && s.mode === 'draw') {
        s.closeTerrain()
        return
      }
      if (e.key === 'Escape') {
        if (s.mode === 'draw') s.setMode('select')
        else s.select(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection?.kind === 'point') {
        s.deletePoint(s.selection.id)
        return
      }

      const dirs: Record<string, Vec2> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      }
      const dir = dirs[e.key]
      if (dir && s.selection?.kind === 'point') {
        e.preventDefault()
        const points = s.design.terrain.points
        const i = points.findIndex((p) => p.id === (s.selection as { id: string }).id)
        if (i < 0) return
        const pt = points[i]
        const nudge = UNITS[s.design.unit].nudge
        const step = fromUnit(e.ctrlKey || e.metaKey ? nudge[1] : nudge[0], s.design.unit)
        let d = { x: dir.x * step, y: dir.y * step }
        if (e.shiftKey) {
          const anchor = neighborOf(points, i, s.design.terrain.closed)
          if (anchor) d = constrainToDirection(d, { x: pt.x - anchor.x, y: pt.y - anchor.y })
        }
        if (d.x !== 0 || d.y !== 0) s.movePoint(pt.id, pt.x + d.x, pt.y + d.y)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftHeld(false)
        modRef.current.shift = false
      }
      if (e.key === 'Alt') {
        setAltHeld(false)
        modRef.current.alt = false
      }
      if (e.key === ' ') {
        spaceRef.current = false
        setSpaceHeld(false)
        // resume edge auto-pan if the cursor is parked in the hot band
        scheduleAutoPan()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      panRef.current = { cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y }
      svgRef.current!.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const p = toWorld(e)
    if (mode === 'draw' && !closed) {
      if (pts.length >= 3 && distance(p, pts[closeIdx]) < CLOSE_PX / view.scale) {
        closeTerrain()
        return
      }
      addTerrainPoint(nextDrawPoint(p, e.shiftKey, e.altKey).point)
    } else {
      select(null)
    }
  }

  /**
   * Where the next terrain point would land: Shift locks the new segment to
   * the nearest of the 8 compass directions (horizontal, vertical, or 45°
   * diagonal). Without Shift, each coordinate first tries to align with an
   * existing point (inference guide) and otherwise falls to the grid magnet;
   * Alt disables all of it. `snapped` reports a fully locked position (drives
   * the click-point marker); `align` carries the engaged guides.
   */
  const nextDrawPoint = (
    p: Vec2,
    shift: boolean,
    alt: boolean,
  ): { point: Vec2; snapped: boolean; align: Alignment } => {
    const magnet = snapActive && !alt
    const threshold = MAGNET_PX / view.scale
    const last = anchorPt
    if (!shift || !last) {
      const align = alt || !alignAid ? {} : alignmentSnap(p, pts, threshold)
      const m = magnet ? magneticSnap(p, snapStep, threshold) : p
      const point = {
        x: align.x ? align.x.value : m.x,
        y: align.y ? align.y.value : m.y,
      }
      const snapped = (!!align.x || m.x !== p.x) && (!!align.y || m.y !== p.y)
      return { point, snapped, align }
    }
    const oct = ((Math.round(Math.atan2(p.y - last.y, p.x - last.x) / (Math.PI / 4)) % 8) + 8) % 8
    if (oct === 0 || oct === 4) {
      const sx = Math.round(p.x / snapStep) * snapStep
      const engaged = magnet && Math.abs(sx - p.x) <= threshold
      return { point: { x: engaged ? sx : p.x, y: last.y }, snapped: engaged, align: {} }
    }
    if (oct === 2 || oct === 6) {
      const sy = Math.round(p.y / snapStep) * snapStep
      const engaged = magnet && Math.abs(sy - p.y) <= threshold
      return { point: { x: last.x, y: engaged ? sy : p.y }, snapped: engaged, align: {} }
    }
    // 45° diagonal: project the cursor onto the diagonal ray; the magnet
    // pulls the per-axis offset onto a multiple of the grid step, which is
    // a snap-grid intersection whenever the anchor sits on the grid.
    const ux = oct === 1 || oct === 7 ? 1 : -1
    const uy = oct === 1 || oct === 3 ? 1 : -1
    const t = ((p.x - last.x) * ux + (p.y - last.y) * uy) / 2
    const st = Math.round(t / snapStep) * snapStep
    const engaged = magnet && Math.abs(st - t) * Math.SQRT2 <= threshold
    const u = engaged ? st : t
    return { point: { x: last.x + u * ux, y: last.y + u * uy }, snapped: engaged, align: {} }
  }

  /**
   * Move the dragged point to follow world position `p`. Shared by the pointer
   * handler and the auto-pan tick (which has no pointer event, hence explicit
   * modifiers). Reads snap settings via getState() so it is closure-safe when
   * called from a stale rAF callback.
   */
  const applyDragMove = (p: Vec2, shift: boolean, alt: boolean, scale: number) => {
    const drag = dragRef.current
    if (!drag) return
    const s = useDesignStore.getState()
    // The point follows the cursor freely; a nearby landing position (point
    // alignment and/or grid) is only marked as a candidate (dotted circle,
    // guide lines) and applied on release.
    let target = p
    let candidate: Vec2 | null = null
    let align: Alignment = {}
    if (shift && drag.anchor && distance(drag.origin, drag.anchor) > 0) {
      target = projectOntoDirection(p, drag.anchor, {
        x: drag.origin.x - drag.anchor.x,
        y: drag.origin.y - drag.anchor.y,
      })
    } else {
      const threshold = MAGNET_PX / scale
      if (!alt && s.alignAid)
        align = alignmentSnap(
          p,
          s.design.terrain.points.filter((pt) => pt.id !== drag.id),
          threshold,
        )
      const gridOn = s.snap && s.showGrid && !alt
      const m = gridOn ? magneticSnap(p, s.snapStep, threshold) : p
      if (align.x || align.y) {
        // aligned axes take the source point's coordinate; the other axis
        // keeps the grid magnet's value (or stays free)
        candidate = { x: align.x ? align.x.value : m.x, y: align.y ? align.y.value : m.y }
      } else if (gridOn && m.x !== p.x && m.y !== p.y) {
        candidate = m
      }
    }
    dragSnapRef.current = candidate
    setDragSnap(candidate)
    setDragAlign(align)
    movePoint(drag.id, target.x, target.y)
  }

  // Auto-pan only helps gestures that place or move geometry: drawing an open
  // outline (hover) or dragging a point. Manual pan always wins.
  const autoPanEligible = (): boolean => {
    if (panRef.current || spaceRef.current) return false
    if (dragRef.current) return true
    if (!pointerRef.current) return false // pointer left the canvas
    const s = useDesignStore.getState()
    return s.mode === 'draw' && !s.design.terrain.closed
  }

  const autoPanTick = (t: number) => {
    rafRef.current = null
    const ptr = pointerRef.current
    const svg = svgRef.current
    if (!ptr || !svg || !autoPanEligible()) return
    const rect = svg.getBoundingClientRect()
    const vx = edgeFactor(ptr.clientX, rect.left, rect.right) * EDGE_PAN_MAX_SPEED
    const vy = edgeFactor(ptr.clientY, rect.top, rect.bottom) * EDGE_PAN_MAX_SPEED
    if (vx === 0 && vy === 0) return // cursor left the hot band — loop dies
    const dt = Math.min((t - lastTickRef.current) / 1000, 0.05) // clamp tab-switch gaps
    lastTickRef.current = t
    const v = viewRef.current
    const next = clampView(
      { ...v, x: v.x - vx * dt, y: v.y - vy * dt },
      { w: rect.width, h: rect.height },
      designBounds(),
    )
    if (next.x !== v.x || next.y !== v.y) {
      viewRef.current = next
      setView(next)
      // The world position under the (edge-clamped) frozen pointer changed:
      // refresh the draw preview and, when dragging, the point itself.
      const cx = Math.min(Math.max(ptr.clientX, rect.left), rect.right)
      const cy = Math.min(Math.max(ptr.clientY, rect.top), rect.bottom)
      const p = {
        x: (cx - rect.left - next.x) / next.scale,
        y: (cy - rect.top - next.y) / next.scale,
      }
      setCursor(p)
      if (dragRef.current) applyDragMove(p, modRef.current.shift, modRef.current.alt, next.scale)
    }
    // Reschedule even when fully clamped: placing a point near the edge grows
    // the bbox without a pointer move, and panning must resume next frame.
    rafRef.current = requestAnimationFrame(autoPanTick)
  }

  /** Arm the auto-pan loop; idempotent, the tick itself decides whether to run. */
  const scheduleAutoPan = () => {
    if (rafRef.current !== null) return
    lastTickRef.current = performance.now()
    rafRef.current = requestAnimationFrame(autoPanTick)
  }

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const onPointerMove = (e: React.PointerEvent) => {
    pointerRef.current = { clientX: e.clientX, clientY: e.clientY }
    modRef.current = { shift: e.shiftKey, alt: e.altKey }
    if (panRef.current) {
      const pan = panRef.current
      setView((v) =>
        clampView(
          { ...v, x: pan.vx + e.clientX - pan.cx, y: pan.vy + e.clientY - pan.cy },
          size,
          designBounds(),
        ),
      )
      return
    }
    const p = toWorld(e)
    setCursor(p)
    applyDragMove(p, e.shiftKey, e.altKey, view.scale)
    scheduleAutoPan()
  }

  const onPointerUp = () => {
    panRef.current = null
    if (dragRef.current) {
      const candidate = dragSnapRef.current
      if (candidate) movePoint(dragRef.current.id, candidate.x, candidate.y)
      dragSnapRef.current = null
      setDragSnap(null)
      setDragAlign({})
      dragRef.current = null
      setDraggingId(null)
      endTransient()
    }
  }

  const onPointPointerDown = (e: React.PointerEvent, pt: TerrainPoint, i: number) => {
    if (e.button !== 0 || spaceRef.current) return
    e.stopPropagation()
    if (mode === 'draw' && !closed) {
      if (i === closeIdx && pts.length >= 3) closeTerrain()
      return
    }
    select({ kind: 'point', id: pt.id })
    beginTransient()
    dragRef.current = {
      id: pt.id,
      origin: { x: pt.x, y: pt.y },
      anchor: neighborOf(pts, i, closed),
    }
    setDraggingId(pt.id)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    // the grabbed point may already sit in the edge band
    pointerRef.current = { clientX: e.clientX, clientY: e.clientY }
    modRef.current = { shift: e.shiftKey, alt: e.altKey }
    scheduleAutoPan()
  }

  const px = (v: number) => v / view.scale // screen-constant size in world units
  const selectedPointId = selection?.kind === 'point' ? selection.id : null
  const selectedSegment = selection?.kind === 'segment' ? selection.index : null
  const nearClose =
    mode === 'draw' && !closed && cursor && pts.length >= 3
      ? distance(cursor, pts[closeIdx]) < CLOSE_PX / view.scale
      : false

  const outlinePath =
    pts.length >= 2
      ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + (closed ? ' Z' : '')
      : ''

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{
        display: 'block',
        background: '#fdfdfd',
        cursor: spaceHeld ? 'grab' : mode === 'draw' && !closed ? 'crosshair' : 'default',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        // A captured drag keeps receiving moves outside the canvas and may
        // keep auto-panning; otherwise leaving the canvas ends the hover pan.
        if (!dragRef.current) {
          setCursor(null)
          pointerRef.current = null
        }
      }}
    >
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {showGrid && <Grid view={view} size={size} />}

        {closed && outlinePath && <path d={outlinePath} fill="rgba(34,197,94,0.10)" stroke="none" />}
        {outlinePath && (
          <path
            d={outlinePath}
            fill="none"
            stroke="#16a34a"
            strokeWidth={px(2)}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}

        {/* segment hit areas + selection highlight */}
        {mode === 'select' &&
          segments.map(([a, b], i) => (
            <line
              key={`seg-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={selectedSegment === i ? '#f59e0b' : 'transparent'}
              strokeWidth={selectedSegment === i ? px(3.5) : px(12)}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                if (e.button !== 0 || spaceRef.current) return
                e.stopPropagation()
                select({ kind: 'segment', index: i })
              }}
            />
          ))}

        {/* live segment length labels */}
        {segments.map(([a, b], i) => (
          <SegmentLabel
            key={`lab-${i}`}
            a={a}
            b={b}
            scale={view.scale}
            emphasized={
              draggingId !== null
                ? a.id === draggingId || b.id === draggingId
                : selectedSegment === i
            }
          />
        ))}

        {/* preview segment while drawing */}
        {mode === 'draw' && !closed && cursor && (() => {
          const { point: preview, snapped, align } = nearClose
            ? { point: pts[closeIdx], snapped: false, align: {} as Alignment }
            : nextDrawPoint(cursor, shiftHeld, altHeld)
          return (
            <>
              {align.x && <GuideLine from={align.x.source} to={preview} scale={view.scale} />}
              {align.y && <GuideLine from={align.y.source} to={preview} scale={view.scale} />}
              {anchorPt && (
                <>
                  <line
                    x1={anchorPt.x}
                    y1={anchorPt.y}
                    x2={preview.x}
                    y2={preview.y}
                    stroke="#16a34a"
                    strokeWidth={px(1.5)}
                    strokeDasharray={`${px(6)} ${px(4)}`}
                    pointerEvents="none"
                  />
                  <SegmentLabel a={anchorPt} b={preview} scale={view.scale} emphasized />
                </>
              )}
              {snapped && <SnapMarker p={preview} scale={view.scale} />}
            </>
          )
        })()}

        {/* dotted preview of where the dragged point will land on release,
            with inference guides explaining any point alignment */}
        {dragSnap && dragAlign.x && (
          <GuideLine from={dragAlign.x.source} to={dragSnap} scale={view.scale} />
        )}
        {dragSnap && dragAlign.y && (
          <GuideLine from={dragAlign.y.source} to={dragSnap} scale={view.scale} />
        )}
        {dragSnap && <SnapMarker p={dragSnap} scale={view.scale} />}

        {/* points */}
        {pts.map((pt, i) => {
          const isSelected = pt.id === selectedPointId
          const isCloseTarget = i === closeIdx && nearClose
          return (
            <circle
              key={pt.id}
              cx={pt.x}
              cy={pt.y}
              r={px(isSelected ? POINT_RADIUS_SELECTED : POINT_RADIUS)}
              fill={isSelected || isCloseTarget ? '#16a34a' : '#fff'}
              stroke="#16a34a"
              strokeWidth={px(POINT_STROKE)}
              style={{ cursor: mode === 'select' ? 'move' : 'pointer' }}
              onPointerDown={(e) => onPointPointerDown(e, pt, i)}
            />
          )
        })}
      </g>

      {showScale && size.h > 0 && <ScaleBar scale={view.scale} height={size.h} unit={unit} />}
    </svg>
  )
}

/**
 * Map-style scale bar (bottom-left, screen space): picks the largest "nice"
 * length (1/2/5 × 10ⁿ in the project unit) that fits ~150 px at the current
 * zoom, so it updates live as the user zooms.
 */
function ScaleBar({ scale, height, unit }: { scale: number; height: number; unit: Unit }) {
  const calibration = useDesignStore((s) => s.calibration)
  const u = UNITS[unit]
  const pxPerUnit = u.factor * scale
  let best: { v: number; w: number } | null = null
  for (let k = -3; k <= 5; k++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k
      const w = v * pxPerUnit
      if (w <= 150 && (!best || w > best.w)) best = { v, w }
    }
  }
  if (!best || best.w < 20) return null
  const x = 16
  const y = height - 22
  // Past physical 1:1 the bar overstates real-world size — say so explicitly.
  const magnification = scale / (PHYSICAL_PX_PER_M * calibration)
  return (
    <g pointerEvents="none" fontSize={11} fill="#374151">
      <rect x={x} y={y} width={best.w / 2} height={5} fill="#374151" />
      <rect x={x + best.w / 2} y={y} width={best.w / 2} height={5} fill="#fff" />
      <rect x={x} y={y} width={best.w} height={5} fill="none" stroke="#374151" strokeWidth={1} />
      <text x={x} y={y - 5}>
        0
      </text>
      <text x={x + best.w} y={y - 5} textAnchor="end">
        {+best.v.toFixed(3)} {u.label}
      </text>
      {magnification >= 1.05 && (
        <text x={x + best.w + 8} y={y + 5} fill="#b45309" fontWeight={600}>
          × {+magnification.toFixed(1)}
        </text>
      )}
    </g>
  )
}

function neighborOf(points: TerrainPoint[], i: number, closed: boolean): Vec2 | null {
  if (points.length < 2) return null
  if (i > 0) return points[i - 1]
  if (closed) return points[points.length - 1]
  return points[1] ?? null
}

/** SketchUp-style inference guide: dotted amber line from the aligned source
 * point to the snapped position, with a ring highlighting the source. */
function GuideLine({ from, to, scale }: { from: Vec2; to: Vec2; scale: number }) {
  return (
    <g pointerEvents="none">
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#f59e0b"
        strokeWidth={1.25 / scale}
        strokeDasharray={`${2 / scale} ${3 / scale}`}
      />
      <circle
        cx={from.x}
        cy={from.y}
        r={7.5 / scale}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={1.25 / scale}
      />
    </g>
  )
}

/** Dotted circle marking a magnet-locked position (the point will land here). */
function SnapMarker({ p, scale }: { p: Vec2; scale: number }) {
  return (
    <circle
      cx={p.x}
      cy={p.y}
      r={5.5 / scale}
      fill="none"
      stroke="#16a34a"
      strokeWidth={1.25 / scale}
      strokeDasharray={`${2.5 / scale} ${2.5 / scale}`}
      pointerEvents="none"
    />
  )
}

function SegmentLabel({
  a,
  b,
  scale,
  emphasized,
}: {
  a: Vec2
  b: Vec2
  scale: number
  emphasized?: boolean
}) {
  const unit = useDesignStore((s) => s.design.unit)
  const d = distance(a, b)
  if (d === 0) return null
  // offset the label perpendicular to the segment so it doesn't sit on the line
  const nx = -(b.y - a.y) / d
  const ny = (b.x - a.x) / d
  const off = 12 / scale
  return (
    <text
      x={(a.x + b.x) / 2 + nx * off}
      y={(a.y + b.y) / 2 + ny * off}
      fontSize={12 / scale}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={emphasized ? '#b45309' : '#6b7280'}
      fontWeight={emphasized ? 600 : 400}
      pointerEvents="none"
    >
      {formatLength(d, unit)}
    </text>
  )
}

function Grid({ view, size }: { view: View; size: { w: number; h: number } }) {
  const snap = useDesignStore((s) => s.snap)
  const snapStep = useDesignStore((s) => s.snapStep)
  if (!size.w || !size.h) return null
  const minX = (0 - view.x) / view.scale
  const maxX = (size.w - view.x) / view.scale
  const minY = (0 - view.y) / view.scale
  const maxY = (size.h - view.y) / view.scale
  const step = view.scale < 14 ? 5 : 1
  const lines: React.ReactElement[] = []

  // Snap layer: faint green lines at the snap step, only when legible on screen.
  if (snap && snapStep * view.scale >= SNAP_GRID_MIN_PX) {
    const stroke = 'rgba(22,163,74,0.16)'
    const w = 1 / view.scale
    for (let k = Math.floor(minX / snapStep); k * snapStep <= maxX; k++) {
      lines.push(
        <line key={`sv${k}`} x1={k * snapStep} y1={minY} x2={k * snapStep} y2={maxY} stroke={stroke} strokeWidth={w} />,
      )
    }
    for (let k = Math.floor(minY / snapStep); k * snapStep <= maxY; k++) {
      lines.push(
        <line key={`sh${k}`} x1={minX} y1={k * snapStep} x2={maxX} y2={k * snapStep} stroke={stroke} strokeWidth={w} />,
      )
    }
  }
  for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
    lines.push(
      <line
        key={`v${x}`}
        x1={x}
        y1={minY}
        x2={x}
        y2={maxY}
        stroke={x === 0 ? '#c8c8c8' : x % 5 === 0 ? '#e0e0e0' : '#efefef'}
        strokeWidth={1 / view.scale}
      />,
    )
  }
  for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
    lines.push(
      <line
        key={`h${y}`}
        x1={minX}
        y1={y}
        x2={maxX}
        y2={y}
        stroke={y === 0 ? '#c8c8c8' : y % 5 === 0 ? '#e0e0e0' : '#efefef'}
        strokeWidth={1 / view.scale}
      />,
    )
  }
  return <g pointerEvents="none">{lines}</g>
}
