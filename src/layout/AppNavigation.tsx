import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { isNavigationRouteActive, navigation } from './navigation';

type Group = 'quests' | 'social';

// Site-navigation disclosures: ordinary links keep native Tab and screen-reader behavior.
export function AppNavigation() {
  const { pathname, key } = useLocation();
  const [open, setOpen] = useState<Group | null>(null);
  const nav = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<Group, HTMLButtonElement | null>>>({});
  const keyboardFocus = useRef<'first' | 'last' | null>(null);

  function focusOption(group: Group, position: 'first' | 'last') {
    const links = nav.current?.querySelectorAll<HTMLAnchorElement>(`#nav-${group}-options a`);
    if (links?.length) links[position === 'first' ? 0 : links.length - 1].focus();
  }

  useEffect(() => { setOpen(null); }, [key]);

  useEffect(() => {
    if (open && keyboardFocus.current) focusOption(open, keyboardFocus.current);
    keyboardFocus.current = null;
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const group = triggers.current[open]?.closest('.app-nav-group');
      if (event.target instanceof Node && !group?.contains(event.target)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(null);
      triggers.current[open]?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <nav ref={nav} className="app-nav" aria-label="Main navigation">
      <ul className="app-nav-list">
        {navigation.map(item => (
          <li key={'id' in item ? item.id : item.to} className={'children' in item ? 'app-nav-group' : undefined}
            onBlur={event => {
              if ('children' in item && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
                setOpen(current => current === item.id ? null : current);
              }
            }}>
            {'children' in item ? (
              <>
                <button ref={button => { triggers.current[item.id] = button; }} type="button"
                  className={`app-nav-trigger${item.children.some(link => isNavigationRouteActive(pathname, link.to)) ? ' active' : ''}`}
                  aria-expanded={open === item.id} aria-controls={`nav-${item.id}-options`}
                  onClick={() => setOpen(current => current === item.id ? null : item.id)}
                  onKeyDown={event => {
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                    event.preventDefault();
                    const position = event.key === 'ArrowDown' ? 'first' : 'last';
                    if (open === item.id) focusOption(item.id, position);
                    else { keyboardFocus.current = position; setOpen(item.id); }
                  }}>
                  {item.label}
                  <svg className="app-nav-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                </button>
                <ul id={`nav-${item.id}-options`} className="nav-dropdown" hidden={open !== item.id}>
                  {item.children.map(link => <li key={link.to}><NavLink to={link.to} onClick={() => setOpen(null)}>{link.label}</NavLink></li>)}
                </ul>
              </>
            ) : <NavLink className="app-nav-link" to={item.to} end={item.to === '/'} onClick={() => setOpen(null)}>{item.label}</NavLink>}
          </li>
        ))}
      </ul>
    </nav>
  );
}
