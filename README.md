# Quest

**Nature really is just like an RPG. You just haven't looked at it like that until now.**

Quest is a fantasy RPG where the quests happen in real life. Every adventurer gets a personal Questboard of quests set around them: explore a park, photograph a heron at the pond, sketch a local landmark, bake bread from scratch. Complete a quest by taking a photo, and an AI judge checks your proof before awarding XP.

Built in 24 hours at HackUTD.

## Features

### Individual quests
- A personal **Questboard** of six paper notices: 3 Easy, 2 Medium, 1 Hard.
- Players never create or accept quests. The board assigns them, and completed quests go on cooldown (2, 6 or 12 hours) before being replaced.
- Two free **rerolls** a day to swap out a quest you can't do.
- **Adventure regions:** search a city or use your location and choose a radius. Quests are then set at real nearby places from OpenStreetMap, such as parks, lakes, viewpoints, museums, monuments and public art.

### Three quest types
| Type | What you do |
| --- | --- |
| **Exploration** | Visit real places and photograph what you find. |
| **Bestiary** | Find and photograph wildlife and plants. Each one is saved to your Bestiary. |
| **Crafting** | Make something by hand, such as a sketch, a map, a paper charm or a loaf of bread. |

### AI photo proof
- **Complete quest** opens the camera on a phone, or a file picker on desktop.
- Google Gemini compares the photo with the quest's goal. It ignores any text written in the photo, and anything other than a clear acceptance counts as a rejection.
- Checks are rate limited per player, and all rewards are granted on the server.

### Interactive map
A MapLibre map of your active quests and the places you've completed. You can jump between map markers, Questboard notices and Journal entries.

### Player progression
- Each quest type is a skill with its own XP, levels up to 50, and titles from *Beginner* to *Mythic*.
- Your Adventurer level comes from the three skills combined.
- The **Quest Journal** and **Bestiary** keep every accomplishment and capture, with search, filters and favorites.
- A profile with your username, profile picture and progress.

### Guilds and friends
- Found or join a **guild** and take on shared guild quests.
- Add **friends** and form **parties** to complete quests together.

## Tech stack

| Layer | Technology |
| --- | --- |
| Database and backend | [SpacetimeDB](https://spacetimedb.com) TypeScript module: tables, reducers, views and procedures |
| Authentication | SpacetimeAuth (OpenID Connect, sign in with Google) |
| AI photo judge | Google Gemini (`gemini-2.5-flash`, with a fallback model) |
| Places and search | OpenStreetMap via the Overpass API; Open-Meteo geocoding |
| Frontend | React 18, TypeScript, Vite, React Router |
| Map | MapLibre GL with OpenFreeMap tiles |
| Tests | Node's test runner with SpacetimeDB's module test harness |

### How it works
- **The database is the game server.** All game rules (completion, XP, cooldowns, rerolls, guilds, parties) run in SpacetimeDB reducers, checked against the signed-in player (`ctx.sender`). A repeated request never awards XP twice.
- **Private by default.** Player data lives in private tables, and each player reads only their own rows through per-player views. Nobody can see another player's location, photos or history.
- **Live updates.** Clients subscribe to their views, so the Questboard, map, Journal and guild pages update the moment something changes.
- **AI calls in procedures.** Reducers can't make network calls, so the photo judge runs in a SpacetimeDB procedure and then records the result in a transaction.

## Getting started

### Prerequisites
- Node.js 22.12+ (or 24+)
- [SpacetimeDB CLI](https://spacetimedb.com/install) 2.14.x

### Install and run
```bash
npm ci
npm --prefix spacetimedb ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173 and choose **Continue with Google**. By default the app connects to the team's Maincloud database, `quest-db`.

### Run your own local backend
```bash
spacetime start
```

In a second terminal, publish the module. Set `AI_API_KEY` to a Gemini API key to turn on the AI judge; without it, any valid photo is accepted.
```bash
AI_API_KEY="<your Gemini key>" npm run spacetime:publish:local
```

Then point `.env.local` at the local server and restart `npm run dev`:
```dotenv
VITE_SPACETIMEDB_HOST=http://127.0.0.1:3000
VITE_SPACETIMEDB_DB_NAME=quest-db
```

Never commit API keys. Pass `AI_API_KEY` only as a shell variable when publishing.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the frontend at http://localhost:5173 |
| `npm test` | Run the full test suite |
| `npm run build` | Type-check the frontend and backend, then build for production |
| `npm run spacetime:generate` | Regenerate client bindings after changing tables or reducers |
| `npm run spacetime:publish:local` | Publish the module to a local SpacetimeDB server |
| `npm run spacetime:publish` | Publish the module to Maincloud (shared; coordinate with the team) |

## Project structure
```text
src/                 React app: pages, Questboard, map, guilds, social, profile
src/module_bindings/ Generated SpacetimeDB client bindings (do not edit)
spacetimedb/src/     Backend module: tables, reducers, views, AI judge, quest generation
shared/              Code shared by server and client: progression, places, geography
tests/               Backend and UI tests
docs/                Technical reference and curated map locations
```

## Documentation
The [technical reference](docs/TECHNICAL.md) covers each system in detail: authentication setup, XP and leveling, quest selection, cooldowns and rerolls, adventure regions, the AI judge, guilds, parties, and data privacy.

## License
[Apache 2.0](LICENSE)
