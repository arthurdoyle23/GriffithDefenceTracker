import { useMemo, useState } from 'react';
import { ALL_CATEGORY_NAMES, CATEGORIES, FAMILIES } from '../categories';
import { countBy } from '../events';
import { partnerInfo } from '../partners';

const BASE = import.meta.env.BASE_URL;
const PAGE = 60;

export default function Panel(props) {
  const { events, visible, year, tab, setTab, query, setQuery, open, setOpen, loadError } = props;

  const years = useMemo(() => events.map((e) => e.year).filter(Boolean), [events]);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';
  const partnerCount = new Set(visible.flatMap((e) => e.partners)).size;

  return (
    <aside className={`panel${open ? '' : ' panel--collapsed'}`}>
      <button
        className="panel__handle"
        onClick={() => setOpen(!open)}
        aria-label="Expand or collapse the panel"
        aria-expanded={open}
      />
      <header className="panel__head">
        <div className="brand">
          <img src={`${BASE}icons/Griffith.png`} alt="Griffith University" />
          <span className="eyebrow">Defence diplomacy · Pacific</span>
        </div>
        <h1>Who is engaging the Pacific, and how</h1>
        <p className="summary">
          {loadError ? (
            <span className="error">{loadError}. Refresh to try again.</span>
          ) : (
            <>
              <b>{visible.length}</b> of {events.length} engagements from <b>{partnerCount}</b>{' '}
              {partnerCount === 1 ? 'partner' : 'partners'},{' '}
              <span className="nowrap">{year ?? span}</span>
            </>
          )}
        </p>
      </header>

      <label className="search" htmlFor="search">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="search"
          type="search"
          placeholder="Search, e.g. Pukpuk, Bushmaster, Kumul"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'filters'} onClick={() => setTab('filters')}>
          Legend &amp; filters
        </button>
        <button role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>
          Events <span className="tabs__n">{props.listed.length}</span>
        </button>
      </div>

      {tab === 'filters' ? <Filters {...props} /> : <EventList {...props} />}
    </aside>
  );
}

function Filters({ events, year, categories, setCategories, partners, setPartners }) {
  // Counts follow the partner and year filters, so the legend says what each type would show.
  const base = events.filter(
    (e) => (!year || e.year === year) && (!partners.size || e.partners.some((p) => partners.has(p))),
  );
  const catCounts = countBy(base, (e) => e.categories);
  const partnerCounts = useMemo(
    () => Object.entries(countBy(events, (e) => e.partners)).sort((a, b) => b[1] - a[1]),
    [events],
  );

  const toggleCategory = (name) => {
    setCategories((cur) => {
      // The first click isolates one type, which is what people usually want; later clicks add or remove.
      if (cur.size === ALL_CATEGORY_NAMES.length) return new Set([name]);
      const next = new Set(cur);
      next.has(name) ? next.delete(name) : next.add(name);
      return next.size ? next : new Set(ALL_CATEGORY_NAMES);
    });
  };
  const togglePartner = (name) =>
    setPartners((cur) => {
      const next = new Set(cur);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div className="panel__scroll" role="tabpanel">
      <section className="group">
        <div className="group__head">
          <h2>Type of engagement</h2>
          <button className="link" onClick={() => setCategories(new Set(ALL_CATEGORY_NAMES))}>
            Show all
          </button>
        </div>
        {Object.entries(FAMILIES).map(([id, fam]) => (
          <div key={id} className="family" style={{ '--c': `var(--f-${id})` }}>
            <div className="family__name">
              <i />
              {fam.name}
            </div>
            {CATEGORIES.filter((c) => c.family === id).map((c) => (
              <button
                key={c.name}
                className="category"
                aria-pressed={categories.has(c.name)}
                onClick={() => toggleCategory(c.name)}
              >
                <img src={`${BASE}icons/categories/${c.slug}.svg`} alt="" />
                <span>{c.name}</span>
                <span className="count">{catCounts[c.name] ?? 0}</span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section className="group">
        <div className="group__head">
          <h2>Delivering partner</h2>
          {partners.size > 0 && (
            <button className="link" onClick={() => setPartners(new Set())}>
              Clear
            </button>
          )}
        </div>
        <div className="chips">
          {partnerCounts.map(([name, n]) => {
            const info = partnerInfo(name);
            return (
              <button key={name} className="chip" aria-pressed={partners.has(name)} onClick={() => togglePartner(name)}>
                <code>{info.code}</code>
                {info.short}
                <code>{n}</code>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function EventList({ listed, stacked, clearStack, selectedId, onPick }) {
  const [shown, setShown] = useState(PAGE);
  const sorted = useMemo(() => [...listed].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)), [listed]);

  return (
    <div className="panel__scroll" role="tabpanel">
      {stacked && (
        <div className="stack-note">
          <span>
            <b>{listed.length}</b> events at this location
          </span>
          <button className="link" onClick={clearStack}>
            Show all
          </button>
        </div>
      )}
      {sorted.length === 0 && <p className="empty">No events match. Try clearing a filter.</p>}
      <ul className="events">
        {sorted.slice(0, shown).map((e) => (
          <li key={e.id}>
            <button
              className="event"
              aria-current={selectedId === e.id}
              style={{ '--c': `var(--f-${e.family})` }}
              onClick={() => onPick(e.id)}
            >
              <span className="event__dot" />
              <span>
                <span className="event__meta">
                  {e.year} · {e.partners.map((p) => partnerInfo(p).code).join(' · ')} →{' '}
                  {e.hosts.map((h) => partnerInfo(h).code).join(' · ')}
                </span>
                <span className="event__text">{e.text || e.categories.join(', ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sorted.length > shown && (
        <button className="more" onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(PAGE, sorted.length - shown)} more of {sorted.length - shown}
        </button>
      )}
    </div>
  );
}
