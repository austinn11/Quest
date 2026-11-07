import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

let server;
let createPlayerHarness;

before(async () => {
  // Use the SDK's real test datastore and host shim without starting a web server.
  server = await createServer({
    configFile: false,
    plugins: [spacetimedbModuleTestPlugin()],
    ssr: { noExternal: ['spacetimedb'] },
    server: { middlewareMode: true, hmr: false, watch: null },
    logLevel: 'error',
  });
  ({ createPlayerHarness } = await server.ssrLoadModule('/tests/player-harness.ts'));
});

after(async () => { await server?.close(); });

test('player table is private and each view returns only the calling player', () => {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  assert.equal(db.playerVisibility, 'Private');
  assert.equal(db.profile(bob), undefined);
  db.ensure(alice);
  assert.equal(db.profile(bob), undefined);
  db.ensure(bob);
  assert.equal(db.profile(alice).displayName, 'alice');
  assert.equal(db.profile(bob).displayName, 'bob');
  assert.notEqual(db.profile(alice).identity.toHexString(), db.profile(bob).identity.toHexString());
});

test('a new connection for the same subject keeps its account and XP', () => {
  const db = createPlayerHarness();
  const firstSession = db.auth('returning-player');
  db.ensure(firstSession);
  const original = db.profile(firstSession);
  db.awardXp(firstSession, 150);
  const refreshedSession = db.auth('returning-player');
  db.ensure(refreshedSession);
  const restored = db.profile(refreshedSession);
  assert.equal(restored.identity.toHexString(), original.identity.toHexString());
  assert.equal(restored.createdAt.microsSinceUnixEpoch, original.createdAt.microsSinceUnixEpoch);
  assert.equal(restored.xp, 150);
  assert.equal(db.rowCount(), 1);
});

test('a token for a different application cannot create a player', () => {
  const db = createPlayerHarness();
  const otherApp = db.auth('player', 'another-client');
  assert.throws(() => db.ensure(otherApp), /Sign in to Quest/);
  assert.equal(db.rowCount(), 0);
});
