import { t, table, type Infer } from 'spacetimedb/server';
import type { Identity, Timestamp } from 'spacetimedb';

export const QuestCategory = t.enum('QuestCategory', {
  Exploration: t.unit(), Bestiary: t.unit(), Crafting: t.unit(),
});
export const QuestDifficulty = t.enum('QuestDifficulty', {
  Easy: t.unit(), Medium: t.unit(), Hard: t.unit(),
});
export const QuestSlotStatus = t.enum('QuestSlotStatus', {
  Available: t.unit(), Cooldown: t.unit(),
});

// The catalogue contains no player information and can be read by all clients.
export const questTemplates = table({ name: 'quest_templates', public: true }, {
  templateId: t.string().primaryKey(),
  title: t.string(),
  description: t.string(),
  category: QuestCategory.index('btree'),
  difficulty: QuestDifficulty.index('btree'),
  xpReward: t.u32(),
  latitude: t.option(t.f64()),
  longitude: t.option(t.f64()),
  isActive: t.bool().index('btree'),
});

export const playerQuestSlots = table({
  name: 'player_quest_slots',
  indexes: [{ accessor: 'byRefreshAt', algorithm: 'btree', columns: ['refreshAt'] }],
}, {
  slotId: t.string().primaryKey(),
  playerIdentity: t.identity().index('btree'),
  slotIndex: t.u8(),
  difficulty: QuestDifficulty,
  templateId: t.string().index('btree'),
  status: QuestSlotStatus,
  assignedAt: t.timestamp(),
  completedAt: t.option(t.timestamp()),
  refreshAt: t.option(t.timestamp()),
});

export const questCompletions = table({ name: 'quest_completions' }, {
  completionId: t.u64().primaryKey().autoInc(),
  playerIdentity: t.identity().index('btree'),
  templateId: t.string().index('btree'),
  slotIndex: t.u8(),
  xpAwarded: t.u32(),
  completedAt: t.timestamp().index('btree'),
});

export type QuestTemplate = Infer<typeof questTemplates.rowType>;
export type PlayerQuestSlot = Infer<typeof playerQuestSlots.rowType>;
export type QuestCompletion = Infer<typeof questCompletions.rowType>;
export const SLOT_DIFFICULTIES = ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard'] as const;
const rewards = { Easy: 50, Medium: 100, Hard: 200 } as const;

export function slotDifficulty(slotIndex: number): typeof SLOT_DIFFICULTIES[number] | undefined {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < 6 ? SLOT_DIFFICULTIES[slotIndex] : undefined;
}

export function slotIdFor(player: Identity, slotIndex: number): string {
  if (!slotDifficulty(slotIndex)) throw new Error('Slot index must be an integer from 0 to 5.');
  return player.toHexString() + ':' + slotIndex;
}

export function rewardForDifficulty(difficulty: Infer<typeof QuestDifficulty>): number {
  return rewards[difficulty.tag];
}

export function validateTemplate(template: QuestTemplate): string | null {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(template.templateId)) return 'Template IDs must use 3 to 80 lowercase letters, numbers, or hyphens.';
  if (template.title.trim().length < 3 || template.title.trim().length > 100) return 'Template titles must contain 3 to 100 characters.';
  if (template.description.trim().length < 10 || template.description.trim().length > 2000) return 'Template descriptions must contain 10 to 2000 characters.';
  if (!Object.prototype.hasOwnProperty.call(QuestCategory.variants, template.category.tag)) return 'Choose a valid quest category.';
  if (!Object.prototype.hasOwnProperty.call(rewards, template.difficulty.tag)) return 'Choose a valid quest difficulty.';
  if (template.xpReward !== rewardForDifficulty(template.difficulty)) return 'Template XP must match its server-controlled difficulty reward.';
  const hasLatitude = template.latitude !== undefined;
  const hasLongitude = template.longitude !== undefined;
  if (hasLatitude !== hasLongitude) return 'Latitude and longitude must be supplied together.';
  if (hasLatitude && (!Number.isFinite(template.latitude) || template.latitude! < -90 || template.latitude! > 90)) return 'Latitude must be between -90 and 90.';
  if (hasLongitude && (!Number.isFinite(template.longitude) || template.longitude! < -180 || template.longitude! > 180)) return 'Longitude must be between -180 and 180.';
  return null;
}

// Shared guards for assignment, completion, and replacement transitions.
export function validateSlot(slot: PlayerQuestSlot, template: QuestTemplate, now: Timestamp): string | null {
  const expectedDifficulty = slotDifficulty(slot.slotIndex);
  if (!expectedDifficulty) return 'Slot index must be an integer from 0 to 5.';
  if (slot.slotId !== slotIdFor(slot.playerIdentity, slot.slotIndex)) return 'Slot ID must match its player and slot index.';
  if (slot.difficulty.tag !== expectedDifficulty || template.difficulty.tag !== expectedDifficulty) return 'The template difficulty must match the fixed slot difficulty.';
  if (slot.templateId !== template.templateId) return 'Slot template does not match the referenced template.';
  if (slot.assignedAt.microsSinceUnixEpoch > now.microsSinceUnixEpoch) return 'Assignment time cannot be in the future.';
  if (slot.status.tag === 'Available') {
    if (!template.isActive) return 'New assignments require an active template.';
    if (slot.completedAt !== undefined || slot.refreshAt !== undefined) return 'Available slots cannot have completion or refresh times.';
  } else if (slot.status.tag === 'Cooldown') {
    if (!slot.completedAt || !slot.refreshAt) return 'Cooldown slots require completion and refresh times.';
    if (slot.completedAt.microsSinceUnixEpoch < slot.assignedAt.microsSinceUnixEpoch || slot.completedAt.microsSinceUnixEpoch > now.microsSinceUnixEpoch) return 'Completion time must fall between assignment and the current time.';
    if (slot.refreshAt.microsSinceUnixEpoch <= slot.completedAt.microsSinceUnixEpoch) return 'Refresh time must be after completion.';
  } else return 'Choose a valid slot status.';
  return null;
}

export function validateNewCompletion(completion: QuestCompletion, slot: PlayerQuestSlot, template: QuestTemplate): string | null {
  if (!completion.playerIdentity.equals(slot.playerIdentity)) return 'Completion owner must match the slot owner.';
  if (completion.slotIndex !== slot.slotIndex || !slotDifficulty(completion.slotIndex)) return 'Completion must reference the completed slot.';
  if (completion.templateId !== slot.templateId || completion.templateId !== template.templateId) return 'Completion must reference the assigned template.';
  if (slot.status.tag !== 'Cooldown' || !slot.completedAt || completion.completedAt.microsSinceUnixEpoch !== slot.completedAt.microsSinceUnixEpoch) return 'Completion must match the slot completion time and state.';
  if (completion.xpAwarded !== template.xpReward) return 'Awarded XP must match the authoritative template reward.';
  return null;
}
