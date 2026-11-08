import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import * as module from '../spacetimedb/src/index';
import * as model from '../spacetimedb/src/quest-model';
import * as questArea from '../spacetimedb/src/quest-area';
import type { PlaceInput } from '../shared/nearby-places';

const clientId = 'quest-test-client';
let nextConnection = 1n;

export function createPlayerHarness(rngSeed = 42n, env: { AI_API_KEY?: string } = {}) {
  const harness = createModuleTestHarness(module.default, module, { rngSeed });
  const configuredContext = (ctx: Parameters<typeof module.ensurePlayer>[0]) => new Proxy(ctx, {
    get(target, key) {
      if (key === 'env') return { SPACETIMEAUTH_CLIENT_ID: clientId, ...env };
      const value = Reflect.get(target, key, target);
      // The callable RNG also owns shuffle/integerInRange methods; binding strips them.
      if (key === 'random') return value;
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
    initialize(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return harness.withReducerTx(auth, ctx => module.initializeQuestboard(configuredContext(ctx)));
    },
    complete(auth: ReturnType<typeof TestAuth.fromJwtPayload>, slotIndex: number, expectedAssignedAt?: Timestamp) {
      return harness.withReducerTx(auth, ctx => module.completeQuest(configuredContext(ctx), {
        slotIndex,
        expectedAssignedAt: expectedAssignedAt ?? ctx.db.playerQuestSlots.slotId.find(model.slotIdFor(ctx.sender, slotIndex))?.assignedAt ?? Timestamp.UNIX_EPOCH,
      }));
    },
    checkArea(auth: ReturnType<typeof TestAuth.fromJwtPayload>, latitude: number, longitude: number) {
      return harness.withReducerTx(auth, ctx => questArea.checkQuestArea(configuredContext(ctx), latitude, longitude));
    },
    applyArea(auth: ReturnType<typeof TestAuth.fromJwtPayload>, latitude: number, longitude: number, places: PlaceInput[]) {
      return harness.withReducerTx(auth, ctx => questArea.applyQuestArea(configuredContext(ctx), latitude, longitude, places));
    },
    localQuests(auth: ReturnType<typeof TestAuth.fromJwtPayload>) { return module.myLocalQuests(harness.viewContext(auth)); },
    area(auth: ReturnType<typeof TestAuth.fromJwtPayload>) { return module.myQuestArea(harness.viewContext(auth)); },
    beginPhoto(auth: ReturnType<typeof TestAuth.fromJwtPayload>, slotIndex: number, expectedAssignedAt?: Timestamp) {
      return harness.withReducerTx(auth, ctx => questArea.beginPhotoCheck(configuredContext(ctx), {
        slotIndex,
        expectedAssignedAt: expectedAssignedAt ?? ctx.db.playerQuestSlots.slotId.find(model.slotIdFor(ctx.sender, slotIndex))?.assignedAt ?? Timestamp.UNIX_EPOCH,
      }));
    },
    finishPhoto(auth: ReturnType<typeof TestAuth.fromJwtPayload>, slotIndex: number, note: string, expectedAssignedAt?: Timestamp, capture?: questArea.CaptureEvidence) {
      return harness.withReducerTx(auth, ctx => questArea.finishPhotoCompletion(configuredContext(ctx), {
        slotIndex,
        expectedAssignedAt: expectedAssignedAt ?? ctx.db.playerQuestSlots.slotId.find(model.slotIdFor(ctx.sender, slotIndex))?.assignedAt ?? Timestamp.UNIX_EPOCH,
      }, note, capture));
    },
    captures(auth: ReturnType<typeof TestAuth.fromJwtPayload>) { return module.myCreatureCaptures(harness.viewContext(auth)); },
    captureVisibility: module.default.schemaType.tables.creatureCaptures.tableDef.tableAccess.tag,
    localQuestVisibility: module.default.schemaType.tables.localQuests.tableDef.tableAccess.tag,
    areaVisibility: module.default.schemaType.tables.playerQuestArea.tableDef.tableAccess.tag,
    refresh(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return harness.withReducerTx(auth, ctx => module.refreshQuestSlots(configuredContext(ctx)));
    },
    patchSlotForTest(auth: ReturnType<typeof TestAuth.fromJwtPayload>, slotIndex: number, changes: Partial<model.PlayerQuestSlot>) {
      harness.withReducerTx(auth, ctx => {
        const slot = ctx.db.playerQuestSlots.slotId.find(model.slotIdFor(ctx.sender, slotIndex))!;
        ctx.db.playerQuestSlots.slotId.update({ ...slot, ...changes });
      });
    },
    patchTemplateForTest(templateId: string, changes: Partial<model.QuestTemplate>) {
      harness.withReducerTx(TestAuth.internal(), ctx => {
        const template = ctx.db.questTemplates.templateId.find(templateId)!;
        ctx.db.questTemplates.templateId.update({ ...template, ...changes });
      });
    },
    internal: () => TestAuth.internal(),
    setUsername(auth: ReturnType<typeof TestAuth.fromJwtPayload>, username: string) {
      return harness.withReducerTx(auth, ctx => module.setUsername(configuredContext(ctx), { username }));
    },
    profile(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      return module.myPlayer(harness.viewContext(auth));
    },
    seedTemplates() {
      harness.withReducerTx(TestAuth.internal(), ctx => module.init(ctx));
    },
    connect(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      harness.withReducerTx(auth, ctx => module.onConnect(ctx));
    },
    templates: () => [...harness.db.questTemplates.iter()],
    setTemplateActiveForTest(templateId: string, isActive: boolean) {
      harness.withReducerTx(TestAuth.internal(), ctx => {
        const template = ctx.db.questTemplates.templateId.find(templateId)!;
        ctx.db.questTemplates.templateId.update({ ...template, isActive });
      });
    },
    slots(auth: ReturnType<typeof TestAuth.fromJwtPayload>) { return module.myQuestSlots(harness.viewContext(auth)); },
    completions(auth: ReturnType<typeof TestAuth.fromJwtPayload>) { return module.myQuestCompletions(harness.viewContext(auth)); },
    // Fixtures exercise historical and invalid states without exposing test reducers to clients.
    putSlotFixture(auth: ReturnType<typeof TestAuth.fromJwtPayload>, templateId: string, slotIndex: number, changes: Partial<model.PlayerQuestSlot> = {}) {
      harness.withReducerTx(auth, ctx => {
        const template = ctx.db.questTemplates.templateId.find(templateId)!;
        const slot: model.PlayerQuestSlot = {
          slotId: model.slotIdFor(ctx.sender, slotIndex), playerIdentity: ctx.sender,
          slotIndex, difficulty: template.difficulty, templateId,
          status: { tag: 'Available' }, assignedAt: ctx.timestamp,
          completedAt: undefined, refreshAt: undefined, ...changes,
        };
        if (!slot.playerIdentity.equals(ctx.sender)) throw new Error('Fixture owner mismatch.');
        const error = model.validateSlot(slot, template, ctx.timestamp);
        if (error) throw new Error(error);
        const existing = ctx.db.playerQuestSlots.slotId.find(slot.slotId);
        if (existing) ctx.db.playerQuestSlots.slotId.update(slot);
        else ctx.db.playerQuestSlots.insert(slot);
      });
    },
    appendCompletionFixture(auth: ReturnType<typeof TestAuth.fromJwtPayload>, slotIndex: number) {
      return harness.withReducerTx(auth, ctx => {
        const slot = ctx.db.playerQuestSlots.slotId.find(model.slotIdFor(ctx.sender, slotIndex))!;
        const template = ctx.db.questTemplates.templateId.find(slot.templateId)!;
        const completion: model.QuestCompletion = {
          completionId: 0n, playerIdentity: ctx.sender, templateId: template.templateId,
          slotIndex, xpAwarded: template.xpReward, completedAt: slot.completedAt!, proofNote: undefined,
        };
        const error = model.validateNewCompletion(completion, slot, template);
        if (error) throw new Error(error);
        return ctx.db.questCompletions.insert(completion);
      });
    },
    removeSlotsForTest(auth: ReturnType<typeof TestAuth.fromJwtPayload>) {
      harness.withReducerTx(auth, ctx => {
        for (const slot of ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)) ctx.db.playerQuestSlots.slotId.delete(slot.slotId);
      });
    },
    now: () => harness.clock.now(),
    advanceClock(micros: bigint) { harness.clock.set(new Timestamp(harness.clock.now().microsSinceUnixEpoch + micros)); },
    model,
    moduleExports: Object.keys(module),
    templateVisibility: module.default.schemaType.tables.questTemplates.tableDef.tableAccess.tag,
    slotVisibility: module.default.schemaType.tables.playerQuestSlots.tableDef.tableAccess.tag,
    completionVisibility: module.default.schemaType.tables.questCompletions.tableDef.tableAccess.tag,
    // Test-only progression fixtures; no player-callable XP setter exists.
    awardXp(auth: ReturnType<typeof TestAuth.fromJwtPayload>, xp: number) {
      harness.withReducerTx(auth, ctx => {
        const row = ctx.db.player.identity.find(ctx.sender)!;
        ctx.db.player.identity.update({ ...row, explorationXp: xp, bestiaryXp: 0, craftingXp: 0 });
      });
    },
    storedPlayer(auth: ReturnType<typeof TestAuth.fromJwtPayload>) { return harness.db.player.identity.find(harness.viewContext(auth).sender); },
    patchPlayerForTest(auth: ReturnType<typeof TestAuth.fromJwtPayload>, changes: Record<string, unknown>) {
      harness.withReducerTx(auth, ctx => {
        const row = ctx.db.player.identity.find(ctx.sender)!;
        ctx.db.player.identity.update({ ...row, ...changes });
      });
    },
    removeTemplateForTest(templateId: string) {
      harness.withReducerTx(TestAuth.internal(), ctx => { ctx.db.questTemplates.templateId.delete(templateId); });
    },
    rowCount: () => Number(harness.db.player.count()),
    playerVisibility: module.default.schemaType.tables.player.tableDef.tableAccess.tag,
  };
}
