import { Timestamp } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { cooldownMicrosFor } from './quest-config';
import { slotDifficulty, slotIdFor, validateNewCompletion, validateSlot, validateTemplate, type PlayerQuestSlot, type QuestCompletion } from './quest-model';

export function completeQuest(ctx: Ctx, { slotIndex, expectedAssignedAt }: { slotIndex: number; expectedAssignedAt: Timestamp }): void {
  const authError = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (authError) throw new SenderError(authError);
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Create your player profile before completing a quest.');
  if (!slotDifficulty(slotIndex)) throw new SenderError('Slot index must be an integer from 0 to 5.');
  const slot = ctx.db.playerQuestSlots.slotId.find(slotIdFor(ctx.sender, slotIndex));
  if (!slot || !slot.playerIdentity.equals(ctx.sender) || slot.slotIndex !== slotIndex) {
    throw new SenderError('This quest slot does not belong to your Questboard.');
  }
  if (slot.status.tag !== 'Available') throw new SenderError('This quest is already completed or on cooldown.');
  if (slot.assignedAt.microsSinceUnixEpoch !== expectedAssignedAt.microsSinceUnixEpoch) {
    throw new SenderError('This quest assignment has changed. Sync your Questboard before completing it.');
  }
  if (slot.completedAt !== undefined || slot.refreshAt !== undefined) throw new SenderError('This available quest has inconsistent cooldown data.');
  const template = ctx.db.questTemplates.templateId.find(slot.templateId);
  if (!template) throw new SenderError('The assigned quest template is unavailable.');
  const templateError = validateTemplate(template);
  if (templateError) throw new SenderError(templateError);
  const xp = player.xp + template.xpReward;
  if (!Number.isSafeInteger(xp) || xp > 0xffff_ffff) throw new SenderError('Your XP total cannot receive this reward.');

  const completedSlot: PlayerQuestSlot = {
    ...slot,
    status: { tag: 'Cooldown' },
    completedAt: ctx.timestamp,
    refreshAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + cooldownMicrosFor(slot.difficulty)),
  };
  // Deactivating a template stops new generation without invalidating an existing assignment.
  const slotError = validateSlot(completedSlot, template, ctx.timestamp);
  if (slotError) throw new SenderError(slotError);
  const completion: QuestCompletion = {
    completionId: 0n, playerIdentity: ctx.sender, templateId: template.templateId,
    slotIndex, xpAwarded: template.xpReward, completedAt: ctx.timestamp,
  };
  const completionError = validateNewCompletion(completion, completedSlot, template);
  if (completionError) throw new SenderError(completionError);

  // These writes commit together. A duplicate invocation sees Cooldown and awards nothing.
  ctx.db.questCompletions.insert(completion);
  ctx.db.player.identity.update({ ...player, xp });
  ctx.db.playerQuestSlots.slotId.update(completedSlot);
}
