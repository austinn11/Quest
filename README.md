# Quest

Quest turns real-world activities into fantasy RPG quests. Adventurers receive a personal six-slot Questboard and will earn XP as they complete its adventures.


## Prerequisites

- Node.js 22.12+ within version 22, or Node.js 24+; npm is included.
- [SpacetimeDB CLI](https://spacetimedb.com/install), compatible with the installed 2.14.x SDK.
- Access to the team's Maincloud database to publish backend changes.

Run commands from the repository root, `Quest`.

### Windows: CLI not found

If SpacetimeDB is installed at its default Windows location but `spacetime` is not recognized, add it to the current PowerShell session:

```powershell
$env:Path += ";$env:LOCALAPPDATA\SpacetimeDB"
spacetime --version
```

For future terminals, add `%LOCALAPPDATA%\SpacetimeDB` to your user Path through Windows Environment Variables, then restart your editor and terminals.

## Setup

Install both the frontend and database module dependencies:

```powershell
npm ci
npm --prefix spacetimedb ci
```

Copy `.env.example` to `.env.local`. If `.env.local` already exists, add the settings below rather than replacing it:

```powershell
Copy-Item .env.example .env.local
```

The defaults connect to Maincloud's `quest-db`:

```dotenv
VITE_SPACETIMEDB_DB_NAME=quest-db
VITE_SPACETIMEDB_HOST=https://maincloud.spacetimedb.com
VITE_SPACETIMEAUTH_CLIENT_ID=client_034th99S8ZfAMgWt5nNYdF
```

These are browser-visible connection settings. Never store secrets in `VITE_` variables. Local environment files are ignored by Git; `.env.example` is the shared template.

The database host/name have defaults; the SpacetimeAuth client ID is required. `spacetime.json` configures the same database, server, and module directory for the CLI, plus the backend's trusted `SPACETIMEAUTH_CLIENT_ID`. If you change clients, update both frontend and backend settings. `spacetime.local.json` is a CLI-managed local override and is ignored by Git.

## Run the frontend

```powershell
npm run dev
```

Open http://localhost:5173. Leave the terminal running. The port is fixed so OAuth callbacks match the registered URL; Vite reports an error if another process occupies it.

Maincloud hosts the backend, so a local `spacetime start` process is unnecessary for this setup. Choose **Continue with Google**, then use Google on SpacetimeAuth's hosted page. After sign-in the app connects with your OIDC ID token and loads your private adventurer profile.

The OIDC library stores the session in local storage to survive refreshes, uses authorization code flow with PKCE, and renews tokens automatically. It manages OAuth state in session storage; both storage mechanisms must be available. Anonymous tokens from the F01 starter are no longer used. Signing out removes the local session before redirecting to SpacetimeAuth and closes the database connection. Other tabs reload when the stored session changes. This signs out of Quest, not your Google account globally.

## Application pages (F04)

The signed-in application uses React Router with a shared header and navigation:

| Route | Page |
| --- | --- |
| `/` | Dashboard / Home |
| `/map` | Interactive fantasy world map and assigned quest destinations |
| `/questboard` | Personal six-slot Questboard |
| `/journal` | Completed adventures and historical XP |
| `/bestiary` | Creatures captured for Bestiary bounties, with their photos |
| `/guild` | Your guild, its members and invite code, or the guild directory |
| `/profile` | Player profile, progression, and username editor |

The header includes sign-out on every page, active navigation states, and links that wrap on small screens. Profile initialization and its subscription remain mounted across page changes. Unknown paths show a recovery link to Home.

You can open or refresh any page directly. A signed-out deep link is restored after login, while the OAuth callback remains `/callback`. Vite supports these paths during development. Any future static hosting must rewrite application routes to `index.html` so deep-link refreshes work there too.

## SpacetimeAuth and Google setup

In the [quest-db dashboard](https://spacetimedb.com/quest-db), enable SpacetimeAuth and configure its **Default Client** as a public web client with authorization code flow (no browser client secret).

The current client uses this exact login redirect:

```text
http://localhost:5173/callback
```

Its exact post-logout redirect includes a trailing slash:

```text
http://localhost:5173/
```

Under **Identity Providers**, configure and enable Google using a Google OAuth web client. In Google's console, its authorized redirect URI must be:

```text
https://auth.spacetimedb.com/interactions/federated/callback/google
```

Store the Google client ID/secret in SpacetimeAuth's provider settings, never in Vite or the repository. If Google's app is in Testing mode, add your intended testers in Google Auth Platform. Keep Google enabled; turn off anonymous/email sign-in in SpacetimeAuth if Google should be the only offered method. The app uses the provider's hosted page rather than constructing a separate Google OAuth flow.

The client scope must allow `openid profile email offline_access`. Match its public client ID in `.env.local` (`VITE_SPACETIMEAUTH_CLIENT_ID`) and `spacetime.json` (`env.SPACETIMEAUTH_CLIENT_ID`), then publish the module and restart Vite. For `127.0.0.1`, deployments, or production previews, register that origin's `/callback` and logout `/` URLs as well; only the localhost URLs above are currently configured.

Reference: [SpacetimeAuth configuration](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/configuring-a-project/) and [React integration](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/react-integration/).

### Player privacy

The `player` table is private. The public `my_player` view exposes only the row matching the caller's server-verified `ctx.sender`. The `ensurePlayer` reducer validates the SpacetimeAuth issuer and the configured client audience, then creates a missing profile with zero XP. It accepts no player identity or XP from the browser, and subsequent calls preserve existing progression. Future gameplay reducers must apply the same auth policy and server-side ownership checks.

Database owners retain administrative access to private tables.

### Adventurer profiles (F03)

On the first authenticated connection, the app creates a private player record. The profile shows your username, combined XP, Adventurer level, three skill progressions, join date, and account ID. The authoritative counters are `exploration_xp`, `bestiary_xp`, and `crafting_xp`. Overall XP is always their sum; levels and titles are derived.

Choose an adventurer username in the profile, then use **Edit username** to change it. Usernames use 3 to 24 ASCII letters, numbers, or underscores. Capitalization is preserved for display, but uniqueness is checked without regard to case. A rename releases the old name. Duplicate or invalid names are rejected by the server without changing the saved profile.

`setUsername` accepts only a username and updates the player identified by `ctx.sender`; it cannot change another account, XP, or creation time. Existing profiles receive empty username fields during migration and can choose a name when they next open the app. The private normalized username index enforces availability inside a transaction. Only the public spelling is returned in the per-user view.

To check F03 in the browser, choose a name, refresh, edit it, and sign out/back in. The saved name should return. With a second Google account, choose a different name and confirm both accounts retain their own names. Trying the first account's name (including different capitalization) should display an availability error.

## Player leveling and XP progression (F10)

`shared/progression.ts` contains the pure calculations bundled into both SpacetimeDB and React. The additional XP needed to advance from level L is `200 + 100 * (L - 1)`. The cumulative XP required to reach level L is `50 * (L - 1) * (L + 2)`.

| Level | Total XP required | XP needed for the next level |
| --- | --- | --- |
| 1 | 0 | 200 |
| 2 | 200 | 300 |
| 3 | 500 | 400 |
| 4 | 900 | 500 |
| 5 | 1,400 | 600 |

The server's private player view derives overall XP from the three skill counters and derives the Adventurer level from that sum. Profile, Dashboard, and Questboard use the same shared helpers. Each skill uses the same curve and caps its displayed level at 50; XP keeps accumulating and the Adventurer level continues beyond 50. The existing combined u32 XP limit (4,294,967,295) remains enforced transactionally to prevent overflow.

A single notice observes authoritative profile subscription updates and announces skill XP, combined XP, Adventurer level gains, skill level gains, and title unlocks. Multiple gains in one update are handled together. Initial loading, page refreshes, username changes, and switching accounts do not replay past rewards. Notices dismiss automatically or manually and respect reduced-motion preferences. Level and title unlocks never award additional XP.

Skills use these shared, derived titles: levels 1–4 Beginner, 5–9 Novice, 10–14 Apprentice, 15–19 Adept, 20–24 Journeyman, 25–29 Expert, 30–34 Veteran, 35–39 Master, 40–44 Grandmaster, 45–49 Legendary, and 50 Mythic. A level-50 skill has a full progress bar and no level-51 requirement.

### Existing-player migration

Four columns are appended with migration-safe defaults: the three skill counters and the internal `progression_ready` flag. The original `xp` column is retained unchanged as an audit value; it is no longer updated by completion. The `xp` field returned by `my_player` is a derived sum, not that legacy column.

On the next authenticated `ensurePlayer` call (or completion), the server sums each historical completion's actual `xp_awarded` into the category of its preserved public or owner-private template. It commits this split once only when its sum exactly equals the old `xp` value. Zero-XP accounts migrate with no completions. Identity, username, timestamps, quest assignments, cooldowns, photos, and history are preserved. New accounts start with three zero counters and are already marked ready.

Historical categories were not snapshotted in older completion rows. Migration therefore relies on the preserved template category; the application does not provide an API to change those categories. If a template is missing or historical rewards do not reconcile with the legacy total, the server leaves the original record untouched, reports that review is required, and blocks progression awards for that account. The UI waits for a successful migration rather than showing a guessed or reset total. An administrator must resolve the discrepancy using evidence; there is no automatic arbitrary redistribution.

This changes the private player schema and `my_player` wire layout. Regenerate bindings and publish the matching backend before reloading the frontend. Keep database deletion disabled; existing clients need to reconnect with the new bindings.

Tests cover every reachable u32 level threshold immediately before, at, and after it, current-level progress, multiple-level gains, invalid inputs, persistent server profiles, and consistent displays across all three pages.

## Quest templates and slots (F05)

Players do not create or accept quests. The backend schema supports a personal rotating Questboard with six fixed positions:

| Slots | Difficulty |
| --- | --- |
| 0, 1, 2 | Easy |
| 3, 4 | Medium |
| 5 | Hard |

The existing private player table is preserved. Three quest-related tables replace the old quest/progress model:

| Table | Stored fields | Client access |
| --- | --- | --- |
| `quest_templates` | Template ID, title, description, category, difficulty, XP reward, optional latitude/longitude, active flag | Public catalogue containing no player information |
| `player_quest_slots` | Player-bound slot ID, owner, index, fixed difficulty, assigned template, Available/Cooldown status, assignment/completion/refresh times | Private; `my_quest_slots` returns only the caller's rows |
| `quest_completions` | Auto-incremented completion ID, owner, template ID, slot index, XP awarded, completion time | Private; `my_quest_completions` returns only the caller's history |

Categories are Exploration, Bestiary, and Crafting. Difficulty rewards remain server-controlled: Easy 50 XP, Medium 100 XP, Hard 200 XP. Twenty-one templates seed idempotently, with seven choices per difficulty: fifteen original quests and six curated geographic quests. Existing records and inactive flags are preserved on reseeding. Inactive templates remain readable for resolving historical references, but validation rejects them for new Available assignments.

Slot IDs are derived from the player identity and position, so reducers address one row per position. Validation helpers enforce positions 0–5, the 3/2/1 difficulty layout, matching template references, and coherent timestamps. Available slots have no completion or refresh timestamp; Cooldown slots retain the completed template and require both timestamps. Difficulty-specific durations live in `spacetimedb/src/quest-config.ts`.

Completion rows are independent of slots and may reference the same template across different completed assignments. Their XP and time are historical snapshots; replacing a slot does not rewrite them. Validation rejects mismatched owners, templates, positions, times, and rewards.

Frontend bindings expose `tables.questTemplates`, `tables.myQuestSlots`, and `tables.myQuestCompletions`. Players cannot create or accept quests. Completion, XP awards, and cooldown replacements are handled by server reducers.

Generation uses `slotDifficulty`, `slotIdFor`, and `validateSlot`; completion validates its transition and appends a history row atomically with the XP award. Templates should be deactivated rather than deleted when history refers to them. Avoiding simultaneous duplicates does not mean excluding every historically completed template forever.

## Questboard initialization (F06)

After sign-in, React waits for the private player profile subscription, then calls `initializeQuestboard()` with no arguments. The reducer verifies SpacetimeAuth and the existing player using `ctx.sender`. It assigns exactly three Easy, two Medium, and one Hard template from the active catalogue, without duplicates. The frontend supplies no identity, difficulty, template, or XP values.

Selection uses SpacetimeDB's supported, deterministic server RNG (`ctx.random.integerInRange`), documented in the [reducer context reference](https://spacetimedb.com/docs/functions/reducers/reducer-context/). The most recently completed template is avoided when alternatives exist; it can be used if necessary to fill the board without duplicates. Templates are never permanently excluded just because they appear in history.

All six assignments are committed in one transaction. Insufficient active templates produce an error and leave no partial board. Repeated calls and reconnections preserve an existing complete board, including cooldown slots and templates that have since been deactivated. A partial or malformed board produces an error and is preserved for repair rather than being silently regenerated. There is no reroll endpoint.

`QuestboardProvider` remains mounted across navigation, owns subscriptions to `my_quest_slots` and `quest_templates`, and initializes after profile creation. `/questboard` displays the six assigned objectives, categories, difficulties, statuses, and template XP, with loading and retryable error states. Slot rows are private; each player subscribes only to their own view.

To verify F06 manually, sign in and open **Questboard**. Confirm six distinct quests in the 3/2/1 layout, then refresh and sign out/back in: the same assignments must return, except expired cooldowns can now receive replacements. A different Google account should receive its own board; two players may share templates, but their slot records remain independent.

## Questboard and Journal UI (F07)

The Questboard displays current assignments in a single grid: two rows of three cards on desktop, two columns on narrower screens, and one column on mobile. Each card resolves its title, objective, category, difficulty, and reward from the SpacetimeDB catalogue. **Inspect quest** expands assignment dates and optional location coordinates. Cooldown cards display their stored state and completion/replacement-eligibility dates, plus the F09 countdown described below.

The Quest Journal shows only historical completions, newest first, with repeated completions preserved as separate accomplishments. Earned XP comes from each completion's `xp_awarded` snapshot, rather than the template's current reward. Dates come from `completed_at`; titles and objectives resolve through the catalogue, including inactive templates. Missing templates do not hide saved assignments or erase historical XP and dates.

A single managed subscription in `QuestboardProvider` reads `quest_templates`, `my_quest_slots`, and `my_quest_completions`. It stays mounted across page navigation, listens for inserts/updates/deletes, and waits for `onApplied` before treating data as current. The SDK replays the same subscription on reconnect. Subscription failures have a retry action, and disconnected or resyncing pages label any cached records as potentially stale. The Journal can load independently of a board-initialization error.

Both pages include loading and empty states and links to one another. The Journal is empty until the player completes their first quest.

## Quest completion and rotating slots (F08/F09)

**Complete quest** calls `completeQuest({ slotIndex, expectedAssignedAt })`. The server derives the owner from the authenticated sender and requires an existing profile and an Available slot. The assignment timestamp must still match, preventing delayed or retried requests from completing a later replacement. The browser never supplies XP, difficulty, or cooldown duration. Deactivating an already-assigned template does not prevent that player from completing it.

In one reducer transaction, the server records a completion with the template's validated XP, increments the player's XP, and moves the slot into Cooldown with authoritative `completed_at` and `refresh_at` timestamps. Duplicate completion attempts on that assignment award nothing. XP overflow and invalid state reject the whole transaction. Profile, Journal, and Questboard updates arrive through their subscriptions; completion buttons provide pending, success, and error feedback without optimistic rewards.

Cooldown configuration is centralized in `spacetimedb/src/quest-config.ts`:

| Difficulty | Cooldown |
| --- | --- |
| Easy | 2 hours |
| Medium | 6 hours |
| Hard | 12 hours |

`refreshQuestSlots()` takes no arguments. It uses the server timestamp to replace only the caller's expired Cooldown slots. Replacements use active templates of the fixed slot difficulty, exclude templates held by all other current slots, and prefer to avoid the completed template and most recent historical completion. Recent-history preferences can be relaxed when needed; simultaneous duplicates remain forbidden. An exhausted catalogue leaves the affected slot on Cooldown while other eligible slots can refresh. Replacement resets completion/refresh fields and stores a new assignment timestamp, preserving XP and all history.

F09 uses lazy refresh, with no background scheduler. The frontend checks after initialization, on reconnect or revisiting the board, when the window regains focus, and when a countdown expires. **Check for new quests** provides a manual check. Unresolved expired slots retry at a 30-second interval to avoid request loops. Local countdowns are approximate displays and request triggers; changing the browser clock cannot bypass the server's cooldown check. A slot remains Cooldown until a server replacement arrives. Refreshes and re-login do not restart persisted cooldowns.

For a manual demo, complete one Available quest and verify its XP on Profile and its dated entry in the Journal. Repeated clicks or re-login must preserve one reward and the original cooldown deadline. A second account's board and XP must remain unchanged. The automated datastore tests advance the server test clock to verify all cooldown boundaries without waiting for real hours; no test clock or time-bypass reducer is published.

## Interactive fantasy world map (F11)

`/map` uses [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) with an OpenFreeMap vector basemap, parchment styling, difficulty-colored quest seals, and dimmed cooldown markers. It reads the existing private Questboard subscription. Selecting a marker or a destination in the accessible list shows the quest objective, reward, status, and location, plus links to the matching Questboard card and Google Maps directions. Completing and refreshing quests update the markers automatically; there is no separate map quest state or completion reducer.

**My location** requests permission only on click and keeps the result in page memory. Permission denial or unavailable geolocation leaves manual navigation and the default Dallas/UTD area usable. The map requires internet access and browser WebGL; a map failure leaves the destination list available with a reload action. It uses [OpenFreeMap's documented vector style](https://openfreemap.org/quick_start/) without an application API key, retaining provider attribution. These public settings are optional:

```dotenv
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
VITE_MAP_DEFAULT_LATITUDE=32.9858
VITE_MAP_DEFAULT_LONGITUDE=-96.7501
```

The style URL must serve a MapLibre JSON style with CORS enabled. MapLibre's worker is bundled through Vite and loaded when the map mounts. Local position is not stored in SpacetimeDB; basemap requests go to the configured external provider. Directions links include the destination coordinates only.

F11 appends optional `location_name` and `location_type` fields with empty defaults and adds six [curated Dallas-area quests](docs/map-locations.md). It labels the existing campus point without moving it or altering its objective or reward. Existing players retain their assignments; geographic templates become eligible for future initialization or replacements. A board with only non-geographic quests legitimately has no map markers. History retains its template reference and resolves the destination through the retained catalogue. Deactivate historical templates rather than moving or deleting them.

## Unified Map, Questboard, and Journal flow (F13)

Location-based Questboard cards have a **View on map** link. Links include the slot index and the exact assignment timestamp, so a refresh or deep link selects the same subscribed quest and centers its marker. Selecting another marker updates that target in the URL. Links never supply coordinates, player identity, XP, or difficulty. Non-geographic cards have no map link, and manually opening an unmapped assignment offers a return to its Questboard card.

Map details reuse the Questboard's `CompleteQuestButton`, which now completes quests with photo proof (see below). Completion is disabled until the connection and subscription are current, and while initialization or refresh is pending. The subscribed cooldown state updates the marker and details; XP and Journal history update through their existing subscriptions. No additional completion API, optimistic quest record, or duplicate XP logic is added.

When a slot is replaced, the old marker and selected completion control disappear. The old URL reports that its assignment changed instead of silently selecting the replacement. A current map quest links back to its exact Questboard card. Journal entries offer **View completed quest on map** only while the matching template, slot, and completion timestamp still identify that slot's current cooldown quest. Once replaced, that map link disappears while the accomplishment and awarded XP remain in history.

F13 is frontend-only and uses the already-published tables, views, and reducers. Tests cover assignment-specific links, malformed or stale targets, repeated templates, unmapped quests, current Journal links, subscription readiness, and the complete/replace gameplay flow.

## Nearby quests

**Find quests near me** (Questboard and Home) asks for location permission once and remembers the choice in this browser. While the app is open it watches your position:

- With no quest area yet, or after moving more than **10 km** from it, the browser asks OpenStreetMap's free Overpass API for named parks, ponds, gardens, viewpoints, monuments, artwork, museums and historic sites within 8 km. Results are cached per ~1 km grid cell for a week.
- The places go to the `setQuestArea` reducer, which treats them as untrusted. It re-validates every place (known kinds, numeric OpenStreetMap ids, coordinates, distance recomputed on the server, unsuitable names such as schools or playgrounds dropped). Then it generates up to 18 **local quests**: Bestiary, Crafting and Exploration at Easy (within ~1.5 km), Medium (~4 km) and Hard (~8 km).
- Every **Available** slot then reloads, preferring local quests about two times in three. Cooldown slots keep their completed quest and refill from the new pool when they expire. Curated Dallas quests are offered only when your area is within 10 km of them.
- Local quests and your area (rounded to about 100 m) live in **private** tables, read only through the `my_local_quests` and `my_quest_area` views. The public catalogue never reveals where anyone is. Old local quests are kept, inactive, so Journal history still resolves.

Public Overpass servers can be slow or overloaded. If none responds, the board keeps its current quests and offers **Try again**. Tunables live in `shared/nearby-places.ts` and `spacetimedb/src/quest-config.ts`. To try it without travelling, override your position in Chrome DevTools (More tools > Sensors > Location).

## Photo proof and the AI judge

**Complete quest** opens the camera on a phone, or a file picker on desktop. The browser shrinks the photo to at most 1024 px JPEG and sends it to the `submitQuestPhoto` procedure, which:

1. Checks ownership and assignment exactly like completion, and enforces a limit of 12 photo checks per hour and one every 5 seconds per player.
2. Sends the quest title, objective, its **photo goal** (shown on each notice) and the image to an OpenAI-compatible `/chat/completions` endpoint. The judge prompt ignores any text written inside the photo and must answer with JSON. Anything other than an explicit acceptance is treated as a rejection.
3. On acceptance, completes the quest through the same exactly-once logic as before, and saves the judge's short description as the completion's `proofNote`, shown in the Journal.

Photos for other quests are not stored; Bestiary bounties keep one (see below). Configure the judge with module environment variables; never commit the key:

| Variable | Meaning |
| --- | --- |
| `AI_API_KEY` | A Google Gemini API key. Without it, any valid photo is accepted with "AI check not configured" (local development). With it, the one-click `completeQuest` reducer is refused so the photo check cannot be skipped. |
| `AI_MODEL` | Optional. Defaults to `gemini-2.5-flash` (about 2–3 s per photo), falling back to `gemini-3.1-flash-lite` when Google is busy. Setting it disables the fallback. |
| `AI_BASE_URL` | Optional. Defaults to Gemini's OpenAI-compatible endpoint, `https://generativelanguage.googleapis.com/v1beta/openai`. Any OpenAI-compatible provider with vision models works with a matching `AI_MODEL`. |

List the models your key can use, then publish with the key as a shell variable, which overrides `spacetime.json` and is not written to it:

```powershell
curl.exe -s https://generativelanguage.googleapis.com/v1beta/openai/models -H "Authorization: Bearer $env:AI_API_KEY"
$env:AI_API_KEY = "<your Gemini key>"
npm run spacetime:publish:local
```

Use `spacetime publish --env-only` to change only these values on an existing database. Check judge errors with `spacetime logs quest-db --server local`.

## Bestiary bounties and captures

Every Bestiary quest is a **bounty** for a named creature, shown on the Questboard as a WANTED poster with a portrait frame, "Last seen near …" and its reward. **Claim bounty** opens the camera.

- Local bounties are chosen for the kind of place, in `spacetimedb/src/bounties.ts`:
  - Ponds: ducks, turtles, dragonflies, herons.
  - Parks and gardens: songbirds, pollinators, squirrels, woodpeckers, birds of prey.
  - Nature reserves and woods: lizards, rabbits, deer, foxes, armadillos.
  - Beaches: gulls and shorebirds.
  Easy bounties are common creatures; Hard ones need patience. The nine catalogue Bestiary quests carry fixed targets, backfilled on connect for existing databases.
- The AI judge accepts only a creature matching the bounty and names it (for example "Great Egret").
- An accepted bounty also stores a **capture**: the judge's creature name, whether the AI verified it, the place, and a 640 px JPEG copy of the photo sent alongside the 1024 px judging image. Captures live in the private `creature_captures` table, readable only through `my_creature_captures`.
- The **Bestiary** page lists your captures with their photos, newest first. A claimed poster shows the photo with a CAPTURED stamp until the slot refreshes, and the Journal entry links to it.

## Guilds

Players can band together in guilds, one guild per player and up to 20 members.

- **Found a guild** with a name (3 to 32 characters, unique regardless of capitalisation), an optional motto, one of six crest colours, and whether anyone may join from the directory. The founder becomes **Leader**.
- **Join** an open guild from the **guild directory**, or any guild, including invite-only ones, with its 6-character **invite code**. Codes skip look-alike characters and ignore case, spaces and hyphens.
- **Members** see the guild's invite code, total guild XP and a roster of usernames, levels, XP and roles. The leader can switch the guild between open and invite-only.
- **Leaving:** if the leader leaves, the longest-serving member becomes leader. The last member out disbands the guild and frees its name.

Privacy: the public `guild` table holds only names, mottos and crests. Membership (`guild_membership`) and invite codes (`guild_invite`) are private. Clients read them through `my_guild` (your guild and its code), `my_guild_members` (your guild's roster, by chosen username only) and the anonymous `guild_directory` view (member counts and XP, never members or codes). Reducers: `createGuild`, `joinOpenGuild`, `joinGuildByCode`, `leaveGuild`, `setGuildOpen`.

### Guild quests

Each guild has three shared **guild quests** at a time, each of a different kind, drawn from:
- **The Great Hunt:** claim Bestiary bounties together.
- **Chart the Frontier:** complete Exploration quests.
- **The Guild Workshop:** complete Crafting quests.
- **Strength in Numbers:** earn quest XP together.

Targets scale with the guild's size when the quests are drawn.

- Members don't do anything extra: each ordinary quest completion advances every matching guild quest in the same transaction that awards its XP, and records the member's contribution.
- When a guild quest reaches its target, every member who contributed receives its bonus XP (100, or 150 for Strength in Numbers) exactly once, including members who have since left.
- Quests last 7 days. Opening the Guild page replaces expired quests (`refreshGuildQuests`), so guilds created earlier also get a board.
- `guild_quest` and `guild_quest_contribution` are private; members read their guild's board, progress and own share through `my_guild_quests`. Disbanding a guild removes its quests.

## Work on the backend

To publish backend changes to the shared Maincloud database, authenticate with an account that has access, then publish:

```powershell
spacetime login
npm run spacetime:publish
```

Coordinate schema changes with the team because this updates the shared database. Publishing retains the CLI's confirmation prompts.

After changing tables or reducer signatures, regenerate client bindings and validate:

```powershell
npm run spacetime:generate
npm run build
```

`npm run generate` is an alias for `npm run spacetime:generate`. Commit the generated bindings alongside schema changes; do not edit them by hand.

To bundle the database module without publishing:

```powershell
npm run spacetime:build
```

### Optional local backend

For isolated development, run `spacetime start` in a separate terminal. From the repository root, publish the module locally:

```powershell
npm run spacetime:publish:local
```

Change `.env.local` to:

```dotenv
VITE_SPACETIMEDB_DB_NAME=quest-db
VITE_SPACETIMEDB_HOST=http://127.0.0.1:3000
```

Restart Vite after changing environment values. Local and Maincloud databases have separate data. Continue using `spacetime:publish:local` for local updates; `spacetime:publish` explicitly targets Maincloud. Restore the Maincloud host to switch back.

## Validation

After switching branches or publishing a backend, run `npm run spacetime:check` while online. It uses the frontend's configured host/database and generated bindings to exercise the real profile and quest subscriptions with a fresh anonymous identity. It checks that private views return no other player's data; it does not sign in as a player or call reducers. Connection lifecycle hooks still run as they do for any client.

The check exits unsuccessfully for a missing view, incompatible row layout, or connection failure. A local build alone cannot detect an outdated Maincloud deployment. Keep the backend, generated bindings, and frontend on compatible versions; generating bindings does not publish a database update. Never delete database data to fix a branch mismatch.

```powershell
npm test
npm run typecheck
npm run build
```

`npm test` checks authentication policy and uses the SDK's real test datastore to verify private profiles, six-slot generation, atomic completion and exactly-once rewards, stale-assignment rejection, cooldown boundaries, repeat fallback, catalogue exhaustion, player isolation, persistent XP/history, and the full complete-refresh-complete loop. UI tests cover the single quest grid, completion readiness, countdowns, historical XP, missing templates, and loading/empty/offline/error states. Subscription tests verify cache updates, replay, failures, and cleanup. Timer tests check persisted deadlines, clock skew, and throttled retries. `typecheck` checks both frontend and backend TypeScript. `build` runs those checks and builds the frontend into `dist/`. `npm run preview` serves that production build locally. These checks do not publish or complete a real Google login.

To verify F02 end to end:

1. Sign in with Google and open **Account details**. Record the account ID.
2. Refresh: the same account ID and XP must return without a new login.
3. Open a second tab, then sign out: both tabs must lose access to account data.
4. Sign in again with the same Google account: the account ID must match.
5. Sign in with a different Google account: it must have a different account ID and separate progression.
6. Cancel a sign-in: the app must display an error with a working retry action.

## Project structure

```text
Quest/
  src/
    App.tsx                 React interface
    main.tsx                Database connection and React entry point
    auth/                   SpacetimeAuth session, login/logout, and private account UI
    layout/                 Shared header, navigation, and page outlet
    pages/                  Dashboard, map, questboard, journal, and profile routes
    player/                 Persistent player profile provider
    questboard/             Initialization, managed quest subscriptions, photo proof, and shared quest UI
    location/               Opt-in location watching and nearby-place loading for local quests
    map/                    MapLibre rendering, styling, configuration, and location projection
    module_bindings/        Generated SpacetimeDB client bindings
  spacetimedb/
    src/index.ts            Tables, private account view, reducers, and lifecycle hooks
    src/auth-policy.ts      Trusted issuer and client audience checks
    src/player-profile.ts   Username validation and shared level calculation export
    src/quest-model.ts      Template/slot/history tables, fixed layout, and validation
    src/quest-seeds.ts      Twenty-one reusable templates (seven per difficulty)
    src/quest-locations.ts  Six curated geographic quests with verified site coordinates
    src/quest-config.ts     Cooldowns, local-quest bands, and photo-check limits
    src/quest-selection.ts Shared active-template selection and repeat preference
    src/quest-completion.ts Atomic completion history, XP, and cooldown transition
    src/quest-refresh.ts    Server-authoritative lazy slot replacement
    src/local-quests.ts     Bestiary, Exploration and Crafting quests generated from nearby places
    src/bounties.ts         Bestiary bounty targets for each kind of place and difficulty
    src/guilds.ts           Guild tables, membership rules, and roster/directory helpers
    src/guild-quests.ts     Shared weekly guild quests, progress, contributions, and rewards
    src/quest-area.ts       Quest-area reloads and photo-check transactions
    src/photo-judge.ts      AI judge prompt, image checks, and verdict parsing
    package.json            Database module dependencies
  shared/progression.ts     Level thresholds and XP progress shared by server and React
  shared/nearby-places.ts   OpenStreetMap query, place parsing and validation, area settings
  shared/geo.ts             Distance and coordinate helpers
  .env.example              Shared frontend connection settings
  spacetime.json            CLI database, server, and module configuration
  package.json              Frontend dependencies and root development commands
  AGENTS.md                 Project guidance and SpacetimeDB reference
  tests/                    Authentication and private-player tests
```

## MVP priorities

1. Persistent player profiles and the template/slot/history schema in SpacetimeDB.
2. Generate a personal six-slot Questboard, complete quests, award XP once, and refill slots after cooldowns.
3. Questboard and journal interfaces plus a fantasy-styled geographic map.
4. Responsive styling and a reliable end-to-end demo.

Keep rewards and completion validation in reducers, authorize with `ctx.sender`, and synchronize the UI through subscriptions. Friends, guilds, and parties are stretch goals after the core flow works.
