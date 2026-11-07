import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings';

export function PlayerAccount() {
  const auth = useAuth();
  const { isActive, identity } = useSpacetimeDB();
  const [players, profileReady] = useTable(tables.myPlayer);
  const ensurePlayer = useReducer(reducers.ensurePlayer);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const player = players[0];

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setProfileError(null);
    // Safe on every connection: the reducer creates only a missing profile and never resets XP.
    void ensurePlayer().catch(error => {
      if (!cancelled) setProfileError(error instanceof Error ? error.message : 'Unable to load your player account.');
    });
    return () => { cancelled = true; };
  }, [isActive, ensurePlayer]);

  const signOut = async () => {
    setSigningOut(true);
    setLogoutError(null);
    const idToken = auth.user?.id_token;
    try {
      auth.stopSilentRenew();
      // Remove the local session first. The auth gate unmounts private data and closes the socket.
      await auth.removeUser();
      await auth.signoutRedirect({ id_token_hint: idToken });
    } catch {
      setLogoutError('Sign-out could not be completed. Please try again.');
      setSigningOut(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="account-title">
      <div className="panel-heading">
        <h2 id="account-title">Your adventurer account</h2>
        <button className="secondary" type="button" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
      <p>Signed in as <strong>{auth.user?.profile.name ?? auth.user?.profile.email ?? 'Adventurer'}</strong>.</p>
      {logoutError && <p className="error" role="alert">{logoutError}</p>}
      {profileError ? (
        <div className="error" role="alert">
          <p>Your player account could not be loaded. {profileError}</p>
          <button className="secondary" type="button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : !isActive || !profileReady || !player ? (
        <p role="status">Loading your private progression...</p>
      ) : (
        <>
          <p><strong>{player.displayName}</strong> · {player.xp} XP</p>
          <p>Your progression is saved to your account.</p>
          <details>
            <summary>Account details</summary>
            <p>Account ID: <code className="account-id">{identity?.toHexString()}</code></p>
          </details>
        </>
      )}
    </section>
  );
}
