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

export function renderPage(path: string, board: Partial<QuestboardState> = {}, xp = 150, skills: SkillXp = { explorationXp: xp, bestiaryXp: 0, craftingXp: 0 }) {
  xp = getTotalPlayerXp(skills);
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
            player: { identity: Identity.zero(), displayName: 'Test Adventurer', username: 'TestHero', xp, level: levelForXp(xp), createdAt: Timestamp.UNIX_EPOCH, ...skills, progressionReady: true },
            ready: true,
            error: null,
            retry: () => {},
          }}>
            <QuestboardContext.Provider value={questState}><AppRoutes /></QuestboardContext.Provider>
          </PlayerContext.Provider>
        </SpacetimeDBProvider>
      </AuthProvider>
    </StaticRouter>
  );
}
