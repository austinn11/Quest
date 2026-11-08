import type { Identity } from 'spacetimedb';
import type { Infer } from 'spacetimedb/server';
import type { Ctx } from './index';
import { distanceMeters } from '../../shared/geo';
import { AREA_RELOAD_METERS } from '../../shared/nearby-places';
import { LOCAL_QUEST_PREFERENCE } from './quest-config';
import { localQuestAsTemplate, type QuestDifficulty, type QuestTemplate } from './quest-model';

export function mostRecentCompletionTemplate(ctx: Ctx): string | undefined {
  let latest: ReturnType<typeof ctx.db.questCompletions.completionId.find> = null;
  for (const completion of ctx.db.questCompletions.playerIdentity.filter(ctx.sender)) {
    if (!latest || completion.completedAt.microsSinceUnixEpoch > latest.completedAt.microsSinceUnixEpoch ||
      (completion.completedAt.microsSinceUnixEpoch === latest.completedAt.microsSinceUnixEpoch && completion.completionId > latest.completionId)) latest = completion;
  }
  return latest?.templateId;
}

// A slot may reference a public catalogue template or one of its owner's private local quests.
export function resolveQuest(ctx: Ctx, owner: Identity, templateId: string): QuestTemplate | null {
  const template = ctx.db.questTemplates.templateId.find(templateId);
  if (template) return template;
  const local = ctx.db.localQuests.templateId.find(templateId);
  return local && local.playerIdentity.equals(owner) ? localQuestAsTemplate(local) : null;
}

// How many of the latest completions a new assignment tries not to repeat.
const RECENT_MEMORY = 5;

export function recentCompletionTemplates(ctx: Ctx, count: number): Set<string> {
  const completions = [...ctx.db.questCompletions.playerIdentity.filter(ctx.sender)].sort((a, b) =>
    a.completedAt.microsSinceUnixEpoch !== b.completedAt.microsSinceUnixEpoch
      ? (a.completedAt.microsSinceUnixEpoch > b.completedAt.microsSinceUnixEpoch ? -1 : 1)
      : (a.completionId > b.completionId ? -1 : 1));
  return new Set(completions.slice(0, count).map(completion => completion.templateId));
}

// Integer weights per category: 2 base, +4 when the board lacks that category, +1 for the player's weakest skill.
function categoryWeights(ctx: Ctx, boardTemplateIds: ReadonlySet<string>): (category: string) => number {
  const onBoard = new Set<string>();
  for (const templateId of boardTemplateIds) {
    const template = resolveQuest(ctx, ctx.sender, templateId);
    if (template) onBoard.add(template.category.tag);
  }
  const player = ctx.db.player.identity.find(ctx.sender);
  let weakest: string | undefined;
  if (player?.progressionReady) {
    const skills: [string, number][] = [['Exploration', player.explorationXp], ['Bestiary', player.bestiaryXp], ['Crafting', player.craftingXp]];
    const lowest = Math.min(...skills.map(([, xp]) => xp));
    const tied = skills.filter(([, xp]) => xp === lowest);
    // No preference while skills are level, so new players get an even mix.
    if (tied.length === 1) weakest = tied[0][0];
  }
  return category => 2 + (onBoard.has(category) ? 0 : 4) + (category === weakest ? 1 : 0);
}

const byTemplateId =(a: QuestTemplate, b: QuestTemplate) => a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0;

export function selectQuestTemplate(ctx: Ctx, difficulty: Infer<typeof QuestDifficulty>, excluded: ReadonlySet<string>, avoid: ReadonlySet<string>): QuestTemplate | null {
  const area = ctx.db.playerQuestArea.playerIdentity.find(ctx.sender);
  // Curated geographic templates stay eligible only near the player's shared area.
  const catalogue = [...ctx.db.questTemplates.difficulty.filter(difficulty)]
    .filter(template => template.isActive && !excluded.has(template.templateId))
    .filter(template => !area || template.latitude === undefined || template.longitude === undefined ||
      distanceMeters(area.latitude, area.longitude, template.latitude, template.longitude) <= AREA_RELOAD_METERS)
    .sort(byTemplateId);
  const local = area ? [...ctx.db.localQuests.playerIdentity.filter(ctx.sender)]
    .filter(quest => quest.isActive && quest.difficulty.tag === difficulty.tag && !excluded.has(quest.templateId))
    .map(localQuestAsTemplate)
    .sort(byTemplateId) : [];

  const recent = recentCompletionTemplates(ctx, RECENT_MEMORY);
  const weightOf = categoryWeights(ctx, excluded);
  const pick = (eligible: QuestTemplate[]) => {
    // Prefer quests not done lately; fall back to the latest-only rule, then to anything, so small catalogues still fill.
    const fresh = eligible.filter(template => !avoid.has(template.templateId) && !recent.has(template.templateId));
    const alternatives = eligible.filter(template => !avoid.has(template.templateId));
    const choices = fresh.length ? fresh : alternatives.length ? alternatives : eligible;
    if (!choices.length) return null;
    // Choose a category first (favouring ones missing from the board and the weakest skill), then a quest
    // within it, so a category with few templates is not drowned out by one with many.
    const categories = [...new Set(choices.map(template => template.category.tag))].sort();
    const weights = categories.map(weightOf);
    let ticket = ctx.random.integerInRange(0, weights.reduce((total, weight) => total + weight, 0) - 1);
    let category = categories[categories.length - 1];
    for (let index = 0; index < categories.length; index++) {
      if (ticket < weights[index]) { category = categories[index]; break; }
      ticket -= weights[index];
    }
    const inCategory = choices.filter(template => template.category.tag === category);
    return inCategory[ctx.random.integerInRange(0, inCategory.length - 1)];
  };
  // Without a shared area no extra random draw happens, so existing boards select exactly as before.
  if (local.length && (!catalogue.length || ctx.random() < LOCAL_QUEST_PREFERENCE)) return pick(local);
  return pick(catalogue) ?? pick(local);
}
