import { usePlayer } from '../player/PlayerProvider';
import { UsernameEditor } from './UsernameEditor';

export function PlayerAccount() {
  const { player, ready, error: profileError, retry } = usePlayer();

  return (
    <section className="panel" aria-labelledby="account-title">
      <div className="panel-heading">
        <h2 id="account-title">Adventurer profile</h2>
      </div>
      {profileError ? (
        <div className="error" role="alert">
          <p>Your player account could not be loaded. {profileError}</p>
          <button className="secondary" type="button" onClick={retry}>Retry</button>
        </div>
      ) : !ready || !player ? (
        <p role="status">Loading your private progression...</p>
      ) : (
        <>
          <h3 className="profile-name">{player.username || 'An adventurer awaits a name'}</h3>
          <dl className="profile-stats">
            <div><dt>Level</dt><dd>{player.level}</dd></div>
            <div><dt>Total XP</dt><dd>{player.xp.toLocaleString()}</dd></div>
            <div><dt>Adventurer since</dt><dd className="profile-date">{new Date(Number(player.createdAt.microsSinceUnixEpoch / 1000n)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</dd></div>
          </dl>
          <UsernameEditor username={player.username} disabled={!ready} />
          <details>
            <summary>Account details</summary>
            <p>Account ID: <code className="account-id">{player.identity.toHexString()}</code></p>
          </details>
        </>
      )}
    </section>
  );
}
