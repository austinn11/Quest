import { useState } from 'react';
import { Link } from 'react-router';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestDate } from '../questboard/QuestDate';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';
import { PageHeading } from '../ui/PageHeading';
import { DEFAULT_BESTIARY_FILTERS, filterCaptures, type BestiaryFilters } from '../collection/filters';
import { CollectionToolbar, NoMatches } from '../collection/CollectionToolbar';
import { FavoriteStar, useFavorites } from '../collection/FavoritesProvider';

// The player's private collection of creatures captured for Bestiary bounties.
export function BestiaryPage() {
  const { captures, completions, ready, hasSnapshot, subscriptionError } = useQuestboard();
  const favorites = useFavorites();
  const [filters, setFilters] = useState<BestiaryFilters>(DEFAULT_BESTIARY_FILTERS);
  const rewards = new Map(completions.map(completion => [completion.completionId.toString(), completion.xpAwarded]));
  const collection = filterCaptures(captures, filters, favorites.captures, capture => rewards.get(capture.completionId.toString()) ?? 0);
  const kinds = new Set(captures.map(capture => capture.creature.toLowerCase())).size;
  const active = filters.search.trim() !== '' || filters.favoritesOnly;
  const update = (changes: Partial<BestiaryFilters>) => setFilters(current => ({ ...current, ...changes }));
  const clear = () => setFilters(current => ({ ...DEFAULT_BESTIARY_FILTERS, sort: current.sort }));
  return (
    <>
      <PageHeading title="Bestiary">
        <Link to="/questboard">See open bounties</Link>
      </PageHeading>
      <QuestSyncNotice page="Bestiary" />
      {hasSnapshot && captures.length > 0 && (
        <>
          <p className="bestiary-summary">
            <span><strong>{captures.length}</strong> {captures.length === 1 ? 'capture' : 'captures'}</span>
            <span><strong>{kinds}</strong> species</span>
            <span><strong>{favorites.captures.size}</strong> {favorites.captures.size === 1 ? 'favorite' : 'favorites'}</span>
          </p>
          <CollectionToolbar
            label="Search and filter your captures"
            search={filters.search} onSearch={search => update({ search })} placeholder="Search creatures, bounties or places"
            selects={[
              { id: 'sort', label: 'Sort', value: filters.sort, onChange: sort => update({ sort: sort as BestiaryFilters['sort'] }), options: [
                { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A–Z' }, { value: 'reward', label: 'Biggest reward' },
              ] },
            ]}
            favoritesOnly={filters.favoritesOnly} onFavoritesOnly={favoritesOnly => update({ favoritesOnly })}
            shown={collection.length} total={captures.length} active={active} onClear={clear}
          />
          {favorites.error && <p className="error" role="alert">{favorites.error}</p>}
          {collection.length ? (
            <ul className="bestiary-grid" aria-label="Captured creatures">
              {collection.map(capture => (
                <li key={capture.captureId.toString()}>
                  <figure className="capture-card">
                    <img src={capture.photo} alt={`Your photo of ${capture.creature}`} loading="lazy" />
                    <FavoriteStar kind="capture" itemId={capture.captureId} name={capture.creature} />
                    <figcaption>
                      <h2>{capture.creature}</h2>
                      <p className="capture-bounty">Bounty: {capture.bountyTarget}</p>
                      {capture.locationName && <p>{capture.locationName}</p>}
                      <p className="capture-date"><QuestDate timestamp={capture.capturedAt} /></p>
                      <span className={`capture-badge${capture.verified ? ' is-verified' : ''}`}>{capture.verified ? 'Verified by the guild' : 'Not AI-checked'}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          ) : <NoMatches onClear={clear}>No captures match your search and filters.</NoMatches>}
        </>
      )}
      {ready && !subscriptionError && captures.length === 0 && (
        <section className="empty-state">
          <h2>No creatures captured yet</h2>
          <p>Claim a Bestiary bounty on your Questboard by photographing the wanted creature. Every capture and its photo is kept here, visible only to you.</p>
          <Link to="/questboard">See open bounties</Link>
        </section>
      )}
    </>
  );
}
