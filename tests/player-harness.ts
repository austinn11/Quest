import { ConnectionId } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import * as module from '../spacetimedb/src/index';

const clientId = 'quest-test-client';
let nextConnection = 1n;

export function createPlayerHarness() {
  const harness = createModuleTestHarness(module.default, module);
  const configuredContext = (ctx: Parameters<typeof module.ensurePlayer>[0]) => new Proxy(ctx, {
    get(target, key) {
      if (key === 'env') return { SPACETIMEAUTH_CLIENT_ID: clientId };
      return Reflect.get(target, key, target);
    },
  });
  return {
    auth(subject: string, audience = clientId) {
      return TestAuth.fromJwtPayload(JSON.stringify({
        iss: 'https://auth.spacetimedb.com/oidc',
        sub: subject,
        aud: audience,
        name: subject,
      }), new ConnectionId(nextConnection++));
    },
    ensure(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return harness.withReducerTx(auth, ctx => module.ensurePlayer(configuredContext(ctx)));
    },
    setUsername(auth: ReturnType<typeof TestAuth.fromJwtPayload>, username: string) {
      return harness.withReducerTx(auth, ctx => module.setUsername(configuredContext(ctx), { username }));
    },
    profile(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return module.myPlayer(harness.viewContext(auth));
    },
    // Simulate XP awarded by a future trusted gameplay reducer, then reconnect.
    awardXp(auth: ReturnType<typeof TestAuth.fromJwtPayload>, xp: number) {
      harness.withReducerTx(auth, ctx => {
        const row = ctx.db.player.identity.find(ctx.sender)!;
        ctx.db.player.identity.update({ ...row, xp });
      });
    },
    rowCount: () => Number(harness.db.player.count()),
    playerVisibility: module.default.schemaType.tables.player.tableDef.tableAccess.tag,
  };
}
