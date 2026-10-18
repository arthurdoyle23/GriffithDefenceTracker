import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import { CATEGORIES, FAMILIES } from './categories';
import { countBy, loadEvents } from './events';

const BASE = import.meta.env.BASE_URL;

export default function App() {
  const mapApi = useRef(null);
  const [events, setEvents] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768);

  // Filter state
  const [selectedCategories, setSelectedCategories] = useState({});
  const [selectedCountries, setSelectedCountries] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [activeYear, setActiveYear] = useState(null);
  const [showAllYears, setShowAllYears] = useState(true);

  // Events under the cluster the user clicked; the sidebar lists these instead of everything.
  const [stack, setStack] = useState(null);

  useEffect(() => {
    loadEvents()
      .then((data) => {
        setEvents(data);
        setSelectedCategories(Object.fromEntries(CATEGORIES.map((c) => [c.name, true])));
        setSelectedCountries(Object.fromEntries([...new Set(data.flatMap((e) => e.partners))].map((p) => [p, true])));
        const years = data.map((e) => e.year).filter(Boolean);
        setActiveYear(Math.min(...years));
      })
      .catch((err) => console.error('Error fetching data:', err));
  }, []);

  const categoryList = CATEGORIES.map((c) => c.name);
  const countryList = useMemo(() => [...new Set(events.flatMap((e) => e.partners))].sort(), [events]);
  const yearList = useMemo(() => [...new Set(events.map((e) => e.year).filter(Boolean))].sort((a, b) => a - b), [events]);
  const yearRange = yearList.length ? [yearList[0], yearList[yearList.length - 1]] : [0, 0];

  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter(
      (e) =>
        (!e.categories.length || e.categories.some((c) => selectedCategories[c])) &&
        (!e.partners.length || e.partners.some((p) => selectedCountries[p])) &&
        (!q || e.search.includes(q) || String(e.year).includes(q)) &&
        (showAllYears || e.year === activeYear),
    );
  }, [events, selectedCategories, selectedCountries, searchQuery, showAllYears, activeYear]);

  const listed = stack ? filteredData.filter((e) => stack.has(e.id)) : filteredData;

  // Changing a filter closes the cluster list, since its contents may no longer be on the map.
  useEffect(() => setStack(null), [selectedCategories, selectedCountries, searchQuery, showAllYears, activeYear]);

  const activeFilterCount =
    Object.values(selectedCategories).filter((v) => !v).length +
    Object.values(selectedCountries).filter((v) => !v).length +
    (searchQuery ? 1 : 0);

  const setAll = (list, setter, value) => setter(Object.fromEntries(list.map((k) => [k, value])));

  const handleYearChange = (e) => {
    setActiveYear(parseInt(e.target.value, 10));
    setShowAllYears(false);
  };

  const showStack = (ids) => {
    setStack(new Set(ids));
    setSidebarCollapsed(false);
  };

  const catCounts = countBy(events, (e) => e.categories);
  const countryCounts = countBy(events, (e) => e.partners);
  const yearCounts = countBy(events, (e) => e.year);
  const maxYearCount = Math.max(1, ...Object.values(yearCounts));

  return (
    <>
      <div className={`sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <img src={`${BASE}icons/Griffith.png`} alt="Griffith Logo" className="logo-image" />
          </div>
          <h2>Defence Diplomacy Tracker</h2>
          <div className="sidebar-actions">
            <button
              className={`action-button ${activeFilterCount > 0 ? 'has-active-filters' : ''}`}
              onClick={() => setShowFilterPopup((v) => !v)}
            >
              <span className="button-icon">🔍</span>
              Filters {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
            </button>
            <button className="action-button" onClick={() => setShowStats((v) => !v)}>
              <span className="button-icon">📊</span>
              Stats
            </button>
          </div>
        </div>

        <div className="entries-list">
          {stack ? (
            <div className="stack-header">
              <h3>{listed.length} events at this location</h3>
              <button onClick={() => setStack(null)}>Show all</button>
            </div>
          ) : (
            <h3>Events ({filteredData.length})</h3>
          )}
          {listed.length === 0 ? (
            <p>No events match your filters.</p>
          ) : (
            listed.map((e) => (
              <div key={e.id} className="entry-item" onClick={() => mapApi.current?.showEvent(e)}>
                <div className="entry-title">
                  <span className="entry-swatch" style={{ background: FAMILIES[e.family].color }} />
                  {e.categories.join(' / ') || 'Unknown Category'}
                </div>
                <div className="entry-subtitle">
                  {e.partners.join(', ') || 'Unknown'} → {e.hosts.join(', ') || 'Unknown'}
                  {e.year ? ` (${e.year})` : ''}
                </div>
                {e.text && (
                  <div className="entry-description">{e.text.length > 100 ? `${e.text.substring(0, 100)}...` : e.text}</div>
                )}
              </div>
            ))
          )}
        </div>

        {showFilterPopup && (
          <div className="filter-popup">
            <div className="filter-popup-header">
              <h3>Filter Options</h3>
              <button className="close-button" onClick={() => setShowFilterPopup(false)}>
                ×
              </button>
            </div>
            <div className="filter-popup-content">
              <input
                className="search-input"
                type="search"
                placeholder="Search events, countries or years"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="filter-group">
                <h3>
                  Diplomacy Categories
                  <div className="filter-buttons">
                    <button onClick={() => setAll(categoryList, setSelectedCategories, true)}>All</button>
                    <button onClick={() => setAll(categoryList, setSelectedCategories, false)}>None</button>
                  </div>
                </h3>
                <div className="checkbox-container">
                  {CATEGORIES.map((c) => (
                    <div key={c.name} className="checkbox-item">
                      <input
                        type="checkbox"
                        id={`category-${c.slug}`}
                        checked={selectedCategories[c.name] || false}
                        onChange={(e) => setSelectedCategories((prev) => ({ ...prev, [c.name]: e.target.checked }))}
                      />
                      <img className="checkbox-icon" src={`${BASE}icons/categories/${c.slug}.svg`} alt="" />
                      <label htmlFor={`category-${c.slug}`}>{c.name}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <h3>
                  Delivering Partners
                  <div className="filter-buttons">
                    <button onClick={() => setAll(countryList, setSelectedCountries, true)}>All</button>
                    <button onClick={() => setAll(countryList, setSelectedCountries, false)}>None</button>
                  </div>
                </h3>
                <div className="checkbox-container">
                  {countryList.map((country) => (
                    <div key={country} className="checkbox-item">
                      <input
                        type="checkbox"
                        id={`country-${country}`}
                        checked={selectedCountries[country] || false}
                        onChange={(e) => setSelectedCountries((prev) => ({ ...prev, [country]: e.target.checked }))}
                      />
                      <label htmlFor={`country-${country}`}>{country}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="filter-actions">
                <button
                  className="filter-reset-button"
                  onClick={() => {
                    setAll(categoryList, setSelectedCategories, true);
                    setAll(countryList, setSelectedCountries, true);
                    setSearchQuery('');
                    setShowFilterPopup(false);
                  }}
                >
                  Reset All Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {showStats && (
          <div className="stats-panel">
            <div className="stats-panel-header">
              <h3>Event Statistics</h3>
              <button className="close-button" onClick={() => setShowStats(false)}>
                ×
              </button>
            </div>
            <div className="stats-panel-content">
              <div className="stats-summary">
                <div className="stat-box">
                  <span className="stat-value">{events.length}</span>
                  <span className="stat-label">Total Events</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{countryList.length}</span>
                  <span className="stat-label">Partners</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{categoryList.length}</span>
                  <span className="stat-label">Categories</span>
                </div>
              </div>
              <div className="stats-chart">
                <h4>Events by Category</h4>
                <div className="chart-container category-chart">
                  {CATEGORIES.map((c) => {
                    const count = catCounts[c.name] ?? 0;
                    return (
                      <div key={c.name} className="chart-bar-item">
                        <div className="chart-bar-label">{c.name}</div>
                        <div className="chart-bar-container">
                          <div
                            className="chart-bar"
                            style={{ width: `${Math.round((count / Math.max(1, events.length)) * 100)}%` }}
                          />
                          <span className="chart-bar-value">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="stats-chart">
                <h4>Top Delivering Partners</h4>
                <div className="chart-container country-chart">
                  {Object.entries(countryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([country, count]) => (
                      <div key={country} className="chart-bar-item">
                        <div className="chart-bar-label">{country}</div>
                        <div className="chart-bar-container">
                          <div
                            className="chart-bar"
                            style={{ width: `${Math.round((count / Math.max(1, events.length)) * 100)}%` }}
                          />
                          <span className="chart-bar-value">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <div className="stats-chart">
                <h4>Events Timeline</h4>
                <div className="chart-container timeline-chart">
                  <div className="timeline-years">
                    {yearList.map((year) => (
                      <div key={year} className="timeline-year">
                        <div
                          className="timeline-bar"
                          style={{ height: `${Math.max(10, Math.min(90, (yearCounts[year] / maxYearCount) * 100))}px` }}
                          title={`${yearCounts[year]} events in ${year}`}
                        >
                          <span className="timeline-count">{yearCounts[year]}</span>
                        </div>
                        <div className="timeline-year-label">{year}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        className={`sidebar-toggle ${sidebarCollapsed ? 'toggle-expanded' : ''}`}
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {sidebarCollapsed ? '»' : '«'}
      </button>

      <MapView ref={mapApi} events={filteredData} onStack={showStack} className={sidebarCollapsed ? 'map-expanded' : ''} />

      {yearList.length > 0 && (
        <div className="sliderbar" id="sliderbar">
          <div className="sliderbar-content">
            <div className="year-display">
              Year: <span id="active-year">{showAllYears ? 'All Years' : activeYear}</span>
            </div>
            <div className="slider-container">
              <input
                id="slider"
                className="square-slider"
                type="range"
                min={yearRange[0]}
                max={yearRange[1]}
                step="1"
                value={activeYear ?? yearRange[0]}
                onChange={handleYearChange}
              />
            </div>
            <div className="reset-option">
              <input type="checkbox" id="reset-years" checked={showAllYears} onChange={() => setShowAllYears((v) => !v)} />
              <label htmlFor="reset-years">Reset</label>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
