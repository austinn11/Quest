// Browser-only boundary stub: the real hook runs, but no live database is contacted.
const setArea = async (args: unknown) => {
  (window as unknown as { qa: { calls: unknown[] } }).qa.calls.push(args);
};
export const useReducer = () => setArea;
