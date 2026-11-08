import type { QuestDifficulty } from './quest-model';
import type { Infer } from 'spacetimedb/server';

// Rebalance future completions here. Persisted refresh timestamps never reset on reconnect.
export const COOLDOWN_MICROS = {
  Easy: 2n * 60n * 60n * 1_000_000n,
  Medium: 6n * 60n * 60n * 1_000_000n,
  Hard: 12n * 60n * 60n * 1_000_000n,
} as const;

export function cooldownMicrosFor(difficulty: Infer<typeof QuestDifficulty>): bigint {
  return COOLDOWN_MICROS[difficulty.tag];
}
