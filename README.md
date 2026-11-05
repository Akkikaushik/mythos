# MYTHOS — Multiplayer Anime Quiz Battle Arena

Real-time multiplayer quiz battles for 1–20 players per room: private rooms with
6-character codes and invite links, a live public room browser, quick-play
matchmaking, server-timed rounds, server-side scoring, live leaderboards, XP and levels,
and daily, weekly and all-time rankings.

The current build runs **fully locally with no external accounts**:

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind CSS 3 |
| Backend | Node (TypeScript via `tsx`), native HTTP + `ws` WebSocket |
| Database | PostgreSQL 16 running in-process via [PGlite](https://pglite.dev), persisted to `./.data` |
| Shared logic | `shared/rules.ts` (scoring, validation, ranking, XP), used by server and client |
| Cloud path (prepared) | `supabase/migrations` (schema + RLS, verified), `supabase/seed.sql` |

## Quick start

Requirements: Node.js 18.18+ (tested on Node 24) and npm.

Full step-by-step guide with troubleshooting: [docs/RUN_LOCALLY.md](docs/RUN_LOCALLY.md).

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. `npm run dev` starts both:

- the game server on `http://localhost:3001` (creates `./.data/`, loads the 109-question seed on first run)
- the Vite dev server on `http://localhost:5173` (proxies `/api` and `/ws` to the game server)

### Play with friends on your network (LAN)

```bash
npm start            # builds the frontend, then serves app + API on port 3001
```

The server prints addresses like `http://192.168.1.38:3001`. Friends on the same Wi-Fi
open that URL. If Windows Firewall asks, allow Node.js on **private** networks.

### Try a multiplayer battle on your own

Create a room in the browser, then in a second terminal:

```bash
npm run bots -- ROOMCODE 3          # 3 extra real clients join and answer randomly
```

Bots are a testing tool. They are separate HTTP + WebSocket clients with no access to correct answers.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (watch mode) + Vite |
| `npm start` | Production build + serve everything on :3001 |
| `npm run build` | Typecheck + production frontend build to `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | All automated tests (unit + multiplayer integration + Supabase RLS) |
| `npm run check` | lint + typecheck + question bank check + test + build |
| `npm run questions:check` | Validate every seed file, list duplicates, show counts per category and difficulty |
| `npm run questions:generate` | Regenerate `seed/generated/` from `seed/data/` and the maths templates |
| `npm run questions:import -- --csv FILE --out seed/imported/NAME.json` | Import a CSV question pack (or `--opentdb FILE`) |
| `npm run seed:supabase` | Regenerate `supabase/seed.sql` from all seed files |
| `npm run bots -- CODE [n] [url]` | Join `n` bot clients to room `CODE` |

## How it works

```
Browser (React)  ──HTTP──►  /api/*   auth, profiles, rooms, matchmaking, stats, rankings
                 ◄──WS───►  /ws      room state pushes, presence, lobby list, answers, host actions
                              │
                       GameEngine (authoritative, in-process timers)
                              │
                       PGlite / PostgreSQL  (.data/pgdata)
```

- **Server-authoritative match lifecycle.** The server picks questions, shuffles options per
  match, opens and closes rounds on its own timers, and advances phases
  (countdown, then question, then reveal, repeating until the match finishes). Closing a browser, including the host's, never stops a match.
- **Timer sync.** Every round carries server timestamps (`openedAt`, `closesAt`). Clients
  estimate clock offset with NTP-style ping/pong and render the same countdown.
- **Scoring (server-side only).** Correct answer: 100 points. Speed bonus: up to 50, decaying linearly over the timer. Streak bonus: +10 per consecutive
  correct answer after the first, capped at +50. Wrong answers and no answer score 0 and reset the streak.
- **Anti-cheat.** Correct answers and explanations are sent only after a round closes.
  Answers are locked on first submission, and duplicate, late (after `closesAt` plus 300 ms grace),
  wrong-question and out-of-range answers are rejected. There's a unique `(match, question, player)` DB constraint,
  host-only actions are enforced, inputs are validated, and rate limits apply per IP (auth, API) and per socket.
- **Presence and reconnection.** Connection dots update live. Disconnected players keep their seat
  and score, and reconnecting resumes the exact current state. A disconnected host's crown moves to
  the next connected player after 10 s. Empty or idle rooms are cleaned up automatically, and late
  joiners can't enter a battle in progress (no spectating).
- **Progression.** XP is 20 for participating, plus points ÷ 10, plus 100 for a win against at least one opponent. Level is `floor(sqrt(xp/100)) + 1`, with
  rank tiers Initiate, Adept, Warrior, Champion and Mythic. Solo battles count toward points and accuracy but not wins or losses.

## Project layout

```
shared/            pure game rules + wire protocol types (server & client)
server/db/         schema.sql (local Postgres schema, mirrors Supabase)
server/src/        app.ts (HTTP+WS), game/engine.ts (match engine), repo.ts, auth.ts, seed.ts
seed/              question bank (single source for local + Supabase seed)
  questions/       hand-written questions, one file per category
  generated/       built by `questions:generate` - do not edit by hand
  imported/        created by `questions:import`
  data/            datasets used by the generator (countries, elements)
src/               React app: pages/, pages/room/ (lobby, arena, results), components/, lib/api/
supabase/          migrations/ (schema + RLS), seed.sql (generated)
tests/             multiplayer, question bank (generator, importer, picker) and Supabase RLS tests
scripts/           bot players, question generator/importer/checker, Supabase seed generator
docs/DEPLOYMENT.md cloud deployment guide (Supabase + Vercel) and remaining work
```

## Question bank

1,265 questions across 13 categories, all with three difficulty levels:
Indian Mythology, World Mythology, General Knowledge, Science, Technology, History, Geography,
Sports, Movies & Entertainment, Anime, Literature, Politics & Current Affairs, and Mathematics.
"Mixed Knowledge" draws from all of them.

- **109 hand-written questions** in `seed/questions/`. Mythology questions name their tradition and source text
  (for example, `Hindu (Mahabharata)` or `Norse`). Current-affairs questions carry an `asOf` date so they can be
  reviewed and retired.
- **1,156 generated questions** in `seed/generated/`: capitals, continents and currencies (geography), element
  symbols and atomic numbers (science), and arithmetic, percentages, powers, equations, HCF/LCM and primes
  (mathematics). Answers come from `seed/data/` or are computed, and tests recheck every one independently.
- **Imported packs** in `seed/imported/`, from CSV files or Open Trivia DB exports.

The server loads all three folders on start and only reseeds when a file has changed. Edited questions are
updated in place. See [docs/RUN_LOCALLY.md](docs/RUN_LOCALLY.md#6-adding-questions) for how to add questions.

Battles spread their questions evenly across the chosen categories, so a large category such as Geography can't
crowd out the others in Mixed. When a host picks a narrow pool (for example, one category on Hard) with fewer
questions than requested, the battle is topped up with the same categories at other difficulties first, then
other categories.

## Credits

Questions in `seed/imported/` whose `src` is `Open Trivia DB (CC BY-SA 4.0)` come from
[Open Trivia DB](https://opentdb.com/) and are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). They keep that licence, including when
modified, and the attribution is stored with each question (`questions.source`). All other questions are original
to MYTHOS.

## Security notes

- Passwords are hashed with scrypt, and sessions are HMAC-SHA256-signed tokens (30-day expiry). The signing
  secret lives in `.data/session.secret`, or `MYTHOS_SESSION_SECRET` if set. It is never sent to the browser.
- The frontend bundle contains no secrets. `VITE_*` variables are public by definition.
- `.data/`, `.env*` and `dist/` are git-ignored.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). It covers what works today and the exact steps and remaining work
for Supabase and Vercel.
