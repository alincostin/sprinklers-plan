# Sprinkler Irrigation Planner

Browser-based tool to design sprinkler irrigation systems for any terrain: draw the terrain outline, place sprinkler heads with coverage arcs, group them into zones, route pipes, and validate the design against your water source.

See [PRD.md](PRD.md) for the full product spec and milestones.

## Stack

- React + Vite + TypeScript (client-only SPA)
- SVG rendering for the terrain editor
- zustand + zundo for state with undo/redo
- Design persisted as versioned JSON (export / import / clipboard)

## Development

```sh
npm install
npm run dev     # dev server
npm run build   # type-check + production build
```

## Deployment

Deployed on Vercel: import this GitHub repo in the Vercel dashboard — the Vite preset is auto-detected, no extra configuration needed.
