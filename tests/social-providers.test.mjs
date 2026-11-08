import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { createServer } from 'vite';

let server, renderStatus;
before(async () => {
  server = await createServer({
    configFile: false, esbuild: { jsx: 'automatic' },
    resolve: { alias: [{ find: /^spacetimedb\/react$/, replacement: path.resolve('tests/social-provider-sdk.ts') }] },
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error',
  });
  ({ renderStatus } = await server.ssrLoadModule('/tests/social-provider-harness.tsx'));
});
after(async () => { await server?.close(); });

test('Guild readiness includes the shared quest subscription as well as guild, members and directory', () => {
  assert.equal(renderStatus('guild', {}), '<output>ready</output>');
  for (const view of ['my_guild', 'my_guild_members', 'guild_directory', 'my_guild_quests']) {
    assert.equal(renderStatus('guild', { [view]: false }), '<output>loading</output>', `${view} has not synced`);
  }
});

test('Friends readiness includes invitations and party members before enabling the social page', () => {
  assert.equal(renderStatus('social', {}), '<output>ready</output>');
  for (const view of ['my_friends', 'my_friend_requests', 'my_party_invites', 'my_party', 'my_party_members']) {
    assert.equal(renderStatus('social', { [view]: false }), '<output>loading</output>', `${view} has not synced`);
  }
});
