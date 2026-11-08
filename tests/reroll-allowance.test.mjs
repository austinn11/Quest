import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveRerolls, FREE_REROLLS, REROLL_WINDOW_MICROS } from '../shared/rerolls.ts';

test('effective allowance starts at two and resets exactly at a fixed 24-hour boundary', () => {
  assert.equal(FREE_REROLLS, 2);
  assert.equal(REROLL_WINDOW_MICROS, 86_400_000_000n);
  assert.deepEqual(effectiveRerolls({ rerollsUsed: 0, rerollResetAt: undefined }, 0n), { remaining: 2, resetAt: null });
  for (const used of [1, 2]) {
    const state = { rerollsUsed: used, rerollResetAt: { microsSinceUnixEpoch: REROLL_WINDOW_MICROS } };
    assert.deepEqual(effectiveRerolls(state, REROLL_WINDOW_MICROS - 1n), { remaining: 2 - used, resetAt: REROLL_WINDOW_MICROS });
    assert.deepEqual(effectiveRerolls(state, REROLL_WINDOW_MICROS), { remaining: 2, resetAt: null });
    assert.deepEqual(effectiveRerolls(state, REROLL_WINDOW_MICROS * 100n), { remaining: 2, resetAt: null });
    assert.equal(state.rerollsUsed, used, 'display calculation never mutates the stored allowance');
  }
});

test('invalid counters and mismatched window metadata fail closed', () => {
  for (const used of [-1, 3, 1.5, NaN, Infinity]) assert.throws(() => effectiveRerolls({ rerollsUsed: used, rerollResetAt: { microsSinceUnixEpoch: 1000n } }, 0n));
  assert.throws(() => effectiveRerolls({ rerollsUsed: 1, rerollResetAt: undefined }, 0n));
  assert.throws(() => effectiveRerolls({ rerollsUsed: 0, rerollResetAt: { microsSinceUnixEpoch: 1000n } }, 0n));
});
