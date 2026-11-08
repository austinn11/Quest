import { Timestamp } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { cooldownMicrosFor } from './quest-config';
import { resolveQuest } from './quest-selection';
import { recordGuildProgress } from './guild-quests';
import { slotDifficulty, slotIdFor, validateNewCompletion, validateSlot, validateTemplate, type PlayerQuestSlot, type QuestCompletion, type QuestTemplate } from './quest-model';
import { skillXpAfterReward } from '../../shared/progression';
import { initializePlayerSkills } from './player-progression';
import { scheduleQuestRefresh } from './quest-schedule';

type CompletionArgs = { slotIndex: number; expectedAssignedAt: Timestamp };

// Every check that must pass before a quest can be completed. Throws SenderError otherwise.
export function prepareCompletion(ctx: Ctx, { slotIndex, expectedAssignedAt }: CompletionArgs) {
  const authError = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (authError) throw new SenderError(authError);
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (!existing) throw new SenderError('Create your player profile before completing a quest.');
  const player = initializePlayerSkills(ctx, existing);
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
  const template = resolveQuest(ctx, ctx.sender, slot.templateId);
  if (!template) throw new SenderError('The assigned quest template is unavailable.');
  const templateError = validateTemplate(template);
  if (templateError) throw new SenderError(templateError);
  let skills;
  try { skills = skillXpAfterReward(player, template.category.tag, template.xpReward); }
  catch { throw new SenderError('Your XP total cannot receive this reward.'); }
  return { player, slot, template, skills };
}

export function applyCompletion(ctx: Ctx, args: CompletionArgs, proofNote?: string): { template: QuestTemplate; completion: QuestCompletion } {
  const { player, slot, template, skills } = prepareCompletion(ctx, args);
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
    slotIndex: args.slotIndex, xpAwarded: template.xpReward, completedAt: ctx.timestamp,
    locationId: slot.locationId, questTitle: template.title, questObjective: template.description,
    locationName: template.locationName, latitude: template.latitude, longitude: template.longitude,
    proofNote: proofNote?.trim() ? proofNote.trim().slice(0, 200) : undefined,
  };
  const completionError = validateNewCompletion(completion, completedSlot, template);
  if (completionError) throw new SenderError(completionError);

  // These writes commit together. A duplicate invocation sees Cooldown and awards nothing.
  const inserted = ctx.db.questCompletions.insert(completion);
  ctx.db.player.identity.update({ ...player, explorationXp: skills.explorationXp, bestiaryXp: skills.bestiaryXp, craftingXp: skills.craftingXp });
  ctx.db.playerQuestSlots.slotId.update(completedSlot);
  scheduleQuestRefresh(ctx, completedSlot);
  // The same transaction advances the player's guild quests and pays any guild reward once.
  recordGuildProgress(ctx, template, template.xpReward);
  return { template, completion: inserted };
}

export function completeQuest(ctx: Ctx, args: CompletionArgs): void {
  // With an AI judge configured, completion requires photo proof through submitQuestPhoto.
  if (ctx.env.AI_API_KEY) {
    const authError = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
    if (authError) throw new SenderError(authError);
    throw new SenderError('Submit a photo to complete this quest.');
  }
  applyCompletion(ctx, args);
}
