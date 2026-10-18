import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { CATEGORIES, FAMILIES } from '../categories';

const BASE = import.meta.env.BASE_URL;

const MAP_CONFIG = {
  center: [160, -12],
  zoom: window.innerWidth < 760 ? 2.4 : 3.5,
  minZoom: 1.5,
  // Zoom stops at roughly state/province level; anything still stacked is listed in the panel.
  maxZoom: 8,
  // OpenFreeMap: free OpenStreetMap vector tiles with state borders and place names, no account or key.
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
};

const FAMILY_IDS = Object.keys(FAMILIES);
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
    return { style: await res.json(), online: true };
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
      properties: { id: e.id, icon: e.icon, family: e.family, selected: e.id === selectedId },
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

// A donut chart of the engagement families in a cluster, with the total in the middle.
function pieMarker(props) {
  const counts = FAMILY_IDS.map((id) => props[id] ?? 0);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const r = Math.round(18 + Math.min(14, Math.sqrt(total) * 1.5));
  const r0 = Math.round(r * 0.6);
  const w = r * 2;

  let svg = `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" text-anchor="middle" aria-hidden="true">`;
  let start = 0;
  counts.forEach((n, i) => {
    if (!n) return;
    const end = start + n / total;
    svg += segment(start, end, r, r0, `var(--f-${FAMILY_IDS[i]})`);
    start = end;
  });
  svg += `<circle cx="${r}" cy="${r}" r="${r0}" fill="var(--panel)"/>`;
  svg += `<text x="${r}" y="${r}" dominant-baseline="central" font-size="${total >= 100 ? 11 : 12}" font-weight="600" fill="var(--ink)" font-family="var(--mono)">${props.point_count_abbreviated}</text>`;
  svg += '</svg>';

  const el = document.createElement('button');
  el.className = 'cluster';
  el.innerHTML = svg;
  el.setAttribute('aria-label', `${props.point_count} events here, show list`);
  return el;
}

function segment(start, end, r, r0, color) {
  if (end - start >= 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const [x0, y0, x1, y1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
  const large = end - start > 0.5 ? 1 : 0;
  return `<path d="M ${r + r0 * x0} ${r + r0 * y0} L ${r + r * x0} ${r + r * y0} A ${r} ${r} 0 ${large} 1 ${r + r * x1} ${r + r * y1} L ${r + r0 * x1} ${r + r0 * y1} A ${r0} ${r0} 0 ${large} 0 ${r + r0 * x0} ${r + r0 * y0}" fill="${color}"/>`;
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
    let markers = {};
    let onScreen = {};

    const resetClusters = () => {
      Object.values(onScreen).forEach((m) => m.remove());
      markers = {};
      onScreen = {};
    };

    // Cluster pies are HTML markers; re-drawn as the map moves.
    const drawClusters = () => {
      if (!map.getSource('events') || !map.isSourceLoaded('events')) return;
      const next = {};
      for (const f of map.querySourceFeatures('events')) {
        const p = f.properties;
        if (!p.cluster || next[p.cluster_id]) continue;
        let marker = markers[p.cluster_id];
        if (!marker) {
          const el = pieMarker(p);
          const coords = f.geometry.coordinates;
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            openCluster(p.cluster_id, coords, p.point_count);
          });
          marker = markers[p.cluster_id] = new maplibregl.Marker({ element: el }).setLngLat(coords);
        }
        next[p.cluster_id] = marker;
        if (!onScreen[p.cluster_id]) marker.addTo(map);
      }
      for (const id in onScreen) if (!next[id]) onScreen[id].remove();
      onScreen = next;
    };

    // Replaces the spiderifier: a click lists the cluster's events in the panel,
    // and moves in a little if the cluster can still split apart.
    async function openCluster(clusterId, coords, count) {
      const source = map.getSource('events');
      const leaves = await source.getClusterLeaves(clusterId, count, 0);
      latest.current.onStack(leaves.map((l) => l.properties.id));
      const expansion = await source.getClusterExpansionZoom(clusterId);
      const zoom = Math.min(expansion, map.getZoom() + 2, MAP_CONFIG.maxZoom);
      map.easeTo({ center: coords, zoom: Math.max(zoom, map.getZoom()) });
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

      map.on('load', async () => {
        await Promise.all([...CATEGORIES.map((c) => loadIcon(map, c.slug)), loadIcon(map, 'default')]);

        map.addSource('events', {
          type: 'geojson',
          data: toGeoJSON(latest.current.events, latest.current.selected?.id),
          cluster: true,
          clusterRadius: 45,
          // Cluster all the way to the zoom limit so stacked events stay grouped.
          clusterMaxZoom: MAP_CONFIG.maxZoom,
          clusterProperties: Object.fromEntries(
            FAMILY_IDS.map((id) => [id, ['+', ['case', ['==', ['get', 'family'], id], 1, 0]]]),
          ),
        });
        // Invisible layer so clusters can be queried; the pies themselves are HTML markers.
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'events',
          filter: ['has', 'point_count'],
          paint: { 'circle-radius': 0, 'circle-opacity': 0 },
        });
        map.addLayer({
          id: 'points',
          type: 'symbol',
          source: 'events',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['coalesce', ['image', ['get', 'icon']], ['image', 'default']],
            'icon-size': ['case', ['get', 'selected'], 0.95, 0.68],
            'icon-allow-overlap': true,
            'symbol-sort-key': ['case', ['get', 'selected'], 1, 0],
          },
        });

        if (!online) {
          FALLBACK_LABELS.forEach(([name, lng, lat, host]) => {
            const el = document.createElement('div');
            el.className = host ? 'map-label map-label--host' : 'map-label';
            el.textContent = name;
            new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
          });
        }

        map.on('click', 'points', (e) => latest.current.onSelect(e.features[0].properties.id));
        map.on('mouseenter', 'points', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'points', () => (map.getCanvas().style.cursor = ''));
        map.on('render', drawClusters);
        map.on('sourcedata', (e) => {
          if (e.sourceId === 'events' && e.isSourceLoaded && e.sourceDataType !== 'metadata') resetClusters();
        });
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
