import { Link } from 'react-router';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestDate } from '../questboard/QuestDate';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';
import { locatedQuests } from '../map/quest-locations';
import { completionMapLocation, questMapPath } from '../map/quest-navigation';

export function JournalPage() {
  const { slots, completions, templates, captures, ready, hasSnapshot, subscriptionError } = useQuestboard();
  const capturesByCompletion = new Map(captures.map(capture => [capture.completionId.toString(), capture]));
  const destinations = locatedQuests(slots, templates);
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  const history = [...completions].sort((a, b) => {
    const difference = b.completedAt.microsSinceUnixEpoch - a.completedAt.microsSinceUnixEpoch;
    return difference > 0n ? 1 : difference < 0n ? -1 : a.completionId < b.completionId ? 1 : a.completionId > b.completionId ? -1 : 0;
  });
  const earnedXp = history.reduce((total, completion) => total + completion.xpAwarded, 0);
  return (
    <>
      <header className="page-heading page-heading-row">
        <h1>Quest Journal</h1>
        <Link to="/questboard">Return to your Questboard</Link>
      </header>
      <QuestSyncNotice page="Journal" />
      {hasSnapshot && history.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="visually-hidden">Your accomplishments</h2>
          <dl className="quest-summary" aria-label="Adventure history overview">
            <div><dt>Quests completed</dt><dd>{history.length.toLocaleString()}</dd></div>
            <div><dt>XP earned from recorded quests</dt><dd>{earnedXp.toLocaleString()}</dd></div>
          </dl>
          <ol className="quest-history" aria-label="Completed adventures, most recent first">
            {history.map(completion => {
              const template = catalogue.get(completion.templateId);
              const destination = completionMapLocation(completion, destinations);
              const capture = capturesByCompletion.get(completion.completionId.toString());
              return (
                <li key={completion.completionId.toString()} className="journal-entry">
                  <p className="journal-date"><QuestDate timestamp={completion.completedAt} /></p>
                  <div>
                    <div className="journal-entry-heading">
                      <h3>{template?.title ?? 'An accomplished adventure'}</h3>
                      <strong className="quest-earned">+{completion.xpAwarded.toLocaleString()} XP earned</strong>
                    </div>
                    {template
                      ? <p className="quest-meta">{template.category.tag} · {template.difficulty.tag}{template.locationName ? ` · ${template.locationName}` : ''}</p>
                      : <p>The template is no longer available. Your accomplishment remains recorded.</p>}
                    {template && <p className="quest-objective">{template.description}</p>}
                    {capture && (
                      <Link className="journal-capture" to="/bestiary">
                        <img src={capture.photo} alt={`Your photo of ${capture.creature}`} loading="lazy" />
                        <span>Captured: {capture.creature}</span>
                      </Link>
                    )}
                    {completion.proofNote && <p className="proof-note">The guild saw: {completion.proofNote}</p>}
                    {destination && <p><Link to={questMapPath(destination.slot)}>View completed quest on map</Link></p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {ready && !subscriptionError && history.length === 0 && (
        <section className="empty-state"><h2>Your story is unwritten</h2><p>No completed adventures yet. Your accomplishments and earned XP will be recorded here.</p><Link to="/questboard">Explore your assigned quests</Link></section>
      )}
    </>
  );
}
