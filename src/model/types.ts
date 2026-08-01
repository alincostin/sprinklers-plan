import { UNITS, type Unit } from '../units'

export interface TerrainPoint {
  id: string
  x: number
  y: number
}

export interface Sprinkler {
  id: string
  x: number
  y: number
  /** throw radius in meters */
  radius: number
  /** arc start angle in degrees */
  arcStart: number
  /** arc end angle in degrees */
  arcEnd: number
  /** flow in l/min */
  flow: number
  zoneId: string | null
}

export interface Pipe {
  id: string
  zoneId: string | null
  points: { x: number; y: number }[]
}

export interface Zone {
  id: string
  name: string
  color: string
}

export interface WaterSource {
  /** available flow in l/min */
  flow: number
  /** available pressure in bar */
  pressure: number
}

/**
 * The persisted design document. All coordinates are stored in meters
 * regardless of `unit` — the unit only drives display and input parsing.
 */
export interface Design {
  version: 1
  /** preferred unit of measure for the whole project */
  unit: Unit
  terrain: { points: TerrainPoint[]; closed: boolean }
  sprinklers: Sprinkler[]
  pipes: Pipe[]
  zones: Zone[]
  source: WaterSource
}

export const emptyDesign = (): Design => ({
  version: 1,
  unit: 'm',
  terrain: { points: [], closed: false },
  sprinklers: [],
  pipes: [],
  zones: [],
  source: { flow: 30, pressure: 3.5 },
})

/** Parse and minimally validate a design JSON string. Throws on invalid input. */
export function parseDesign(text: string): Design {
  const raw = JSON.parse(text)
  if (raw?.version !== 1 || !Array.isArray(raw?.terrain?.points)) {
    throw new Error('Not a valid design document (expected version 1 with terrain.points)')
  }
  return {
    ...emptyDesign(),
    ...raw,
    unit: raw.unit in UNITS ? raw.unit : 'm',
    terrain: { points: raw.terrain.points, closed: !!raw.terrain.closed },
  }
}
