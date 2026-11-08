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


test('adventure regions and normalized destinations are private to their owner', () => {
  const { db, alice, bob } = setup();
  db.saveRegion(alice, ...UTD, placesAround(UTD, 'Campus'));
  assert.equal(db.locationVisibility, 'Private');
  assert.equal(db.areaVisibility, 'Private');
  assert.equal(db.destinations(alice).length, 8);
  assert.deepEqual(db.destinations(bob), []);
  assert.equal(db.area(bob), undefined);
  assert.ok(db.destinations(alice).every(p => p.externalSource === 'OpenStreetMap'));
});

test('explicit region changes preserve assignments, cooldowns, XP, history and rerolls', () => {
  const { db, alice } = setup();
  db.complete(alice, 0); db.advanceClock(1n); db.reroll(alice, 1);
  const before = { board: bySlot(db.slots(alice)), player: db.profile(alice), history: db.completions(alice) };
  db.saveRegion(alice, ...UTD, placesAround(UTD, 'Campus'));
  db.advanceClock(1_000_000n);
  db.saveRegion(alice, ...AUSTIN, placesAround(AUSTIN, 'Austin'));
  db.initialize(db.auth('alice')); db.connect(db.auth('alice'));
  assert.deepEqual({ board: bySlot(db.slots(alice)), player: db.profile(alice), history: db.completions(alice) }, before);
  assert.equal(db.destinations(alice).length, 16, 'old referenced locations remain available');
});

test('generation combines reusable recipes and genuine region destinations with Anywhere fallback', () => {
  const { db, alice } = setup();
  db.removeSlotsForTest(alice);
  db.saveRegion(alice, ...AUSTIN, placesAround(AUSTIN, 'Austin'));
  db.initialize(alice);
  const board = bySlot(db.slots(alice));
  assert.deepEqual(board.map(s => s.difficulty.tag), ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard']);
  assert.equal(new Set(board.map(s => s.templateId)).size, 6);
  assert.ok(board.some(slot => slot.locationId !== undefined));
  for (const slot of board) {
    const quest = db.resolved(alice, slot.templateId);
    if (slot.locationId !== undefined) {
      assert.match(quest.title, /Austin/); assert.ok(!quest.description.includes('{location}'));
      const location = db.destinations(alice).find(p => p.locationId === slot.locationId);
      assert.deepEqual([quest.latitude, quest.longitude], [location.latitude, location.longitude]);
    } else assert.equal(quest.latitude, undefined);
  }
  const before = bySlot(db.slots(alice));
  db.advanceClock(1_000_000n); db.saveRegion(alice, ...UTD, []); db.initialize(db.auth('alice'));
  assert.deepEqual(bySlot(db.slots(alice)), before);
  db.removeSlotsForTest(alice); db.initialize(alice);
  assert.ok(db.slots(alice).every(slot => slot.locationId === undefined));
});

test('completion snapshots survive region changes and replacements and feed historical map markers', async () => {
  const { historicalQuests } = await import('../src/map/quest-locations.ts');
  const { db, alice, bob } = setup();
  db.removeSlotsForTest(alice); db.saveRegion(alice, ...UTD, placesAround(UTD, 'Campus')); db.initialize(alice);
  const slot = db.slots(alice).find(s => s.locationId !== undefined);
  const quest = db.resolved(alice, slot.templateId);
  const before = db.profile(alice).xp;
  db.complete(alice, slot.slotIndex);
  assert.equal(db.profile(alice).xp, before + quest.xpReward);
  assert.throws(() => db.complete(alice, slot.slotIndex), /already completed|cooldown/);
  const completion = db.completions(alice)[0];
  assert.equal(completion.locationName, quest.locationName);
  assert.equal(completion.questTitle, quest.title);
  db.advanceClock(1n); db.saveRegion(alice, ...AUSTIN, placesAround(AUSTIN, 'Austin'));
  db.advanceClock(13n * 3_600_000_000n); db.refresh(alice);
  assert.deepEqual(db.completions(alice)[0], completion);
  const historical = historicalQuests(db.completions(alice), db.templates());
  assert.deepEqual(historical[0].coordinates, [quest.longitude, quest.latitude]);
  assert.equal(historical[0].template.title, quest.title);
  assert.deepEqual(db.completions(bob), []);
  const replacement = db.slots(alice).find(row => row.slotIndex === slot.slotIndex);
  if (replacement.locationId !== undefined) assert.match(db.resolved(alice, replacement.templateId).title, /Austin/);
  assert.ok(db.slots(alice).filter(row => row.slotIndex !== slot.slotIndex).some(row => row.locationId !== undefined), 'unfinished original-region quests remain assigned');
});

test('a forged cross-player destination cannot be used for photo checks or rewards', () => {
  const { db, alice, bob } = setup();
  db.saveRegion(bob, ...UTD, placesAround(UTD, 'Bob'));
  db.patchSlotForTest(alice, 0, { locationId: db.destinations(bob)[0].locationId });
  const xp = db.profile(alice).xp;
  assert.throws(() => db.beginPhoto(alice, 0), /unavailable/);
  assert.throws(() => db.complete(alice, 0), /unavailable/);
  assert.equal(db.profile(alice).xp, xp);
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
  assert.throws(() => db.saveRegion(db.internal(), ...UTD, []), /Sign in/);
  assert.throws(() => db.saveRegion(alice, 95, 0, []), /valid region/);
  assert.throws(() => db.beginPhoto(db.internal(), 0), /Sign in/);
});

test('an accepted bounty files a private capture with its photo, linked to the completion', () => {
  const { db, alice, bob } = setup({ AI_API_KEY: 'test-key' });
  assert.equal(db.captureVisibility, 'Private');
  db.putSlotFixture(alice, 'easy-birdwatch', 0);
  const photo = 'data:image/jpeg;base64,QUJD';
  db.finishPhoto(alice, 0, 'A grackle on a fence', undefined, { photo, creature: 'Great-tailed Grackle', verified: true });
  const [completion] = db.completions(alice);
  const [capture] = db.captures(alice);
  assert.equal(capture.completionId, completion.completionId);
  assert.equal(capture.templateId, 'easy-birdwatch');
  assert.equal(capture.bountyTarget, 'Wild Bird');
  assert.equal(capture.creature, 'Great-tailed Grackle');
  assert.equal(capture.verified, true);
  assert.equal(capture.photo, photo);
  assert.deepEqual(db.captures(bob), []);
});

test('captures need a valid photo, fall back to the bounty name, and are only filed for Bestiary quests', () => {
  const { db, alice } = setup();
  db.putSlotFixture(alice, 'easy-birdwatch', 0);
  assert.throws(() => db.finishPhoto(alice, 0, 'note', undefined, { photo: 'not a photo', creature: 'Bird', verified: false }), /JPEG, PNG or WebP/);
  assert.deepEqual(db.completions(alice), [], 'a rejected capture rolls back the completion');
  db.finishPhoto(alice, 0, 'note', undefined, { photo: 'data:image/jpeg;base64,QUJD', creature: '  ', verified: false });
  assert.equal(db.captures(alice)[0].creature, 'Wild Bird');
  assert.equal(db.captures(alice)[0].verified, false);

  db.putSlotFixture(alice, 'easy-paper-charm', 1);
  db.finishPhoto(alice, 1, 'A paper crane', undefined, { photo: 'data:image/jpeg;base64,QUJD', creature: 'Crane', verified: false });
  assert.equal(db.completions(alice).length, 2);
  assert.equal(db.captures(alice).length, 1, 'crafting quests do not create captures');
});

test('catalogue Bestiary quests carry bounty targets and older catalogues are backfilled', () => {
  const { db, alice } = setup();
  const bestiary = db.templates().filter(template => template.category.tag === 'Bestiary');
  assert.ok(bestiary.length >= 9);
  assert.ok(bestiary.every(template => template.bountyTarget));
  assert.ok(db.templates().filter(template => template.category.tag !== 'Bestiary').every(template => template.bountyTarget === undefined));
  db.patchTemplateForTest('easy-birdwatch', { bountyTarget: undefined });
  db.connect(alice);
  assert.equal(db.templates().find(template => template.templateId === 'easy-birdwatch').bountyTarget, 'Wild Bird');
});

test('players can star and unstar their own captures and journal entries, privately', () => {
  const { db, alice, bob } = setup();
  assert.equal(db.favoriteVisibility, 'Private');
  db.putSlotFixture(alice, 'easy-birdwatch', 0);
  db.finishPhoto(alice, 0, 'A grackle', undefined, { photo: 'data:image/jpeg;base64,QUJD', creature: 'Grackle', verified: true });
  const [capture] = db.captures(alice);
  const [completion] = db.completions(alice);
  db.toggleFavorite(alice, 'capture', capture.captureId);
  db.toggleFavorite(alice, 'completion', completion.completionId);
  assert.deepEqual(db.favorites(alice).map(row => [row.kind, row.itemId]).sort(), [['capture', capture.captureId], ['completion', completion.completionId]]);
  db.toggleFavorite(alice, 'capture', capture.captureId);
  assert.deepEqual(db.favorites(alice).map(row => row.kind), ['completion'], 'toggling again removes the star');
  assert.throws(() => db.toggleFavorite(bob, 'completion', completion.completionId), /not in your collection/);
  assert.throws(() => db.toggleFavorite(alice, 'player', 1n), /Only captures and journal entries/);
  assert.deepEqual(db.favorites(bob), []);
});
const response = (data, code = 200) => ({ code, headers: { entries: [] }, version: { tag: 'Http11' }, body: typeof data === 'string' ? data : JSON.stringify(data) });
const regionArgs = { latitude: 32.9858, longitude: -96.7501, label: 'Dallas', radiusMeters: 8000 };
const providerPlaces = { elements: [
  { type: 'node', id: 123, lat: 32.987, lon: -96.75, tags: { name: 'Public Garden', leisure: 'garden' } },
  { type: 'node', id: 124, lat: 32.987, lon: -96.75, tags: { name: 'Restricted Garden', leisure: 'garden', access: 'private' } },
  { type: 'node', id: 125, lat: 32.987, lon: -96.75, tags: { name: 'Closed Museum', tourism: 'museum', disused: 'yes' } },
  { type: 'node', id: 126, lat: 0, lon: 0, tags: { name: 'Faraway Park', leisure: 'park' } },
] };

test('trusted discovery filters provider places, rounds the region, caches across players, and never changes a board', () => {
  const { db, alice, bob } = setup();
  const before = bySlot(db.slots(alice));
  let requests = 0;
  const provider = (_test, request, body) => {
    requests++; assert.equal(request.uri, 'https://overpass-api.de/api/interpreter');
    assert.match(new TextDecoder().decode(body), /^data=/);
    return response(providerPlaces);
  };
  assert.match(db.discover(alice, regionArgs, provider), /1 verified places/);
  assert.equal(db.destinations(alice).length, 1);
  assert.equal(db.destinations(alice)[0].externalPlaceId, 'node/123');
  assert.deepEqual([db.area(alice).latitude, db.area(alice).longitude], [32.986, -96.75]);
  assert.deepEqual(bySlot(db.slots(alice)), before);
  db.discover(bob, regionArgs, provider);
  assert.equal(requests, 1, 'second player reuses the same provider cache');
  assert.ok(!db.destinations(alice)[0].playerIdentity.equals(db.destinations(bob)[0].playerIdentity));
  assert.throws(() => db.discover(alice, regionArgs, provider), /wait 30 seconds/);
});

test('failed, partial, malformed, and oversized provider responses preserve region and all assignments', () => {
  for (const result of [response('', 429), response('not json'), response({ remark: 'runtime error', elements: [] }), response({ hello: true }), response('x'.repeat(2_000_001))]) {
    const { db, alice } = setup();
    const before = bySlot(db.slots(alice));
    assert.throws(() => db.discover(alice, regionArgs, () => result));
    assert.equal(db.area(alice), undefined);
    assert.deepEqual(db.destinations(alice), []);
    assert.deepEqual(bySlot(db.slots(alice)), before);
  }
});

test('sparse successful discovery saves an empty region and initializes six Anywhere quests', () => {
  const { db, alice } = setup();
  db.removeSlotsForTest(alice);
  db.discover(alice, regionArgs, () => response({ elements: [] }));
  db.initialize(alice);
  assert.equal(db.slots(alice).length, 6);
  assert.ok(db.slots(alice).every(slot => slot.locationId === undefined));
  assert.ok(db.slots(alice).every(slot => db.resolved(alice, slot.templateId).latitude === undefined));
});

test('manual city search validates input, normalizes real results, caches responses and enforces provider-wide limits', () => {
  const { db, alice, bob } = setup();
  let calls = 0;
  const provider = (_test, req) => { calls++; assert.match(req.uri, /name=Dallas/); return response({ results: [{ name: 'Dallas', admin1: 'Texas', country: 'United States', latitude: 32.78, longitude: -96.8 }, { name: 'Invalid', latitude: 120, longitude: 0 }] }); };
  assert.throws(() => db.searchRegions(alice, 'x', provider), /between 2 and 100/);
  const results = JSON.parse(db.searchRegions(alice, 'Dallas', provider));
  assert.equal(results.length, 1); assert.equal(results[0].label, 'Dallas, Texas, United States');
  assert.equal(db.searchRegions(bob, 'dallas', provider), JSON.stringify(results)); assert.equal(calls, 1);
  db.advanceClock(1n);
  assert.throws(() => db.searchRegions(bob, 'Austin', provider), /wait 30 seconds/);
  assert.throws(() => db.searchRegions(db.internal(), 'Dallas', provider), /Sign in/);
});

test('location photo proof and party selection use the rendered destination and freeze party objectives', () => {
  const { db, alice } = setup();
  db.removeSlotsForTest(alice); db.saveRegion(alice, ...UTD, placesAround(UTD, 'Campus')); db.initialize(alice);
  const slot = db.slots(alice).find(row => row.locationId !== undefined);
  const quest = db.beginPhoto(alice, slot.slotIndex);
  assert.match(quest.photoGoal, /Campus/); assert.ok(!quest.photoGoal.includes('{location}'));
  db.setUsername(alice, 'Ranger'); db.social.createParty(alice); db.social.setPartyQuest(alice, slot.templateId);
  assert.equal(db.social.party(alice).questTitle, quest.title);
  db.advanceClock(1n); db.reroll(alice, slot.slotIndex);
  db.saveRegion(alice, ...AUSTIN, placesAround(AUSTIN, 'Austin'));
  assert.equal(db.social.party(alice).questTitle, quest.title);
});
test('a slow older discovery cannot overwrite a newer deliberate region selection', () => {
  const { db, alice } = setup();
  const before = bySlot(db.slots(alice));
  assert.throws(() => db.discover(alice, regionArgs, () => {
    db.advanceClock(31_000_000n);
    db.discover(alice, { ...regionArgs, latitude: 30.2672, longitude: -97.7431, label: 'Austin' }, () => response({ elements: [] }));
    return response(providerPlaces);
  }), /newer region selection/);
  assert.equal(db.area(alice).label, 'Austin');
  assert.deepEqual(bySlot(db.slots(alice)), before);
});

test('app-wide provider budgets stop further requests without changing existing player data', () => {
  const { db, alice } = setup();
  const before = bySlot(db.slots(alice));
  let calls = 0;
  for (let index = 0; index < 250; index++) {
    db.advanceClock(31_000_000n);
    db.discover(alice, { ...regionArgs, latitude: 32 + index / 1000 }, () => { calls++; return response({ elements: [] }); });
  }
  const saved = db.area(alice);
  db.advanceClock(31_000_000n);
  assert.throws(() => db.discover(alice, { ...regionArgs, latitude: 34 }, () => { calls++; return response({ elements: [] }); }), /limit has been reached/);
  assert.equal(calls, 250);
  assert.deepEqual(db.area(alice), saved);
  assert.deepEqual(bySlot(db.slots(alice)), before);
});
