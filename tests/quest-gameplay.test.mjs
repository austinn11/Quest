import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

let server;
let createPlayerHarness;
before(async () => {
  server = await createServer({ configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});
after(async () => { await server?.close(); });

test('completion, cooldown, replacement, and another completion form a persistent isolated gameplay loop', () => {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.seedTemplates();
  for (const auth of [alice, bob]) { db.ensure(auth); db.initialize(auth); }
  db.setUsername(alice, 'TrailKeeper');
  const bobBefore = db.slots(bob);
  const original = db.slots(alice).find(slot => slot.slotIndex === 0);
  for (const index of [0, 3, 5]) db.complete(alice, index);
  assert.equal(db.profile(alice).xp, 350);
  assert.equal(db.profile(alice).level, 2);
  const savedHistory = db.completions(alice);
  assert.equal(savedHistory.length, 3);
  assert.throws(() => db.complete(alice, 0, original.assignedAt), /cooldown|already completed/);

  const twoHours = 2n * 3_600_000_000n;
  db.advanceClock(twoHours - 1n);
  db.refresh(alice);
  assert.equal(db.slots(alice).find(slot => slot.slotIndex === 0).status.tag, 'Cooldown');
  db.advanceClock(1n);
  db.refresh(alice);
  const replacement = db.slots(alice).find(slot => slot.slotIndex === 0);
  assert.equal(replacement.status.tag, 'Available');
  assert.notEqual(replacement.templateId, original.templateId);
  assert.equal(replacement.difficulty.tag, 'Easy');
  assert.equal(replacement.assignedAt.microsSinceUnixEpoch, db.now().microsSinceUnixEpoch);
  assert.equal(replacement.completedAt, undefined);
  assert.equal(replacement.refreshAt, undefined);
  assert.deepEqual(db.completions(alice), savedHistory);
  assert.equal(db.profile(alice).xp, 350);
  assert.equal(new Set(db.slots(alice).map(slot => slot.templateId)).size, 6);
  for (const index of [3, 5]) assert.equal(db.slots(alice).find(slot => slot.slotIndex === index).status.tag, 'Cooldown');

  // A delayed request from the old card cannot claim XP for its replacement.
  assert.throws(() => db.complete(alice, 0, original.assignedAt), /assignment has changed/);
  assert.equal(db.profile(alice).xp, 350);
  db.complete(alice, 0, replacement.assignedAt);
  assert.equal(db.profile(alice).xp, 400);
  assert.equal(db.completions(alice).length, 4);

  const reconnect = db.auth('alice');
  const savedBoard = db.slots(alice);
  db.connect(reconnect);
  db.ensure(reconnect);
  db.initialize(reconnect);
  db.refresh(reconnect);
  assert.deepEqual(db.slots(reconnect), savedBoard);
  assert.equal(db.profile(reconnect).username, 'TrailKeeper');
  assert.equal(db.profile(reconnect).xp, 400);
  assert.equal(db.completions(reconnect).length, 4);
  assert.deepEqual(db.slots(bob), bobBefore);
  assert.equal(db.profile(bob).xp, 0);
  assert.deepEqual(db.completions(bob), []);
});
