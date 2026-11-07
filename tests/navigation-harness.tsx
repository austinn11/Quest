import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { AuthProvider } from 'react-oidc-context';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { Identity, Timestamp } from 'spacetimedb';
import { AppRoutes } from '../src/App';
import { DbConnection } from '../src/module_bindings';
import { PlayerContext } from '../src/player/PlayerProvider';

export function renderPage(path: string) {
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
            <AppRoutes />
          </PlayerContext.Provider>
        </SpacetimeDBProvider>
      </AuthProvider>
    </StaticRouter>
  );
}
