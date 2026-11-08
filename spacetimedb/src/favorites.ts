import { SenderError, t, table } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';

// Private: the captures and journal entries a player starred. Read through my_favorites.
export const favorite = table({
  name: 'favorite',
  indexes: [{ accessor: 'byOwnerItem', algorithm: 'btree', columns: ['playerIdentity', 'kind', 'itemId'] }],
}, {
  favoriteId: t.u64().primaryKey().autoInc(),
  playerIdentity: t.identity().index('btree'),
  // 'capture' (a Bestiary capture) or 'completion' (a Quest Journal entry).
  kind: t.string(),
  itemId: t.u64(),
  createdAt: t.timestamp(),
});

export function toggleFavorite(ctx: Ctx, { kind, itemId }: { kind: string; itemId: bigint }) {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  // Players can only star their own captures and journal entries.
  const owned = kind === 'capture'
    ? ctx.db.creatureCaptures.captureId.find(itemId)?.playerIdentity.equals(ctx.sender)
    : kind === 'completion'
      ? ctx.db.questCompletions.completionId.find(itemId)?.playerIdentity.equals(ctx.sender)
      : undefined;
  if (kind !== 'capture' && kind !== 'completion') throw new SenderError('Only captures and journal entries can be favorites.');
  if (!owned) throw new SenderError('That entry is not in your collection.');
  const existing = [...ctx.db.favorite.byOwnerItem.filter([ctx.sender, kind, itemId])][0];
  if (existing) ctx.db.favorite.favoriteId.delete(existing.favoriteId);
  else ctx.db.favorite.insert({ favoriteId: 0n, playerIdentity: ctx.sender, kind, itemId, createdAt: ctx.timestamp });
}
