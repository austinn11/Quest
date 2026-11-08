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
  const alice = db.auth('refresh-alice');
  const bob = db.auth('refresh-bob');
  db.ensure(alice);
  db.ensure(bob);
  db.seedTemplates();
  db.initialize(alice);
  db.initialize(bob);
  return { db, alice, bob };
}

function coolSlot(db, auth, index, delay = 10n, record = true) {
  const slot = db.slots(auth).find(slot => slot.slotIndex === index);
  db.putSlotFixture(auth, slot.templateId, index, {
    status: { tag: 'Cooldown' }, completedAt: db.now(),
    refreshAt: new Timestamp(db.now().microsSinceUnixEpoch + delay),
  });
  if (record) db.appendCompletionFixture(auth, index);
  return db.slots(auth).find(slot => slot.slotIndex === index);
}

test('refresh waits for authoritative server expiry and replaces at the exact boundary', () => {
  const { db, alice } = setup();
  const cooled = coolSlot(db, alice, 0);
  const history = db.completions(alice);
  db.advanceClock(9n);
  db.refresh(alice);
  assert.deepEqual(db.slots(alice).find(slot => slot.slotIndex === 0), cooled);
  db.advanceClock(1n);
  db.refresh(alice);
  const replacement = db.slots(alice).find(slot => slot.slotIndex === 0);
  assert.equal(replacement.status.tag, 'Available');
  assert.equal(replacement.difficulty.tag, 'Easy');
  assert.notEqual(replacement.templateId, cooled.templateId);
  assert.equal(replacement.assignedAt.microsSinceUnixEpoch, db.now().microsSinceUnixEpoch);
  assert.equal(replacement.completedAt, undefined);
  assert.equal(replacement.refreshAt, undefined);
  assert.deepEqual(db.completions(alice), history);
  assert.equal(db.profile(alice).xp, 0);
});

test('multi-slot refresh preserves difficulty layout, active templates, and simultaneous uniqueness', () => {
  const { db, alice } = setup();
  const before = db.slots(alice);
  for (let index = 0; index < 6; index++) coolSlot(db, alice, index);
  const history = db.completions(alice);
  db.advanceClock(10n);
  db.refresh(alice);
  const board = db.slots(alice).sort((a, b) => a.slotIndex - b.slotIndex);
  assert.equal(board.length, 6);
  assert.equal(new Set(board.map(slot => slot.templateId)).size, 6);
  assert.deepEqual(board.map(slot => slot.difficulty.tag), ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard']);
  for (const slot of board) {
    const template = db.templates().find(template => template.templateId === slot.templateId);
    assert.equal(template.isActive, true);
    assert.equal(slot.status.tag, 'Available');
    assert.notEqual(slot.templateId, before.find(previous => previous.slotIndex === slot.slotIndex).templateId);
  }
  assert.deepEqual(db.completions(alice), history);
  const stable = db.slots(alice);
  db.refresh(alice);
  assert.deepEqual(db.slots(alice), stable);
});

test('refreshes are private and reconnects preserve persisted cooldowns', () => {
  const { db, alice, bob } = setup();
  coolSlot(db, alice, 0);
  coolSlot(db, bob, 0);
  const bobBefore = db.slots(bob);
  const renewedAlice = db.auth('refresh-alice');
  db.connect(renewedAlice);
  db.initialize(renewedAlice);
  const aliceBefore = db.slots(renewedAlice);
  db.refresh(renewedAlice);
  assert.deepEqual(db.slots(renewedAlice), aliceBefore);
  db.advanceClock(10n);
  db.refresh(renewedAlice);
  assert.equal(db.slots(renewedAlice).find(slot => slot.slotIndex === 0).status.tag, 'Available');
  assert.deepEqual(db.slots(bob), bobBefore);
  assert.equal(db.completions(bob).length, 1);
});

test('refresh checks require Quest authentication and an existing player', () => {
  const { db, alice } = setup();
  const before = db.slots(alice);
  assert.throws(() => db.refresh(db.internal()), /Sign in to Quest/);
  assert.throws(() => db.refresh(db.auth('refresh-alice', 'other-client')), /Sign in to Quest/);
  assert.throws(() => db.refresh(db.auth('no-profile')), /Create your player profile/);
  assert.deepEqual(db.slots(alice), before);
});

test('an exhausted difficulty remains on cooldown while other eligible slots can refresh', () => {
  const { db, alice } = setup();
  const easy = coolSlot(db, alice, 0);
  const medium = coolSlot(db, alice, 3);
  const occupiedEasy = new Set(db.slots(alice).filter(slot => slot.difficulty.tag === 'Easy' && slot.slotIndex !== 0).map(slot => slot.templateId));
  for (const template of db.templates().filter(template => template.difficulty.tag === 'Easy')) {
    db.setTemplateActiveForTest(template.templateId, occupiedEasy.has(template.templateId));
  }
  db.advanceClock(10n);
  db.refresh(alice);
  assert.deepEqual(db.slots(alice).find(slot => slot.slotIndex === 0), easy);
  const refreshedMedium = db.slots(alice).find(slot => slot.slotIndex === 3);
  assert.equal(refreshedMedium.status.tag, 'Available');
  assert.notEqual(refreshedMedium.templateId, medium.templateId);
  db.setTemplateActiveForTest(easy.templateId, true);
  db.refresh(alice);
  assert.equal(db.slots(alice).find(slot => slot.slotIndex === 0).status.tag, 'Available');
});

test('recent-history preference falls back to repeating the previous quest without duplicating other slots', () => {
  const { db, alice } = setup();
  const cooled = coolSlot(db, alice, 0);
  const occupied = new Set(db.slots(alice).filter(slot => slot.difficulty.tag === 'Easy').map(slot => slot.templateId));
  for (const template of db.templates().filter(template => template.difficulty.tag === 'Easy')) {
    db.setTemplateActiveForTest(template.templateId, occupied.has(template.templateId));
  }
  db.advanceClock(10n);
  db.refresh(alice);
  const replacement = db.slots(alice).find(slot => slot.slotIndex === 0);
  assert.equal(replacement.status.tag, 'Available');
  assert.equal(replacement.templateId, cooled.templateId);
  assert.notEqual(replacement.assignedAt.microsSinceUnixEpoch, cooled.assignedAt.microsSinceUnixEpoch);
  assert.equal(new Set(db.slots(alice).map(slot => slot.templateId)).size, 6);
});

test('inactive replacement candidates and templates held by other cooldown slots are excluded', () => {
  const { db, alice } = setup();
  const first = coolSlot(db, alice, 0);
  const other = coolSlot(db, alice, 1, 100n);
  const occupied = new Set(db.slots(alice).map(slot => slot.templateId));
  const unused = db.templates().filter(template => template.difficulty.tag === 'Easy' && !occupied.has(template.templateId));
  db.setTemplateActiveForTest(unused[0].templateId, false);
  db.advanceClock(10n);
  db.refresh(alice);
  const replacement = db.slots(alice).find(slot => slot.slotIndex === 0);
  assert.notEqual(replacement.templateId, first.templateId);
  assert.notEqual(replacement.templateId, unused[0].templateId);
  assert.notEqual(replacement.templateId, other.templateId);
  assert.deepEqual(db.slots(alice).find(slot => slot.slotIndex === 1), other);
});

test('malformed cooldown data aborts atomically without replacing earlier slots', () => {
  const { db, alice } = setup();
  coolSlot(db, alice, 0);
  coolSlot(db, alice, 1);
  db.patchSlotForTest(alice, 1, { refreshAt: undefined });
  const before = db.slots(alice);
  const history = db.completions(alice);
  db.advanceClock(10n);
  assert.throws(() => db.refresh(alice), /Cooldown slots require/);
  assert.deepEqual(db.slots(alice), before);
  assert.deepEqual(db.completions(alice), history);
  assert.equal(db.profile(alice).xp, 0);
});
