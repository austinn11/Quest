import { schema, table, t, SenderError } from 'spacetimedb/server';
import { authenticationError } from './auth-policy';
import { levelForXp, normalizeUsername, USERNAME_ERROR } from './player-profile';

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
  person: table(
    { public: true },
    {
      name: t.string(),
    }
  ),
}, { env: { SPACETIMEAUTH_CLIENT_ID: t.string() } });
export default spacetimedb;

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

export const init = spacetimedb.init(_ctx => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Called every time a new client connects
});

export const onDisconnect = spacetimedb.clientDisconnected(_ctx => {
  // Called every time a client disconnects
});

export const add = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
    if (error) throw new SenderError(error);
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 80) {
      throw new SenderError('Enter a test name between 1 and 80 characters.');
    }
    ctx.db.person.insert({ name: trimmedName });
  }
);

export const sayHello = spacetimedb.reducer(ctx => {
  for (const person of ctx.db.person.iter()) {
    console.info(`Hello, ${person.name}!`);
  }
  console.info('Hello, World!');
});
