import { validCoordinates } from './quest-locations';

export function defaultMapCenter(latitude?: string, longitude?: string): [number, number] {
  const lat = latitude?.trim() ? Number(latitude) : NaN;
  const lng = longitude?.trim() ? Number(longitude) : NaN;
  return validCoordinates(lat, lng) ? [lng, lat] : [-96.7501, 32.9858];
}

export const MAP_CENTER = defaultMapCenter(import.meta.env?.VITE_MAP_DEFAULT_LATITUDE, import.meta.env?.VITE_MAP_DEFAULT_LONGITUDE);
export const MAP_STYLE_URL = import.meta.env?.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
