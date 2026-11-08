import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { TimeDuration } from 'spacetimedb';
import { authenticationError } from './auth-policy';
import { levelForXp, normalizeUsername, USERNAME_ERROR } from './player-profile';
import { guild, guildInvite, guildMembership, guildStats, memberRows, createGuild as createGuildHandler, joinGuildByCode as joinGuildByCodeHandler, joinOpenGuild as joinOpenGuildHandler, leaveGuild as leaveGuildHandler, setGuildOpen as setGuildOpenHandler } from './guilds';
import { questTemplates, playerQuestSlots, questCompletions, playerQuestArea, localQuests, photoAttempts, creatureCaptures, validateTemplate, validateSlot, SLOT_DIFFICULTIES, slotIdFor } from './quest-model';
import { buildJudgeRequest, parseJudgeResponse, validateCapturePhoto, validateImageDataUrl, type JudgeVerdict } from './photo-judge';
import { applyQuestArea, beginPhotoCheck, finishPhotoCompletion } from './quest-area';
import { AI_REQUEST_TIMEOUT_MS, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, FALLBACK_AI_MODEL } from './quest-config';
import { seedTemplates } from './quest-seeds';
import { completeQuest as completeQuestHandler } from './quest-completion';
import { refreshQuestSlots as refreshQuestSlotsHandler } from './quest-refresh';
import { mostRecentCompletionTemplate, selectQuestTemplate } from './quest-selection';

// Private by default. Players can read only their own row through myPlayer below.
const player = table(
  { name: 'player' },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    xp: t.u32(),
    createdAt: t.timestamp(),
    // Appended defaults preserve profiles created before username setup existed.
    username: t.string().default(''),
    usernameKey: t.string().index('btree').default(''),
  }
);

const spacetimedb = schema({
  player,
  questTemplates,
  playerQuestSlots,
  questCompletions,
  playerQuestArea,
  localQuests,
  photoAttempts,
  creatureCaptures,
  guild,
  guildMembership,
  guildInvite,
}, { env: {
  SPACETIMEAUTH_CLIENT_ID: t.string(),
  // Photo judge: any OpenAI-compatible chat completions API, Google Gemini by default.
  // Without a key, photos are accepted unchecked.
  AI_API_KEY: t.option(t.string()),
  AI_BASE_URL: t.option(t.string()),
  AI_MODEL: t.option(t.string()),
} });
export default spacetimedb;

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function seedQuestTemplates(ctx: Ctx) {
  for (const template of seedTemplates) {
    const existing = ctx.db.questTemplates.templateId.find(template.templateId);
    if (existing) {
      let updated = existing;
      // Label the existing campus point without moving it or altering its quest/reward.
      if (existing.templateId === 'easy-campus-scout' && existing.locationName === undefined && existing.latitude === template.latitude && existing.longitude === template.longitude) {
        updated = { ...updated, locationName: template.locationName, locationType: existing.locationType ?? template.locationType };
      }
      // Backfill photo goals for catalogues created before photo proof existed.
      if (updated.photoGoal === undefined && template.photoGoal !== undefined) updated = { ...updated, photoGoal: template.photoGoal };
      if (updated.bountyTarget === undefined && template.bountyTarget !== undefined) updated = { ...updated, bountyTarget: template.bountyTarget };
      if (updated !== existing) ctx.db.questTemplates.templateId.update(updated);
      continue;
    }
    const error = validateTemplate(template);
    if (error) throw new SenderError(error);
    ctx.db.questTemplates.insert(template);
  }
}

export const myQuestSlots = spacetimedb.view(
  { name: 'my_quest_slots', public: true },
  t.array(playerQuestSlots.rowType),
  ctx => [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)]
);

export const myLocalQuests = spacetimedb.view(
  { name: 'my_local_quests', public: true },
  t.array(localQuests.rowType),
  ctx => [...ctx.db.localQuests.playerIdentity.filter(ctx.sender)]
);

export const myCreatureCaptures = spacetimedb.view(
  { name: 'my_creature_captures', public: true },
  t.array(creatureCaptures.rowType),
  ctx => [...ctx.db.creatureCaptures.playerIdentity.filter(ctx.sender)]
);

export const myQuestArea = spacetimedb.view(
  { name: 'my_quest_area', public: true },
  t.option(playerQuestArea.rowType),
  ctx => ctx.db.playerQuestArea.playerIdentity.find(ctx.sender) ?? undefined
);

export const myQuestCompletions = spacetimedb.view(
  { name: 'my_quest_completions', public: true },
  t.array(questCompletions.rowType),
  ctx => [...ctx.db.questCompletions.playerIdentity.filter(ctx.sender)]
);

const playerProfile = t.row('PlayerProfile', {
  identity: t.identity().primaryKey(),
  displayName: t.string(),
  xp: t.u32(),
  createdAt: t.timestamp(),
  username: t.string(),
  level: t.u32(),
});

export const myPlayer = spacetimedb.view(
  { name: 'my_player', public: true },
  t.option(playerProfile),
  ctx => {
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) return undefined;
    return {
      identity: row.identity,
      displayName: row.displayName,
      xp: row.xp,
      createdAt: row.createdAt,
      username: row.username,
      level: levelForXp(row.xp),
    };
  }
);

export const ensurePlayer = spacetimedb.reducer(ctx => {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  if (ctx.db.player.identity.find(ctx.sender)) return;

  const claims = ctx.senderAuth.jwt!.fullPayload;
  const name = claims.name ?? claims.preferred_username;
  ctx.db.player.insert({
    identity: ctx.sender,
    displayName: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Adventurer',
    xp: 0,
    createdAt: ctx.timestamp,
    username: '',
    usernameKey: '',
  });
});

export const initializeQuestboard = spacetimedb.reducer(ctx => {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  if (!ctx.db.player.identity.find(ctx.sender)) {
    throw new SenderError('Create your player profile before initializing your Questboard.');
  }

  const existing = [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)];
  if (existing.length) {
    // Initialization never rerolls existing quests, including cooldown or inactive assignments.
    const complete = existing.length === SLOT_DIFFICULTIES.length && SLOT_DIFFICULTIES.every((difficulty, index) =>
      existing.some(slot => slot.slotId === slotIdFor(ctx.sender, index) && slot.slotIndex === index && slot.difficulty.tag === difficulty)
    );
    if (!complete) throw new SenderError('Your Questboard is incomplete. Please contact the team to restore it.');
    return;
  }

  // History is a preference, not a permanent blacklist. A small catalogue must remain usable.
  const latest = mostRecentCompletionTemplate(ctx);
  const avoid = new Set(latest ? [latest] : []);

  const used = new Set<string>();
  const assignments = SLOT_DIFFICULTIES.map((difficulty, slotIndex) => {
    const template = selectQuestTemplate(ctx, { tag: difficulty }, used, avoid);
    if (!template) throw new SenderError(`Not enough active ${difficulty} quest templates to initialize your Questboard. Please retry later.`);
    const templateError = validateTemplate(template);
    if (templateError) throw new SenderError(templateError);
    used.add(template.templateId);
    const slot = {
      slotId: slotIdFor(ctx.sender, slotIndex), playerIdentity: ctx.sender, slotIndex,
      difficulty: template.difficulty, templateId: template.templateId,
      status: { tag: 'Available' as const }, assignedAt: ctx.timestamp,
      completedAt: undefined, refreshAt: undefined,
    };
    const slotError = validateSlot(slot, template, ctx.timestamp);
    if (slotError) throw new SenderError(slotError);
    return slot;
  });
  // Selection and all six inserts share the reducer transaction. Failure leaves no partial board.
  for (const slot of assignments) ctx.db.playerQuestSlots.insert(slot);
});

export const completeQuest = spacetimedb.reducer(
  { slotIndex: t.u8(), expectedAssignedAt: t.timestamp() },
  completeQuestHandler
);

export const refreshQuestSlots = spacetimedb.reducer(refreshQuestSlotsHandler);

const PlaceInput = t.object('PlaceInput', {
  id: t.string(),
  name: t.string(),
  kind: t.string(),
  latitude: t.f64(),
  longitude: t.f64(),
});

// The browser loads named places near the player from OpenStreetMap and sends them here.
// A move of under 10 km keeps the board; a new area generates private local quests and reloads it.
export const setQuestArea = spacetimedb.reducer(
  { latitude: t.f64(), longitude: t.f64(), places: t.array(PlaceInput) },
  (ctx, { latitude, longitude, places }) => {
    applyQuestArea(ctx, latitude, longitude, places);
  }
);

const PhotoVerdict = t.object('PhotoVerdict', {
  accepted: t.bool(),
  message: t.string(),
  observation: t.string(),
  // For a Bestiary bounty, the creature the judge identified.
  creature: t.string(),
});

// Photo proof: an AI judge checks the photo against the quest, then completion runs exactly once.
export const submitQuestPhoto = spacetimedb.procedure(
  // capturePhoto: a smaller copy kept in the player's Bestiary when a bounty is accepted.
  { slotIndex: t.u8(), expectedAssignedAt: t.timestamp(), image: t.string(), capturePhoto: t.option(t.string()) },
  PhotoVerdict,
  (ctx, { slotIndex, expectedAssignedAt, image, capturePhoto }) => {
    const imageError = validateImageDataUrl(image);
    if (imageError) return { accepted: false, message: imageError, observation: '', creature: '' };
    const captureError = capturePhoto === undefined ? null : validateCapturePhoto(capturePhoto);
    if (captureError) return { accepted: false, message: captureError, observation: '', creature: '' };
    const args = { slotIndex, expectedAssignedAt };
    // Expected refusals (sign-in, ownership, rate limit, changed assignment) roll back their
    // transaction and come back as an ordinary verdict instead of a procedure failure.
    const refusal = (error: unknown) => ({
      accepted: false,
      message: error instanceof Error ? error.message : 'Your photo could not be checked. Please try again.',
      observation: '',
      creature: '',
    });
    let quest: ReturnType<typeof beginPhotoCheck>;
    try {
      quest = ctx.withTx(tx => beginPhotoCheck(tx, args));
    } catch (error) {
      return refusal(error);
    }
    const apiKey = ctx.env.AI_API_KEY;
    let verdict: JudgeVerdict;
    if (!apiKey) {
      verdict = { accepted: true, observation: 'Photo received. The AI check is not configured on this server.', reason: '', creature: '' };
    } else {
      // With the default provider, a busy or slow model falls back to a lighter one.
      const models = ctx.env.AI_MODEL ? [ctx.env.AI_MODEL] : [DEFAULT_AI_MODEL, FALLBACK_AI_MODEL];
      const baseUrl = (ctx.env.AI_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, '');
      let judged: JudgeVerdict | undefined;
      for (const model of models) {
        try {
          const response = ctx.http.fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(buildJudgeRequest(quest, image, model)),
            timeout: TimeDuration.fromMillis(AI_REQUEST_TIMEOUT_MS),
          });
          if (response.status >= 200 && response.status < 300) {
            judged = parseJudgeResponse(response.text());
            break;
          }
          console.warn(`AI judge (${model}) returned HTTP ${response.status}: ${response.text().slice(0, 300)}`);
          // Client errors such as a bad key or model will not improve with another model.
          if (response.status !== 429 && response.status < 500) break;
        } catch (error) {
          console.warn(`AI judge (${model}) request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!judged) return { accepted: false, message: 'The guild judge is unavailable right now. Please try again in a minute.', observation: '', creature: '' };
      verdict = judged;
    }
    if (!verdict.accepted) return { accepted: false, message: verdict.reason, observation: verdict.observation, creature: verdict.creature };
    const accepted = verdict;
    try {
      const capture = capturePhoto === undefined ? undefined : { photo: capturePhoto, creature: accepted.creature, verified: Boolean(apiKey) };
      ctx.withTx(tx => finishPhotoCompletion(tx, args, accepted.observation, capture));
    } catch (error) {
      return refusal(error);
    }
    const message = quest.category.tag === 'Bestiary' ? `Bounty claimed! +${quest.xpReward} XP` : `Quest complete! +${quest.xpReward} XP`;
    return { accepted: true, message, observation: verdict.observation, creature: verdict.creature || (quest.category.tag === 'Bestiary' ? quest.bountyTarget ?? '' : '') };
  }
);

export const setUsername = spacetimedb.reducer(
  { username: t.string() },
  (ctx, { username: requestedUsername }) => {
    const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
    if (error) throw new SenderError(error);
    const username = normalizeUsername(requestedUsername);
    if (!username) throw new SenderError(USERNAME_ERROR);
    const row = ctx.db.player.identity.find(ctx.sender);
    if (!row) throw new SenderError('Your profile is still loading. Please retry.');

    const usernameKey = username.toLowerCase();
    // Reducers are transactional, so simultaneous claims cannot take the same name.
    for (const existing of ctx.db.player.usernameKey.filter(usernameKey)) {
      if (!existing.identity.equals(ctx.sender)) {
        throw new SenderError('That username is already taken. Try another name.');
      }
    }
    ctx.db.player.identity.update({ ...row, username, usernameKey });
  }
);

// Guilds: found or join a guild with other players. One guild per player.
export const createGuild = spacetimedb.reducer(
  { name: t.string(), motto: t.string(), crest: t.string(), isOpen: t.bool() },
  createGuildHandler
);
export const joinOpenGuild = spacetimedb.reducer({ guildId: t.u64() }, joinOpenGuildHandler);
export const joinGuildByCode = spacetimedb.reducer({ joinCode: t.string() }, joinGuildByCodeHandler);
export const leaveGuild = spacetimedb.reducer(leaveGuildHandler);
export const setGuildOpen = spacetimedb.reducer({ isOpen: t.bool() }, setGuildOpenHandler);

const GuildListing = t.row('GuildListing', {
  guildId: t.u64().primaryKey(),
  name: t.string(),
  motto: t.string(),
  crest: t.string(),
  isOpen: t.bool(),
  memberCount: t.u32(),
  totalXp: t.u64(),
  foundedAt: t.timestamp(),
});

// Public directory: counts and XP only, never members or invite codes.
export const guildDirectory = spacetimedb.anonymousView(
  { name: 'guild_directory', public: true },
  t.array(GuildListing),
  ctx => [...ctx.db.guild.iter()].map(row => ({
    guildId: row.guildId, name: row.name, motto: row.motto, crest: row.crest,
    isOpen: row.isOpen, foundedAt: row.foundedAt, ...guildStats(ctx, row.guildId),
  }))
);

const PlayerGuild = t.row('PlayerGuild', {
  guildId: t.u64().primaryKey(),
  name: t.string(),
  motto: t.string(),
  crest: t.string(),
  isOpen: t.bool(),
  joinCode: t.string(),
  role: t.string(),
  memberCount: t.u32(),
  totalXp: t.u64(),
  foundedAt: t.timestamp(),
});

export const myGuild = spacetimedb.view(
  { name: 'my_guild', public: true },
  t.option(PlayerGuild),
  ctx => {
    const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
    const row = membership && ctx.db.guild.guildId.find(membership.guildId);
    if (!membership || !row) return undefined;
    return {
      guildId: row.guildId, name: row.name, motto: row.motto, crest: row.crest, isOpen: row.isOpen, foundedAt: row.foundedAt,
      joinCode: ctx.db.guildInvite.guildId.find(row.guildId)?.joinCode ?? '',
      role: membership.role.tag, ...guildStats(ctx, row.guildId),
    };
  }
);

const GuildMember = t.row('GuildMember', {
  memberId: t.string().primaryKey(),
  name: t.string(),
  xp: t.u32(),
  level: t.u32(),
  role: t.string(),
  joinedAt: t.timestamp(),
  isYou: t.bool(),
});

// Members of the caller's own guild only.
export const myGuildMembers = spacetimedb.view(
  { name: 'my_guild_members', public: true },
  t.array(GuildMember),
  ctx => {
    const membership = ctx.db.guildMembership.playerIdentity.find(ctx.sender);
    return membership ? memberRows(ctx, ctx.sender, membership.guildId) : [];
  }
);

export const init = spacetimedb.init(ctx => {
  seedQuestTemplates(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  // Existing databases do not rerun init on publish. Only fixed, missing samples are inserted.
  seedQuestTemplates(ctx);
});
