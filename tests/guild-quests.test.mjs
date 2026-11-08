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

const DAY = 24n * 60n * 60n * 1_000_000n;
// One catalogue quest per category at Easy, so completions can be steered by category.
const EASY = { Bestiary: 'easy-birdwatch', Exploration: 'easy-new-path', Crafting: 'easy-paper-charm' };

function setup(names = ['alice', 'bob', 'cara']) {
  const db = createPlayerHarness();
  db.seedTemplates();
  const players = Object.fromEntries(names.map(name => [name, db.auth(name)]));
  for (const auth of Object.values(players)) db.ensure(auth);
  return { db, ...players };
}

// Complete one Easy quest of the given category for a player (no AI key: plain completion).
function completeCategory(db, auth, category) {
  db.putSlotFixture(auth, EASY[category], 0);
  db.complete(auth, 0);
  db.advanceClock(1_000_000n);
}

const questOf = (db, auth, kind) => db.guildQuests(auth).find(quest => quest.kind === kind);

test('guild quests and contributions are private, and a new guild gets three different quests', () => {
  const { db, alice, bob } = setup();
  assert.deepEqual(db.guildQuestVisibility, { quest: 'Private', contribution: 'Private' });
  db.createGuild(alice, 'Owl Watch');
  const quests = db.guildQuests(alice);
  assert.equal(quests.length, 3);
  assert.equal(new Set(quests.map(quest => quest.kind)).size, 3);
  for (const quest of quests) {
    assert.equal(quest.progress, 0);
    assert.equal(quest.endsAt.microsSinceUnixEpoch - quest.startedAt.microsSinceUnixEpoch, 7n * DAY);
    assert.ok(quest.target > 0 && quest.rewardXp > 0);
  }
  assert.deepEqual(db.guildQuests(bob), []);
  assert.throws(() => db.refreshGuildQuests(bob), /Join a guild/);
});

test('members advance matching guild quests together; outsiders and other guilds do not', () => {
  const { db, alice, bob, cara } = setup();
  db.createGuild(alice, 'Owl Watch');
  db.joinOpenGuild(bob, db.myGuild(alice).guildId);
  db.createGuild(cara, 'Fox Den');
  const kinds = db.guildQuests(alice).map(quest => quest.kind).filter(kind => kind !== 'Experience');
  const kind = kinds[0];
  completeCategory(db, alice, kind);
  completeCategory(db, bob, kind);
  completeCategory(db, cara, kind);
  const quest = questOf(db, alice, kind);
  assert.equal(quest.progress, 2, 'only Owl Watch members count');
  assert.equal(quest.contributors, 2);
  assert.equal(quest.yourContribution, 1);
  assert.equal(questOf(db, bob, kind).yourContribution, 1);
  for (const other of db.guildQuests(cara)) assert.ok(other.progress <= 1);
});

test('reaching a target completes the guild quest and pays each contributor exactly once', () => {
  const { db, alice, bob } = setup();
  db.createGuild(alice, 'Owl Watch');
  db.joinOpenGuild(bob, db.myGuild(alice).guildId);
  const kind = db.guildQuests(alice).map(quest => quest.kind).find(kind => kind !== 'Experience');
  const { target, rewardXp } = questOf(db, alice, kind);
  assert.equal(target, kind === 'Crafting' ? 2 : 3, 'targets were set while the guild had one member');
  completeCategory(db, bob, kind);
  for (let done = 1; done < target; done++) completeCategory(db, alice, kind);
  const finished = questOf(db, alice, kind);
  assert.equal(finished.progress, target);
  assert.ok(finished.completedAt);
  const xpAfter = { alice: db.profile(alice).xp, bob: db.profile(bob).xp };
  // Bob earned one quest reward plus the guild reward; Alice earned target-1 quest rewards plus the guild reward.
  assert.equal(xpAfter.bob, 50 + rewardXp + (kind !== 'Experience' && questOf(db, bob, 'Experience')?.completedAt ? 150 : 0));
  completeCategory(db, alice, kind);
  assert.equal(questOf(db, alice, kind).progress, target, 'completed quests stop counting');
  assert.equal(db.profile(bob).xp, xpAfter.bob, 'the reward is not paid twice');
});

test('the Experience quest counts awarded XP', () => {
  const { db, alice } = setup(['alice']);
  db.createGuild(alice, 'Owl Watch');
  // Rotate until the board includes the Experience quest.
  for (let cycle = 0; cycle < 20 && !questOf(db, alice, 'Experience'); cycle++) {
    db.advanceClock(8n * DAY);
    db.refreshGuildQuests(alice);
  }
  const before = questOf(db, alice, 'Experience');
  assert.ok(before, 'an Experience quest appears within a few cycles');
  completeCategory(db, alice, 'Crafting');
  assert.equal(questOf(db, alice, 'Experience').progress, before.progress + 50);
});

test('a new cycle replaces expired quests; current ones and their progress stay', () => {
  const { db, alice } = setup(['alice']);
  db.createGuild(alice, 'Owl Watch');
  const first = db.guildQuests(alice).map(quest => quest.guildQuestId);
  db.advanceClock(3n * DAY);
  db.refreshGuildQuests(alice);
  assert.deepEqual(db.guildQuests(alice).map(quest => quest.guildQuestId), first);
  db.advanceClock(5n * DAY);
  const kind = db.guildQuests(alice)[0].kind;
  if (kind !== 'Experience') completeCategory(db, alice, kind);
  assert.ok(db.guildQuests(alice).every(quest => quest.progress === 0 || quest.kind === 'Experience'), 'expired quests stop counting');
  db.refreshGuildQuests(alice);
  const second = db.guildQuests(alice);
  assert.equal(second.length, 3);
  assert.ok(second.every(quest => !first.includes(quest.guildQuestId)));
});

test('disbanding a guild removes its quests', () => {
  const { db, alice, bob } = setup();
  db.createGuild(alice, 'Owl Watch');
  db.leaveGuild(alice);
  db.createGuild(bob, 'Owl Watch');
  assert.equal(db.guildQuests(bob).length, 3);
  assert.deepEqual(db.guildQuests(alice), []);
});
