import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserManager } from 'oidc-client-ts';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '../module_bindings';
import App from '../App';
import { SPACETIMEDB_DATABASE, SPACETIMEDB_HOST } from './settings';

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="foundation">
      <header>
        <p className="eyebrow">Your next adventure awaits</p>
        <h1>Quest</h1>
        <p className="intro">Sign in to keep your adventures and progression with you.</p>
      </header>
      <section className="panel" aria-labelledby="auth-title">{children}</section>
    </main>
  );
}

function DatabaseSession({ manager, idToken, subject }: { manager: UserManager; idToken: string; subject: string }) {
  const [canConnect, setCanConnect] = useState(false);
  // The SDK pools by endpoint. Let the previous account's provider release its cache first.
  useEffect(() => {
    const timer = window.setTimeout(() => setCanConnect(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Token renewal keeps the same account and connection; reconnects request a fresh ID token.
  const connectionBuilder = useMemo(() => DbConnection.builder()
    .withUri(SPACETIMEDB_HOST)
    .withDatabaseName(SPACETIMEDB_DATABASE)
    .withToken(idToken)
    .withAutomaticReconnect()
    .withTokenProvider(async () => {
      const user = await manager.signinSilent();
      if (!user?.id_token || user.profile.sub !== subject) {
        throw new Error('Your session has ended. Sign in again.');
      }
      return user.id_token;
    }), [manager, subject]); // idToken is the initial credential for this account.

  if (!canConnect) return <AuthScreen><h2 id="auth-title">Opening your account</h2><p role="status">Connecting securely...</p></AuthScreen>;
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><App /></SpacetimeDBProvider>;
}

function AuthenticationGate({ manager }: { manager: UserManager }) {
  const auth = useAuth();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const removeExpired = auth.events.addAccessTokenExpired(() => setExpired(true));
    const removeLoaded = auth.events.addUserLoaded(() => setExpired(false));
    // Logout in another tab must also remove this tab's private data and socket.
    const onStorage = (event: StorageEvent) => {
      const userKey = `oidc.user:${manager.settings.authority}:${manager.settings.client_id}`;
      if (event.key === null || event.key === userKey) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      removeExpired();
      removeLoaded();
      window.removeEventListener('storage', onStorage);
    };
  }, [auth.events, manager]);

  if (auth.isLoading || auth.activeNavigator) {
    return <AuthScreen><h2 id="auth-title">{auth.activeNavigator === 'signoutRedirect' ? 'Signing out' : 'Checking your session'}</h2><p role="status">Please wait...</p></AuthScreen>;
  }

  const error = auth.error?.message ?? (expired ? 'Your session expired. Sign in again to continue.' : null);
  if (error || !auth.isAuthenticated || !auth.user?.id_token) {
    return (
      <AuthScreen>
        <h2 id="auth-title">Welcome, adventurer</h2>
        <p>Continue through SpacetimeAuth using your Google account.</p>
        {error && <p className="error" role="alert">Sign-in could not be completed. {error}</p>}
        <button type="button" onClick={() => {
          window.history.replaceState({}, document.title, '/');
          void auth.signinRedirect();
        }}>Continue with Google</button>
      </AuthScreen>
    );
  }

  return <DatabaseSession key={`${auth.user.profile.iss}/${auth.user.profile.sub}`} manager={manager} idToken={auth.user.id_token} subject={auth.user.profile.sub} />;
}

export function Authentication({ manager }: { manager: UserManager }) {
  return (
    <AuthProvider
      userManager={manager}
      onSigninCallback={() => window.history.replaceState({}, document.title, '/')}
    >
      <AuthenticationGate manager={manager} />
    </AuthProvider>
  );
}
