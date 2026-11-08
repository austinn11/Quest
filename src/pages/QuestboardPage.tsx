import { useQuestboard } from '../questboard/QuestboardProvider';
import { usePlayer } from '../player/PlayerProvider';

export function QuestboardPage() {
  const { slots, templates, ready, error, retry } = useQuestboard();
  const { error: profileError } = usePlayer();
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  return (
    <>
      <header className="page-heading"><h1>Questboard</h1><p>Your six adventures: three Easy, two Medium, and one Hard.</p></header>
      {error ? (
        <section className="panel error" role="alert">
          <p>Your Questboard could not be prepared. {error}</p>
          <button type="button" className="secondary" onClick={retry}>Retry Questboard</button>
        </section>
      ) : !ready ? (
        <section className="panel" role="status"><p>{profileError ? 'Your player profile must load before your Questboard can open.' : 'Preparing your Questboard...'}</p></section>
      ) : (
        <ol className="questboard" aria-label="Your quest slots">
          {[...slots].sort((a, b) => a.slotIndex - b.slotIndex).map(slot => {
            const template = catalogue.get(slot.templateId);
            return (
              <li key={slot.slotId} className="panel">
                <p className="eyebrow">Slot {slot.slotIndex + 1} · {slot.difficulty.tag} · {slot.status.tag}</p>
                <h2>{template?.title ?? 'Quest details unavailable'}</h2>
                {template ? <><p>{template.description}</p><p>{template.category.tag} · {template.xpReward} XP</p></> : <p>Quest details are still syncing.</p>}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
