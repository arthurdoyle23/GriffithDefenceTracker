import { CATEGORY_BY_NAME, canonicalCategory } from './categories';
import { partnerInfo } from './partners';

const splitList = (s) => (s ? String(s).split(';').map((x) => x.trim()).filter(Boolean) : []);
const tidy = (s) => (s ? String(s).replace(/\s+/g, ' ').trim() : '');
// A few rows hold placeholder text such as "URL Link" instead of a web address.
const webAddress = (s) => (/^https?:\/\/\S+$/i.test(tidy(s)) ? tidy(s) : '');

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
      const partners = splitList(p.Delivering_Country);
      const hosts = splitList(p.Receiving_Countries);
      const year = parseInt(p.Year, 10) || null;
      const text = tidy(p.Comments);
      // Search covers the text, year, types, and partner and host names in full, short and code form (AUS, PNG).
      const names = [...partners, ...hosts].flatMap((n) => [n, partnerInfo(n).short, partnerInfo(n).code]);
      return {
        id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        year,
        partners,
        hosts,
        categories,
        icon: primary?.slug ?? 'default',
        family: primary?.family ?? 'eng',
        text,
        source: webAddress(p.Source),
        search: [text, year, ...names, ...categories].join(' ').toLowerCase(),
      };
    });
}

export function countBy(list, pick) {
  const counts = {};
  for (const item of list) for (const k of [].concat(pick(item))) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}
