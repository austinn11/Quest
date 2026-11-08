import { Timestamp } from 'spacetimedb';
import { SenderError, t, table, type Infer } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import type { QuestTemplate } from './quest-model';
import { SKILLS, skillXpAfterReward, type SkillCategory, type SkillXp } from '../../shared/progression';
import { initializePlayerSkills } from './player-progression';

// Shared goals for a whole guild. Members' ordinary quest completions count toward them.
export const GuildQuestKind = t.enum('GuildQuestKind', {
  Bestiary: t.unit(), Exploration: t.unit(), Crafting: t.unit(), Experience: t.unit(),
});
type Kind = Infer<typeof GuildQuestKind>['tag'];

export const GUILD_QUEST_DAYS = 7;
export const GUILD_QUESTS_PER_CYCLE = 3;
const DAY_MICROS = 24n * 60n * 60n * 1_000_000n;

// Private: read by members through my_guild_quests.
export const guildQuest = table({ name: 'guild_quest' }, {
  guildQuestId: t.u64().primaryKey().autoInc(),
  guildId: t.u64().index('btree'),
  kind: GuildQuestKind,
  title: t.string(),
  description: t.string(),
  target: t.u32(),
  progress: t.u32(),
  rewardXp: t.u32(),
  startedAt: t.timestamp(),
  endsAt: t.timestamp(),
  completedAt: t.option(t.timestamp()),
});

// Private: how much each member added to a guild quest. Contributors share the reward.
export const guildQuestContribution = table({
  name: 'guild_quest_contribution',
  indexes: [{ accessor: 'byQuestPlayer', algorithm: 'btree', columns: ['guildQuestId', 'playerIdentity'] }],
}, {
  contributionId: t.u64().primaryKey().autoInc(),
  guildQuestId: t.u64().index('btree'),
  playerIdentity: t.identity(),
  amount: t.u32(),
});

export type GuildQuest = Infer<typeof guildQuest.rowType>;

type Recipe = { title: string; description: (target: number) => string; target: (members: number) => number; rewardXp: number };
const RECIPES: Record<Kind, Recipe> = {
  Bestiary: {
    title: 'The Great Hunt',
    description: target => `Claim ${target} Bestiary bounties as a guild. Every capture by any member counts.`,
    target: members => 2 * members + 1, rewardXp: 100,
  },
  Exploration: {
    title: 'Chart the Frontier',
    description: target => `Complete ${target} Exploration quests between you. Scout new places together.`,
    target: members => 2 * members + 1, rewardXp: 100,
  },
  Crafting: {
    title: 'The Guild Workshop',
    description: target => `Complete ${target} Crafting quests as a guild: sketches, maps and handmade works all count.`,
    target: members => 2 * members, rewardXp: 100,
  },
  Experience: {
    title: 'Strength in Numbers',
    description: target => `Earn ${target.toLocaleString('en-US')} quest XP together this week.`,
    target: members => 150 * members + 150, rewardXp: 150,
  },
};
const KINDS = Object.keys(RECIPES) as Kind[];

const isActive = (quest: GuildQuest, now: Timestamp) => quest.endsAt.microsSinceUnixEpoch > now.microsSinceUnixEpoch;

// Fill the guild's board up to three current quests, each of a different kind.
export function ensureGuildQuests(ctx: Ctx, guildId: bigint) {
  const quests = [...ctx.db.guildQuest.guildId.filter(guildId)];
  const current = quests.filter(quest => isActive(quest, ctx.timestamp));
  if (current.length >= GUILD_QUESTS_PER_CYCLE) return;
  // Expired quests leave the board; their contributions go with them.
  for (const quest of quests.filter(quest => !isActive(quest, ctx.timestamp))) {
    for (const contribution of ctx.db.guildQuestContribution.guildQuestId.filter(quest.guildQuestId)) ctx.db.guildQuestContribution.contributionId.delete(contribution.contributionId);
    ctx.db.guildQuest.guildQuestId.delete(quest.guildQuestId);
  }
  const members = Math.max(1, [...ctx.db.guildMembership.guildId.filter(guildId)].length);
  const taken = new Set(current.map(quest => quest.kind.tag));
  const available = KINDS.filter(kind => !taken.has(kind));
  const endsAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(GUILD_QUEST_DAYS) * DAY_MICROS);
  while (taken.size < GUILD_QUESTS_PER_CYCLE && available.length) {
    const kind = available.splice(ctx.random.integerInRange(0, available.length - 1), 1)[0];
    taken.add(kind);
    const recipe = RECIPES[kind];
    const target = recipe.target(members);
    ctx.db.guildQuest.insert({
      guildQuestId: 0n, guildId, kind: { tag: kind }, title: recipe.title, description: recipe.description(target),
      target, progress: 0, rewardXp: recipe.rewardXp, startedAt: ctx.timestamp, endsAt, completedAt: undefined,
    });
  }
}

export function removeGuildQuests(ctx: Ctx, guildId: bigint) {
  for (const quest of ctx.db.guildQuest.guildId.filter(guildId)) {
    for (const contribution of ctx.db.guildQuestContribution.guildQuestId.filter(quest.guildQuestId)) ctx.db.guildQuestContribution.contributionId.delete(contribution.contributionId);
    ctx.db.guildQuest.guildQuestId.delete(quest.guildQuestId);
  }
}

// Called inside the completion transaction, after the player's own XP is saved.
export function recordGuildProgress(ctx: Ctx, template: QuestTemplate, xpAwarded: number) {
  const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
  if (!membership) return;
  for (const quest of ctx.db.guildQuest.guildId.filter(membership.guildId)) {
    if (quest.completedAt || !isActive(quest, ctx.timestamp)) continue;
    const amount = quest.kind.tag === 'Experience' ? xpAwarded : quest.kind.tag === template.category.tag ? 1 : 0;
    if (!amount) continue;
    const existing = [...ctx.db.guildQuestContribution.byQuestPlayer.filter([quest.guildQuestId, ctx.sender])][0];
    if (existing) ctx.db.guildQuestContribution.contributionId.update({ ...existing, amount: existing.amount + amount });
    else ctx.db.guildQuestContribution.insert({ contributionId: 0n, guildQuestId: quest.guildQuestId, playerIdentity: ctx.sender, amount });
    const progress = Math.min(quest.target, quest.progress + amount);
    const completed = progress >= quest.target;
    ctx.db.guildQuest.guildQuestId.update({ ...quest, progress, completedAt: completed ? ctx.timestamp : undefined });
    if (completed) rewardContributors(ctx, quest);
  }
}

// How a guild quest's bonus is credited to the three skills. The XP goal is shared evenly.
function rewardSplit(quest: GuildQuest): [SkillCategory, number][] {
  if (quest.kind.tag !== 'Experience') return [[quest.kind.tag, quest.rewardXp]];
  const share = Math.floor(quest.rewardXp / SKILLS.length);
  return SKILLS.map(({ category }, index) => [category, index === 0 ? quest.rewardXp - share * (SKILLS.length - 1) : share]);
}

// Runs once, in the transaction that completes the guild quest.
function rewardContributors(ctx: Ctx, quest: GuildQuest) {
  for (const contribution of ctx.db.guildQuestContribution.guildQuestId.filter(quest.guildQuestId)) {
    // Members who left still earned their share.
    const found = ctx.db.player.identity.find(contribution.playerIdentity);
    if (!found) continue;
    try {
      // Skill counters must be migrated first, or a later migration would recompute them without the bonus.
      const player = initializePlayerSkills(ctx, found);
      let skills: SkillXp = { explorationXp: player.explorationXp, bestiaryXp: player.bestiaryXp, craftingXp: player.craftingXp };
      for (const [category, amount] of rewardSplit(quest)) skills = skillXpAfterReward(skills, category, amount);
      ctx.db.player.identity.update({ ...player, ...skills });
    } catch (error) {
      // One contributor's unmigratable history or full XP must not block the others or the completion.
      console.warn(`Guild quest ${quest.guildQuestId} reward skipped for a contributor: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function refreshGuildQuests(ctx: Ctx) {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
  if (!membership) throw new SenderError('Join a guild to see guild quests.');
  ensureGuildQuests(ctx, membership.guildId);
}

// The read-only view slice for my_guild_quests.
type GuildQuestReadDb = {
  sender: Ctx['sender'];
  db: {
    guildMembership: { playerIdentity: { find(identity: Ctx['sender']): { guildId: bigint } | null | undefined } };
    guildQuest: { guildId: { filter(guildId: bigint): Iterable<GuildQuest> } };
    guildQuestContribution: { guildQuestId: { filter(guildQuestId: bigint): Iterable<{ playerIdentity: Ctx['sender']; amount: number }> } };
  };
};

export function guildQuestRows(ctx: GuildQuestReadDb) {
  const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
  if (!membership) return [];
  return [...ctx.db.guildQuest.guildId.filter(membership.guildId)].map(quest => {
    let yourContribution = 0;
    let contributors = 0;
    for (const contribution of ctx.db.guildQuestContribution.guildQuestId.filter(quest.guildQuestId)) {
      contributors++;
      if (contribution.playerIdentity.equals(ctx.sender)) yourContribution = contribution.amount;
    }
    return {
      guildQuestId: quest.guildQuestId, kind: quest.kind.tag, title: quest.title, description: quest.description,
      target: quest.target, progress: quest.progress, rewardXp: quest.rewardXp,
      startedAt: quest.startedAt, endsAt: quest.endsAt, completedAt: quest.completedAt,
      yourContribution, contributors,
    };
  });
}
