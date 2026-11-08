import { useEffect, useRef, useState } from 'react';
import { progressionUpdateBetween, type SkillXp } from '../../shared/progression';
import { usePlayer } from './PlayerProvider';

export function LevelUpNotice() {
  const { player, ready } = usePlayer();
  const identity = player?.identity.toHexString();
  const explorationXp = player?.explorationXp;
  const bestiaryXp = player?.bestiaryXp;
  const craftingXp = player?.craftingXp;
  const previous = useRef<{ identity: string; skills: SkillXp } | null>(null);
  const [notice, setNotice] = useState<NonNullable<ReturnType<typeof progressionUpdateBetween>> | null>(null);

  useEffect(() => {
    if (!ready || !identity || explorationXp === undefined || bestiaryXp === undefined || craftingXp === undefined) return;
    const skills = { explorationXp, bestiaryXp, craftingXp };
    const last = previous.current;
    previous.current = { identity, skills };
    if (!last || last.identity !== identity) { setNotice(null); return; }
    setNotice(progressionUpdateBetween(last.skills, skills));
  }, [ready, identity, explorationXp, bestiaryXp, craftingXp]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice || !ready || !identity || previous.current?.identity !== identity) return null;
  return (
    <section key={notice.totalXp} className="level-up-notice" role="status" aria-live="polite" aria-atomic="true">
      <div>
        <h2>{notice.adventurer ? `Adventurer level ${notice.adventurer.toLevel} reached` : 'Adventure complete'}</h2>
        <p>+{notice.xpGained.toLocaleString()} total XP</p>
        {notice.adventurer && <p>Adventurer level {notice.adventurer.fromLevel} → {notice.adventurer.toLevel}</p>}
        {notice.skills.map(skill => (
          <div key={skill.category} className="skill-gain">
            <p>+{skill.xpGained.toLocaleString()} {skill.category} XP</p>
            {skill.toLevel > skill.fromLevel && <p>{skill.category} level up: {skill.fromLevel} → {skill.toLevel}</p>}
            {skill.newTitle && <p>New {skill.category} title unlocked: {skill.newTitle}</p>}
          </div>
        ))}
      </div>
      <button type="button" className="secondary" aria-label="Dismiss level-up notification" onClick={() => setNotice(null)}>Dismiss</button>
    </section>
  );
}
