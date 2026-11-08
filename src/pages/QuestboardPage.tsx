import { questDisplay } from '../questboard/quest-copy';
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
import { CameraIcon, CategoryIcon, CheckIcon, RerollIcon } from '../ui/icons';
import { QuestAreaNotice } from '../location/QuestAreaNotice';
import { PageHeading } from '../ui/PageHeading';
import boardTexture from '../assets/questboard-wood.jpg';
import { useQuestRerolls } from '../questboard/useQuestRerolls';
import { RerollAllowance, RerollDialog } from '../questboard/QuestRerolls';

export function QuestboardPage() {
  const { slots, templates, completions, captures, ready, connected, hasSnapshot, initializing, error, subscriptionError, retry, now, refreshing, refreshSlots } = useQuestboard();
  const catalogue = new Map(templates.map(template => [template.templateId, questDisplay(template)]));
  const destinations = new Map(locatedQuests(slots, templates).map(quest => [quest.slot.slotId, quest]));
  const capturesByCompletion = new Map(captures.map(capture => [capture.completionId.toString(), capture]));
  // A completed Bestiary quest shows its capture until the slot is replaced.
  const captureFor = (slot: (typeof slots)[number]) => {
    const completion = completions.find(row => row.slotIndex === slot.slotIndex && row.templateId === slot.templateId &&
      row.completedAt.microsSinceUnixEpoch === slot.completedAt?.microsSinceUnixEpoch);
    return completion ? capturesByCompletion.get(completion.completionId.toString()) : undefined;
  };
  const { hash } = useLocation();
  const canInteract = connected && ready && !initializing && !error && !subscriptionError;
  const rerolls = useQuestRerolls(slots, canInteract && !refreshing);

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
      <PageHeading title="Questboard">
        <div className="questboard-actions">
          <button type="button" className="secondary" disabled={!canInteract || refreshing} onClick={() => { void refreshSlots(); }}>{refreshing ? 'Checking replacements...' : 'Check for new quests'}</button>
          <Link to="/journal">Quest Journal</Link>
        </div>
      </PageHeading>
      <QuestSyncNotice page="Questboard" />
      <RerollAllowance controls={rerolls} />
      <QuestAreaNotice />
      {hasSnapshot && slots.length > 0 && (
        <section className="noticeboard" aria-label="Quest notices">
          <img className="noticeboard-texture" src={boardTexture} alt="" aria-hidden="true" />
          <ol className="questboard" aria-label="Your quest slots">
            {[...slots].sort((a, b) => a.slotIndex - b.slotIndex).map(slot => {
              const template = catalogue.get(slot.templateId);
              const cooldown = slot.status.tag === 'Cooldown';
              const destination = destinations.get(slot.slotId);
              const saveCapture = template?.category.tag === 'Bestiary';
              const capture = saveCapture && cooldown ? captureFor(slot) : undefined;
              return (
                <li key={slot.slotId} id={`quest-slot-${slot.slotIndex}`} tabIndex={-1} className={`quest-card notice difficulty-${slot.difficulty.tag.toLowerCase()}${cooldown ? ' quest-card-cooldown' : ''}`}>
                  <article className="notice-sheet">
                    <span className="notice-pin" aria-hidden="true" />
                    <div className="notice-body">
                      <h2>{template?.title ?? 'Quest details unavailable'}</h2>
                      <p className="quest-meta">
                        {template && <CategoryIcon category={template.category.tag} />}
                        <span>{template ? `${template.category.tag} · ` : ''}<span className="difficulty-label">{slot.difficulty.tag}</span></span>
                        <span className={`quest-status${cooldown ? ' is-cooldown' : ''}`}>{slot.status.tag}</span>
                      </p>
                      {capture && (
                        <p className="notice-capture">
                          <img src={capture.photo} alt={`Your capture: ${capture.creature}`} />
                          <span>Captured: {capture.creature}</span>
                        </p>
                      )}
                      {template
                        ? <p className="quest-objective">{template.description}</p>
                        : <p>This quest's template is unavailable. Your assignment is still saved.</p>}
                      {template?.photoGoal && !cooldown && <p className="photo-goal"><CameraIcon /><span><span className="visually-hidden">Photo proof: </span>{template.photoGoal}</span></p>}
                      {cooldown && <p className="field-help">This adventure is complete. The slot is awaiting a replacement.</p>}
                      <QuestCooldown slot={slot} now={now} refreshing={refreshing} />
                      <details className="quest-details">
                        <summary>Inspect quest</summary>
                        <dl>
                          <div><dt>Assigned</dt><dd><QuestDate timestamp={slot.assignedAt} /></dd></div>
                          {cooldown && slot.completedAt && <div><dt>Completed</dt><dd><QuestDate timestamp={slot.completedAt} /></dd></div>}
                          {cooldown && slot.refreshAt && <div><dt>Eligible for replacement</dt><dd><QuestDate timestamp={slot.refreshAt} /></dd></div>}
                          <div><dt>Location</dt><dd>{template?.latitude !== undefined && template.longitude !== undefined ? `${template.latitude.toFixed(5)}, ${template.longitude.toFixed(5)}` : template ? 'No fixed location. Choose a suitable place for this adventure.' : 'Location details unavailable.'}</dd></div>
                        </dl>
                      </details>
                    </div>
                    <div className="notice-footer">
                      {template && <p className="quest-reward">{template.xpReward} XP reward</p>}
                      {cooldown && <p className="quest-done"><CheckIcon /> Completed</p>}
                      <CompleteQuestButton slot={slot} disabled={!canInteract || refreshing || !template || rerolls.pending} saveCapture={saveCapture} />
                      <button type="button" className="secondary quest-reroll" disabled={!canInteract || refreshing || cooldown || !template || !rerolls.allowance?.remaining || rerolls.pending}
                        onClick={() => rerolls.open(slot)}><RerollIcon />{rerolls.pending && rerolls.target?.slotId === slot.slotId ? 'Rerolling...' : 'Reroll'}</button>
                      {destination && <Link className="notice-link" to={questMapPath(slot)}>View on map</Link>}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {ready && !initializing && !error && !subscriptionError && slots.length === 0 && (
        <section className="panel empty-state"><h2>Your board awaits</h2><p>No quests have been assigned yet. Ask the guild to prepare your six adventures.</p><button type="button" onClick={retry}>Prepare Questboard</button></section>
      )}
      <section className="level-section" aria-label="Adventurer progression"><PlayerProgress /></section>
      <RerollDialog controls={rerolls} enabled={canInteract && !refreshing} title={catalogue.get(rerolls.target?.templateId ?? '')?.title ?? 'Your assigned quest'} />
    </>
  );
}
