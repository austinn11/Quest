import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings';
import type { GuildListing, GuildMember, GuildQuestCard, PlayerGuild } from '../module_bindings/types';

export const GUILD_CRESTS = ['moss', 'river', 'ember', 'dusk', 'gold', 'slate'] as const;

export type GuildState = {
  guild: PlayerGuild | null;
  members: readonly GuildMember[];
  directory: readonly GuildListing[];
  quests: readonly GuildQuestCard[];
  ready: boolean;
  createGuild: (args: { name: string; motto: string; crest: string; isOpen: boolean }) => Promise<void>;
  joinOpenGuild: (guildId: bigint) => Promise<void>;
  joinGuildByCode: (joinCode: string) => Promise<void>;
  leaveGuild: () => Promise<void>;
  setGuildOpen: (isOpen: boolean) => Promise<void>;
  refreshGuildQuests: () => Promise<void>;
};

export const GuildContext = createContext<GuildState | null>(null);

// Wait for all four views, including the shared quests, before enabling guild actions.
export function GuildProvider({ children }: { children: ReactNode }) {
  const [mine, mineReady] = useTable(tables.myGuild);
  const [members, membersReady] = useTable(tables.myGuildMembers);
  const [directory, directoryReady] = useTable(tables.guildDirectory);
  const [quests, questsReady] = useTable(tables.myGuildQuests);
  const create = useReducer(reducers.createGuild);
  const joinOpen = useReducer(reducers.joinOpenGuild);
  const joinByCode = useReducer(reducers.joinGuildByCode);
  const leave = useReducer(reducers.leaveGuild);
  const setOpen = useReducer(reducers.setGuildOpen);
  const refreshQuests = useReducer(reducers.refreshGuildQuests);

  const value = useMemo<GuildState>(() => ({
    guild: mine[0] ?? null,
    members,
    directory,
    quests,
    ready: mineReady && membersReady && directoryReady && questsReady,
    createGuild: args => create(args),
    joinOpenGuild: guildId => joinOpen({ guildId }),
    joinGuildByCode: joinCode => joinByCode({ joinCode }),
    leaveGuild: () => leave(),
    setGuildOpen: isOpen => setOpen({ isOpen }),
    refreshGuildQuests: () => refreshQuests(),
  }), [mine, members, directory, quests, mineReady, membersReady, directoryReady, questsReady, create, joinOpen, joinByCode, leave, setOpen, refreshQuests]);

  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild() {
  const guild = useContext(GuildContext);
  if (!guild) throw new Error('useGuild must be used inside GuildProvider.');
  return guild;
}

export function GuildCrest({ name, crest, size = 'md' }: { name: string; crest: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(/\s+/).filter(word => !/^(the|of|and)$/i.test(word)).map(word => word[0]).join('').slice(0, 2).toUpperCase() || name.slice(0, 1).toUpperCase();
  return <span className={`guild-crest crest-${crest} crest-${size}`} aria-hidden="true">{initials}</span>;
}
