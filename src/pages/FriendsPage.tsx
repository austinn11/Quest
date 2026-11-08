import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeading } from '../ui/PageHeading';
import { useSocial } from '../social/SocialProvider';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { photoToDataUrl } from '../questboard/photo';
import { CameraIcon, CategoryIcon } from '../ui/icons';
import { QuestDate } from '../questboard/QuestDate';

const errorText = (error: unknown) => typeof error === 'string' ? error : error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    if (pending) return false;
    setPending(true);
    setError(null);
    try { await action(); return true; } catch (failure) { setError(errorText(failure)); return false; } finally { setPending(false); }
  };
  return { pending, error, run };
}

export function FriendsPage() {
  const { ready } = useSocial();
  return (
    <>
      <PageHeading title="Friends" />
      {!ready ? <p role="status">Gathering your companions...</p> : (
        <>
          <PartySection />
          <Requests />
          <FriendsSection />
        </>
      )}
    </>
  );
}

function PartySection() {
  const { party, partyMembers, invites, createParty, leaveParty, respondPartyInvite } = useSocial();
  const action = useAction();
  return (
    <section className="party-section" aria-labelledby="party-title">
      <h2 id="party-title" className="section-title">Party</h2>
      {invites.length > 0 && (
        <ul className="social-list">
          {invites.map(invite => (
            <li key={invite.inviteId.toString()}>
              <span className="social-name">{invite.fromName} invited you to their party ({invite.partySize}/4)</span>
              <span className="social-actions">
                <button type="button" disabled={action.pending} onClick={() => { void action.run(() => respondPartyInvite(invite.inviteId, true)); }}>Join party</button>
                <button type="button" className="secondary" disabled={action.pending} onClick={() => { void action.run(() => respondPartyInvite(invite.inviteId, false)); }}>Decline</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {party ? (
        <>
          <ul className="party-members" aria-label="Party members">
            {partyMembers.map(member => (
              <li key={member.memberId} className={member.isYou ? 'is-you' : undefined}>
                <span className="party-avatar" aria-hidden="true">{member.username.slice(0, 1).toUpperCase()}</span>
                <span className="social-name">{member.username}{member.isYou ? ' (you)' : ''}</span>
                <span className="social-meta">{member.isLeader ? 'Leader · ' : ''}Level {member.level}</span>
              </li>
            ))}
          </ul>
          <PartyQuest />
          <p className="party-leave">
            <button type="button" className="secondary" disabled={action.pending} onClick={() => { void action.run(leaveParty); }}>Leave party</button>
            <span className="field-help">Invite friends from the list below. Parties hold up to 4 adventurers.</span>
          </p>
        </>
      ) : (
        <div className="panel party-empty">
          <p>Team up with friends to take on a quest together. When anyone in the party proves it with a photo, every member earns its XP plus a 25% party bonus.</p>
          <button type="button" disabled={action.pending} onClick={() => { void action.run(createParty); }}>Start a party</button>
        </div>
      )}
      {action.error && <p className="error" role="alert">{action.error}</p>}
    </section>
  );
}

function PartyQuest() {
  const { party, setPartyQuest, submitPartyQuestPhoto } = useSocial();
  const { slots, templates } = useQuestboard();
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ accepted: boolean; message: string; observation: string } | null>(null);
  if (!party) return null;
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  const choices = [...slots].filter(slot => slot.status.tag === 'Available').sort((a, b) => a.slotIndex - b.slotIndex)
    .flatMap(slot => { const template = catalogue.get(slot.templateId); return template ? [template] : []; });

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || checking) return;
    setChecking(true);
    setResult(null);
    try {
      const verdict = await submitPartyQuestPhoto(await photoToDataUrl(file));
      setResult({ accepted: verdict.accepted, message: verdict.message, observation: verdict.observation });
    } catch (error) {
      setResult({ accepted: false, message: errorText(error), observation: '' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="party-quest">
      <p className="eyebrow">Party quest</p>
      {party.questTitle ? (
        <>
          <div className="party-quest-head">
            {party.questCategory && <CategoryIcon category={party.questCategory} className="icon-lg" />}
            <h3>{party.questTitle}</h3>
            <span className="party-quest-reward">+{party.questXpEach} XP each</span>
          </div>
          <p>{party.questDescription}</p>
          {party.questLocationName && <p className="field-help">At {party.questLocationName}</p>}
          {party.questPhotoGoal && <p className="photo-goal"><CameraIcon /><span>{party.questPhotoGoal}</span></p>}
          <button type="button" disabled={checking} aria-busy={checking} onClick={() => input.current?.click()}>{checking ? 'Checking photo...' : 'Complete together'}</button>
          <input ref={input} className="visually-hidden" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={event => { void onPhoto(event); }} />
          {result && <p className={result.accepted ? 'success' : 'error'} role={result.accepted ? 'status' : 'alert'}>{result.accepted ? '' : 'Not accepted: '}{result.message}{result.observation ? ` The guild saw: ${result.observation}.` : ''}</p>}
        </>
      ) : <p>{party.isLeader ? 'Choose one of your quests for the party to do together.' : `Waiting for ${party.leaderName} to choose a party quest.`}</p>}
      {party.isLeader && (
        <label className="party-quest-picker">
          <span>{party.questTitle ? 'Change the party quest' : 'Party quest'}</span>
          <select value={party.questTemplateId ?? ''} disabled={action.pending} onChange={event => { void action.run(() => setPartyQuest(event.target.value)); }}>
            <option value="">No party quest</option>
            {choices.map(template => <option key={template.templateId} value={template.templateId}>{template.title} ({template.category.tag}, {template.xpReward} XP)</option>)}
          </select>
        </label>
      )}
      {party.lastQuestTitle && (
        <p className="party-last">
          Last party quest: <strong>{party.lastQuestTitle}</strong>, completed by {party.lastCompletedBy}
          {party.lastCompletedAt && <> on <QuestDate timestamp={party.lastCompletedAt} /></>}. Everyone earned +{party.lastXpEach} XP.
        </p>
      )}
      {action.error && <p className="error" role="alert">{action.error}</p>}
    </div>
  );
}

function Requests() {
  const { requests, respondFriendRequest } = useSocial();
  const action = useAction();
  if (!requests.length) return null;
  return (
    <section aria-labelledby="requests-title">
      <h2 id="requests-title" className="section-title">Friend requests</h2>
      <ul className="social-list">
        {requests.map(request => (
          <li key={request.requestId.toString()}>
            <span className="social-name">{request.username}</span>
            <span className="social-meta">{request.incoming ? 'wants to be friends' : 'request sent'}</span>
            <span className="social-actions">
              {request.incoming && <button type="button" disabled={action.pending} onClick={() => { void action.run(() => respondFriendRequest(request.requestId, true)); }}>Accept</button>}
              <button type="button" className="secondary" disabled={action.pending} onClick={() => { void action.run(() => respondFriendRequest(request.requestId, false)); }}>{request.incoming ? 'Decline' : 'Cancel'}</button>
            </span>
          </li>
        ))}
      </ul>
      {action.error && <p className="error" role="alert">{action.error}</p>}
    </section>
  );
}

function FriendsSection() {
  const { friends, sendFriendRequest, inviteToParty, removeFriend } = useSocial();
  const add = useAction();
  const action = useAction();
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const sorted = [...friends].sort((a, b) => a.username.localeCompare(b.username));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (name && await add.run(() => sendFriendRequest(name))) { setSent(name); setUsername(''); }
  };
  return (
    <section aria-labelledby="friends-title">
      <h2 id="friends-title" className="section-title">Friends</h2>
      <form className="add-friend" onSubmit={event => { void submit(event); }}>
        <label htmlFor="friend-username">Add a friend by username</label>
        <div className="form-row">
          <input id="friend-username" value={username} onChange={event => { setUsername(event.target.value); setSent(null); }} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={24} placeholder="Their username" />
          <button type="submit" disabled={add.pending || !username.trim()}>{add.pending ? 'Sending...' : 'Send request'}</button>
        </div>
      </form>
      {sent && <p className="success" role="status">Friend request sent to {sent}.</p>}
      {add.error && <p className="error" role="alert">{add.error}</p>}
      {sorted.length ? (
        <ul className="social-list">
          {sorted.map(friend => (
            <li key={friend.friendshipId.toString()}>
              <span className="party-avatar" aria-hidden="true">{friend.username.slice(0, 1).toUpperCase()}</span>
              <span className="social-name">{friend.username}</span>
              <span className="social-meta">Level {friend.level} · {friend.totalXp.toLocaleString()} XP{friend.inYourParty ? ' · In your party' : friend.inAParty ? ' · In a party' : ''}</span>
              <span className="social-actions">
                {!friend.inYourParty && (
                  <button type="button" className="secondary" disabled={action.pending} onClick={() => { void action.run(() => inviteToParty(friend.username)); }}>Invite to party</button>
                )}
                <button type="button" className="link-button" disabled={action.pending} onClick={() => {
                  if (window.confirm(`Remove ${friend.username} from your friends?`)) void action.run(() => removeFriend(friend.username));
                }}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p>No friends yet. Ask yours for their username and send a request.</p>}
      {action.error && <p className="error" role="alert">{action.error}</p>}
    </section>
  );
}
