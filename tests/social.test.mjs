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

function setup(names = ['alice', 'bob', 'cara', 'dan', 'eve']) {
  const db = createPlayerHarness();
  db.seedTemplates();
  const players = Object.fromEntries(names.map(name => [name, db.auth(name)]));
  for (const [name, auth] of Object.entries(players)) {
    db.ensure(auth);
    db.setUsername(auth, name[0].toUpperCase() + name.slice(1));
  }
  return { db, s: db.social, ...players };
}

function befriend(s, from, to, toName) {
  s.sendFriendRequest(from, toName);
  const [request] = s.requests(to).filter(row => row.incoming);
  s.respondFriendRequest(to, request.requestId, true);
}

test('friend and party tables are all private', () => {
  const { s } = setup([]);
  assert.deepEqual(s.visibility, ['Private', 'Private', 'Private', 'Private', 'Private']);
});

test('friend requests go by username and can be accepted, declined or answered by asking back', () => {
  const { s, alice, bob, cara } = setup();
  assert.throws(() => s.sendFriendRequest(alice, 'nobody'), /No adventurer/);
  assert.throws(() => s.sendFriendRequest(alice, 'alice'), /yourself/);
  s.sendFriendRequest(alice, 'BOB');
  assert.throws(() => s.sendFriendRequest(alice, 'bob'), /already sent/);
  assert.deepEqual(s.requests(alice).map(row => [row.username, row.incoming]), [['Bob', false]]);
  assert.deepEqual(s.requests(bob).map(row => [row.username, row.incoming]), [['Alice', true]]);
  assert.deepEqual(s.requests(cara), []);
  assert.throws(() => s.respondFriendRequest(cara, s.requests(bob)[0].requestId, true), /no longer available/);
  s.respondFriendRequest(bob, s.requests(bob)[0].requestId, true);
  assert.deepEqual(s.friends(alice).map(row => row.username), ['Bob']);
  assert.deepEqual(s.friends(bob).map(row => row.username), ['Alice']);
  assert.throws(() => s.sendFriendRequest(bob, 'alice'), /already friends/);

  s.sendFriendRequest(cara, 'alice');
  s.respondFriendRequest(alice, s.requests(alice)[0].requestId, false);
  assert.equal(s.friends(cara).length, 0);
  s.sendFriendRequest(cara, 'bob');
  s.sendFriendRequest(bob, 'cara');
  assert.deepEqual(s.friends(cara).map(row => row.username), ['Bob'], 'asking back accepts');
  s.removeFriend(cara, 'bob');
  assert.deepEqual(s.friends(bob).map(row => row.username), ['Alice']);
});

test('players without a username cannot use friends', () => {
  const db = createPlayerHarness();
  const nameless = db.auth('nameless');
  db.ensure(nameless);
  assert.throws(() => db.social.sendFriendRequest(nameless, 'anyone'), /Choose a username/);
});

test('parties invite friends only, hold four, hand over leadership and disband when empty', () => {
  const { db, s, alice, bob, cara, dan, eve } = setup();
  for (const [auth, name] of [[bob, 'bob'], [cara, 'cara'], [dan, 'dan'], [eve, 'eve']]) befriend(s, alice, auth, name);
  const stranger = db.auth('stranger');
  db.ensure(stranger);
  db.setUsername(stranger, 'Stranger');
  assert.throws(() => s.inviteToParty(alice, 'stranger'), /only invite friends/);
  s.inviteToParty(alice, 'bob');
  assert.equal(s.party(alice).isLeader, true, 'inviting creates a party');
  assert.throws(() => s.inviteToParty(alice, 'bob'), /already has an invite/);
  assert.deepEqual(s.invites(bob).map(row => [row.fromName, row.partySize]), [['Alice', 1]]);
  s.respondPartyInvite(bob, s.invites(bob)[0].inviteId, true);
  s.inviteToParty(alice, 'cara');
  s.respondPartyInvite(cara, s.invites(cara)[0].inviteId, true);
  s.inviteToParty(alice, 'dan');
  s.inviteToParty(alice, 'eve');
  s.respondPartyInvite(dan, s.invites(dan)[0].inviteId, true);
  assert.throws(() => s.respondPartyInvite(eve, s.invites(eve)[0].inviteId, true), /full/);
  assert.deepEqual(s.partyMembers(bob).map(row => row.username).sort(), ['Alice', 'Bob', 'Cara', 'Dan']);
  assert.ok(s.friends(alice).find(row => row.username === 'Bob').inYourParty);
  assert.equal(s.party(eve), undefined);

  db.advanceClock(1_000_000n);
  s.leaveParty(alice);
  assert.equal(s.party(alice), undefined);
  assert.equal(s.partyMembers(bob).find(row => row.isLeader).username, 'Bob');
  s.leaveParty(bob);
  s.leaveParty(cara);
  s.leaveParty(dan);
  assert.equal(s.party(dan), undefined);
  assert.throws(() => s.leaveParty(dan), /not in a party/);
});

test('the leader picks a party quest from their board and every member earns the XP plus the party bonus', () => {
  const { db, s, alice, bob, cara } = setup(['alice', 'bob', 'cara']);
  befriend(s, alice, bob, 'bob');
  s.inviteToParty(alice, 'bob');
  s.respondPartyInvite(bob, s.invites(bob)[0].inviteId, true);
  db.putSlotFixture(alice, 'easy-birdwatch', 0);
  assert.throws(() => s.setPartyQuest(bob, 'easy-birdwatch'), /Only the party leader/);
  assert.throws(() => s.setPartyQuest(alice, 'hard-freshly-baked'), /available on your Questboard/);
  assert.throws(() => s.beginPartyPhoto(bob), /no quest yet/);
  s.setPartyQuest(alice, 'easy-birdwatch');
  const card = s.party(bob);
  assert.equal(card.questTitle, 'A Feathered Encounter');
  assert.equal(card.questXpEach, 62, '50 XP plus a 25% party bonus');
  assert.equal(s.beginPartyPhoto(bob).templateId, 'easy-birdwatch');
  assert.throws(() => s.beginPartyPhoto(cara), /Join a party/);

  s.finishPartyQuest(bob, 'easy-birdwatch', 'A grackle on a fence');
  for (const auth of [alice, bob]) assert.equal(db.storedPlayer(auth).bestiaryXp, 62);
  assert.equal(db.storedPlayer(cara).bestiaryXp, 0);
  const done = s.party(alice);
  assert.equal(done.questTitle, undefined, 'the quest is cleared once claimed');
  assert.deepEqual([done.lastQuestTitle, done.lastCompletedBy, done.lastObservation, done.lastXpEach], ['A Feathered Encounter', 'Bob', 'A grackle on a fence', 62]);
  assert.throws(() => s.finishPartyQuest(alice, 'easy-birdwatch', 'again'), /changed/);
  assert.equal(db.storedPlayer(alice).bestiaryXp, 62, 'paid once');
});
