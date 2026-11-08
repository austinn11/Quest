import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { createServer } from 'vite';
let server, browser;
before(async () => {
  const { chromium } = await import(process.env.QUEST_PLAYWRIGHT_MODULE || 'playwright');
  server = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, cacheDir: '.migration/quest-area-browser-vite',
    optimizeDeps: { entries: ['tests/browser/quest-area-harness.tsx'] },
    resolve: { alias: [{ find: /^spacetimedb\/react$/, replacement: path.resolve('tests/browser/quest-area-sdk.ts') }] },
    plugins: [{ name: 'area-fixture', enforce: 'pre', resolveId(source) { if (source.endsWith('/questboard/QuestboardProvider')) return path.resolve('tests/browser/quest-area-context.ts'); }, configureServer(vite) {
      vite.middlewares.use('/__area', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/__area', '<div id="root"></div><script type="module" src="/tests/browser/quest-area-harness.tsx"></script>')); });
    } }], server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.QUEST_BROWSER_EXECUTABLE });
});
after(async () => { await browser?.close(); await server?.close(); });
async function open(t) {
  const page = await browser.newPage(); page.setDefaultTimeout(8000); t.after(() => page.close());
  const errors = []; page.on('pageerror', error => errors.push(error.message)); t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(() => {
    localStorage.setItem('quest-location-consent', 'yes');
    const qa = window.qa = { geo: [], searches: [], saves: [], watches: 0 };
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(success, failure) { qa.geo.push({ success, failure }); },
      watchPosition() { qa.watches++; throw Error('Travel tracking must never start'); },
    } });
    qa.position = () => qa.geo.at(-1).success({ coords: { latitude: 32.98, longitude: -96.75 } });
    qa.search = args => { qa.searches.push(args); return Promise.resolve(JSON.stringify([{ label: 'Dallas, Texas', latitude: 32.78, longitude: -96.8 }])); };
    qa.save = args => { qa.saves.push(args); return new Promise((resolve, reject) => { qa.finish = () => { window.dispatchEvent(new CustomEvent('region-saved', { detail: { ...args, placeCount: 12 } })); resolve('12 verified places found. Existing quests and cooldowns are unchanged.'); }; qa.fail = () => reject(Error('Provider unavailable')); }); };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__area`);
  await page.getByLabel('City or region').waitFor(); return page;
}
test('StrictMode and stored legacy consent never start location tracking, discovery, or region changes', async t => {
  const page = await open(t);
  await page.getByLabel('City or region').fill('Dallas');
  assert.deepEqual(await page.evaluate(() => [qa.geo.length, qa.searches.length, qa.saves.length, qa.watches]), [0, 0, 0, 0]);
});
test('manual city search, choice and explicit Save are separate; successful saves persist the displayed region', async t => {
  const page = await open(t);
  await page.getByLabel('City or region').fill('Dallas'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Dallas, Texas', exact: true }).click();
  assert.equal(await page.evaluate(() => qa.saves.length), 0);
  await page.getByRole('button', { name: 'Save adventure region' }).click();
  assert.equal(await page.getByRole('button', { name: 'Save adventure region' }).isDisabled(), true);
  await page.evaluate(() => qa.finish());
  await page.getByText('Adventure region: Dallas, Texas', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => qa.saves.length), 1);
  await page.getByRole('button', { name: 'Change region' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(() => qa.saves.length), 1);
});
test('one-shot geolocation only proposes a region; late callbacks after disconnect cannot save it', async t => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Use my location' }).click(); await page.evaluate(() => qa.position());
  await page.getByRole('button', { name: 'Save adventure region' }).waitFor();
  assert.equal(await page.evaluate(() => qa.saves.length), 0);
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.getByRole('button', { name: 'Toggle connection' }).click(); await page.evaluate(() => qa.position());
  assert.equal(await page.locator('output').textContent(), 'off');
  assert.equal(await page.evaluate(() => qa.watches), 0);
});
test('provider failures retain the selection and allow a retry without silently initializing or replacing quests', async t => {
  const page = await open(t);
  await page.getByRole('button', { name: 'Use my location' }).click(); await page.evaluate(() => qa.position());
  await page.getByRole('button', { name: 'Save adventure region' }).click(); await page.evaluate(() => qa.fail());
  await page.getByRole('alert').getByText('Provider unavailable').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save adventure region' }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Start with Anywhere quests' }).isVisible(), true);
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: '.migration/dynamic-region-mobile.png', fullPage: true });
});
