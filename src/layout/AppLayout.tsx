import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useSpacetimeDB } from 'spacetimedb/react';
import { SignOutButton } from '../auth/SignOutButton';
import { usePlayer } from '../player/PlayerProvider';
import { LevelUpNotice } from '../player/LevelUpNotice';
import { AppNavigation } from './AppNavigation';
import { navigationPageTitle } from './navigation';

export function AppLayout() {
  const { pathname, hash } = useLocation();
  const { isActive, identity, connectionError } = useSpacetimeDB();
  const { error, retry } = usePlayer();
  const main = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = navigationPageTitle(pathname);
    document.title = `${page} | Quest`;
    // Questboard handles its card anchor after assignments render.
    if (pathname !== '/questboard' || !/^#quest-slot-[0-5]$/.test(hash)) main.current?.focus();
  }, [pathname, hash]);

  useEffect(() => {
    const menu = nav.current;
    const active = menu?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!menu || !active) return;
    // Keep the selected destination visible in the narrow, horizontally scrolling menu.
    const bounds = menu.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left) menu.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) menu.scrollLeft += item.right - bounds.right;
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="app-brand" to="/" aria-label="Quest home">
            <svg className="app-brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" />
              <circle cx="12" cy="12" r="1.5" />
            </svg>
            <span>Quest</span>
          </Link>
          <AppNavigation />
          <div className="app-header-account"><SignOutButton /></div>
        </div>
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
        <LevelUpNotice />
        <Outlet />
      </main>
    </div>
  );
}
