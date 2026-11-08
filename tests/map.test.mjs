import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';
import { locatedQuests, validCoordinates, directionsUrl } from '../src/map/quest-locations.ts';
import { parchmentStyle } from '../src/map/parchment-style.ts';
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
  // Restrict eligible replacements to the second verified destination.
  for (const template of db.templates().filter(template => template.difficulty.tag === 'Easy')) db.setTemplateActiveForTest(template.templateId, template.templateId === 'easy-lagoon-watch');
  db.advanceClock(2n * 3_600_000_000n);
  db.refresh(alice);
  const refreshed = locatedQuests(db.slots(alice), db.templates());
  assert.equal(refreshed.length, 1);
  assert.notEqual(refreshed[0].key, original[0].key);
  assert.deepEqual(refreshed[0].coordinates, [-96.7622, 32.7781]);
  assert.equal(refreshed[0].slot.status.tag, 'Available');
  assert.equal(db.completions(alice)[0].templateId, original[0].template.templateId);
  assert.equal(db.templates().find(t => t.templateId === db.completions(alice)[0].templateId).locationName, original[0].template.locationName);
  assert.deepEqual(locatedQuests(db.slots(bob), db.templates()), bobBefore);
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
