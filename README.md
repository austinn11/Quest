# Quest

Quest turns real-world activities into fantasy RPG quests. Adventurers will discover nearby challenges, accept them into a quest journal, and earn XP as they complete them.


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
| `/questboard` | Available quests placeholder |
| `/journal` | Personal quests placeholder |
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

## Quest backend (F05)

Quest definitions and player participation are separate private tables:

| Table | Contents | Read access |
| --- | --- | --- |
| `quests` | ID, creator, title, description, category, difficulty, reward, optional coordinates, scope, and creation time | `quest_catalog` exposes shared quests plus the caller's personal quests |
| `player_quest_progress` | Player/quest key, player identity, quest ID, status, acceptance/completion times, and reward snapshot | `my_quest_progress` exposes only the caller's records |

Categories are Exploration, Bestiary, and Crafting. Difficulties and server-assigned rewards are Easy (50 XP), Medium (100 XP), and Hard (200 XP). A quest is **Available** to a player when it has no progress record; stored progress statuses are **Active** and **Completed**. Accepting a shared quest never changes its definition or another player's progress.

- `createQuest({ title, description, category, difficulty, location? })` creates a personal quest for `ctx.sender`. It accepts no owner, visibility, or XP reward from the browser. IDs are generated by the reducer context.
- `acceptQuest({ questId })` creates an Active record for the authenticated player. The primary key is derived from the player's identity and quest ID. Repeating an Active acceptance is idempotent; a Completed record cannot be reset by accepting it again.
- Quest titles must have 3–100 characters and descriptions 10–2,000 characters. Optional locations contain a 1–120 character name and finite latitude/longitude within geographic bounds. Text is trimmed before storage.
- Quest indexes cover creator, scope, category, and difficulty. Progress indexes cover player identity and quest ID; the primary key prevents duplicate participation. Reads and mutations enforce ownership on the server.

Three fixed shared samples cover all categories and difficulties: **Scout the Campus**, **Keep a Field Journal**, and **Freshly Baked**. They seed on initial publication and connection, using stable IDs and inserting only missing records. This also seeds an existing database after an upgrade, without resetting quests or player progress. The bootstrap only inserts these fixed shared definitions; it cannot create arbitrary quests or award XP.

Frontend bindings expose `tables.questCatalog`, `tables.myQuestProgress`, `reducers.createQuest`, and `reducers.acceptQuest`. The Questboard and Journal UI can use these subscriptions in the next feature slice. F05 reserves the completion state and snapshots rewards, but acceptance itself never awards XP; completion/reward reducers come later.

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

`npm test` checks authentication policy and uses the SDK's real test datastore to verify per-player views, persistent usernames, quest validation and visibility, independent shared-quest acceptance, idempotency, XP preservation, and level boundaries. `typecheck` checks both frontend and backend TypeScript. `build` runs those checks and builds the frontend into `dist/`. `npm run preview` serves that production build locally. These checks do not publish or complete a real Google login.

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
    module_bindings/        Generated SpacetimeDB client bindings
  spacetimedb/
    src/index.ts            Tables, private account view, reducers, and lifecycle hooks
    src/auth-policy.ts      Trusted issuer and client audience checks
    src/player-profile.ts   Username validation and derived level rules
    src/quest-model.ts      Quest/progress tables, enums, validation, rewards, and samples
    package.json            Database module dependencies
  .env.example              Shared frontend connection settings
  spacetime.json            CLI database, server, and module configuration
  package.json              Frontend dependencies and root development commands
  AGENTS.md                 Project guidance and SpacetimeDB reference
  tests/                    Authentication and private-player tests
```

## MVP priorities

1. Player profiles, quests, and per-player quest progress in SpacetimeDB.
2. Accept a quest, complete it, award XP exactly once, and retain progress after refresh.
3. Personal quest creation, Questboard discovery, and a fantasy-styled geographic map.
4. Responsive styling and a reliable end-to-end demo.

Keep rewards and completion validation in reducers, authorize with `ctx.sender`, and synchronize the UI through subscriptions. Friends, guilds, and parties are stretch goals after the core flow works.
