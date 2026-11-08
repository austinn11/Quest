import { questDisplay } from '../questboard/quest-copy.ts';
import type { PlayerQuestSlots, QuestTemplates, QuestCompletions } from '../module_bindings/types';

export type LocatedQuest = {
  key: string;
  slot: PlayerQuestSlots;
  template: QuestTemplates;
  coordinates: [longitude: number, latitude: number];
};

export function validCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function locatedQuests(slots: readonly PlayerQuestSlots[], templates: readonly QuestTemplates[]): LocatedQuest[] {
  const catalogue = new Map(templates.map(template => [template.templateId, questDisplay(template)]));
  const seen = new Set<string>();
  return [...slots].sort((a, b) => a.slotIndex - b.slotIndex).flatMap(slot => {
    const template = catalogue.get(slot.templateId);
    if (!template || seen.has(slot.slotId) || !validCoordinates(template.latitude, template.longitude)) return [];
    seen.add(slot.slotId);
    return [{ key: `${slot.slotId}:${slot.assignedAt.microsSinceUnixEpoch}`, slot, template, coordinates: [template.longitude!, template.latitude!] }];
  });
}

export function directionsUrl(quest: LocatedQuest): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${quest.coordinates[1]},${quest.coordinates[0]}`)}&travelmode=walking`;
}

// Completion coordinates are immutable snapshots, independent of current assignments.
export function historicalQuests(completions: readonly QuestCompletions[], templates: readonly QuestTemplates[]): LocatedQuest[] {
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  return completions.flatMap(completion => {
    if (!validCoordinates(completion.latitude, completion.longitude)) return [];
    const original = catalogue.get(completion.templateId);
    const difficulty = completion.slotIndex < 3 ? 'Easy' : completion.slotIndex < 5 ? 'Medium' : 'Hard';
    const template: QuestTemplates = { ...original, templateId: completion.templateId,
      title: completion.questTitle ?? original?.title ?? 'Completed adventure', description: completion.questObjective ?? original?.description ?? 'A recorded accomplishment.',
      category: original?.category ?? { tag: 'Exploration' }, difficulty: { tag: difficulty }, xpReward: completion.xpAwarded, isActive: false,
      latitude: completion.latitude, longitude: completion.longitude, locationName: completion.locationName, locationType: undefined,
      photoGoal: undefined, bountyTarget: undefined, questType: { tag: 'Location' }, requiredLocationType: undefined,
    };
    const slot: PlayerQuestSlots = { slotId: 'history:' + completion.completionId, playerIdentity: completion.playerIdentity, slotIndex: completion.slotIndex,
      templateId: completion.templateId, difficulty: { tag: difficulty }, status: { tag: 'Cooldown' }, assignedAt: completion.completedAt,
      completedAt: completion.completedAt, refreshAt: undefined, locationId: completion.locationId };
    return [{ key: slot.slotId, template: questDisplay(template), slot, coordinates: [completion.longitude!, completion.latitude!] }];
  });
}
