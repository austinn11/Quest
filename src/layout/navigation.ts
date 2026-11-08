export const navigation = [
  { to: '/', label: 'Home' },
  { to: '/map', label: 'World Map' },
  { id: 'quests', label: 'Quests', children: [
    { to: '/questboard', label: 'Questboard' },
    { to: '/journal', label: 'Quest Log', title: 'Quest Journal' },
    { to: '/bestiary', label: 'Bestiary' },
  ] },
  { id: 'social', label: 'Social', children: [
    { to: '/friends', label: 'Friends' },
    { to: '/guild', label: 'Guilds', title: 'Guild' },
  ] },
  { to: '/profile', label: 'Profile' },
] as const;

export function isNavigationRouteActive(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`));
}

export function navigationPageTitle(pathname: string): string {
  for (const item of navigation) {
    if ('children' in item) {
      const child = item.children.find(link => link.to === pathname);
      if (child) return 'title' in child ? child.title : child.label;
    } else if (item.to === pathname) return item.label;
  }
  return 'Page not found';
}
