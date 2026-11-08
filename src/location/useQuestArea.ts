import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import type { DbConnection } from '../module_bindings';
import type { PlayerQuestArea } from '../module_bindings/types';

export type RegionChoice = { label: string; latitude: number; longitude: number };
export type QuestAreaStatus = { kind: 'off' | 'unsupported' | 'locating' | 'scouting' } | { kind: 'ready' | 'error'; message: string };
export type QuestAreaControls = {
  status: QuestAreaStatus; enable: () => void; disable: () => void; retry: () => void;
  search: (query: string) => Promise<RegionChoice[]>;
  save: (choice: RegionChoice, radiusMeters: number) => Promise<boolean>;
  proposal: RegionChoice | null;
};

// Region discovery is exclusively user-triggered. No watches, mount requests, or travel reloads.
export function useQuestArea({ area, enabled }: { area: PlayerQuestArea | null; enabled: boolean }): QuestAreaControls {
  const { getConnection } = useSpacetimeDB();
  const connection = getConnection() as DbConnection | null;
  const [status, setStatus] = useState<QuestAreaStatus>({ kind: 'off' });
  const [proposal, setProposal] = useState<RegionChoice | null>(null);
  const revision = useRef(0);
  const busy = useRef(false);
  useEffect(() => { revision.current++; busy.current = false; setStatus({ kind: 'off' }); setProposal(null); return () => { revision.current++; }; }, [connection, enabled]);
  const enable = useCallback(() => {
    if (!enabled || busy.current) return;
    if (!navigator.geolocation) { setStatus({ kind: 'error', message: 'Geolocation is unavailable. Search for a city instead.' }); return; }
    const current = ++revision.current;
    setStatus({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(position => {
      if (revision.current !== current) return;
      setProposal({ label: 'My selected area', latitude: position.coords.latitude, longitude: position.coords.longitude });
      setStatus({ kind: 'ready', message: 'Location found. Save this region to use it for future quests.' });
    }, () => { if (revision.current === current) setStatus({ kind: 'error', message: 'Your location could not be read. Search for a city instead.' }); }, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 });
  }, [enabled]);
  const search = useCallback(async (query: string) => {
    if (!enabled || !connection || busy.current) return [];
    const current = ++revision.current;
    busy.current = true; setStatus({ kind: 'scouting' });
    try {
      const results = JSON.parse(await connection.procedures.searchAdventureRegions({ query })) as RegionChoice[];
      if (revision.current !== current) return [];
      setStatus({ kind: 'ready', message: results.length ? 'Choose a city, then save your region.' : 'No matching cities. Try a nearby city or postal code.' });
      return results;
    } catch (error) {
      if (revision.current === current) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'City search failed.' });
      return [];
    } finally { if (revision.current === current) busy.current = false; }
  }, [connection, enabled]);
  const save = useCallback(async (choice: RegionChoice, radiusMeters: number) => {
    if (!enabled || !connection || busy.current) return false;
    const current = ++revision.current;
    busy.current = true; setStatus({ kind: 'scouting' });
    try {
      const message = await connection.procedures.setAdventureRegion({ ...choice, radiusMeters });
      if (revision.current !== current) return false;
      setStatus({ kind: 'ready', message }); setProposal(null); return true;
    } catch (error) {
      if (revision.current === current) setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Region discovery failed. Existing quests are unchanged.' });
      return false;
    } finally { if (revision.current === current) busy.current = false; }
  }, [connection, enabled]);
  const disable = useCallback(() => { if (!busy.current) { revision.current++; setProposal(null); setStatus({ kind: 'off' }); } }, []);
  void area; // The authoritative saved area is rendered from the subscription, never local storage.
  return { status, enable, disable, retry: enable, search, save, proposal };
}
