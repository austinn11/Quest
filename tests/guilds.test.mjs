import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

let server;
let createPlayerHarness;
before(async () => {
  server = await createServer({
    configFile: false, plugins: [spacetimedbModuleTestPlugin()],
    ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error',
  });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});
after(async () => { await server?.close(); });

function setup(names = ['alice', 'bob', 'cara']) {
  const db = createPlayerHarness();
  const players = Object.fromEntries(names.map(name => [name, db.auth(name)]));
  for (const [name, auth] of Object.entries(players)) {
    db.ensure(auth);
    db.setUsername(auth, name[0].toUpperCase() + name.slice(1));
  }
  return { db, ...players };
}

test('guild membership and invite codes are private; only guild facts are public', () => {
  const { db } = setup([]);
  assert.deepEqual(db.guildTableVisibility, { guild: 'Public', membership: 'Private', invite: 'Private' });
});

test('founding a guild makes the founder its leader and lists it in the directory without secrets', () => {
  const { db, alice, bob } = setup();
  db.awardXp(alice, 350);
  db.createGuild(alice, '  The  Wandering   Owls ', { motto: 'We see the trail at night.', crest: 'dusk' });
  const mine = db.myGuild(alice);
  assert.equal(mine.name, 'The Wandering Owls');
  assert.equal(mine.role, 'Leader');
  assert.match(mine.joinCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(mine.memberCount, 1);
  assert.equal(mine.totalXp, 350n);
  const [listing] = db.guildDirectory();
  assert.equal(listing.name, 'The Wandering Owls');
  assert.equal(listing.memberCount, 1);
  assert.ok(!('joinCode' in listing));
  assert.equal(db.myGuild(bob), undefined);
  assert.deepEqual(db.guildMembers(bob), []);
});

test('guild names are validated and unique regardless of capitalisation', () => {
  const { db, alice, bob } = setup();
  assert.throws(() => db.createGuild(alice, 'X'), /3 to 32/);
  assert.throws(() => db.createGuild(alice, 'Owls <script>'), /3 to 32/);
  assert.throws(() => db.createGuild(alice, 'Night Owls', { crest: 'rainbow' }), /crests/);
  assert.throws(() => db.createGuild(alice, 'Night Owls', { motto: 'x'.repeat(101) }), /100 characters/);
  db.createGuild(alice, 'Night Owls');
  assert.throws(() => db.createGuild(bob, 'night owls'), /already taken/);
  assert.throws(() => db.createGuild(alice, 'Second Guild'), /Leave your current guild/);
});

test('players join open guilds from the directory and any guild with its invite code', () => {
  const { db, alice, bob, cara } = setup();
  db.createGuild(alice, 'Open Trails', { isOpen: true });
  const { guildId } = db.myGuild(alice);
  db.joinOpenGuild(bob, guildId);
  assert.equal(db.myGuild(bob).role, 'Member');
  assert.throws(() => db.joinOpenGuild(bob, guildId), /Leave your current guild/);

  db.setGuildOpen(alice, false);
  assert.throws(() => db.joinOpenGuild(cara, guildId), /invite-only/);
  assert.throws(() => db.joinGuildByCode(cara, 'ZZZZZZ'), /No guild uses that invite code/);
  const code = db.myGuild(bob).joinCode;
  db.joinGuildByCode(cara, ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `);
  assert.equal(db.myGuild(cara).name, 'Open Trails');
  assert.equal(db.guildDirectory()[0].memberCount, 3);
  assert.throws(() => db.setGuildOpen(bob, true), /Only the guild leader/);
});

test('members see each other by username, level and role, and nothing about other guilds', () => {
  const { db, alice, bob, cara } = setup();
  db.awardXp(bob, 750);
  db.createGuild(alice, 'Owl Watch');
  db.joinOpenGuild(bob, db.myGuild(alice).guildId);
  db.createGuild(cara, 'Fox Den');
  const members = db.guildMembers(bob).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(members.map(member => [member.name, member.role, member.level, member.isYou]), [
    ['Alice', 'Leader', 1, false],
    ['Bob', 'Member', 3, true],
  ]);
  assert.ok(members.every(member => !('playerIdentity' in member)));
  assert.equal(db.myGuild(alice).totalXp, 750n);
  assert.deepEqual(db.guildMembers(cara).map(member => member.name), ['Cara']);
});

test('a leader leaving hands over to the longest-serving member, and the last member disbands the guild', () => {
  const { db, alice, bob, cara } = setup();
  db.createGuild(alice, 'Owl Watch');
  const { guildId } = db.myGuild(alice);
  db.advanceClock(1_000_000n);
  db.joinOpenGuild(bob, guildId);
  db.advanceClock(1_000_000n);
  db.joinOpenGuild(cara, guildId);
  db.leaveGuild(alice);
  assert.equal(db.myGuild(alice), undefined);
  assert.equal(db.myGuild(bob).role, 'Leader');
  assert.equal(db.myGuild(cara).role, 'Member');
  db.leaveGuild(bob);
  db.leaveGuild(cara);
  assert.deepEqual(db.guildDirectory(), []);
  assert.throws(() => db.leaveGuild(cara), /not in a guild/);
  db.createGuild(cara, 'owl watch');
  assert.equal(db.myGuild(cara).name, 'owl watch');
});

test('guilds are capped at twenty members', () => {
  const names = Array.from({ length: 21 }, (_, index) => `player${index}`);
  const { db, ...players } = setup(names);
  db.createGuild(players.player0, 'Big Party');
  const { guildId } = db.myGuild(players.player0);
  for (const name of names.slice(1, 20)) db.joinOpenGuild(players[name], guildId);
  assert.equal(db.myGuild(players.player0).memberCount, 20);
  assert.throws(() => db.joinOpenGuild(players.player20, guildId), /full/);
});

test('guild actions require Quest sign-in and a player profile', () => {
  const { db, alice } = setup();
  assert.throws(() => db.createGuild(db.internal(), 'Ghosts'), /Sign in/);
  db.createGuild(alice, 'Owl Watch');
  const stranger = db.auth('stranger');
  assert.throws(() => db.joinOpenGuild(stranger, db.myGuild(alice).guildId), /player profile/);
});
