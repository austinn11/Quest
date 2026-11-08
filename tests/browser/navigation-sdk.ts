import { Identity } from 'spacetimedb';
const invoke = async () => {};
export const useReducer = () => invoke;
export const useProcedure = () => invoke;
export const useTable = () => [[], true];
export const useSpacetimeDB = () => ({ isActive: true, identity: Identity.zero(), connectionError: undefined });
