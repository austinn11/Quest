import { schema, table, t, SenderError } from 'spacetimedb/server';
import { authenticationError } from './auth-policy';

// Private by default. Players can read only their own row through myPlayer below.
const player = table(
  { name: 'player' },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    xp: t.u32(),
    createdAt: t.timestamp(),
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

export const myPlayer = spacetimedb.view(
  { name: 'my_player', public: true },
  t.option(player.rowType),
  ctx => ctx.db.player.identity.find(ctx.sender) ?? undefined
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
  });
});

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
