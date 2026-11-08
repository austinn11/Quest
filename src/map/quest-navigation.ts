import type { PlayerQuestSlots, QuestCompletions } from '../module_bindings/types';
import type { LocatedQuest } from './quest-locations';

export function questMapPath(slot: Pick<PlayerQuestSlots, 'slotIndex' | 'assignedAt'>): string {
  const query = new URLSearchParams({ slot: String(slot.slotIndex), assignedAt: String(slot.assignedAt.microsSinceUnixEpoch) });
  return `/map?${query}`;
}

type MapTarget =
  | { kind: 'none' | 'invalid' | 'stale' }
  | { kind: 'unmapped'; slot: PlayerQuestSlots }
  | { kind: 'selected'; quest: LocatedQuest };

// Links identify an assignment, never a coordinate or an assumed current quest.
// Ownership and completion remain enforced by the existing server reducers.
export function resolveQuestMapTarget(search: string, slots: readonly PlayerQuestSlots[], locations: readonly LocatedQuest[]): MapTarget {
  const params = new URLSearchParams(search);
  if (!params.has('slot') && !params.has('assignedAt')) return { kind: 'none' };
  const index = params.get('slot') ?? '';
  const timestamp = params.get('assignedAt') ?? '';
  if (params.getAll('slot').length !== 1 || params.getAll('assignedAt').length !== 1 || !/^[0-5]$/.test(index) || !/^-?(0|[1-9]\d{0,18})$/.test(timestamp)) return { kind: 'invalid' };
  const assignedAt = BigInt(timestamp);
  if (assignedAt < -(1n << 63n) || assignedAt > (1n << 63n) - 1n) return { kind: 'invalid' };
  const slot = slots.find(row => row.slotIndex === Number(index) && row.assignedAt.microsSinceUnixEpoch === assignedAt);
  if (!slot) return { kind: 'stale' };
  const quest = locations.find(row => row.slot.slotId === slot.slotId && row.slot.assignedAt.microsSinceUnixEpoch === assignedAt);
  return quest ? { kind: 'selected', quest } : { kind: 'unmapped', slot };
}

export function completionMapLocation(completion: QuestCompletions, locations: readonly LocatedQuest[]): LocatedQuest | undefined {
  return locations.find(({ slot }) => slot.status.tag === 'Cooldown' && slot.slotIndex === completion.slotIndex && slot.templateId === completion.templateId && slot.completedAt?.microsSinceUnixEpoch === completion.completedAt.microsSinceUnixEpoch);
}
