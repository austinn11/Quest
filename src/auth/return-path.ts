// OIDC state may come from an old or modified browser session. Only restore local paths.
export function postLoginPath(state: unknown): string {
  const path = state && typeof state === 'object' && 'returnTo' in state ? state.returnTo : null;
  if (
    typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
    /[\\\u0000-\u0020]/.test(path) || /^\/callback(?:[/?#]|$)/.test(path)
  ) return '/';
  return path;
}
