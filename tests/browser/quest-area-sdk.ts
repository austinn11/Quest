// Browser boundary: use the real hook and selector without contacting Maincloud.
const connection = { procedures: {
  searchAdventureRegions: (args: unknown) => (window as any).qa.search(args),
  setAdventureRegion: (args: unknown) => (window as any).qa.save(args),
} };
export const useSpacetimeDB = () => ({ getConnection: () => connection });
