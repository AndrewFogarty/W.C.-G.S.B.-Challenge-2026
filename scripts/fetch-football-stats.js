/* =====================================================================
   fetch-football-stats.js — runs in GitHub Actions (Node 20+) to refresh
   match lineups, head-to-head history, and per-player season stats from
   API-Football (api-sports.io). Requires an API key:

     APIFOOTBALL_KEY   (GitHub Actions secret, or a local env var)

   Writes:
     - data/football-data.json   (machine-readable snapshot)
     - football-data.js          (browser-loadable: sets window.WC_FOOTBALL)
     - data/football-cache.json  (team-id map + per-entity refresh times,
                                   so each run only re-fetches stale data)

   The free API-Football tier allows ~100 requests/day, so this script is
   INCREMENTAL: every run it builds a work queue of only the data that is
   stale (or missing) for the *upcoming* matches, then processes at most
   REQUEST_BUDGET requests. Run hourly, it backfills the whole field over a
   day or two and then just keeps it fresh — all without a per-visitor call,
   keeping the key server-side.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const KEY = process.env.APIFOOTBALL_KEY || process.env.API_FOOTBALL_KEY || "";
const BASE = "https://v3.football.api-sports.io";

const ROOT = path.join(__dirname, "..");
const OUT_JSON = path.join(ROOT, "data", "football-data.json");
const OUT_JS = path.join(ROOT, "football-data.js");
const CACHE_PATH = path.join(ROOT, "data", "football-cache.json");
const LIVE_PATH = path.join(ROOT, "data", "live-data.json");

/* ---- Tunables ---- */
const REQUEST_BUDGET = Number(process.env.APIFOOTBALL_BUDGET) || 4000; // max API calls per run
const DAYS_AHEAD = Number(process.env.APIFOOTBALL_DAYS) || 60; // prep matches kicking off within N days
const PLAYER_TTL_H = 24;            // refresh a squad's stats at most once/day
const H2H_TTL_H = 24 * 7;           // refresh a matchup's H2H at most weekly
const LINEUP_TTL_H = 1;             // re-check lineups hourly (they go live near KO)
const H2H_YEARS = 26;              // head-to-head lookback window

/* Our display name -> the term API-Football indexes the national team under. */
const SEARCH_NAME = {
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Côte d'Ivoire": "Ivory Coast",
  "Cabo Verde": "Cape Verde",
  "Czechia": "Czechia",
  "DR Congo": "Congo DR",
  "Bosnia": "Bosnia",
  "USA": "USA",
  "Curaçao": "Curacao",
};

/* The season API-Football files national-team data under. */
const SEASON = Number(process.env.APIFOOTBALL_SEASON) || new Date().getUTCFullYear();

let used = 0;
const log = (...a) => console.log(...a);

async function api(endpoint, params) {
  if (!KEY) throw new Error("APIFOOTBALL_KEY is not set");
  if (used >= REQUEST_BUDGET) throw new Error("__BUDGET__");
  const qs = new URLSearchParams(params || {}).toString();
  const url = `${BASE}${endpoint}${qs ? "?" + qs : ""}`;
  used++;
  const res = await fetch(url, { headers: { "x-apisports-key": KEY } });
  if (!res.ok) throw new Error(`API ${endpoint} -> ${res.status}`);
  const body = await res.json();
  if (body.errors && Object.keys(body.errors).length) {
    // rate/usage errors come back 200 with an `errors` object
    const msg = JSON.stringify(body.errors);
    if (/limit|rate|requests/i.test(msg)) throw new Error("__BUDGET__");
    log("  api warning:", msg);
  }
  return body;
}

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return fallback; }
}

function fresh(ts, ttlH) {
  return ts && Date.now() - new Date(ts).getTime() < ttlH * 3600 * 1000;
}

/* ---- Team id resolution (cached permanently once found) ---- */
async function teamId(name, cache) {
  cache.teamIds = cache.teamIds || {};
  if (cache.teamIds[name]) return cache.teamIds[name];
  const term = SEARCH_NAME[name] || name;
  const body = await api("/teams", { search: term });
  const list = (body.response || []).map((r) => r.team);
  // Senior men's national team only — drop women's (" W") and youth (U17/U20/U21/U23) sides.
  const isSenior = (t) => !/\b(W|U\d{2})\b/.test(t.name) && !/ W$/.test(t.name);
  const national = list.filter((t) => t.national && isSenior(t));
  const pick =
    national.find((t) => t.name.toLowerCase() === term.toLowerCase()) ||
    national[0] || list.filter((t) => t.national)[0] || list[0];
  if (pick) { cache.teamIds[name] = pick.id; return pick.id; }
  log("  could not resolve team id for", name);
  return null;
}

/* ---- Per-player season stats for a squad ---- */
async function fetchSquad(name, id) {
  const players = [];
  let page = 1, total = 1;
  do {
    const body = await api("/players", { team: id, season: SEASON, page });
    total = (body.paging && body.paging.total) || 1;
    for (const item of body.response || []) {
      const p = item.player || {};
      // Sum across all competitions the player featured in this season, and
      // separately track this World Cup (league id 1) goals/assists.
      let games = 0, minutes = 0, goals = 0, assists = 0, yellow = 0, red = 0, fouls = 0;
      let wcGoals = 0, wcAssists = 0;
      let pos = "", number = null;
      for (const s of item.statistics || []) {
        games += (s.games && s.games.appearences) || 0;
        minutes += (s.games && s.games.minutes) || 0;
        goals += (s.goals && s.goals.total) || 0;
        assists += (s.goals && s.goals.assists) || 0;
        yellow += (s.cards && s.cards.yellow) || 0;
        yellow += (s.cards && s.cards.yellowred) || 0;
        red += (s.cards && s.cards.red) || 0;
        fouls += (s.fouls && s.fouls.committed) || 0;
        if (s.league && s.league.id === 1) { // the World Cup tournament itself
          wcGoals += (s.goals && s.goals.total) || 0;
          wcAssists += (s.goals && s.goals.assists) || 0;
        }
        if (!pos && s.games && s.games.position) pos = s.games.position;
        if (number == null && s.games && s.games.number != null) number = s.games.number;
      }
      const per = (v) => (games > 0 ? +(v / games).toFixed(2) : 0);
      players.push({
        id: p.id,
        name: p.name || [p.firstname, p.lastname].filter(Boolean).join(" "),
        photo: p.photo || (p.id ? `https://media.api-sports.io/football/players/${p.id}.png` : ""),
        pos, number,
        games, minutes, goals, assists, yellow, red, fouls,
        wcGoals, wcAssists,
        gpg: per(goals), apg: per(assists), fpg: per(fouls),
        mpg: games > 0 ? Math.round(minutes / games) : 0,
      });
    }
    page++;
  } while (page <= total && used < REQUEST_BUDGET);

  // Highlight the squad's leaders (minimum one appearance to qualify).
  const eligible = players.filter((p) => p.games > 0);
  const leader = (key) =>
    eligible.length ? eligible.slice().sort((a, b) => b[key] - a[key])[0].name : null;
  return {
    players: players.sort((a, b) => b.goals - a.goals || b.assists - a.assists),
    leaders: { goals: leader("gpg"), assists: leader("apg"), fouls: leader("fpg") },
    season: SEASON,
  };
}

/* ---- Head-to-head over the last H2H_YEARS years. Also locates the fixture id
   for THIS tournament's meeting (date === matchDate) so lineups, goals and
   player ratings can be pulled for it. ---- */
async function fetchH2H(homeName, awayName, hId, aId, matchDate) {
  const from = `${new Date().getUTCFullYear() - H2H_YEARS}-01-01`;
  const to = `${new Date().getUTCFullYear()}-12-31`;
  const body = await api("/fixtures/headtohead", { h2h: `${hId}-${aId}`, from, to });
  let homeWins = 0, awayWins = 0, draws = 0, total = 0, fixtureId = null;
  let bestDiff = Infinity;
  const target = matchDate ? new Date(matchDate + "T12:00:00Z").getTime() : null;
  for (const f of body.response || []) {
    const st = f.fixture && f.fixture.status && f.fixture.status.short;
    // Match THIS fixture by closeness to the scheduled date (±36h) so a late
    // kickoff rolling into the next UTC day still resolves correctly.
    if (target && f.fixture && f.fixture.date) {
      const diff = Math.abs(new Date(f.fixture.date).getTime() - target);
      if (diff <= 36 * 3600 * 1000 && diff < bestDiff) { bestDiff = diff; fixtureId = f.fixture.id; }
    }
    if (st && !["FT", "AET", "PEN"].includes(st)) continue; // finished games only
    const t = f.teams || {};
    total++;
    if (t.home && t.home.winner === true) (t.home.id === hId ? homeWins++ : awayWins++);
    else if (t.away && t.away.winner === true) (t.away.id === hId ? homeWins++ : awayWins++);
    else draws++;
  }
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return {
    stat: {
      home: homeName, away: awayName, total,
      homeWins, awayWins, draws,
      homeWinPct: pct(homeWins), awayWinPct: pct(awayWins), drawPct: pct(draws),
      years: H2H_YEARS,
    },
    fixtureId,
  };
}

/* ---- Lineup for THIS match (by fixture id). kind:
   "final"  = the actual lineup of a played match
   "live"   = official XI posted for an upcoming match
   "recent" = neither available yet → each side's most recent lineup ---- */
async function getMatchLineup(fixtureId, hId, aId, played) {
  if (fixtureId) {
    const lu = await api("/fixtures/lineups", { fixture: fixtureId });
    if ((lu.response || []).length) {
      return { sides: normaliseLineups(lu.response, hId, aId), kind: played ? "final" : "live" };
    }
  }
  // fall back to each team's most recent finished fixture lineup
  const out = {};
  for (const [key, id] of [["home", hId], ["away", aId]]) {
    if (used >= REQUEST_BUDGET) break;
    const last = await api("/fixtures", { team: id, last: 1 });
    const fx = (last.response || [])[0];
    if (!fx) continue;
    const lu = await api("/fixtures/lineups", { fixture: fx.fixture.id });
    const mine = (lu.response || []).find((l) => l.team && l.team.id === id);
    if (mine) out[key] = oneLineup(mine);
  }
  return { sides: out, kind: "recent" };
}

/* ---- Match report for a played fixture: goals (scorer + assist + minute) and
   per-player performance (rating 0–10, shots, passes/accuracy, tackles…). ---- */
async function fetchReport(fixtureId, hId, aId) {
  const goals = [];
  const ev = await api("/fixtures/events", { fixture: fixtureId });
  for (const e of ev.response || []) {
    if (e.type !== "Goal") continue;
    if (e.detail === "Missed Penalty") continue;
    goals.push({
      side: e.team && e.team.id === hId ? "home" : "away",
      player: e.player && e.player.name,
      assist: (e.assist && e.assist.name) || null,
      minute: e.time && e.time.elapsed,
      extra: (e.time && e.time.extra) || null,
      own: e.detail === "Own Goal",
      pen: e.detail === "Penalty",
    });
  }
  const players = {};
  if (used < REQUEST_BUDGET) {
    const pl = await api("/fixtures/players", { fixture: fixtureId });
    for (const tp of pl.response || []) {
      for (const p of tp.players || []) {
        const s = (p.statistics || [])[0] || {};
        const g = s.games || {}, sh = s.shots || {}, ps = s.passes || {},
          tk = s.tackles || {}, du = s.duels || {}, dr = s.dribbles || {};
        // Key by player id — /fixtures/lineups uses abbreviated names while
        // /fixtures/players uses full names, so names won't match across them.
        players[p.player.id] = {
          name: p.player.name,
          rating: g.rating ? +g.rating : null,
          minutes: g.minutes || 0,
          goals: (s.goals && s.goals.total) || 0,
          assists: (s.goals && s.goals.assists) || 0,
          shots: sh.total || 0,
          shotsOn: sh.on || 0,
          passes: ps.total || 0,
          passAcc: ps.accuracy != null ? +ps.accuracy : null,
          tackles: tk.total || 0,
          interceptions: tk.interceptions || 0,
          duelsWon: du.won || 0,
          duelsTotal: du.total || 0,
          dribbles: dr.success || 0,
        };
      }
    }
  }
  return { goals, players };
}

function lineupPlayer(e) {
  const p = e.player || {};
  return {
    id: p.id,
    name: p.name,
    number: p.number,
    pos: p.pos,
    grid: p.grid || null, // "row:col" — row 1 = GK, col 1 = left
    photo: p.id ? `https://media.api-sports.io/football/players/${p.id}.png` : "",
  };
}
function oneLineup(l) {
  return {
    team: l.team && l.team.name,
    formation: l.formation || "",
    coach: (l.coach && l.coach.name) || "",
    startXI: (l.startXI || []).map(lineupPlayer),
    subs: (l.substitutes || []).map(lineupPlayer),
  };
}

function normaliseLineups(resp, hId, aId) {
  const out = {};
  for (const l of resp) {
    if (l.team && l.team.id === hId) out.home = oneLineup(l);
    else if (l.team && l.team.id === aId) out.away = oneLineup(l);
  }
  if (!out.home && resp[0]) out.home = oneLineup(resp[0]);
  if (!out.away && resp[1]) out.away = oneLineup(resp[1]);
  return out;
}

/* ---- Which matches to prepare. Every group matchup gets H2H + a lineup (so
   the info button works on played AND upcoming group games); knockout fixtures
   are added once their two teams are known and within the horizon. ---- */
function relevantMatches() {
  const live = loadJson(LIVE_PATH, null);
  const sched = (live && live.schedule) || [];
  const horizon = new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString().slice(0, 10);
  // Two real (non-placeholder) teams — excludes "2A", "W74", "3C/D/F/G/H", etc.
  const known = (n) => n && !/^[0-9]/.test(n) && !/^[WL]\d/.test(n) && !/\//.test(n);
  return sched
    .filter((m) => {
      if (!known(m.h) || !known(m.a)) return false;
      if (m.s && m.s.length === 1) return true;          // all group matches
      return m.hg === null && m.d <= horizon;            // upcoming knockouts
    })
    .sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
}

async function main() {
  if (!KEY) {
    log("APIFOOTBALL_KEY not set — skipping football stats refresh (UI will show a notice).");
    // Still ensure an (empty) output file exists so the page loads cleanly.
    if (!fs.existsSync(OUT_JS)) writeOut({ teams: {}, matches: {} });
    return;
  }

  const cache = loadJson(CACHE_PATH, { teamIds: {}, teamTs: {}, h2hTs: {}, lineupTs: {} });
  cache.teamTs = cache.teamTs || {};
  cache.h2hTs = cache.h2hTs || {};
  cache.lineupTs = cache.lineupTs || {};
  const data = loadJson(OUT_JSON, { teams: {}, matches: {} });
  data.teams = data.teams || {};
  data.matches = data.matches || {};

  const matches = relevantMatches();
  log(`${matches.length} match(es) to prepare; budget ${REQUEST_BUDGET} requests.`);

  try {
    // Resolve team ids first (cheap, cached forever).
    const teamsNeeded = new Set();
    matches.forEach((m) => { teamsNeeded.add(m.h); teamsNeeded.add(m.a); });
    for (const name of teamsNeeded) {
      if (!cache.teamIds[name]) { await teamId(name, cache); }
    }

    // 1) Squad stats (per team, daily TTL).
    for (const name of teamsNeeded) {
      const id = cache.teamIds[name];
      if (!id) continue;
      if (fresh(cache.teamTs[name], PLAYER_TTL_H) && data.teams[name]) continue;
      log("squad:", name);
      const squad = await fetchSquad(name, id);
      data.teams[name] = { id, ...squad };
      cache.teamTs[name] = new Date().toISOString();
    }

    // 2) Per-match H2H (weekly TTL) + lineups (hourly TTL).
    for (const m of matches) {
      const key = `${m.h}|${m.a}`;
      const hId = cache.teamIds[m.h], aId = cache.teamIds[m.a];
      if (!hId || !aId) continue;
      data.matches[key] = data.matches[key] || {};

      const played = m.hg !== null;

      if (!fresh(cache.h2hTs[key], H2H_TTL_H) || !data.matches[key].h2h) {
        log("h2h:", key);
        const r = await fetchH2H(m.h, m.a, hId, aId, m.d);
        data.matches[key].h2h = r.stat;
        if (r.fixtureId) data.matches[key].fixtureId = r.fixtureId;
        cache.h2hTs[key] = new Date().toISOString();
      }
      const fixtureId = data.matches[key].fixtureId || null;

      if (!fresh(cache.lineupTs[key], LINEUP_TTL_H) || !data.matches[key].lineup) {
        log("lineup:", key);
        data.matches[key].lineup = await getMatchLineup(fixtureId, hId, aId, played);
        cache.lineupTs[key] = new Date().toISOString();
      }

      // Match report (goals + player ratings) — only for played matches, once.
      if (played && fixtureId && !data.matches[key].report) {
        log("report:", key);
        data.matches[key].report = await fetchReport(fixtureId, hId, aId);
      }
    }
  } catch (e) {
    if (e.message === "__BUDGET__") log(`Hit request budget (${used}) — partial refresh saved, continues next run.`);
    else throw e;
  }

  writeOut(data);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  log(`Done. Used ${used} request(s). Teams: ${Object.keys(data.teams).length}, matches: ${Object.keys(data.matches).length}.`);
}

function writeOut(data) {
  const out = {
    source: "API-Football (api-sports.io)",
    updated: new Date().toISOString(),
    season: SEASON,
    teams: data.teams || {},
    matches: data.matches || {},
  };
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  fs.writeFileSync(
    OUT_JS,
    "/* generated from API-Football — refreshed by the Update live data Action */\n" +
      "window.WC_FOOTBALL = " + JSON.stringify(out) + ";\n"
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
