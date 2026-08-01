import { useEffect, useState } from 'react'
import { useDesignStore } from '../state/store'
import { UNITS, UNIT_KEYS, fromUnit, inputValue, type Unit } from '../units'

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  marginBottom: 8,
}

/** Project configuration: unit of measure and snap settings. */
export function ProjectPanel() {
  const unit = useDesignStore((s) => s.design.unit)
  const snap = useDesignStore((s) => s.snap)
  const snapStep = useDesignStore((s) => s.snapStep)
  const { setUnit, setSnap, setSnapStep } = useDesignStore.getState()
  const [stepText, setStepText] = useState(() => String(inputValue(snapStep, unit)))

  // re-express the snap step when the project unit changes
  useEffect(() => {
    setStepText(String(inputValue(useDesignStore.getState().snapStep, unit)))
  }, [unit])

  return (
    <section style={{ padding: 12, borderBottom: '1px solid #ddd' }}>
      <h3 style={{ margin: '0 0 8px' }}>Project</h3>

      <label style={row} title="All lengths display and edit in this unit; data is stored in meters">
        <span style={{ width: 64 }}>Unit</span>
        <select
          value={unit}
          style={{ fontSize: 13 }}
          onChange={(e) => setUnit(e.target.value as Unit)}
        >
          {UNIT_KEYS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>

      <label
        style={row}
        title="Magnetic: points lock onto the grid only when close to it; hold Alt to disable while dragging or drawing"
      >
        <span style={{ width: 64 }}>Snap</span>
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
      </label>

      <label style={row} title={`Snap grid step in ${UNITS[unit].label} — pick a preset or type any value`}>
        <span style={{ width: 64 }}>Snap step</span>
        <input
          type="text"
          inputMode="decimal"
          list="snap-steps"
          value={stepText}
          disabled={!snap}
          style={{ width: 72, fontSize: 13 }}
          onChange={(e) => {
            setStepText(e.target.value)
            const v = Number(e.target.value)
            if (v > 0) setSnapStep(fromUnit(v, unit))
          }}
          onBlur={() => setStepText(String(inputValue(useDesignStore.getState().snapStep, unit)))}
        />
        <datalist id="snap-steps">
          {UNITS[unit].snapPresets.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <span style={{ color: '#6b7280' }}>{UNITS[unit].label}</span>
      </label>
    </section>
  )
}
