import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { CATEGORIES } from '../categories';

const BASE = import.meta.env.BASE_URL;
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

const MAP_CONFIG = {
  center: [160, -12],
  zoom: window.innerWidth < 760 ? 2.4 : 3.5,
  minZoom: 1.5,
  // Zoom stops at roughly state/province level; anything still stacked is listed in the panel.
  maxZoom: 8,
  // CARTO basemaps: soft, neutral colours with country, state and city names. Free with attribution.
  styleUrl: prefersDark
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  // Clusters smaller than this open as a list straight away; bigger ones zoom to fit their events first.
  listBelow: 25,
  // Open elevation tiles (Mapzen/AWS) used for a light shaded-relief texture, including the sea floor.
  terrainTiles: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};

const canHover = window.matchMedia('(hover: hover)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Bluer water plus shaded relief, so the basemap has some texture without getting busy.
function tuneStyle(style) {
  const water = prefersDark ? '#173650' : '#a9d0ea';
  const layers = style.layers.map((l) =>
    l.type === 'fill' && /water|ocean|sea/i.test(l.id) && !/shadow|pattern/i.test(l.id)
      ? { ...l, paint: { ...l.paint, 'fill-color': water } }
      : l,
  );
  style.sources.terrain = {
    type: 'raster-dem',
    tiles: [MAP_CONFIG.terrainTiles],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 12,
    attribution: 'Terrain: Mapzen, AWS',
  };
  const hillshade = {
    id: 'relief',
    type: 'hillshade',
    source: 'terrain',
    paint: prefersDark
      ? { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#3b5f80', 'hillshade-accent-color': '#0b1a26' }
      : { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#4a6f8c', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#6d8ea8' },
  };
  // Above land and water, below roads, borders and labels.
  const lastWater = layers.findLastIndex((l) => l.type === 'fill' && /water|ocean|sea/i.test(l.id));
  const firstLine = layers.findIndex((l, i) => i > lastWater && (l.type === 'line' || l.type === 'symbol'));
  layers.splice(firstLine === -1 ? layers.length : firstLine, 0, hillshade);
  return { ...style, layers };
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Used only if the online basemap can't be reached: plain countries from the bundled Natural Earth file.
const fallbackStyle = () => ({
  version: 8,
  sources: { world: { type: 'geojson', data: `${BASE}data/world.geojson` } },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': css('--sea') } },
    { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': css('--land') } },
    { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': css('--border'), 'line-width': 0.6 } },
  ],
});

async function loadStyle() {
  try {
    const res = await fetch(MAP_CONFIG.styleUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { style: tuneStyle(await res.json()), online: true };
  } catch (err) {
    console.warn('Online basemap unavailable, using the built-in map instead.', err);
    return { style: fallbackStyle(), online: false };
  }
}

function toGeoJSON(events, selectedId) {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      properties: { id: e.id, icon: e.icon, selected: e.id === selectedId },
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
    })),
  };
}

// Rasterise an SVG marker at 2x so it stays sharp on high-density screens.
function loadIcon(map, slug) {
  return new Promise((resolve) => {
    const img = new Image(80, 80);
    img.onload = () => {
      if (!map.hasImage(slug)) map.addImage(slug, img, { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `${BASE}icons/categories/${slug}.svg`;
  });
}

// Cluster bubbles match the original mock-up: a dark disc with a soft ring and the count in the middle.
// They are drawn on demand as images ("cluster-42") inside the map, so place names stay on top of them.
function drawClusterImage(map, id) {
  const count = parseInt(id.slice('cluster-'.length), 10);
  if (!Number.isFinite(count)) return;
  const scale = 2;
  const ring = 3;
  const d = Math.round(26 + Math.min(30, Math.sqrt(count) * 2.6));
  const size = d + ring * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const c = size / 2;
  const ink = css('--ink');
  ctx.beginPath();
  ctx.arc(c, c, d / 2 + ring, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(c, c, d / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css('--panel');
  ctx.font = `600 12px ${css('--mono')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count >= 1000 ? `${Math.round(count / 1000)}k` : String(count), c, c + 0.5);
  map.addImage(id, ctx.getImageData(0, 0, size * scale, size * scale), { pixelRatio: scale });
}

function hoverHTML(event) {
  const text = event.text.length > 90 ? `${event.text.slice(0, 88)}…` : event.text;
  return `<div class="hover-card">
    <div class="hover-card__meta">${esc(event.categories.join(' · '))}</div>
    <div class="hover-card__title">${esc(text || 'No description recorded.')}</div>
    <div class="hover-card__meta">${esc(event.partners.join(', '))} → ${esc(event.hosts.join(', '))} · ${event.year ?? ''}</div>
  </div>`;
}

const FALLBACK_LABELS = [
  ['Papua New Guinea', 145.2, -6.4, true],
  ['Solomon Islands', 160.2, -9.9, true],
  ['Vanuatu', 167.4, -15.6, true],
  ['Fiji', 178.6, -17.2, true],
  ['Tonga', -174.6, -21.6, true],
  ['Australia', 134, -25],
  ['New Zealand', 172.5, -41.5],
  ['Indonesia', 118, -2],
  ['New Caledonia', 165.6, -21.9],
];

export default function MapView({ events, selected, onSelect, onStack }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const latest = useRef({ events, selected, onSelect, onStack });
  latest.current = { events, selected, onSelect, onStack };

  useEffect(() => {
    let map;
    let cancelled = false;

    // Replaces the spiderifier. Small clusters list their events in the panel at once;
    // big ones zoom to fit their events in one move, then list them if they still sit together.
    async function openCluster(clusterId, coords, count) {
      const source = map.getSource('events');
      const leaves = await source.getClusterLeaves(clusterId, count, 0);
      const ids = leaves.map((l) => l.properties.id);
      if (count < MAP_CONFIG.listBelow || map.getZoom() >= MAP_CONFIG.maxZoom - 0.1) {
        latest.current.onStack(ids);
        return;
      }
      const bounds = new maplibregl.LngLatBounds();
      leaves.forEach((l) => bounds.extend(l.geometry.coordinates));
      const sameSpot = bounds.getEast() - bounds.getWest() < 0.02 && bounds.getNorth() - bounds.getSouth() < 0.02;
      const camera = sameSpot ? null : map.cameraForBounds(bounds, { padding: 80, maxZoom: MAP_CONFIG.maxZoom });
      if (!camera || camera.zoom <= map.getZoom() + 0.25) {
        latest.current.onStack(ids);
        return;
      }
      map.easeTo({ ...camera, duration: 700 });
    }

    loadStyle().then(({ style, online }) => {
      if (cancelled) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: MAP_CONFIG.center,
        zoom: MAP_CONFIG.zoom,
        minZoom: MAP_CONFIG.minZoom,
        maxZoom: MAP_CONFIG.maxZoom,
        attributionControl: { compact: true, customAttribution: 'Icons: Lucide' },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('styleimagemissing', (e) => {
        if (e.id.startsWith('cluster-')) drawClusterImage(map, e.id);
      });

      map.on('load', async () => {
        await Promise.all([
          ...CATEGORIES.map((c) => loadIcon(map, c.slug)),
          loadIcon(map, 'default'),
          document.fonts?.load(`600 12px ${css('--mono')}`).catch(() => {}),
        ]);

        // Event layers go underneath the basemap's labels so place names always stay readable.
        const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

        map.addSource('events', {
          type: 'geojson',
          data: toGeoJSON(latest.current.events, latest.current.selected?.id),
          cluster: true,
          clusterRadius: 45,
          // Cluster all the way to the zoom limit so stacked events stay grouped.
          clusterMaxZoom: MAP_CONFIG.maxZoom,
        });
        const shared = { 'icon-allow-overlap': true, 'icon-ignore-placement': true };
        map.addLayer(
          {
            id: 'points',
            type: 'symbol',
            source: 'events',
            filter: ['!', ['has', 'point_count']],
            layout: {
              ...shared,
              'icon-image': ['coalesce', ['image', ['get', 'icon']], ['image', 'default']],
              'icon-size': ['case', ['get', 'selected'], 0.95, 0.68],
              'symbol-sort-key': ['case', ['get', 'selected'], 1, 0],
            },
          },
          firstLabel,
        );
        map.addLayer(
          {
            id: 'clusters',
            type: 'symbol',
            source: 'events',
            filter: ['has', 'point_count'],
            layout: { ...shared, 'icon-image': ['concat', 'cluster-', ['to-string', ['get', 'point_count']]] },
          },
          firstLabel,
        );

        if (!online) {
          FALLBACK_LABELS.forEach(([name, lng, lat, host]) => {
            const el = document.createElement('div');
            el.className = host ? 'map-label map-label--host' : 'map-label';
            el.textContent = name;
            new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
          });
        }

        map.on('click', 'points', (e) => latest.current.onSelect(e.features[0].properties.id));
        map.on('click', 'clusters', (e) => {
          const p = e.features[0].properties;
          openCluster(p.cluster_id, e.features[0].geometry.coordinates, p.point_count);
        });
        const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'hover-popup', maxWidth: '280px' });
        for (const layer of ['points', 'clusters']) {
          map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
            hover.remove();
          });
        }
        map.on('movestart', () => hover.remove());
        if (canHover) {
          map.on('mousemove', 'points', (e) => {
            const event = latest.current.events.find((ev) => ev.id === e.features[0].properties.id);
            if (event) hover.setLngLat([event.lng, event.lat]).setHTML(hoverHTML(event)).addTo(map);
          });
          map.on('mousemove', 'clusters', (e) => {
            const n = e.features[0].properties.point_count;
            const hint = n < MAP_CONFIG.listBelow || map.getZoom() >= MAP_CONFIG.maxZoom - 0.1 ? 'Click to list them' : 'Click to zoom in';
            hover
              .setLngLat(e.features[0].geometry.coordinates)
              .setHTML(`<div class="hover-card"><div class="hover-card__title">${n} events here</div><div class="hover-card__meta">${hint}</div></div>`)
              .addTo(map);
          });
        }
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource('events');
    if (source) source.setData(toGeoJSON(events, selected?.id));
  }, [events, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!selected || !map) return;
    if (!map.getBounds().contains([selected.lng, selected.lat]) || map.getZoom() < 5) {
      map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 6) });
    }
  }, [selected]);

  return <div id="map" ref={containerRef} role="region" aria-label="Map of defence diplomacy events" />;
}
