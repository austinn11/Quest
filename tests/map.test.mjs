import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';
import { locatedQuests, validCoordinates, directionsUrl } from '../src/map/quest-locations.ts';
import { parchmentStyle } from '../src/map/parchment-style.ts';
import { completionMapLocation, questMapPath, resolveQuestMapTarget } from '../src/map/quest-navigation.ts';
import { Timestamp } from 'spacetimedb';

let server;
let createPlayerHarness;
let defaultMapCenter;
before(async () => {
  server = await createServer({ configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
  ({ defaultMapCenter } = await server.ssrLoadModule('/src/map/map-settings.ts'));
});
after(async () => { await server?.close(); });

test('coordinate validation preserves geographic axes, accepts zero, and excludes invalid or partial locations', () => {
  for (const [lat, lng] of [[0, 0], [90, -180], [-90, 180], [32.9858, -96.7501]]) assert.equal(validCoordinates(lat, lng), true);
  for (const [lat, lng] of [[undefined, 1], [1, undefined], [NaN, 0], [0, Infinity], [91, 0], [0, -181], ['32', -96]]) assert.equal(validCoordinates(lat, lng), false);
  assert.deepEqual(defaultMapCenter(), [-96.7501, 32.9858]);
  assert.deepEqual(defaultMapCenter('0', '0'), [0, 0]);
  assert.deepEqual(defaultMapCenter('32.8', '-96.8'), [-96.8, 32.8]);
  assert.deepEqual(defaultMapCenter('91', '-96'), [-96.7501, 32.9858]);
});

test('map assignments share the real private board and react to completion and refreshed locations', () => {
  const db = createPlayerHarness();
  const alice = db.auth('map-alice');
  const bob = db.auth('map-bob');
  db.seedTemplates();
  db.ensure(alice);
  db.ensure(bob);
  db.putSlotFixture(alice, 'easy-white-rock-scout', 0);
  db.putSlotFixture(alice, 'easy-paper-charm', 1);
  db.putSlotFixture(bob, 'easy-lagoon-watch', 0);
  const board = db.slots(alice);
  const original = locatedQuests(board, db.templates());
  assert.equal(original.length, 1);
  assert.deepEqual(original[0].coordinates, [-96.7284, 32.8158]);
  assert.equal(original[0].slot.status.tag, 'Available');
  assert.equal(original[0].template.locationName, 'Old Fish Hatchery Nature Area / White Rock Lake');
  db.complete(alice, 0);
  const completed = locatedQuests(db.slots(alice), db.templates());
  assert.equal(completed.length, 1);
  assert.equal(completed[0].key, original[0].key);
  assert.equal(completed[0].slot.status.tag, 'Cooldown');
  const bobBefore = locatedQuests(db.slots(bob), db.templates());
  // New geographic assignments use a reusable recipe and verified region location.
  db.saveRegion(alice, 32.7781, -96.7622, [{ id: 'node/123', name: 'Test Lagoon', kind: 'park', latitude: 32.7781, longitude: -96.7622 }]);
  for (const template of db.templates().filter(template => template.difficulty.tag === 'Easy')) db.setTemplateActiveForTest(template.templateId, template.templateId === 'region-easy-green-scout');
  db.advanceClock(2n * 3_600_000_000n);
  db.refresh(alice);
  const refreshed = locatedQuests(db.slots(alice), db.slots(alice).map(s => db.resolved(alice, s.templateId)));
  assert.equal(refreshed.length, 1);
  assert.notEqual(refreshed[0].key, original[0].key);
  assert.deepEqual(refreshed[0].coordinates, [-96.7622, 32.7781]);
  assert.equal(refreshed[0].slot.status.tag, 'Available');
  assert.equal(db.completions(alice)[0].templateId, original[0].template.templateId);
  assert.equal(db.templates().find(t => t.templateId === db.completions(alice)[0].templateId).locationName, original[0].template.locationName);
  assert.deepEqual(locatedQuests(db.slots(bob), db.templates()).map(q => [q.key, q.slot, q.coordinates]), bobBefore.map(q => [q.key, q.slot, q.coordinates]));
});

test('location projection deduplicates assignments, preserves inactive assigned templates, and omits missing data', () => {
  const slot = { slotId: 'player:0', slotIndex: 0, assignedAt: Timestamp.UNIX_EPOCH, templateId: 'one', status: { tag: 'Available' } };
  const template = { templateId: 'one', latitude: 0, longitude: 0, isActive: false };
  assert.equal(locatedQuests([slot, slot], [template]).length, 1);
  assert.deepEqual(locatedQuests([slot], []), []);
  assert.deepEqual(locatedQuests([slot], [{ ...template, longitude: undefined }]), []);
  assert.equal(locatedQuests([slot], [template]).length, 1);
  const url = new URL(directionsUrl(locatedQuests([slot], [template])[0]));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('destination'), '0,0');
  assert.equal(url.searchParams.has('origin'), false);
});

test('map links identify exact subscribed assignments, survive completion, and do not expose player identities', () => {
  const db = createPlayerHarness();
  const auth = db.auth('linked-adventurer');
  db.seedTemplates(); db.ensure(auth);
  db.putSlotFixture(auth, 'easy-white-rock-scout', 0);
  const slot = db.slots(auth)[0];
  const href = questMapPath(slot);
  assert.ok(!href.includes(slot.playerIdentity.toHexString()));
  const search = new URL(href, 'https://quest.example').search;
  const selection = () => resolveQuestMapTarget(search, db.slots(auth), locatedQuests(db.slots(auth), db.templates()));
  assert.equal(selection().kind, 'selected');
  assert.equal(selection().quest.slot.status.tag, 'Available');
  db.complete(auth, 0);
  assert.equal(selection().kind, 'selected');
  assert.equal(selection().quest.slot.status.tag, 'Cooldown');
  assert.equal(completionMapLocation(db.completions(auth)[0], locatedQuests(db.slots(auth), db.templates())).key, selection().quest.key);
  db.advanceClock(2n * 3_600_000_000n);
  db.refresh(auth);
  assert.equal(selection().kind, 'stale');
  assert.equal(completionMapLocation(db.completions(auth)[0], locatedQuests(db.slots(auth), db.templates())), undefined);
});

test('stale map targets never select replacement quests, even when a template is repeated', () => {
  const slot = { slotId: 'player:0', slotIndex: 0, templateId: 'one', assignedAt: new Timestamp(9007199254740993n), status: { tag: 'Available' } };
  const template = { templateId: 'one', latitude: 32, longitude: -96 };
  const href = questMapPath(slot);
  const search = new URL(href, 'https://quest.example').search;
  assert.ok(href.includes('9007199254740993'));
  assert.equal(resolveQuestMapTarget(search, [slot], locatedQuests([slot], [template])).kind, 'selected');
  const replacement = { ...slot, assignedAt: new Timestamp(9007199254740994n) };
  assert.equal(resolveQuestMapTarget(search, [replacement], locatedQuests([replacement], [template])).kind, 'stale');
  assert.equal(resolveQuestMapTarget(search, [slot], []).kind, 'unmapped');
  assert.equal(resolveQuestMapTarget('?latitude=32&longitude=-96', [slot], []).kind, 'none');
});

test('malformed map links fail safely without selecting an unrelated quest', () => {
  for (const search of ['?slot=6&assignedAt=0', '?slot=-1&assignedAt=0', '?slot=0', '?assignedAt=0', '?slot=0&assignedAt=1.5', '?slot=0&assignedAt=9223372036854775808', '?slot=0&assignedAt=abc', '?slot=0&assignedAt=0&slot=1']) {
    assert.equal(resolveQuestMapTarget(search, [], []).kind, 'invalid');
  }
  assert.equal(resolveQuestMapTarget('', [], []).kind, 'none');
});

test('historical map links are not reused for later completions of the same slot and template', () => {
  const slot = { slotId: 'player:0', slotIndex: 0, templateId: 'one', assignedAt: new Timestamp(100n), completedAt: new Timestamp(200n), status: { tag: 'Cooldown' } };
  const template = { templateId: 'one', latitude: 32, longitude: -96 };
  const history = { templateId: 'one', slotIndex: 0, completedAt: new Timestamp(50n) };
  assert.equal(completionMapLocation(history, locatedQuests([slot], [template])), undefined);
  assert.ok(completionMapLocation({ ...history, completedAt: slot.completedAt }, locatedQuests([slot], [template])));
});

test('geographic catalogue seeds named, validated locations without overwriting existing assignments or metadata', () => {
  const db = createPlayerHarness();
  db.seedTemplates();
  const locations = db.templates().filter(t => t.latitude !== undefined);
  assert.equal(locations.length, 7);
  assert.equal(new Set(locations.map(t => `${t.latitude}:${t.longitude}`)).size, 7);
  for (const template of locations) { assert.ok(template.locationName); assert.ok(template.locationType); assert.equal(db.model.validateTemplate(template), null); }
  const campus = db.templates().find(t => t.templateId === 'easy-campus-scout');
  assert.ok(db.model.validateTemplate({ ...campus, locationName: ' ' }));
  assert.ok(db.model.validateTemplate({ ...campus, locationName: 'x'.repeat(161) }));
  assert.ok(db.model.validateTemplate({ ...campus, latitude: undefined, longitude: undefined }));
  db.patchTemplateForTest(campus.templateId, { locationName: undefined, locationType: undefined, isActive: false });
  db.seedTemplates();
  assert.equal(db.templates().find(t => t.templateId === campus.templateId).locationName, campus.locationName);
  assert.equal(db.templates().find(t => t.templateId === campus.templateId).isActive, false);
  db.patchTemplateForTest(campus.templateId, { locationName: 'Team supplied label' });
  db.seedTemplates();
  assert.equal(db.templates().find(t => t.templateId === campus.templateId).locationName, 'Team supplied label');
});

test('parchment styling preserves geographic sources, attribution, labels and layer geometry', () => {
  const style = { version: 8, sources: { world: { type: 'vector', url: 'https://example.com/tiles.json', attribution: 'Attribution stays visible' } }, layers: [
    { id: 'land', type: 'background', paint: { 'background-color': 'white' } },
    { id: 'water', type: 'fill', source: 'world', 'source-layer': 'water', paint: { 'fill-color': 'blue' } },
    { id: 'road', type: 'line', source: 'world', paint: { 'line-color': 'grey', 'line-width': 3 } },
    { id: 'names', type: 'symbol', source: 'world', layout: { 'text-field': ['get', 'name'] } },
  ] };
  const next = parchmentStyle(style);
  assert.deepEqual(next.sources, style.sources);
  assert.deepEqual(next.layers[3].layout, style.layers[3].layout);
  assert.equal(next.layers[2].paint['line-width'], 3);
  assert.notEqual(next.layers[1].paint['fill-color'], 'blue');
  assert.equal(style.layers[1].paint['fill-color'], 'blue');
});
