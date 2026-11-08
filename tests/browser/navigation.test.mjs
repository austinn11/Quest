import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { createServer } from 'vite';

let server, browser;
before(async () => {
  const { chromium } = await import(process.env.QUEST_PLAYWRIGHT_MODULE || 'playwright');
  server = await createServer({
    configFile: false, esbuild: { jsx: 'automatic' }, cacheDir: '.migration/navigation-browser-vite',
    optimizeDeps: { entries: ['tests/browser/navigation-harness.tsx'] },
    resolve: { alias: [{ find: /^spacetimedb\/react$/, replacement: path.resolve('tests/browser/navigation-sdk.ts') }] },
    plugins: [{ name: 'navigation-fixture', configureServer(vite) {
      vite.middlewares.use('/__navigation', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/__navigation', '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/browser/navigation-harness.tsx"></script>'));
      });
    } }],
    server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error',
  });
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.QUEST_BROWSER_EXECUTABLE ? { executablePath: process.env.QUEST_BROWSER_EXECUTABLE } : {}) });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open(t, route = '/', width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__navigation?route=${encodeURIComponent(route)}`);
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
  return page;
}
const trigger = (page, name) => page.getByRole('navigation').getByRole('button', { name, exact: true });
const isOpen = async (page, name) => (await trigger(page, name).getAttribute('aria-expanded')) === 'true';

test('five primary items preserve branding and close mutually exclusive dropdowns on repeat click and outside click', async t => {
  const page = await open(t);
  assert.equal(await page.locator('.app-nav-list > li').count(), 5);
  assert.equal(await page.getByRole('link', { name: 'Quest home' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 1);
  const beforeHeight = await page.locator('.app-header').evaluate(el => el.getBoundingClientRect().height);
  await trigger(page, 'Quests').click();
  assert.equal(await isOpen(page, 'Quests'), true);
  assert.equal(await page.getByRole('link', { name: 'Quest Log', exact: true }).count(), 1);
  assert.equal(await page.locator('.app-header').evaluate(el => el.getBoundingClientRect().height), beforeHeight);
  await trigger(page, 'Social').click();
  assert.equal(await isOpen(page, 'Quests'), false);
  assert.equal(await isOpen(page, 'Social'), true);
  await trigger(page, 'Social').click();
  assert.equal(await isOpen(page, 'Social'), false);
  await trigger(page, 'Quests').click();
  await page.getByRole('button', { name: 'Outside navigation' }).click();
  assert.equal(await isOpen(page, 'Quests'), false);
  await trigger(page, 'Quests').click();
  await page.getByRole('navigation').click({ position: { x: 2, y: 2 } });
  assert.equal(await isOpen(page, 'Quests'), false, 'blank navbar space is also outside the open dropdown');
});

test('keyboard opens options, Escape restores trigger focus, and Tab retains ordinary link navigation', async t => {
  const page = await open(t);
  await trigger(page, 'Quests').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Questboard');
  await page.keyboard.press('Escape');
  assert.equal(await isOpen(page, 'Quests'), false);
  assert.equal(await trigger(page, 'Quests').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Questboard');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/journal');
  await page.waitForFunction(() => document.title === 'Quest Journal | Quest' && document.activeElement?.id === 'main-content');
  assert.equal(await isOpen(page, 'Quests'), false);
  assert.equal(await page.title(), 'Quest Journal | Quest');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content');
});

test('all grouped links use existing routes, close after selection, and retain the active parent and child', async t => {
  const page = await open(t);
  for (const [group, label, route] of [['Quests', 'Questboard', '/questboard'], ['Quests', 'Quest Log', '/journal'], ['Quests', 'Bestiary', '/bestiary'], ['Social', 'Friends', '/friends'], ['Social', 'Guilds', '/guild']]) {
    await trigger(page, group).click();
    await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(`**${route}`);
    assert.equal(await isOpen(page, group), false);
    assert.ok((await trigger(page, group).getAttribute('class')).includes('active'));
    await trigger(page, group).click();
    assert.equal(await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).getAttribute('aria-current'), 'page');
    await page.keyboard.press('Escape');
  }
  for (const [label, route] of [['Home', '/'], ['World Map', '/map'], ['Profile', '/profile']]) {
    await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(url => url.pathname === route);
    assert.equal(await page.locator('.app-nav-trigger.active').count(), 0);
  }
});

test('history navigation and focus leaving a dropdown group close open dropdowns', async t => {
  const page = await open(t);
  await page.getByRole('navigation').getByRole('link', { name: 'World Map' }).click();
  await trigger(page, 'Social').click();
  await page.goBack();
  assert.equal(await isOpen(page, 'Social'), false);
  await trigger(page, 'Social').focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Guilds');
  await page.keyboard.press('Tab');
  assert.equal(await isOpen(page, 'Social'), false);
});

test('menus fit phone and tablet widths without clipping, overlap, overflow, or header resizing', async t => {
  const page = await open(t, '/guild');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const group of ['Quests', 'Social']) {
      const height = await page.locator('.app-header').evaluate(el => el.getBoundingClientRect().height);
      await trigger(page, group).click();
      const bounds = await page.locator(`#${await trigger(page, group).getAttribute('aria-controls')}`).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `${group} menu exceeds ${width}px viewport`);
      assert.equal(await page.locator('.app-header').evaluate(el => el.getBoundingClientRect().height), height);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.QUEST_NAV_SCREENSHOTS && [390, 1440].includes(width)) {
        await page.screenshot({ path: path.join(process.env.QUEST_NAV_SCREENSHOTS, `${width}-${group}.png`), clip: { x: 0, y: 0, width, height: 360 } });
      }
      await page.keyboard.press('Escape');
    }
  }
});
