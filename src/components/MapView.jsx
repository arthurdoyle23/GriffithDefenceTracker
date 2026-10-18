import { useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { CATEGORIES, FAMILIES } from '../categories';
import { createPopupHTML } from '../popup';

const BASE = import.meta.env.BASE_URL;

const MAP_CONFIG = {
  CENTER: [163.7482, -12.7648],
  INITIAL_ZOOM: window.innerWidth < 768 ? 2.4 : 3.5,
  MIN_ZOOM: 1.5,
  // Zoom stops at roughly state/province level; anything still stacked is listed in the sidebar.
  MAX_ZOOM: 8,
  // OpenFreeMap: free OpenStreetMap vector tiles with state borders and place names, no account or key.
  STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',
};

const FAMILY_IDS = Object.keys(FAMILIES);

// Used only if the online basemap can't be reached: plain countries from the bundled Natural Earth file.
const FALLBACK_STYLE = {
  version: 8,
  sources: { world: { type: 'geojson', data: `${BASE}data/world.geojson` } },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': '#cfe3ef' } },
    { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': '#f4f1ea' } },
    { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': '#b9b4aa', 'line-width': 0.6 } },
  ],
};

async function loadStyle() {
  try {
    const res = await fetch(MAP_CONFIG.STYLE_URL, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(res.status);
    return { style: await res.json(), online: true };
  } catch (err) {
    console.warn('Online basemap unavailable, using the built-in map instead.', err);
    return { style: FALLBACK_STYLE, online: false };
  }
}

function toGeoJSON(events) {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      properties: { id: e.id, icon: e.icon, family: e.family },
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
  const r = Math.round(22 + Math.min(16, Math.sqrt(total) * 1.6));
  const r0 = Math.round(r * 0.62);
  const w = r * 2;

  let html = `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" text-anchor="middle">`;
  let start = 0;
  counts.forEach((n, i) => {
    if (!n) return;
    const end = start + n / total;
    html += segment(start, end, r, r0, FAMILIES[FAMILY_IDS[i]].color);
    start = end;
  });
  html += `<circle cx="${r}" cy="${r}" r="${r0}" fill="#ffffff"/>`;
  html += `<circle cx="${r}" cy="${r}" r="${r - 0.75}" fill="none" stroke="#ffffff" stroke-width="1.5"/>`;
  html += `<text x="${r}" y="${r}" dominant-baseline="central" font-size="${total >= 100 ? 12 : 13}" font-weight="700" fill="#222">${props.point_count_abbreviated}</text>`;
  html += '</svg>';

  const el = document.createElement('button');
  el.className = 'cluster-pie';
  el.innerHTML = html;
  el.setAttribute('aria-label', `${props.point_count} events here`);
  return el;
}

function segment(start, end, r, r0, color) {
  if (end - start >= 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const [x0, y0, x1, y1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
  const largeArc = end - start > 0.5 ? 1 : 0;
  return `<path d="M ${r + r0 * x0} ${r + r0 * y0} L ${r + r * x0} ${r + r * y0} A ${r} ${r} 0 ${largeArc} 1 ${r + r * x1} ${r + r * y1} L ${r + r0 * x1} ${r + r0 * y1} A ${r0} ${r0} 0 ${largeArc} 0 ${r + r0 * x0} ${r + r0 * y0}" fill="${color}"/>`;
}

const HOST_LABELS = [
  ['Papua New Guinea', 145.2, -6.4],
  ['Solomon Islands', 160.2, -9.9],
  ['Vanuatu', 167.4, -15.6],
  ['Fiji', 178.6, -17.2],
  ['Tonga', -174.6, -21.6],
  ['Australia', 134, -25],
  ['New Zealand', 172.5, -41.5],
];

export default function MapView({ ref, events, onStack, className }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const latest = useRef({ events, onStack });
  latest.current = { events, onStack };

  const showPopup = (event) => {
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ offset: [0, -14], anchor: 'bottom', closeOnClick: false, className: 'feature-popup' })
      .setLngLat([event.lng, event.lat])
      .setDOMContent(createPopupHTML(event))
      .addTo(mapRef.current);
  };

  useImperativeHandle(ref, () => ({
    showEvent(event) {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [event.lng, event.lat], zoom: Math.max(map.getZoom(), 6), speed: 1.2 });
      map.once('moveend', () => showPopup(event));
    },
  }));

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

    const drawClusters = () => {
      if (!map.getSource('markers') || !map.isSourceLoaded('markers')) return;
      const next = {};
      for (const f of map.querySourceFeatures('markers')) {
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

    // Clicking a cluster lists its events in the sidebar, and moves in a little if it can still split.
    async function openCluster(clusterId, coords, count) {
      const source = map.getSource('markers');
      const leaves = await source.getClusterLeaves(clusterId, count, 0);
      latest.current.onStack(leaves.map((l) => l.properties.id));
      const expansion = await source.getClusterExpansionZoom(clusterId);
      const zoom = Math.min(expansion, map.getZoom() + 2, MAP_CONFIG.MAX_ZOOM);
      map.easeTo({ center: coords, zoom: Math.max(zoom, map.getZoom()) });
    }

    loadStyle().then(({ style, online }) => {
      if (cancelled) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: MAP_CONFIG.CENTER,
        zoom: MAP_CONFIG.INITIAL_ZOOM,
        minZoom: MAP_CONFIG.MIN_ZOOM,
        maxZoom: MAP_CONFIG.MAX_ZOOM,
        attributionControl: { compact: true, customAttribution: 'Icons: Lucide' },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', async () => {
        await Promise.all([...CATEGORIES.map((c) => loadIcon(map, c.slug)), loadIcon(map, 'default')]);

        map.addSource('markers', {
          type: 'geojson',
          data: toGeoJSON(latest.current.events),
          cluster: true,
          clusterRadius: 45,
          // Keep clustering all the way to the zoom limit so stacked events stay grouped.
          clusterMaxZoom: MAP_CONFIG.MAX_ZOOM,
          clusterProperties: Object.fromEntries(
            FAMILY_IDS.map((id) => [id, ['+', ['case', ['==', ['get', 'family'], id], 1, 0]]]),
          ),
        });
        // Invisible layer so clusters can be queried; the pie charts are HTML markers.
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'markers',
          filter: ['has', 'point_count'],
          paint: { 'circle-radius': 0, 'circle-opacity': 0 },
        });
        map.addLayer({
          id: 'unclustered-point',
          type: 'symbol',
          source: 'markers',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['coalesce', ['image', ['get', 'icon']], ['image', 'default']],
            'icon-size': 0.75,
            'icon-allow-overlap': true,
          },
        });

        if (!online) {
          HOST_LABELS.forEach(([name, lng, lat]) => {
            const el = document.createElement('div');
            el.className = 'map-label';
            el.textContent = name;
            new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
          });
        }

        map.on('click', 'unclustered-point', (e) => {
          const event = latest.current.events.find((ev) => ev.id === e.features[0].properties.id);
          if (event) showPopup(event);
        });
        map.on('mouseenter', 'unclustered-point', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'unclustered-point', () => (map.getCanvas().style.cursor = ''));
        map.on('render', drawClusters);
        map.on('sourcedata', (e) => {
          if (e.sourceId === 'markers' && e.isSourceLoaded && e.sourceDataType !== 'metadata') resetClusters();
        });
      });
    });

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource('markers');
    if (source) {
      popupRef.current?.remove();
      source.setData(toGeoJSON(events));
    }
  }, [events]);

  return <div id="map-container" ref={containerRef} className={className} />;
}
