/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIMEDB_HOST?: string;
  readonly VITE_SPACETIMEDB_DB_NAME?: string;
  readonly VITE_SPACETIMEAUTH_CLIENT_ID?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_DEFAULT_LATITUDE?: string;
  readonly VITE_MAP_DEFAULT_LONGITUDE?: string;
}
