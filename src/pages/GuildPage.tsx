import { useState, type FormEvent } from 'react';
import { GuildQuests } from '../guild/GuildQuests';
import { GUILD_CRESTS, GuildCrest, useGuild } from '../guild/GuildProvider';
import { QuestDate } from '../questboard/QuestDate';
import { PageHeading } from '../ui/PageHeading';

const errorText = (error: unknown) => typeof error === 'string' ? error : error instanceof Error ? error.message : 'Something went wrong. Please try again.';

// Run one guild action at a time and report its error inline.
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    if (pending) return false;
    setPending(true);
    setError(null);
    try { await action(); return true; } catch (failure) { setError(errorText(failure)); return false; } finally { setPending(false); }
  };
  return { pending, error, run };
}

export function GuildPage() {
  const { guild, ready } = useGuild();
  return (
    <>
      <PageHeading title="Guild" />
      {!ready ? <p role="status">Opening the guild hall...</p> : guild ? <YourGuild /> : <FindAGuild />}
    </>
  );
}

function YourGuild() {
  const { guild, members, leaveGuild, setGuildOpen } = useGuild();
  const action = useAction();
  const [copied, setCopied] = useState(false);
  if (!guild) return null;
  const roster = [...members].sort((a, b) => (a.role === 'Leader' ? -1 : 0) - (b.role === 'Leader' ? -1 : 0) || b.xp - a.xp);
  const copy = async () => {
    try { await navigator.clipboard.writeText(guild.joinCode); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <>
      <section className="guild-banner" aria-labelledby="guild-name">
        <GuildCrest name={guild.name} crest={guild.crest} size="lg" />
        <div className="guild-banner-text">
          <h2 id="guild-name">{guild.name}</h2>
          {guild.motto && <p className="guild-motto">“{guild.motto}”</p>}
          <p className="guild-facts">
            <span><strong>{guild.memberCount}</strong> {guild.memberCount === 1 ? 'member' : 'members'}</span>
            <span><strong>{guild.totalXp.toLocaleString()}</strong> guild XP</span>
            <span>Founded <QuestDate timestamp={guild.foundedAt} /></span>
            <span>{guild.isOpen ? 'Open to all' : 'Invite only'}</span>
          </p>
        </div>
      </section>

      <GuildQuests />

      <section className="guild-invite" aria-labelledby="invite-title">
        <h2 id="invite-title">Invite adventurers</h2>
        <p>Share this code with friends so they can join from their Guild page.</p>
        <p className="guild-code-row">
          <code className="guild-code">{guild.joinCode}</code>
          <button type="button" className="secondary" onClick={() => { void copy(); }}>{copied ? 'Copied' : 'Copy code'}</button>
        </p>
        {guild.role === 'Leader' && (
          <p>
            <button type="button" className="link-button" disabled={action.pending} onClick={() => { void action.run(() => setGuildOpen(!guild.isOpen)); }}>
              {guild.isOpen ? 'Make the guild invite only' : 'Open the guild to everyone'}
            </button>
          </p>
        )}
      </section>

      <section aria-labelledby="roster-title">
        <h2 id="roster-title" className="section-title">Members</h2>
        <ul className="guild-roster">
          {roster.map(member => (
            <li key={member.memberId} className={member.isYou ? 'is-you' : undefined}>
              <span className="roster-name">{member.name}{member.isYou ? ' (you)' : ''}</span>
              <span className="roster-role">{member.role}</span>
              <span className="roster-level">Level {member.level}</span>
              <span className="roster-xp">{member.xp.toLocaleString()} XP</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="guild-leave">
        <button type="button" className="secondary" disabled={action.pending} onClick={() => {
          const last = guild.memberCount <= 1;
          if (window.confirm(last ? `You are the last member. Leaving disbands ${guild.name}. Leave?` : `Leave ${guild.name}?`)) void action.run(leaveGuild);
        }}>Leave guild</button>
        {guild.role === 'Leader' && guild.memberCount > 1 && <p className="field-help">If you leave, the longest-serving member becomes leader.</p>}
      </section>
      {action.error && <p className="error" role="alert">{action.error}</p>}
    </>
  );
}

function FindAGuild() {
  const { directory, joinOpenGuild, joinGuildByCode, createGuild } = useGuild();
  const join = useAction();
  const found = useAction();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [crest, setCrest] = useState<string>(GUILD_CRESTS[0]);
  const [isOpen, setIsOpen] = useState(true);
  const listings = [...directory].sort((a, b) => (b.totalXp > a.totalXp ? 1 : b.totalXp < a.totalXp ? -1 : a.name.localeCompare(b.name)));

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) void join.run(() => joinGuildByCode(code.trim()));
  };
  const submitGuild = (event: FormEvent) => {
    event.preventDefault();
    void found.run(() => createGuild({ name: name.trim(), motto: motto.trim(), crest, isOpen }));
  };

  return (
    <>
      <p className="guild-intro">Band together with other adventurers. Guild members see each other's levels and pool their XP into the guild's standing.</p>
      <div className="guild-columns">
        <section className="panel" aria-labelledby="join-code-title">
          <h2 id="join-code-title">Join with an invite code</h2>
          <form onSubmit={submitCode}>
            <label htmlFor="guild-code">Invite code</label>
            <div className="form-row">
              <input id="guild-code" value={code} onChange={event => setCode(event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={12} placeholder="ABC123" />
              <button type="submit" disabled={join.pending || !code.trim()}>{join.pending ? 'Joining...' : 'Join guild'}</button>
            </div>
          </form>
          {join.error && <p className="error" role="alert">{join.error}</p>}
        </section>

        <section className="panel" aria-labelledby="found-title">
          <h2 id="found-title">Found a guild</h2>
          <form onSubmit={submitGuild}>
            <label htmlFor="guild-name-input">Guild name</label>
            <input id="guild-name-input" value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={32} placeholder="The Wandering Owls" />
            <label htmlFor="guild-motto">Motto <span className="field-help">(optional)</span></label>
            <input id="guild-motto" value={motto} onChange={event => setMotto(event.target.value)} maxLength={100} placeholder="We see the trail at night." />
            <fieldset className="crest-picker">
              <legend>Crest</legend>
              {GUILD_CRESTS.map(option => (
                <label key={option} className={`crest-option${crest === option ? ' is-selected' : ''}`}>
                  <input type="radio" name="crest" value={option} checked={crest === option} onChange={() => setCrest(option)} className="visually-hidden" />
                  <GuildCrest name={name || 'Guild'} crest={option} size="sm" />
                  <span className="visually-hidden">{option}</span>
                </label>
              ))}
            </fieldset>
            <label className="checkbox-row"><input type="checkbox" checked={isOpen} onChange={event => setIsOpen(event.target.checked)} /> Anyone can join from the directory</label>
            <button type="submit" disabled={found.pending || name.trim().length < 3}>{found.pending ? 'Founding...' : 'Found guild'}</button>
          </form>
          {found.error && <p className="error" role="alert">{found.error}</p>}
        </section>
      </div>

      <section aria-labelledby="directory-title" className="guild-directory-section">
        <h2 id="directory-title" className="section-title">Guild directory</h2>
        {listings.length ? (
          <ol className="guild-directory">
            {listings.map(listing => (
              <li key={listing.guildId.toString()}>
                <GuildCrest name={listing.name} crest={listing.crest} />
                <div className="directory-text">
                  <span className="directory-name">{listing.name}</span>
                  {listing.motto && <span className="directory-motto">{listing.motto}</span>}
                  <span className="directory-facts">{listing.memberCount} {listing.memberCount === 1 ? 'member' : 'members'} · {listing.totalXp.toLocaleString()} XP</span>
                </div>
                {listing.isOpen
                  ? <button type="button" className="secondary" disabled={join.pending} onClick={() => { void join.run(() => joinOpenGuild(listing.guildId)); }}>Join</button>
                  : <span className="directory-closed">Invite only</span>}
              </li>
            ))}
          </ol>
        ) : <p>No guilds have been founded yet. Be the first.</p>}
      </section>
    </>
  );
}
