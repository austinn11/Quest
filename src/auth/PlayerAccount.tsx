import { usePlayer } from '../player/PlayerProvider';
import { UsernameEditor } from './UsernameEditor';
import { ProfileAvatar } from './ProfileAvatar';
import { PlayerProgress } from '../player/PlayerProgress';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { SkillProgress } from '../player/SkillProgress';

export function PlayerAccount() {
  const { player, ready, error: profileError, retry } = usePlayer();
  const { completions, hasSnapshot } = useQuestboard();
  const earnedXp = completions.reduce((total, completion) => total + completion.xpAwarded, 0);

  if (profileError) {
    return (
      <section className="panel error" role="alert" aria-label="Adventurer profile">
        <p>Your player account could not be loaded. {profileError}</p>
        <button className="secondary" type="button" onClick={retry}>Retry</button>
      </section>
    );
  }
  if (!ready || !player) return <p role="status">Loading your private progression...</p>;

  return (
    <>
      <section className="profile-identity" aria-labelledby="account-title">
        <ProfileAvatar avatar={player.avatar} name={player.username || player.displayName} />
        <div className="profile-details">
          <h2 id="account-title" className="profile-name">{player.username || 'An adventurer awaits a name'}</h2>
          <p>Joined {new Date(Number(player.createdAt.microsSinceUnixEpoch / 1000n)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          {hasSnapshot && <p>{completions.length} {completions.length === 1 ? 'quest completed' : 'quests completed'} · {earnedXp.toLocaleString()} XP earned</p>}
        </div>
        <div className="profile-name-editor" aria-label="Your name" role="group">
          <UsernameEditor username={player.username} disabled={!ready} />
        </div>
      </section>
      <SkillProgress />
      <section className="level-section" aria-label="Adventurer progression"><PlayerProgress /></section>
      <details className="account-details">
        <summary>Account details</summary>
        <p>Account ID: <code className="account-id">{player.identity.toHexString()}</code></p>
      </details>
    </>
  );
}
