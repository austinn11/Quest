import { useEffect, useRef, useState } from 'react';
import type { Map as LibreMap, Marker, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { LocatedQuest } from './quest-locations';
import { MAP_CENTER, MAP_STYLE_URL } from './map-settings';
import { parchmentStyle } from './parchment-style';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

export type PlayerLocation = { latitude: number; longitude: number; accuracy: number };
export type MapViewRequest = { sequence: number; target: 'default' | 'quests' | 'player' | 'quest'; questKey?: string };
type Pin = { marker: Marker; element: HTMLButtonElement };

export function QuestMap({ quests, selectedKey, onSelect, view, playerLocation }: {
  quests: readonly LocatedQuest[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  view: MapViewRequest;
  playerLocation: PlayerLocation | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pins = useRef(new Map<string, Pin>());
  const [map, setMap] = useState<LibreMap | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const [library, setLibrary] = useState<typeof import('maplibre-gl') | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let instance: LibreMap | undefined;
    let observer: ResizeObserver | undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError(null);
    setTileError(false);
    void Promise.all([
      import('maplibre-gl'),
      fetch(MAP_STYLE_URL, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('Map style unavailable');
        return await response.json() as StyleSpecification;
      }),
    ]).then(([libre, style]) => {
      window.clearTimeout(timeout);
      if (disposed || !container.current) return;
      libre.setWorkerUrl(workerUrl);
      instance = new libre.Map({
        container: container.current, style: parchmentStyle(style), center: MAP_CENTER, zoom: 13,
        minZoom: 2, maxZoom: 19, pitchWithRotate: false, dragRotate: false,
        attributionControl: { compact: false },
      });
      instance.touchZoomRotate.disableRotation();
      instance.addControl(new libre.NavigationControl({ showCompass: true }), 'top-right');
      instance.addControl(new libre.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
      instance.getCanvas().setAttribute('aria-label', 'Quest world map. Use arrow keys to pan and plus or minus to zoom.');
      instance.on('load', () => { if (!disposed) setLoading(false); });
      instance.on('error', () => { if (!disposed) { setLoading(false); setTileError(true); } });
      instance.on('webglcontextlost', () => { if (!disposed) setError('The map graphics session was interrupted. Reload the map to continue.'); });
      observer = new ResizeObserver(() => instance?.resize());
      observer.observe(container.current);
      setLibrary(libre);
      setMap(instance);
    }).catch(() => {
      if (!disposed) { setLoading(false); setError('The map could not start. Check your connection and browser WebGL support. Your quest list is still available.'); }
    });
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
      observer?.disconnect();
      for (const pin of pins.current.values()) pin.marker.remove();
      pins.current.clear();
      instance?.remove();
      setMap(null);
    };
  }, [attempt]);

  useEffect(() => {
    if (!map || !library) return;
    const keys = new Set(quests.map(quest => quest.key));
    for (const [key, pin] of pins.current) {
      if (!keys.has(key)) { pin.marker.remove(); pins.current.delete(key); }
    }
    for (const quest of quests) {
      let pin = pins.current.get(quest.key);
      if (!pin) {
        const element = document.createElement('button');
        element.type = 'button';
        const symbol = document.createElement('span');
        symbol.setAttribute('aria-hidden', 'true');
        element.append(symbol);
        element.addEventListener('click', () => onSelect(quest.key));
        pin = { element, marker: new library.Marker({ element, anchor: 'bottom' }).setLngLat(quest.coordinates).addTo(map) };
        pins.current.set(quest.key, pin);
      }
      const cooldown = quest.slot.status.tag === 'Cooldown';
      pin.element.className = `quest-map-pin pin-${quest.slot.difficulty.tag.toLowerCase()}${cooldown ? ' pin-cooldown' : ''}${selectedKey === quest.key ? ' pin-selected' : ''}`;
      pin.element.setAttribute('aria-label', `${quest.template.title}, ${quest.slot.difficulty.tag}, ${quest.slot.status.tag}`);
      pin.element.setAttribute('aria-pressed', String(selectedKey === quest.key));
      pin.element.title = `${quest.template.title} / ${quest.slot.status.tag}`;
      pin.element.firstElementChild!.textContent = cooldown ? '✓' : { Exploration: '✦', Bestiary: '♞', Crafting: '⚒' }[quest.template.category.tag];
      pin.marker.setLngLat(quest.coordinates);
    }
  }, [map, library, quests, selectedKey, onSelect]);

  useEffect(() => {
    if (!map || !library || !playerLocation) return;
    const element = document.createElement('div');
    element.className = 'player-map-pin';
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', `Your approximate position, accuracy ${Math.round(playerLocation.accuracy)} metres`);
    const marker = new library.Marker({ element }).setLngLat([playerLocation.longitude, playerLocation.latitude]).addTo(map);
    return () => { marker.remove(); };
  }, [map, library, playerLocation]);

  useEffect(() => {
    if (!map) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;
    if (view.target === 'default') map.easeTo({ center: MAP_CENTER, zoom: 13, duration });
    if (view.target === 'player' && playerLocation) map.easeTo({ center: [playerLocation.longitude, playerLocation.latitude], zoom: 15, duration });
    if (view.target === 'quest') {
      const quest = quests.find(item => item.key === view.questKey);
      if (quest) map.easeTo({ center: quest.coordinates, zoom: Math.max(map.getZoom(), 15), duration });
    }
    if (view.target === 'quests' && quests.length) {
      const longitudes = quests.map(quest => quest.coordinates[0]);
      const latitudes = quests.map(quest => quest.coordinates[1]);
      map.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 55, maxZoom: 15, duration });
    }
    // Data changes update pins without pulling the camera away from the player's chosen view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, view]);

  return (
    <div className="fantasy-map-frame">
      <div ref={container} className="fantasy-map" role="region" aria-label="Interactive world map" />
      <span className="map-north" aria-hidden="true">N<br />✦</span>
      {loading && <p className="map-message" role="status">Unfurling the world map...</p>}
      {(error || tileError) && <div className="map-message map-error" role="alert"><p>{error ?? 'Some map tiles could not load. Quest locations are still listed beside the map.'}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Reload map</button></div>}
    </div>
  );
}
