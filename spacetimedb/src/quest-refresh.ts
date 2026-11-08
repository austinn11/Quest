import { SenderError } from 'spacetimedb/server';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { validateSlot, validateTemplate } from './quest-model';
import { mostRecentCompletionTemplate, resolveQuest, selectQuestTemplate } from './quest-selection';

export function refreshQuestSlots(ctx: Ctx): void {
  const authError = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (authError) throw new SenderError(authError);
  if (!ctx.db.player.identity.find(ctx.sender)) throw new SenderError('Create your player profile before refreshing your Questboard.');

  const board = [...ctx.db.playerQuestSlots.playerIdentity.filter(ctx.sender)].sort((a, b) => a.slotIndex - b.slotIndex);
  const recent = mostRecentCompletionTemplate(ctx);
  for (let index = 0; index < board.length; index++) {
    const slot = board[index];
    if (slot.status.tag !== 'Cooldown') continue;
    if (!slot.playerIdentity.equals(ctx.sender)) throw new SenderError('This quest slot does not belong to you.');
    const original = resolveQuest(ctx, ctx.sender, slot.templateId);
    if (!original) throw new SenderError('The completed quest template is unavailable.');
    const slotError = validateSlot(slot, original, ctx.timestamp);
    if (slotError) throw new SenderError(slotError);
    if (slot.refreshAt!.microsSinceUnixEpoch > ctx.timestamp.microsSinceUnixEpoch) continue;

    // Other cooldown slots still occupy their templates until actually replaced.
    const excluded = new Set(board.filter((_, otherIndex) => otherIndex !== index).map(other => other.templateId));
    const avoid = new Set([slot.templateId, ...(recent ? [recent] : [])]);
    const template = selectQuestTemplate(ctx, slot.difficulty, excluded, avoid);
    // An exhausted catalogue leaves this slot intact. A later refresh check can retry it.
    if (!template) continue;
    const templateError = validateTemplate(template);
    if (templateError) throw new SenderError(templateError);
    const replacement = {
      ...slot, templateId: template.templateId, status: { tag: 'Available' as const },
      assignedAt: ctx.timestamp, completedAt: undefined, refreshAt: undefined,
    };
    const replacementError = validateSlot(replacement, template, ctx.timestamp);
    if (replacementError) throw new SenderError(replacementError);
    ctx.db.playerQuestSlots.slotId.update(replacement);
    board[index] = replacement;
  }
}
