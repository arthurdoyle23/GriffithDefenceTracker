import { useEffect, useMemo, useState } from 'react';
import { countBy } from '../events';

const STEP_MS = 1400;

export default function YearStrip({ events, allEvents, year, setYear }) {
  const [playing, setPlaying] = useState(false);
  const years = useMemo(
    () => [...new Set(allEvents.map((e) => e.year).filter(Boolean))].sort((a, b) => a - b),
    [allEvents],
  );
  const counts = countBy(events, (e) => e.year);
  const max = Math.max(1, ...Object.values(counts));

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(
      () => {
        const i = year ? years.indexOf(year) + 1 : 0;
        if (i >= years.length) {
          setPlaying(false);
          setYear(null);
        } else {
          setYear(years[i]);
        }
      },
      year ? STEP_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [playing, year, years, setYear]);

  if (!years.length) return null;

  return (
    <div className="years">
      <button
        className="years__play"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'Pause' : 'Play through the years'}
      >
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
          <path d={playing ? 'M1 1h3.5v12H1zM7.5 1H11v12H7.5z' : 'M1 1l10 6-10 6z'} fill="currentColor" />
        </svg>
      </button>
      <button
        className="years__all"
        aria-pressed={!year}
        onClick={() => {
          setPlaying(false);
          setYear(null);
        }}
      >
        All years
      </button>
      <div className="years__bars">
        {years.map((y) => (
          <button
            key={y}
            className="year"
            aria-pressed={year === y}
            aria-label={`${y}: ${counts[y] ?? 0} events`}
            title={`${y}: ${counts[y] ?? 0} events`}
            onClick={() => {
              setPlaying(false);
              setYear(year === y ? null : y);
            }}
          >
            <span className="year__count">{counts[y] ?? 0}</span>
            <span className="year__track">
              <span className="year__fill" style={{ height: `${Math.max(6, ((counts[y] ?? 0) / max) * 100)}%` }} />
            </span>
            <span className="year__label">{y}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
