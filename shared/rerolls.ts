export const FREE_REROLLS = 2;
export const REROLL_WINDOW_MICROS = 24n * 60n * 60n * 1_000_000n;

export type RerollState = {
  rerollsUsed: number;
  rerollResetAt: { microsSinceUnixEpoch: bigint } | undefined;
};

// Both runtimes use the same window boundary. Only the reducer's server time
// authorizes a reroll; the browser uses its clock exclusively for presentation.
export function effectiveRerolls(state: RerollState, nowMicros: bigint) {
  if (!Number.isInteger(state.rerollsUsed) || state.rerollsUsed < 0 || state.rerollsUsed > FREE_REROLLS ||
      (state.rerollsUsed === 0) !== (state.rerollResetAt === undefined)) {
    throw new Error('Your reroll allowance has inconsistent data. Please contact the team.');
  }
  const resetAt = state.rerollResetAt?.microsSinceUnixEpoch;
  const active = resetAt !== undefined && nowMicros < resetAt;
  return { remaining: active ? FREE_REROLLS - state.rerollsUsed : FREE_REROLLS, resetAt: active ? resetAt : null };
}
