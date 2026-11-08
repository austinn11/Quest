import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings';

export type FavoriteKind = 'capture' | 'completion';
export type FavoritesState = {
  captures: ReadonlySet<string>;
  completions: ReadonlySet<string>;
  toggle: (kind: FavoriteKind, itemId: bigint) => Promise<void>;
  error: string | null;
};

export const FavoritesContext = createContext<FavoritesState | null>(null);

// Stars are stored privately on the server, so they follow the player across devices.
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [rows] = useTable(tables.myFavorites);
  const toggleFavorite = useReducer(reducers.toggleFavorite);
  const [error, setError] = useState<string | null>(null);
  const value = useMemo<FavoritesState>(() => ({
    captures: new Set(rows.filter(row => row.kind === 'capture').map(row => row.itemId.toString())),
    completions: new Set(rows.filter(row => row.kind === 'completion').map(row => row.itemId.toString())),
    error,
    toggle: async (kind, itemId) => {
      setError(null);
      try { await toggleFavorite({ kind, itemId }); } catch (failure) { setError(failure instanceof Error ? failure.message : 'That favorite could not be saved.'); }
    },
  }), [rows, toggleFavorite, error]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const favorites = useContext(FavoritesContext);
  if (!favorites) throw new Error('useFavorites must be used inside FavoritesProvider.');
  return favorites;
}

export function FavoriteStar({ kind, itemId, name }: { kind: FavoriteKind; itemId: bigint; name: string }) {
  const favorites = useFavorites();
  const starred = (kind === 'capture' ? favorites.captures : favorites.completions).has(itemId.toString());
  return (
    <button type="button" className={`favorite-star${starred ? ' is-starred' : ''}`} aria-pressed={starred}
      aria-label={starred ? `Remove ${name} from favorites` : `Add ${name} to favorites`} title={starred ? 'Favorite' : 'Add to favorites'}
      onClick={() => { void favorites.toggle(kind, itemId); }}>
      {starred ? '★' : '☆'}
    </button>
  );
}
