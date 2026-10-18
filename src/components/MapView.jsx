import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { CATEGORIES } from '../categories';

const BASE = import.meta.env.BASE_URL;

const MAP_CONFIG = {
  center: [160, -12],
  zoom: window.innerWidth < 760 ? 2.4 : 3.5,
  minZoom: 1.5,
  // Zoom stops at roughly district level; anything still stacked is listed in the panel.
  maxZoom: 9,
  // Cluster clicks zoom in only when the map is zoomed out further than this.
  zoomOnClickBelow: 5,
};

const canHover = window.matchMedia('(hover: hover)').matches;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The basemap is self-hosted Natural Earth data (see scripts/build-basemap.mjs): no tile server, key or quota.
const baseStyle = () => ({
  version: 8,
  sources: {
    world: { type: 'geojson', data: `${BASE}data/world.geojson`, attribution: 'Natural Earth' },
    states: { type: 'geojson', data: `${BASE}data/states.geojson` },
    labels: { type: 'geojson', data: `${BASE}data/labels.geojson` },
  },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': css('--sea') } },
    {
      id: 'land',
      type: 'fill',
      source: 'world',
      paint: { 'fill-color': ['case', ['get', 'host'], css('--host-land'), css('--land')] },
    },
    // A faint cross-hatch over the land, drawn by drawLandTexture.
    { id: 'land-texture', type: 'fill', source: 'world', paint: { 'fill-pattern': 'land-texture' } },
    {
      id: 'states',
      type: 'line',
      source: 'states',
      minzoom: 3,
      paint: {
        'line-color': css('--border'),
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 9, 1],
        'line-dasharray': [3, 2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.9],
      },
    },
    {
      id: 'borders',
      type: 'line',
      source: 'world',
      paint: {
        'line-color': css('--border-strong'),
        'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 0.5, 9, 1.6],
      },
    },
  ],
});

// Place names are drawn as images ("lbl|country|Fiji") so they use the site's own fonts and need no font server.
const LABEL_STYLE = {
  country: { size: 14, font: (px) => `600 ${px}px ${css('--display')}`, color: '--ink-2', upper: true, spacing: 1.6 },
  state: { size: 13, font: (px) => `italic 400 ${px}px ${css('--body')}`, color: '--ink-2' },
  capital: { size: 13.5, font: (px) => `600 ${px}px ${css('--body')}`, color: '--ink', dot: 3.6 },
  city: { size: 12.5, font: (px) => `400 ${px}px ${css('--body')}`, color: '--ink-2', dot: 2.8 },
};

function drawLabelImage(map, id) {
  const [, kind, ...rest] = id.split('|');
  const style = LABEL_STYLE[kind];
  if (!style) return;
  const text = style.upper ? rest.join('|').toUpperCase() : rest.join('|');
  const scale = 2;
  const halo = 3;
  const ctx = document.createElement('canvas').getContext('2d');
  const setFont = () => {
    ctx.font = style.font(style.size);
    if (style.spacing) ctx.letterSpacing = `${style.spacing}px`;
  };
  setFont();
  const textW = Math.ceil(ctx.measureText(text).width);
  const dotW = style.dot ? style.dot * 2 + 5 : 0;
  const w = textW + dotW + halo * 2;
  const h = Math.ceil(style.size * 1.45) + halo * 2;
  ctx.canvas.width = w * scale;
  ctx.canvas.height = h * scale;
  ctx.scale(scale, scale);
  setFont();
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css('--halo');
  ctx.lineWidth = halo;
  const x = halo + dotW;
  const y = h / 2 + 0.5;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = css(style.color);
  ctx.fillText(text, x, y);
  if (style.dot) {
    ctx.beginPath();
    ctx.arc(halo + style.dot, h / 2, style.dot, 0, Math.PI * 2);
    ctx.fillStyle = css('--ink-2');
    ctx.strokeStyle = css('--halo');
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
  map.addImage(id, ctx.getImageData(0, 0, w * scale, h * scale), { pixelRatio: scale });
}

function drawLandTexture(map) {
  const size = 10;
  const scale = 2;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = ctx.canvas.height = size * scale;
  ctx.scale(scale, scale);
  ctx.strokeStyle = css('--land-texture');
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  // Two diagonals that tile seamlessly.
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.stroke();
  map.addImage('land-texture', ctx.getImageData(0, 0, size * scale, size * scale), { pixelRatio: scale });
}

function addLabelLayers(map) {
  const image = ['concat', 'lbl|', ['get', 'kind'], '|', ['get', 'name']];
  const shown = ['>=', ['zoom'], ['get', 'minzoom']];
  const layout = { 'icon-image': image, 'symbol-sort-key': ['get', 'rank'], 'icon-padding': 2 };
  // Event markers never push a name off the map; names only compete with each other for space.
  map.addLayer({ id: 'labels-states', type: 'symbol', source: 'labels', layout, filter: ['all', ['==', ['get', 'kind'], 'state'], shown] });
  map.addLayer({
    id: 'labels-cities',
    type: 'symbol',
    source: 'labels',
    layout: { ...layout, 'icon-anchor': 'left', 'icon-offset': [-6, 0] },
    filter: ['all', ['in', ['get', 'kind'], ['literal', ['city', 'capital']]], shown],
  });
  // Island nations sit under their event bubbles, so their names hang just below the islands.
  map.addLayer({
    id: 'labels-countries',
    type: 'symbol',
    source: 'labels',
    layout: {
      ...layout,
      'icon-anchor': ['case', ['get', 'below'], 'top', 'center'],
      'icon-offset': ['case', ['get', 'below'], ['literal', [0, 22]], ['literal', [0, 0]]],
    },
    filter: ['all', ['==', ['get', 'kind'], 'country'], shown],
  });
}

// An invisible footprint under each cluster bubble, so a town or state name is hidden rather than half covered.
// It sits below the country names, which always keep their place.
function addClusterFootprints(map) {
  const size = 64;
  map.addImage('clu-footprint', { width: size, height: size, data: new Uint8Array(size * size * 4) });
  map.addLayer({
    id: 'cluster-footprints',
    type: 'symbol',
    source: 'events',
    filter: ['has', 'point_count'],
    layout: {
      'icon-image': 'clu-footprint',
      // Matches the bubble size in drawClusters, plus its ring.
      'icon-size': ['/', ['+', 32, ['min', 30, ['*', ['sqrt', ['get', 'point_count']], 2.6]]], size],
      'icon-allow-overlap': true,
    },
  }, 'labels-countries');
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

// Room left for the side panel (bottom sheet on phones) and year strip when the map zooms to fit events.
function clearOfPanel() {
  return window.innerWidth < 760
    ? { top: 140, bottom: Math.round(window.innerHeight * 0.45), left: 40, right: 40 }
    : { top: 80, bottom: 120, left: 420, right: 80 };
}

function hoverHTML(event) {
  const text = event.text.length > 90 ? `${event.text.slice(0, 88)}…` : event.text;
  return `<div class="hover-card">
    <div class="hover-card__meta">${esc(event.categories.join(' · '))}</div>
    <div class="hover-card__title">${esc(text || 'No description recorded.')}</div>
    <div class="hover-card__meta">${esc(event.partners.join(', '))} → ${esc(event.hosts.join(', '))} · ${event.year ?? ''}</div>
  </div>`;
}

export default function MapView({ events, selected, onSelect, onStack }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const latest = useRef({ events, selected, onSelect, onStack });
  latest.current = { events, selected, onSelect, onStack };

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(),
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      attributionControl: { compact: true, customAttribution: 'Icons: Lucide' },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('styleimagemissing', (e) => {
      if (e.id.startsWith('lbl|')) drawLabelImage(map, e.id);
      else if (e.id === 'land-texture') drawLandTexture(map);
    });

    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'hover-popup', maxWidth: '280px' });
    map.on('movestart', () => hover.remove());

    // Replaces the spiderifier. Small clusters list their events in the panel at once;
    // big ones zoom to fit their events in one move, then list them if they still sit together.
    async function openCluster(clusterId, coords, count) {
      const source = map.getSource('events');
      const leaves = await source.getClusterLeaves(clusterId, count, 0);
      // Every click lists the cluster's events in the panel. Only from the zoomed-out overview does it also zoom in;
      // closer in, the list just opens and scroll-zoom is there if needed.
      latest.current.onStack(leaves.map((l) => l.properties.id));
      if (map.getZoom() >= MAP_CONFIG.zoomOnClickBelow) return;
      const bounds = new maplibregl.LngLatBounds();
      leaves.forEach((l) => bounds.extend(l.geometry.coordinates));
      const camera = map.cameraForBounds(bounds, { padding: clearOfPanel(), maxZoom: MAP_CONFIG.maxZoom });
      const zoom = Math.min(MAP_CONFIG.maxZoom, Math.max(camera?.zoom ?? 0, map.getZoom() + 1.5));
      if (zoom > map.getZoom() + 0.05) map.easeTo({ center: camera?.center ?? coords, zoom, duration: 700 });
    }

    // Cluster bubbles are HTML, styled exactly as in the mock-up (.clu in App.css).
    let markers = {};
    let onScreen = {};
    const resetClusters = () => {
      Object.values(onScreen).forEach((m) => m.remove());
      markers = {};
      onScreen = {};
    };
    const drawClusters = () => {
      if (!map.getSource('events') || !map.isSourceLoaded('events')) return;
      const next = {};
      for (const f of map.querySourceFeatures('events')) {
        const p = f.properties;
        if (!p.cluster || next[p.cluster_id]) continue;
        let marker = markers[p.cluster_id];
        if (!marker) {
          const el = document.createElement('button');
          el.className = 'clu';
          const size = Math.round(26 + Math.min(30, Math.sqrt(p.point_count) * 2.6));
          el.style.width = el.style.height = `${size}px`;
          el.textContent = p.point_count_abbreviated;
          el.setAttribute('aria-label', `${p.point_count} events, open`);
          const coords = f.geometry.coordinates;
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hover.remove();
            openCluster(p.cluster_id, coords, p.point_count);
          });
          if (canHover) {
            el.addEventListener('mouseenter', () =>
              hover
                .setLngLat(coords)
                .setHTML(
                  `<div class="hover-card"><div class="hover-card__title">${p.point_count} events here</div><div class="hover-card__meta">${map.getZoom() < MAP_CONFIG.zoomOnClickBelow ? 'Click to zoom in and list them' : 'Click to list them'}</div></div>`,
                )
                .addTo(map),
            );
            el.addEventListener('mouseleave', () => hover.remove());
          }
          marker = markers[p.cluster_id] = new maplibregl.Marker({ element: el }).setLngLat(coords);
        }
        next[p.cluster_id] = marker;
        if (!onScreen[p.cluster_id]) marker.addTo(map);
      }
      for (const id in onScreen) if (!next[id]) onScreen[id].remove();
      onScreen = next;
    };

    // Re-colour the map and redraw the names when the device switches between light and dark.
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const repaint = () => {
      if (!map.getLayer('land')) return;
      map.setPaintProperty('sea', 'background-color', css('--sea'));
      map.setPaintProperty('land', 'fill-color', ['case', ['get', 'host'], css('--host-land'), css('--land')]);
      map.setPaintProperty('states', 'line-color', css('--border'));
      map.setPaintProperty('borders', 'line-color', css('--border-strong'));
      map
        .listImages()
        .filter((id) => id.startsWith('lbl|') || id === 'land-texture')
        .forEach((id) => map.removeImage(id));
      map.triggerRepaint();
    };
    scheme.addEventListener('change', repaint);

    map.on('load', async () => {
      await Promise.all([
        ...CATEGORIES.map((c) => loadIcon(map, c.slug)),
        loadIcon(map, 'default'),
        document.fonts?.load(`600 11px ${css('--display')}`).catch(() => {}),
        document.fonts?.load(`400 11px ${css('--body')}`).catch(() => {}),
        document.fonts?.load(`600 11px ${css('--body')}`).catch(() => {}),
        document.fonts?.load(`italic 400 11px ${css('--body')}`).catch(() => {}),
      ]);

      map.addSource('events', {
        type: 'geojson',
        data: toGeoJSON(latest.current.events, latest.current.selected?.id),
        cluster: true,
        clusterRadius: 46,
        // Cluster all the way to the zoom limit so stacked events stay grouped.
        clusterMaxZoom: MAP_CONFIG.maxZoom,
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
          'icon-ignore-placement': true,
          'symbol-sort-key': ['case', ['get', 'selected'], 1, 0],
        },
      });
      // Names go above the event markers so they are always readable.
      addLabelLayers(map);
      addClusterFootprints(map);

      map.on('click', 'points', (e) => latest.current.onSelect(e.features[0].properties.id));
      map.on('mouseenter', 'points', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'points', () => {
        map.getCanvas().style.cursor = '';
        hover.remove();
      });
      if (canHover) {
        map.on('mousemove', 'points', (e) => {
          const event = latest.current.events.find((ev) => ev.id === e.features[0].properties.id);
          if (event) hover.setLngLat([event.lng, event.lat]).setHTML(hoverHTML(event)).addTo(map);
        });
      }
      map.on('render', drawClusters);
      map.on('sourcedata', (e) => {
        if (e.sourceId === 'events' && e.isSourceLoaded && e.sourceDataType !== 'metadata') resetClusters();
      });
    });

    return () => {
      scheme.removeEventListener('change', repaint);
      hover.remove();
      map.remove();
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
