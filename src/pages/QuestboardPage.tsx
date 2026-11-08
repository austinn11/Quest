import { Link, useLocation } from 'react-router';
import { useEffect } from 'react';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { QuestDate } from '../questboard/QuestDate';
import { QuestSyncNotice } from '../questboard/QuestSyncNotice';
import { CompleteQuestButton } from '../questboard/CompleteQuestButton';
import { QuestCooldown } from '../questboard/QuestCooldown';
import { PlayerProgress } from '../player/PlayerProgress';
import { locatedQuests } from '../map/quest-locations';
import { questMapPath } from '../map/quest-navigation';

export function QuestboardPage() {
  const { slots, templates, ready, connected, hasSnapshot, initializing, error, subscriptionError, retry, now, refreshing, refreshSlots } = useQuestboard();
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  const destinations = new Map(locatedQuests(slots, templates).map(quest => [quest.slot.slotId, quest]));
  const { hash } = useLocation();
  const canInteract = connected && ready && !initializing && !error && !subscriptionError;

  useEffect(() => {
    if (canInteract) void refreshSlots();
  }, [canInteract, refreshSlots]);

  useEffect(() => {
    if (!hasSnapshot || !/^#quest-slot-[0-5]$/.test(hash)) return;
    const card = document.getElementById(hash.slice(1));
    card?.scrollIntoView({ block: 'nearest' });
    card?.focus({ preventScroll: true });
  }, [hash, hasSnapshot, slots.length]);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">The adventurers' guild</p>
        <h1>Questboard</h1>
        <p>Your six adventures, ready to explore. Inspect a quest to plan your next journey.</p>
        <div className="questboard-actions"><Link to="/journal">Read your Quest Journal</Link><button type="button" className="secondary" disabled={!canInteract || refreshing} onClick={() => { void refreshSlots(); }}>{refreshing ? 'Checking replacements...' : 'Check for new quests'}</button></div>
      </header>
      <section className="panel" aria-label="Adventurer progression"><PlayerProgress /></section>
      <QuestSyncNotice page="Questboard" />
      {hasSnapshot && slots.length > 0 && (
        <ol className="questboard" aria-label="Your quest slots">
          {[...slots].sort((a, b) => a.slotIndex - b.slotIndex).map(slot => {
            const template = catalogue.get(slot.templateId);
            const cooldown = slot.status.tag === 'Cooldown';
            const destination = destinations.get(slot.slotId);
            return (
              <li key={slot.slotId} id={`quest-slot-${slot.slotIndex}`} tabIndex={-1} className={`panel quest-card difficulty-${slot.difficulty.tag.toLowerCase()}${cooldown ? ' quest-card-cooldown' : ''}`}>
                <div className="quest-card-heading"><p className="eyebrow">Slot {slot.slotIndex + 1} / {slot.difficulty.tag}</p><span className={`quest-status${cooldown ? ' is-cooldown' : ''}`}>{slot.status.tag}</span></div>
                <h2>{template?.title ?? 'Quest details unavailable'}</h2>
                {template ? (
                  <>
                    <p className="quest-meta"><span>{template.category.tag}</span><strong>{template.xpReward} XP reward</strong></p>
                    <p className="quest-objective">{template.description}</p>
                  </>
                ) : <p>This quest's template is unavailable. Your assignment is still saved.</p>}
                {cooldown && <p className="field-help">This adventure is complete. The slot is awaiting a replacement.</p>}
                <QuestCooldown slot={slot} now={now} refreshing={refreshing} />
                {destination && <p><Link to={questMapPath(slot)}>View on map</Link></p>}
                <details className="quest-details">
                  <summary>Inspect quest</summary>
                  <dl>
                    <div><dt>Assigned</dt><dd><QuestDate timestamp={slot.assignedAt} /></dd></div>
                    {cooldown && slot.completedAt && <div><dt>Completed</dt><dd><QuestDate timestamp={slot.completedAt} /></dd></div>}
                    {cooldown && slot.refreshAt && <div><dt>Eligible for replacement</dt><dd><QuestDate timestamp={slot.refreshAt} /></dd></div>}
                    <div><dt>Location</dt><dd>{template?.latitude !== undefined && template.longitude !== undefined ? `${template.latitude.toFixed(5)}, ${template.longitude.toFixed(5)}` : template ? 'No fixed location. Choose a suitable place for this adventure.' : 'Location details unavailable.'}</dd></div>
                  </dl>
                </details>
                <CompleteQuestButton slot={slot} disabled={!canInteract || refreshing || !template} />
              </li>
            );
          })}
        </ol>
      )}
      {ready && !initializing && !error && !subscriptionError && slots.length === 0 && (
        <section className="panel empty-state"><h2>Your board awaits</h2><p>No quests have been assigned yet. Ask the guild to prepare your six adventures.</p><button type="button" onClick={retry}>Prepare Questboard</button></section>
      )}
    </>
  );
}
