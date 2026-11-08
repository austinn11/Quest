import { TimeDuration } from 'spacetimedb';
import { SenderError, type InferSchema, type ProcedureCtx } from 'spacetimedb/server';
import type schema from './index';
import type { Ctx } from './index';
import { authenticationError } from './auth-policy';
import { roundCoordinate, validLatitudeLongitude } from '../../shared/geo';
import { OVERPASS_URL, overpassQuery, parseOverpassPlaces, type Place } from '../../shared/nearby-places';

type Procedure = ProcedureCtx<InferSchema<typeof schema>>;
const DAY = 86_400_000_000n;
function requirePlayer(ctx: Ctx) {
  const error = authenticationError(ctx.senderAuth, ctx.env.SPACETIMEAUTH_CLIENT_ID);
  if (error) throw new SenderError(error);
  if (!ctx.db.player.identity.find(ctx.sender)) throw new SenderError('Create your player profile first.');
}

// Cache keys contain rounded regions, never live GPS tracks. Rate reservations commit before HTTP.
function cachedOrReserve(ctx: Ctx, key: string, provider: string, interval: bigint): string | undefined {
  requirePlayer(ctx);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const cached = ctx.db.discoveryCache.key.find(key);
  const hit = cached && now - cached.verifiedAt.microsSinceUnixEpoch < DAY;
  for (const [limitKey, wait] of [[provider, hit ? 0n : interval], [`${provider}:${ctx.sender.toHexString()}`, 30_000_000n]] as const) {
    const limit = ctx.db.discoveryLimit.key.find(limitKey);
    if (limit && now - limit.requestedAt.microsSinceUnixEpoch < wait) throw new SenderError('Place discovery is busy. Please wait 30 seconds and try again.');
    const row = { key: limitKey, requestedAt: ctx.timestamp };
    if (limitKey === provider && hit) continue;
    if (limit) ctx.db.discoveryLimit.key.update(row); else ctx.db.discoveryLimit.insert(row);
  }
  if (hit) return cached.payload;
  const day = now / DAY;
  const budget = ctx.db.discoveryBudget.provider.find(provider);
  const used = budget?.day === day ? budget.requests : 0;
  if (used >= (provider === 'overpass' ? 250 : 5000)) throw new SenderError('Today’s place-discovery limit has been reached. Existing quests remain available.');
  const row = { provider, day, requests: used + 1 };
  if (budget) ctx.db.discoveryBudget.provider.update(row); else ctx.db.discoveryBudget.insert(row);
  return undefined;
}
function cache(ctx: Ctx, key: string, payload: string) {
  // Bounded ephemeral cache. Referenced destinations live separately and are never pruned here.
  if (ctx.db.discoveryCache.count() >= 5500n) {
    const oldest = [...ctx.db.discoveryCache.iter()].sort((a, b) => a.verifiedAt.microsSinceUnixEpoch < b.verifiedAt.microsSinceUnixEpoch ? -1 : 1)[0];
    if (oldest) ctx.db.discoveryCache.key.delete(oldest.key);
  }
  const row = { key, payload, verifiedAt: ctx.timestamp };
  if (ctx.db.discoveryCache.key.find(key)) ctx.db.discoveryCache.key.update(row); else ctx.db.discoveryCache.insert(row);
}
function fetchText(ctx: Procedure, url: string, body?: string): string {
  const response = ctx.http.fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'User-Agent': 'Quest-HackUTD/1.0', ...(body === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    ...(body === undefined ? {} : { body }), timeout: TimeDuration.fromMillis(70_000),
  });
  if (response.status !== 200) throw new SenderError('The place provider is unavailable. Your region and quests are unchanged. Try later.');
  const text = response.text();
  if (text.length > 2_000_000) throw new SenderError('The place provider returned too much data. Try a smaller radius.');
  return text;
}

export function searchRegions(ctx: Procedure, raw: string): string {
  const query = raw.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (query.length < 2 || query.length > 100) throw new SenderError('Enter a city or region between 2 and 100 characters.');
  const key = `city:${query.toLowerCase()}`;
  const cached = ctx.withTx(tx => cachedOrReserve(tx, key, 'geocoding', 10_000_000n));
  if (cached !== undefined) return cached;
  const endpoint = ctx.env.GEOCODING_ENDPOINT ?? 'https://geocoding-api.open-meteo.com/v1/search';
  const data = JSON.parse(fetchText(ctx, `${endpoint}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`));
  if (!data || typeof data !== 'object' || (data.results !== undefined && !Array.isArray(data.results))) throw new SenderError('City search returned an invalid response.');
  const results = (data.results ?? []).filter((r: Record<string, unknown>) => typeof r.name === 'string' && validLatitudeLongitude(r.latitude as number, r.longitude as number)).slice(0, 6).map((r: Record<string, unknown>) => ({
    label: [r.name, r.admin1, r.country].filter(v => typeof v === 'string' && v).join(', ').slice(0, 160), latitude: r.latitude, longitude: r.longitude,
  }));
  const payload = JSON.stringify(results);
  ctx.withTx(tx => cache(tx, key, payload));
  return payload;
}

// Only server-fetched provider responses can enter the normalized location catalogue.
// Region changes do not write to slots, XP, completion history, or reroll allowances.
export function saveRegion(ctx: Ctx, args: { latitude: number; longitude: number; label: string; radiusMeters: number }, places: readonly Place[], verifiedAt = ctx.timestamp) {
  requirePlayer(ctx);
  if (!validLatitudeLongitude(args.latitude, args.longitude) || ![3000, 8000, 15000].includes(args.radiusMeters)) throw new SenderError('Choose a valid region and radius.');
  const area = { playerIdentity: ctx.sender, ...args, updatedAt: ctx.timestamp, placeCount: places.length };
  for (const place of places) ctx.db.locations.insert({
    locationId: 0n, playerIdentity: ctx.sender, externalSource: 'OpenStreetMap', externalPlaceId: place.id,
    name: place.name, locationType: place.kind, latitude: place.latitude, longitude: place.longitude,
    region: args.label, regionSelectedAt: ctx.timestamp, lastVerifiedAt: verifiedAt,
  });
  if (ctx.db.playerQuestArea.playerIdentity.find(ctx.sender)) ctx.db.playerQuestArea.playerIdentity.update(area);
  else ctx.db.playerQuestArea.insert(area);
}

export function discoverRegion(ctx: Procedure, input: { latitude: number; longitude: number; label: string; radiusMeters: number }): string {
  if (!validLatitudeLongitude(input.latitude, input.longitude) || ![3000, 8000, 15000].includes(input.radiusMeters)) throw new SenderError('Choose a valid region and search radius.');
  const args = { ...input, latitude: roundCoordinate(input.latitude, 3), longitude: roundCoordinate(input.longitude, 3), label: input.label.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160) };
  if (!args.label) throw new SenderError('Give your adventure region a name.');
  const key = `places:${args.latitude}:${args.longitude}:${args.radiusMeters}`;
  const requestKey = `selection:${ctx.sender.toHexString()}`;
  const prepared = ctx.withTx(tx => {
    const payload = cachedOrReserve(tx, key, 'overpass', 10_000_000n);
    const previous = tx.db.discoveryLimit.key.find(requestKey);
    if (previous && tx.timestamp.microsSinceUnixEpoch <= previous.requestedAt.microsSinceUnixEpoch) throw new SenderError('Region selection is still syncing. Try again.');
    const row = { key: requestKey, requestedAt: tx.timestamp };
    if (previous) tx.db.discoveryLimit.key.update(row); else tx.db.discoveryLimit.insert(row);
    return { payload, token: tx.timestamp, verifiedAt: tx.db.discoveryCache.key.find(key)?.verifiedAt };
  });
  let payload = prepared.payload;
  if (payload === undefined) {
    const body = fetchText(ctx, ctx.env.OVERPASS_ENDPOINT ?? OVERPASS_URL, `data=${encodeURIComponent(overpassQuery(args.latitude, args.longitude, args.radiusMeters))}`);
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.elements) || parsed.remark) throw new SenderError('Place discovery did not finish. Your current region and quests are unchanged.');
    payload = JSON.stringify(parseOverpassPlaces(body, args.latitude, args.longitude, args.radiusMeters));
    ctx.withTx(tx => cache(tx, key, payload!));
  }
  const places = JSON.parse(payload) as Place[];
  ctx.withTx(tx => {
    const pending = tx.db.discoveryLimit.key.find(requestKey);
    if (pending?.requestedAt.microsSinceUnixEpoch !== prepared.token.microsSinceUnixEpoch) throw new SenderError('A newer region selection superseded this request.');
    saveRegion(tx, args, places, prepared.payload === undefined ? tx.timestamp : prepared.verifiedAt!);
  });
  return `${places.length} verified places found. Existing quests and cooldowns are unchanged.`;
}
