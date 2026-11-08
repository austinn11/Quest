import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

let server;
let seeds;
let createPlayerHarness;
before(async () => {
  server = await createServer({ configFile: false, plugins: [spacetimedbModuleTestPlugin()], ssr: { noExternal: ['spacetimedb'] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  seeds = await server.ssrLoadModule('/spacetimedb/src/quest-seeds.ts');
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});
after(async () => { await server?.close(); });

test('every catalogue quest asks for the photo that proves it', () => {
  for (const quest of seeds.seedTemplates) {
    assert.match(quest.description, /photograph/i, `${quest.templateId} should say what to photograph`);
    assert.ok(quest.photoGoal, `${quest.templateId} needs a photo goal`);
    assert.doesNotMatch(quest.description, /\b(note|record|research|write down|document|compare)\b/i, `${quest.templateId} asks for something a photo cannot prove`);
  }
});

test('publishing refreshes the wording of quests already in the catalogue', () => {
  const db = createPlayerHarness();
  db.seedTemplates();
  db.patchTemplateForTest('easy-campus-scout', { title: 'Old title', description: 'Note one detail.', photoGoal: 'Old goal' });
  db.seedTemplates();
  const current = seeds.seedTemplates.find(quest => quest.templateId === 'easy-campus-scout');
  const stored = db.templates().find(quest => quest.templateId === 'easy-campus-scout');
  assert.equal(stored.title, current.title);
  assert.equal(stored.description, current.description);
  assert.equal(stored.photoGoal, current.photoGoal);
});

test('a region quest names its destination with the kind of place', async () => {
  const { atDestination } = await server.ssrLoadModule('/shared/quest-destinations.ts');
  const recipe = seeds.seedTemplates.find(quest => quest.templateId === 'region-easy-sketch-place');
  const quest = atDestination(recipe, { name: 'Big Bend', locationType: 'artwork', latitude: 32.98, longitude: -96.75 });
  assert.equal(quest.title, 'Sketch Big Bend');
  assert.match(quest.description, /^Visit Big Bend \(an artwork\), draw a sketch/);
  assert.doesNotMatch(quest.description, /\{location\}/);
});
