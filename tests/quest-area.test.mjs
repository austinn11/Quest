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

const UTD = [32.9858, -96.7501];
const NEARBY = [32.9948, -96.7501]; // about 1 km north
const AUSTIN = [30.2672, -97.7431];

function placesAround([latitude, longitude], prefix) {
  const spots = [
    ['Park', 'park', 300], ['Pond', 'lake or pond', 800], ['Monument', 'monument', 1200], ['Garden', 'garden', 1700],
    ['Overlook', 'viewpoint', 2500], ['Museum', 'museum', 3500], ['Reserve', 'nature reserve', 5000], ['Peak', 'peak', 6500],
  ];
  const idBase = [...prefix].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 100;
  return spots.map(([name, kind, metres], index) => ({
    id: `node/${idBase + index}`, name: `${prefix} ${name}`, kind,
    latitude: latitude + metres / 111_000, longitude, distance: metres,
  }));
}

function setup(env) {
  const db = createPlayerHarness(42n, env);
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.ensure(alice);
  db.ensure(bob);
  db.seedTemplates();
  db.initialize(alice);
  db.initialize(bob);
  return { db, alice, bob };
}

const bySlot = slots => [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
const isLocal = templateId => templateId.startsWith('local-');

test('quest areas and generated quests are private tables exposed only through per-player views', () => {
  const { db, alice, bob } = setup();
  assert.equal(db.localQuestVisibility, 'Private');
  assert.equal(db.areaVisibility, 'Private');
  db.applyArea(alice, ...UTD, placesAround(UTD, 'Campus'));
  assert.ok(db.localQuests(alice).length > 0);
  assert.deepEqual(db.localQuests(bob), []);
  assert.equal(db.area(bob), undefined);
  assert.ok(db.templates().every(template => !isLocal(template.templateId)));
});

test('sharing a location stores a rounded area, generates local quests and reloads only Available slots', () => {
  const { db, alice } = setup();
  db.complete(alice, 0);
  const before = bySlot(db.slots(alice));
  db.advanceClock(1_000_000n);
  assert.deepEqual(db.checkArea(alice, ...UTD), { needsPlaces: true, hadArea: false, distanceMoved: 0 });
  const result = db.applyArea(alice, ...UTD, placesAround(UTD, 'Campus'));
  assert.equal(result.reloaded, true);
  assert.ok(result.localQuestCount >= 6);
  const area = db.area(alice);
  assert.deepEqual([area.latitude, area.longitude, area.placeCount], [32.986, -96.75, 8]);

  const after = bySlot(db.slots(alice));
  assert.deepEqual(after[0], before[0], 'the completed Cooldown slot keeps its quest');
  for (const slot of after.slice(1)) {
    assert.equal(slot.status.tag, 'Available');
    assert.equal(slot.assignedAt.microsSinceUnixEpoch, db.now().microsSinceUnixEpoch);
  }
  assert.ok(after.some(slot => isLocal(slot.templateId)), 'local quests are preferred for the board');
  assert.equal(new Set(after.map(slot => slot.templateId)).size, 6, 'no quest appears twice');
  const local = new Map(db.localQuests(alice).map(quest => [quest.templateId, quest]));
  for (const slot of after.filter(slot => isLocal(slot.templateId))) {
    assert.equal(local.get(slot.templateId).difficulty.tag, slot.difficulty.tag);
    assert.equal(local.get(slot.templateId).isActive, true);
  }
});

test('a small move keeps the board while travelling far reloads it with the new area', () => {
  const { db, alice } = setup();
  db.applyArea(alice, ...UTD, placesAround(UTD, 'Campus'));
  const board = bySlot(db.slots(alice));
  const firstQuests = db.localQuests(alice).map(quest => quest.templateId);

  const check = db.checkArea(alice, ...NEARBY);
  assert.equal(check.needsPlaces, false);
  assert.ok(check.distanceMoved > 900 && check.distanceMoved < 1100);
  assert.equal(db.applyArea(alice, ...NEARBY, placesAround(NEARBY, 'Elsewhere')).reloaded, false);
  assert.deepEqual(bySlot(db.slots(alice)), board);
  assert.equal(db.localQuests(alice).length, firstQuests.length);

  db.advanceClock(1_000_000n);
  assert.equal(db.checkArea(alice, ...AUSTIN).needsPlaces, true);
  assert.equal(db.applyArea(alice, ...AUSTIN, placesAround(AUSTIN, 'Austin')).reloaded, true);
  const quests = db.localQuests(alice);
  assert.ok(quests.filter(quest => firstQuests.includes(quest.templateId)).every(quest => !quest.isActive), 'old area quests retire');
  assert.ok(quests.filter(quest => !firstQuests.includes(quest.templateId)).every(quest => quest.isActive));
  const campusIds = new Set(firstQuests);
  const curatedDallas = new Set(db.templates().filter(template => template.latitude !== undefined).map(template => template.templateId));
  for (const slot of db.slots(alice)) {
    assert.ok(!campusIds.has(slot.templateId), 'no quest from the old area remains Available');
    assert.ok(!curatedDallas.has(slot.templateId), 'curated Dallas quests are not offered in Austin');
  }
});

test('local quests complete once, keep history after moving and refill from the new pool', () => {
  const { db, alice } = setup();
  db.applyArea(alice, ...UTD, placesAround(UTD, 'Campus'));
  const slot = bySlot(db.slots(alice)).find(row => isLocal(row.templateId));
  assert.ok(slot, 'the seeded board includes a local quest');
  const quest = db.localQuests(alice).find(row => row.templateId === slot.templateId);
  const xpBefore = db.profile(alice).xp;
  db.complete(alice, slot.slotIndex);
  assert.throws(() => db.complete(alice, slot.slotIndex), /already completed|cooldown/);
  assert.equal(db.profile(alice).xp, xpBefore + quest.xpReward);

  db.advanceClock(1_000_000n);
  db.applyArea(alice, ...AUSTIN, placesAround(AUSTIN, 'Austin'));
  const history = db.completions(alice);
  assert.equal(history.length, 1);
  assert.equal(history[0].templateId, quest.templateId);
  assert.ok(db.localQuests(alice).some(row => row.templateId === quest.templateId), 'history still resolves');

  db.advanceClock(13n * 60n * 60n * 1_000_000n);
  db.refresh(alice);
  const refilled = db.slots(alice).find(row => row.slotIndex === slot.slotIndex);
  assert.equal(refilled.status.tag, 'Available');
  assert.notEqual(refilled.templateId, quest.templateId);
});

test('photo checks are rate limited per player to protect AI credits', () => {
  const { db, alice } = setup();
  const quest = db.beginPhoto(alice, 0);
  assert.equal(quest.templateId, db.slots(alice).find(slot => slot.slotIndex === 0).templateId);
  assert.throws(() => db.beginPhoto(alice, 0), /wait 5 seconds/);
  for (let attempt = 2; attempt <= 12; attempt++) {
    db.advanceClock(6_000_000n);
    db.beginPhoto(alice, 0);
  }
  db.advanceClock(6_000_000n);
  assert.throws(() => db.beginPhoto(alice, 0), /all 12 photo checks/);
  db.advanceClock(60n * 60n * 1_000_000n);
  db.beginPhoto(alice, 0);
  assert.equal(db.slots(alice).find(slot => slot.slotIndex === 0).status.tag, 'Available', 'checking never completes');
});

test('with an AI key configured, completion requires an accepted photo and stores the judge note once', () => {
  const { db, alice, bob } = setup({ AI_API_KEY: 'test-key' });
  assert.throws(() => db.complete(alice, 0), /Submit a photo/);
  const assignedAt = db.slots(alice).find(slot => slot.slotIndex === 0).assignedAt;
  db.finishPhoto(alice, 0, '  A grackle on a fence  ', assignedAt);
  const [completion] = db.completions(alice);
  assert.equal(completion.proofNote, 'A grackle on a fence');
  assert.equal(db.profile(alice).xp, completion.xpAwarded);
  assert.throws(() => db.finishPhoto(alice, 0, 'Again', assignedAt), /already completed|cooldown/);
  assert.throws(() => db.finishPhoto(bob, 1, 'Stale', new Timestamp(1n)), /assignment has changed/);
  assert.equal(db.profile(alice).xp, completion.xpAwarded);
  assert.deepEqual(db.completions(bob), []);
});

test('location and photo steps require a signed-in player and valid coordinates', () => {
  const { db, alice } = setup();
  assert.throws(() => db.checkArea(db.internal(), ...UTD), /Sign in/);
  assert.throws(() => db.checkArea(alice, 95, 0), /location could not be read/);
  assert.throws(() => db.beginPhoto(db.internal(), 0), /Sign in/);
});
