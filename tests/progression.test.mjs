import assert from 'node:assert/strict';
import { getSkillTitle, getTotalPlayerXp, skillProgressionForXp, skillXpAfterReward, progressionUpdateBetween } from '../shared/progression.ts';
import test from 'node:test';
import { MAX_TOTAL_XP, levelForXp, levelUpBetween, progressionForXp, totalXpForLevel, xpRequiredForNextLevel } from '../shared/progression.ts';

test('skills award one category, sum their total, and reject invalid counters or overflow', () => {
  const zero = { explorationXp: 0, bestiaryXp: 0, craftingXp: 0 };
  for (const [category, key] of [['Exploration', 'explorationXp'], ['Bestiary', 'bestiaryXp'], ['Crafting', 'craftingXp']]) {
    const result = skillXpAfterReward(zero, category, 50);
    assert.deepEqual(result, { ...zero, [key]: 50 });
    assert.equal(getTotalPlayerXp(result), 50);
  }
  assert.equal(getTotalPlayerXp({ explorationXp: 200, bestiaryXp: 300, craftingXp: 400 }), 900);
  assert.throws(() => skillXpAfterReward(zero, 'Fitness', 50));
  for (const value of [-1, NaN, Infinity, 1.5]) assert.throws(() => getTotalPlayerXp({ ...zero, craftingXp: value }));
  assert.throws(() => getTotalPlayerXp({ ...zero, explorationXp: MAX_TOTAL_XP, craftingXp: 1 }));
});

test('every skill title is correct at all fifty levels and rejects invalid levels', () => {
  const ranges = [[1, 4, 'Beginner'], [5, 9, 'Novice'], [10, 14, 'Apprentice'], [15, 19, 'Adept'], [20, 24, 'Journeyman'], [25, 29, 'Expert'], [30, 34, 'Veteran'], [35, 39, 'Master'], [40, 44, 'Grandmaster'], [45, 49, 'Legendary'], [50, 50, 'Mythic']];
  for (const [start, end, title] of ranges) for (let level = start; level <= end; level++) assert.equal(getSkillTitle(level), title);
  for (const level of [0, 51, 1.5, NaN, Infinity]) assert.throws(() => getSkillTitle(level));
});

test('skills cap at fifty with a full bar and no level fifty-one requirement while total continues', () => {
  const cap = totalXpForLevel(50);
  assert.equal(cap, 127400);
  assert.equal(skillProgressionForXp(cap - 1).level, 49);
  for (const xp of [cap, cap + 1, cap + 50000, MAX_TOTAL_XP]) {
    const skill = skillProgressionForXp(xp);
    assert.equal(skill.level, 50);
    assert.equal(skill.title, 'Mythic');
    assert.equal(skill.totalXp, xp);
    assert.equal(skill.progressPercent, 100);
    assert.equal(skill.nextLevel, null);
    assert.equal(skill.nextLevelXp, null);
    assert.equal(skill.xpRemaining, 0);
  }
  assert.ok(levelForXp(cap + 50000) > 50);
});

test('progression feedback handles skill and overall level jumps, title unlocks and capped gains', () => {
  const before = { explorationXp: 199, bestiaryXp: 0, craftingXp: 0 };
  const update = progressionUpdateBetween(before, { ...before, explorationXp: 1599 });
  assert.equal(update.xpGained, 1400);
  assert.deepEqual(update.adventurer, { fromLevel: 1, toLevel: 5, levelsGained: 4 });
  assert.deepEqual(update.skills, [{ category: 'Exploration', xpGained: 1400, fromLevel: 1, toLevel: 5, newTitle: 'Novice' }]);
  assert.equal(progressionUpdateBetween(before, before), null);
  assert.equal(progressionUpdateBetween(before, { ...before, explorationXp: 0 }), null);
  const capped = { explorationXp: totalXpForLevel(50), bestiaryXp: 0, craftingXp: 0 };
  const gain = progressionUpdateBetween(capped, { ...capped, explorationXp: capped.explorationXp + 200 });
  assert.equal(gain.skills[0].toLevel, 50);
  assert.equal(gain.skills[0].newTitle, null);
});

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
