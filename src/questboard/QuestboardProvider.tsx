import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { reducers, type DbConnection } from '../module_bindings';
import { usePlayer } from '../player/PlayerProvider';
import { subscribeToQuestData, type QuestSnapshot } from './quest-subscription';
import { useQuestRefresh } from './useQuestRefresh';
import { useQuestArea, type QuestAreaControls } from '../location/useQuestArea';

export type QuestboardState = QuestSnapshot & {
  connected: boolean;
  ready: boolean;
  hasSnapshot: boolean;
  initializing: boolean;
  error: string | null;
  subscriptionError: string | null;
  now: number;
  refreshing: boolean;
  refreshError: string | null;
  refreshSlots: () => Promise<void>;
  retry: () => void;
  location: QuestAreaControls;
  startAnywhere?: () => void;
};

export const QuestboardContext = createContext<QuestboardState | null>(null);

export function QuestboardProvider({ children }: { children: ReactNode }) {
  const { isActive, getConnection, connectionId } = useSpacetimeDB();
  const { player, ready: playerReady } = usePlayer();
  const connection = getConnection() as DbConnection | null;
  const [data, setData] = useState<QuestSnapshot & { appliedConnectionId: string | null; hasSnapshot: boolean; subscriptionError: string | null }>({
    slots: [], templates: [], completions: [], area: null, captures: [], appliedConnectionId: null, hasSnapshot: false, subscriptionError: null,
  });
  const [anywhere, setAnywhere] = useState(false);
  const initialize = useReducer(reducers.initializeQuestboard);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const identity = player?.identity.toHexString();

  useEffect(() => {
    setData(current => ({ ...current, appliedConnectionId: null, subscriptionError: null }));
    if (!connection) return;
    return subscribeToQuestData(connection, {
      onApplied: (snapshot, appliedConnectionId) => setData({ ...snapshot, appliedConnectionId, hasSnapshot: true, subscriptionError: null }),
      onChange: snapshot => setData(current => ({ ...current, ...snapshot })),
      onError: subscriptionError => setData(current => ({ ...current, appliedConnectionId: null, subscriptionError })),
    });
    // Reconnection replays the existing subscription; a manual retry replaces it.
  }, [connection, attempt]);

  useEffect(() => {
    if (!isActive || !playerReady || !identity) return;
    if (data.appliedConnectionId !== connectionId.toHexString()) return;
    if (!data.slots.length && !data.area && !anywhere) { setInitializing(false); return; }
    let cancelled = false;
    setError(null);
    setInitializing(true);
    // Profile subscription confirms ensurePlayer has committed before this call.
    void initialize().catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to prepare your Questboard.');
    }).finally(() => { if (!cancelled) setInitializing(false); });
    return () => { cancelled = true; };
  }, [isActive, playerReady, identity, initialize, attempt, data.appliedConnectionId, data.slots.length, data.area, anywhere, connectionId]);

  const ready = isActive && playerReady && data.appliedConnectionId === connectionId.toHexString();
  const refresh = useQuestRefresh({
    slots: data.slots,
    enabled: ready && !initializing && !error && !data.subscriptionError,
    connectionId: `${identity ?? ''}:${connectionId.toHexString()}`,
  });

  const location = useQuestArea({ area: data.area, enabled: ready && !error && !data.subscriptionError });

  return (
    <QuestboardContext.Provider value={{
      slots: data.slots, templates: data.templates, completions: data.completions, area: data.area, captures: data.captures, location, startAnywhere: () => setAnywhere(true),
      connected: isActive, ready,
      hasSnapshot: data.hasSnapshot, subscriptionError: data.subscriptionError, initializing,
      error, ...refresh, retry: () => setAttempt(value => value + 1),
    }}>
      {children}
    </QuestboardContext.Provider>
  );
}

export function useQuestboard() {
  const board = useContext(QuestboardContext);
  if (!board) throw new Error('useQuestboard must be used inside QuestboardProvider.');
  return board;
}
