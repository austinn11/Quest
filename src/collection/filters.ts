// Search, filter and sort for the Bestiary and Quest Journal. Pure functions so they are easy to test.

type Stamp = { microsSinceUnixEpoch: bigint };
const compareTime = (a: Stamp, b: Stamp) => a.microsSinceUnixEpoch < b.microsSinceUnixEpoch ? -1 : a.microsSinceUnixEpoch > b.microsSinceUnixEpoch ? 1 : 0;

// Every word of the query must appear somewhere in the item's text, ignoring case and accents.
export function matchesSearch(query: string, ...fields: (string | undefined)[]): boolean {
  const normalise = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalise(fields.filter(Boolean).join(' '));
  return words.every(word => haystack.includes(word));
}

export type CaptureItem = { captureId: bigint; creature: string; bountyTarget: string; locationName?: string; verified: boolean; capturedAt: Stamp };
export type BestiaryFilters = { search: string; check: 'all' | 'verified' | 'unchecked'; favoritesOnly: boolean; sort: 'newest' | 'oldest' | 'name' | 'reward' };
export const DEFAULT_BESTIARY_FILTERS: BestiaryFilters = { search: '', check: 'all', favoritesOnly: false, sort: 'newest' };

export function filterCaptures<T extends CaptureItem>(captures: readonly T[], filters: BestiaryFilters, favorites: ReadonlySet<string>, rewardOf: (capture: T) => number = () => 0): T[] {
  return captures
    .filter(capture => matchesSearch(filters.search, capture.creature, capture.bountyTarget, capture.locationName))
    .filter(capture => filters.check === 'all' || (filters.check === 'verified') === capture.verified)
    .filter(capture => !filters.favoritesOnly || favorites.has(capture.captureId.toString()))
    .sort((a, b) => {
      if (filters.sort === 'name') return a.creature.localeCompare(b.creature) || compareTime(b.capturedAt, a.capturedAt);
      if (filters.sort === 'reward') return rewardOf(b) - rewardOf(a) || compareTime(b.capturedAt, a.capturedAt);
      const byTime = compareTime(a.capturedAt, b.capturedAt);
      return filters.sort === 'oldest' ? byTime : -byTime;
    });
}

export type JournalItem = { completionId: bigint; xpAwarded: number; completedAt: Stamp; proofNote?: string };
export type JournalTemplate = { title: string; description: string; category: { tag: string }; difficulty: { tag: string }; locationName?: string };
export type JournalFilters = { search: string; category: 'all' | 'Exploration' | 'Bestiary' | 'Crafting'; difficulty: 'all' | 'Easy' | 'Medium' | 'Hard'; favoritesOnly: boolean; sort: 'newest' | 'oldest' | 'xp' };
export const DEFAULT_JOURNAL_FILTERS: JournalFilters = { search: '', category: 'all', difficulty: 'all', favoritesOnly: false, sort: 'newest' };

export function filterCompletions<T extends JournalItem>(completions: readonly T[], filters: JournalFilters, favorites: ReadonlySet<string>, templateOf: (completion: T) => JournalTemplate | undefined): T[] {
  return completions
    .filter(completion => {
      const template = templateOf(completion);
      return matchesSearch(filters.search, template?.title, template?.description, template?.locationName, completion.proofNote);
    })
    .filter(completion => filters.category === 'all' || templateOf(completion)?.category.tag === filters.category)
    .filter(completion => filters.difficulty === 'all' || templateOf(completion)?.difficulty.tag === filters.difficulty)
    .filter(completion => !filters.favoritesOnly || favorites.has(completion.completionId.toString()))
    .sort((a, b) => {
      if (filters.sort === 'xp') return b.xpAwarded - a.xpAwarded || compareTime(b.completedAt, a.completedAt);
      const byTime = compareTime(a.completedAt, b.completedAt) || (a.completionId < b.completionId ? -1 : a.completionId > b.completionId ? 1 : 0);
      return filters.sort === 'oldest' ? byTime : -byTime;
    });
}
