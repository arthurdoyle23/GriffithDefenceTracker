import { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Panel from './components/Panel';
import EventCard from './components/EventCard';
import YearStrip from './components/YearStrip';
import { ALL_CATEGORY_NAMES } from './categories';
import { loadEvents } from './events';

export default function App() {
  const [events, setEvents] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [categories, setCategories] = useState(() => new Set(ALL_CATEGORY_NAMES));
  const [partners, setPartners] = useState(() => new Set());
  const [year, setYear] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  // Events under the cluster the user clicked; listed in the panel instead of everything.
  const [stack, setStack] = useState(null);
  const [tab, setTab] = useState('filters');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 760);

  useEffect(() => {
    loadEvents().then(setEvents).catch((err) => setLoadError(err.message));
  }, []);

  // Everything except the year filter, so the year strip can show counts for every year.
  const matchingAnyYear = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (e) =>
        (!e.categories.length || e.categories.some((c) => categories.has(c))) &&
        (!partners.size || e.partners.some((p) => partners.has(p))) &&
        (!q || e.search.includes(q)),
    );
  }, [events, categories, partners, query]);

  const visible = useMemo(
    () => (year ? matchingAnyYear.filter((e) => e.year === year) : matchingAnyYear),
    [matchingAnyYear, year],
  );

  const listed = useMemo(() => (stack ? visible.filter((e) => stack.has(e.id)) : visible), [visible, stack]);

  // A filter change closes the cluster list, since its events may no longer be on the map.
  useEffect(() => setStack(null), [categories, partners, query, year]);

  const selected = selectedId == null ? null : events[selectedId];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelectedId(null);
        setStack(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const showStack = (ids) => {
    setStack(new Set(ids));
    setTab('events');
    setPanelOpen(true);
  };

  const handleQuery = (value) => {
    setQuery(value);
    if (value.trim()) setTab('events');
  };

  return (
    <>
      <MapView
        events={visible}
        selected={selected}
        onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
        onStack={showStack}
      />
      <Panel
        events={events}
        visible={visible}
        listed={listed}
        year={year}
        categories={categories}
        setCategories={setCategories}
        partners={partners}
        setPartners={setPartners}
        query={query}
        setQuery={handleQuery}
        tab={tab}
        setTab={setTab}
        open={panelOpen}
        setOpen={setPanelOpen}
        stacked={!!stack}
        clearStack={() => setStack(null)}
        selectedId={selectedId}
        onPick={setSelectedId}
        loadError={loadError}
      />
      {selected && <EventCard event={selected} onClose={() => setSelectedId(null)} />}
      <YearStrip events={matchingAnyYear} allEvents={events} year={year} setYear={setYear} />
    </>
  );
}
