import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import type { PlayerQuestArea } from '../module_bindings/types';
import { distanceMeters } from '../../shared/geo';
import { AREA_RELOAD_METERS, LOCAL_QUEST_VERSION, OVERPASS_URL, PLACE_SEARCH_METERS, overpassQuery, parseOverpassPlaces, type Place } from '../../shared/nearby-places';

const OVERPASS_MIRROR_URL = 'https://overpass.private.coffee/api/interpreter';

export type QuestAreaStatus =
  | { kind: 'off' }
  | { kind: 'unsupported' }
  | { kind: 'locating' }
  | { kind: 'scouting' }
  | { kind: 'ready'; message: string }
  | { kind: 'error'; message: string };

export type QuestAreaControls = {
  status: QuestAreaStatus;
  enable: () => void;
  disable: () => void;
  retry: () => void;
};

const CONSENT_KEY = 'quest-location-consent';
const CACHE_PREFIX = 'quest-places:';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 2 * 60 * 1000;
const RETRY_MOVE_METERS = 1_000;

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// Places are cached per ~1 km grid cell so revisiting an area needs no OpenStreetMap request.
async function loadPlaces(latitude: number, longitude: number, signal: AbortSignal): Promise<Place[]> {
  signal.throwIfAborted();
  const key = `${CACHE_PREFIX}${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  try {
    const cached = JSON.parse(storageGet(key) ?? 'null') as { at: number; places: Place[] } | null;
    if (cached && Date.now() - cached.at < CACHE_MAX_AGE_MS && Array.isArray(cached.places)) return cached.places;
  } catch { /* ignore a corrupt cache entry */ }
  const body = new URLSearchParams({ data: overpassQuery(latitude, longitude, PLACE_SEARCH_METERS) });
  let lastError: unknown;
  // Public Overpass servers are often busy: retry the main one once after a quick refusal, then a mirror.
  const attempts = [OVERPASS_URL, OVERPASS_URL, OVERPASS_MIRROR_URL];
  for (let index = 0; index < attempts.length; index++) {
    const url = attempts[index];
    try {
      const timeout = url === OVERPASS_URL ? 75_000 : 45_000;
      const response = await fetch(url, { method: 'POST', body, signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
      if (!response.ok) throw new Error(`OpenStreetMap returned ${response.status}`);
      const places = parseOverpassPlaces(await response.text(), latitude, longitude, PLACE_SEARCH_METERS);
      signal.throwIfAborted();
      storageSet(key, JSON.stringify({ at: Date.now(), places }));
      return places;
    } catch (error) {
      signal.throwIfAborted();
      lastError = error;
      // A timeout means the main server is overloaded: go straight to the mirror.
      if (error instanceof Error && error.name === 'TimeoutError') {
        if (attempts[index + 1] === OVERPASS_URL) index++;
      } else if (index < attempts.length - 1) await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 3_000);
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenStreetMap could not be reached');
}

const formatKm = (meters: number) => `${(meters / 1000).toFixed(meters < 100_000 ? 1 : 0)} km`;

// Watches the player's position only after they opt in. The server decides whether to reload.
export function useQuestArea({ area, enabled }: { area: PlayerQuestArea | null; enabled: boolean }): QuestAreaControls {
  const setQuestArea = useReducer(reducers.setQuestArea);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [consent, setConsent] = useState(() => storageGet(CONSENT_KEY) === 'yes');
  const [status, setStatus] = useState<QuestAreaStatus>(() => !supported ? { kind: 'unsupported' } : consent ? { kind: 'locating' } : { kind: 'off' });
  const areaRef = useRef(area);
  areaRef.current = area;
  const [attempt, setAttempt] = useState(0);
  const session = useRef<AbortController | null>(null);
  const busy = useRef<AbortSignal | null>(null);
  const lastAttempt = useRef<{ latitude: number; longitude: number; at: number } | null>(null);
  const handlePosition = useCallback(async (latitude: number, longitude: number, signal: AbortSignal) => {
    if (signal.aborted || busy.current === signal) return;
    const current = areaRef.current;
    const moved = current ? distanceMeters(current.latitude, current.longitude, latitude, longitude) : Infinity;
    if (current && moved <= AREA_RELOAD_METERS && current.generatorVersion >= LOCAL_QUEST_VERSION) {
      setStatus({ kind: 'ready', message: `Quests near you · ${current.placeCount} places within ${formatKm(PLACE_SEARCH_METERS)}` });
      return;
    }
    const last = lastAttempt.current;
    if (last && Date.now() - last.at < RETRY_AFTER_MS && distanceMeters(last.latitude, last.longitude, latitude, longitude) < RETRY_MOVE_METERS) return;
    busy.current = signal;
    lastAttempt.current = { latitude, longitude, at: Date.now() };
    setStatus({ kind: 'scouting' });
    try {
      const places = await loadPlaces(latitude, longitude, signal);
      signal.throwIfAborted();
      await setQuestArea({
        latitude, longitude,
        places: places.map(({ id, name, kind, latitude: placeLatitude, longitude: placeLongitude }) => ({ id, name, kind, latitude: placeLatitude, longitude: placeLongitude })),
      });
      if (signal.aborted) return;
      setStatus({
        kind: 'ready',
        message: !places.length ? 'No named places were found nearby, so your board keeps general quests.'
          : current ? `You traveled ${formatKm(moved)}, so your board was reloaded with quests around you.`
          : `Found ${places.length} places near you. Your board now includes local quests.`,
      });
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error && /OpenStreetMap|fetch|network|timeout|abort/i.test(`${error.name} ${error.message}`)
        ? 'Nearby places could not load right now (OpenStreetMap may be busy). Your current quests are unchanged.'
        : error instanceof Error ? error.message : 'Your quest area could not be updated.';
      setStatus({ kind: 'error', message });
    } finally {
      if (busy.current === signal) busy.current = null;
    }
  }, [setQuestArea]);

  useEffect(() => {
    if (!supported || !consent || !enabled) return;
    const controller = new AbortController();
    session.current = controller;
    lastAttempt.current = null;
    setStatus({ kind: 'locating' });
    const watch = navigator.geolocation.watchPosition(
      position => { void handlePosition(position.coords.latitude, position.coords.longitude, controller.signal); },
      error => {
        if (controller.signal.aborted) return;
        if (error.code === error.PERMISSION_DENIED) {
          controller.abort();
          storageSet(CONSENT_KEY, null);
          setConsent(false);
          setStatus({ kind: 'error', message: 'Location permission was declined. Your current quests are unchanged.' });
        } else if (busy.current !== controller.signal) setStatus({ kind: 'error', message: 'Your location could not be determined. Try again outdoors or later.' });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
    );
    return () => {
      controller.abort();
      navigator.geolocation.clearWatch(watch);
      if (session.current === controller) session.current = null;
    };
  }, [supported, consent, enabled, handlePosition, attempt]);

  const enable = useCallback(() => {
    if (!supported) return;
    storageSet(CONSENT_KEY, 'yes');
    setStatus({ kind: 'locating' });
    setConsent(true);
  }, [supported]);

  const disable = useCallback(() => {
    session.current?.abort();
    storageSet(CONSENT_KEY, null);
    setConsent(false);
    setStatus(supported ? { kind: 'off' } : { kind: 'unsupported' });
  }, [supported]);

  const retry = useCallback(() => {
    if (!supported) return;
    session.current?.abort();
    storageSet(CONSENT_KEY, 'yes');
    setConsent(true);
    setStatus({ kind: 'locating' });
    setAttempt(value => value + 1);
  }, [supported]);

  return { status, enable, disable, retry };
}
