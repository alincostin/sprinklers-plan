import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import { emptyDesign, parseDesign } from '../model/types'
import { redo, saveDesign, undo, useDesignStore } from '../state/store'

/** Top toolbar: mode, snap, undo/redo, and JSON import/export/clipboard. */
export function Toolbar() {
  const design = useDesignStore((s) => s.design)
  const mode = useDesignStore((s) => s.mode)
  const { setMode, setDesign } = useDesignStore.getState()
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
        ✎ Draw
      </button>
      <button className={mode === 'select' ? 'active' : ''} onClick={() => setMode('select')}>
        ↖ Select
      </button>

      <span className="sep" />
      <button disabled={!canUndo} onClick={() => undo()}>
        ↩ Undo
      </button>
      <button disabled={!canRedo} onClick={() => redo()}>
        ↪ Redo
      </button>
      <button title="Zoom to fit the drawing (F)" onClick={() => useDesignStore.getState().requestFit()}>
        ⛶ Fit
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
