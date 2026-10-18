import { CATEGORY_BY_NAME, canonicalCategory } from './categories';

const splitList = (s) => (s ? String(s).split(';').map((x) => x.trim()).filter(Boolean) : []);

// Loads the events GeoJSON and turns each feature into a plain, cleaned record.
export async function loadEvents() {
  const res = await fetch(`${import.meta.env.BASE_URL}data/events.geojson`);
  if (!res.ok) throw new Error(`Could not load events (${res.status})`);
  const data = await res.json();

  return data.features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f, id) => {
      const p = f.properties;
      const rawCats = splitList(p.Diplomacy_category);
      const categories = [...new Set(rawCats.map(canonicalCategory).filter(Boolean))];
      if (rawCats.length && categories.length < rawCats.length) {
        console.warn('Unrecognised category in row', id, p.Diplomacy_category);
      }
      const primary = CATEGORY_BY_NAME[categories[0]];
      return {
        id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        year: parseInt(p.Year, 10) || null,
        partners: splitList(p.Delivering_Country),
        hosts: splitList(p.Receiving_Countries),
        categories,
        icon: primary?.slug ?? 'default',
        family: primary?.family ?? 'eng',
        text: p.Comments ?? '',
        source: p.Source ?? '',
        search: [p.Comments, p.Delivering_Country, p.Receiving_Countries, categories.join(' ')].join(' ').toLowerCase(),
      };
    });
}

export function countBy(list, pick) {
  const counts = {};
  for (const item of list) for (const k of [].concat(pick(item))) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}
