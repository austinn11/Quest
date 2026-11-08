import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { publicConfig } from '../../shared/public-config';

export const SPACETIMEDB_HOST = import.meta.env.VITE_SPACETIMEDB_HOST?.trim() || 'https://maincloud.spacetimedb.com';
export const SPACETIMEDB_DATABASE = import.meta.env.VITE_SPACETIMEDB_DB_NAME?.trim() || 'quest-db';

export function createUserManager(): UserManager {
  const { clientId } = publicConfig(import.meta.env, import.meta.env.PROD);
  if (import.meta.env.PROD && window.location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    throw new Error('Open Quest over HTTPS to sign in securely and use geolocation.');
  }

  // Fail visibly when storage is disabled: a redirect cannot securely resume without OIDC state.
  const storage = window.localStorage;
  const storageCheck = 'quest:auth-storage-check';
  storage.setItem(storageCheck, '1');
  storage.removeItem(storageCheck);

  return new UserManager({
    authority: 'https://auth.spacetimedb.com/oidc',
    client_id: clientId,
    redirect_uri: `${window.location.origin}/callback`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    automaticSilentRenew: true,
    // Keep the ID token available after renewal; SpacetimeDB authenticates with it.
    includeIdTokenInSilentRenew: true,
    userStore: new WebStorageStateStore({ store: storage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
}
