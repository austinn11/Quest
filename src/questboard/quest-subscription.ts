import { tables, type DbConnection, type EventContext, type SubscriptionHandle } from '../module_bindings';
import type { PlayerQuestArea, PlayerQuestSlots, QuestCompletions, QuestTemplates } from '../module_bindings/types';

export type QuestSnapshot = {
  slots: readonly PlayerQuestSlots[];
  // The public catalogue plus this player's private local quests, in one lookup list.
  templates: readonly QuestTemplates[];
  completions: readonly QuestCompletions[];
  area: PlayerQuestArea | null;
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
  const snapshot = (): QuestSnapshot => ({
    slots: [...connection.db.myQuestSlots.iter()],
    templates: [...connection.db.questTemplates.iter(), ...connection.db.myLocalQuests.iter()],
    completions: [...connection.db.myQuestCompletions.iter()],
    area: connection.db.myQuestArea.iter().next().value ?? null,
  });
  const changed = (ctx: EventContext) => {
    if (stopped || !applied || ctx.event.id === lastEvent) return;
    lastEvent = ctx.event.id;
    callbacks.onChange(snapshot());
  };
  const watched = [connection.db.myQuestSlots, connection.db.questTemplates, connection.db.myQuestCompletions, connection.db.myLocalQuests, connection.db.myQuestArea];
  for (const table of watched) {
    table.onInsert(changed);
    table.onUpdate(changed);
    table.onDelete(changed);
  }
  try {
    handle = connection.subscriptionBuilder()
      .onApplied(() => {
        if (stopped) return;
        applied = true;
        lastEvent = undefined;
        callbacks.onApplied(snapshot(), connection.connectionId.toHexString());
      })
      .onError(ctx => {
        if (stopped) return;
        applied = false;
        callbacks.onError(ctx.event?.message ?? 'Your quest data could not be loaded.');
      })
      .subscribe([tables.myQuestSlots, tables.questTemplates, tables.myQuestCompletions, tables.myLocalQuests, tables.myQuestArea]);
  } catch (error) {
    callbacks.onError(error instanceof Error ? error.message : 'Your quest data could not be loaded.');
  }
  return () => {
    stopped = true;
    for (const table of watched) {
      table.removeOnInsert(changed);
      table.removeOnUpdate(changed);
      table.removeOnDelete(changed);
    }
    if (handle && !handle.isEnded) handle.unsubscribe();
  };
}
