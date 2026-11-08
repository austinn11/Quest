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
| `/map` | World Map placeholder |
| `/questboard` | Personal six-slot Questboard |
| `/journal` | Completed adventures and historical XP |
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

On the first authenticated connection, the app creates a private player record. The profile shows your username, total XP, derived level, join date, and account ID. The existing `xp` column holds cumulative total XP; level is calculated on the server as `1 + floor(xp / 100)`, with level 1 at zero XP.

Choose an adventurer username in the profile, then use **Edit username** to change it. Usernames use 3 to 24 ASCII letters, numbers, or underscores. Capitalization is preserved for display, but uniqueness is checked without regard to case. A rename releases the old name. Duplicate or invalid names are rejected by the server without changing the saved profile.

`setUsername` accepts only a username and updates the player identified by `ctx.sender`; it cannot change another account, XP, or creation time. Existing profiles receive empty username fields during migration and can choose a name when they next open the app. The private normalized username index enforces availability inside a transaction. Only the public spelling is returned in the per-user view.

To check F03 in the browser, choose a name, refresh, edit it, and sign out/back in. The saved name should return. With a second Google account, choose a different name and confirm both accounts retain their own names. Trying the first account's name (including different capitalization) should display an availability error.

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

Categories are Exploration, Bestiary, and Crafting. Difficulty rewards remain server-controlled: Easy 50 XP, Medium 100 XP, Hard 200 XP. Fifteen templates seed idempotently, with five choices per difficulty. Existing records and inactive flags are preserved on reseeding. Inactive templates remain readable for resolving historical references, but validation rejects them for new Available assignments.

Slot IDs are derived from the player identity and position, so future reducers can address one row per position. Validation helpers enforce positions 0?5, the 3/2/1 difficulty layout, matching template references, and coherent timestamps. Available slots have no completion or refresh timestamp; Cooldown slots retain the completed template and require both timestamps. The future cooldown implementation will choose the difficulty-specific durations.

Completion rows are independent of slots and may reference the same template across different completed assignments. Their XP and time are historical snapshots; replacing a slot does not rewrite them. Validation rejects mismatched owners, templates, positions, times, and rewards.

Frontend bindings expose `tables.questTemplates`, `tables.myQuestSlots`, and `tables.myQuestCompletions`. Players cannot create or accept quests. Completion, cooldown refresh, and XP awarding are subsequent features.

Generation must use `slotDifficulty`, `slotIdFor`, and `validateSlot`; future completion logic must validate its transition and append a history row atomically with the XP award. Templates should be deactivated rather than deleted when history refers to them. Avoiding simultaneous duplicates does not mean excluding every historically completed template forever.

## Questboard initialization (F06)

After sign-in, React waits for the private player profile subscription, then calls `initializeQuestboard()` with no arguments. The reducer verifies SpacetimeAuth and the existing player using `ctx.sender`. It assigns exactly three Easy, two Medium, and one Hard template from the active catalogue, without duplicates. The frontend supplies no identity, difficulty, template, or XP values.

Selection uses SpacetimeDB's supported, deterministic server RNG (`ctx.random.integerInRange`), documented in the [reducer context reference](https://spacetimedb.com/docs/functions/reducers/reducer-context/). The most recently completed template is avoided when alternatives exist; it can be used if necessary to fill the board without duplicates. Templates are never permanently excluded just because they appear in history.

All six assignments are committed in one transaction. Insufficient active templates produce an error and leave no partial board. Repeated calls and reconnections preserve an existing complete board, including cooldown slots and templates that have since been deactivated. A partial or malformed board produces an error and is preserved for repair rather than being silently regenerated. There is no reroll endpoint.

`QuestboardProvider` remains mounted across navigation, owns subscriptions to `my_quest_slots` and `quest_templates`, and initializes after profile creation. `/questboard` displays the six assigned objectives, categories, difficulties, statuses, and template XP, with loading and retryable error states. Slot rows are private; each player subscribes only to their own view.

To verify F06 manually, sign in and open **Questboard**. Confirm six distinct quests in the 3/2/1 layout, then refresh and sign out/back in: the same assignments must return. A different Google account should receive its own board; two players may share templates, but their slot records remain independent. Completing quests and refilling cooldown slots are not implemented yet.

## Questboard and Journal UI (F07)

The Questboard displays current assignments in a single grid: two rows of three cards on desktop, two columns on narrower screens, and one column on mobile. Each card resolves its title, objective, category, difficulty, and reward from the SpacetimeDB catalogue. **Inspect quest** expands assignment dates and optional location coordinates. Cooldown cards display their stored state and completion/replacement-eligibility dates when present; F07 does not calculate countdowns or trigger replacements.

The Quest Journal shows only historical completions, newest first, with repeated completions preserved as separate accomplishments. Earned XP comes from each completion's `xp_awarded` snapshot, rather than the template's current reward. Dates come from `completed_at`; titles and objectives resolve through the catalogue, including inactive templates. Missing templates do not hide saved assignments or erase historical XP and dates.

A single managed subscription in `QuestboardProvider` reads `quest_templates`, `my_quest_slots`, and `my_quest_completions`. It stays mounted across page navigation, listens for inserts/updates/deletes, and waits for `onApplied` before treating data as current. The SDK replays the same subscription on reconnect. Subscription failures have a retry action, and disconnected or resyncing pages label any cached records as potentially stale. The Journal can load independently of a board-initialization error.

Both pages include loading and empty states and links to one another. The Journal will initially be empty because F08 has not introduced quest completion yet. Completion and XP mutations remain server-side work for F08; refresh scheduling belongs to F09. F07 adds no backend reducers or schema changes.

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

```powershell
npm test
npm run typecheck
npm run build
```

`npm test` checks authentication policy and uses the SDK's real test datastore to verify per-player views, persistent usernames, quest validation and visibility, six-slot generation, inactive-template exclusion, repeat avoidance and fallback, atomic failure/retry, reconnect persistence, owner isolation, idempotent seeding, XP preservation, and level boundaries. UI tests cover the single quest grid, expandable details, cooldown dates, historical ordering and awarded XP, missing templates, and loading/empty/offline/error states. Subscription tests verify live cache updates, replay, failures, and listener cleanup. `typecheck` checks both frontend and backend TypeScript. `build` runs those checks and builds the frontend into `dist/`. `npm run preview` serves that production build locally. These checks do not publish or complete a real Google login.

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
    questboard/             Initialization, managed quest subscriptions, and shared quest UI
    module_bindings/        Generated SpacetimeDB client bindings
  spacetimedb/
    src/index.ts            Tables, private account view, reducers, and lifecycle hooks
    src/auth-policy.ts      Trusted issuer and client audience checks
    src/player-profile.ts   Username validation and derived level rules
    src/quest-model.ts      Template/slot/history tables, fixed layout, and validation
    src/quest-seeds.ts      Fifteen reusable templates (five per difficulty)
    package.json            Database module dependencies
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
