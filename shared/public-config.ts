export type PublicEnvironment = Record<string, string | undefined>;

// Shared by Vite's build check and the browser's visible setup-error screen.
export function publicConfig(env: PublicEnvironment, production: boolean) {
  const required = (key: string, fallback?: string) => {
    const value = env[key]?.trim() || (!production ? fallback : undefined);
    if (!value) throw new Error(`Set ${key} before building or starting Quest. VITE_ values are public; never use a secret here.`);
    return value;
  };
  const host = required('VITE_SPACETIMEDB_HOST', 'https://maincloud.spacetimedb.com');
  let endpoint: URL;
  try { endpoint = new URL(host); } catch { throw new Error('VITE_SPACETIMEDB_HOST must be a complete HTTP(S) or WebSocket URL.'); }
  if (!['https:', 'wss:', 'http:', 'ws:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('VITE_SPACETIMEDB_HOST must contain only the public server origin, without credentials, paths, or query parameters.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(endpoint.hostname);
  if (production && (!['https:', 'wss:'].includes(endpoint.protocol) || local)) throw new Error('Production VITE_SPACETIMEDB_HOST must use HTTPS or WSS on a deployed host.');
  const database = required('VITE_SPACETIMEDB_DB_NAME', 'quest-db');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(database)) throw new Error('VITE_SPACETIMEDB_DB_NAME must be a database name or identity, not a URL.');
  const clientId = required('VITE_SPACETIMEAUTH_CLIENT_ID');
  if (!/^client_[a-zA-Z0-9_-]+$/.test(clientId)) throw new Error('VITE_SPACETIMEAUTH_CLIENT_ID must be the public SpacetimeAuth client ID (client_…), not a Google client ID or client secret.');
  const mapStyle = env.VITE_MAP_STYLE_URL?.trim() || 'https://tiles.openfreemap.org/styles/liberty';
  let style: URL;
  try { style = new URL(mapStyle); } catch { throw new Error('VITE_MAP_STYLE_URL must be a complete map-style URL.'); }
  if (!['http:', 'https:'].includes(style.protocol) || style.username || style.password || (production && style.protocol !== 'https:')) throw new Error('Production map styles must use HTTPS without embedded credentials.');
  return { host: endpoint.origin, database, clientId, mapStyle };
}
