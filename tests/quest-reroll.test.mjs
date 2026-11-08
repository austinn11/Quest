import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { Timestamp } from 'spacetimedb';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';
import { effectiveRerolls, REROLL_WINDOW_MICROS } from '../shared/rerolls.ts';
import { locatedQuests } from '../src/map/quest-locations.ts';
import { questMapPath, resolveQuestMapTarget } from '../src/map/quest-navigation.ts';

let server, createPlayerHarness;
before(async () => {
  server = await createServer({ configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});
after(async () => { await server?.close(); });

function setup() {
  const db = createPlayerHarness();
  const alice = db.auth('alice'), bob = db.auth('bob');
  db.seedTemplates(); db.ensure(alice); db.ensure(bob); db.initialize(alice); db.initialize(bob);
  db.advanceClock(1000n);
  return { db, alice, bob };
}
const allowance = (db, auth) => effectiveRerolls(db.profile(auth), db.now().microsSinceUnixEpoch);
const sorted = rows => [...rows].sort((a, b) => a.slotIndex - b.slotIndex);
const slotAt = (db, auth, index) => db.slots(auth).find(slot => slot.slotIndex === index);
const state = (db, auth) => ({ player: db.profile(auth), slots: sorted(db.slots(auth)), history: db.completions(auth), captures: db.captures(auth) });

test('allowance uses fixed server-time windows, replenishes at the exact boundary, and never accumulates', () => {
  const { db, alice } = setup();
  assert.equal(allowance(db, alice).remaining, 2);
  assert.equal(db.profile(alice).rerollResetAt, undefined);
  db.reroll(alice, 0);
  const reset = db.profile(alice).rerollResetAt.microsSinceUnixEpoch;
  assert.equal(reset, db.now().microsSinceUnixEpoch + REROLL_WINDOW_MICROS);
  assert.equal(allowance(db, alice).remaining, 1);
  db.advanceClock(5n * 3600n * 1000000n);
  db.reroll(alice, 1);
  assert.equal(allowance(db, alice).remaining, 0);
  assert.equal(db.profile(alice).rerollResetAt.microsSinceUnixEpoch, reset);
  const before = state(db, alice);
  assert.throws(() => db.reroll(alice, 2), /used both free rerolls/);
  assert.deepEqual(state(db, alice), before);
  db.advanceClock(reset - db.now().microsSinceUnixEpoch - 1n);
  assert.equal(allowance(db, alice).remaining, 0);
  db.advanceClock(1n);
  assert.equal(allowance(db, alice).remaining, 2);
  assert.equal(allowance(db, alice).resetAt, null);
  db.reroll(alice, 0);
  assert.equal(db.profile(alice).rerollResetAt.microsSinceUnixEpoch, reset + REROLL_WINDOW_MICROS);
  db.advanceClock(4n * REROLL_WINDOW_MICROS);
  assert.equal(allowance(db, alice).remaining, 2);
  db.reroll(alice, 2);
  assert.equal(allowance(db, alice).remaining, 1);
});

test('reroll changes exactly one assignment and allowance, preserving XP, history, guild progress and cooldowns', () => {
  const { db, alice, bob } = setup();
  db.complete(alice, 1);
  db.createGuild(alice, 'Reroll Rangers');
  const guild = db.guildQuests(alice);
  const before = state(db, alice), bobBefore = state(db, bob);
  db.advanceClock(1000n);
  db.reroll(alice, 0);
  const after = state(db, alice);
  assert.deepEqual(after.slots.filter(slot => slot.slotIndex !== 0), before.slots.filter(slot => slot.slotIndex !== 0));
  const replacement = after.slots[0];
  assert.notEqual(replacement.templateId, before.slots[0].templateId);
  assert.notEqual(replacement.assignedAt.microsSinceUnixEpoch, before.slots[0].assignedAt.microsSinceUnixEpoch);
  assert.equal(replacement.difficulty.tag, before.slots[0].difficulty.tag);
  assert.equal(replacement.slotId, before.slots[0].slotId);
  assert.equal(replacement.status.tag, 'Available');
  assert.equal(replacement.completedAt, undefined); assert.equal(replacement.refreshAt, undefined);
  assert.equal(new Set(after.slots.map(slot => slot.templateId)).size, 6);
  const { rerollsUsed, rerollResetAt, ...profile } = after.player;
  const { rerollsUsed: oldUsed, rerollResetAt: oldReset, ...oldProfile } = before.player;
  assert.deepEqual(profile, oldProfile);
  assert.deepEqual(after.history, before.history); assert.deepEqual(after.captures, before.captures);
  assert.deepEqual(db.guildQuests(alice), guild);
  assert.deepEqual(state(db, bob), bobBefore);
  assert.throws(() => db.reroll(alice, 1), /cooldown/);
});

test('replacement preference preserves Location or Anywhere and falls back only when that type is exhausted', () => {
  for (const geographic of [true, false]) {
    const { db, alice } = setup();
    db.saveRegion(alice, 32.98, -96.75, [{ id: 'node/99', name: 'Test Park', kind: 'park', latitude: 32.98, longitude: -96.75 }]);
    const id = geographic ? 'easy-campus-scout' : 'easy-new-path';
    db.putSlotFixture(alice, 'easy-paper-charm', 1);
    db.putSlotFixture(alice, 'easy-birdwatch', 2);
    db.putSlotFixture(alice, id, 0); db.advanceClock(1n);
    db.reroll(alice, 0);
    const replacement = db.resolved(alice, slotAt(db, alice, 0).templateId);
    assert.equal(replacement.latitude !== undefined, geographic);
  }
  const { db, alice } = setup();
  db.putSlotFixture(alice, 'easy-new-path', 0);
  for (const template of db.templates().filter(t => t.difficulty.tag === 'Easy' && t.latitude === undefined)) db.setTemplateActiveForTest(template.templateId, false);
  db.saveRegion(alice, 32.98, -96.75, [{ id: 'node/99', name: 'Test Park', kind: 'park', latitude: 32.98, longitude: -96.75 }]);
  for (const t of db.templates().filter(t => t.difficulty.tag === 'Easy' && t.questType.tag === 'Location')) db.setTemplateActiveForTest(t.templateId, true);
  // Explicitly occupy generic templates in the other Easy positions so a geographic alternative remains.
  db.setTemplateActiveForTest('easy-paper-charm', true); db.putSlotFixture(alice, 'easy-paper-charm', 1);
  db.setTemplateActiveForTest('easy-birdwatch', true); db.putSlotFixture(alice, 'easy-birdwatch', 2);
  db.advanceClock(1n); db.reroll(alice, 0);
  assert.ok(db.resolved(alice, slotAt(db, alice, 0).templateId).latitude !== undefined);
});

test('no eligible candidate and invalid replacement data leave the entire transaction unchanged', () => {
  for (const corrupt of [false, true]) {
    const { db, alice } = setup();
    const current = slotAt(db, alice, 0).templateId;
    for (const template of db.templates().filter(t => t.difficulty.tag === 'Easy' && t.templateId !== current)) db.setTemplateActiveForTest(template.templateId, false);
    if (corrupt) {
      const occupied = new Set(db.slots(alice).map(slot => slot.templateId));
      const alternative = db.templates().find(t => t.difficulty.tag === 'Easy' && t.questType.tag === 'Anywhere' && t.latitude === undefined && !occupied.has(t.templateId));
      db.patchTemplateForTest(alternative.templateId, { isActive: true, xpReward: 999 });
    }
    const before = state(db, alice);
    assert.throws(() => db.reroll(alice, 0), corrupt ? /XP must match/ : /No eligible replacement/);
    assert.deepEqual(state(db, alice), before);
  }
});

test('stale confirmations and concurrent connections cannot spend an allowance on a replaced assignment or bypass the limit', () => {
  const { db, alice } = setup();
  const old = slotAt(db, alice, 0).assignedAt;
  db.reroll(alice, 0, old);
  const once = state(db, alice);
  assert.throws(() => db.reroll(db.auth('alice'), 0, old), /assignment has changed/);
  assert.deepEqual(state(db, alice), once);
  db.reroll(db.auth('alice'), 1);
  assert.throws(() => db.reroll(db.auth('alice'), 2), /used both/);
  const reconnect = db.auth('alice'); db.ensure(reconnect); db.initialize(reconnect);
  assert.equal(allowance(db, reconnect).remaining, 0);
  assert.deepEqual(state(db, reconnect), state(db, alice));
});

test('reroll rejects untrusted identity, missing profile, invalid indices, another player slot and inconsistent allowance', () => {
  const { db, alice, bob } = setup();
  const original = state(db, alice);
  assert.throws(() => db.reroll(db.internal(), 0), /Sign in/);
  assert.throws(() => db.reroll(db.auth('alice', 'other-client'), 0), /Sign in/);
  assert.throws(() => db.reroll(db.auth('missing'), 0), /Create your player profile/);
  for (const index of [-1, 6, 1.5]) assert.throws(() => db.reroll(alice, index), /Slot index/);
  assert.deepEqual(state(db, alice), original);
  db.removeSlotsForTest(alice);
  assert.throws(() => db.reroll(alice, 0, slotAt(db, bob, 0).assignedAt), /does not belong/);
  assert.equal(db.profile(bob).rerollsUsed, 0);
  const other = setup();
  other.db.patchPlayerForTest(other.alice, { rerollsUsed: 2, rerollResetAt: undefined });
  const before = state(other.db, other.alice);
  assert.throws(() => other.db.reroll(other.alice, 0), /inconsistent data/);
  assert.deepEqual(state(other.db, other.alice), before);
});

test('a reroll creates a fresh map assignment, invalidates old completion links, and creates no completed marker', () => {
  const { db, alice } = setup();
  db.putSlotFixture(alice, 'easy-campus-scout', 0); db.advanceClock(1n);
  const old = slotAt(db, alice, 0);
  const link = questMapPath(old);
  db.reroll(alice, 0);
  const locations = locatedQuests(db.slots(alice), db.templates());
  assert.equal(resolveQuestMapTarget(link.split('?')[1], db.slots(alice), locations).kind, 'stale');
  assert.ok(!locations.some(quest => quest.key === `${old.slotId}:${old.assignedAt.microsSinceUnixEpoch}`));
  assert.ok(locations.every(quest => quest.slot.status.tag === 'Available'));
  assert.deepEqual(db.completions(alice), []);
  assert.throws(() => db.complete(alice, 0, old.assignedAt), /assignment has changed/);
});

test('assignment timestamps are never reused, and failed attempts do not start a window', () => {
  const { db, alice } = setup();
  const current = slotAt(db, alice, 0);
  db.patchSlotForTest(alice, 0, { assignedAt: db.now() });
  assert.throws(() => db.reroll(alice, 0), /still syncing/);
  assert.equal(db.profile(alice).rerollResetAt, undefined);
  db.advanceClock(1n); db.reroll(alice, 0);
  assert.notEqual(slotAt(db, alice, 0).assignedAt.microsSinceUnixEpoch, current.assignedAt.microsSinceUnixEpoch);
});
