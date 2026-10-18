// Builds the category marker icons in public/icons/categories from Lucide glyphs (ISC licence).
// Each marker is a round badge in the category family's colour with a white glyph.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CATEGORIES, FAMILIES } from '../src/categories.js';

const require = createRequire(import.meta.url);
const outDir = 'public/icons/categories';
mkdirSync(outDir, { recursive: true });

const markers = [...CATEGORIES, { slug: 'default', glyph: 'circle-dot', color: '#6b7680' }];

for (const cat of markers) {
  const src = readFileSync(require.resolve(`lucide-static/icons/${cat.glyph}.svg`), 'utf8');
  const inner = src.slice(src.indexOf('>', src.indexOf('<svg')) + 1, src.lastIndexOf('</svg>')).trim();
  const color = cat.color ?? FAMILIES[cat.family].color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>
  <g transform="translate(10.4 10.4) scale(0.8)" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg>
`;
  writeFileSync(`${outDir}/${cat.slug}.svg`, svg);
}
console.log(`Wrote ${markers.length} icons to ${outDir}`);
