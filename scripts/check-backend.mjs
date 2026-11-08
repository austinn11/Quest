import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';
import { setGlobalLogLevel } from 'spacetimedb';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { backendSchemaProblems } from './backend-schema.mjs';

// First compare deployment metadata, then exercise every app subscription using a new anonymous identity. No user
// token is read, no reducers are called, and player rows/photos are not printed.
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('development', root, 'VITE_'), ...process.env };
const host = env.VITE_SPACETIMEDB_HOST ?? 'https://maincloud.spacetimedb.com';
const database = env.VITE_SPACETIMEDB_DB_NAME ?? 'quest-db';
setGlobalLogLevel('error');
const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
let connection, stop, profile, timer;
try {
  const bindings = await server.ssrLoadModule('/src/module_bindings/index.ts');
  const { DbConnection, tables } = bindings;
  const windowsCli = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'SpacetimeDB', 'spacetime.exe');
  const cli = windowsCli && existsSync(windowsCli) ? windowsCli : 'spacetime';
  let schema;
  try { schema = JSON.parse(execFileSync(cli, ['describe', database, '--server', host, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 8_000_000 })); }
  catch { throw new Error('Could not read backend schema metadata. Install the SpacetimeDB CLI and check the configured host/database and CLI access.'); }
  const problems = backendSchemaProblems(schema, bindings);
  if (problems.length) throw new Error(`This frontend is not ready for the deployed backend.\n${problems.join('\n')}\nPublish the matching backend manually before releasing this frontend. No database changes were made by this check.`);
  const { subscribeToQuestData } = await server.ssrLoadModule('/src/questboard/quest-subscription.ts');
  const privateViews = [
    'myFavorites', 'myLocations', 'myPlayer', 'myGuild', 'myGuildMembers', 'myGuildQuests',
    'myFriends', 'myFriendRequests', 'myPartyInvites', 'myParty', 'myPartyMembers',
  ];
  await new Promise((resolve, reject) => {
    let questsReady = false, profileReady = false;
    const done = () => { if (questsReady && profileReady) resolve(); };
    timer = setTimeout(() => reject(new Error('Live subscription timed out. Check the connection and deployed schema.')), 25_000);
    connection = DbConnection.builder().withUri(host).withDatabaseName(database)
      .onConnect(conn => {
        stop = subscribeToQuestData(conn, {
          onApplied(snapshot) {
            try {
              assert.equal(snapshot.slots.length, 0, 'Anonymous identity must not receive player slots');
              assert.equal(snapshot.completions.length, 0, 'Anonymous identity must not receive player history');
              assert.equal(snapshot.captures.length, 0, 'Anonymous identity must not receive capture photos');
              assert.equal(snapshot.area, null, 'Anonymous identity must not receive a player area');
              assert.equal([...conn.db.myLocalQuests.iter()].length, 0, 'Anonymous identity must not receive local quests');
              questsReady = true; done();
            } catch (error) { reject(error); }
          },
          onChange() {}, onError: message => reject(new Error(message)),
        });
        profile = conn.subscriptionBuilder().onApplied(() => {
          try {
            for (const accessor of privateViews) {
              assert.equal([...conn.db[accessor].iter()].length, 0, `Anonymous identity must not receive rows from ${accessor}`);
            }
            profileReady = true; done();
          } catch (error) { reject(error); }
        }).onError(ctx => reject(ctx.event)).subscribe([...privateViews.map(accessor => tables[accessor]), tables.guildDirectory]);
      }).onConnectError(ctx => reject(ctx.event)).build();
  });
  console.log(`Backend check passed for ${database}: all app subscriptions applied with the generated bindings; private views returned no other player's data.`);
} catch (error) {
  console.error(`Backend check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  stop?.();
  if (profile && !profile.isEnded) profile.unsubscribe();
  connection?.disconnect();
  await server.close();
}
