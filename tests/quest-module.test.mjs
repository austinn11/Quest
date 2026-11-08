import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { Timestamp } from 'spacetimedb';
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

function setup() {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.ensure(alice);
  db.ensure(bob);
  db.seedTemplates();
  return { db, alice, bob };
}

function templatesByDifficulty(db, difficulty) {
  return db.templates().filter(template => template.difficulty.tag === difficulty);
}

function sixSlotFixtures(db, auth) {
  const used = { Easy: 0, Medium: 0, Hard: 0 };
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    const difficulty = db.model.slotDifficulty(slotIndex);
    const template = templatesByDifficulty(db, difficulty)[used[difficulty]++];
    db.putSlotFixture(auth, template.templateId, slotIndex);
  }
}

test('catalogue seeds fifteen valid templates with five choices per difficulty', () => {
  const { db } = setup();
  const templates = db.templates();
  assert.equal(templates.length, 15);
  assert.equal(new Set(templates.map(template => template.templateId)).size, 15);
  for (const difficulty of ['Easy', 'Medium', 'Hard']) assert.equal(templatesByDifficulty(db, difficulty).length, 5);
  assert.deepEqual(new Set(templates.map(template => template.category.tag)), new Set(['Exploration', 'Bestiary', 'Crafting']));
  for (const template of templates) {
    assert.equal(db.model.validateTemplate(template), null);
    assert.equal(template.isActive, true);
  }
});

test('repeated seeding preserves existing template activation and does not generate quests or XP', () => {
  const { db, alice, bob } = setup();
  const id = db.templates()[0].templateId;
  db.setTemplateActiveForTest(id, false);
  const before = db.templates();
  db.seedTemplates();
  db.connect(alice);
  assert.deepEqual(db.templates(), before);
  assert.deepEqual(db.slots(alice), []);
  assert.deepEqual(db.slots(bob), []);
  assert.deepEqual(db.completions(alice), []);
  assert.equal(db.profile(alice).xp, 0);
});

test('fixed slot layout is three Easy, two Medium, and one Hard with no extra positions', () => {
  const { db } = setup();
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => db.model.slotDifficulty(index)), ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard']);
  for (const index of [-1, 6, 100, 1.5, NaN]) assert.equal(db.model.slotDifficulty(index), undefined);
});

test('two players can represent six independent slots using the same reusable templates', () => {
  const { db, alice, bob } = setup();
  sixSlotFixtures(db, alice);
  sixSlotFixtures(db, bob);
  const aliceSlots = db.slots(alice).sort((a, b) => a.slotIndex - b.slotIndex);
  const bobSlots = db.slots(bob).sort((a, b) => a.slotIndex - b.slotIndex);
  assert.equal(aliceSlots.length, 6);
  assert.equal(bobSlots.length, 6);
  assert.deepEqual(aliceSlots.map(slot => slot.difficulty.tag), ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard']);
  assert.deepEqual(aliceSlots.map(slot => slot.templateId), bobSlots.map(slot => slot.templateId));
  assert.equal(new Set([...aliceSlots, ...bobSlots].map(slot => slot.slotId)).size, 12);
  assert.ok(aliceSlots.every(slot => slot.playerIdentity.equals(db.profile(alice).identity)));
  assert.deepEqual(db.slots(db.auth('alice')), aliceSlots);
  assert.deepEqual(db.slots(db.auth('charlie')), []);
  assert.equal(db.templates().length, 15);
});

test('slot primary key keeps a single record per player and slot position', () => {
  const { db, alice } = setup();
  const [first, second] = templatesByDifficulty(db, 'Easy');
  db.putSlotFixture(alice, first.templateId, 0);
  db.putSlotFixture(alice, second.templateId, 0);
  assert.equal(db.slots(alice).length, 1);
  assert.equal(db.slots(alice)[0].templateId, second.templateId);
});

test('slot validation rejects mismatched owners, positions, difficulties, and templates', () => {
  const { db, alice, bob } = setup();
  const template = templatesByDifficulty(db, 'Easy')[0];
  db.putSlotFixture(alice, template.templateId, 0);
  const slot = db.slots(alice)[0];
  const invalid = [
    { slotIndex: 6 }, { slotIndex: -1 }, { slotIndex: 0.5 },
    { slotId: 'forged-slot' }, { playerIdentity: db.profile(bob).identity },
    { difficulty: { tag: 'Hard' } }, { templateId: 'another-template' },
    { assignedAt: new Timestamp(1n) }, { status: { tag: 'Active' } },
  ];
  for (const changes of invalid) assert.ok(db.model.validateSlot({ ...slot, ...changes }, template, db.now()));
  assert.ok(db.model.validateSlot(slot, { ...template, isActive: false }, db.now()));
});

test('Available and Cooldown states validate timestamps without applying cooldown durations', () => {
  const { db, alice } = setup();
  const template = templatesByDifficulty(db, 'Easy')[0];
  db.putSlotFixture(alice, template.templateId, 0);
  const slot = db.slots(alice)[0];
  assert.ok(db.model.validateSlot({ ...slot, completedAt: new Timestamp(0n) }, template, db.now()));
  assert.ok(db.model.validateSlot({ ...slot, refreshAt: new Timestamp(10n) }, template, db.now()));
  assert.ok(db.model.validateSlot({ ...slot, status: { tag: 'Cooldown' } }, template, db.now()));
  db.advanceClock(10n);
  const cooldown = { ...slot, status: { tag: 'Cooldown' }, completedAt: new Timestamp(5n), refreshAt: new Timestamp(15n) };
  assert.equal(db.model.validateSlot(cooldown, template, db.now()), null);
  assert.ok(db.model.validateSlot({ ...cooldown, refreshAt: new Timestamp(5n) }, template, db.now()));
  assert.ok(db.model.validateSlot({ ...cooldown, completedAt: new Timestamp(11n) }, template, db.now()));
});

test('completion history survives slot replacement and stays private to its owner', () => {
  const { db, alice, bob } = setup();
  const [first, second] = templatesByDifficulty(db, 'Easy');
  db.putSlotFixture(alice, first.templateId, 0, { status: { tag: 'Cooldown' }, completedAt: db.now(), refreshAt: new Timestamp(10n) });
  const original = db.appendCompletionFixture(alice, 0);
  db.advanceClock(20n);
  db.putSlotFixture(alice, second.templateId, 0);
  assert.equal(db.slots(alice)[0].templateId, second.templateId);
  assert.deepEqual(db.completions(db.auth('alice')), [original]);
  assert.deepEqual(db.completions(bob), []);
  assert.equal(db.profile(alice).xp, 0); // F05 fixtures store history; no gameplay award reducer exists.
});

test('history permits separate completions of the same template on later assignments', () => {
  const { db, alice } = setup();
  const template = templatesByDifficulty(db, 'Easy')[0];
  db.putSlotFixture(alice, template.templateId, 0, { status: { tag: 'Cooldown' }, completedAt: db.now(), refreshAt: new Timestamp(10n) });
  const first = db.appendCompletionFixture(alice, 0);
  db.advanceClock(20n);
  db.putSlotFixture(alice, template.templateId, 0, { status: { tag: 'Cooldown' }, completedAt: db.now(), refreshAt: new Timestamp(30n) });
  const second = db.appendCompletionFixture(alice, 0);
  assert.notEqual(first.completionId, second.completionId);
  assert.equal(db.completions(alice).length, 2);
  assert.notEqual(first.completedAt.microsSinceUnixEpoch, second.completedAt.microsSinceUnixEpoch);
});

test('completion validation rejects forged owners, templates, rewards, and completion times', () => {
  const { db, alice, bob } = setup();
  const template = templatesByDifficulty(db, 'Easy')[0];
  db.putSlotFixture(alice, template.templateId, 0, { status: { tag: 'Cooldown' }, completedAt: db.now(), refreshAt: new Timestamp(10n) });
  const completion = db.appendCompletionFixture(alice, 0);
  const slot = db.slots(alice)[0];
  for (const changes of [{ playerIdentity: db.profile(bob).identity }, { slotIndex: 5 }, { templateId: 'other-template' }, { xpAwarded: 99999 }, { completedAt: new Timestamp(1n) }]) {
    assert.ok(db.model.validateNewCompletion({ ...completion, ...changes }, slot, template));
  }
});

test('template validation rejects malformed content, invalid enums, forged rewards, and unpaired coordinates', () => {
  const { db } = setup();
  const template = db.templates()[0];
  const invalid = [
    { templateId: '' }, { title: '  ' }, { title: 'x'.repeat(101) },
    { description: 'short' }, { description: 'x'.repeat(2001) },
    { category: { tag: 'Knowledge' } }, { difficulty: { tag: 'Epic' } }, { xpReward: 99999 },
    { latitude: 1, longitude: undefined }, { latitude: undefined, longitude: 1 },
    { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 },
  ];
  for (const changes of invalid) assert.ok(db.model.validateTemplate({ ...template, ...changes }));
  assert.equal(db.model.validateTemplate({ ...template, latitude: 90, longitude: -180 }), null);
});

test('only non-personal templates are public and no quest mutation APIs exist in F05', () => {
  const { db } = setup();
  assert.equal(db.templateVisibility, 'Public');
  assert.equal(db.slotVisibility, 'Private');
  assert.equal(db.completionVisibility, 'Private');
  for (const name of ['createQuest', 'acceptQuest', 'completeQuest', 'generateQuests', 'refreshQuest']) assert.equal(db.moduleExports.includes(name), false);
  assert.ok(db.templates().every(template => !('playerIdentity' in template) && !('creatorIdentity' in template)));
});
