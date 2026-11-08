import { Timestamp } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { slotDifficulty, slotIdFor, validateSlot, validateTemplate } from './quest-model';
import { mostRecentCompletionTemplate, resolveQuest, selectQuestTemplate } from './quest-selection';
import { effectiveRerolls, FREE_REROLLS, REROLL_WINDOW_MICROS } from '../../shared/rerolls';

export function rerollQuest(ctx: Ctx, { slotIndex, expectedAssignedAt }: { slotIndex: number; expectedAssignedAt: Timestamp }) {
  const authError = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (authError) throw new SenderError(authError);
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Create your player profile before rerolling a quest.');
  if (!slotDifficulty(slotIndex)) throw new SenderError('Slot index must be an integer from 0 to 5.');
  const slot = ctx.db.playerQuestSlots.slotId.find(slotIdFor(ctx.sender, slotIndex));
  if (!slot || !slot.playerIdentity.equals(ctx.sender) || slot.slotIndex !== slotIndex) throw new SenderError('This quest slot does not belong to your Questboard.');
  if (slot.status.tag !== 'Available') throw new SenderError('Completed quests in cooldown cannot be rerolled.');
  if (slot.assignedAt.microsSinceUnixEpoch !== expectedAssignedAt.microsSinceUnixEpoch) throw new SenderError('This quest assignment has changed. Sync your Questboard before rerolling it.');
  const original = resolveQuest(ctx, ctx.sender, slot.templateId);
  if (!original) throw new SenderError('The assigned quest template is unavailable.');
  // Retired templates may still be assigned; a reroll can replace them with an active one.
  const originalError = validateSlot(slot, original, ctx.timestamp, false);
  if (originalError) throw new SenderError(originalError);

  let allowance;
  try { allowance = effectiveRerolls(player, ctx.timestamp.microsSinceUnixEpoch); }
  catch { throw new SenderError('Your reroll allowance has inconsistent data. Please contact the team.'); }
  if (allowance.remaining === 0) throw new SenderError('You have used both free rerolls. They replenish when your current 24-hour window ends.');

  const excluded = new Set([...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)].map(row => row.templateId));
  const recent = mostRecentCompletionTemplate(ctx);
  const template = selectQuestTemplate(ctx, slot.difficulty, excluded, new Set(recent ? [recent] : []), original.latitude !== undefined && original.longitude !== undefined);
  if (!template) throw new SenderError('No eligible replacement of this difficulty is available. Your quest and reroll allowance are unchanged.');
  const templateError = validateTemplate(template);
  if (templateError) throw new SenderError(templateError);
  // The app already identifies an assignment by slot ID + exact server timestamp.
  // Never reuse that identity or fabricate a timestamp in the future.
  if (ctx.timestamp.microsSinceUnixEpoch <= slot.assignedAt.microsSinceUnixEpoch) throw new SenderError('This assignment is still syncing. Please try rerolling again.');
  const replacement = { ...slot, templateId: template.templateId, locationId: template.assignedLocationId, assignedAt: ctx.timestamp, completedAt: undefined, refreshAt: undefined };
  const replacementError = validateSlot(replacement, template, ctx.timestamp);
  if (replacementError) throw new SenderError(replacementError);

  ctx.db.playerQuestSlots.slotId.update(replacement);
  ctx.db.player.identity.update({
    ...player,
    rerollsUsed: FREE_REROLLS - allowance.remaining + 1,
    rerollResetAt: allowance.resetAt === null ? new Timestamp(ctx.timestamp.microsSinceUnixEpoch + REROLL_WINDOW_MICROS) : player.rerollResetAt,
  });
}
