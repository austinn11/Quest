import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';
import { getTotalPlayerXp, skillXpAfterReward } from '../../shared/progression';
import { resolveQuest } from './quest-selection';

type Player = NonNullable<ReturnType<Ctx['db']['player']['identity']['find']>>;

// One-time, owner-scoped migration. The old xp column remains an untouched audit value.
// Never infer a category for missing history or distribute unaccounted XP arbitrarily.
export function initializePlayerSkills(ctx: Ctx, player: Player): Player {
  if (player.progressionReady) return player;
  let skills = { explorationXp: 0, bestiaryXp: 0, craftingXp: 0 };
  for (const completion of ctx.db.questCompletions.playerIdentity.filter(player.identity)) {
    const template = resolveQuest(ctx, player.identity, completion.templateId);
    if (!template) throw new SenderError('Your previous XP is preserved, but a completed quest is missing its category. The team must review your progression before it can be migrated.');
    skills = skillXpAfterReward(skills, template.category.tag, completion.xpAwarded);
  }
  if (getTotalPlayerXp(skills) !== player.xp) {
    throw new SenderError('Your previous XP is preserved, but quest history does not match the saved total. The team must review your progression before it can be migrated.');
  }
  const updated = { ...player, ...skills, progressionReady: true };
  ctx.db.player.identity.update(updated);
  return updated;
}
