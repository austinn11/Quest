import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { AuthProvider } from 'react-oidc-context';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { Identity, Timestamp } from 'spacetimedb';
import { AppRoutes } from '../src/App';
import { DbConnection } from '../src/module_bindings';
import { PlayerContext } from '../src/player/PlayerProvider';
import { QuestboardContext, type QuestboardState } from '../src/questboard/QuestboardProvider';

export function renderPage(path: string, board: Partial<QuestboardState> = {}) {
  const questState: QuestboardState = {
    slots: [], templates: [], completions: [], connected: true, ready: false,
    hasSnapshot: board.ready ?? false, initializing: false, error: null,
    subscriptionError: null, retry: () => {}, ...board,
  };
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <AuthProvider authority="https://auth.spacetimedb.com/oidc" client_id="test" redirect_uri="http://localhost:5173/callback" automaticSilentRenew={false}>
        <SpacetimeDBProvider connectionBuilder={DbConnection.builder().withUri('http://localhost:3000').withDatabaseName('test')}>
          <PlayerContext.Provider value={{
            player: { identity: Identity.zero(), displayName: 'Test Adventurer', username: 'TestHero', xp: 150, level: 2, createdAt: Timestamp.UNIX_EPOCH },
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
