import { useDesignStore } from '../state/store'

/** Top toolbar — undo/redo and JSON import/export/clipboard actions. */
export function Toolbar() {
  const { undo, redo } = useDesignStore.temporal.getState()
  return (
    <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd' }}>
      <strong>Sprinkler Planner</strong>
      <button onClick={() => undo()}>Undo</button>
      <button onClick={() => redo()}>Redo</button>
    </div>
  )
}
