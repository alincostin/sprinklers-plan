import { create } from 'zustand'
import { temporal } from 'zundo'
import { emptyDesign, parseDesign, type Design } from '../model/types'
import { initialConfig } from '../initialConfig'
import { setSegmentLength, type Vec2 } from '../geometry/geometry'

const STORAGE_KEY = 'sprinklers-plan:design'

function loadSavedDesign(): Design | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return text ? parseDesign(text) : null
  } catch {
    return null
  }
}

/** Write the current (or given) design to localStorage. */
export function saveDesign(design?: Design) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(design ?? useDesignStore.getState().design),
    )
  } catch {
    // storage full or unavailable — nothing sensible to do
  }
}

export type Mode = 'draw' | 'select'
export type Selection =
  | { kind: 'point'; id: string }
  | { kind: 'segment'; index: number }

interface EditorState {
  design: Design
  mode: Mode
  selection: Selection | null
  snap: boolean
  setMode: (mode: Mode) => void
  setSnap: (snap: boolean) => void
  select: (selection: Selection | null) => void
  setDesign: (design: Design) => void
  commitDesign: (design: Design) => void
  addTerrainPoint: (p: Vec2) => void
  closeTerrain: () => void
  movePoint: (id: string, x: number, y: number) => void
  deletePoint: (id: string) => void
  setSegmentLen: (index: number, len: number) => void
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * Document store. Only `design` is tracked by the zundo temporal middleware
 * (undo/redo); mode/selection/snap are ephemeral editor state.
 */
const startDesign = loadSavedDesign() ?? initialConfig ?? emptyDesign()

export const useDesignStore = create<EditorState>()(
  temporal(
    (set) => ({
      design: startDesign,
      mode: startDesign.terrain.closed ? 'select' : 'draw',
      selection: null,
      snap: true,

      setMode: (mode) => set({ mode }),
      setSnap: (snap) => set({ snap }),
      select: (selection) => set({ selection }),
      setDesign: (design) =>
        set({ design, selection: null, mode: design.terrain.closed ? 'select' : 'draw' }),
      commitDesign: (design) => set({ design }),

      addTerrainPoint: (p) =>
        set((s) => ({
          design: {
            ...s.design,
            terrain: {
              ...s.design.terrain,
              points: [
                ...s.design.terrain.points,
                { id: crypto.randomUUID(), x: round3(p.x), y: round3(p.y) },
              ],
            },
          },
        })),

      closeTerrain: () =>
        set((s) =>
          s.design.terrain.points.length >= 3 && !s.design.terrain.closed
            ? {
                design: { ...s.design, terrain: { ...s.design.terrain, closed: true } },
                mode: 'select' as const,
              }
            : s,
        ),

      movePoint: (id, x, y) =>
        set((s) => ({
          design: {
            ...s.design,
            terrain: {
              ...s.design.terrain,
              points: s.design.terrain.points.map((pt) =>
                pt.id === id ? { ...pt, x: round3(x), y: round3(y) } : pt,
              ),
            },
          },
        })),

      deletePoint: (id) =>
        set((s) => {
          const points = s.design.terrain.points.filter((pt) => pt.id !== id)
          const closed = s.design.terrain.closed && points.length >= 3
          return {
            design: { ...s.design, terrain: { points, closed } },
            selection: null,
            mode: closed ? s.mode : ('draw' as const),
          }
        }),

      setSegmentLen: (index, len) =>
        set((s) => {
          const pts = s.design.terrain.points
          const start = pts[index]
          const end = pts[(index + 1) % pts.length]
          if (!start || !end || start === end || !(len > 0)) return s
          const moved = setSegmentLength(start, end, len)
          return {
            design: {
              ...s.design,
              terrain: {
                ...s.design.terrain,
                points: pts.map((pt) =>
                  pt.id === end.id ? { ...pt, x: round3(moved.x), y: round3(moved.y) } : pt,
                ),
              },
            },
          }
        }),
    }),
    {
      partialize: (s) => ({ design: s.design }),
      equality: (past, current) => past.design === current.design,
      limit: 100,
    },
  ),
)

export const undo = () => useDesignStore.temporal.getState().undo()
export const redo = () => useDesignStore.temporal.getState().redo()

// Autosave: debounce design changes into localStorage so a reload never loses work.
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
useDesignStore.subscribe((state, prev) => {
  if (state.design === prev.design) return
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => saveDesign(state.design), 400)
})

/**
 * Group a burst of design mutations (e.g. every mousemove of a drag) into a
 * single undo step: pause history at gesture start; at gesture end, silently
 * rewind to the pre-gesture design, resume, and re-commit the final design so
 * exactly one history entry is recorded.
 */
let transientStart: Design | null = null

export function beginTransient() {
  if (transientStart) return
  transientStart = useDesignStore.getState().design
  useDesignStore.temporal.getState().pause()
}

export function endTransient() {
  const start = transientStart
  transientStart = null
  if (!start) return
  const temporalApi = useDesignStore.temporal.getState()
  const { design: final, commitDesign } = useDesignStore.getState()
  if (final === start) {
    temporalApi.resume()
    return
  }
  commitDesign(start)
  temporalApi.resume()
  commitDesign(final)
}
