import { t, table, type Infer } from 'spacetimedb/server';
import type { Identity, Timestamp } from 'spacetimedb';
import { PLACE_KINDS } from '../../shared/nearby-places';

export const QuestCategory = t.enum('QuestCategory', {
  Exploration: t.unit(), Bestiary: t.unit(), Crafting: t.unit(),
});
export const QuestDifficulty = t.enum('QuestDifficulty', {
  Easy: t.unit(), Medium: t.unit(), Hard: t.unit(),
});
export const QuestSlotStatus = t.enum('QuestSlotStatus', {
  Available: t.unit(), Cooldown: t.unit(),
});
export const QuestType = t.enum('QuestType', { Anywhere: t.unit(), Location: t.unit() });

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
  // Defaults allow existing catalogue rows to migrate without deleting player data.
  locationName: t.option(t.string()).default(undefined),
  locationType: t.option(t.string()).default(undefined),
  // What a photo must show to prove completion. Appended for migration safety.
  photoGoal: t.option(t.string()).default(undefined),
  // Bestiary quests are bounties for a named creature.
  bountyTarget: t.option(t.string()).default(undefined),
  questType: QuestType.default({ tag: 'Anywhere' }),
  requiredLocationType: t.option(t.string()).default(undefined),
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
  locationId: t.option(t.u64()).default(undefined),
});

export const questCompletions = table({ name: 'quest_completions' }, {
  completionId: t.u64().primaryKey().autoInc(),
  playerIdentity: t.identity().index('btree'),
  templateId: t.string().index('btree'),
  slotIndex: t.u8(),
  xpAwarded: t.u32(),
  completedAt: t.timestamp().index('btree'),
  // The AI judge's short description of the accepted photo, when one was submitted.
  proofNote: t.option(t.string()).default(undefined),
  locationId: t.option(t.u64()).default(undefined),
  questTitle: t.option(t.string()).default(undefined),
  questObjective: t.option(t.string()).default(undefined),
  locationName: t.option(t.string()).default(undefined),
  latitude: t.option(t.f64()).default(undefined),
  longitude: t.option(t.f64()).default(undefined),
});

// Private: a player's quest area (rounded to about 100 m). Read only through my_quest_area.
export const playerQuestArea = table({ name: 'player_quest_area' }, {
  playerIdentity: t.identity().primaryKey(),
  latitude: t.f64(),
  longitude: t.f64(),
  updatedAt: t.timestamp(),
  placeCount: t.u32(),
  label: t.string().default('Saved adventure region'),
  radiusMeters: t.u32().default(8000),
});

// Private: quests generated from places near one player. Never deleted, so history resolves.
export const localQuests = table({ name: 'local_quests' }, {
  templateId: t.string().primaryKey(),
  playerIdentity: t.identity().index('btree'),
  title: t.string(),
  description: t.string(),
  category: QuestCategory,
  difficulty: QuestDifficulty,
  xpReward: t.u32(),
  latitude: t.option(t.f64()),
  longitude: t.option(t.f64()),
  // Only the current area's quests are active for new assignments.
  isActive: t.bool(),
  locationName: t.option(t.string()),
  locationType: t.option(t.string()),
  photoGoal: t.option(t.string()),
  createdAt: t.timestamp(),
  bountyTarget: t.option(t.string()).default(undefined),
});

// Private: a creature captured for a Bestiary bounty, with the player's photo. Read through my_creature_captures.
export const creatureCaptures = table({ name: 'creature_captures' }, {
  captureId: t.u64().primaryKey().autoInc(),
  playerIdentity: t.identity().index('btree'),
  completionId: t.u64().index('btree'),
  templateId: t.string(),
  bountyTarget: t.string(),
  // The creature the AI judge identified, or the bounty target when no judge is configured.
  creature: t.string(),
  verified: t.bool(),
  // A small JPEG data URL (about 640 px) captured by the player.
  photo: t.string(),
  locationName: t.option(t.string()),
  capturedAt: t.timestamp(),
});

// Private: per-player photo check rate limit.
export const photoAttempts = table({ name: 'photo_attempts' }, {
  playerIdentity: t.identity().primaryKey(),
  windowStartedAt: t.timestamp(),
  attemptsInWindow: t.u32(),
  lastAttemptAt: t.timestamp(),
});

export type QuestTemplate = Infer<typeof questTemplates.rowType>;
export type PlayerQuestSlot = Infer<typeof playerQuestSlots.rowType>;
export type QuestCompletion = Infer<typeof questCompletions.rowType>;
export type LocalQuest = Infer<typeof localQuests.rowType>;
export type PlayerQuestArea = Infer<typeof playerQuestArea.rowType>;
export type CreatureCapture = Infer<typeof creatureCaptures.rowType>;

export function localQuestAsTemplate(quest: LocalQuest): QuestTemplate {
  return {
    templateId: quest.templateId, title: quest.title, description: quest.description,
    category: quest.category, difficulty: quest.difficulty, xpReward: quest.xpReward,
    latitude: quest.latitude, longitude: quest.longitude, isActive: quest.isActive,
    locationName: quest.locationName, locationType: quest.locationType, photoGoal: quest.photoGoal,
    bountyTarget: quest.bountyTarget,
    questType: { tag: quest.latitude === undefined ? 'Anywhere' : 'Location' }, requiredLocationType: undefined,
  };
}
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
  if (!['Anywhere', 'Location'].includes(template.questType.tag)) return 'Choose a valid quest type.';
  if (template.questType.tag === 'Anywhere' && (hasLatitude || hasLongitude || template.requiredLocationType !== undefined)) return 'Anywhere quests cannot require a destination.';
  if (template.requiredLocationType !== undefined && !['any', 'nature', ...PLACE_KINDS].includes(template.requiredLocationType)) return 'Choose a supported location type.';
  if (template.questType.tag === 'Location' && !hasLatitude && template.requiredLocationType === undefined) return 'Location recipes must specify a compatible location type.';
  for (const [label, value, limit] of [['Location name', template.locationName, 160], ['Location type', template.locationType, 60]] as const) {
    if (value !== undefined && (!value.trim() || value.trim().length > limit)) return `${label} must contain 1 to ${limit} characters.`;
    if (value !== undefined && !hasLatitude) return 'Named quest locations require latitude and longitude.';
  }
  if (template.photoGoal !== undefined && (!template.photoGoal.trim() || template.photoGoal.trim().length > 300)) return 'Photo goals must contain 1 to 300 characters.';
  if (template.bountyTarget !== undefined) {
    if (template.category.tag !== 'Bestiary') return 'Only Bestiary quests can post a bounty.';
    if (template.bountyTarget.trim().length < 2 || template.bountyTarget.trim().length > 60) return 'Bounty targets must contain 2 to 60 characters.';
  }
  return null;
}

// Shared guards for assignment, completion, and replacement transitions.
export function validateSlot(slot: PlayerQuestSlot, template: QuestTemplate, now: Timestamp, requireActive = true): string | null {
  const expectedDifficulty = slotDifficulty(slot.slotIndex);
  if (!expectedDifficulty) return 'Slot index must be an integer from 0 to 5.';
  if (slot.slotId !== slotIdFor(slot.playerIdentity, slot.slotIndex)) return 'Slot ID must match its player and slot index.';
  if (slot.difficulty.tag !== expectedDifficulty || template.difficulty.tag !== expectedDifficulty) return 'The template difficulty must match the fixed slot difficulty.';
  if (slot.templateId !== template.templateId) return 'Slot template does not match the referenced template.';
  if (slot.assignedAt.microsSinceUnixEpoch > now.microsSinceUnixEpoch) return 'Assignment time cannot be in the future.';
  if (slot.status.tag === 'Available') {
    if (requireActive && !template.isActive) return 'New assignments require an active template.';
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
