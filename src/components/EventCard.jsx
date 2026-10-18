import { CATEGORY_BY_NAME } from '../categories';
import { partnerInfo } from '../partners';

const BASE = import.meta.env.BASE_URL;

export default function EventCard({ event, onClose }) {
  const sourceHost = event.source ? event.source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;

  return (
    <article className="card" aria-live="polite">
      <button className="card__close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="card__tags">
        {event.categories.map((name) => {
          const cat = CATEGORY_BY_NAME[name];
          return (
            <span key={name} className="tag" style={{ '--c': `var(--f-${cat.family})` }}>
              <img src={`${BASE}icons/categories/${cat.slug}.svg`} alt="" />
              {name}
            </span>
          );
        })}
      </div>
      <h3>
        {event.partners.map((p) => partnerInfo(p).short).join(', ')} in {event.hosts.join(', ')}
      </h3>
      <p>{event.text || 'No description recorded.'}</p>
      <dl className="facts">
        <dt>Year</dt>
        <dd>{event.year ?? 'Unknown'}</dd>
        <dt>Partner</dt>
        <dd className="flags">
          {event.partners.map((p) => {
            const info = partnerInfo(p);
            return (
              <span key={p}>
                {info.flag && <img src={info.flag} alt="" />}
                {info.short}
              </span>
            );
          })}
        </dd>
        <dt>Host</dt>
        <dd>{event.hosts.join(', ')}</dd>
        {sourceHost && (
          <>
            <dt>Source</dt>
            <dd>
              <a href={event.source} target="_blank" rel="noopener noreferrer">
                {sourceHost} ↗
              </a>
            </dd>
          </>
        )}
      </dl>
    </article>
  );
}
