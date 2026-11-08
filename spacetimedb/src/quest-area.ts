import type { Timestamp } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { distanceMeters, roundCoordinate, validLatitudeLongitude } from '../../shared/geo';
import { AREA_RELOAD_METERS, PLACE_SEARCH_METERS, sanitizePlaces, type PlaceInput } from '../../shared/nearby-places';
import { generateLocalQuests } from './local-quests';
import { applyCompletion, prepareCompletion } from './quest-completion';
import { AREA_COORDINATE_DECIMALS, PHOTO_MAX_ATTEMPTS_PER_HOUR, PHOTO_MIN_SECONDS_BETWEEN_ATTEMPTS } from './quest-config';
import { validateSlot, validateTemplate, type QuestTemplate } from './quest-model';
import { mostRecentCompletionTemplate, selectQuestTemplate } from './quest-selection';

function requirePlayer(ctx: Ctx) {
  const authError = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (authError) throw new SenderError(authError);
  if (!ctx.db.player.identity.find(ctx.sender)) throw new SenderError('Create your player profile before sharing your location.');
}

export type AreaCheck = { needsPlaces: boolean; hadArea: boolean; distanceMoved: number };

// Decide whether the player moved far enough to need new nearby quests.
export function checkQuestArea(ctx: Ctx, latitude: number, longitude: number): AreaCheck {
  requirePlayer(ctx);
  if (!validLatitudeLongitude(latitude, longitude)) throw new SenderError('Your location could not be read. Please try again.');
  const area = ctx.db.playerQuestArea.playerIdentity.find(ctx.sender);
  if (!area) return { needsPlaces: true, hadArea: false, distanceMoved: 0 };
  const distanceMoved = distanceMeters(area.latitude, area.longitude, latitude, longitude);
  return { needsPlaces: distanceMoved > AREA_RELOAD_METERS, hadArea: true, distanceMoved };
}

function newLocalQuestId(ctx: Ctx): string {
  for (;;) {
    const id = `local-${ctx.random.integerInRange(0, 0xffffff).toString(16).padStart(6, '0')}${ctx.random.integerInRange(0, 0xffffff).toString(16).padStart(6, '0')}`;
    if (!ctx.db.localQuests.templateId.find(id) && !ctx.db.questTemplates.templateId.find(id)) return id;
  }
}

export type AreaResult = { reloaded: boolean; localQuestCount: number; replacedSlots: number };

// The browser loads places from OpenStreetMap and sends them here. They are untrusted: each one is
// re-validated and its distance recomputed. Only the sender's own private quests are affected,
// and rewards stay fixed by difficulty. Then the area is saved and every Available slot reloads.
export function applyQuestArea(ctx: Ctx, latitude: number, longitude: number, placeInput: readonly PlaceInput[]): AreaResult {
  const check = checkQuestArea(ctx, latitude, longitude);
  // A small move keeps the current board; the client may also have raced another tab.
  if (!check.needsPlaces) return { reloaded: false, localQuestCount: 0, replacedSlots: 0 };
  const places = sanitizePlaces(placeInput, latitude, longitude, PLACE_SEARCH_METERS);

  for (const quest of ctx.db.localQuests.playerIdentity.filter(ctx.sender)) {
    if (quest.isActive) ctx.db.localQuests.templateId.update({ ...quest, isActive: false });
  }
  const drafts = generateLocalQuests(places, n => ctx.random.integerInRange(0, n - 1), () => newLocalQuestId(ctx));
  for (const draft of drafts) {
    const error = validateTemplate(draft);
    if (error) continue; // Skip a malformed place rather than failing the whole area.
    ctx.db.localQuests.insert({ ...draft, playerIdentity: ctx.sender, createdAt: ctx.timestamp });
  }
  const area = {
    playerIdentity: ctx.sender,
    latitude: roundCoordinate(latitude, AREA_COORDINATE_DECIMALS),
    longitude: roundCoordinate(longitude, AREA_COORDINATE_DECIMALS),
    updatedAt: ctx.timestamp,
    placeCount: places.length,
  };
  if (ctx.db.playerQuestArea.playerIdentity.find(ctx.sender)) ctx.db.playerQuestArea.playerIdentity.update(area);
  else ctx.db.playerQuestArea.insert(area);

  // Cooldown slots keep their completed quest and refill from the new pool when they expire.
  const board = [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)].sort((a, b) => a.slotIndex - b.slotIndex);
  const recent = mostRecentCompletionTemplate(ctx);
  let replacedSlots = 0;
  for (let index = 0; index < board.length; index++) {
    const slot = board[index];
    if (slot.status.tag !== 'Available') continue;
    const excluded = new Set(board.filter((_, other) => other !== index).map(other => other.templateId));
    const avoid = new Set([slot.templateId, ...(recent ? [recent] : [])]);
    const template = selectQuestTemplate(ctx, slot.difficulty, excluded, avoid);
    if (!template || template.templateId === slot.templateId) continue;
    const replacement = { ...slot, templateId: template.templateId, assignedAt: ctx.timestamp };
    if (validateSlot(replacement, template, ctx.timestamp)) continue;
    ctx.db.playerQuestSlots.slotId.update(replacement);
    board[index] = replacement;
    replacedSlots++;
  }
  return { reloaded: true, localQuestCount: drafts.length, replacedSlots };
}

// Photo step 1 (transaction): confirm the quest can be completed and count the attempt.
export function beginPhotoCheck(ctx: Ctx, args: { slotIndex: number; expectedAssignedAt: Timestamp }): QuestTemplate {
  const { template } = prepareCompletion(ctx, args);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const hour = 60n * 60n * 1_000_000n;
  const attempts = ctx.db.photoAttempts.playerIdentity.find(ctx.sender);
  if (attempts) {
    if (now - attempts.lastAttemptAt.microsSinceUnixEpoch < BigInt(PHOTO_MIN_SECONDS_BETWEEN_ATTEMPTS) * 1_000_000n) {
      throw new SenderError(`Please wait ${PHOTO_MIN_SECONDS_BETWEEN_ATTEMPTS} seconds between photos.`);
    }
    const sameWindow = now - attempts.windowStartedAt.microsSinceUnixEpoch < hour;
    if (sameWindow && attempts.attemptsInWindow >= PHOTO_MAX_ATTEMPTS_PER_HOUR) {
      throw new SenderError(`You have used all ${PHOTO_MAX_ATTEMPTS_PER_HOUR} photo checks for this hour. Try again later.`);
    }
    ctx.db.photoAttempts.playerIdentity.update({
      playerIdentity: ctx.sender,
      windowStartedAt: sameWindow ? attempts.windowStartedAt : ctx.timestamp,
      attemptsInWindow: sameWindow ? attempts.attemptsInWindow + 1 : 1,
      lastAttemptAt: ctx.timestamp,
    });
  } else {
    ctx.db.photoAttempts.insert({ playerIdentity: ctx.sender, windowStartedAt: ctx.timestamp, attemptsInWindow: 1, lastAttemptAt: ctx.timestamp });
  }
  return template;
}

// Photo step 3 (transaction): an accepted photo completes the quest exactly once.
export function finishPhotoCompletion(ctx: Ctx, args: { slotIndex: number; expectedAssignedAt: Timestamp }, proofNote: string): QuestTemplate {
  return applyCompletion(ctx, args, proofNote);
}

