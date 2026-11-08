import { Link } from 'react-router';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestDate } from '../questboard/QuestDate';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';

export function JournalPage() {
  const { completions, templates, ready, hasSnapshot, subscriptionError } = useQuestboard();
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  const history = [...completions].sort((a, b) => {
    const difference = b.completedAt.microsSinceUnixEpoch - a.completedAt.microsSinceUnixEpoch;
    return difference > 0n ? 1 : difference < 0n ? -1 : a.completionId < b.completionId ? 1 : a.completionId > b.completionId ? -1 : 0;
  });
  const earnedXp = history.reduce((total, completion) => total + completion.xpAwarded, 0);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Chronicles of your journey</p>
        <h1>Quest Journal</h1>
        <p>Completed adventures, hard-earned experience, and the moments that made your story.</p>
        <Link to="/questboard">Return to your Questboard</Link>
      </header>
      <QuestSyncNotice page="Journal" />
      {hasSnapshot && history.length > 0 && (
        <>
          <dl className="quest-summary" aria-label="Adventure history overview">
            <div><dt>Quests completed</dt><dd>{history.length.toLocaleString()}</dd></div>
            <div><dt>XP earned from recorded quests</dt><dd>{earnedXp.toLocaleString()}</dd></div>
          </dl>
          <section aria-labelledby="history-heading">
            <h2 id="history-heading">Your accomplishments</h2>
            <p className="field-help">Most recent adventures first.</p>
            <ol className="quest-history" aria-label="Completed adventures">
              {history.map(completion => {
                const template = catalogue.get(completion.templateId);
                return (
                  <li key={completion.completionId.toString()} className="panel quest-card">
                    <div className="quest-card-heading"><span className="quest-status">Completed</span><strong className="quest-earned">+{completion.xpAwarded.toLocaleString()} XP earned</strong></div>
                    <h3>{template?.title ?? 'An accomplished adventure'}</h3>
                    {template ? <p className="quest-meta">{template.category.tag} / {template.difficulty.tag}</p> : <p>The template is no longer available. Your accomplishment remains recorded.</p>}
                    <p className="quest-completed-date">Completed <QuestDate timestamp={completion.completedAt} /></p>
                    <details className="quest-details">
                      <summary>Revisit adventure</summary>
                      <p>{template?.description ?? 'The original objective is unavailable.'}</p>
                      <p>Completed from Questboard slot {completion.slotIndex + 1}.</p>
                    </details>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
      {ready && !subscriptionError && history.length === 0 && (
        <section className="panel empty-state"><h2>Your story is unwritten</h2><p>No completed adventures yet. Your accomplishments and earned XP will be recorded here.</p><Link to="/questboard">Explore your assigned quests</Link></section>
      )}
    </>
  );
}
