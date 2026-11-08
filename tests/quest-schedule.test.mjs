import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';
let server, createPlayerHarness;
before(async () => {
  server = await createServer({ configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});
after(async () => { await server?.close(); });
function setup() {
  const db = createPlayerHarness(); const alice = db.auth('alice'), bob = db.auth('bob');
  db.seedTemplates(); db.ensure(alice); db.ensure(bob); db.initialize(alice); db.initialize(bob);
  return { db, alice, bob };
}
const slotAt = (db, player, index) => db.slots(player).find(slot => slot.slotIndex === index);
const timeOf = timer => timer.scheduledAt.value.microsSinceUnixEpoch;
const atDue = (db, timer) => db.advanceClock(timeOf(timer) - db.now().microsSinceUnixEpoch);

test('completion schedules one private server job for its exact unchanged cooldown; duplicate completion cannot add jobs', () => {
  const { db, alice } = setup();
  for (const index of [0, 3, 5]) db.complete(alice, index);
  assert.equal(db.timers().length, 3);
  for (const timer of db.timers()) {
    const slot = db.slots(alice).find(slot => slot.slotId === timer.slotId);
    assert.equal(timeOf(timer), slot.refreshAt.microsSinceUnixEpoch);
    assert.equal(timer.expectedAssignedAt.microsSinceUnixEpoch, slot.assignedAt.microsSinceUnixEpoch);
  }
  assert.throws(() => db.complete(alice, 0), /already completed|cooldown/);
  assert.equal(db.timers().length, 3);
});

test('an offline scheduled replacement uses the recorded owner without awarding XP or changing another player', () => {
  const { db, alice, bob } = setup(); db.complete(alice, 0);
  const timer = db.timers()[0], before = db.profile(alice), history = db.completions(alice), other = db.slots(bob);
  assert.throws(() => db.runTimer(timer, bob), /only run on the server/);
  atDue(db, timer); db.runTimer(timer);
  assert.equal(slotAt(db, alice, 0).status.tag, 'Available');
  assert.equal(db.timers().length, 0); assert.deepEqual(db.profile(alice), before);
  assert.deepEqual(db.completions(alice), history); assert.deepEqual(db.slots(bob), other);
});

test('early timer execution preserves the expiry and a stale timer cannot replace or cancel a newer assignment', () => {
  const { db, alice } = setup(); db.complete(alice, 0);
  const first = db.timers()[0], cooldown = slotAt(db, alice, 0);
  db.runTimer(first); assert.deepEqual(slotAt(db, alice, 0), cooldown);
  assert.equal(timeOf(db.timers()[0]), cooldown.refreshAt.microsSinceUnixEpoch);
  const current = db.timers()[0]; atDue(db, current); db.refresh(alice);
  assert.equal(db.timers().length, 0);
  db.complete(alice, 0); const next = db.timers()[0], state = slotAt(db, alice, 0);
  db.runTimer(current); assert.deepEqual(slotAt(db, alice, 0), state); assert.deepEqual(db.timers(), [next]);
});

test('an exhausted catalog leaves the slot intact and retries server-side instead of losing the timer', () => {
  const { db, alice } = setup(); db.complete(alice, 0);
  for (const template of db.templates().filter(t => t.difficulty.tag === 'Easy')) db.setTemplateActiveForTest(template.templateId, false);
  const first = db.timers()[0], before = slotAt(db, alice, 0); atDue(db, first); db.runTimer(first);
  assert.deepEqual(slotAt(db, alice, 0), before); assert.equal(db.timers().length, 1);
  assert.equal(timeOf(db.timers()[0]), db.now().microsSinceUnixEpoch + 300_000_000n);
  for (const template of db.templates()) db.setTemplateActiveForTest(template.templateId, true);
  atDue(db, db.timers()[0]); db.runTimer(db.timers()[0]);
  assert.equal(slotAt(db, alice, 0).status.tag, 'Available');
});

test('the first post-upgrade connection backfills existing cooldown jobs idempotently without regenerating quests', () => {
  const { db, alice } = setup(); db.complete(alice, 0); db.removeTimersForTest();
  const board = db.slots(alice), profile = db.profile(alice);
  db.connect(alice); db.connect(alice);
  assert.equal(db.timers().length, 1); assert.deepEqual(db.slots(alice), board); assert.deepEqual(db.profile(alice), profile);
});
