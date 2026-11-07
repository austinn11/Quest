export const USERNAME_ERROR = 'Use 3 to 24 letters, numbers, or underscores for your username.';

export function normalizeUsername(value: string): string | null {
  const username = value.trim();
  return /^[A-Za-z0-9_]{3,24}$/.test(username) ? username : null;
}

// XP is cumulative. Derive the level so it can never drift from the saved total.
export function levelForXp(totalXp: number): number {
  return 1 + Math.floor(totalXp / 100);
}
