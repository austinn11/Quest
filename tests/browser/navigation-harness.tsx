import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from 'react-oidc-context';
import { AppLayout } from '../../src/layout/AppLayout';
import { PlayerContext } from '../../src/player/PlayerProvider';
import '../../src/styles.css';

const destinations = ['/', '/map', '/questboard', '/journal', '/bestiary', '/friends', '/guild', '/profile'];
history.replaceState({}, '', new URLSearchParams(location.search).get('route') || '/');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider authority="https://auth.spacetimedb.com/oidc" client_id="navigation-test" redirect_uri="http://localhost/callback" automaticSilentRenew={false}>
      <PlayerContext.Provider value={{ player: undefined, ready: false, error: null, retry() {} }}>
        <BrowserRouter><Routes><Route element={<AppLayout />}>
          {destinations.map(path => <Route key={path} path={path} element={<><h1>{path}</h1><button type="button">Outside navigation</button></>} />)}
        </Route></Routes></BrowserRouter>
      </PlayerContext.Provider>
    </AuthProvider>
  </StrictMode>,
);
