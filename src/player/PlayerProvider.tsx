import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings';
import type { PlayerProfile } from '../module_bindings/types';

type PlayerState = {
  player: PlayerProfile | undefined;
  ready: boolean;
  error: string | null;
  retry: () => void;
};

export const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { isActive } = useSpacetimeDB();
  const [players, profileReady] = useTable(tables.myPlayer);
  const ensurePlayer = useReducer(reducers.ensurePlayer);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setError(null);
    void ensurePlayer().catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load your player account.');
    });
    return () => { cancelled = true; };
  }, [isActive, ensurePlayer, attempt]);

  return (
    <PlayerContext.Provider value={{ player: players[0], ready: isActive && profileReady, error, retry: () => setAttempt(value => value + 1) }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('usePlayer must be used inside PlayerProvider.');
  return player;
}
