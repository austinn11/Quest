import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || process.env.QUEST_STATIC_URL || 'http://127.0.0.1:8080');
const get = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
try {
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(home.headers.get('cache-control'), /no-cache/);
  const html = await home.text();
  assert.ok(html.includes('<div id="root"></div>'));
  for (const path of ['/map', '/questboard', '/journal', '/bestiary', '/friends', '/guild', '/profile', '/callback?code=check&state=check']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), html, `SPA fallback: ${path}`);
  }
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')));
  assert.ok(assets.some(asset => asset.endsWith('.css')));
  for (const path of assets) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.doesNotMatch(response.headers.get('content-type'), /text\/html/);
    if (path.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  }
  for (const path of ['/assets/not-present.js', '/assets/not-present', '/missing.png', '/missing.wasm', '/.env', '/spacetime.local.json', '/src/main.tsx']) {
    const response = await get(path);
    assert.equal(response.status, 404, `Missing assets and source files must not return HTML: ${path}`);
    assert.notEqual(await response.text(), html, path);
  }
  const health = await get('/healthz');
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
  console.log('Production static checks passed: SPA routes/callback, assets, cache headers, source-file isolation, missing-file 404s, and health endpoint.');
} catch (error) {
  console.error(`Production static check failed: ${error.message}`);
  process.exitCode = 1;
}
