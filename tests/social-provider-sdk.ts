import { toSql } from 'spacetimedb';

let readiness: Record<string, boolean> = {};
export function setReadiness(next: Record<string, boolean>) { readiness = next; }
export function useTable(query: Parameters<typeof toSql>[0]) {
  const name = toSql(query).match(/FROM "([^"]+)"/)?.[1];
  if (!name) throw new Error('Expected an unfiltered view subscription');
  return [[], readiness[name] ?? true];
}
const invoke = async () => {};
export const useReducer = () => invoke;
export const useProcedure = () => invoke;
