import { distanceMeters, validLatitudeLongitude } from './geo';

// Shared by the browser (which loads places) and the database module (which validates them).
// Named outdoor and landmark places come from OpenStreetMap (Overpass API, no key required).
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// A board reloads when the player moves farther than this from its area centre.
export const AREA_RELOAD_METERS = 10_000;
// Places are searched within this radius; each difficulty uses a distance band inside it.
export const PLACE_SEARCH_METERS = 8_000;

export const PLACE_KINDS = [
  'park', 'nature reserve', 'garden', 'lake or pond', 'woods', 'beach', 'picnic area',
  'viewpoint', 'peak', 'monument', 'memorial', 'historic site', 'artwork', 'attraction',
  'museum', 'fountain', 'library',
] as const;
export type PlaceKind = typeof PLACE_KINDS[number];

export type Place = { id: string; name: string; kind: PlaceKind; latitude: number; longitude: number; distance: number };

const NATURE_KINDS: ReadonlySet<PlaceKind> = new Set(['park', 'nature reserve', 'garden', 'lake or pond', 'woods', 'beach', 'picnic area']);
export const isNaturePlace = (place: Place) => NATURE_KINDS.has(place.kind);

const MAX_PLACES = 80;
// Places where sending strangers on a quest would be inappropriate.
const EXCLUDED_NAMES = /\b(school|elementary|preschool|daycare|kindergarten|playground|private|cemetery|grave|church)\b/i;

export function overpassQuery(latitude: number, longitude: number, radiusMeters: number): string {
  // A bounding box uses Overpass's spatial index; exact distances are checked in sanitizePlaces.
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(0.01, Math.cos(latitude * Math.PI / 180)));
  const bbox = [latitude - latitudeDelta, longitude - longitudeDelta, latitude + latitudeDelta, longitude + longitudeDelta].map(value => value.toFixed(4)).join(',');
  return `[out:json][timeout:60][bbox:${bbox}];(` +
    'nwr["leisure"~"^(park|nature_reserve|garden|picnic_site)$"]["name"];' +
    'nwr["natural"~"^(water|peak|wood|beach)$"]["name"];' +
    'nwr["tourism"~"^(viewpoint|museum|artwork|attraction|picnic_site)$"]["name"];' +
    'nwr["historic"~"^(monument|memorial|ruins|castle|landmark|building|archaeological_site)$"]["name"];' +
    'nwr["amenity"~"^(fountain|library)$"]["name"];' +
    `);out center ${MAX_PLACES * 3};`;
}

function kindFor(tags: Record<string, unknown>): PlaceKind | null {
  const tag = (key: string) => typeof tags[key] === 'string' ? tags[key] as string : undefined;
  switch (tag('leisure')) {
    case 'park': return 'park';
    case 'nature_reserve': return 'nature reserve';
    case 'garden': return 'garden';
    case 'picnic_site': return 'picnic area';
  }
  switch (tag('natural')) {
    case 'water': return 'lake or pond';
    case 'peak': return 'peak';
    case 'wood': return 'woods';
    case 'beach': return 'beach';
  }
  switch (tag('tourism')) {
    case 'viewpoint': return 'viewpoint';
    case 'museum': return 'museum';
    case 'artwork': return 'artwork';
    case 'attraction': return 'attraction';
    case 'picnic_site': return 'picnic area';
  }
  const historic = tag('historic');
  if (historic === 'monument') return 'monument';
  if (historic === 'memorial') return 'memorial';
  if (historic) return 'historic site';
  switch (tag('amenity')) {
    case 'fountain': return 'fountain';
    case 'library': return 'library';
  }
  return null;
}

export type PlaceInput = { id: string; name: string; kind: string; latitude: number; longitude: number };

// Untrusted input (third-party JSON or a client): keep well-formed named places, nearest first,
// one per name. Distances are always recomputed here, never taken from the input.
export function sanitizePlaces(input: readonly PlaceInput[], latitude: number, longitude: number, radiusMeters: number): Place[] {
  const byName = new Map<string, Place>();
  for (const place of input.slice(0, MAX_PLACES * 4)) {
    if (!place || typeof place.name !== 'string' || typeof place.id !== 'string' || !(PLACE_KINDS as readonly string[]).includes(place.kind)) continue;
    const name = place.name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 90 || EXCLUDED_NAMES.test(name)) continue;
    if (!/^[a-z]+\/\d{1,20}$/.test(place.id)) continue;
    if (!validLatitudeLongitude(place.latitude, place.longitude)) continue;
    const distance = distanceMeters(latitude, longitude, place.latitude, place.longitude);
    if (distance > radiusMeters) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing && existing.distance <= distance) continue;
    byName.set(key, { id: place.id, name, kind: place.kind as PlaceKind, latitude: place.latitude, longitude: place.longitude, distance });
  }
  return [...byName.values()].sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1)).slice(0, MAX_PLACES);
}

export function parseOverpassPlaces(body: string, latitude: number, longitude: number, radiusMeters: number): Place[] {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return []; }
  const elements = (data as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const candidates: PlaceInput[] = [];
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    const { type, id, lat, lon, center, tags } = element as Record<string, unknown>;
    if (typeof type !== 'string' || typeof id !== 'number' || !tags || typeof tags !== 'object') continue;
    const name = (tags as Record<string, unknown>).name;
    const point = typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : center as { lat?: unknown; lon?: unknown } | undefined;
    const kind = kindFor(tags as Record<string, unknown>);
    if (typeof name !== 'string' || !kind || !point || typeof point.lat !== 'number' || typeof point.lon !== 'number') continue;
    candidates.push({ id: `${type}/${id}`, name, kind, latitude: point.lat, longitude: point.lon });
  }
  return sanitizePlaces(candidates, latitude, longitude, radiusMeters);
}
