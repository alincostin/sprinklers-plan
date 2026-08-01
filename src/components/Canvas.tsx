import { useEffect, useRef, useState } from 'react'
import {
  distance,
  magneticSnap,
  projectOntoDirection,
  constrainToDirection,
  segmentsOf,
  type Vec2,
} from '../geometry/geometry'
import { beginTransient, endTransient, redo, undo, useDesignStore } from '../state/store'
import type { TerrainPoint } from '../model/types'

const MAGNET_PX = 8
const CLOSE_PX = 12

interface View {
  x: number
  y: number
  scale: number // pixels per meter
}

const isEditableTarget = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/** SVG drawing surface: grid, terrain outline, points, labels, interactions. */
export function Canvas() {
  const design = useDesignStore((s) => s.design)
  const mode = useDesignStore((s) => s.mode)
  const selection = useDesignStore((s) => s.selection)
  const snap = useDesignStore((s) => s.snap)
  const snapStep = useDesignStore((s) => s.snapStep)
  const { addTerrainPoint, closeTerrain, movePoint, select } = useDesignStore.getState()

  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<View>({ x: 80, y: 80, scale: 40 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const spaceRef = useRef(false)
  const panRef = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null)
  const dragRef = useRef<{ id: string; origin: Vec2; anchor: Vec2 | null } | null>(null)

  const pts = design.terrain.points
  const closed = design.terrain.closed
  const segments = segmentsOf(pts, closed)

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

  // Wheel zoom anchored at the cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const svg = svgRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setView((v) => {
        const scale = Math.min(400, Math.max(5, v.scale * Math.exp(-e.deltaY * 0.0015)))
        const wx = (mx - v.x) / v.scale
        const wy = (my - v.y) / v.scale
        return { scale, x: mx - wx * scale, y: my - wy * scale }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // Global keyboard: space (pan), arrows (nudge), Enter/Escape/Delete, undo/redo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true)
      if (e.key === 'Alt') setAltHeld(true)
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
        const step = e.ctrlKey || e.metaKey ? 1 : 0.1
        let d = { x: dir.x * step, y: dir.y * step }
        if (e.shiftKey) {
          const anchor = neighborOf(points, i, s.design.terrain.closed)
          if (anchor) d = constrainToDirection(d, { x: pt.x - anchor.x, y: pt.y - anchor.y })
        }
        if (d.x !== 0 || d.y !== 0) s.movePoint(pt.id, pt.x + d.x, pt.y + d.y)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false)
      if (e.key === 'Alt') setAltHeld(false)
      if (e.key === ' ') {
        spaceRef.current = false
        setSpaceHeld(false)
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
      if (pts.length >= 3 && distance(p, pts[0]) < CLOSE_PX / view.scale) {
        closeTerrain()
        return
      }
      addTerrainPoint(nextDrawPoint(p, e.shiftKey, e.altKey))
    } else {
      select(null)
    }
  }

  /**
   * Where the next terrain point would land: Shift locks the new segment
   * horizontal or vertical (whichever is closer); magnetic snap pulls onto
   * the grid only when near it, and Alt disables it entirely.
   */
  const nextDrawPoint = (p: Vec2, shift: boolean, alt: boolean): Vec2 => {
    const magnet = snap && !alt
    const threshold = MAGNET_PX / view.scale
    const last = pts[pts.length - 1]
    if (!shift || !last) return magnet ? magneticSnap(p, snapStep, threshold) : p
    if (Math.abs(p.x - last.x) >= Math.abs(p.y - last.y)) {
      const sx = Math.round(p.x / snapStep) * snapStep
      return { x: magnet && Math.abs(sx - p.x) <= threshold ? sx : p.x, y: last.y }
    }
    const sy = Math.round(p.y / snapStep) * snapStep
    return { x: last.x, y: magnet && Math.abs(sy - p.y) <= threshold ? sy : p.y }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      const pan = panRef.current
      setView((v) => ({ ...v, x: pan.vx + e.clientX - pan.cx, y: pan.vy + e.clientY - pan.cy }))
      return
    }
    const p = toWorld(e)
    setCursor(p)
    const drag = dragRef.current
    if (drag) {
      let target = p
      if (e.shiftKey && drag.anchor && distance(drag.origin, drag.anchor) > 0) {
        target = projectOntoDirection(p, drag.anchor, {
          x: drag.origin.x - drag.anchor.x,
          y: drag.origin.y - drag.anchor.y,
        })
      } else if (snap && !e.altKey) {
        target = magneticSnap(p, snapStep, MAGNET_PX / view.scale)
      }
      movePoint(drag.id, target.x, target.y)
    }
  }

  const onPointerUp = () => {
    panRef.current = null
    if (dragRef.current) {
      dragRef.current = null
      setDraggingId(null)
      endTransient()
    }
  }

  const onPointPointerDown = (e: React.PointerEvent, pt: TerrainPoint, i: number) => {
    if (e.button !== 0 || spaceRef.current) return
    e.stopPropagation()
    if (mode === 'draw' && !closed) {
      if (i === 0 && pts.length >= 3) closeTerrain()
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
  }

  const px = (v: number) => v / view.scale // screen-constant size in world units
  const selectedPointId = selection?.kind === 'point' ? selection.id : null
  const selectedSegment = selection?.kind === 'segment' ? selection.index : null
  const nearFirst =
    mode === 'draw' && !closed && cursor && pts.length >= 3
      ? distance(cursor, pts[0]) < CLOSE_PX / view.scale
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
      onPointerLeave={() => setCursor(null)}
    >
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        <Grid view={view} size={size} />

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
        {mode === 'draw' && !closed && pts.length > 0 && cursor && (() => {
          const preview = nearFirst ? pts[0] : nextDrawPoint(cursor, shiftHeld, altHeld)
          return (
            <>
              <line
                x1={pts[pts.length - 1].x}
                y1={pts[pts.length - 1].y}
                x2={preview.x}
                y2={preview.y}
                stroke="#16a34a"
                strokeWidth={px(1.5)}
                strokeDasharray={`${px(6)} ${px(4)}`}
                pointerEvents="none"
              />
              <SegmentLabel a={pts[pts.length - 1]} b={preview} scale={view.scale} emphasized />
            </>
          )
        })()}

        {/* points */}
        {pts.map((pt, i) => {
          const isSelected = pt.id === selectedPointId
          const isCloseTarget = i === 0 && nearFirst
          return (
            <circle
              key={pt.id}
              cx={pt.x}
              cy={pt.y}
              r={px(isCloseTarget ? 8 : isSelected ? 6.5 : 5)}
              fill={isSelected || isCloseTarget ? '#16a34a' : '#fff'}
              stroke="#16a34a"
              strokeWidth={px(2)}
              style={{ cursor: mode === 'select' ? 'move' : 'pointer' }}
              onPointerDown={(e) => onPointPointerDown(e, pt, i)}
            />
          )
        })}
      </g>
    </svg>
  )
}

function neighborOf(points: TerrainPoint[], i: number, closed: boolean): Vec2 | null {
  if (points.length < 2) return null
  if (i > 0) return points[i - 1]
  if (closed) return points[points.length - 1]
  return points[1] ?? null
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
      {d.toFixed(2)} m
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
  if (snap && snapStep * view.scale >= 8) {
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
