# Quest

Quest turns real-world activities into fantasy RPG quests. Adventurers will discover nearby challenges, accept them into a quest journal, and earn XP as they complete them.

Built for HackUTD with React, TypeScript, Vite, and SpacetimeDB as the primary backend. The repository currently contains the connected SpacetimeDB starter; quest gameplay, progression, and mapping are the next milestones.

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

Optionally copy `.env.example` to `.env.local` to override frontend settings. If `.env.local` already exists, edit it rather than replacing it:

```powershell
Copy-Item .env.example .env.local
```

The defaults connect to Maincloud's `quest-db`:

```dotenv
VITE_SPACETIMEDB_DB_NAME=quest-db
VITE_SPACETIMEDB_HOST=https://maincloud.spacetimedb.com
```

These are browser-visible connection settings. Never store secrets in `VITE_` variables. Local environment files are ignored by Git; `.env.example` is the shared template.

The frontend uses these defaults even without an environment file. `spacetime.json` configures the same database, server, and module directory for the CLI. If you change databases, update the frontend environment and CLI configuration together. `spacetime.local.json` is a CLI-managed local override and is ignored by Git.

## Run the frontend

```powershell
npm run dev
```

Open the URL Vite prints, normally http://localhost:5173. Leave the terminal running.

Maincloud hosts the backend, so a local `spacetime start` process is unnecessary for this setup. The starter page should report Connected and let you add a person. Reload to confirm the record persists. The identity token is stored in this browser's local storage; clearing it or changing the connection settings can give you a different identity.

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
npm run typecheck
npm run build
```

`typecheck` checks both frontend and backend TypeScript. `build` runs those checks and builds the frontend into `dist/`. `npm run preview` serves that production build locally. These checks do not publish or verify live database connectivity.

## Project structure

```text
Quest/
  src/
    App.tsx                 React interface
    main.tsx                Database connection and React entry point
    module_bindings/        Generated SpacetimeDB client bindings
  spacetimedb/
    src/index.ts            Database tables, reducers, and lifecycle hooks
    package.json            Database module dependencies
  .env.example              Shared frontend connection settings
  spacetime.json            CLI database, server, and module configuration
  package.json              Frontend dependencies and root development commands
  AGENTS.md                 Project guidance and SpacetimeDB reference
```

## MVP priorities

1. Player profiles, quests, and per-player quest progress in SpacetimeDB.
2. Accept a quest, complete it, award XP exactly once, and retain progress after refresh.
3. Personal quest creation, Questboard discovery, and a fantasy-styled geographic map.
4. Responsive styling and a reliable end-to-end demo.

Keep rewards and completion validation in reducers, authorize with `ctx.sender`, and synchronize the UI through subscriptions. Friends, guilds, and parties are stretch goals after the core flow works.
