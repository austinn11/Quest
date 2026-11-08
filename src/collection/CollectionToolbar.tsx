import type { ReactNode } from 'react';

type Option = { value: string; label: string };

// Search, filters, sort and a favorites switch shared by the Bestiary and Quest Journal.
export function CollectionToolbar({ label, search, onSearch, placeholder, selects, favoritesOnly, onFavoritesOnly, shown, total, onClear, active }: {
  label: string;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  selects: { id: string; label: string; value: string; options: Option[]; onChange: (value: string) => void }[];
  favoritesOnly: boolean;
  onFavoritesOnly: (value: boolean) => void;
  shown: number;
  total: number;
  onClear: () => void;
  active: boolean;
}) {
  return (
    <div className="collection-toolbar" role="search" aria-label={label}>
      <input type="search" className="collection-search" value={search} onChange={event => onSearch(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {selects.map(select => (
        <label key={select.id} className="collection-select">
          <span className="visually-hidden">{select.label}</span>
          <select value={select.value} onChange={event => select.onChange(event.target.value)} aria-label={select.label}>
            {select.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ))}
      <button type="button" className={`collection-favorites${favoritesOnly ? ' is-on' : ''}`} aria-pressed={favoritesOnly} onClick={() => onFavoritesOnly(!favoritesOnly)}>
        {favoritesOnly ? '★' : '☆'} Favorites
      </button>
      <p className="collection-count" aria-live="polite">
        {active ? `${shown} of ${total} shown` : `${total} total`}
        {active && <> · <button type="button" className="link-button" onClick={onClear}>Clear filters</button></>}
      </p>
    </div>
  );
}

export function NoMatches({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return <section className="empty-state"><p>{children}</p><button type="button" className="secondary" onClick={onClear}>Clear filters</button></section>;
}
