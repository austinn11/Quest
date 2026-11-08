export const USERNAME_ERROR = 'Use 3 to 24 letters, numbers, or underscores for your username.';

export function normalizeUsername(value: string): string | null {
  const username = value.trim();
  return /^[A-Za-z0-9_]{3,24}$/.test(username) ? username : null;
}

export { levelForXp } from '../../shared/progression';
