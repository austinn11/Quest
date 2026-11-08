import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicConfig } from '../shared/public-config.ts';
import { backendSchemaProblems } from '../scripts/backend-schema.mjs';
const production = { VITE_SPACETIMEDB_HOST: 'https://maincloud.spacetimedb.com', VITE_SPACETIMEDB_DB_NAME: 'quest-db', VITE_SPACETIMEAUTH_CLIENT_ID: 'client_public_test' };
test('production configuration requires explicit public connection and authentication settings', () => {
  for (const name of Object.keys(production)) assert.throws(() => publicConfig({ ...production, [name]: ' ' }, true), new RegExp(name));
  assert.equal(publicConfig(production, true).database, 'quest-db');
  assert.equal(publicConfig({ VITE_SPACETIMEAUTH_CLIENT_ID: 'client_public_test' }, false).host, production.VITE_SPACETIMEDB_HOST);
});
test('production configuration rejects insecure or local backends, embedded credentials and insecure map styles', () => {
  for (const host of ['http://example.com', 'ws://example.com', 'https://localhost:3000', 'https://user:pass@example.com', 'https://example.com/private?token=secret']) assert.throws(() => publicConfig({ ...production, VITE_SPACETIMEDB_HOST: host }, true));
  assert.throws(() => publicConfig({ ...production, VITE_MAP_STYLE_URL: 'http://example.com/style.json' }, true));
  assert.throws(() => publicConfig({ ...production, VITE_SPACETIMEAUTH_CLIENT_ID: 'google-client.apps.googleusercontent.com' }, true));
  assert.equal(publicConfig({ ...production, VITE_SPACETIMEDB_HOST: 'wss://example.com/' }, true).host, 'wss://example.com');
});
const column = name => ({ name: { some: name }, algebraic_type: { String: [] } });
function fixture(fields = ['identity', 'avatar']) {
  const returnType = { Sum: { variants: [
    { name: { some: 'some' }, algebraic_type: { Ref: 0 } },
    { name: { some: 'none' }, algebraic_type: { Product: { elements: [] } } },
  ] } };
  return { sections: [{
    Tables: [{ source_name: 'questRefreshTimer', product_type_ref: 1 }],
    Typespace: { types: [{ Product: { elements: fields.map(column) } }, { Product: { elements: [] } }] },
    Views: [{ source_name: 'myPlayer', return_type: returnType }],
    Reducers: [{ source_name: 'setAvatar' }], Procedures: [],
  }] };
}
const bindings = { tables: { myPlayer: { columns: { identity: {}, avatar: {} } } }, reducers: { setAvatar: {} }, procedures: {} };
test('backend preflight detects a stale private profile schema even when anonymous subscriptions would be empty', () => {
  assert.deepEqual(backendSchemaProblems(fixture(), bindings), []);
  assert.match(backendSchemaProblems(fixture(['identity']), bindings).join('\n'), /Row schema differs: myPlayer/);
});
test('backend preflight detects missing reducers, views, and the offline scheduler from metadata only', () => {
  const deployed = fixture(); deployed.sections[0].Reducers = []; deployed.sections[0].Tables = [];
  const problems = backendSchemaProblems(deployed, { ...bindings, tables: { ...bindings.tables, myFavorites: { columns: {} } } }).join('\n');
  assert.match(problems, /Missing reducer: setAvatar/); assert.match(problems, /Missing table\/view: myFavorites/); assert.match(problems, /server-side quest refresh scheduler/);
});
