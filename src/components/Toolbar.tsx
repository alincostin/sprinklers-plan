import { useEffect, useRef, useState } from 'react'
import { UNITS, UNIT_KEYS, fromUnit, inputValue, type Unit } from '../units'
import { useStore } from 'zustand'
import { emptyDesign, parseDesign } from '../model/types'
import { redo, saveDesign, undo, useDesignStore } from '../state/store'

/** Top toolbar: mode, snap, undo/redo, and JSON import/export/clipboard. */
export function Toolbar() {
  const design = useDesignStore((s) => s.design)
  const mode = useDesignStore((s) => s.mode)
  const snap = useDesignStore((s) => s.snap)
  const snapStep = useDesignStore((s) => s.snapStep)
  const unit = useDesignStore((s) => s.design.unit)
  const { setMode, setSnap, setSnapStep, setUnit, setDesign } = useDesignStore.getState()
  const [snapStepText, setSnapStepText] = useState(() => String(inputValue(snapStep, unit)))

  // re-express the snap step when the project unit changes
  useEffect(() => {
    setSnapStepText(String(inputValue(useDesignStore.getState().snapStep, unit)))
  }, [unit])
  const canUndo = useStore(useDesignStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useDesignStore.temporal, (s) => s.futureStates.length > 0)

  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const flash = (msg: string) => {
    setStatus(msg)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(''), 2500)
  }

  const loadText = (text: string, source: string) => {
    try {
      setDesign(parseDesign(text))
      flash(`Loaded from ${source}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Invalid design JSON')
    }
  }

  const onExport = () => {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sprinkler-design.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(design, null, 2))
      flash('Copied to clipboard')
    } catch {
      flash('Clipboard unavailable')
    }
  }

  const onPaste = async () => {
    try {
      loadText(await navigator.clipboard.readText(), 'clipboard')
    } catch {
      flash('Clipboard unavailable')
    }
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    loadText(await file.text(), file.name)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid #ddd',
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ marginRight: 8 }}>Sprinkler Planner</strong>

      <button
        className={mode === 'draw' ? 'active' : ''}
        disabled={design.terrain.closed}
        title={design.terrain.closed ? 'Terrain outline is already closed' : 'Add terrain points'}
        onClick={() => setMode('draw')}
      >
        Draw
      </button>
      <button className={mode === 'select' ? 'active' : ''} onClick={() => setMode('select')}>
        Select
      </button>

      <label
        style={{ fontSize: 13, marginLeft: 6 }}
        title="Magnetic: points lock onto the grid only when close to it; hold Alt to disable while dragging or drawing"
      >
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap
      </label>
      <input
        type="text"
        inputMode="decimal"
        list="snap-steps"
        value={snapStepText}
        disabled={!snap}
        title={`Snap grid step in ${UNITS[unit].label} — pick a preset or type any value`}
        style={{ width: 80, fontSize: 13 }}
        onChange={(e) => {
          setSnapStepText(e.target.value)
          const v = Number(e.target.value)
          if (v > 0) setSnapStep(fromUnit(v, unit))
        }}
        onBlur={() => setSnapStepText(String(inputValue(useDesignStore.getState().snapStep, unit)))}
      />
      <datalist id="snap-steps">
        {UNITS[unit].snapPresets.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <select
        value={unit}
        title="Project unit of measure — all lengths display and edit in this unit"
        style={{ fontSize: 13 }}
        onChange={(e) => setUnit(e.target.value as Unit)}
      >
        {UNIT_KEYS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      <span className="sep" />
      <button disabled={!canUndo} onClick={() => undo()}>
        ↩ Undo
      </button>
      <button disabled={!canRedo} onClick={() => redo()}>
        ↪ Redo
      </button>

      <span className="sep" />
      <button
        title="Designs autosave to this browser; Save forces it immediately"
        onClick={() => {
          saveDesign()
          flash('Saved to this browser')
        }}
      >
        Save
      </button>
      <button
        title="Start a blank design (undoable)"
        onClick={() => {
          if (window.confirm('Start a new blank design? You can undo this.')) {
            setDesign(emptyDesign())
            flash('New design')
          }
        }}
      >
        New
      </button>
      <button onClick={onExport}>Export</button>
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <button onClick={onCopy}>Copy</button>
      <button onClick={onPaste}>Paste</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          onImportFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>{status}</span>
    </div>
  )
}
