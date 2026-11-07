import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings';
import { UsernameEditor } from './UsernameEditor';

export function PlayerAccount() {
  const auth = useAuth();
  const { isActive } = useSpacetimeDB();
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
        <h2 id="account-title">Adventurer profile</h2>
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
          <h3 className="profile-name">{player.username || 'An adventurer awaits a name'}</h3>
          <dl className="profile-stats">
            <div><dt>Level</dt><dd>{player.level}</dd></div>
            <div><dt>Total XP</dt><dd>{player.xp.toLocaleString()}</dd></div>
            <div><dt>Adventurer since</dt><dd className="profile-date">{new Date(Number(player.createdAt.microsSinceUnixEpoch / 1000n)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</dd></div>
          </dl>
          <UsernameEditor username={player.username} disabled={!isActive || !profileReady || signingOut} />
          <details>
            <summary>Account details</summary>
            <p>Account ID: <code className="account-id">{player.identity.toHexString()}</code></p>
          </details>
        </>
      )}
    </section>
  );
}
