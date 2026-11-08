import { useEffect, useRef, useState } from 'react';
import { levelUpBetween } from '../../shared/progression';
import { usePlayer } from './PlayerProvider';

export function LevelUpNotice() {
  const { player, ready } = usePlayer();
  const identity = player?.identity.toHexString();
  const xp = player?.xp;
  const previous = useRef<{ identity: string; xp: number } | null>(null);
  const [notice, setNotice] = useState<NonNullable<ReturnType<typeof levelUpBetween>> & { totalXp: number } | null>(null);

  useEffect(() => {
    if (!ready || !identity || xp === undefined) return;
    const last = previous.current;
    previous.current = { identity, xp };
    if (!last || last.identity !== identity) { setNotice(null); return; }
    const gain = levelUpBetween(last.xp, xp);
    if (gain) setNotice({ ...gain, totalXp: xp });
    else if (xp < last.xp) setNotice(null);
  }, [ready, identity, xp]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice || !ready || !identity || previous.current?.identity !== identity) return null;
  return (
    <section key={notice.totalXp} className="level-up-notice" role="status" aria-live="polite" aria-atomic="true">
      <div><p className="eyebrow">Level up!</p><h2>Level {notice.toLevel} reached</h2><p>{notice.levelsGained > 1 ? `${notice.levelsGained} levels gained on your journey.` : 'Your adventures have earned you a new level.'}</p></div>
      <button type="button" className="secondary" aria-label="Dismiss level-up notification" onClick={() => setNotice(null)}>Dismiss</button>
    </section>
  );
}
