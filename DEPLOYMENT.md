# Deploying Quest to Railway

This repository is prepared for manual deployment. No Railway service has been created or deployed by this work, and Maincloud has not been published, migrated, or reset.

## Architecture and release blockers

- Repository root: the directory containing `package.json`, `Dockerfile`, and `railway.json`. React lives in `src/`; shared calculations live in `shared/`; the SpacetimeDB module lives in `spacetimedb/`.
- Railway builds the frontend with Node 24 and serves only `dist/` using Caddy 2. Node, source files, build dependencies, and the SpacetimeDB CLI are absent from the runtime image.
- The browser connects directly to the existing **Maincloud `quest-db`**, at `https://maincloud.spacetimedb.com`. Railway does not run a second application backend or database.
- SpacetimeAuth continues to handle Google login using authorization code + PKCE. Public auth settings and the database endpoint are compiled into the frontend; administrative credentials and AI keys never belong in Railway frontend variables.

**Before releasing this branch, update Maincloud manually.** The metadata check found that the deployed `my_player` view lacks this branch's `avatar` field and `setAvatar` reducer. This preparation also adds the private `quest_refresh_timer` schedule table and server-only handler. Deploying the frontend first would expose a schema mismatch. The check prints the exact outstanding differences; it stops before opening subscriptions when a mismatch exists.

There is no schema-destructive migration here. Existing profiles, XP, quests, histories, regions, captures, favorites, and social data must be retained. Review the CLI migration plan before approving any publication. Do not use `--delete-data=always`, `--clear-database`, or delete/recreate `quest-db`.

## 1. Verify the repository locally

Use Node 24 and the existing npm lockfile:

```powershell
npm ci
# On a fresh clone only; preserve an existing .env.local.
Copy-Item .env.example .env.local
npm test
npm run build
npm run spacetime:build
npm run spacetime:check
```

Install the SpacetimeDB CLI if necessary and make `spacetime` available on PATH. On this Windows setup it is installed at `$env:LOCALAPPDATA\SpacetimeDB\spacetime.exe`. `spacetime:check` also discovers that Windows location automatically. The expected pre-release schema failure described above is a release blocker, not a reason to clear the database.

Generated TypeScript bindings in `src/module_bindings/` are committed. Railway uses them directly and **does not generate or publish a backend during its build**. When backend schemas change, run `npm run spacetime:generate` locally, test, and commit the matching bindings with the code.

Local `.env.local` and `spacetime.local.json` are ignored by Git and excluded from Docker. `.migration/`, local modules, private tool settings, and build outputs are also excluded from the container build context.

## 2. Update the backend independently, when authorized

This is a manual step. Do not run it merely to build the frontend:

```powershell
spacetime login
npm run spacetime:generate
npm test
npm run build
spacetime publish quest-db --module-path spacetimedb --server maincloud --delete-data=never --break-clients
npm run spacetime:check
```

Review the interactive migration plan. `--break-clients` permits the private profile-view change and disconnects old clients; coordinate it with the matching frontend release and have users reload. `--delete-data=never` prevents clearing existing data. The public SpacetimeAuth client ID in `spacetime.json` must match the frontend's client ID. Preserve all existing module environment values.

Server-only module environment settings:

| Setting | Purpose |
| --- | --- |
| `SPACETIMEAUTH_CLIENT_ID` | Required JWT audience; the same public client ID used by the frontend. |
| `AI_API_KEY` | Private photo-judge credential. Keep exclusively in Maincloud's module environment. |
| `AI_BASE_URL`, `AI_MODEL` | Optional judge overrides; existing Gemini defaults remain unchanged. |
| `OVERPASS_ENDPOINT`, `GEOCODING_ENDPOINT` | Optional existing place-provider overrides; never change these to browser URLs or put secrets in frontend variables. |

New completions atomically enqueue a server-owned one-shot refresh at the existing 2/6/12-hour expiry. The scheduled handler checks owner, assignment timestamp, and cooldown, and uses the same selector as manual refreshes. It awards no XP. An exhausted or temporarily invalid catalog retries after five minutes. The first connection after the module update idempotently restores jobs for pre-existing cooldowns without changing their expiry times. Subsequent replacements execute without an active browser. The existing browser refresh remains a recovery path.

`spacetime:check` compares deployed metadata to the generated client schema and required scheduler, then opens anonymous app subscriptions to check compatibility and private-view isolation. A connection also runs the module's normal `clientConnected` lifecycle, which seeds fixed templates and repairs missing cooldown jobs. The check never calls player reducers or reads authenticated player records.

If you later self-host SpacetimeDB on Railway, use a separate service with persistent storage, backups, a public secure WebSocket endpoint, and its own operational plan. That is an alternative architecture, not configured by this frontend Dockerfile. Do not create or migrate to another database as part of this deployment.

## 3. Create and configure the Railway frontend service

When ready to deploy:

1. Commit the reviewed source, generated bindings, Dockerfile, Caddyfile, Railway config, and lockfile to the public GitHub repository. Check that local environment files and temporary artifacts are absent.
2. In Railway, create a project and connect that GitHub repository. Pause automatic deployment while configuring the service if Railway starts an initial build immediately.
3. Set **Root Directory** to the repository root (`/`), not `src/` or `spacetimedb/`.
4. Use the committed `railway.json`: **Dockerfile** builder, `Dockerfile` path, healthcheck **`/healthz`**, timeout **60 seconds**. Leave custom build/start commands blank. Docker runs `npm ci --include=dev`, `npm run build`, then starts Caddy with the committed configuration.
5. Add the public variables below **before building**. Railway supplies them as Docker `ARG` values. A missing required value or an insecure production backend makes the build fail clearly.
6. Use Railway's supplied `PORT`. Caddy listens on `0.0.0.0:$PORT`, defaulting to 8080 locally. No volume is needed. Railway terminates public HTTPS; Caddy serves HTTP behind that proxy.
7. Generate a Railway public domain or attach your intended custom domain under Networking. Use its HTTPS origin for the authentication configuration below. Obtain the domain before enabling user sign-in.
8. Complete the separate backend update and authentication setup, then manually deploy the reviewed commit. Check `/healthz` and the release checklist before sharing the URL.

## 4. Railway environment variables

These values are public and compiled by Vite. Changing them requires a **new build**, not merely a runtime restart.

| Variable | Requirement / value |
| --- | --- |
| `VITE_SPACETIMEDB_HOST` | Required: `https://maincloud.spacetimedb.com` |
| `VITE_SPACETIMEDB_DB_NAME` | Required: `quest-db` |
| `VITE_SPACETIMEAUTH_CLIENT_ID` | Required: the existing public client ID, currently `client_034th99S8ZfAMgWt5nNYdF`; verify it against Maincloud's configured audience. |
| `VITE_MAP_STYLE_URL` | Optional: `https://tiles.openfreemap.org/styles/liberty` |
| `VITE_MAP_DEFAULT_LATITUDE` | Optional: `32.9858` |
| `VITE_MAP_DEFAULT_LONGITUDE` | Optional: `-96.7501` |
| `PORT` | Runtime only. Supplied by Railway; local Caddy defaults to `8080`. |

Do not add Google OAuth secrets, `AI_API_KEY`, SpacetimeDB admin tokens, or other private credentials to `VITE_` settings or Docker build arguments. No separate `VITE_AUTH_REDIRECT_URI` is required: the app derives its callback and sign-out destination from the current browser origin.

## 5. Register production authentication URLs

Let `ORIGIN` be the final HTTPS origin, for example `https://your-domain.example` (replace this example; it is not a deployment domain).

1. Open the existing `quest-db` SpacetimeAuth client in the Maincloud dashboard.
2. Keep Google enabled as the identity provider.
3. Add the exact login redirect **`ORIGIN/callback`** and logout redirect **`ORIGIN/`**, including the final slash for logout. Keep `http://localhost:5173/callback` and `http://localhost:5173/` if local development should continue.
4. If the dashboard presents allowed web origins, add **`ORIGIN`** without a path. Do not use wildcard redirect domains.
5. Google receives the **SpacetimeAuth provider callback**, not the frontend `/callback`. In SpacetimeAuth's Google-provider settings, copy its displayed callback URL and confirm that exact URL in Google Cloud Console → the existing OAuth web client → Authorized redirect URIs. Do not replace it with the Railway domain. The standard Maincloud Google callback documented by SpacetimeAuth is `https://auth.spacetimedb.com/interactions/federated/callback/google`; confirm it against the provider settings. If that provider callback has not changed, Google needs no redirect change. Provider secrets remain in SpacetimeAuth.
6. On the final domain, test Google sign-in, a refresh at `/profile`, logout, and re-login. Confirm the same account ID and username. Test session renewal and recovery from connection loss.

PKCE/state validation, local-storage session persistence, ID-token authentication to SpacetimeDB, silent renewal, and callback return-path validation are preserved. HTTPS is required for public production login and browser geolocation. Users sign in again on a new origin because browser storage is origin-specific.

## 6. Test the production server locally

With Docker available:

```powershell
docker build -t quest-frontend `
  --build-arg VITE_SPACETIMEDB_HOST=https://maincloud.spacetimedb.com `
  --build-arg VITE_SPACETIMEDB_DB_NAME=quest-db `
  --build-arg VITE_SPACETIMEAUTH_CLIENT_ID=client_034th99S8ZfAMgWt5nNYdF .
docker run --rm -p 8080:8080 -e PORT=8080 quest-frontend
# In another terminal:
npm run production:check -- http://127.0.0.1:8080
```

Without Docker, install/download an official Caddy 2 binary, build, and run the **same Caddyfile**:

```powershell
npm run build
$env:PORT = '8080'
$env:QUEST_STATIC_ROOT = (Resolve-Path dist).Path.Replace('\', '/')
caddy validate --config Caddyfile --adapter caddyfile
caddy run --config Caddyfile --adapter caddyfile
# In another terminal:
npm run production:check -- http://127.0.0.1:8080
```

Use port 5173 instead if you want to test the already-registered local OAuth redirect; stop the development server first. A sign-in test on port 8080 needs its exact callback/logout URLs registered separately. `vite preview` is for inspection only and is not the production runtime.

The static check verifies all app routes and `/callback`, health, hashed assets, cache headers, and 404 behavior for missing assets and source/config files. The server returns `index.html` for browser routes; missing JS, CSS, images, and workers return 404 rather than HTML. MapLibre's worker and geographic assets must load with their real content types. HTML is revalidated, while hashed assets are immutable.

## 7. Manual live release checklist

After the backend check passes and authentication redirects are registered:

- Open and refresh `/`, `/map`, `/questboard`, `/journal`, `/bestiary`, `/friends`, `/guild`, and `/profile`; test a direct `/callback` return from a real login.
- Confirm the saved username/avatar and skill XP, total XP, levels, titles, and next-level progress.
- Verify six persistent slots (3 Easy, 2 Medium, 1 Hard), quest details, photo completion, exactly-once XP, history, capture photos, stars, search, and filters.
- Complete a quest, close all clients, and inspect its replacement after the real cooldown. No test-only shortened cooldown is configured. Confirm no duplicate rewards or rerolls on refresh/reconnect.
- Test two-reroll enforcement and stale-assignment errors; do not reset the database to test it.
- Confirm assigned geographic quests and historical snapshots on MapLibre. Anywhere quests must have no invented marker. Check pan, zoom, detail links, workers, HTTPS tiles, attribution, opt-in geolocation, and manual city fallback. Existing adventure-region discovery is preserved; this deployment does not add new discovery functionality or auto-regenerate boards on travel.
- Confirm Friends/Guild pages and private-data isolation with two separate accounts. Test temporary offline/reconnect states.
- Inspect browser errors/network responses and Railway logs. `/healthz` checks the static service only; it does not prove OAuth, Maincloud, AI, map providers, or database schedules are healthy.

## Verification performed and remaining external checks

The current branch's regression tests cover authoritative rewards, progression, cooldown boundaries, rerolls, data isolation, avatar validation, favorites, party/guild flows, map synchronization, region persistence, and photo-task wording. Added checks cover explicit production configuration, stale backend metadata, and server-owned offline timers including retry/stale-job behavior. Production dependencies were audited without installing upgrades; no reported production dependency vulnerabilities were returned at the time of this review. A tracked-file pattern scan found no private-key/API-token patterns or tracked local credential files; this is not a guarantee against every possible secret format.

Docker is not installed on the review machine, so the container image itself cannot be built here. An isolated source build excludes local environment files and backend-local dependencies, and the official checksum-verified Windows Caddy binary tests the committed production server configuration locally. Docker image build/start remains a manual pre-release check on a Docker-enabled machine or Railway. Real production-domain Google OAuth, authenticated Maincloud avatars, actual host-dispatched scheduled timers, and authenticated map/gameplay require the manual backend update and final domain; they are not claimed as deployed or end-to-end verified here.

## Files added or changed

| Files | Purpose |
| --- | --- |
| `Dockerfile`, `Caddyfile`, `railway.json`, `.dockerignore` | Production image, PORT binding, SPA/static routing, health, and build-context exclusions. |
| `shared/public-config.ts`, `src/auth/settings.ts`, `vite.config.ts`, `.env.example` | Validate public settings and secure endpoints, preserving origin-derived OAuth callbacks. |
| `scripts/backend-schema.mjs`, `scripts/check-backend.mjs` | Detect missing deployed APIs/profile fields/scheduler before opening subscriptions. |
| `scripts/check-static.mjs`, `package.json` | Add `npm run production:check` against a running production static server. |
| `spacetimedb/src/quest-schedule.ts`, `index.ts`, `quest-completion.ts`, `quest-refresh.ts` | Private cooldown jobs, atomic enqueue, owner-bound replacement, retry, and legacy-job repair. |
| `src/module_bindings/index.ts`, `my_player_table.ts`, `set_avatar_reducer.ts`, `types.ts`, `types/reducers.ts` | Regenerated CLI output matching the local module. |
| `tests/deployment.test.mjs`, `tests/quest-schedule.test.mjs`, `tests/player-harness.ts`, `tests/browser/navigation.test.mjs` | Settings/schema checks, offline timers, and a navigation-test timing fix. |
| `README.md`, `DEPLOYMENT.md` | Release steps, manual backend update, and verification limits. |

Local verification passed **223 automated tests**, **9 Chrome navigation/region checks**, the production frontend build, native module bundle, an isolated environment-only build, and Caddy static checks. A missing-configuration build failed clearly as intended. Chrome mounted the production sign-in screen on all eight deep links without JavaScript errors; every emitted asset, including MapLibre code and worker, served normally. The expected live backend compatibility failure remains unresolved until manual publication. The existing large-map-chunk build warning remains non-blocking; no unrelated map-library rewrite was attempted.

## Future releases

Keep backend and frontend releases separate. For schema changes, generate bindings locally, test, manually review/publish the backend with deletion disabled, verify compatibility, and release the matching frontend. For frontend-only changes, commit to the selected branch and manually redeploy in Railway (or deliberately enable auto-deploy once the release process is ready). Rebuild when public Vite settings change. Keep the public GitHub repository free of local environments, CLI credentials, generated build artifacts, and test downloads.

References: [Railway Dockerfile/build arguments](https://docs.railway.com/builds/dockerfiles), [Railway PORT and healthchecks](https://docs.railway.com/deployments/healthchecks), [Caddy SPA fallback](https://caddyserver.com/docs/caddyfile/directives/try_files), [Railway TLS termination with Caddy](https://caddyserver.com/docs/quick-starts/railway), [Vite public build-time settings](https://vite.dev/guide/env-and-mode), [SpacetimeDB schedule tables](https://spacetimedb.com/docs/tables/schedule-tables/), [SpacetimeAuth provider callbacks](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/configuring-a-project/).
