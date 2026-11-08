import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { createServer } from 'vite';

// Run separately from the node suite with an installed Playwright module and Chrome.
// QUEST_PLAYWRIGHT_MODULE may be a file URL to an existing Playwright installation.
let server, browser;
before(async () => {
  const { chromium } = await import(process.env.QUEST_PLAYWRIGHT_MODULE || 'playwright');
  server = await createServer({
    configFile: false, esbuild: { jsx: 'automatic' },
    cacheDir: '.migration/quest-area-browser-vite',
    optimizeDeps: { entries: ['tests/browser/quest-area-harness.tsx'] },
    resolve: { alias: [{ find: /^spacetimedb\/react$/, replacement: path.resolve('tests/browser/quest-area-sdk.ts') }] },
    plugins: [{ name: 'area-fixture', configureServer(vite) {
      vite.middlewares.use('/__area', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/__area', '<div id="root"></div><script type="module" src="/tests/browser/quest-area-harness.tsx"></script>'));
      });
    } }],
    server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error',
  });
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.QUEST_BROWSER_EXECUTABLE ? { executablePath: process.env.QUEST_BROWSER_EXECUTABLE } : {}) });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(() => {
    localStorage.setItem('quest-location-consent', 'yes');
    const qa = window.qa = { calls: [], requests: [], watches: [], cleared: [] };
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition(success, failure) { qa.watches.push({ success, failure }); return qa.watches.length - 1; },
      clearWatch(id) { qa.cleared.push(id); },
    } });
    qa.position = (id = qa.watches.length - 1) => qa.watches[id].success({ coords: { latitude: 32.9858, longitude: -96.7501 } });
    const nativeFetch = window.fetch;
    window.fetch = (url, options) => {
      if (!String(url).includes('/api/interpreter')) return nativeFetch(url, options);
      return new Promise((resolve, reject) => {
        const request = { aborted: false, resolve: () => resolve(new Response('{"elements":[]}')) };
        qa.requests.push(request);
        options.signal.addEventListener('abort', () => { request.aborted = true; reject(options.signal.reason); }, { once: true });
      });
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__area`);
  // StrictMode mounts, cleans up, then mounts the effect again.
  await page.waitForFunction(() => window.qa?.watches.length === 2);
  return page;
}

test('StrictMode replay still reaches ready and submits the area exactly once', async t => {
  const page = await open(t);
  await page.evaluate(() => { qa.position(0); qa.position(); });
  await page.waitForFunction(() => qa.requests.length === 1);
  await page.evaluate(() => qa.requests[0].resolve());
  await page.waitForFunction(() => document.querySelector('output').textContent === 'ready');
  assert.equal(await page.evaluate(() => qa.calls.length), 1);
});

test('stopping during scouting cancels the request and ignores late positions', async t => {
  const page = await open(t);
  await page.evaluate(() => qa.position());
  await page.waitForFunction(() => qa.requests.length === 1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.evaluate(() => { qa.position(); qa.requests[0].resolve(); });
  assert.deepEqual(await page.evaluate(() => [qa.requests[0].aborted, qa.calls.length, document.querySelector('output').textContent]), [true, 0, 'off']);
});

test('retry replaces an in-flight lookup instead of getting stuck locating', async t => {
  const page = await open(t);
  await page.evaluate(() => qa.position());
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => qa.watches.length === 3);
  await page.evaluate(() => { qa.position(1); qa.position(); });
  await page.waitForFunction(() => qa.requests.length === 2);
  await page.evaluate(() => qa.requests[1].resolve());
  await page.waitForFunction(() => document.querySelector('output').textContent === 'ready');
  assert.deepEqual(await page.evaluate(() => [qa.requests[0].aborted, qa.calls.length]), [true, 1]);
});

test('disconnect cancels scouting; retry while offline sends nothing and reconnect can recover', async t => {
  const page = await open(t);
  await page.evaluate(() => qa.position());
  await page.getByRole('button', { name: 'Toggle connection' }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.evaluate(() => qa.position());
  assert.deepEqual(await page.evaluate(() => [qa.requests[0].aborted, qa.requests.length, qa.calls.length]), [true, 1, 0]);
  await page.getByRole('button', { name: 'Toggle connection' }).click();
  await page.waitForFunction(() => qa.watches.length === 3);
  await page.evaluate(() => qa.position());
  await page.waitForFunction(() => qa.requests.length === 2);
  await page.evaluate(() => qa.requests[1].resolve());
  await page.waitForFunction(() => document.querySelector('output').textContent === 'ready');
});

test('unmount cancels scouting and prevents a later database submission', async t => {
  const page = await open(t);
  await page.evaluate(() => qa.position());
  await page.getByRole('button', { name: 'Unmount', exact: true }).click();
  await page.evaluate(() => { qa.position(); qa.requests[0].resolve(); });
  assert.deepEqual(await page.evaluate(() => [qa.requests[0].aborted, qa.calls.length]), [true, 0]);
});

test('permission revocation during scouting cancels the lookup and clears consent', async t => {
  const page = await open(t);
  await page.evaluate(() => { qa.position(); qa.watches[1].failure({ code: 1, PERMISSION_DENIED: 1 }); });
  await page.waitForFunction(() => document.querySelector('output').textContent === 'error');
  assert.deepEqual(await page.evaluate(() => [qa.requests[0].aborted, qa.calls.length, localStorage.getItem('quest-location-consent')]), [true, 0, null]);
});
