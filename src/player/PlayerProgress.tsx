import { progressionForXp } from '../../shared/progression';
import { usePlayer } from './PlayerProvider';

export function PlayerProgress() {
  const { player, ready, error } = usePlayer();
  if (error) return <p className="field-help">Progression is unavailable until your player profile loads.</p>;
  if (!ready || !player) return <p role="status">Loading your progression...</p>;
  const progress = progressionForXp(player.xp);
  return (
    <div className="player-progression" aria-label="Player progression">
      <dl className="progression-stats">
        <div><dt>Level</dt><dd>{progress.level}</dd></div>
        <div><dt>Total XP</dt><dd>{progress.totalXp.toLocaleString()}</dd></div>
        <div><dt>XP to level {progress.nextLevel}</dt><dd>{progress.xpRemaining.toLocaleString()}</dd></div>
      </dl>
      <div className="xp-meter" role="progressbar" aria-label={`XP progress toward level ${progress.nextLevel}`} aria-valuemin={0} aria-valuemax={progress.xpRequired} aria-valuenow={progress.xpIntoLevel} aria-valuetext={`${progress.xpIntoLevel.toLocaleString()} of ${progress.xpRequired.toLocaleString()} XP; ${progress.xpRemaining.toLocaleString()} XP remaining`}>
        <div className="xp-meter-fill" style={{ width: `${progress.progressPercent}%` }} />
      </div>
      <div className="xp-labels"><span>Level {progress.level}</span><span>{progress.xpIntoLevel.toLocaleString()} / {progress.xpRequired.toLocaleString()} XP</span><span>Level {progress.nextLevel}</span></div>
    </div>
  );
}
