import type { Infer } from 'spacetimedb/server';
import type { Ctx } from './index';
import type { QuestDifficulty, QuestTemplate } from './quest-model';

export function mostRecentCompletionTemplate(ctx: Ctx): string | undefined {
  let latest: ReturnType<typeof ctx.db.questCompletions.completionId.find> = null;
  for (const completion of ctx.db.questCompletions.playerIdentity.filter(ctx.sender)) {
    if (!latest || completion.completedAt.microsSinceUnixEpoch > latest.completedAt.microsSinceUnixEpoch ||
      (completion.completedAt.microsSinceUnixEpoch === latest.completedAt.microsSinceUnixEpoch && completion.completionId > latest.completionId)) latest = completion;
  }
  return latest?.templateId;
}

export function selectQuestTemplate(ctx: Ctx, difficulty: Infer<typeof QuestDifficulty>, excluded: ReadonlySet<string>, avoid: ReadonlySet<string>): QuestTemplate | null {
  const eligible = [...ctx.db.questTemplates.difficulty.filter(difficulty)]
    .filter(template => template.isActive && !excluded.has(template.templateId))
    .sort((a, b) => a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0);
  const alternatives = eligible.filter(template => !avoid.has(template.templateId));
  const choices = alternatives.length ? alternatives : eligible;
  return choices.length ? choices[ctx.random.integerInRange(0, choices.length - 1)] : null;
}
