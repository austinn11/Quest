import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

let server;
let createPlayerHarness;

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [spacetimedbModuleTestPlugin()],
    ssr: { noExternal: ['spacetimedb'] },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    logLevel: 'error',
  });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});

after(async () => { await server?.close(); });

const questInput = (changes = {}) => ({
  title: 'A personal adventure',
  description: 'Complete a challenge in your own neighborhood.',
  category: { tag: 'Exploration' },
  difficulty: { tag: 'Easy' },
  location: undefined,
  ...changes,
});

function setup() {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.ensure(alice);
  db.ensure(bob);
  db.seedQuests();
  return { db, alice, bob };
}

test('fixed sample quests seed idempotently without changing definitions or progress', () => {
  const { db, alice } = setup();
  const original = db.catalog(alice);
  assert.equal(original.length, 3);
  assert.deepEqual(new Set(original.map(q => q.difficulty.tag)), new Set(['Easy', 'Medium', 'Hard']));
  assert.deepEqual(new Set(original.map(q => q.category.tag)), new Set(['Exploration', 'Bestiary', 'Crafting']));
  db.acceptQuest(alice, original[0].id);
  db.advanceClock(1000000n);
  db.seedQuests();
  db.connect(alice);
  assert.equal(db.questCount(), 3);
  assert.deepEqual(db.catalog(alice), original);
  assert.equal(db.progressCount(), 1);
});

test('two players independently accept the same shared quest without cloning or changing it', () => {
  const { db, alice, bob } = setup();
  const quest = db.catalog(alice)[0];
  assert.deepEqual(db.progress(alice), []);
  db.acceptQuest(alice, quest.id);
  assert.deepEqual(db.progress(bob), []);
  db.acceptQuest(bob, quest.id);
  const aliceProgress = db.progress(alice)[0];
  const bobProgress = db.progress(bob)[0];
  assert.equal(aliceProgress.questId, quest.id);
  assert.equal(bobProgress.questId, quest.id);
  assert.notEqual(aliceProgress.id, bobProgress.id);
  assert.notEqual(aliceProgress.playerIdentity.toHexString(), bobProgress.playerIdentity.toHexString());
  assert.equal(aliceProgress.status.tag, 'Active');
  assert.equal(bobProgress.status.tag, 'Active');
  assert.equal(aliceProgress.completedAt, undefined);
  assert.equal(aliceProgress.xpReward, quest.xpReward);
  assert.equal(db.progressCount(), 2);
  assert.equal(db.questCount(), 3);
  assert.deepEqual(db.catalog(bob).find(q => q.id === quest.id), quest);
  assert.equal(db.profile(alice).xp, 0);
  assert.equal(db.profile(bob).xp, 0);
});

test('repeated acceptance is idempotent and remains private across new connections', () => {
  const { db, alice, bob } = setup();
  const questId = db.catalog(alice)[0].id;
  db.acceptQuest(alice, questId);
  const original = db.progress(alice)[0];
  db.advanceClock(1000000n);
  db.acceptQuest(db.auth('alice'), questId);
  assert.deepEqual(db.progress(db.auth('alice')), [original]);
  assert.deepEqual(db.progress(bob), []);
  assert.equal(db.progressCount(), 1);
});

test('one player changing status does not change another player or allow completed reacceptance', () => {
  const { db, alice, bob } = setup();
  const questId = db.catalog(alice)[0].id;
  db.acceptQuest(alice, questId);
  db.acceptQuest(bob, questId);
  const originalBob = db.progress(bob)[0];
  // Exercise the reserved completed state without implementing XP awards in F05.
  db.markCompletedForTest(alice, questId);
  assert.equal(db.progress(alice)[0].status.tag, 'Completed');
  assert.deepEqual(db.progress(bob), [originalBob]);
  assert.throws(() => db.acceptQuest(alice, questId), /already completed/);
  assert.equal(db.progressCount(), 2);
});

test('personal quest definitions and progress are visible only to their owner', () => {
  const { db, alice, bob } = setup();
  db.createQuest(alice, questInput());
  const personal = db.catalog(alice).find(q => q.scope.tag === 'Personal');
  assert.ok(personal);
  assert.equal(db.catalog(bob).some(q => q.id === personal.id), false);
  assert.throws(() => db.acceptQuest(bob, personal.id), /This quest is not available/);
  assert.throws(() => db.acceptQuest(bob, 'missing-quest'), /This quest is not available/);
  db.acceptQuest(alice, personal.id);
  assert.equal(db.progress(alice)[0].questId, personal.id);
  assert.deepEqual(db.progress(bob), []);
  assert.equal(db.questVisibility, 'Private');
  assert.equal(db.progressVisibility, 'Private');
});

test('creation trims input, generates unique IDs, and assigns identity, scope, and rewards on the server', () => {
  const { db, alice } = setup();
  for (const [difficulty, expected] of [['Easy', 50], ['Medium', 100], ['Hard', 200]]) {
    db.createQuest(alice, questInput({ title: `  ${difficulty} quest  `, difficulty: { tag: difficulty }, xpReward: 999999, scope: { tag: 'Shared' } }));
    const quest = db.catalog(alice).find(q => q.title === `${difficulty} quest`);
    assert.equal(quest.xpReward, expected);
    assert.equal(quest.scope.tag, 'Personal');
    assert.equal(quest.creatorIdentity.toHexString(), db.profile(alice).identity.toHexString());
  }
  assert.equal(new Set(db.catalog(alice).map(q => q.id)).size, 6);
});

test('valid quest locations are normalized and coordinate boundaries are accepted', () => {
  const { db, alice } = setup();
  db.createQuest(alice, questInput({ location: { name: '  The North  ', latitude: 90, longitude: -180 } }));
  const personal = db.catalog(alice).find(q => q.scope.tag === 'Personal');
  assert.deepEqual(personal.location, { name: 'The North', latitude: 90, longitude: -180 });
});

test('invalid quest metadata and locations are rejected atomically', () => {
  const { db, alice } = setup();
  const invalid = [
    { title: '  ' }, { title: 'x'.repeat(101) },
    { description: 'short' }, { description: 'x'.repeat(2001) },
    { category: { tag: 'Invalid' } }, { difficulty: { tag: 'Invalid' } },
    { location: { name: '', latitude: 0, longitude: 0 } },
    { location: { name: 'x'.repeat(121), latitude: 0, longitude: 0 } },
    { location: { name: 'Test', latitude: 91, longitude: 0 } },
    { location: { name: 'Test', latitude: -91, longitude: 0 } },
    { location: { name: 'Test', latitude: NaN, longitude: 0 } },
    { location: { name: 'Test', latitude: 0, longitude: Infinity } },
    { location: { name: 'Test', latitude: 0, longitude: -181 } },
  ];
  for (const changes of invalid) {
    assert.throws(() => db.createQuest(alice, questInput(changes)));
    assert.equal(db.questCount(), 3);
  }
});

test('quest writes require a Quest-authenticated existing player', () => {
  const { db } = setup();
  const missing = db.auth('not-initialized');
  const wrongClient = db.auth('alice', 'another-client');
  for (const auth of [missing, wrongClient]) {
    assert.throws(() => db.createQuest(auth, questInput()), /profile is still loading|Sign in to Quest/);
    assert.throws(() => db.acceptQuest(auth, 'sample-campus-explorer'), /profile is still loading|Sign in to Quest/);
  }
  assert.equal(db.questCount(), 3);
  assert.equal(db.progressCount(), 0);
});

test('accepting another quest changes only the caller\'s participation records', () => {
  const { db, alice, bob } = setup();
  const quests = db.catalog(alice);
  db.acceptQuest(alice, quests[0].id);
  db.acceptQuest(bob, quests[0].id);
  const beforeBob = db.progress(bob);
  db.acceptQuest(alice, quests[1].id);
  assert.equal(db.progress(alice).length, 2);
  assert.deepEqual(db.progress(bob), beforeBob);
  assert.equal(db.progressCount(), 3);
});
