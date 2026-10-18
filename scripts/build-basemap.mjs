// Builds public/data/world.geojson from Natural Earth (via world-atlas).
// Countries near the Pacific use the 1:50m outlines so small islands show; the rest use 1:110m to keep the file light.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const load = (scale) => {
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/countries-${scale}.json`), 'utf8'));
  return feature(topo, topo.objects.countries).features;
};

const round = (v) => Math.round(v * 100) / 100;
const nearPacific = ([x, y]) => (x > 95 || x < -140) && y > -55 && y < 30;
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

// Rings that straddle the antimeridian (Fiji, Russia) get shifted east so they don't draw a line across the map.
function fixRing(ring) {
  const xs = ring.map((c) => c[0]);
  const ys = ring.map((c) => c[1]);
  const straddles = Math.max(...xs) - Math.min(...xs) > 180 && Math.min(...ys) > -60;
  const out = ring.map(([x, y]) => [round(straddles && x < 0 ? x + 360 : x), round(y)]);
  return out.filter((c, i) => i === 0 || c[0] !== out[i - 1][0] || c[1] !== out[i - 1][1]);
}

const fine = load('50m');
const pacificNames = new Set(
  fine.filter((f) => f.geometry && rings(f.geometry).some((p) => p[0].some(nearPacific))).map((f) => f.properties.name)
);
const coarse = load('110m').filter((f) => !pacificNames.has(f.properties.name));

const features = [...fine.filter((f) => pacificNames.has(f.properties.name)), ...coarse]
  .filter((f) => f.geometry)
  .map((f) => ({
    type: 'Feature',
    properties: { name: f.properties.name },
    geometry: { type: 'MultiPolygon', coordinates: rings(f.geometry).map((p) => p.map(fixRing)) },
  }));

writeFileSync('public/data/world.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`world.geojson: ${features.length} countries (${pacificNames.size} at 1:50m)`);
