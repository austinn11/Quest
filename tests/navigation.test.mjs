import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { Timestamp } from 'spacetimedb';
import { postLoginPath } from '../src/auth/return-path.ts';

let server;
let renderPage;

before(async () => {
  server = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    logLevel: 'error',
  });
  ({ renderPage } = await server.ssrLoadModule('/tests/navigation-harness.tsx'));
});

after(async () => { await server?.close(); });

const pages = [
  ['/', 'Dashboard'],
  ['/map', 'World Map'],
  ['/questboard', 'Questboard'],
  ['/journal', 'Quest Journal'],
  ['/profile', 'Player Profile'],
];

for (const [path, title] of pages) {
  test(`${path} renders its page with all navigation links and one active item`, () => {
    const html = renderPage(path);
    assert.ok(html.includes(`<h1>${title}</h1>`));
    const nav = html.match(/<nav\b[^>]*aria-label="Main navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    const links = [...nav.matchAll(/<a\b([^>]*)>/g)].map(match => match[1]);
    assert.deepEqual(links.map(link => link.match(/href="([^"]*)"/)[1]), pages.map(page => page[0]));
    const active = links.filter(link => link.includes('aria-current="page"'));
    assert.equal(active.length, 1);
    assert.ok(active[0].includes(`href="${path}"`));
    assert.ok(html.includes('Sign out'));
  });
}

test('profile route retains the username editor and progression display', () => {
  const html = renderPage('/profile');
  assert.ok(html.includes('TestHero'));
  assert.ok(html.includes('Edit username'));
  assert.ok(html.includes('Total XP'));
  assert.ok(html.includes('150'));
});

test('world map lists only assigned geographic quests and retains non-geographic quest access', () => {
  const slots = [
    { slotId: 'test:0', slotIndex: 0, templateId: 'campus', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Available' }, difficulty: { tag: 'Easy' } },
    { slotId: 'test:1', slotIndex: 1, templateId: 'craft', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Available' }, difficulty: { tag: 'Easy' } },
  ];
  const html = renderPage('/map', { ready: true, slots, templates: [
    { templateId: 'campus', title: 'The campus expedition', latitude: 32.9858, longitude: -96.7501 },
    { templateId: 'craft', title: 'A craft without a destination' },
    { templateId: 'not-assigned', title: 'An unassigned destination must not appear', latitude: 32.8, longitude: -96.8 },
  ] });
  assert.ok(html.includes('The campus expedition'));
  assert.ok(html.includes('1 assigned quest has'));
  assert.ok(!html.includes('An unassigned destination must not appear'));
  assert.ok(html.includes('Open your Questboard'));
  assert.ok(html.includes('My location'));
  assert.ok(html.includes('Interactive world map'));
  assert.ok(renderPage('/map', { ready: true }).includes('Your current quests have no fixed map destinations'));
});

test('questboard displays loading and retryable initialization errors', () => {
  assert.ok(renderPage('/questboard').includes('Preparing your Questboard...'));
  const html = renderPage('/questboard', { slots: [], templates: [], ready: false, error: 'Not enough active Easy quest templates.', retry: () => {} });
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('Not enough active Easy quest templates.'));
  assert.ok(html.includes('Retry Questboard'));
  assert.ok(!html.includes('Preparing your Questboard...'));
});

test('questboard renders six assigned quests in slot order with catalogue objectives and rewards', () => {
  const difficulties = ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard'];
  const slots = difficulties.map((difficulty, slotIndex) => ({
    slotId: `owner:${slotIndex}`, slotIndex, difficulty: { tag: difficulty },
    templateId: `template-${slotIndex}`, status: { tag: 'Available' },
    assignedAt: Timestamp.UNIX_EPOCH,
  }));
  const templates = slots.map(slot => ({
    templateId: slot.templateId, title: `Adventure ${slot.slotIndex + 1}`,
    description: `Objective ${slot.slotIndex + 1}`, category: { tag: 'Exploration' },
    xpReward: { Easy: 50, Medium: 100, Hard: 200 }[slot.difficulty.tag],
  }));
  const html = renderPage('/questboard', { slots: slots.reverse(), templates, ready: true, error: null, retry: () => {} });
  assert.equal((html.match(/<li\b/g) ?? []).length, 6);
  assert.equal((html.match(/class="quest-status">Available<\/span>/g) ?? []).length, 6);
  assert.equal((html.match(/<ol class="questboard"/g) ?? []).length, 1);
  assert.ok(!html.includes('Questboard overview'));
  assert.ok(!html.includes('Assigned slots'));
  for (const difficulty of ['Easy', 'Medium', 'Hard']) assert.ok(!html.includes(`${difficulty} quests</h2>`));
  assert.equal((html.match(/<summary>Inspect quest<\/summary>/g) ?? []).length, 6);
  assert.ok(html.indexOf('Adventure 1') < html.indexOf('Adventure 6'));
  for (const template of templates) {
    assert.ok(html.includes(template.title));
    assert.ok(html.includes(template.description));
    assert.ok(html.includes(`${template.xpReward} XP reward`));
  }
  assert.ok(!html.includes('Preparing your Questboard...'));
});

test('cooldown slots show persisted dates and countdowns without an available completion action', () => {
  const html = renderPage('/questboard', {
    ready: true,
    slots: [{ slotId: 'test:5', slotIndex: 5, difficulty: { tag: 'Hard' }, templateId: 'hard-template', status: { tag: 'Cooldown' }, assignedAt: Timestamp.UNIX_EPOCH, completedAt: new Timestamp(1000000n), refreshAt: new Timestamp(2000000n) }],
    templates: [{ templateId: 'hard-template', title: 'The old watchtower', description: 'Explore a safe local landmark.', category: { tag: 'Exploration' }, xpReward: 200, isActive: false, latitude: 32.9858, longitude: -96.7501 }],
  });
  assert.ok(html.includes('Cooldown'));
  assert.ok(html.includes('Eligible for replacement'));
  assert.ok(html.includes('1970-01-01T00:00:02.000Z'));
  assert.ok(html.includes('32.98580, -96.75010'));
  assert.ok(html.includes('The old watchtower'));
  assert.ok(html.includes('Replacement in'));
  assert.ok(html.includes('2s'));
  assert.ok(!html.includes('Complete quest'));
});

test('completion is disabled on stale data and elapsed countdowns wait for server confirmation', () => {
  const slot = { slotId: 'test:0', slotIndex: 0, difficulty: { tag: 'Easy' }, templateId: 'easy-template', status: { tag: 'Available' }, assignedAt: Timestamp.UNIX_EPOCH };
  const template = { templateId: 'easy-template', title: 'A local expedition', description: 'Find a safe new walking route.', category: { tag: 'Exploration' }, xpReward: 50 };
  const connected = renderPage('/questboard', { ready: true, slots: [slot], templates: [template] });
  assert.match(connected, /<button type="button" aria-busy="false">Complete quest<\/button>/);
  const offline = renderPage('/questboard', { connected: false, ready: false, hasSnapshot: true, slots: [slot], templates: [template] });
  assert.match(offline, /<button type="button" disabled="" aria-busy="false">Complete quest<\/button>/);
  const elapsed = renderPage('/questboard', { ready: true, now: 3000, slots: [{ ...slot, status: { tag: 'Cooldown' }, completedAt: new Timestamp(1000000n), refreshAt: new Timestamp(2000000n) }], templates: [template] });
  assert.ok(elapsed.includes('Cooldown elapsed. Awaiting a replacement'));
  assert.ok(!elapsed.includes('Complete quest'));
  const refreshFailure = renderPage('/questboard', { ready: true, refreshError: 'Database busy' });
  assert.ok(refreshFailure.includes('Database busy'));
  assert.ok(refreshFailure.includes('Retry replacements'));
});

test('journal has its own loading and empty states and does not list current assignments', () => {
  assert.ok(renderPage('/journal').includes('Opening your Quest Journal...'));
  const html = renderPage('/journal', {
    ready: true,
    slots: [{ templateId: 'assigned', slotIndex: 0 }],
    templates: [{ templateId: 'assigned', title: 'Current quest should stay on the board' }],
  });
  assert.ok(html.includes('Your story is unwritten'));
  assert.ok(html.includes('Explore your assigned quests'));
  assert.ok(!html.includes('Current quest should stay on the board'));
});

test('journal orders history by completion time, preserves repeat completions, and uses awarded XP', () => {
  const completions = [
    { completionId: 1n, templateId: 'old', slotIndex: 0, xpAwarded: 37, completedAt: new Timestamp(1000000n) },
    { completionId: 2n, templateId: 'new', slotIndex: 3, xpAwarded: 83, completedAt: new Timestamp(2000000n) },
    { completionId: 3n, templateId: 'old', slotIndex: 1, xpAwarded: 41, completedAt: new Timestamp(3000000n) },
  ];
  const templates = [
    { templateId: 'old', title: 'First adventure', description: 'A remembered walk.', category: { tag: 'Exploration' }, difficulty: { tag: 'Easy' }, xpReward: 999, isActive: false },
    { templateId: 'new', title: 'Second adventure', description: 'A completed craft.', category: { tag: 'Crafting' }, difficulty: { tag: 'Medium' }, xpReward: 888 },
  ];
  const html = renderPage('/journal', { ready: true, completions, templates });
  const timestamps = [...html.matchAll(/<time dateTime="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(timestamps, ['1970-01-01T00:00:03.000Z', '1970-01-01T00:00:02.000Z', '1970-01-01T00:00:01.000Z']);
  assert.equal((html.match(/<h3>First adventure<\/h3>/g) ?? []).length, 2);
  for (const xp of [37, 83, 41]) assert.ok(html.includes(`+${xp} XP earned`));
  assert.ok(html.includes('<dd>161</dd>'));
  assert.ok(!html.includes('999'));
  assert.ok(!html.includes('888'));
  assert.ok(!html.includes('Your story is unwritten'));
  assert.deepEqual(completions.map(completion => completion.completionId), [1n, 2n, 3n]);
});

test('missing template information preserves saved assignments and historical rewards', () => {
  const board = renderPage('/questboard', { ready: true, slots: [{ slotId: 'test:0', slotIndex: 0, difficulty: { tag: 'Easy' }, status: { tag: 'Available' }, templateId: 'missing', assignedAt: Timestamp.UNIX_EPOCH }] });
  assert.ok(board.includes('Quest details unavailable'));
  assert.ok(board.includes('Your assignment is still saved'));
  const journal = renderPage('/journal', { ready: true, completions: [{ completionId: 99n, templateId: 'missing', slotIndex: 0, xpAwarded: 50, completedAt: Timestamp.UNIX_EPOCH }] });
  assert.ok(journal.includes('An accomplished adventure'));
  assert.ok(journal.includes('+50 XP earned'));
  assert.ok(journal.includes('Your accomplishment remains recorded'));
});

test('disconnected and failed subscriptions do not masquerade as an empty journal', () => {
  for (const path of ['/questboard', '/journal']) {
    const offline = renderPage(path, { connected: false, ready: false });
    assert.ok(offline.includes('Waiting for the database connection'));
    const failed = renderPage(path, { subscriptionError: 'Subscription denied', ready: false });
    assert.ok(failed.includes('Subscription denied'));
    assert.ok(failed.includes(path === '/questboard' ? 'Retry Questboard' : 'Retry Journal'));
    assert.ok(!failed.includes('Your story is unwritten'));
  }
  const cached = renderPage('/journal', { connected: false, hasSnapshot: true, completions: [{ completionId: 1n, templateId: 'missing', slotIndex: 0, xpAwarded: 50, completedAt: Timestamp.UNIX_EPOCH }] });
  assert.ok(cached.includes('may be out of date'));
  assert.ok(cached.includes('+50 XP earned'));
});

test('journal remains readable if board initialization fails and links back to the board', () => {
  const html = renderPage('/journal', { ready: true, error: 'Not enough templates', initializing: false });
  assert.ok(html.includes('Your story is unwritten'));
  assert.ok(html.includes('Return to your Questboard'));
  assert.ok(!html.includes('Not enough templates'));
  assert.ok(renderPage('/questboard', { ready: true }).includes('Your board awaits'));
});

test('unknown paths show a recovery link inside the shared layout', () => {
  const html = renderPage('/unknown-path');
  assert.ok(html.includes('<h1>Page not found</h1>'));
  assert.ok(html.includes('Return home'));
  assert.ok(html.includes('Main navigation'));
});

test('login restores local deep links and rejects external or callback destinations', () => {
  for (const [path] of pages) assert.equal(postLoginPath({ returnTo: path }), path);
  assert.equal(postLoginPath({ returnTo: '/journal?status=active#quests' }), '/journal?status=active#quests');
  for (const returnTo of ['https://example.com', '//example.com', '/\\example.com', '/callback', '/callback?code=old', '/\n/evil']) {
    assert.equal(postLoginPath({ returnTo }), '/');
  }
  assert.equal(postLoginPath(undefined), '/');
});
