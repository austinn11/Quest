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

const byTemplateId = (a: QuestTemplate, b: QuestTemplate) => a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0;

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

  const pick = (eligible: QuestTemplate[]) => {
    const alternatives = eligible.filter(template => !avoid.has(template.templateId));
    const choices = alternatives.length ? alternatives : eligible;
    return choices.length ? choices[ctx.random.integerInRange(0, choices.length - 1)] : null;
  };
  // Without a shared area no extra random draw happens, so existing boards select exactly as before.
  if (local.length && (!catalogue.length || ctx.random() < LOCAL_QUEST_PREFERENCE)) return pick(local);
  return pick(catalogue) ?? pick(local);
}
