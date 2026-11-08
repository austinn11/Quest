import { SenderError, t, table, type Infer } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { levelForXp } from './player-profile';
import { ensureGuildQuests, removeGuildQuests } from './guild-quests';

export const GUILD_MAX_MEMBERS = 20;
export const GUILD_CRESTS = ['moss', 'river', 'ember', 'dusk', 'gold', 'slate'] as const;
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O or 1/I confusion.
const JOIN_CODE_LENGTH = 6;

export const GuildRole = t.enum('GuildRole', { Leader: t.unit(), Member: t.unit() });

// Public guild facts. Membership and invite codes live in private tables.
export const guild = table({ name: 'guild', public: true }, {
  guildId: t.u64().primaryKey().autoInc(),
  name: t.string(),
  nameKey: t.string().unique(),
  motto: t.string(),
  crest: t.string(),
  isOpen: t.bool(),
  foundedAt: t.timestamp(),
});

// Private: one row per player, so a player belongs to at most one guild.
export const guildMembership = table({ name: 'guild_membership' }, {
  playerIdentity: t.identity().primaryKey(),
  guildId: t.u64().index('btree'),
  role: GuildRole,
  joinedAt: t.timestamp(),
});

// Private: invite codes, shown only to members through my_guild.
export const guildInvite = table({ name: 'guild_invite' }, {
  guildId: t.u64().primaryKey(),
  joinCode: t.string().unique(),
});

export type Guild = Infer<typeof guild.rowType>;
export type GuildMembership = Infer<typeof guildMembership.rowType>;

export function normalizeGuildName(value: string): string | null {
  const name = value.replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9][A-Za-z0-9 '\-]{1,30}[A-Za-z0-9.!]$/.test(name) ? name : null;
}

function requirePlayer(ctx: Ctx) {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Create your player profile before joining a guild.');
  return player;
}

function newJoinCode(ctx: Ctx): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[ctx.random.integerInRange(0, JOIN_CODE_ALPHABET.length - 1)];
    if (!ctx.db.guildInvite.joinCode.find(code)) return code;
  }
}

const members = (ctx: Ctx, guildId: bigint) => [...ctx.db.guildMembership.guildId.filter(guildId)];

function join(ctx: Ctx, target: Guild) {
  if (ctx.db.guildMembership.playerIdentity.find(ctx.sender)) throw new SenderError('Leave your current guild before joining another.');
  if (members(ctx, target.guildId).length >= GUILD_MAX_MEMBERS) throw new SenderError(`${target.name} is full (${GUILD_MAX_MEMBERS} members).`);
  ctx.db.guildMembership.insert({ playerIdentity: ctx.sender, guildId: target.guildId, role: { tag: 'Member' }, joinedAt: ctx.timestamp });
}

export function createGuild(ctx: Ctx, args: { name: string; motto: string; crest: string; isOpen: boolean }) {
  requirePlayer(ctx);
  if (ctx.db.guildMembership.playerIdentity.find(ctx.sender)) throw new SenderError('Leave your current guild before founding a new one.');
  const name = normalizeGuildName(args.name);
  if (!name) throw new SenderError('Guild names need 3 to 32 letters, numbers, spaces, apostrophes or hyphens.');
  const nameKey = name.toLowerCase();
  if (ctx.db.guild.nameKey.find(nameKey)) throw new SenderError('That guild name is already taken.');
  const motto = args.motto.replace(/\s+/g, ' ').trim();
  if (motto.length > 100) throw new SenderError('Guild mottos can be at most 100 characters.');
  if (!(GUILD_CRESTS as readonly string[]).includes(args.crest)) throw new SenderError('Choose one of the guild crests.');
  const row = ctx.db.guild.insert({ guildId: 0n, name, nameKey, motto, crest: args.crest, isOpen: args.isOpen, foundedAt: ctx.timestamp });
  ctx.db.guildInvite.insert({ guildId: row.guildId, joinCode: newJoinCode(ctx) });
  ctx.db.guildMembership.insert({ playerIdentity: ctx.sender, guildId: row.guildId, role: { tag: 'Leader' }, joinedAt: ctx.timestamp });
  ensureGuildQuests(ctx, row.guildId);
}

export function joinOpenGuild(ctx: Ctx, { guildId }: { guildId: bigint }) {
  requirePlayer(ctx);
  const target = ctx.db.guild.guildId.find(guildId);
  if (!target) throw new SenderError('That guild no longer exists.');
  if (!target.isOpen) throw new SenderError(`${target.name} is invite-only. Ask a member for its invite code.`);
  join(ctx, target);
}

export function joinGuildByCode(ctx: Ctx, { joinCode }: { joinCode: string }) {
  requirePlayer(ctx);
  const invite = ctx.db.guildInvite.joinCode.find(joinCode.replace(/[\s-]/g, '').toUpperCase());
  const target = invite && ctx.db.guild.guildId.find(invite.guildId);
  if (!target) throw new SenderError('No guild uses that invite code. Check it and try again.');
  join(ctx, target);
}

export function leaveGuild(ctx: Ctx) {
  requirePlayer(ctx);
  const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
  if (!membership) throw new SenderError('You are not in a guild.');
  ctx.db.guildMembership.playerIdentity.delete(ctx.sender);
  const remaining = members(ctx, membership.guildId).sort((a, b) =>
    a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : a.joinedAt.microsSinceUnixEpoch > b.joinedAt.microsSinceUnixEpoch ? 1 : 0);
  if (!remaining.length) {
    // The last adventurer out disbands the guild and frees its name.
    ctx.db.guild.guildId.delete(membership.guildId);
    ctx.db.guildInvite.guildId.delete(membership.guildId);
    removeGuildQuests(ctx, membership.guildId);
  } else if (membership.role.tag === 'Leader') {
    ctx.db.guildMembership.playerIdentity.update({ ...remaining[0], role: { tag: 'Leader' } });
  }
}

export function setGuildOpen(ctx: Ctx, { isOpen }: { isOpen: boolean }) {
  requirePlayer(ctx);
  const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
  if (!membership || membership.role.tag !== 'Leader') throw new SenderError('Only the guild leader can change who may join.');
  const row = ctx.db.guild.guildId.find(membership.guildId)!;
  ctx.db.guild.guildId.update({ ...row, isOpen });
}

// The read-only slice of the database the view helpers need (views get a read-only db).
type GuildReadDb = {
  db: {
    player: { identity: { find(identity: Identity): { xp: number; username: string } | null | undefined } };
    guildMembership: { guildId: { filter(guildId: bigint): Iterable<GuildMembership> } };
  };
};

// View helpers. Member names come from chosen usernames only, never Google profile names.
export function guildStats(ctx: GuildReadDb, guildId: bigint) {
  let memberCount = 0;
  let totalXp = 0n;
  for (const membership of ctx.db.guildMembership.guildId.filter(guildId)) {
    memberCount++;
    totalXp += BigInt(ctx.db.player.identity.find(membership.playerIdentity)?.xp ?? 0);
  }
  return { memberCount, totalXp };
}

export function memberRows(ctx: GuildReadDb, viewer: Identity, guildId: bigint) {
  return [...ctx.db.guildMembership.guildId.filter(guildId)].map(membership => {
    const player = ctx.db.player.identity.find(membership.playerIdentity);
    const xp = player?.xp ?? 0;
    return {
      memberId: membership.playerIdentity.toHexString().slice(0, 16),
      name: player?.username || 'Unnamed adventurer',
      xp,
      level: levelForXp(xp),
      role: membership.role.tag,
      joinedAt: membership.joinedAt,
      isYou: membership.playerIdentity.equals(viewer),
    };
  });
}
