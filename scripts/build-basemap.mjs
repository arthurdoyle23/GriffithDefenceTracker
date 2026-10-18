// Builds the self-hosted basemap in public/data from Natural Earth (public domain):
//   world.geojson   country shapes (1:10m around the Pacific, 1:50m elsewhere)
//   states.geojson  state and province borders
//   labels.geojson  country, state and city name points
// Usage: npm run build:basemap   (set NE_DIR to a folder of Natural Earth .geojson files to skip downloading)
import { readFileSync, writeFileSync } from 'node:fs';
import { topology } from 'topojson-server';
import { mesh } from 'topojson-client';

const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson';

async function load(name) {
  if (process.env.NE_DIR) return JSON.parse(readFileSync(`${process.env.NE_DIR}/${name}.geojson`, 'utf8'));
  const res = await fetch(`${NE_URL}/${name}.geojson`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

// Countries we show in more detail: the five hosts and their neighbours.
const DETAIL = new Set(['PNG', 'SLB', 'VUT', 'FJI', 'TON', 'AUS', 'NZL', 'NCL', 'IDN', 'TLS', 'WSM', 'KIR', 'TUV', 'NRU', 'FSM', 'MHL', 'PLW']);
const HOSTS = new Set(['PNG', 'SLB', 'VUT', 'FJI', 'TON']);
// Island nations whose names hang below the islands, clear of the event bubbles on top of them.
const ISLANDS = new Set(['SLB', 'VUT', 'FJI', 'TON', 'WSM', 'KIR', 'TUV', 'NRU', 'FSM', 'MHL', 'PLW', 'NCL']);

const round = (v) => Math.round(v * 100) / 100;
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

// Rings that straddle the antimeridian (Fiji, Russia) are shifted east so they don't draw a line across the map.
function fixRing(ring) {
  const xs = ring.map((c) => c[0]);
  const ys = ring.map((c) => c[1]);
  const straddles = Math.max(...xs) - Math.min(...xs) > 180 && Math.min(...ys) > -60;
  const out = ring.map(([x, y]) => [round(straddles && x < 0 ? x + 360 : x), round(y)]);
  return out.filter((c, i) => i === 0 || c[0] !== out[i - 1][0] || c[1] !== out[i - 1][1]);
}
const cleanGeometry = (g) => ({ type: 'MultiPolygon', coordinates: polys(g).map((p) => p.map(fixRing)).filter((p) => p[0].length >= 4) });
const cleanLine = (coords) => coords.map(([x, y]) => [round(x), round(y)]);

const [countries50, countries10, states10, places, stateLines50] = await Promise.all([
  load('ne_50m_admin_0_countries'),
  load('ne_10m_admin_0_countries'),
  load('ne_10m_admin_1_states_provinces'),
  load('ne_10m_populated_places_simple'),
  load('ne_50m_admin_1_states_provinces_lines'),
]);

// ---------- Countries ----------
const code = (p) => (p.ADM0_A3 === '-99' ? p.SOV_A3 : p.ADM0_A3);
const world = [
  ...countries10.features.filter((f) => DETAIL.has(code(f.properties))),
  ...countries50.features.filter((f) => !DETAIL.has(code(f.properties))),
]
  .filter((f) => f.geometry)
  .map((f) => ({
    type: 'Feature',
    properties: { name: f.properties.NAME, host: HOSTS.has(code(f.properties)) },
    geometry: cleanGeometry(f.geometry),
  }));

// ---------- State and province borders ----------
// Major countries come from the 1:50m lines; the Pacific detail countries use 1:10m internal borders only.
const detailStates = states10.features.filter((f) => DETAIL.has(f.properties.adm0_a3) && f.geometry);
const topo = topology({ s: { type: 'FeatureCollection', features: detailStates } }, 1e5);
const inner = mesh(topo, topo.objects.s, (a, b) => a !== b);
const stateLines = [
  ...stateLines50.features
    .filter((f) => !DETAIL.has(f.properties.ADM0_A3))
    .flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates)),
  ...inner.coordinates,
].map((line) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: cleanLine(line) } }));

// ---------- Labels ----------
// minzoom says when a label may appear; rank orders them when they compete for space (lower wins).
const labels = [];
// The southern edge of an island nation's main islands (ignoring rocks), so its name can hang below them.
const southEdge = (a3) => {
  const f = countries10.features.find((c) => code(c.properties) === a3);
  const lats = polys(f.geometry)
    .map((p) => p[0])
    .filter((ring) => {
      const xs = ring.map((c) => c[0]);
      const ys = ring.map((c) => c[1]);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) > 0.02;
    })
    .flatMap((ring) => ring.map((c) => c[1]));
  return lats.length ? Math.min(...lats) : null;
};
for (const f of countries50.features) {
  const p = f.properties;
  if (p.LABEL_X == null) continue;
  const host = HOSTS.has(code(p));
  const below = ISLANDS.has(code(p));
  labels.push({
    kind: 'country',
    name: p.NAME,
    lng: p.LABEL_X,
    lat: below ? Math.min(p.LABEL_Y, southEdge(code(p)) ?? p.LABEL_Y) : p.LABEL_Y,
    // Every Pacific nation is named from the opening view.
    minzoom: host || ISLANDS.has(code(p)) ? 1 : Math.max(1, (p.MIN_LABEL ?? 3) - 1.5),
    rank: host ? 0 : ISLANDS.has(code(p)) ? 1 : p.LABELRANK ?? 5,
    below,
  });
}
const countryNames = new Set(labels.map((l) => l.name));
for (const f of states10.features) {
  const p = f.properties;
  const detail = DETAIL.has(p.adm0_a3);
  const big = ['USA', 'CAN', 'CHN', 'IND', 'BRA', 'RUS', 'JPN'].includes(p.adm0_a3);
  if (!(detail || big) || p.longitude == null || !p.name || countryNames.has(p.name)) continue;
  labels.push({
    kind: 'state',
    name: p.name,
    lng: p.longitude,
    lat: p.latitude,
    minzoom: detail ? 4.5 : Math.max(4, p.min_label ?? 5),
    rank: 20 + (p.labelrank ?? 5),
  });
}
for (const f of places.features) {
  const p = f.properties;
  const capital = p.featurecla?.startsWith('Admin-0 capital');
  const detail = DETAIL.has(p.adm0_a3);
  if (!(capital || p.scalerank <= 2 || (detail && p.scalerank <= 8))) continue;
  labels.push({
    kind: capital ? 'capital' : 'city',
    name: p.name,
    lng: p.longitude,
    lat: p.latitude,
    minzoom: capital ? (detail ? 3 : 3.5) : detail ? Math.min(7, 3 + p.scalerank / 2) : 4,
    rank: 10 + p.scalerank + (capital ? 0 : 5),
  });
}

const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
writeFileSync('public/data/world.geojson', fc(world));
writeFileSync('public/data/states.geojson', fc(stateLines));
writeFileSync(
  'public/data/labels.geojson',
  fc(
    labels.map(({ lng, lat, ...properties }) => ({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: [round(lng), round(lat)] },
    })),
  ),
);
console.log(`world: ${world.length} countries · states: ${stateLines.length} lines · labels: ${labels.length}`);
