// Builds the event pop-up shown on the map (same layout as the original tracker).
export function createPopupHTML(event) {
  const el = document.createElement('div');
  el.className = 'popup-container';

  const heading = document.createElement('h2');
  heading.textContent = event.categories.join(' / ') || 'Unknown Category';
  el.appendChild(heading);

  if (event.text) {
    const desc = document.createElement('p');
    desc.textContent = event.text.length > 250 ? `${event.text.slice(0, 247)}...` : event.text;
    el.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'popup-meta';
  const row = (label, value) => {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    div.append(strong, value);
    meta.appendChild(div);
  };
  row('From', event.partners.join(', ') || 'Unknown');
  row('To', event.hosts.join(', ') || 'Unknown');
  if (event.year) row('Year', String(event.year));
  el.appendChild(meta);

  if (event.source) {
    const link = document.createElement('a');
    link.className = 'popup-source';
    link.href = event.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Source';
    el.appendChild(link);
  }
  return el;
}
