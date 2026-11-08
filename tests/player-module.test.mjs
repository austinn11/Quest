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
  assert.equal(db.profile(alice).username, '');
  assert.equal(db.profile(alice).xp, 0);
  assert.equal(db.profile(alice).level, 1);
  assert.equal(db.profile(bob).displayName, 'bob');
  assert.notEqual(db.profile(alice).identity.toHexString(), db.profile(bob).identity.toHexString());
});

test('a new connection for the same subject keeps its account and XP', () => {
  const db = createPlayerHarness();
  const firstSession = db.auth('returning-player');
  db.ensure(firstSession);
  const original = db.profile(firstSession);
  db.setUsername(firstSession, 'ReturningHero');
  db.awardXp(firstSession, 150);
  const refreshedSession = db.auth('returning-player');
  db.ensure(refreshedSession);
  const restored = db.profile(refreshedSession);
  assert.equal(restored.identity.toHexString(), original.identity.toHexString());
  assert.equal(restored.createdAt.microsSinceUnixEpoch, original.createdAt.microsSinceUnixEpoch);
  assert.equal(restored.xp, 150);
  assert.equal(restored.level, 1);
  assert.equal(restored.username, 'ReturningHero');
  assert.equal(db.rowCount(), 1);
});

test('a token for a different application cannot create a player', () => {
  const db = createPlayerHarness();
  const otherApp = db.auth('player', 'another-client');
  assert.throws(() => db.ensure(otherApp), /Sign in to Quest/);
  assert.equal(db.rowCount(), 0);
});

test('two authenticated players keep separate usernames across connections', () => {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.ensure(alice);
  db.ensure(bob);
  db.setUsername(alice, 'RangerAlice');
  db.setUsername(bob, 'WizardBob');
  assert.equal(db.profile(db.auth('alice')).username, 'RangerAlice');
  assert.equal(db.profile(db.auth('bob')).username, 'WizardBob');
  db.setUsername(alice, 'KnightAlice');
  assert.equal(db.profile(db.auth('alice')).username, 'KnightAlice');
  assert.equal(db.profile(db.auth('bob')).username, 'WizardBob');
  assert.equal(db.rowCount(), 2);
});

test('editing a username preserves XP, level, identity, and creation time', () => {
  const db = createPlayerHarness();
  const auth = db.auth('player');
  db.ensure(auth);
  db.awardXp(auth, 250);
  const before = db.profile(auth);
  db.setUsername(auth, '  BraveKnight  ');
  const after = db.profile(auth);
  assert.equal(after.username, 'BraveKnight');
  assert.equal(after.identity.toHexString(), before.identity.toHexString());
  assert.equal(after.xp, 250);
  assert.equal(after.level, 2);
  assert.equal(after.createdAt.microsSinceUnixEpoch, before.createdAt.microsSinceUnixEpoch);
});

test('username claims are case-insensitive and failed edits leave both profiles intact', () => {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.ensure(alice);
  db.ensure(bob);
  db.setUsername(alice, 'DragonSlayer');
  db.setUsername(bob, 'WizardBob');
  assert.throws(() => db.setUsername(bob, 'dragonslayer'), /already taken/);
  assert.equal(db.profile(alice).username, 'DragonSlayer');
  assert.equal(db.profile(bob).username, 'WizardBob');
  db.setUsername(alice, 'DRAGONSLAYER');
  assert.equal(db.profile(alice).username, 'DRAGONSLAYER');
  db.setUsername(alice, 'RangerAlice');
  db.setUsername(bob, 'DragonSlayer');
  assert.equal(db.profile(alice).username, 'RangerAlice');
  assert.equal(db.profile(bob).username, 'DragonSlayer');
});

test('invalid usernames are rejected by the server without changing saved data', () => {
  const db = createPlayerHarness();
  const auth = db.auth('player');
  db.ensure(auth);
  db.setUsername(auth, 'OriginalName');
  for (const username of ['', '   ', 'ab', 'a'.repeat(25), 'Sir Knight', '<script>', 'hero-name']) {
    assert.throws(() => db.setUsername(auth, username), /3 to 24/);
    assert.equal(db.profile(auth).username, 'OriginalName');
  }
  db.setUsername(auth, 'a'.repeat(24));
  assert.equal(db.profile(auth).username.length, 24);
});

test('username editing requires Quest authentication and an existing profile', () => {
  const db = createPlayerHarness();
  const auth = db.auth('player');
  assert.throws(() => db.setUsername(auth, 'NewUsername'), /profile is still loading/);
  db.ensure(auth);
  assert.throws(() => db.setUsername(db.auth('player', 'another-client'), 'NewUsername'), /Sign in to Quest/);
  assert.equal(db.profile(auth).username, '');
});

test('derived levels change at exact XP boundaries', () => {
  const db = createPlayerHarness();
  const auth = db.auth('player');
  db.ensure(auth);
  for (const [xp, level] of [[0, 1], [199, 1], [200, 2], [499, 2], [500, 3], [899, 3], [900, 4], [1400, 5]]) {
    db.awardXp(auth, xp);
    assert.equal(db.profile(auth).level, level);
  }
});

test('one persisted XP update can gain multiple levels and survives a new authenticated connection', () => {
  const db = createPlayerHarness();
  const auth = db.auth('multi-level-player');
  db.ensure(auth);
  db.awardXp(auth, 199);
  assert.equal(db.profile(auth).level, 1);
  db.awardXp(auth, 1599);
  assert.equal(db.profile(auth).level, 5);
  const reconnect = db.auth('multi-level-player');
  db.ensure(reconnect);
  assert.equal(db.profile(reconnect).xp, 1599);
  assert.equal(db.profile(reconnect).level, 5);
  assert.equal(db.rowCount(), 1);
});

test('a profile picture is saved, replaced and removed only for its owner', () => {
  const db = createPlayerHarness();
  const alice = db.auth('alice');
  const bob = db.auth('bob');
  db.ensure(alice);
  db.ensure(bob);
  assert.equal(db.profile(alice).avatar, '');
  db.setAvatar(alice, 'data:image/jpeg;base64,QUJD');
  assert.equal(db.profile(alice).avatar, 'data:image/jpeg;base64,QUJD');
  assert.equal(db.profile(bob).avatar, '');
  db.setAvatar(alice, 'data:image/jpeg;base64,REVG');
  assert.equal(db.profile(alice).avatar, 'data:image/jpeg;base64,REVG');
  assert.throws(() => db.setAvatar(alice, 'not a picture'));
  assert.throws(() => db.setAvatar(alice, `data:image/jpeg;base64,${'A'.repeat(200_000)}`));
  db.setAvatar(alice, '');
  assert.equal(db.profile(alice).avatar, '');
});
