import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { authenticationError } from './auth-policy';
import { levelForXp, normalizeUsername, USERNAME_ERROR } from './player-profile';
import { questTemplates, playerQuestSlots, questCompletions, validateTemplate, validateSlot, SLOT_DIFFICULTIES, slotIdFor } from './quest-model';
import { seedTemplates } from './quest-seeds';
import { completeQuest as completeQuestHandler } from './quest-completion';
import { refreshQuestSlots as refreshQuestSlotsHandler } from './quest-refresh';
import { mostRecentCompletionTemplate, selectQuestTemplate } from './quest-selection';

// Private by default. Players can read only their own row through myPlayer below.
const player = table(
  { name: 'player' },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    xp: t.u32(),
    createdAt: t.timestamp(),
    // Appended defaults preserve profiles created before username setup existed.
    username: t.string().default(''),
    usernameKey: t.string().index('btree').default(''),
  }
);

const spacetimedb = schema({
  player,
  questTemplates,
  playerQuestSlots,
  questCompletions,
}, { env: { SPACETIMEAUTH_CLIENT_ID: t.string() } });
export default spacetimedb;

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function seedQuestTemplates(ctx: Ctx) {
  for (const template of seedTemplates) {
    if (ctx.db.questTemplates.templateId.find(template.templateId)) continue;
    const error = validateTemplate(template);
    if (error) throw new SenderError(error);
    ctx.db.questTemplates.insert(template);
  }
}

export const myQuestSlots = spacetimedb.view(
  { name: 'my_quest_slots', public: true },
  t.array(playerQuestSlots.rowType),
  ctx => [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)]
);

export const myQuestCompletions = spacetimedb.view(
  { name: 'my_quest_completions', public: true },
  t.array(questCompletions.rowType),
  ctx => [...ctx.db.questCompletions.playerIdentity.filter(ctx.sender)]
);

const playerProfile = t.row('PlayerProfile', {
  identity: t.identity().primaryKey(),
  displayName: t.string(),
  xp: t.u32(),
  createdAt: t.timestamp(),
  username: t.string(),
  level: t.u32(),
});

export const myPlayer = spacetimedb.view(
  { name: 'my_player', public: true },
  t.option(playerProfile),
  ctx => {
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) return undefined;
    return {
      identity: row.identity,
      displayName: row.displayName,
      xp: row.xp,
      createdAt: row.createdAt,
      username: row.username,
      level: levelForXp(row.xp),
    };
  }
);

export const ensurePlayer = spacetimedb.reducer(ctx => {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  if (ctx.db.player.identity.find(ctx.sender)) return;

  const claims = ctx.senderAuth.jwt!.fullPayload;
  const name = claims.name ?? claims.preferred_username;
  ctx.db.player.insert({
    identity: ctx.sender,
    displayName: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Adventurer',
    xp: 0,
    createdAt: ctx.timestamp,
    username: '',
    usernameKey: '',
  });
});

export const initializeQuestboard = spacetimedb.reducer(ctx => {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  if (!ctx.db.player.identity.find(ctx.sender)) {
    throw new SenderError('Create your player profile before initializing your Questboard.');
  }

  const existing = [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)];
  if (existing.length) {
    // Initialization never rerolls existing quests, including cooldown or inactive assignments.
    const complete = existing.length === SLOT_DIFFICULTIES.length && SLOT_DIFFICULTIES.every((difficulty, index) =>
      existing.some(slot => slot.slotId === slotIdFor(ctx.sender, index) && slot.slotIndex === index && slot.difficulty.tag === difficulty)
    );
    if (!complete) throw new SenderError('Your Questboard is incomplete. Please contact the team to restore it.');
    return;
  }

  // History is a preference, not a permanent blacklist. A small catalogue must remain usable.
  const latest = mostRecentCompletionTemplate(ctx);
  const avoid = new Set(latest ? [latest] : []);

  const used = new Set<string>();
  const assignments = SLOT_DIFFICULTIES.map((difficulty, slotIndex) => {
    const template = selectQuestTemplate(ctx, { tag: difficulty }, used, avoid);
    if (!template) throw new SenderError(`Not enough active ${difficulty} quest templates to initialize your Questboard. Please retry later.`);
    const templateError = validateTemplate(template);
    if (templateError) throw new SenderError(templateError);
    used.add(template.templateId);
    const slot = {
      slotId: slotIdFor(ctx.sender, slotIndex), playerIdentity: ctx.sender, slotIndex,
      difficulty: template.difficulty, templateId: template.templateId,
      status: { tag: 'Available' as const }, assignedAt: ctx.timestamp,
      completedAt: undefined, refreshAt: undefined,
    };
    const slotError = validateSlot(slot, template, ctx.timestamp);
    if (slotError) throw new SenderError(slotError);
    return slot;
  });
  // Selection and all six inserts share the reducer transaction. Failure leaves no partial board.
  for (const slot of assignments) ctx.db.playerQuestSlots.insert(slot);
});

export const completeQuest = spacetimedb.reducer(
  { slotIndex: t.u8(), expectedAssignedAt: t.timestamp() },
  completeQuestHandler
);

export const refreshQuestSlots = spacetimedb.reducer(refreshQuestSlotsHandler);

export const setUsername = spacetimedb.reducer(
  { username: t.string() },
  (ctx, { username: requestedUsername }) => {
    const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
    if (error) throw new SenderError(error);
    const username = normalizeUsername(requestedUsername);
    if (!username) throw new SenderError(USERNAME_ERROR);
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) throw new SenderError('Your profile is still loading. Please retry.');

    const usernameKey = username.toLowerCase();
    // Reducers are transactional, so simultaneous claims cannot take the same name.
    for (const existing of ctx.db.player.usernameKey.filter(usernameKey)) {
      if (!existing.identity.equals(ctx.sender)) {
        throw new SenderError('That username is already taken. Try another name.');
      }
    }
    ctx.db.player.identity.update({ ...row, username, usernameKey });
  }
);

export const init = spacetimedb.init(ctx => {
  seedQuestTemplates(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  // Existing databases do not rerun init on publish. Only fixed, missing samples are inserted.
  seedQuestTemplates(ctx);
});
