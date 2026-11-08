import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';
import { getTotalPlayerXp, totalXpForLevel } from '../shared/progression.ts';

let server, createPlayerHarness;
before(async () => {
  server = await createServer({ configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});
after(async () => { await server?.close(); });

function setup(env) {
  const db = createPlayerHarness(42n, env);
  const alice = db.auth('alice'), bob = db.auth('bob');
  db.seedTemplates(); db.ensure(alice); db.ensure(bob);
  return { db, alice, bob };
}
const skillValues = player => ({ explorationXp: player.explorationXp, bestiaryXp: player.bestiaryXp, craftingXp: player.craftingXp });

test('new players start at zero and each category awards only its own skill through the same completion transaction', () => {
  const { db, alice, bob } = setup();
  assert.deepEqual(skillValues(db.profile(alice)), { explorationXp: 0, bestiaryXp: 0, craftingXp: 0 });
  assert.equal(db.profile(alice).level, 1);
  for (const [index, template, key] of [[0, 'easy-new-path', 'explorationXp'], [1, 'easy-birdwatch', 'bestiaryXp'], [2, 'easy-paper-charm', 'craftingXp']]) {
    const before = skillValues(db.profile(alice));
    db.putSlotFixture(alice, template, index);
    db.complete(alice, index);
    const profile = db.profile(alice);
    assert.deepEqual(skillValues(profile), { ...before, [key]: before[key] + 50 });
    assert.equal(profile.xp, getTotalPlayerXp(profile));
    assert.equal(db.slots(alice).find(slot => slot.slotIndex === index).status.tag, 'Cooldown');
    assert.throws(() => db.complete(db.auth('alice'), index), /already completed|cooldown/);
    assert.deepEqual(db.profile(alice), profile);
  }
  assert.equal(db.completions(alice).length, 3);
  assert.equal(db.storedPlayer(alice).xp, 0, 'legacy total is not independently rewarded');
  assert.equal(db.profile(bob).xp, 0);
  const saved = db.profile(alice);
  db.ensure(db.auth('alice'));
  assert.deepEqual(db.profile(db.auth('alice')), saved);
  db.advanceClock(13n * 3600n * 1000000n); db.refresh(alice);
  assert.ok(db.slots(alice).every(slot => slot.status.tag === 'Available'));
  assert.deepEqual(db.profile(alice), saved);
});

test('photo completion awards its authoritative category and a bad capture rolls back skill XP as well as history', () => {
  const { db, alice } = setup({ AI_API_KEY: 'test-key' });
  db.putSlotFixture(alice, 'easy-birdwatch', 0);
  const assigned = db.slots(alice)[0].assignedAt;
  assert.throws(() => db.finishPhoto(alice, 0, 'A bird', assigned, { photo: 'invalid', creature: 'Grackle', verified: true }));
  assert.equal(db.profile(alice).bestiaryXp, 0);
  assert.equal(db.completions(alice).length, 0);
  db.finishPhoto(alice, 0, 'A bird', assigned);
  assert.equal(db.profile(alice).bestiaryXp, 50);
  assert.equal(db.profile(alice).xp, 50);
});

test('legacy XP is attributed from actual historical rewards once, preserving profiles and all quest state', () => {
  const { db, alice } = setup();
  for (const [index, template] of [[0, 'easy-new-path'], [1, 'easy-birdwatch'], [2, 'easy-paper-charm']]) { db.putSlotFixture(alice, template, index); db.complete(alice, index); }
  db.setUsername(alice, 'ReturningHero');
  const before = { profile: db.profile(alice), slots: db.slots(alice), history: db.completions(alice) };
  db.patchPlayerForTest(alice, { xp: 150, explorationXp: 0, bestiaryXp: 0, craftingXp: 0, progressionReady: false });
  db.patchTemplateForTest('easy-birdwatch', { xpReward: 100 }); // migration uses earned XP, not the template's current reward
  db.ensure(alice);
  assert.deepEqual(db.profile(alice), before.profile);
  assert.deepEqual(db.slots(alice), before.slots);
  assert.deepEqual(db.completions(alice), before.history);
  assert.equal(db.storedPlayer(alice).xp, 150);
  db.ensure(db.auth('alice'));
  assert.deepEqual(db.profile(alice), before.profile);
});

test('unattributable legacy XP is preserved and reported, never assigned to an arbitrary skill', () => {
  const { db, alice } = setup();
  db.patchPlayerForTest(alice, { xp: 123, progressionReady: false });
  const before = db.storedPlayer(alice);
  assert.throws(() => db.ensure(alice), /previous XP is preserved.*history/);
  assert.deepEqual(db.storedPlayer(alice), before);
  assert.equal(db.profile(alice).progressionReady, false);
  db.putSlotFixture(alice, 'easy-paper-charm', 0);
  assert.throws(() => db.complete(alice, 0), /previous XP is preserved/);
  assert.equal(db.completions(alice).length, 0);
});

test('missing public or private quest history prevents migration without modifying the legacy record', () => {
  const { db, alice } = setup();
  db.putSlotFixture(alice, 'easy-new-path', 0); db.complete(alice, 0);
  db.patchPlayerForTest(alice, { xp: 50, explorationXp: 0, progressionReady: false });
  db.removeTemplateForTest('easy-new-path');
  const before = db.storedPlayer(alice);
  assert.throws(() => db.ensure(alice), /missing its category/);
  assert.deepEqual(db.storedPlayer(alice), before);
});

test('XP beyond skill level fifty persists and continues increasing the overall Adventurer level', () => {
  const { db, alice } = setup();
  const xp = totalXpForLevel(50) + 50000;
  db.patchPlayerForTest(alice, { craftingXp: xp });
  db.putSlotFixture(alice, 'easy-paper-charm', 0); db.complete(alice, 0);
  assert.equal(db.profile(alice).craftingXp, xp + 50);
  assert.ok(db.profile(alice).level > 50);
});
