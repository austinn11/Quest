import type { PlayerQuestSlots } from '../module_bindings/types';
import { cooldownRemainingMs, formatCooldown } from './cooldown';

export function QuestCooldown({ slot, now, refreshing }: { slot: PlayerQuestSlots; now: number; refreshing: boolean }) {
  if (slot.status.tag !== 'Cooldown') return null;
  const remaining = cooldownRemainingMs(slot, now);
  if (remaining === null) return <p className="field-help">Cooldown timing is unavailable. Retry the Questboard to sync this slot.</p>;
  if (remaining === 0) return <p className="field-help">{refreshing ? 'Checking for a replacement...' : 'Cooldown elapsed. Awaiting a replacement from the guild.'}</p>;
  return <p className="quest-cooldown"><span>Replacement in </span><strong>{formatCooldown(remaining)}</strong></p>;
}
