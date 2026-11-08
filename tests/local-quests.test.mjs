import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

let server;
let geo;
let places;
let generator;
let model;
before(async () => {
  server = await createServer({
    configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error',
  });
  geo = await server.ssrLoadModule('/shared/geo.ts');
  places = await server.ssrLoadModule('/shared/nearby-places.ts');
  generator = await server.ssrLoadModule('/spacetimedb/src/local-quests.ts');
  model = await server.ssrLoadModule('/spacetimedb/src/quest-model.ts');
});
after(async () => { await server?.close(); });

const UTD = [32.9858, -96.7501];
const DOWNTOWN_DALLAS = [32.7767, -96.797];

test('distance uses great-circle metres and rounding keeps about 100 m precision', () => {
  assert.equal(geo.distanceMeters(...UTD, ...UTD), 0);
  const distance = geo.distanceMeters(...UTD, ...DOWNTOWN_DALLAS);
  assert.ok(distance > 22_000 && distance < 25_000, `unexpected distance ${distance}`);
  assert.equal(geo.roundCoordinate(32.98584, 3), 32.986);
  assert.equal(geo.validLatitudeLongitude(91, 0), false);
  assert.equal(geo.validLatitudeLongitude(Number.NaN, 0), false);
});

test('Overpass query searches a bounding box around the requested point for named places', () => {
  const query = places.overpassQuery(...UTD, 8000);
  assert.match(query, /\[out:json\]/);
  const [south, west, north, east] = query.match(/\[bbox:([^\]]+)\]/)[1].split(',').map(Number);
  assert.ok(south < UTD[0] && UTD[0] < north && west < UTD[1] && UTD[1] < east);
  assert.ok(Math.abs((north - south) * 111_320 - 16_000) < 50);
  assert.match(query, /\["name"\]/);
  assert.match(query, /out center/);
});

test('client-sent places are re-validated: unknown kinds, bad ids, far points and unsuitable names are dropped', () => {
  const near = { latitude: 32.99, longitude: -96.75 };
  const result = places.sanitizePlaces([
    { id: 'node/1', name: '  Lone   Oak Park ', kind: 'park', ...near },
    { id: 'node/2', name: 'Secret Lab', kind: 'laboratory', ...near },
    { id: 'javascript:alert(1)', name: 'Bad Id', kind: 'park', ...near },
    { id: 'node/3', name: 'Faraway Falls', kind: 'viewpoint', latitude: 40, longitude: -96.75 },
    { id: 'node/4', name: 'Northrich Elementary Playground', kind: 'park', ...near },
    { id: 'node/5', name: 'Hilltop Cemetery', kind: 'historic site', ...near },
    { id: 'node/6', name: 'X', kind: 'park', ...near },
    { id: 'node/7', name: 'Line\u0000Break Garden', kind: 'garden', latitude: Number.NaN, longitude: -96.75 },
    { id: 'node/8', name: 'Clock Tower', kind: 'monument', latitude: 32.987, longitude: -96.75, distance: 0 },
  ], ...UTD, 8000);
  assert.deepEqual(result.map(place => place.name), ['Clock Tower', 'Lone Oak Park']);
  assert.ok(result[0].distance > 100, 'distance is recomputed rather than trusted');
});

test('Overpass parsing keeps named, well-formed places nearest first and drops the rest', () => {
  const body = JSON.stringify({ elements: [
    { type: 'node', id: 1, lat: 32.99, lon: -96.75, tags: { name: 'Lone Oak Park', leisure: 'park' } },
    { type: 'way', id: 2, center: { lat: 32.98, lon: -96.75 }, tags: { name: 'Mirror  Pond', natural: 'water' } },
    { type: 'node', id: 3, lat: 32.986, lon: -96.75, tags: { leisure: 'park' } },
    { type: 'node', id: 4, lat: 33.02, lon: -96.75, tags: { name: 'lone oak park', leisure: 'park' } },
    { type: 'node', id: 5, lat: 32.987, lon: -96.75, tags: { name: 'Parking Garage', amenity: 'parking' } },
    { type: 'node', id: 6, lat: 34.5, lon: -96.75, tags: { name: 'Far Peak', natural: 'peak' } },
    { type: 'node', id: 7, lat: 'bad', lon: -96.75, tags: { name: 'Broken', tourism: 'viewpoint' } },
    { type: 'node', id: 8, lat: 32.988, lon: -96.751, tags: { name: 'Founders Plaque', historic: 'memorial' } },
    null,
  ] });
  const result = places.parseOverpassPlaces(body, ...UTD, 8000);
  assert.deepEqual(result.map(place => [place.name, place.kind]), [
    ['Founders Plaque', 'memorial'], ['Lone Oak Park', 'park'], ['Mirror Pond', 'lake or pond'],
  ]);
  assert.deepEqual(result.map(place => place.id), ['node/8', 'node/1', 'way/2']);
  assert.ok(result.every((place, index) => index === 0 || result[index - 1].distance <= place.distance));
  assert.deepEqual(places.parseOverpassPlaces('not json', ...UTD, 8000), []);
  assert.deepEqual(places.parseOverpassPlaces('{"elements":"nope"}', ...UTD, 8000), []);
});

function placeAt(name, kind, metresNorth) {
  return { id: `node/${name}`, name, kind, latitude: UTD[0] + metresNorth / 111_000, longitude: UTD[1], distance: metresNorth };
}

const neighbourhood = [
  placeAt('Pocket Park', 'park', 400), placeAt('Duck Pond', 'lake or pond', 900), placeAt('Clock Tower', 'monument', 1200),
  placeAt('Arbor Garden', 'garden', 1800), placeAt('River Overlook', 'viewpoint', 2500), placeAt('History Museum', 'museum', 3500),
  placeAt('Prairie Reserve', 'nature reserve', 5000), placeAt('Granite Peak', 'peak', 6500), placeAt('Old Mill', 'historic site', 7500),
];

test('generated local quests are valid, private-ready templates in all three categories', () => {
  let next = 0;
  const quests = generator.generateLocalQuests(neighbourhood, () => 0, () => `local-${String(next++).padStart(12, '0')}`);
  assert.ok(quests.length > 0 && quests.length <= 18);
  for (const quest of quests) {
    assert.equal(model.validateTemplate(quest), null, `${quest.title}: ${model.validateTemplate(quest)}`);
    assert.ok(quest.photoGoal.length > 5);
    assert.equal(quest.xpReward, model.rewardForDifficulty(quest.difficulty));
    assert.ok(quest.locationName && quest.latitude !== undefined && quest.longitude !== undefined);
  }
  for (const category of ['Exploration', 'Bestiary', 'Crafting']) assert.ok(quests.some(quest => quest.category.tag === category), category);
  for (const difficulty of ['Easy', 'Medium', 'Hard']) assert.ok(quests.some(quest => quest.difficulty.tag === difficulty), difficulty);
  assert.equal(new Set(quests.map(quest => quest.templateId)).size, quests.length);
});

test('difficulty follows distance and Bestiary quests only use natural places', () => {
  const quests = generator.generateLocalQuests(neighbourhood, n => n - 1, (() => { let i = 0; return () => `local-${String(i++).padStart(12, '0')}`; })());
  const distanceOf = quest => neighbourhood.find(place => place.name === quest.locationName).distance;
  for (const quest of quests.filter(quest => quest.difficulty.tag === 'Easy')) assert.ok(distanceOf(quest) <= 1500, quest.title);
  for (const quest of quests.filter(quest => quest.difficulty.tag === 'Medium')) assert.ok(distanceOf(quest) <= 4000, quest.title);
  const natural = new Set(['park', 'nature reserve', 'garden', 'lake or pond', 'woods', 'beach', 'picnic area']);
  for (const quest of quests.filter(quest => quest.category.tag === 'Bestiary')) {
    assert.ok(natural.has(neighbourhood.find(place => place.name === quest.locationName).kind), quest.title);
  }
});

test('an area with no named places produces no local quests', () => {
  assert.deepEqual(generator.generateLocalQuests([], () => 0, () => 'local-000000000000'), []);
});

test('every local Bestiary quest is a bounty for a creature suited to its place', () => {
  let next = 0;
  const quests = generator.generateLocalQuests(neighbourhood, n => n - 1, () => `local-${String(next++).padStart(12, '0')}`);
  const bestiary = quests.filter(quest => quest.category.tag === 'Bestiary');
  assert.ok(bestiary.length >= 3);
  for (const quest of bestiary) {
    assert.match(quest.title, /^Wanted: /);
    assert.equal(quest.title, `Wanted: ${quest.bountyTarget}`);
    assert.match(quest.description, /bounty is posted at/);
    assert.match(quest.photoGoal, /photographed in the wild/);
    assert.equal(model.validateTemplate(quest), null);
  }
  for (const quest of quests.filter(quest => quest.category.tag !== 'Bestiary')) assert.equal(quest.bountyTarget, undefined);
  const pondBounties = new Set(['Duck or Goose', 'Wild Bird', 'Turtle', 'Dragonfly', 'Heron or Egret', 'Kingfisher']);
  for (const quest of bestiary.filter(quest => quest.locationName === 'Duck Pond')) assert.ok(pondBounties.has(quest.bountyTarget), quest.bountyTarget);
});

test('bounty targets are only allowed on Bestiary quests', () => {
  const base = { questType: { tag: 'Anywhere' }, requiredLocationType: undefined, templateId: 'local-000000000001', title: 'Scout the Park', description: 'Walk to the park and look around.', category: { tag: 'Exploration' }, difficulty: { tag: 'Easy' }, xpReward: 50, isActive: true };
  assert.match(model.validateTemplate({ ...base, bountyTarget: 'Duck' }), /Only Bestiary quests/);
  assert.equal(model.validateTemplate({ ...base, category: { tag: 'Bestiary' }, bountyTarget: 'Duck' }), null);
  assert.match(model.validateTemplate({ ...base, category: { tag: 'Bestiary' }, bountyTarget: 'x' }), /2 to 60/);
});

test('place scoring favours interesting places at a fitting distance and penalises repeats and clusters', () => {
  const at = (name, kind, metres, north = metres) => ({ id: `node/${name.length}${metres}`, name, kind, latitude: UTD[0] + north / 111_000, longitude: UTD[1], distance: metres });
  const viewpoint = at('Ridge Overlook', 'viewpoint', 700);
  const fountain = at('Plaza Fountain', 'fountain', 700);
  assert.ok(generator.scorePlace(viewpoint, 'Easy', []) > generator.scorePlace(fountain, 'Easy', []));
  assert.ok(generator.scorePlace(viewpoint, 'Easy', []) > generator.scorePlace(at('Far Overlook', 'viewpoint', 1500), 'Easy', []), 'closer to the Easy sweet spot');
  const statue = at('Statue One', 'artwork', 600);
  assert.ok(generator.scorePlace(at('Statue Two', 'artwork', 620), 'Easy', [statue]) < generator.scorePlace(at('Statue Two', 'artwork', 620), 'Easy', []), 'same kind and nearby is penalised');
});

test('a crowded cluster of minor places does not take over the Easy quests', () => {
  const cluster = Array.from({ length: 8 }, (_, index) => ({ id: `node/${100 + index}`, name: `Campus Art ${index}`, kind: 'artwork', latitude: UTD[0] + (300 + index * 5) / 111_000, longitude: UTD[1], distance: 300 + index * 5 }));
  const highlights = [
    { id: 'node/1', name: 'Lone Oak Park', kind: 'park', latitude: UTD[0] + 800 / 111_000, longitude: UTD[1], distance: 800 },
    { id: 'node/2', name: 'Ridge Overlook', kind: 'viewpoint', latitude: UTD[0] - 900 / 111_000, longitude: UTD[1], distance: 900 },
    { id: 'node/3', name: 'Old Mill', kind: 'historic site', latitude: UTD[0], longitude: UTD[1] + 1000 / 93_000, distance: 1000 },
  ];
  for (let seed = 0; seed < 10; seed++) {
    let state = seed + 1;
    const random = n => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
    let next = 0;
    const easy = generator.generateLocalQuests([...cluster, ...highlights], random, () => `local-${String(next++).padStart(12, '0')}`).filter(quest => quest.difficulty.tag === 'Easy');
    const fromCluster = easy.filter(quest => quest.locationName.startsWith('Campus Art')).length;
    assert.ok(fromCluster <= Math.ceil(easy.length / 2), `seed ${seed}: ${fromCluster} of ${easy.length} Easy quests in one cluster`);
    assert.ok(easy.some(quest => ['Ridge Overlook', 'Old Mill', 'Lone Oak Park'].includes(quest.locationName)));
  }
});

test('exploration and crafting wording fits the kind of place and varies', () => {
  const places = [
    { id: 'node/11', name: 'Ridge Overlook', kind: 'viewpoint', latitude: UTD[0] + 0.005, longitude: UTD[1], distance: 550 },
    { id: 'node/12', name: 'History Museum', kind: 'museum', latitude: UTD[0] - 0.006, longitude: UTD[1], distance: 660 },
    { id: 'node/13', name: 'Founders Plaque', kind: 'memorial', latitude: UTD[0], longitude: UTD[1] + 0.007, distance: 650 },
  ];
  const titles = new Set();
  for (let seed = 0; seed < 12; seed++) {
    let state = seed + 7;
    const random = n => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
    let next = 0;
    for (const quest of generator.generateLocalQuests(places, random, () => `local-${String(next++).padStart(12, '0')}`)) {
      titles.add(quest.title);
      assert.equal(model.validateTemplate(quest), null, quest.title);
      if (quest.category.tag !== 'Exploration') continue;
      if (quest.locationName === 'Ridge Overlook') assert.match(quest.photoGoal, /view/);
      if (quest.locationName === 'History Museum') assert.match(quest.photoGoal, /sign or entrance/);
      if (quest.locationName === 'Founders Plaque') assert.match(quest.photoGoal, /plaque or historical marker/);
    }
  }
  assert.ok(titles.size >= 8, `only ${titles.size} distinct titles`);
});

test('administrative or bare one-word landmark names rank lower, and only walkable places get map quests', () => {
  const at = (name, kind) => ({ id: 'node/1', name, kind, latitude: UTD[0], longitude: UTD[1], distance: 700 });
  assert.ok(generator.nameQuality(at('Campus Landscape Enhancement Phase III', 'monument')) < 0);
  assert.ok(generator.nameQuality(at('Liberty Park Tank', 'attraction')) < 0);
  assert.ok(generator.nameQuality(at('Endless', 'artwork')) < 0);
  assert.equal(generator.nameQuality(at('Jack S. Kilby', 'artwork')), 0);
  assert.equal(generator.nameQuality(at('Eldorado', 'park')), 0, 'one-word park names are fine');

  const art = [{ id: 'node/9', name: 'Over the Moon', kind: 'artwork', latitude: UTD[0] + 0.045, longitude: UTD[1], distance: 5000 }];
  for (let seed = 0; seed < 8; seed++) {
    let state = seed + 3;
    const random = n => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
    for (const quest of generator.generateLocalQuests(art, random, () => 'local-000000000001')) {
      if (quest.category.tag === 'Crafting' && quest.difficulty.tag === 'Hard') assert.doesNotMatch(quest.title, /^A Map of/);
    }
  }
});
