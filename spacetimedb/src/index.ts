import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { authenticationError } from './auth-policy';
import { levelForXp, normalizeUsername, USERNAME_ERROR } from './player-profile';
import { questTemplates, playerQuestSlots, questCompletions, validateTemplate } from './quest-model';
import { seedTemplates } from './quest-seeds';

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

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

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
