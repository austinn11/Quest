// Pure progression rules shared by the SpacetimeDB module and React.
// Total XP is derived from three server-owned skill counters. Level is never stored.
export const MAX_TOTAL_XP = 0xffff_ffff;
export const MAX_SKILL_LEVEL = 50;
export const SKILLS = [
  { category: 'Exploration', key: 'explorationXp' },
  { category: 'Bestiary', key: 'bestiaryXp' },
  { category: 'Crafting', key: 'craftingXp' },
] as const;
export type SkillXp = { explorationXp: number; bestiaryXp: number; craftingXp: number };
export type SkillCategory = typeof SKILLS[number]['category'];

export function getTotalPlayerXp(player: SkillXp): number {
  for (const { key } of SKILLS) {
    if (!Number.isInteger(player[key]) || player[key] < 0 || player[key] > MAX_TOTAL_XP) throw new RangeError('Skill XP must be a non-negative u32 integer.');
  }
  const total = player.explorationXp + player.bestiaryXp + player.craftingXp;
  if (total > MAX_TOTAL_XP) throw new RangeError('Your XP total cannot receive this reward.');
  return total;
}

const SKILL_TITLES = ['Beginner', 'Novice', 'Apprentice', 'Adept', 'Journeyman', 'Expert', 'Veteran', 'Master', 'Grandmaster', 'Legendary', 'Mythic'] as const;

export function getSkillTitle(level: number): string {
  if (!Number.isInteger(level) || level < 1 || level > MAX_SKILL_LEVEL) throw new RangeError('Skill level must be from 1 to 50.');
  return SKILL_TITLES[Math.floor(level / 5)];
}

export function skillXpAfterReward(player: SkillXp, category: SkillCategory, reward: number): SkillXp {
  if (!Number.isInteger(reward) || reward < 0) throw new RangeError('XP reward must be a non-negative integer.');
  const skill = SKILLS.find(skill => skill.category === category);
  if (!skill) throw new RangeError('Choose a valid quest category.');
  getTotalPlayerXp(player);
  const updated = { ...player, [skill.key]: player[skill.key] + reward };
  getTotalPlayerXp(updated);
  return updated;
}

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

export function skillProgressionForXp(totalXp: number) {
  const progress = progressionForXp(totalXp);
  const isMaxLevel = progress.level >= MAX_SKILL_LEVEL;
  const level = Math.min(progress.level, MAX_SKILL_LEVEL);
  return {
    ...progress, level, title: getSkillTitle(level), isMaxLevel,
    levelStartXp: isMaxLevel ? totalXpForLevel(MAX_SKILL_LEVEL) : progress.levelStartXp,
    xpIntoLevel: isMaxLevel ? totalXp - totalXpForLevel(MAX_SKILL_LEVEL) : progress.xpIntoLevel,
    xpRequired: isMaxLevel ? 0 : progress.xpRequired,
    nextLevel: isMaxLevel ? null : progress.nextLevel,
    nextLevelXp: isMaxLevel ? null : progress.nextLevelXp,
    xpRemaining: isMaxLevel ? 0 : progress.xpRemaining,
    progressPercent: isMaxLevel ? 100 : progress.progressPercent,
  };
}

export function progressionUpdateBetween(previous: SkillXp, current: SkillXp) {
  const previousTotal = getTotalPlayerXp(previous);
  const totalXp = getTotalPlayerXp(current);
  if (SKILLS.some(({ key }) => current[key] < previous[key]) || totalXp <= previousTotal) return null;
  const skills = SKILLS.filter(({ key }) => current[key] > previous[key]).map(({ key, category }) => {
    const from = skillProgressionForXp(previous[key]);
    const to = skillProgressionForXp(current[key]);
    return { category, xpGained: current[key] - previous[key], fromLevel: from.level, toLevel: to.level,
      newTitle: from.title !== to.title ? to.title : null };
  });
  return { totalXp, xpGained: totalXp - previousTotal, adventurer: levelUpBetween(previousTotal, totalXp), skills };
}
