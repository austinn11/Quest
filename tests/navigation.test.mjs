import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
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
  }));
  const templates = slots.map(slot => ({
    templateId: slot.templateId, title: `Adventure ${slot.slotIndex + 1}`,
    description: `Objective ${slot.slotIndex + 1}`, category: { tag: 'Exploration' },
    xpReward: { Easy: 50, Medium: 100, Hard: 200 }[slot.difficulty.tag],
  }));
  const html = renderPage('/questboard', { slots: slots.reverse(), templates, ready: true, error: null, retry: () => {} });
  assert.equal((html.match(/<li\b/g) ?? []).length, 6);
  assert.equal((html.match(/Available<\/p>/g) ?? []).length, 6);
  assert.ok(html.indexOf('Adventure 1') < html.indexOf('Adventure 6'));
  for (const template of templates) {
    assert.ok(html.includes(template.title));
    assert.ok(html.includes(template.description));
    assert.ok(html.includes(`${template.xpReward} XP`));
  }
  assert.ok(!html.includes('Preparing your Questboard...'));
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
