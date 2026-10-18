# Defence Diplomacy Tracker

An interactive map of defence diplomacy engagements with Pacific nations. Live at
https://arthurdoyle23.github.io/GriffithDefenceTracker/

Built with React, Vite and [MapLibre GL JS](https://maplibre.org/). It needs no map account or access token.

## Run it

```bash
npm install
npm run dev       # local preview
npm run build     # production build in dist/
npm run lint      # code checks
```

## Publishing

Every push to `main` builds the site and publishes it to GitHub Pages through `.github/workflows/deploy.yml`.
This needs a one-time setting in the repository: Settings → Pages → Build and deployment → Source: **GitHub Actions**.

## Data

- `public/data/events.geojson` holds one point per engagement, with the properties `Year`, `Delivering_Country`,
  `Receiving_Countries` (semicolon-separated), `Diplomacy_category` (semicolon-separated), `Comments` and `Source`.
- Category spellings are tidied when the data loads (for example "MIL - POL Engagement" becomes "MIL-POL Engagement").
  A row whose category isn't recognised is logged to the browser console. Add new names or aliases in `src/categories.js`.
- `public/data/world.geojson` is the basemap, built from Natural Earth. Regenerate it with `npm run build:basemap`.

## Icons

Category markers are in `public/icons/categories/` and are generated from [Lucide](https://lucide.dev) glyphs (ISC licence).
Change a glyph or colour in `src/categories.js`, then run `npm run build:icons`. Partner flags are in `public/icons/`.

## Map

- The basemap is [OpenFreeMap](https://openfreemap.org) "Liberty", a free OpenStreetMap style with state borders and place names. It needs no account or key.
  If it can't be reached, the map falls back to the bundled Natural Earth countries in `public/data/world.geojson`.
- Zoom stops at level 8, about state or province level. Clusters show a pie chart of engagement families.
  Clicking a cluster lists its events in the sidebar.

## Code layout

- `src/App.jsx`: sidebar, filters, stats and the year slider
- `src/components/MapView.jsx`: map, pie-chart clusters, markers and pop-ups
- `src/popup.js`: the event pop-up
- `src/categories.js`: categories, colours, icon glyphs and spelling aliases
