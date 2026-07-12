# CivilSpace Calc — Structural Calculators Suite

A web home for the structural checks your team runs in Excel — rebuilt as clean,
code-referenced calculators (IS 456 / IS 800).

## Run it

```bash
npm install
npm run dev      # opens http://localhost:5173
npm run build    # production build into dist/
```

## What's here

- **Hub page** (`src/pages/Hub.jsx`) — lists all 12 calculators grouped by
  discipline, with search. `READY` cards open; the rest show a placeholder.
- **Two-way slab** (`src/calculators/TwoWaySlab.jsx`) — the first live tool
  (your existing sheet, restyled). Fully working: geometry, Table 26 coefficients,
  reinforcement, spacing, deflection (IS 456 + BS 8110 fallback), 3D viewer,
  Excel export, printable report.
- The other 11 calculators are registered and show an "in development" page,
  ready to be built as you share each Excel sheet.

## Design system — one source of truth

`src/theme.js` holds the palette, fonts and type scale. Change it once, everything
follows.

- **Font:** Lato / Source Sans 3 (warm, familiar, Calibri-adjacent), larger than
  the old sheet for comfortable reading. Numbers/symbols use IBM Plex Mono.
- **Colour:** carried over from the original calculator so old and new match.

## Adding a calculator

1. It's already in the registry (`src/calculators.js`) — flip `status: "soon"`
   to `"ready"`.
2. Build its component under `src/calculators/`.
3. Register it in `READY` in `src/App.jsx`.

## Navigation

Hash-based, no router dependency (keeps components easy to drop into an existing
site): `#/` is the hub, `#/two-way-slab` opens a tool.
