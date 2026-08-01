# PRD — Sprinkler Irrigation Planner

> This document is kept in sync with the implementation. Each feature section is marked
> **Implemented** or **Planned**; when behavior changes, this file changes in the same commit.

## 1. Overview

A browser-based tool to design sprinkler irrigation systems for any terrain. The user draws the terrain outline, places sprinkler heads, groups them into zones, routes pipes, and validates the design against the water source's capacity.

- **Client-only SPA** — no accounts, no backend. The whole design lives in browser state and is persisted as JSON.
- **Deployment**: Vercel (static build).
- **Units**: length unit is configurable per project (mm / cm / m / in / ft, default m) — see §3.6; hydraulics use l/min and bar. Internally, all geometry is stored in meters.

## 2. Tech stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | Simple static SPA; fast dev loop; deploys to Vercel with zero config |
| Rendering | SVG | Points/segments are real DOM elements — simple hit-testing, dragging, hover states, crisp at any zoom |
| State | zustand + zundo | Small store with temporal middleware giving undo/redo for free |
| Persistence | localStorage autosave + JSON (file export/import + clipboard) | Work survives reloads; versioned schema, portable, embeddable as initial config |

## 3. Features

### 3.1 Terrain editor — **Implemented**

**Modes** (toolbar): **Draw** (add points; disabled once the outline is closed) and **Select** (edit points/segments).

**Layout**: toolbar (modes, undo/redo, Save/New/Export/Import/Copy/Paste) on top; right sidebar with a **Project panel** (unit of measure, snap on/off, snap step — §3.6) above the selection **Inspector**.

- Click on the canvas to place polygon vertices; while drawing, a dashed preview segment follows the cursor with its live distance. Close the outline by clicking the first point or pressing Enter (needs ≥ 3 points); the app then switches to Select mode and fills the polygon. When hovering the first point to close, it fills green (same size as other points), and the preview snaps to it showing the closing segment and its distance.
- **Shift while drawing** locks the new segment to exactly horizontal or vertical (whichever is closer to the cursor); the preview segment shows the locked position, and snap still applies to the free coordinate.
- **Draw from either end**: an open outline extends from its last point by default. Selecting the outline's *first* point and then entering Draw mode extends from that end instead (new points prepend). The close target is always the opposite end; the preview line follows the active end.
- **Segment length labels are always visible** on every segment and update live. While dragging a point, the labels of its two adjacent segments are highlighted.
- **Drag points** with the mouse (Select mode). The magnetic snap (below) applies while dragging; holding **Shift** instead constrains the drag along the adjacent segment's direction so the line stays straight.
- **Keyboard movement** of the selected point:
  - Arrow keys nudge by the small step of the project unit, **Ctrl (or Cmd) + arrows** by the large step (for meters: 0.1 m / 1 m; per-unit steps in §3.6).
  - **Shift + arrows** keeps the line straight (movement projected onto the adjacent segment's direction).
  - **Delete/Backspace** removes the selected point (reopens the outline if fewer than 3 points remain); **Escape** exits Draw mode (leaving the outline open), or deselects in Select mode.
- **Segment dimension input** (inspector): selecting a segment shows its current length; typing a new value moves the segment's end point along the segment direction to the exact dimension.
- **Inspector** also shows: selected point's X/Y as editable inputs (commit on Enter/blur), a delete button, terrain stats (point count, perimeter, area) when nothing is selected, and contextual keyboard-shortcut hints.
- **Grid & navigation**: 1 m grid (bold every 5 m, coarsens to 5 m when zoomed far out), mouse-wheel zoom anchored at the cursor, pan via Space + drag or middle-mouse drag.
- **Scale bar** (toggleable in the Project panel, on by default, persisted as a preference): a map-style bar in the canvas' bottom-left corner showing the largest "nice" round length (1 / 2 / 5 × 10ⁿ in the project unit) that fits ~150 px; it updates in real time as the zoom changes and hides when no nice length fits.
- **Magnetic snap** (toggle): dragging and drawing are fully free; each coordinate locks onto its nearest grid line only when within ~8 screen pixels of it (per-axis, so you can slide along a grid line). Holding **Alt/Option** disables even that for pixel-perfect freedom. With Shift's H/V lock active, the magnet applies to the free coordinate only.
- **Snap step is customizable**: an input in the Project panel with a preset dropdown that also accepts any typed value (disabled while snap is off); presets and display follow the project unit (for meters: 0.1 / 0.25 / 0.5 / 1 / 2 / 5; default 0.5 m). Snap on/off and the step persist in the browser as preferences.
- **Snap grid layer**: when snap is on, faint green lines are drawn at the snap step under the gray meter grid — but only while their on-screen spacing is ≥ 8 px, so a fine step doesn't flood a zoomed-out view. What you see in green is exactly where the magnet locks.
- **Snap click-point marker**: a small dotted green circle marks the landing position only when it is a true snap position — both coordinates locked onto the snap grid (or, with Shift's H/V lock, the free coordinate locked). Sliding along a single grid line shows no marker. Applies while drawing (including the first point) and while dragging.
- Coordinates are stored with 3-decimal (mm) precision; a drag is recorded as a **single undo step**.

### 3.2 Sprinkler placement & coverage — **Planned (M3)**

- Place sprinkler heads inside the terrain.
- Per head: position, throw radius (m), arc (90° / 180° / 270° / 360° / custom start–end angles), flow (l/min).
- Coverage sectors rendered semi-transparently so overlaps and gaps are immediately visible.
- Drag heads and rotate arcs directly on the canvas; edit exact values in the inspector panel.

### 3.3 Zones & pipe routing — **Planned (M4)**

- Group sprinklers into irrigation zones (one valve per zone), each with a name and color; heads and coverage tint by zone color.
- Draw polyline pipe runs on the canvas, assigned to a zone.
- Show length per pipe run and total pipe length per zone.

### 3.4 Hydraulic calculations — **Planned (M5)**

- Configure the water source: available flow (l/min) and pressure (bar).
- Per zone: total flow = sum of its heads' flows; compare against source capacity.
- Warn visually (zone panel + canvas badge) when a zone's demand exceeds the source flow or the heads' required pressure exceeds the available pressure.

### 3.5 Configuration: persistence & JSON — **Implemented**

- **Autosave to localStorage**: every design change is saved (debounced 400 ms) to the browser's localStorage and restored on reload, so work survives page refreshes and browser restarts. Restore precedence on startup: saved design → `initialConfig` → blank.
- **Save** button forces an immediate localStorage write (autosave makes this mostly a reassurance button).
- **New** button starts a blank design after confirmation; the reset itself is undoable.
- **Export** the design to a `sprinkler-design.json` file.
- **Import** a design from a `.json` file.
- **Copy to clipboard** — so the JSON can be pasted elsewhere or embedded as the app's initial configuration.
- **Paste** from clipboard to load a design.
- **Initial configuration**: paste an exported JSON into `src/initialConfig.ts` to ship it as the app's built-in starting design.
- Schema is versioned (`version` field); imports are validated and rejected with a message if invalid.
- Actions give brief status feedback in the toolbar ("Saved to this browser", "Copied to clipboard", "Loaded from …", validation errors).

### 3.6 Units — **Implemented**

- **Project unit of measure** selectable in the Project panel (right sidebar): mm, cm, m, in, ft (default m). It is part of the design document (travels with export/import, undoable).
- Once set, **everything displays and edits in that unit**: segment labels, the dimension input, point X/Y inputs, perimeter, snap-step input and its presets, and keyboard-shortcut hints.
- **Input parsing** converts back: typing 250 with unit cm moves the point to 2.5 m internally. Geometry is always stored in meters, so switching units never changes the data.
- **Areas** render in m² for metric units and ft² for imperial ones.
- Per-unit arrow-nudge steps (small / Ctrl) and snap presets:
  | Unit | Nudge | Ctrl nudge | Snap presets |
  |---|---|---|---|
  | mm | 1 | 10 | 10, 50, 100, 250, 500, 1000 |
  | cm | 1 | 10 | 1, 5, 10, 25, 50, 100 |
  | m | 0.1 | 1 | 0.1, 0.25, 0.5, 1, 2, 5 |
  | in | 1 | 12 | 1, 2, 3, 6, 12, 24 |
  | ft | 0.25 | 1 | 0.25, 0.5, 1, 2, 5, 10 |

### 3.7 Undo / Redo — **Implemented**

- Toolbar buttons for Undo and Redo, disabled when the respective history is empty.
- Keyboard: Ctrl/Cmd+Z (undo), Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y (redo).
- Every document mutation is undoable; ephemeral editor state (selection, mode, snap, view) is not tracked.
- A mouse drag is grouped into one undo step; history is capped at 100 entries.

## 4. Data model

All coordinates in meters, world space (y grows downward, matching SVG). Persisted shape:

```json
{
  "version": 1,
  "unit": "m",
  "terrain": {
    "points": [{ "id": "p1", "x": 0, "y": 0 }],
    "closed": true
  },
  "sprinklers": [
    { "id": "s1", "x": 2, "y": 3, "radius": 4, "arcStart": 0, "arcEnd": 180, "flow": 10, "zoneId": "z1" }
  ],
  "pipes": [
    { "id": "l1", "zoneId": "z1", "points": [{ "x": 0, "y": 0 }, { "x": 5, "y": 0 }] }
  ],
  "zones": [{ "id": "z1", "name": "Front lawn", "color": "#4f9cf9" }],
  "source": { "flow": 30, "pressure": 3.5 }
}
```

`sprinklers`, `pipes`, `zones` and `source` are part of the schema now but only used from M3–M5 onward. `unit` is the project's display/input unit (§3.6); coordinates stay meters regardless.

## 5. Configuration constants (code)

Tunable constants for behaviors not exposed in the UI — change the value, rebuild, done:

| Constant | Where | Default | Controls |
|---|---|---|---|
| `POINT_RADIUS` / `POINT_RADIUS_SELECTED` / `POINT_STROKE` | `src/components/Canvas.tsx` | 5 / 6.5 / 2 px | Point circle sizes (screen px, zoom-independent) |
| `MAGNET_PX` | `src/components/Canvas.tsx` | 8 px | Capture radius of the magnetic snap and minimum spacing for the snap-grid layer |
| `CLOSE_PX` | `src/components/Canvas.tsx` | 12 px | Click radius for closing the outline on the end point |
| `UNITS` (per-unit `nudge`, `snapPresets`, `decimals`) | `src/units.ts` | see §3.6 | Arrow-nudge steps, snap presets, label precision per unit |
| Autosave debounce | `src/state/store.ts` | 400 ms | Delay between a change and its localStorage write |
| History `limit` | `src/state/store.ts` | 100 | Max undo entries |
| `initialConfig` | `src/initialConfig.ts` | null | Built-in starting design (paste an exported JSON) |

## 6. Non-goals (v1)

- Automatic head placement / head-to-head coverage suggestions (candidate for v2).
- Pipe diameter sizing and friction-loss calculations (v1 does simple flow/pressure budgeting).
- Background image tracing (satellite/site plan) — candidate for v2.
- Multi-user collaboration, accounts, server-side storage.

## 7. Milestones

1. ✅ **M1 — Scaffold & repo** (2026-08-01): Vite + React + TS scaffold, GitHub repo (`alincostin/sprinklers-plan`). Vercel connection pending (manual step in the Vercel dashboard).
2. ✅ **M2 — Terrain editor** (2026-08-01): everything in §3.1, §3.5, §3.6 and §3.7.
3. **M3 — Sprinklers**: placement, radius/arc editing, coverage rendering.
4. **M4 — Zones & pipes**: zone management, pipe drawing, length totals.
5. **M5 — Hydraulics**: source configuration, per-zone flow/pressure validation and warnings.
6. **M6 — Polish**: visual refinement, empty states, help overlay with shortcuts.
