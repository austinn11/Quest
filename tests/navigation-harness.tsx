import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { AuthProvider } from 'react-oidc-context';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { Identity, Timestamp } from 'spacetimedb';
import { AppRoutes } from '../src/App';
import { DbConnection } from '../src/module_bindings';
import { PlayerContext } from '../src/player/PlayerProvider';
import { QuestboardContext, type QuestboardState } from '../src/questboard/QuestboardProvider';
import { getTotalPlayerXp, levelForXp, type SkillXp } from '../shared/progression';
import { GuildContext, type GuildState } from '../src/guild/GuildProvider';
import { SocialContext, type SocialState } from '../src/social/SocialProvider';
import { FavoritesContext, type FavoritesState } from '../src/collection/FavoritesProvider';

export function renderPage(path: string, board: Partial<QuestboardState> = {}, xp = 150, skills: SkillXp = { explorationXp: xp, bestiaryXp: 0, craftingXp: 0 }, guildState: Partial<GuildState> = {}, socialState: Partial<SocialState> = {}, favoritesState: Partial<FavoritesState> = {}) {
  const favorites: FavoritesState = { captures: new Set(), completions: new Set(), toggle: async () => {}, error: null, ...favoritesState };
  const social: SocialState = {
    friends: [], requests: [], invites: [], party: null, partyMembers: [], ready: true,
    sendFriendRequest: async () => {}, respondFriendRequest: async () => {}, removeFriend: async () => {}, createParty: async () => {},
    inviteToParty: async () => {}, respondPartyInvite: async () => {}, leaveParty: async () => {}, setPartyQuest: async () => {},
    submitPartyQuestPhoto: async () => ({ accepted: false, message: '', observation: '', creature: '' }),
    ...socialState,
  };
  xp = getTotalPlayerXp(skills);
  const guild: GuildState = {
    guild: null, members: [], directory: [], quests: [], ready: true, refreshGuildQuests: async () => {},
    createGuild: async () => {}, joinOpenGuild: async () => {}, joinGuildByCode: async () => {}, leaveGuild: async () => {}, setGuildOpen: async () => {},
    ...guildState,
  };
  const questState: QuestboardState = {
    slots: [], templates: [], completions: [], area: null, captures: [], connected: true, ready: false,
    location: { status: { kind: 'off' }, enable: () => {}, disable: () => {}, retry: () => {} },
    hasSnapshot: board.ready ?? false, initializing: false, error: null,
    subscriptionError: null, retry: () => {},
    now: 0, refreshing: false, refreshError: null, refreshSlots: async () => {}, ...board,
  };
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <AuthProvider authority="https://auth.spacetimedb.com/oidc" client_id="test" redirect_uri="http://localhost:5173/callback" automaticSilentRenew={false}>
        <SpacetimeDBProvider connectionBuilder={DbConnection.builder().withUri('http://localhost:3000').withDatabaseName('test')}>
          <PlayerContext.Provider value={{
            player: { identity: Identity.zero(), displayName: 'Test Adventurer', username: 'TestHero', xp, level: levelForXp(xp), createdAt: Timestamp.UNIX_EPOCH, ...skills, progressionReady: true, avatar: '' },
            ready: true,
            error: null,
            retry: () => {},
          }}>
            <QuestboardContext.Provider value={questState}><GuildContext.Provider value={guild}><SocialContext.Provider value={social}><FavoritesContext.Provider value={favorites}><AppRoutes /></FavoritesContext.Provider></SocialContext.Provider></GuildContext.Provider></QuestboardContext.Provider>
          </PlayerContext.Provider>
        </SpacetimeDBProvider>
      </AuthProvider>
    </StaticRouter>
  );
}
