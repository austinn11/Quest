import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

export const SPACETIMEDB_HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'https://maincloud.spacetimedb.com';
export const SPACETIMEDB_DATABASE = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'quest-db';

export function createUserManager(): UserManager {
  const clientId = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error('SpacetimeAuth setup is incomplete. Set VITE_SPACETIMEAUTH_CLIENT_ID in .env.local and restart Vite.');

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
