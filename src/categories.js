// Engagement types, grouped into colour families. The map, legend and icon script all read from here.

export const FAMILIES = {
  ops: { name: 'Operations & training', color: '#2457a6' },
  eng: { name: 'Engagement', color: '#d71f2f' },
  aid: { name: 'Assistance', color: '#0f8a77' },
  soft: { name: 'Soft power', color: '#c27a00' },
};

export const CATEGORIES = [
  { name: 'Military Exercises', family: 'ops', slug: 'military-exercises', glyph: 'crosshair' },
  { name: 'Training', family: 'ops', slug: 'training', glyph: 'graduation-cap' },
  { name: 'Maritime Security', family: 'ops', slug: 'maritime-security', glyph: 'anchor' },
  { name: 'Visit Diplomacy', family: 'eng', slug: 'visit-diplomacy', glyph: 'plane' },
  { name: 'Defence Cooperation', family: 'eng', slug: 'defence-cooperation', glyph: 'handshake' },
  { name: 'MIL-POL Engagement', family: 'eng', slug: 'mil-pol-engagement', glyph: 'landmark' },
  { name: 'Arms Control', family: 'eng', slug: 'arms-control', glyph: 'shield-ban' },
  { name: 'HADR – Disaster Response', family: 'aid', slug: 'hadr', glyph: 'life-buoy' },
  { name: 'Defence Infrastructure', family: 'aid', slug: 'defence-infrastructure', glyph: 'hard-hat' },
  { name: 'Military Medical Diplomacy', family: 'aid', slug: 'military-medical', glyph: 'stethoscope' },
  { name: 'Sports Diplomacy', family: 'soft', slug: 'sports-diplomacy', glyph: 'trophy' },
  { name: 'Cultural Diplomacy', family: 'soft', slug: 'cultural-diplomacy', glyph: 'drama' },
  { name: 'Public Diplomacy', family: 'soft', slug: 'public-diplomacy', glyph: 'megaphone' },
];

export const CATEGORY_BY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.name, c]));
export const ALL_CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

// The spreadsheet spells types several ways ("MIL - POL Engagement", "HADR - disaster response",
// "Sports Diplomacy (Defence)"), so names are matched on letters only.
const key = (s) => s.toLowerCase().replace(/\(defence\)/g, '').replace(/[^a-z]/g, '');
const ALIASES = Object.fromEntries(CATEGORIES.map((c) => [key(c.name), c.name]));
Object.assign(ALIASES, {
  hadr: 'HADR – Disaster Response',
  disasterresponse: 'HADR – Disaster Response',
  hadrdisasterresponse: 'HADR – Disaster Response',
  medicaldiplomacy: 'Military Medical Diplomacy',
  milpol: 'MIL-POL Engagement',
});

export function canonicalCategory(raw) {
  return ALIASES[key(raw)] ?? null;
}
