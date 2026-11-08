import { SenderError, t, table, type Infer } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { getTotalPlayerXp, levelForXp, skillXpAfterReward, type SkillXp } from '../../shared/progression';
import { initializePlayerSkills } from './player-progression';
import { localQuestAsTemplate, type LocalQuest } from './quest-model';
import { resolveQuest } from './quest-selection';
import { validateTemplate, type QuestTemplate } from './quest-model';
import { countPhotoAttempt } from './quest-area';

export const PARTY_MAX_MEMBERS = 4;
export const PARTY_BONUS_PERCENT = 25;

// All social tables are private. Players see each other only through the views below, by username.
export const friendship = table({ name: 'friendship' }, {
  friendshipId: t.u64().primaryKey().autoInc(),
  firstIdentity: t.identity().index('btree'),
  secondIdentity: t.identity().index('btree'),
  createdAt: t.timestamp(),
});

export const friendRequest = table({ name: 'friend_request' }, {
  requestId: t.u64().primaryKey().autoInc(),
  fromIdentity: t.identity().index('btree'),
  toIdentity: t.identity().index('btree'),
  createdAt: t.timestamp(),
});

export const party = table({ name: 'party' }, {
  partyId: t.u64().primaryKey().autoInc(),
  leaderIdentity: t.identity(),
  // The shared quest, picked by the leader from their own board.
  questTemplateId: t.option(t.string()),
  createdAt: t.timestamp(),
  lastQuestTitle: t.option(t.string()),
  lastCompletedBy: t.option(t.string()),
  lastObservation: t.option(t.string()),
  lastXpEach: t.option(t.u32()),
  lastCompletedAt: t.option(t.timestamp()),
  questSnapshot: t.option(t.string()).default(undefined),
});

export const partyMember = table({ name: 'party_member' }, {
  playerIdentity: t.identity().primaryKey(),
  partyId: t.u64().index('btree'),
  joinedAt: t.timestamp(),
});

export const partyInvite = table({ name: 'party_invite' }, {
  inviteId: t.u64().primaryKey().autoInc(),
  partyId: t.u64().index('btree'),
  toIdentity: t.identity().index('btree'),
  fromIdentity: t.identity(),
  createdAt: t.timestamp(),
});

export type Party = Infer<typeof party.rowType>;

function requirePlayer(ctx: Ctx) {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Create your player profile first.');
  if (!player.username) throw new SenderError('Choose a username on your Profile so friends can find you.');
  return player;
}

function playerByUsername(ctx: Ctx, username: string) {
  const key = username.trim().toLowerCase();
  const found = key ? [...ctx.db.player.usernameKey.filter(key)][0] : undefined;
  if (!found) throw new SenderError('No adventurer has that username.');
  return found;
}

function friendshipBetween(ctx: Ctx, one: Identity, other: Identity) {
  for (const row of ctx.db.friendship.firstIdentity.filter(one)) if (row.secondIdentity.equals(other)) return row;
  for (const row of ctx.db.friendship.secondIdentity.filter(one)) if (row.firstIdentity.equals(other)) return row;
  return undefined;
}

function requestBetween(ctx: Ctx, from: Identity, to: Identity) {
  for (const row of ctx.db.friendRequest.fromIdentity.filter(from)) if (row.toIdentity.equals(to)) return row;
  return undefined;
}

// Friends

export function sendFriendRequest(ctx: Ctx, { username }: { username: string }) {
  requirePlayer(ctx);
  const target = playerByUsername(ctx, username);
  if (target.identity.equals(ctx.sender)) throw new SenderError('You cannot add yourself as a friend.');
  if (friendshipBetween(ctx, ctx.sender, target.identity)) throw new SenderError(`You are already friends with ${target.username}.`);
  if (requestBetween(ctx, ctx.sender, target.identity)) throw new SenderError(`You already sent ${target.username} a request.`);
  // If they already asked you, sending one back accepts it.
  const reverse = requestBetween(ctx, target.identity, ctx.sender);
  if (reverse) {
    ctx.db.friendRequest.requestId.delete(reverse.requestId);
    ctx.db.friendship.insert({ friendshipId: 0n, firstIdentity: ctx.sender, secondIdentity: target.identity, createdAt: ctx.timestamp });
    return;
  }
  ctx.db.friendRequest.insert({ requestId: 0n, fromIdentity: ctx.sender, toIdentity: target.identity, createdAt: ctx.timestamp });
}

export function respondFriendRequest(ctx: Ctx, { requestId, accept }: { requestId: bigint; accept: boolean }) {
  requirePlayer(ctx);
  const request = ctx.db.friendRequest.requestId.find(requestId);
  // Either side may withdraw or decline; only the recipient may accept.
  if (!request || !(request.toIdentity.equals(ctx.sender) || (!accept && request.fromIdentity.equals(ctx.sender)))) {
    throw new SenderError('That friend request is no longer available.');
  }
  ctx.db.friendRequest.requestId.delete(requestId);
  if (accept && !friendshipBetween(ctx, request.fromIdentity, request.toIdentity)) {
    ctx.db.friendship.insert({ friendshipId: 0n, firstIdentity: request.fromIdentity, secondIdentity: request.toIdentity, createdAt: ctx.timestamp });
  }
}

export function removeFriend(ctx: Ctx, { username }: { username: string }) {
  requirePlayer(ctx);
  const target = playerByUsername(ctx, username);
  const row = friendshipBetween(ctx, ctx.sender, target.identity);
  if (!row) throw new SenderError(`You are not friends with ${target.username}.`);
  ctx.db.friendship.friendshipId.delete(row.friendshipId);
}

// Parties

const membersOf = (ctx: Ctx, partyId: bigint) => [...ctx.db.partyMember.partyId.filter(partyId)];

function myParty(ctx: Ctx) {
  const membership = ctx.db.partyMember.playerIdentity.find(ctx.sender);
  const row = membership && ctx.db.party.partyId.find(membership.partyId);
  return row ?? undefined;
}

export function createParty(ctx: Ctx) {
  requirePlayer(ctx);
  if (ctx.db.partyMember.playerIdentity.find(ctx.sender)) throw new SenderError('You are already in a party.');
  const row = ctx.db.party.insert({
    partyId: 0n, leaderIdentity: ctx.sender, questTemplateId: undefined, questSnapshot: undefined, createdAt: ctx.timestamp,
    lastQuestTitle: undefined, lastCompletedBy: undefined, lastObservation: undefined, lastXpEach: undefined, lastCompletedAt: undefined,
  });
  ctx.db.partyMember.insert({ playerIdentity: ctx.sender, partyId: row.partyId, joinedAt: ctx.timestamp });
}

export function inviteToParty(ctx: Ctx, { username }: { username: string }) {
  requirePlayer(ctx);
  const target = playerByUsername(ctx, username);
  if (!friendshipBetween(ctx, ctx.sender, target.identity)) throw new SenderError('You can only invite friends to your party.');
  if (!ctx.db.partyMember.playerIdentity.find(ctx.sender)) createParty(ctx);
  const current = myParty(ctx)!;
  if (ctx.db.partyMember.playerIdentity.find(target.identity)?.partyId === current.partyId) throw new SenderError(`${target.username} is already in your party.`);
  if (membersOf(ctx, current.partyId).length >= PARTY_MAX_MEMBERS) throw new SenderError(`Parties hold at most ${PARTY_MAX_MEMBERS} adventurers.`);
  for (const invite of ctx.db.partyInvite.partyId.filter(current.partyId)) {
    if (invite.toIdentity.equals(target.identity)) throw new SenderError(`${target.username} already has an invite.`);
  }
  ctx.db.partyInvite.insert({ inviteId: 0n, partyId: current.partyId, toIdentity: target.identity, fromIdentity: ctx.sender, createdAt: ctx.timestamp });
}

export function respondPartyInvite(ctx: Ctx, { inviteId, accept }: { inviteId: bigint; accept: boolean }) {
  requirePlayer(ctx);
  const invite = ctx.db.partyInvite.inviteId.find(inviteId);
  if (!invite || !invite.toIdentity.equals(ctx.sender)) throw new SenderError('That party invite is no longer available.');
  ctx.db.partyInvite.inviteId.delete(inviteId);
  if (!accept) return;
  if (!ctx.db.party.partyId.find(invite.partyId)) throw new SenderError('That party has disbanded.');
  if (ctx.db.partyMember.playerIdentity.find(ctx.sender)) throw new SenderError('Leave your current party before joining another.');
  if (membersOf(ctx, invite.partyId).length >= PARTY_MAX_MEMBERS) throw new SenderError('That party is full.');
  ctx.db.partyMember.insert({ playerIdentity: ctx.sender, partyId: invite.partyId, joinedAt: ctx.timestamp });
  // Joining one party clears your other pending invites.
  for (const other of ctx.db.partyInvite.toIdentity.filter(ctx.sender)) ctx.db.partyInvite.inviteId.delete(other.inviteId);
}

export function leaveParty(ctx: Ctx) {
  requirePlayer(ctx);
  const current = myParty(ctx);
  if (!current) throw new SenderError('You are not in a party.');
  ctx.db.partyMember.playerIdentity.delete(ctx.sender);
  const remaining = membersOf(ctx, current.partyId).sort((a, b) =>
    a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : a.joinedAt.microsSinceUnixEpoch > b.joinedAt.microsSinceUnixEpoch ? 1 : 0);
  if (!remaining.length) {
    for (const invite of ctx.db.partyInvite.partyId.filter(current.partyId)) ctx.db.partyInvite.inviteId.delete(invite.inviteId);
    ctx.db.party.partyId.delete(current.partyId);
  } else if (current.leaderIdentity.equals(ctx.sender)) {
    // The longest-standing member leads; the leader's own local quest no longer applies.
    ctx.db.party.partyId.update({ ...current, leaderIdentity: remaining[0].playerIdentity, questTemplateId: undefined, questSnapshot: undefined });
  }
}

export function setPartyQuest(ctx: Ctx, { templateId }: { templateId: string }) {
  requirePlayer(ctx);
  const current = myParty(ctx);
  if (!current || !current.leaderIdentity.equals(ctx.sender)) throw new SenderError('Only the party leader can choose the party quest.');
  if (!templateId) {
    ctx.db.party.partyId.update({ ...current, questTemplateId: undefined });
    return;
  }
  // Leaders choose from quests currently on their own board.
  const onBoard = [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)].some(slot => slot.templateId === templateId && slot.status.tag === 'Available');
  const template = onBoard ? resolveQuest(ctx, ctx.sender, templateId) : null;
  if (!template) throw new SenderError('Choose a quest that is available on your Questboard.');
  ctx.db.party.partyId.update({ ...current, questTemplateId: templateId, questSnapshot: JSON.stringify(template) });
}

// Party quest photo step 1: confirm the party has a quest and count the attempt.
export function beginPartyPhotoCheck(ctx: Ctx): QuestTemplate {
  requirePlayer(ctx);
  const current = myParty(ctx);
  if (!current) throw new SenderError('Join a party to do party quests.');
  const template = current.questTemplateId ? (current.questSnapshot ? JSON.parse(current.questSnapshot) as QuestTemplate : resolveQuest(ctx, current.leaderIdentity, current.questTemplateId)) : null;
  if (!template) throw new SenderError('Your party has no quest yet. The leader can choose one.');
  const error = validateTemplate(template);
  if (error) throw new SenderError(error);
  countPhotoAttempt(ctx);
  return template;
}

// Party quest photo step 3: every member earns the quest's XP plus the party bonus, once.
export function finishPartyQuest(ctx: Ctx, templateId: string, observation: string, expectedQuest?: QuestTemplate): number {
  const player = requirePlayer(ctx);
  const current = myParty(ctx);
  if (!current || current.questTemplateId !== templateId) throw new SenderError('The party quest changed before your photo was checked. Try again.');
  const template = current.questSnapshot ? JSON.parse(current.questSnapshot) as QuestTemplate : resolveQuest(ctx, current.leaderIdentity, templateId);
  if (!template) throw new SenderError('The party quest is unavailable.');
  if (expectedQuest && JSON.stringify(template) !== JSON.stringify(expectedQuest)) throw new SenderError('The party destination changed before the photo was checked. Try again.');
  const xpEach = template.xpReward + Math.floor(template.xpReward * PARTY_BONUS_PERCENT / 100);
  for (const member of membersOf(ctx, current.partyId)) {
    const found = ctx.db.player.identity.find(member.playerIdentity);
    if (!found) continue;
    try {
      const row = initializePlayerSkills(ctx, found);
      const skills: SkillXp = skillXpAfterReward(row, template.category.tag, xpEach);
      ctx.db.player.identity.update({ ...row, explorationXp: skills.explorationXp, bestiaryXp: skills.bestiaryXp, craftingXp: skills.craftingXp });
    } catch (error) {
      console.warn(`Party reward skipped for a member: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  ctx.db.party.partyId.update({
    ...current, questTemplateId: undefined, questSnapshot: undefined, lastQuestTitle: template.title, lastCompletedBy: player.username,
    lastObservation: observation.trim().slice(0, 160) || undefined, lastXpEach: xpEach, lastCompletedAt: ctx.timestamp,
  });
  return xpEach;
}

// View helpers (views get a read-only db, so these take a narrow structural type).
type PlayerRead = SkillXp & { identity: Identity; username: string };
type SocialReadCtx = {
  sender: Identity;
  db: {
    player: { identity: { find(identity: Identity): PlayerRead | null | undefined } };
    friendship: {
      firstIdentity: { filter(identity: Identity): Iterable<{ friendshipId: bigint; secondIdentity: Identity }> };
      secondIdentity: { filter(identity: Identity): Iterable<{ friendshipId: bigint; firstIdentity: Identity }> };
    };
    friendRequest: {
      fromIdentity: { filter(identity: Identity): Iterable<{ requestId: bigint; toIdentity: Identity; createdAt: Infer<ReturnType<typeof t.timestamp>> }> };
      toIdentity: { filter(identity: Identity): Iterable<{ requestId: bigint; fromIdentity: Identity; createdAt: Infer<ReturnType<typeof t.timestamp>> }> };
    };
    partyMember: {
      playerIdentity: { find(identity: Identity): { partyId: bigint } | null | undefined };
      partyId: { filter(partyId: bigint): Iterable<{ playerIdentity: Identity; joinedAt: Infer<ReturnType<typeof t.timestamp>> }> };
    };
    party: { partyId: { find(partyId: bigint): Party | null | undefined } };
    partyInvite: { toIdentity: { filter(identity: Identity): Iterable<{ inviteId: bigint; partyId: bigint; fromIdentity: Identity; createdAt: Infer<ReturnType<typeof t.timestamp>> }> } };
    questTemplates: { templateId: { find(templateId: string): QuestTemplate | null | undefined } };
    localQuests: { templateId: { find(templateId: string): LocalQuest | null | undefined } };
  };
};

const nameOf = (ctx: SocialReadCtx, identity: Identity) => ctx.db.player.identity.find(identity)?.username || 'Unnamed adventurer';
const levelOf = (player: PlayerRead | null | undefined) => levelForXp(player ? getTotalPlayerXp(player) : 0);

export function friendRows(ctx: SocialReadCtx) {
  const myPartyId = ctx.db.partyMember.playerIdentity.find(ctx.sender)?.partyId;
  const rows = [
    ...[...ctx.db.friendship.firstIdentity.filter(ctx.sender)].map(row => ({ friendshipId: row.friendshipId, other: row.secondIdentity })),
    ...[...ctx.db.friendship.secondIdentity.filter(ctx.sender)].map(row => ({ friendshipId: row.friendshipId, other: row.firstIdentity })),
  ];
  return rows.map(({ friendshipId, other }) => {
    const player = ctx.db.player.identity.find(other);
    const theirParty = ctx.db.partyMember.playerIdentity.find(other)?.partyId;
    return {
      friendshipId, username: player?.username || 'Unnamed adventurer', level: levelOf(player),
      totalXp: player ? getTotalPlayerXp(player) : 0,
      inYourParty: myPartyId !== undefined && theirParty === myPartyId,
      inAParty: theirParty !== undefined,
    };
  });
}

export function friendRequestRows(ctx: SocialReadCtx) {
  return [
    ...[...ctx.db.friendRequest.toIdentity.filter(ctx.sender)].map(row => ({ requestId: row.requestId, username: nameOf(ctx, row.fromIdentity), incoming: true, createdAt: row.createdAt })),
    ...[...ctx.db.friendRequest.fromIdentity.filter(ctx.sender)].map(row => ({ requestId: row.requestId, username: nameOf(ctx, row.toIdentity), incoming: false, createdAt: row.createdAt })),
  ];
}

export function partyInviteRows(ctx: SocialReadCtx) {
  return [...ctx.db.partyInvite.toIdentity.filter(ctx.sender)].map(row => ({
    inviteId: row.inviteId, fromName: nameOf(ctx, row.fromIdentity),
    partySize: [...ctx.db.partyMember.partyId.filter(row.partyId)].length, createdAt: row.createdAt,
  }));
}

export function partyRow(ctx: SocialReadCtx) {
  const membership = ctx.db.partyMember.playerIdentity.find(ctx.sender);
  const row = membership && ctx.db.party.partyId.find(membership.partyId);
  if (!membership || !row) return undefined;
  let quest: QuestTemplate | undefined;
  if (row.questTemplateId && row.questSnapshot) quest = JSON.parse(row.questSnapshot) as QuestTemplate;
  if (row.questTemplateId && !quest) {
    quest = ctx.db.questTemplates.templateId.find(row.questTemplateId) ?? undefined;
    const local = quest ? undefined : ctx.db.localQuests.templateId.find(row.questTemplateId);
    if (local && local.playerIdentity.equals(row.leaderIdentity)) quest = localQuestAsTemplate(local);
  }
  return {
    partyId: row.partyId, isLeader: row.leaderIdentity.equals(ctx.sender), leaderName: nameOf(ctx, row.leaderIdentity),
    questTemplateId: quest?.templateId, questTitle: quest?.title, questDescription: quest?.description,
    questCategory: quest?.category.tag, questXpEach: quest ? quest.xpReward + Math.floor(quest.xpReward * PARTY_BONUS_PERCENT / 100) : undefined,
    questPhotoGoal: quest?.photoGoal, questLocationName: quest?.locationName,
    lastQuestTitle: row.lastQuestTitle, lastCompletedBy: row.lastCompletedBy, lastObservation: row.lastObservation,
    lastXpEach: row.lastXpEach, lastCompletedAt: row.lastCompletedAt,
  };
}

export function partyMemberRows(ctx: SocialReadCtx) {
  const membership = ctx.db.partyMember.playerIdentity.find(ctx.sender);
  const row = membership && ctx.db.party.partyId.find(membership.partyId);
  if (!membership || !row) return [];
  return [...ctx.db.partyMember.partyId.filter(membership.partyId)].map(member => {
    const player = ctx.db.player.identity.find(member.playerIdentity);
    return {
      memberId: member.playerIdentity.toHexString().slice(0, 16), username: player?.username || 'Unnamed adventurer',
      level: levelOf(player), isLeader: row.leaderIdentity.equals(member.playerIdentity),
      isYou: member.playerIdentity.equals(ctx.sender), joinedAt: member.joinedAt,
    };
  });
}
