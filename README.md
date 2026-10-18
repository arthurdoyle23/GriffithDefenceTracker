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

It also builds on [Netlify](https://www.netlify.com): `netlify.toml` holds the settings (build `npm run build`, publish `dist`, Node 22),
so importing the repository in Netlify needs no other configuration. Netlify then redeploys on every push to `main` too.

## Data

- `public/data/events.geojson` holds one point per engagement, with the properties `Year`, `Delivering_Country`,
  `Receiving_Countries` (semicolon-separated), `Diplomacy_category` (semicolon-separated), `Comments` and `Source`.
- Category spellings are tidied when the data loads (for example "MIL - POL Engagement" becomes "MIL-POL Engagement").
  A row whose category isn't recognised is logged to the browser console. Add new names or aliases in `src/categories.js`.
- `public/data/world.geojson`, `states.geojson` and `labels.geojson` are the basemap (countries, state borders and place names),
  built from [Natural Earth](https://www.naturalearthdata.com) (public domain). Regenerate them with `npm run build:basemap`.

## Icons

Category markers are in `public/icons/categories/` and are generated from [Lucide](https://lucide.dev) glyphs (ISC licence).
Change a glyph or colour in `src/categories.js`, then run `npm run build:icons`. Partner flags are in `public/icons/`.

## Map

- The basemap is self-hosted, so it needs no account or key: plain land and sea with country borders, state borders,
  and names for every country, the main states and the capitals and towns of the Pacific. The five host countries are shaded.
- Names are drawn with the site's own fonts. Country names sit at the middle of each country; a name that a cluster bubble would hide steps just below the bubble.
- Zoom stops at level 9. Clicking a cluster lists its events in the side panel. From the zoomed-out view
  (below level 5) it also zooms in to fit them; closer in it only opens the list.

## Code layout

- `src/App.jsx`: filter state
- `src/components/MapView.jsx`: map, cluster bubbles, markers and hover pop-ups
- `src/components/Panel.jsx`: search, the legend that doubles as a filter, partner chips and the event list
- `src/components/EventCard.jsx`: the detail card for a selected event
- `src/components/YearStrip.jsx`: per-year counts, year filter and play-through
- `src/categories.js`: categories, colours, icon glyphs and spelling aliases
