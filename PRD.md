# PRD — Sprinkler Irrigation Planner

## 1. Overview

A browser-based tool to design sprinkler irrigation systems for any terrain. The user draws the terrain outline, places sprinkler heads, groups them into zones, routes pipes, and validates the design against the water source's capacity.

- **Client-only SPA** — no accounts, no backend. The whole design lives in browser state and is persisted as JSON.
- **Deployment**: Vercel (static build).
- **Units**: metric (meters, l/min, bar).

## 2. Tech stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 19 + Vite + TypeScript | Simple static SPA; fast dev loop; deploys to Vercel with zero config |
| Rendering | SVG | Points/segments are real DOM elements — simple hit-testing, dragging, hover states, crisp at any zoom |
| State | zustand + zundo | Small store with temporal middleware giving undo/redo for free |
| Persistence | JSON (file export/import + clipboard) | Versioned schema, portable, embeddable as initial config |

## 3. Features

### 3.1 Terrain editor

- Click on the canvas to place polygon vertices; close the polygon (click first point or press Enter) to finish the terrain outline.
- **Drag points** with the mouse; while dragging, the adjacent segments show **live distance labels** (in meters) that update in real time.
- **Keyboard movement** of the selected point:
  - Arrow keys nudge by a small step (0.1 m).
  - **Ctrl + arrows** = larger step (1 m) for faster movement.
  - **Shift** constrains the movement so the line stays straight (locks the point to the direction of the adjacent segment / axis).
- **Segment dimension input**: selecting a segment shows a numeric input with its current length; typing a new value moves the endpoint along the segment direction to match the exact dimension.
- Grid background with snap-to-grid toggle; pan (space-drag / middle mouse) and zoom (wheel).

### 3.2 Sprinkler placement & coverage

- Place sprinkler heads inside the terrain.
- Per head: position, throw radius (m), arc (90° / 180° / 270° / 360° / custom start–end angles), flow (l/min).
- Coverage sectors rendered semi-transparently so overlaps and gaps are immediately visible.
- Drag heads and rotate arcs directly on the canvas; edit exact values in the inspector panel.

### 3.3 Zones & pipe routing

- Group sprinklers into irrigation zones (one valve per zone), each with a name and color; heads and coverage tint by zone color.
- Draw polyline pipe runs on the canvas, assigned to a zone.
- Show length per pipe run and total pipe length per zone.

### 3.4 Hydraulic calculations

- Configure the water source: available flow (l/min) and pressure (bar).
- Per zone: total flow = sum of its heads' flows; compare against source capacity.
- Warn visually (zone panel + canvas badge) when a zone's demand exceeds the source flow or the heads' required pressure exceeds the available pressure.

### 3.5 Configuration as JSON

- **Export** the design to a `.json` file.
- **Import** a design from a `.json` file.
- **Copy to clipboard** — so the JSON can be pasted elsewhere or embedded as the app's initial configuration.
- **Load from clipboard/paste** as initial configuration.
- Schema is versioned (`version` field) to allow future migrations.

### 3.6 Undo / Redo

- Toolbar buttons for Undo and Redo.
- Keyboard: Ctrl/Cmd+Z (undo), Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y (redo).
- Every document mutation (terrain, sprinklers, pipes, zones, source) is undoable.

## 4. Data model

All coordinates in meters, world space. Persisted shape:

```json
{
  "version": 1,
  "terrain": {
    "points": [{ "id": "p1", "x": 0, "y": 0 }]
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

## 5. Non-goals (v1)

- Automatic head placement / head-to-head coverage suggestions (candidate for v2).
- Pipe diameter sizing and friction-loss calculations (v1 does simple flow/pressure budgeting).
- Background image tracing (satellite/site plan) — candidate for v2.
- Multi-user collaboration, accounts, server-side storage.

## 6. Milestones

1. **M1 — Scaffold & deploy**: Vite + React + TS scaffold, repo on GitHub, deployed to Vercel.
2. **M2 — Terrain editor**: polygon drawing, drag with live distances, keyboard nudging (Ctrl/Shift behaviors), segment dimension input, grid/pan/zoom, undo/redo, JSON export/import/clipboard.
3. **M3 — Sprinklers**: placement, radius/arc editing, coverage rendering.
4. **M4 — Zones & pipes**: zone management, pipe drawing, length totals.
5. **M5 — Hydraulics**: source configuration, per-zone flow/pressure validation and warnings.
6. **M6 — Polish**: visual refinement, empty states, help overlay with shortcuts.
