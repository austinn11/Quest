import { ScheduleAt } from 'spacetimedb';
import { SenderError, table, t, type Infer } from 'spacetimedb/server';
import type { Ctx } from './index';
import type { PlayerQuestSlot } from './quest-model';
import { refreshOwnedSlots } from './quest-refresh';

export const questRefreshTimer = table({ name: 'quest_refresh_timer' }, {
  scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(),
  slotId: t.string().unique(), playerIdentity: t.identity(), expectedAssignedAt: t.timestamp(),
});

export function scheduleQuestRefresh(ctx: Ctx, slot: PlayerQuestSlot, retry = false) {
  if (slot.status.tag !== 'Cooldown' || !slot.refreshAt) return;
  const existing = ctx.db.questRefreshTimer.slotId.find(slot.slotId);
  if (existing && existing.expectedAssignedAt.microsSinceUnixEpoch === slot.assignedAt.microsSinceUnixEpoch) return;
  if (existing) ctx.db.questRefreshTimer.scheduledId.delete(existing.scheduledId);
  const due = slot.refreshAt.microsSinceUnixEpoch;
  const earliest = ctx.timestamp.microsSinceUnixEpoch + (retry ? 300_000_000n : 1n);
  ctx.db.questRefreshTimer.insert({ scheduledId: 0n, slotId: slot.slotId, playerIdentity: slot.playerIdentity,
    expectedAssignedAt: slot.assignedAt, scheduledAt: ScheduleAt.time(due > earliest ? due : earliest) });
}

// First connection after a module upgrade repairs timers for pre-existing cooldowns.
// This never edits assignments, completion history, XP, or their original expiry times.
export function restoreQuestRefreshSchedules(ctx: Ctx) {
  for (const slot of ctx.db.playerQuestSlots.iter()) scheduleQuestRefresh(ctx, slot);
}

export function runQuestRefresh(ctx: Ctx, timer: Infer<typeof questRefreshTimer.rowType>) {
  if (!ctx.senderAuth.isInternal) throw new SenderError('Quest refresh timers can only run on the server.');
  const stored = ctx.db.questRefreshTimer.scheduledId.find(timer.scheduledId);
  if (!stored || stored.slotId !== timer.slotId || !stored.playerIdentity.equals(timer.playerIdentity) || stored.expectedAssignedAt.microsSinceUnixEpoch !== timer.expectedAssignedAt.microsSinceUnixEpoch) return;
  ctx.db.questRefreshTimer.scheduledId.delete(timer.scheduledId);
  const slot = ctx.db.playerQuestSlots.slotId.find(timer.slotId);
  if (!slot || !slot.playerIdentity.equals(timer.playerIdentity) || slot.status.tag !== 'Cooldown' || slot.assignedAt.microsSinceUnixEpoch !== timer.expectedAssignedAt.microsSinceUnixEpoch) return;
  // Use the existing authoritative selector as the timer's recorded owner. The
  // owner comes only from a private server-written timer, never a client argument.
  const ownerContext = new Proxy(ctx, { get(target, key) { return key === 'sender' ? timer.playerIdentity : Reflect.get(target, key, target); } });
  try { refreshOwnedSlots(ownerContext, slot.slotId); }
  catch (error) {
    // A broken or temporarily unavailable catalog must not permanently lose the job.
    console.warn(`Quest replacement deferred: ${error instanceof Error ? error.message : 'catalog unavailable'}`);
    scheduleQuestRefresh(ctx, slot, true);
    return;
  }
  const remaining = ctx.db.playerQuestSlots.slotId.find(timer.slotId);
  if (remaining?.status.tag === 'Cooldown') scheduleQuestRefresh(ctx, remaining, true);
}
