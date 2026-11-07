import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useSpacetimeDB } from 'spacetimedb/react';
import { SignOutButton } from '../auth/SignOutButton';
import { usePlayer } from '../player/PlayerProvider';

const navigation = [
  { to: '/', label: 'Home' },
  { to: '/map', label: 'World Map' },
  { to: '/questboard', label: 'Questboard' },
  { to: '/journal', label: 'Quest Journal' },
  { to: '/profile', label: 'Profile' },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const { isActive, identity, connectionError } = useSpacetimeDB();
  const { error, retry } = usePlayer();
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = navigation.find(item => item.to === pathname)?.label ?? 'Page not found';
    document.title = `${page} | Quest`;
    main.current?.focus();
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <Link className="app-brand" to="/">Quest</Link>
        <nav className="app-nav" aria-label="Main navigation">
          {navigation.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/'}>{item.label}</NavLink>)}
        </nav>
        <SignOutButton />
      </header>
      <main ref={main} id="main-content" className="app-content" tabIndex={-1}>
        {!isActive && (
          <div className="panel" role={connectionError ? 'alert' : 'status'}>
            <p>{connectionError ? 'Unable to reach the database. Retrying automatically.' : identity ? 'Reconnecting to the database...' : 'Connecting to the database...'}</p>
            {connectionError && <button className="secondary" type="button" onClick={() => window.location.reload()}>Retry connection</button>}
          </div>
        )}
        {error && (
          <div className="panel error" role="alert">
            <p>Your profile could not be loaded. {error}</p>
            <button className="secondary" type="button" onClick={retry}>Retry profile</button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
