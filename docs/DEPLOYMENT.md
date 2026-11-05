# MYTHOS deployment guide

> Status: **nothing has been deployed yet.** Everything below runs locally today. The
> cloud steps need your own accounts. No credentials have been created or invented.

## 0. What works where

| Setup | Status | Notes |
| --- | --- | --- |
| Local dev (`npm run dev`) | ✅ working, tested | Single machine |
| LAN play (`npm start`) | ✅ working | Friends on the same network open `http://<your-ip>:3001` |
| Frontend on Vercel + Node server on a host with WebSockets | ✅ possible today | Option A below |
| Supabase + Vercel (no server to run) | 🟡 schema, RLS and seed done, game adapter **not yet** | Option B below |

Vercel does **not** host long-running WebSocket servers, so the local game server can't run
*on* Vercel. You can either put the game server on a WebSocket-capable host (Option A), or finish
the Supabase adapter (Option B).

---

## 1. Push to GitHub (needed for both options)

The project is already a local git repository with an initial commit.

1. On GitHub, click **New repository**. Name it `mythos`, keep it **Private**, and don't add a README, .gitignore or license.
2. In a terminal inside the project folder:

   ```bash
   git remote add origin https://github.com/<your-user>/mythos.git
   git branch -M main
   git push -u origin main
   ```

`.data/` (database and session secret), `.env*` and `dist/` are git-ignored, so they won't be pushed.

---

## 2. Option A: Vercel frontend + Node game server (works today)

### 2a. Game server (Render example; Railway and Fly.io work the same way)

1. On https://render.com, click **New**, then **Web Service**, and connect the GitHub repo.
2. Use these settings:
   - Runtime: **Node**
   - Build command: `npm ci && npm run build`
   - Start command: `npm run serve`
   - Instance: any. For persistent accounts and stats, add a **Persistent Disk** mounted at `/var/data`.
3. Set these environment variables in Render, under **Environment**:

   | Variable | Value |
   | --- | --- |
   | `MYTHOS_DATA_DIR` | `/var/data` (the disk mount path) |
   | `MYTHOS_SESSION_SECRET` | a random string with 32+ characters (for example, from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `MYTHOS_CORS_ORIGINS` | your Vercel URL, for example `https://mythos.vercel.app` |

   Render sets `PORT` automatically. The server reads it.
4. Deploy and copy the service URL, for example `https://mythos-api.onrender.com`.

On its own, this service is a complete deployment: it serves the built app plus the API and WebSocket at
that URL. Vercel is only needed if you want the frontend on Vercel's CDN.

### 2b. Frontend on Vercel

1. On https://vercel.com, click **Add New**, then **Project**, and import the GitHub repo.
2. Vercel detects Vite from `vercel.json`. Build command: `npm run build`. Output: `dist`.
3. Under **Settings**, then **Environment Variables**, add the following for Production and Preview:

   | Variable | Value |
   | --- | --- |
   | `VITE_BACKEND` | `local` |
   | `VITE_API_URL` | `https://mythos-api.onrender.com` (your server URL, without a trailing slash) |

4. Click **Deploy**. Share the Vercel URL with friends.

---

## 3. Option B: Supabase + Vercel (serverless; remaining work listed)

### 3a. What is already done

- `supabase/migrations/20261105000000_mythos_init.sql` contains the tables (`profiles`, `rooms`, `room_players`, `questions`,
  `matches`, `match_questions`, `answers`, `player_stats`, `leaderboard_entries`), keys, unique constraints,
  indexes, the new-user trigger, **Row Level Security** and the Realtime publication.
- `supabase/seed.sql` contains the 109 seed questions (regenerate with `npm run seed:supabase`).
- `tests/supabase-rls.test.ts` applies the migration and seed to Postgres with a stub `auth` schema and verifies that:
  - questions and answer keys are unreadable by clients
  - private rooms are visible only to members
  - clients can't write rooms, answers, stats or XP
  - players can edit only their own username and avatar
- `shared/rules.ts` contains the scoring, validation and ranking logic. It has no Node or DOM dependencies, so Edge Functions (Deno) can import it as-is.

### 3b. Setup steps you will perform

1. Go to https://supabase.com/dashboard, click **New project**, and choose a name, database password and region.
2. In **SQL Editor**, click **New query**, paste the full migration file, and click **Run**. Then do the same with `supabase/seed.sql`.
3. Under **Authentication**, then **Providers**:
   - **Email**: enabled. You can turn off "Confirm email" for faster testing.
   - **Anonymous sign-ins**: enable this for "Play as guest". It's under **Authentication**, then **Sign In / Providers**.
4. Under **Project Settings**, then **API**, copy:
   - **Project URL**, which goes in `VITE_SUPABASE_URL`
   - the **anon public** key, which goes in `VITE_SUPABASE_ANON_KEY`
   - Never copy the `service_role` key into Vercel or any `VITE_*` variable. Edge Functions receive it automatically.
5. In Vercel, set `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### 3c. Remaining engineering work for Option B (not implemented yet)

1. **Edge Functions** in `supabase/functions/` (Deno, using the service role) that port `server/src/game/engine.ts`:
   `create-room`, `join-room`, `quick-play`, `update-settings`, `kick`, `start-match`
   (select and shuffle questions), `submit-answer` (validate, then `scoreAnswer`, then insert with the unique
   constraint), `advance-match` (opens and closes rounds by `matches.phase_ends_at`, using `select … for update`),
   and `finalize-match` (stats, leaderboard and XP in one transaction).
2. **Server clock**: schedule `advance-match` every second with `pg_cron` and `pg_net`, and also let any client call it
   when its local timer expires. The function is idempotent and time-checked, so this can't be abused.
3. **Frontend adapter** `src/lib/api/supabase.ts` implementing the `Backend` interface in
   `src/lib/api/types.ts`: Supabase Auth for login, register and guest; Edge Function calls for actions;
   Realtime `postgres_changes` on `rooms`, `room_players` and `matches`; Presence for connection dots; and
   Broadcast for "player answered" pings. It then refetches a sanitized state view after each event.
4. **Integration tests** against a real Supabase project, run with the Supabase CLI (requires Docker) or a staging project.

Until that work is done, use Option A for online play.

---

## 4. Environment variables: where each one belongs

| Variable | Where | Secret? |
| --- | --- | --- |
| `VITE_BACKEND` | `.env.local` / Vercel env | No (public) |
| `VITE_API_URL` | `.env.local` / Vercel env | No (public) |
| `VITE_SUPABASE_URL` | `.env.local` / Vercel env (Option B) | No (public) |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` / Vercel env (Option B) | No (public, protected by RLS) |
| `MYTHOS_SESSION_SECRET` | Game server host env only | **Yes** |
| `MYTHOS_DATA_DIR`, `PORT`, `MYTHOS_CORS_ORIGINS`, `MYTHOS_MIN_PLAYERS` | Game server host env | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only (auto-injected) | **Yes**. Never put it in the frontend. |
