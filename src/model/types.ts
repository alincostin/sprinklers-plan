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

/** The persisted design document. All coordinates in meters. */
export interface Design {
  version: 1
  terrain: { points: TerrainPoint[] }
  sprinklers: Sprinkler[]
  pipes: Pipe[]
  zones: Zone[]
  source: WaterSource
}

export const emptyDesign = (): Design => ({
  version: 1,
  terrain: { points: [] },
  sprinklers: [],
  pipes: [],
  zones: [],
  source: { flow: 30, pressure: 3.5 },
})
