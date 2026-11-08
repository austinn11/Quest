import type { Timestamp } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';




import { applyCompletion, prepareCompletion } from './quest-completion';
import { PHOTO_MAX_ATTEMPTS_PER_HOUR, PHOTO_MIN_SECONDS_BETWEEN_ATTEMPTS } from './quest-config';
import { type QuestTemplate } from './quest-model';

import { validateCapturePhoto } from './photo-judge';

// Photo step 1 (transaction): confirm the quest can be completed and count the attempt.
export function beginPhotoCheck(ctx: Ctx, args: { slotIndex: number; expectedAssignedAt: Timestamp }): QuestTemplate {
  const { template } = prepareCompletion(ctx, args);
  countPhotoAttempt(ctx);
  return template;
}

// One shared limit for every photo check (quests and party quests) protects the AI credits.
export function countPhotoAttempt(ctx: Ctx) {
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
}

// Photo step 3 (transaction): an accepted photo completes the quest exactly once.
export type CaptureEvidence = { photo: string; creature: string; verified: boolean };

// A Bestiary bounty also files the capture, with its photo, in the player's private collection.
export function finishPhotoCompletion(ctx: Ctx, args: { slotIndex: number; expectedAssignedAt: Timestamp }, proofNote: string, capture?: CaptureEvidence): QuestTemplate {
  const { template, completion } = applyCompletion(ctx, args, proofNote);
  if (capture && template.category.tag === 'Bestiary') {
    const photoError = validateCapturePhoto(capture.photo);
    if (photoError) throw new SenderError(photoError);
    const bountyTarget = template.bountyTarget ?? template.title;
    ctx.db.creatureCaptures.insert({
      captureId: 0n,
      playerIdentity: ctx.sender,
      completionId: completion.completionId,
      templateId: template.templateId,
      bountyTarget,
      creature: capture.creature.trim().slice(0, 80) || bountyTarget,
      verified: capture.verified,
      photo: capture.photo,
      locationName: template.locationName,
      capturedAt: ctx.timestamp,
    });
  }
  return template;
}

