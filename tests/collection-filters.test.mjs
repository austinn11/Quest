import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let filters;
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  filters = await server.ssrLoadModule('/src/collection/filters.ts');
});
after(async () => { await server?.close(); });

const at = micros => ({ microsSinceUnixEpoch: BigInt(micros) });

test('search matches every word anywhere, ignoring case and accents', () => {
  assert.equal(filters.matchesSearch('', 'anything'), true);
  assert.equal(filters.matchesSearch('great egret', 'Great Egret', 'Duck Pond'), true);
  assert.equal(filters.matchesSearch('egret pond', 'Great Egret', 'Duck Pond'), true);
  assert.equal(filters.matchesSearch('heron', 'Great Egret', 'Duck Pond'), false);
  assert.equal(filters.matchesSearch('cafe', 'Café Garden'), true);
});

const captures = [
  { captureId: 1n, creature: 'Mallard', bountyTarget: 'Duck or Goose', locationName: 'Reflection Pools', verified: true, capturedAt: at(1) },
  { captureId: 2n, creature: 'Northern Cardinal', bountyTarget: 'Songbird', locationName: 'Rock Garden', verified: false, capturedAt: at(3) },
  { captureId: 3n, creature: 'Great Egret', bountyTarget: 'Heron or Egret', locationName: 'Duck Pond', verified: true, capturedAt: at(2) },
];
const names = rows => rows.map(row => row.creature);

test('bestiary filters by search, AI check and favorites, and sorts four ways', () => {
  const none = new Set();
  const base = filters.DEFAULT_BESTIARY_FILTERS;
  assert.deepEqual(names(filters.filterCaptures(captures, base, none)), ['Northern Cardinal', 'Great Egret', 'Mallard']);
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, sort: 'oldest' }, none)), ['Mallard', 'Great Egret', 'Northern Cardinal']);
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, sort: 'name' }, none)), ['Great Egret', 'Mallard', 'Northern Cardinal']);
  const rewards = { 1: 50, 2: 100, 3: 200 };
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, sort: 'reward' }, none, capture => rewards[Number(capture.captureId)])), ['Great Egret', 'Northern Cardinal', 'Mallard']);
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, search: 'pond' }, none)), ['Great Egret']);
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, search: 'duck' }, none)), ['Great Egret', 'Mallard'], 'bounty and place both count');
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, check: 'unchecked' }, none)), ['Northern Cardinal']);
  assert.deepEqual(names(filters.filterCaptures(captures, { ...base, favoritesOnly: true }, new Set(['1']))), ['Mallard']);
});

const templates = {
  scout: { title: 'Scout the Campus', description: 'Walk to a landmark.', category: { tag: 'Exploration' }, difficulty: { tag: 'Easy' }, locationName: 'UT Dallas' },
  bread: { title: 'Freshly Baked', description: 'Bake a loaf of bread.', category: { tag: 'Crafting' }, difficulty: { tag: 'Hard' } },
  birds: { title: 'Wanted: Wild Bird', description: 'Photograph a bird.', category: { tag: 'Bestiary' }, difficulty: { tag: 'Easy' } },
};
const completions = [
  { completionId: 1n, templateId: 'scout', xpAwarded: 50, completedAt: at(1) },
  { completionId: 2n, templateId: 'bread', xpAwarded: 200, completedAt: at(2) },
  { completionId: 3n, templateId: 'birds', xpAwarded: 50, completedAt: at(3), proofNote: 'A blue jay on a branch' },
];
const titles = rows => rows.map(row => templates[row.templateId].title);

test('journal filters by search, category, difficulty and favorites, and sorts by time or XP', () => {
  const none = new Set();
  const base = filters.DEFAULT_JOURNAL_FILTERS;
  const templateOf = completion => templates[completion.templateId];
  assert.deepEqual(titles(filters.filterCompletions(completions, base, none, templateOf)), ['Wanted: Wild Bird', 'Freshly Baked', 'Scout the Campus']);
  assert.deepEqual(titles(filters.filterCompletions(completions, { ...base, sort: 'xp' }, none, templateOf))[0], 'Freshly Baked');
  assert.deepEqual(titles(filters.filterCompletions(completions, { ...base, category: 'Crafting' }, none, templateOf)), ['Freshly Baked']);
  assert.deepEqual(titles(filters.filterCompletions(completions, { ...base, difficulty: 'Easy', sort: 'oldest' }, none, templateOf)), ['Scout the Campus', 'Wanted: Wild Bird']);
  assert.deepEqual(titles(filters.filterCompletions(completions, { ...base, search: 'blue jay' }, none, templateOf)), ['Wanted: Wild Bird'], 'the AI note is searchable');
  assert.deepEqual(titles(filters.filterCompletions(completions, { ...base, search: 'dallas' }, none, templateOf)), ['Scout the Campus']);
  assert.deepEqual(titles(filters.filterCompletions(completions, { ...base, favoritesOnly: true }, new Set(['2']), templateOf)), ['Freshly Baked']);
});
