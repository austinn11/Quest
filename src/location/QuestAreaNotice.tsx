import { useState } from 'react';
import { useQuestboard } from '../questboard/QuestboardProvider';
import type { RegionChoice } from './useQuestArea';

export function QuestAreaNotice() {
  const { location, area, slots, ready, startAnywhere } = useQuestboard();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegionChoice[]>([]);
  const [choice, setChoice] = useState<RegionChoice | null>(null);
  const [radius, setRadius] = useState(8000);
  const [editing, setEditing] = useState(false);
  const busy = location.status.kind === 'locating' || location.status.kind === 'scouting';
  const selected = choice ?? location.proposal;
  const open = editing || !area;
  return (
    <section className="panel adventure-region" aria-label="Adventure region">
      <div className="region-heading"><strong>Adventure region{area ? `: ${area.label}` : ''}</strong>
        {area && !open && <button type="button" className="link-button" onClick={() => setEditing(true)}>Change region</button>}
      </div>
      {open && <>
        <p className="field-help">Choose where future quests are discovered. Existing quests, cooldowns, and rerolls stay unchanged. Traveling never changes your board.</p>
        <form className="region-search" onSubmit={event => { event.preventDefault(); setChoice(null); location.disable(); void location.search(query).then(setResults); }}>
          <label>City or region<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Dallas, Texas" minLength={2} maxLength={100} required disabled={busy || !ready} /></label>
          <button type="submit" className="secondary" disabled={busy || !ready || query.trim().length < 2}>Search</button>
          <button type="button" className="secondary" disabled={busy || !ready} onClick={() => { setChoice(null); setResults([]); location.enable(); }}>Use my location</button>
        </form>
        {results.length > 0 && <ul className="region-results" aria-label="Matching cities">{results.map((result, index) => <li key={index}><button type="button" className="link-button" disabled={busy} aria-pressed={choice === result} onClick={() => setChoice(result)}>{result.label}</button></li>)}</ul>}
        {selected && <div className="region-search">
          <p>{selected.label}</p>
          <label>Search radius<select value={radius} disabled={busy} onChange={event => setRadius(Number(event.target.value))}><option value={3000}>3 km</option><option value={8000}>8 km</option><option value={15000}>15 km</option></select></label>
          <button type="button" disabled={busy || !ready} onClick={() => { void location.save(selected, radius).then(saved => { if (saved) { setEditing(false); setChoice(null); setResults([]); } }); }}>Save adventure region</button>
        </div>}
        {slots.length === 0 && <button type="button" className="secondary" disabled={busy || !ready} onClick={startAnywhere}>Start with Anywhere quests</button>}
        {area && <button type="button" className="link-button" disabled={busy} onClick={() => { setEditing(false); setChoice(null); setResults([]); location.disable(); }}>Cancel</button>}
      </>}
      <div role={location.status.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
        {busy ? <p>{location.status.kind === 'locating' ? 'Finding your location…' : 'Discovering places…'}</p> : 'message' in location.status && <p>{location.status.message}</p>}
      </div>
      {open && <small>Approximate region coordinates are sent to the place provider. Check public access and opening hours. Data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noreferrer">Open-Meteo / GeoNames</a>.</small>}
    </section>
  );
}
