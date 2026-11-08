import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import * as module from '../spacetimedb/src/index';

const clientId = 'quest-test-client';
let nextConnection = 1n;

export function createPlayerHarness() {
  const harness = createModuleTestHarness(module.default, module);
  const configuredContext = (ctx: Parameters<typeof module.ensurePlayer>[0]) => new Proxy(ctx, {
    get(target, key) {
      if (key === 'env') return { SPACETIMEAUTH_CLIENT_ID: clientId };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
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
    seedQuests() {
      harness.withReducerTx(TestAuth.internal(), ctx => module.init(ctx));
    },
    connect(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      harness.withReducerTx(auth, ctx => module.onConnect(ctx));
    },
    createQuest(auth: ReturnType<typeof TestAuth.fromJwtPayload>, input: Parameters<typeof module.createQuest>[1]) {
      harness.withReducerTx(auth, ctx => module.createQuest(configuredContext(ctx), input));
    },
    acceptQuest(auth: ReturnType<typeof TestAuth.fromJwtPayload>, questId: string) {
      harness.withReducerTx(auth, ctx => module.acceptQuest(configuredContext(ctx), { questId }));
    },
    catalog(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return module.questCatalog(harness.viewContext(auth));
    },
    progress(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return module.myQuestProgress(harness.viewContext(auth));
    },
    markCompletedForTest(auth: ReturnType<typeof TestAuth.fromJwtPayload>, questId: string) {
      harness.withReducerTx(auth, ctx => {
        const row = ctx.db.playerQuestProgress.id.find(`${ctx.sender.toHexString()}:${questId}`)!;
        ctx.db.playerQuestProgress.id.update({ ...row, status: { tag: 'Completed' }, completedAt: ctx.timestamp });
      });
    },
    advanceClock(micros: bigint) { harness.clock.set(new Timestamp(harness.clock.now().microsSinceUnixEpoch + micros)); },
    questCount: () => Number(harness.db.quests.count()),
    progressCount: () => Number(harness.db.playerQuestProgress.count()),
    questVisibility: module.default.schemaType.tables.quests.tableDef.tableAccess.tag,
    progressVisibility: module.default.schemaType.tables.playerQuestProgress.tableDef.tableAccess.tag,
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
