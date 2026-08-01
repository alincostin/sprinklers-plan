export type Unit = 'mm' | 'cm' | 'm' | 'in' | 'ft'

export interface UnitDef {
  label: string
  /** meters per 1 unit */
  factor: number
  /** decimals when displaying lengths */
  decimals: number
  /** arrow-key nudge steps in this unit: [plain, with Ctrl] */
  nudge: [number, number]
  /** snap-step presets offered in the toolbar, in this unit */
  snapPresets: number[]
}

export const UNITS: Record<Unit, UnitDef> = {
  mm: { label: 'mm', factor: 0.001, decimals: 0, nudge: [1, 10], snapPresets: [10, 50, 100, 250, 500, 1000] },
  cm: { label: 'cm', factor: 0.01, decimals: 1, nudge: [1, 10], snapPresets: [1, 5, 10, 25, 50, 100] },
  m: { label: 'm', factor: 1, decimals: 2, nudge: [0.1, 1], snapPresets: [0.1, 0.25, 0.5, 1, 2, 5] },
  in: { label: 'in', factor: 0.0254, decimals: 1, nudge: [1, 12], snapPresets: [1, 2, 3, 6, 12, 24] },
  ft: { label: 'ft', factor: 0.3048, decimals: 2, nudge: [0.25, 1], snapPresets: [0.25, 0.5, 1, 2, 5, 10] },
}

export const UNIT_KEYS = Object.keys(UNITS) as Unit[]

export const toUnit = (meters: number, u: Unit) => meters / UNITS[u].factor
export const fromUnit = (value: number, u: Unit) => value * UNITS[u].factor

export const formatLength = (meters: number, u: Unit) =>
  `${toUnit(meters, u).toFixed(UNITS[u].decimals)} ${UNITS[u].label}`

/** Display value for inputs: unit-converted, trimmed of float noise. */
export const inputValue = (meters: number, u: Unit) =>
  Number(toUnit(meters, u).toFixed(UNITS[u].decimals + 2))

/** Areas render in m² for metric units and ft² for imperial ones. */
export const formatArea = (m2: number, u: Unit) =>
  u === 'in' || u === 'ft' ? `${(m2 / 0.09290304).toFixed(1)} ft²` : `${m2.toFixed(1)} m²`
