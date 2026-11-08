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
  db.initialize(alice);
  db.initialize(bob);
  return { db, alice, bob };
}

test('completing each difficulty atomically awards its authoritative XP, records history and starts its configured cooldown', () => {
  for (const [index, reward, hours] of [[0, 50, 2], [3, 100, 6], [5, 200, 12]]) {
    const { db, alice, bob } = setup();
    const before = db.slots(alice).find(slot => slot.slotIndex === index);
    const bobBefore = db.slots(bob);
    db.advanceClock(1000n);
    const now = db.now().microsSinceUnixEpoch;
    db.complete(alice, index);
    const slot = db.slots(alice).find(slot => slot.slotIndex === index);
    const history = db.completions(alice);
    assert.equal(db.profile(alice).xp, reward);
    assert.equal(slot.status.tag, 'Cooldown');
    assert.equal(slot.templateId, before.templateId);
    assert.equal(slot.assignedAt.microsSinceUnixEpoch, before.assignedAt.microsSinceUnixEpoch);
    assert.equal(slot.completedAt.microsSinceUnixEpoch, now);
    assert.equal(slot.refreshAt.microsSinceUnixEpoch, now + BigInt(hours) * 3_600_000_000n);
    assert.equal(history.length, 1);
    assert.equal(history[0].xpAwarded, reward);
    assert.equal(history[0].templateId, before.templateId);
    assert.equal(history[0].slotIndex, index);
    assert.equal(history[0].completedAt.microsSinceUnixEpoch, now);
    assert.ok(history[0].playerIdentity.equals(db.profile(alice).identity));
    assert.deepEqual(db.slots(bob), bobBefore);
    assert.deepEqual(db.completions(bob), []);
    assert.equal(db.profile(bob).xp, 0);
  }
});

test('duplicate completion requests across connections award XP exactly once', () => {
  const { db, alice } = setup();
  db.complete(alice, 0);
  const before = { player: db.profile(alice), slots: db.slots(alice), history: db.completions(alice) };
  assert.throws(() => db.complete(alice, 0), /already completed|cooldown/);
  const secondConnection = db.auth('alice');
  assert.throws(() => db.complete(secondConnection, 0), /already completed|cooldown/);
  assert.deepEqual(db.profile(secondConnection), before.player);
  assert.deepEqual(db.slots(secondConnection), before.slots);
  assert.deepEqual(db.completions(secondConnection), before.history);
});

test('completion rejects untrusted authentication, missing profiles and invalid slot positions without writes', () => {
  const { db, alice } = setup();
  const before = db.slots(alice);
  assert.throws(() => db.complete(db.internal(), 0, Timestamp.UNIX_EPOCH), /Sign in/);
  assert.throws(() => db.complete(db.auth('alice', 'another-client'), 0, Timestamp.UNIX_EPOCH), /Sign in/);
  assert.throws(() => db.complete(db.auth('missing-player'), 0, Timestamp.UNIX_EPOCH), /Create your player profile/);
  for (const index of [-1, 6, 1.5]) assert.throws(() => db.complete(alice, index, Timestamp.UNIX_EPOCH), /Slot index/);
  assert.deepEqual(db.slots(alice), before);
  assert.deepEqual(db.completions(alice), []);
  assert.equal(db.profile(alice).xp, 0);
});

test('completion derives ownership from sender and cannot claim another player slot', () => {
  const { db, alice, bob } = setup();
  db.removeSlotsForTest(alice);
  const bobBefore = db.slots(bob);
  assert.throws(() => db.complete(alice, 0, bobBefore[0].assignedAt), /does not belong/);
  assert.deepEqual(db.slots(bob), bobBefore);
  assert.deepEqual(db.completions(alice), []);
  assert.equal(db.profile(alice).xp, 0);
});

test('stale completion requests cannot complete a later assignment of the same slot', () => {
  const { db, alice } = setup();
  const original = db.slots(alice).find(slot => slot.slotIndex === 0);
  db.advanceClock(1000n);
  db.putSlotFixture(alice, original.templateId, 0);
  const current = db.slots(alice).find(slot => slot.slotIndex === 0);
  assert.throws(() => db.complete(alice, 0, original.assignedAt), /assignment has changed/);
  assert.equal(db.profile(alice).xp, 0);
  assert.deepEqual(db.completions(alice), []);
  assert.deepEqual(db.slots(alice).find(slot => slot.slotIndex === 0), current);
  db.complete(alice, 0, current.assignedAt);
  assert.equal(db.profile(alice).xp, 50);
});

test('deactivating an assigned template does not remove a player earned completion', () => {
  const { db, alice } = setup();
  const assigned = db.slots(alice).find(slot => slot.slotIndex === 0);
  db.setTemplateActiveForTest(assigned.templateId, false);
  db.complete(alice, 0);
  assert.equal(db.profile(alice).xp, 50);
  assert.equal(db.completions(alice).length, 1);
});

test('reward overflow leaves XP, history and the available slot unchanged', () => {
  const { db, alice } = setup();
  db.awardXp(alice, 0xffff_ffff - 49);
  const before = { player: db.profile(alice), slots: db.slots(alice) };
  assert.throws(() => db.complete(alice, 0), /XP total/);
  assert.deepEqual(db.profile(alice), before.player);
  assert.deepEqual(db.slots(alice), before.slots);
  assert.deepEqual(db.completions(alice), []);
});

test('inconsistent available-slot timestamps and forged catalogue XP are rejected without partial rewards', () => {
  for (const changes of [{ completedAt: Timestamp.UNIX_EPOCH }, { refreshAt: new Timestamp(1n) }]) {
    const { db, alice } = setup();
    db.patchSlotForTest(alice, 0, changes);
    const before = db.slots(alice);
    assert.throws(() => db.complete(alice, 0), /inconsistent cooldown data/);
    assert.deepEqual(db.slots(alice), before);
    assert.deepEqual(db.completions(alice), []);
    assert.equal(db.profile(alice).xp, 0);
  }
  const { db, alice } = setup();
  const assigned = db.slots(alice).find(slot => slot.slotIndex === 0);
  db.patchTemplateForTest(assigned.templateId, { xpReward: 999999 });
  assert.throws(() => db.complete(alice, 0), /server-controlled/);
  assert.equal(db.profile(alice).xp, 0);
  assert.deepEqual(db.completions(alice), []);
});

test('earned XP, completion history and cooldown timestamps persist across reconnects and initialization', () => {
  const { db, alice } = setup();
  db.setUsername(alice, 'QuestHero');
  db.complete(alice, 0);
  const before = { player: db.profile(alice), slots: db.slots(alice), history: db.completions(alice) };
  db.advanceClock(1_000_000n);
  const reconnect = db.auth('alice');
  db.connect(reconnect);
  db.ensure(reconnect);
  db.initialize(reconnect);
  assert.deepEqual(db.profile(reconnect), before.player);
  assert.deepEqual(db.slots(reconnect), before.slots);
  assert.deepEqual(db.completions(reconnect), before.history);
});
