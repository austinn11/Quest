import type { PlayerQuestSlots } from '../module_bindings/types';

export const REFRESH_RETRY_DELAY_MS = 30_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function cooldownRemainingMs(slot: PlayerQuestSlots, now: number): number | null {
  if (slot.status.tag !== 'Cooldown' || !slot.refreshAt) return null;
  return Math.max(0, Number(slot.refreshAt.microsSinceUnixEpoch / 1000n) - now);
}

export function formatCooldown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return hours ? `${hours}h ${minutes}m ${seconds}s` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// An expired timestamp can remain unchanged after a no-op response (clock skew or no
// eligible templates). Retry slowly instead of scheduling zero-delay reducer loops.
export function nextRefreshDelay(slots: readonly PlayerQuestSlots[], now: number, lastAttemptAt: number): number | null {
  const eligible = slots.filter(slot => slot.status.tag === 'Cooldown' && slot.refreshAt);
  if (!eligible.length) return null;
  const delays = eligible.map(slot => {
    const deadline = Number(slot.refreshAt!.microsSinceUnixEpoch / 1000n);
    const retryDelay = lastAttemptAt >= deadline ? lastAttemptAt + REFRESH_RETRY_DELAY_MS - now : 0;
    return Math.max(1, deadline - now, retryDelay);
  });
  return Math.min(MAX_TIMEOUT_MS, ...delays);
}
