import { table, t } from 'spacetimedb/server';
// Immutable, owner-scoped versions preserve destinations through region changes.
export const locations = table({ name: 'locations' }, {
  locationId: t.u64().primaryKey().autoInc(), playerIdentity: t.identity().index('btree'),
  externalSource: t.string(), externalPlaceId: t.string(), name: t.string(),
  locationType: t.string(), latitude: t.f64(), longitude: t.f64(),
  region: t.string(), regionSelectedAt: t.timestamp(), lastVerifiedAt: t.timestamp(),
});
export const discoveryCache = table({ name: 'discovery_cache' }, {
  key: t.string().primaryKey(), payload: t.string(), verifiedAt: t.timestamp(),
});
export const discoveryLimit = table({ name: 'discovery_limit' }, {
  key: t.string().primaryKey(), requestedAt: t.timestamp(),
});
export const discoveryBudget = table({ name: 'discovery_budget' }, {
  provider: t.string().primaryKey(), day: t.u64(), requests: t.u32(),
});
