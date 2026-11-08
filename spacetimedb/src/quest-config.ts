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

export const DIFFICULTY_MAX_METERS = { Easy: 1_500, Medium: 4_000, Hard: 8_000 } as const;
// Areas are stored rounded to about 100 m (three decimal places).
export const AREA_COORDINATE_DECIMALS = 3;
// Local quests are preferred over generic catalogue quests about two times in three.
export const LOCAL_QUEST_PREFERENCE = 2 / 3;
export const MAX_LOCAL_QUESTS_PER_AREA = 18;

// Photo proof: limits protect the AI credits from runaway retries.
export const PHOTO_MAX_ATTEMPTS_PER_HOUR = 12;
export const PHOTO_MIN_SECONDS_BETWEEN_ATTEMPTS = 5;
export const PHOTO_MAX_DATA_URL_LENGTH = 2_000_000;
export const DEFAULT_AI_BASE_URL = 'https://api.aisa.one/v1';
