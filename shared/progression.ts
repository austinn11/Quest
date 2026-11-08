// Pure progression rules shared by the SpacetimeDB module and React.
// Total XP is the saved u32 value; level and progress are always derived.
export const MAX_TOTAL_XP = 0xffff_ffff;

function validLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Level must be a positive safe integer.');
}

export function totalXpForLevel(level: number): number {
  validLevel(level);
  const total = 50 * (level - 1) * (level + 2);
  if (!Number.isSafeInteger(total)) throw new RangeError('Level exceeds the supported XP precision.');
  return total;
}

export function xpRequiredForNextLevel(level: number): number {
  validLevel(level);
  const required = 200 + 100 * (level - 1);
  if (!Number.isSafeInteger(required)) throw new RangeError('Level exceeds the supported XP precision.');
  return required;
}

export function levelForXp(totalXp: number): number {
  if (!Number.isInteger(totalXp) || totalXp < 0 || totalXp > MAX_TOTAL_XP) throw new RangeError('Total XP must be a non-negative u32 integer.');
  let level = Math.floor((Math.sqrt(9 + totalXp * 0.08) - 1) / 2);
  // Correct any floating-point rounding at an exact cumulative threshold.
  while (totalXpForLevel(level + 1) <= totalXp) level++;
  while (totalXpForLevel(level) > totalXp) level--;
  return level;
}

export function progressionForXp(totalXp: number) {
  const level = levelForXp(totalXp);
  const levelStartXp = totalXpForLevel(level);
  const xpRequired = xpRequiredForNextLevel(level);
  const xpIntoLevel = totalXp - levelStartXp;
  return {
    totalXp, level, nextLevel: level + 1, levelStartXp,
    nextLevelXp: totalXpForLevel(level + 1), xpRequired, xpIntoLevel,
    xpRemaining: xpRequired - xpIntoLevel,
    progressPercent: xpIntoLevel / xpRequired * 100,
  };
}

export function levelUpBetween(previousXp: number, totalXp: number) {
  const fromLevel = levelForXp(previousXp);
  const toLevel = levelForXp(totalXp);
  return toLevel > fromLevel ? { fromLevel, toLevel, levelsGained: toLevel - fromLevel } : null;
}
