import { useEffect } from 'react';
import { useGuild } from './GuildProvider';
import { CategoryIcon } from '../ui/icons';

const DAY_MS = 24 * 60 * 60 * 1000;
const toMs = (timestamp: { microsSinceUnixEpoch: bigint }) => Number(timestamp.microsSinceUnixEpoch / 1000n);

function timeLeft(endsAtMs: number, now: number) {
  const left = endsAtMs - now;
  if (left <= 0) return 'Ended';
  const days = Math.floor(left / DAY_MS);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left`;
  const hours = Math.max(1, Math.floor(left / (60 * 60 * 1000)));
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
}

// Shared weekly goals. Ordinary quest completions by any member count toward them.
export function GuildQuests() {
  const { guild, quests, refreshGuildQuests } = useGuild();
  const guildId = guild?.guildId;
  const now = Date.now();
  const current = [...quests].filter(quest => toMs(quest.endsAt) > now).sort((a, b) => a.title.localeCompare(b.title));
  const needsRefresh = current.length < 3;

  // Fill or rotate the board when the page opens, or when a cycle has ended.
  useEffect(() => {
    if (guildId !== undefined && needsRefresh) void refreshGuildQuests().catch(() => {});
  }, [guildId, needsRefresh, refreshGuildQuests]);

  return (
    <section className="guild-quests" aria-labelledby="guild-quests-title">
      <h2 id="guild-quests-title" className="section-title">Guild quests</h2>
      <p className="field-help">Every quest a member completes counts toward these shared goals. Finish one and everyone who helped earns its reward.</p>
      {current.length ? (
        <ul className="guild-quest-list">
          {current.map(quest => {
            const done = quest.completedAt !== undefined;
            const percent = Math.min(100, (quest.progress / Math.max(1, quest.target)) * 100);
            const xpGoal = quest.kind === 'Experience';
            return (
              <li key={quest.guildQuestId.toString()} className={`guild-quest${done ? ' is-done' : ''}`}>
                <div className="guild-quest-head">
                  {xpGoal ? <span className="guild-quest-xp" aria-hidden="true">XP</span> : <CategoryIcon category={quest.kind} className="icon-lg" />}
                  <h3>{quest.title}</h3>
                  {done ? <span className="guild-quest-stamp">Completed</span> : <span className="guild-quest-time">{timeLeft(toMs(quest.endsAt), now)}</span>}
                </div>
                <p>{quest.description}</p>
                <div className="xp-meter" role="progressbar" aria-label={`${quest.title} progress`} aria-valuemin={0} aria-valuemax={quest.target} aria-valuenow={quest.progress}>
                  <div className="xp-meter-fill" style={{ width: `${percent}%` }} />
                </div>
                <p className="guild-quest-facts">
                  <span>{quest.progress.toLocaleString()} / {quest.target.toLocaleString()}{xpGoal ? ' XP' : ''}</span>
                  <span>Your share: {quest.yourContribution.toLocaleString()}{xpGoal ? ' XP' : ''}</span>
                  <span>{done ? `+${quest.rewardXp} XP paid to ${quest.contributors} ${quest.contributors === 1 ? 'member' : 'members'}` : `Reward: +${quest.rewardXp} XP each`}</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : <p role="status">Posting this week's guild quests...</p>}
    </section>
  );
}
