import { tables, type DbConnection, type EventContext, type SubscriptionHandle } from '../module_bindings';
import type { CreatureCaptures, PlayerQuestArea, PlayerQuestSlots, QuestCompletions, QuestTemplates } from '../module_bindings/types';

export type QuestSnapshot = {
  slots: readonly PlayerQuestSlots[];
  // The public catalogue plus this player's private local quests, in one lookup list.
  templates: readonly QuestTemplates[];
  completions: readonly QuestCompletions[];
  area: PlayerQuestArea | null;
  // Bestiary bounties the player has captured, with their photos.
  captures: readonly CreatureCaptures[];
};

// One subscription owns the quest cache. The SDK replays this handle after reconnects.
export function subscribeToQuestData(connection: DbConnection, callbacks: {
  onApplied: (snapshot: QuestSnapshot, connectionId: string) => void;
  onChange: (snapshot: QuestSnapshot) => void;
  onError: (message: string) => void;
}) {
  let stopped = false;
  let applied = false;
  let lastEvent: string | undefined;
  let handle: SubscriptionHandle | undefined;
  // A decoding failure can prevent the SDK's onApplied/onError callbacks altogether.
  // Surface a recoverable failure instead of leaving the initial screen loading forever.
  const loadingTimeout = setTimeout(() => {
    if (!stopped && !applied) callbacks.onError('Quest data did not finish syncing. Retry, and check that this app version matches the deployed database if the problem continues.');
  }, 20_000);
  const snapshot = (): QuestSnapshot => ({
    slots: [...connection.db.myQuestSlots.iter()],
    templates: [...connection.db.questTemplates.iter(), ...connection.db.myLocalQuests.iter()],
    completions: [...connection.db.myQuestCompletions.iter()],
    area: connection.db.myQuestArea.iter().next().value ?? null,
    captures: [...connection.db.myCreatureCaptures.iter()],
  });
  const changed = (ctx: EventContext) => {
    if (stopped || !applied || ctx.event.id === lastEvent) return;
    lastEvent = ctx.event.id;
    callbacks.onChange(snapshot());
  };
  const watched = [connection.db.myQuestSlots, connection.db.questTemplates, connection.db.myQuestCompletions, connection.db.myLocalQuests, connection.db.myQuestArea, connection.db.myCreatureCaptures];
  for (const table of watched) {
    table.onInsert(changed);
    table.onUpdate(changed);
    table.onDelete(changed);
  }
  try {
    handle = connection.subscriptionBuilder()
      .onApplied(() => {
        if (stopped) return;
        clearTimeout(loadingTimeout);
        applied = true;
        lastEvent = undefined;
        callbacks.onApplied(snapshot(), connection.connectionId.toHexString());
      })
      .onError(ctx => {
        if (stopped) return;
        clearTimeout(loadingTimeout);
        applied = false;
        const message = ctx.event?.message ?? 'Your quest data could not be loaded.';
        callbacks.onError(/no such table/i.test(message)
          ? `This app requires a database update. The running backend does not match this branch. ${message}`
          : message);
      })
      .subscribe([tables.myQuestSlots, tables.questTemplates, tables.myQuestCompletions, tables.myLocalQuests, tables.myQuestArea, tables.myCreatureCaptures]);
  } catch (error) {
    clearTimeout(loadingTimeout);
    callbacks.onError(error instanceof Error ? error.message : 'Your quest data could not be loaded.');
  }
  return () => {
    stopped = true;
    clearTimeout(loadingTimeout);
    for (const table of watched) {
      table.removeOnInsert(changed);
      table.removeOnUpdate(changed);
      table.removeOnDelete(changed);
    }
    if (handle && !handle.isEnded) handle.unsubscribe();
  };
}
