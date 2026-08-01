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
  const showScale = useDesignStore((s) => s.showScale)
  const calibration = useDesignStore((s) => s.calibration)
  const { setUnit, setSnap, setSnapStep, setShowScale } = useDesignStore.getState()
  const [stepText, setStepText] = useState(() => String(inputValue(snapStep, unit)))
  const [calibrating, setCalibrating] = useState(false)

  // re-express the snap step when the project unit changes
  useEffect(() => {
    setStepText(String(inputValue(useDesignStore.getState().snapStep, unit)))
  }, [unit])

  return (
    <section style={{ padding: 12, borderBottom: '1px solid #ddd' }}>
      <h3 style={{ margin: '0 0 8px' }}>Project</h3>

      <label style={row} title="All lengths display and edit in this unit; data is stored in meters">
        <span style={{ width: 76 }}>Unit</span>
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

      <label style={row} title={`Grid size in ${UNITS[unit].label} — pick a preset or type any value`}>
        <span style={{ width: 76 }}>Grid size</span>
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

      <label
        style={row}
        title="Magnetic: points lock onto the grid only when close to it; hold Alt to disable while dragging or drawing"
      >
        <span style={{ width: 76 }}>Snap to grid</span>
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
      </label>

      <label style={row} title="Map-style scale bar in the canvas corner, updating with zoom">
        <span style={{ width: 76 }}>Scale bar</span>
        <input
          type="checkbox"
          checked={showScale}
          onChange={(e) => setShowScale(e.target.checked)}
        />
      </label>

      <label style={row} title="Match an on-screen credit card to a real one so 1:1 zoom is a true 1:1 on this monitor">
        <span style={{ width: 76 }}>Screen</span>
        <button onClick={() => setCalibrating(true)}>Calibrate…</button>
        {calibration !== 1 && (
          <span style={{ color: '#6b7280' }}>{Math.round(calibration * 100)}%</span>
        )}
      </label>

      {calibrating && <CalibrationOverlay onClose={() => setCalibrating(false)} />}
    </section>
  )
}

/** ISO/IEC 7810 ID-1 credit card: 85.60 x 53.98 mm. */
const CARD_W_MM = 85.6
const CARD_H_MM = 53.98
const NOMINAL_PX_PER_MM = 96 / 25.4

function CalibrationOverlay({ onClose }: { onClose: () => void }) {
  const calibration = useDesignStore((s) => s.calibration)
  const { setCalibration } = useDesignStore.getState()
  const w = CARD_W_MM * NOMINAL_PX_PER_MM * calibration
  const h = CARD_H_MM * NOMINAL_PX_PER_MM * calibration
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          maxWidth: 520,
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Screen calibration</h3>
        <p style={{ fontSize: 13, color: '#374151' }}>
          Hold a credit card against the screen and adjust the slider until the outline matches
          its real size. This makes 1:1 zoom a true 1:1 on this monitor.
        </p>
        <div
          style={{
            width: w,
            height: h,
            border: '2px solid #16a34a',
            borderRadius: 12,
            margin: '16px auto',
            background: 'rgba(34,197,94,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            fontSize: 12,
          }}
        >
          credit card (85.60 × 53.98 mm)
        </div>
        <input
          type="range"
          min={0.7}
          max={1.5}
          step={0.005}
          value={calibration}
          style={{ width: '100%' }}
          onChange={(e) => setCalibration(Number(e.target.value))}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>
            {Math.round(calibration * 100)}%
          </span>
          <button onClick={() => setCalibration(1)}>Reset</button>
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
