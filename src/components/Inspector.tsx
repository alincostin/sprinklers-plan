import { distance, polygonArea, segmentsOf } from '../geometry/geometry'
import { useDesignStore } from '../state/store'

/** Right-side panel: properties of the selected point or segment. */
export function Inspector() {
  const design = useDesignStore((s) => s.design)
  const selection = useDesignStore((s) => s.selection)
  const { movePoint, deletePoint, setSegmentLen } = useDesignStore.getState()

  const pts = design.terrain.points
  const segments = segmentsOf(pts, design.terrain.closed)

  const point = selection?.kind === 'point' ? pts.find((p) => p.id === selection.id) : undefined
  const segment = selection?.kind === 'segment' ? segments[selection.index] : undefined

  return (
    <aside style={{ width: 260, borderLeft: '1px solid #ddd', padding: 12, overflowY: 'auto' }}>
      {point ? (
        <>
          <h3 style={{ marginTop: 0 }}>Point</h3>
          <NumberField label="X (m)" value={point.x} onCommit={(v) => movePoint(point.id, v, point.y)} />
          <NumberField label="Y (m)" value={point.y} onCommit={(v) => movePoint(point.id, point.x, v)} />
          <button style={{ marginTop: 12 }} onClick={() => deletePoint(point.id)}>
            Delete point
          </button>
          <ShortcutHints
            hints={[
              ['Arrows', 'move 0.1 m'],
              ['Ctrl + arrows', 'move 1 m'],
              ['Shift', 'keep the line straight'],
              ['Delete', 'remove point'],
            ]}
          />
        </>
      ) : segment && selection?.kind === 'segment' ? (
        <>
          <h3 style={{ marginTop: 0 }}>Segment</h3>
          <NumberField
            label="Length (m)"
            value={round2(distance(segment[0], segment[1]))}
            min={0.01}
            onCommit={(v) => setSegmentLen(selection.index, v)}
          />
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Typing a length moves the segment's end point along the segment direction.
          </p>
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>Terrain</h3>
          <p style={{ fontSize: 13 }}>
            {pts.length} point{pts.length === 1 ? '' : 's'}
            {design.terrain.closed && (
              <>
                {' · '}perimeter {perimeter(segments).toFixed(2)} m{' · '}area{' '}
                {polygonArea(pts).toFixed(1)} m²
              </>
            )}
          </p>
          {!design.terrain.closed ? (
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Click the canvas to add terrain points. Click the first point (or press Enter) to
              close the outline.
            </p>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Select a point to drag it or nudge it with the arrow keys; select a segment to type
              its exact length.
            </p>
          )}
          <ShortcutHints
            hints={[
              ['Wheel', 'zoom'],
              ['Space + drag', 'pan'],
              ['Cmd/Ctrl + Z', 'undo'],
              ['Shift + Cmd/Ctrl + Z', 'redo'],
            ]}
          />
        </>
      )}
    </aside>
  )
}

const round2 = (v: number) => Math.round(v * 100) / 100

const perimeter = (segments: [{ x: number; y: number }, { x: number; y: number }][]) =>
  segments.reduce((sum, [a, b]) => sum + distance(a, b), 0)

/** Numeric input that commits on Enter or blur (avoids one undo entry per keystroke). */
function NumberField({
  label,
  value,
  onCommit,
  min,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
}) {
  return (
    <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
      {label}
      <input
        key={value}
        type="number"
        defaultValue={value}
        step={0.1}
        min={min}
        style={{ display: 'block', width: '100%', marginTop: 2 }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v !== value && (min === undefined || v >= min)) onCommit(v)
        }}
      />
    </label>
  )
}

function ShortcutHints({ hints }: { hints: [string, string][] }) {
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 8 }}>
      {hints.map(([key, what]) => (
        <div key={key} style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
          <kbd
            style={{
              background: '#f3f4f6',
              border: '1px solid #ddd',
              borderRadius: 3,
              padding: '1px 4px',
              fontSize: 11,
            }}
          >
            {key}
          </kbd>{' '}
          {what}
        </div>
      ))}
    </div>
  )
}
