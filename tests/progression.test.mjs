import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_TOTAL_XP, levelForXp, levelUpBetween, progressionForXp, totalXpForLevel, xpRequiredForNextLevel } from '../shared/progression.ts';

test('progression follows both supplied cumulative and per-level formulas', () => {
  for (const [level, threshold, required] of [[1, 0, 200], [2, 200, 300], [3, 500, 400], [4, 900, 500], [5, 1400, 600], [10, 5400, 1100]]) {
    assert.equal(totalXpForLevel(level), threshold);
    assert.equal(xpRequiredForNextLevel(level), required);
    assert.equal(totalXpForLevel(level + 1) - threshold, required);
    assert.equal(levelForXp(threshold), level);
  }
});

test('every reachable u32 level threshold resolves correctly before, at, and after its boundary', () => {
  const highest = levelForXp(MAX_TOTAL_XP);
  for (let level = 2; level <= highest; level++) {
    const threshold = totalXpForLevel(level);
    assert.equal(levelForXp(threshold - 1), level - 1);
    assert.equal(levelForXp(threshold), level);
    assert.equal(levelForXp(threshold + 1), level);
  }
  const maximum = progressionForXp(MAX_TOTAL_XP);
  assert.ok(maximum.levelStartXp <= MAX_TOTAL_XP);
  assert.ok(maximum.nextLevelXp > MAX_TOTAL_XP);
  assert.ok(maximum.xpRemaining > 0);
  assert.ok(maximum.progressPercent >= 0 && maximum.progressPercent < 100);
});

test('progress uses XP within the current level rather than total XP as the bar value', () => {
  assert.deepEqual(progressionForXp(350), {
    totalXp: 350, level: 2, nextLevel: 3, levelStartXp: 200, nextLevelXp: 500,
    xpRequired: 300, xpIntoLevel: 150, xpRemaining: 150, progressPercent: 50,
  });
  const freshLevel = progressionForXp(500);
  assert.equal(freshLevel.level, 3);
  assert.equal(freshLevel.xpIntoLevel, 0);
  assert.equal(freshLevel.xpRemaining, 400);
  assert.equal(freshLevel.progressPercent, 0);
  assert.equal(progressionForXp(199).xpRemaining, 1);
  assert.equal(progressionForXp(0).xpRemaining, 200);
});

test('a single XP update can cross multiple levels without losing remaining progress', () => {
  assert.deepEqual(levelUpBetween(199, 1599), { fromLevel: 1, toLevel: 5, levelsGained: 4 });
  assert.equal(progressionForXp(1599).xpIntoLevel, 199);
  assert.equal(progressionForXp(1599).xpRemaining, 401);
  assert.equal(levelUpBetween(0, 199), null);
  assert.equal(levelUpBetween(500, 500), null);
  assert.equal(levelUpBetween(500, 200), null);
});

test('invalid totals and unsupported level inputs are rejected rather than producing misleading progress', () => {
  for (const xp of [-1, 1.5, NaN, Infinity, MAX_TOTAL_XP + 1]) assert.throws(() => progressionForXp(xp), RangeError);
  for (const level of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => totalXpForLevel(level), RangeError);
    assert.throws(() => xpRequiredForNextLevel(level), RangeError);
  }
});
