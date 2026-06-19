# World Cup 2026 — Group Stage Predictor & Bracket

A single-page tool to predict the 2026 FIFA World Cup. Enter scorelines for the
group stage and the standings recompute live; the best third-placed race and a
fully interactive knockout bracket follow automatically. Plain HTML/CSS and
vanilla JavaScript — no build step, no dependencies.

## Features
- **All 12 groups (A–L)** from the official 2026 draw, full round-robin (6
  matches each), with the European/intercontinental playoff winners filled in
  (Sweden, Czechia, Turkey, Bosnia, Iraq, DR Congo).
- **Two input modes** — predict each match by exact **Scoreline**, or by
  **Win / Draw / Loss** (1·X·2). Toggle at the top.
- **Live standings** with FIFA tiebreakers: points → goal difference → goals
  for → head-to-head → name.
- **Best third-placed teams** panel ranking all 12 thirds; the top 8 advance.
- **Interactive knockout bracket** using the official 2026 structure (Round of
  32 → Final, plus third-place match). Group winners, runners-up, and the 8 best
  thirds seed automatically; **click a team to advance it** round by round, up to
  a crowned champion.
- **Crisp SVG flags** for every team (via flagcdn, with proper England/Scotland
  flags), plus card/champion/hero animations.
- **Leaderboard (local):** submit predictions under a username to lock them in;
  scored live vs actual results — **30** for an exact score, **10** for the right
  result (W/D/L picks cap at 10). Each entry has a green/gold/red scorecard.
- **Editable team names** (click any name), plus **Randomize** and **Reset**.
- Predictions and bracket picks **auto-save** in the browser (localStorage).

## Run it
Open `index.html` in any browser — that's it.

```
open index.html
```

## Live data
Actual match results come from the community-maintained
[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
project — **no API key**. In the app, click **"📥 Actual results"** to fill in
the scores played so far; the standings and bracket update from them.

A scheduled GitHub Action (`.github/workflows/update-data.yml`) re-runs
`scripts/fetch-live-data.js` every 6 hours, regenerates `live-data.js`
(`window.WC_LIVE`) + `data/live-data.json`, and commits so Pages redeploys. The
only setup required is to let the Action push: **Settings → Actions → General →
Workflow permissions → Read and write permissions**.

## Shared leaderboard (optional)
By default the leaderboard is local to each device. To make it shared across
everyone, point it at a free [Supabase](https://supabase.com) project:

1. Create a free Supabase project.
2. In the **SQL Editor**, run:
   ```sql
   create table if not exists submissions (
     id uuid primary key default gen_random_uuid(),
     username text not null,
     created_at timestamptz not null default now(),
     mode text,
     payload jsonb not null
   );
   alter table submissions enable row level security;
   create policy "anyone can read"   on submissions for select using (true);
   create policy "anyone can insert" on submissions for insert with check (true);
   ```
3. **Settings → API**: copy the **Project URL** and the **anon/public** key.
4. Put both into `supabase-config.js`. The anon key is public by design; access
   is governed by the RLS policies above (read + insert only — no edits/deletes).

When configured, the app shows “🌐 Shared leaderboard”, submissions go to the
database, and it polls every 45s (plus a **↻ Refresh** button). Blank config =
local-only (“💾 This device”).

## Group leaderboards / pools (optional, shared mode only)
On top of the **🌐 Global** board you can run private **pools** — a pool is just
a shared code (e.g. `FAMILY`). The same brackets and scoring apply; a pool board
is the global list filtered to its members. Membership is many-to-many, so a
person can be in several pools and still rank globally.

- **Setup:** run `scripts/groups-setup.sql` once in the Supabase SQL editor (in
  addition to the `submissions` table above). It adds a `groups` table, a
  `memberships` table, and a `join_or_create_group()` function, and it moves
  every **existing** bracket into a pool called **Family**.
- **Who can create pools:** only the **admin** — the email set as `admin_email`
  in `scripts/groups-setup.sql` (and `ADMIN_EMAIL` in `app.js`). Change both to
  your own Google sign-in address. Everyone else can only **join** a pool that
  already exists, using its code (and password, if set).
- **Passwords:** pools can be password-protected. The password is checked
  server-side and is never readable by clients. Set one when you create the pool
  (admin only). To add/change a password later, run in the SQL editor:
  ```sql
  update groups set pass_hash = crypt('your-password', gen_salt('bf')) where code = 'FAMILY';
  ```
- **Joining / sharing:** use the **＋ Pool** tab to enter a code, or share an
  invite link (`?group=CODE`) — opening it auto-joins (prompting for the
  password if needed). Switch boards with the pool tabs above the table.

## Install as an app (PWA)
The site is a Progressive Web App — open it on your phone and choose **"Add to
Home Screen"** to install it; it launches full-screen and works offline (a
service worker caches the app shell; live results are fetched network-first).

## Testing
- **Unit tests** cover the pure tournament logic in `lib/engine.js` (scoring,
  standings, FIFA tiebreakers) using Node's built-in runner — no install:
  ```
  node --test          # or: npm test
  ```
- **End-to-end** (optional) uses Playwright against the served site:
  ```
  npm i -D @playwright/test && npx playwright install
  npm run test:e2e
  ```
- **CI**: `.github/workflows/ci.yml` runs the unit tests on every push/PR.

## Notes
- Default lineups follow the published draw; playoff slots resolve once those
  qualifiers are known. Every team name is editable.
- Fan-made; not affiliated with FIFA. "World Cup Stars of Soccer" montage by
  The Athletic.
