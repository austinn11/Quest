import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { authenticationError } from './auth-policy';
import { levelForXp, normalizeUsername, USERNAME_ERROR } from './player-profile';
import {
  quests, playerQuestProgress, QuestCategory, QuestDifficulty, QuestLocation,
  validateQuest, rewardForDifficulty, sampleQuests,
} from './quest-model';

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
  quests,
  playerQuestProgress,
}, { env: { SPACETIMEAUTH_CLIENT_ID: t.string() } });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function requirePlayer(ctx: Ctx) {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  if (!ctx.db.player.identity.find(ctx.sender)) throw new SenderError('Your profile is still loading. Please retry.');
}

function seedSharedQuests(ctx: Ctx) {
  for (const sample of sampleQuests) {
    if (ctx.db.quests.id.find(sample.id)) continue;
    const error = validateQuest(sample);
    if (error) throw new SenderError(error);
    ctx.db.quests.insert({
      ...sample,
      location: sample.location,
      creatorIdentity: ctx.databaseIdentity,
      scope: { tag: 'Shared' },
      xpReward: rewardForDifficulty(sample.difficulty),
      createdAt: ctx.timestamp,
    });
  }
}

export const questCatalog = spacetimedb.view(
  { name: 'quest_catalog', public: true },
  t.array(quests.rowType),
  ctx => [
    ...ctx.db.quests.scope.filter({ tag: 'Shared' }),
    ...[...ctx.db.quests.creatorIdentity.filter(ctx.sender)].filter(quest => quest.scope.tag === 'Personal'),
  ]
);

export const myQuestProgress = spacetimedb.view(
  { name: 'my_quest_progress', public: true },
  t.array(playerQuestProgress.rowType),
  ctx => [...ctx.db.playerQuestProgress.playerIdentity.filter(ctx.sender)]
);

export const createQuest = spacetimedb.reducer(
  {
    title: t.string(), description: t.string(), category: QuestCategory,
    difficulty: QuestDifficulty, location: t.option(QuestLocation),
  },
  (ctx, input) => {
    requirePlayer(ctx);
    const error = validateQuest(input);
    if (error) throw new SenderError(error);
    ctx.db.quests.insert({
      id: ctx.newUuidV7().toString(),
      creatorIdentity: ctx.sender,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      difficulty: input.difficulty,
      xpReward: rewardForDifficulty(input.difficulty),
      location: input.location ? { ...input.location, name: input.location.name.trim() } : undefined,
      scope: { tag: 'Personal' },
      createdAt: ctx.timestamp,
    });
  }
);

export const acceptQuest = spacetimedb.reducer(
  { questId: t.string() },
  (ctx, { questId }) => {
    requirePlayer(ctx);
    const quest = ctx.db.quests.id.find(questId);
    // Use the same response for nonexistent quests and another player's private quest.
    if (!quest || (quest.scope.tag === 'Personal' && !quest.creatorIdentity.equals(ctx.sender))) {
      throw new SenderError('This quest is not available.');
    }
    const id = `${ctx.sender.toHexString()}:${quest.id}`;
    const existing = ctx.db.playerQuestProgress.id.find(id);
    if (existing) {
      if (existing.status.tag === 'Active') return;
      throw new SenderError('You have already completed this quest.');
    }
    ctx.db.playerQuestProgress.insert({
      id, playerIdentity: ctx.sender, questId: quest.id,
      status: { tag: 'Active' }, acceptedAt: ctx.timestamp,
      completedAt: undefined, xpReward: quest.xpReward,
    });
  }
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
  seedSharedQuests(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  // Existing databases do not rerun init on publish. Only fixed, missing samples are inserted.
  seedSharedQuests(ctx);
});
