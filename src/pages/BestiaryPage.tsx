import { Link } from 'react-router';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestDate } from '../questboard/QuestDate';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';
import { PageHeading } from '../ui/PageHeading';

// The player's private collection of creatures captured for Bestiary bounties.
export function BestiaryPage() {
  const { captures, ready, hasSnapshot, subscriptionError } = useQuestboard();
  const collection = [...captures].sort((a, b) => {
    const difference = b.capturedAt.microsSinceUnixEpoch - a.capturedAt.microsSinceUnixEpoch;
    return difference > 0n ? 1 : difference < 0n ? -1 : a.captureId < b.captureId ? 1 : -1;
  });
  const kinds = new Set(collection.map(capture => capture.creature.toLowerCase())).size;
  return (
    <>
      <PageHeading title="Bestiary">
        <Link to="/questboard">See open bounties</Link>
      </PageHeading>
      <QuestSyncNotice page="Bestiary" />
      {hasSnapshot && collection.length > 0 && (
        <>
          <p className="bestiary-summary">
            <span><strong>{collection.length}</strong> {collection.length === 1 ? 'capture' : 'captures'}</span>
            <span><strong>{kinds}</strong> {kinds === 1 ? 'kind of creature' : 'kinds of creature'}</span>
          </p>
          <ul className="bestiary-grid" aria-label="Captured creatures, most recent first">
            {collection.map(capture => (
              <li key={capture.captureId.toString()}>
                <figure className="capture-card">
                  <img src={capture.photo} alt={`Your photo of ${capture.creature}`} loading="lazy" />
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
        </>
      )}
      {ready && !subscriptionError && collection.length === 0 && (
        <section className="empty-state">
          <h2>No creatures captured yet</h2>
          <p>Claim a Bestiary bounty on your Questboard by photographing the wanted creature. Every capture and its photo is kept here, visible only to you.</p>
          <Link to="/questboard">See open bounties</Link>
        </section>
      )}
    </>
  );
}
