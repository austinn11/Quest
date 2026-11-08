import type { PlayerQuestSlots, QuestTemplates } from '../module_bindings/types';

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
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
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
