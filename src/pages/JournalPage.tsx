import { useState } from 'react';
import { Link } from 'react-router';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestDate } from '../questboard/QuestDate';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';
import { locatedQuests } from '../map/quest-locations';
import { completionMapLocation, questMapPath } from '../map/quest-navigation';
import { PageHeading } from '../ui/PageHeading';
import { DEFAULT_JOURNAL_FILTERS, filterCompletions, type JournalFilters } from '../collection/filters';
import { CollectionToolbar, NoMatches } from '../collection/CollectionToolbar';
import { FavoriteStar, useFavorites } from '../collection/FavoritesProvider';

export function JournalPage() {
  const { slots, completions, templates, captures, ready, hasSnapshot, subscriptionError } = useQuestboard();
  const favorites = useFavorites();
  const [filters, setFilters] = useState<JournalFilters>(DEFAULT_JOURNAL_FILTERS);
  const capturesByCompletion = new Map(captures.map(capture => [capture.completionId.toString(), capture]));
  const destinations = locatedQuests(slots, templates);
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  const history = filterCompletions(completions, filters, favorites.completions, completion => catalogue.get(completion.templateId));
  const earnedXp = completions.reduce((total, completion) => total + completion.xpAwarded, 0);
  const active = filters.search.trim() !== '' || filters.category !== 'all' || filters.difficulty !== 'all' || filters.favoritesOnly;
  const update = (changes: Partial<JournalFilters>) => setFilters(current => ({ ...current, ...changes }));
  const clear = () => setFilters(current => ({ ...DEFAULT_JOURNAL_FILTERS, sort: current.sort }));
  return (
    <>
      <PageHeading title="Quest Journal">
        <Link to="/questboard">Return to your Questboard</Link>
      </PageHeading>
      <QuestSyncNotice page="Journal" />
      {hasSnapshot && completions.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="visually-hidden">Your accomplishments</h2>
          <dl className="quest-summary" aria-label="Adventure history overview">
            <div><dt>Quests completed</dt><dd>{completions.length.toLocaleString()}</dd></div>
            <div><dt>XP earned from recorded quests</dt><dd>{earnedXp.toLocaleString()}</dd></div>
          </dl>
          <CollectionToolbar
            label="Search and filter your journal"
            search={filters.search} onSearch={search => update({ search })} placeholder="Search quests, places or notes"
            selects={[
              { id: 'category', label: 'Category', value: filters.category, onChange: category => update({ category: category as JournalFilters['category'] }), options: [
                { value: 'all', label: 'All categories' }, { value: 'Exploration', label: 'Exploration' }, { value: 'Bestiary', label: 'Bestiary' }, { value: 'Crafting', label: 'Crafting' },
              ] },
              { id: 'difficulty', label: 'Difficulty', value: filters.difficulty, onChange: difficulty => update({ difficulty: difficulty as JournalFilters['difficulty'] }), options: [
                { value: 'all', label: 'All difficulties' }, { value: 'Easy', label: 'Easy' }, { value: 'Medium', label: 'Medium' }, { value: 'Hard', label: 'Hard' },
              ] },
              { id: 'sort', label: 'Sort', value: filters.sort, onChange: sort => update({ sort: sort as JournalFilters['sort'] }), options: [
                { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'xp', label: 'Most XP' },
              ] },
            ]}
            favoritesOnly={filters.favoritesOnly} onFavoritesOnly={favoritesOnly => update({ favoritesOnly })}
            shown={history.length} total={completions.length} active={active} onClear={clear}
          />
          {favorites.error && <p className="error" role="alert">{favorites.error}</p>}
          {history.length ? (
            <ol className="quest-history" aria-label="Completed adventures">
              {history.map(completion => {
                const template = catalogue.get(completion.templateId);
                const destination = completionMapLocation(completion, destinations);
                const capture = capturesByCompletion.get(completion.completionId.toString());
                const title = template?.title ?? 'An accomplished adventure';
                return (
                  <li key={completion.completionId.toString()} className="journal-entry">
                    <p className="journal-date"><QuestDate timestamp={completion.completedAt} /></p>
                    <div>
                      <div className="journal-entry-heading">
                        <h3>{title}</h3>
                        <span className="journal-entry-actions">
                          <strong className="quest-earned">+{completion.xpAwarded.toLocaleString()} XP earned</strong>
                          <FavoriteStar kind="completion" itemId={completion.completionId} name={title} />
                        </span>
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
          ) : <NoMatches onClear={clear}>No journal entries match your search and filters.</NoMatches>}
        </section>
      )}
      {ready && !subscriptionError && completions.length === 0 && (
        <section className="empty-state"><h2>Your story is unwritten</h2><p>No completed adventures yet. Your accomplishments and earned XP will be recorded here.</p><Link to="/questboard">Explore your assigned quests</Link></section>
      )}
    </>
  );
}
