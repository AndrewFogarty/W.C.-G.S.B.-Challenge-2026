/* =================================================================
   World Cup 2026 — Group Stage Predictor + Interactive Bracket
   Vanilla JS. Official draw (technical draw results) & official
   knockout structure. Enter scorelines -> live tables -> bracket.
   ================================================================= */

"use strict";

/* ---- Tournament data (teams & flags) lives in data.js as the global
   `WC`, loaded before this file. Edit data.js to keep lineups current. */
const DEFAULT_GROUPS = WC.groups;

const GROUP_LETTERS = Object.keys(DEFAULT_GROUPS);

/* team name -> flag code (for the schedule strip) */
const NAME_CODE = {};
GROUP_LETTERS.forEach((g) => DEFAULT_GROUPS[g].forEach(([n, c]) => (NAME_CODE[n] = c)));

/* team name -> 3-letter shorthand (FIFA/IOC codes) for the mini bracket */
const CODE3 = {
  "Mexico": "MEX", "South Africa": "RSA", "Korea Republic": "KOR", "Czechia": "CZE",
  "Canada": "CAN", "Bosnia": "BIH", "Qatar": "QAT", "Switzerland": "SUI",
  "Brazil": "BRA", "Morocco": "MAR", "Haiti": "HAI", "Scotland": "SCO",
  "USA": "USA", "Paraguay": "PAR", "Australia": "AUS", "Turkey": "TUR",
  "Germany": "GER", "Curaçao": "CUW", "Côte d'Ivoire": "CIV", "Ecuador": "ECU",
  "Netherlands": "NED", "Japan": "JPN", "Sweden": "SWE", "Tunisia": "TUN",
  "Belgium": "BEL", "Egypt": "EGY", "IR Iran": "IRN", "New Zealand": "NZL",
  "Spain": "ESP", "Cabo Verde": "CPV", "Saudi Arabia": "KSA", "Uruguay": "URU",
  "France": "FRA", "Senegal": "SEN", "Iraq": "IRQ", "Norway": "NOR",
  "Argentina": "ARG", "Algeria": "ALG", "Austria": "AUT", "Jordan": "JOR",
  "Portugal": "POR", "DR Congo": "COD", "Uzbekistan": "UZB", "Colombia": "COL",
  "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN",
};
function code3(name) {
  if (!name) return "—";
  if (CODE3[name]) return CODE3[name];
  // fallback: first three letters, uppercased (strip non-letters like "DR ")
  return name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase();
}

/* team name -> index within its group (for venue mapping) */
const GROUP_IDX = {};
GROUP_LETTERS.forEach((g) => {
  GROUP_IDX[g] = {};
  DEFAULT_GROUPS[g].forEach(([n], i) => (GROUP_IDX[g][n] = i));
});

/* Round-robin schedule for 4 teams (indices into the group's team list) */
const FIXTURES = [
  [0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2],
];

const STORAGE_KEY = "wc2026-predictor-v3";

/* ---- Official Round-of-32 pairings (FIFA match numbers 73–88).
   "1X"/"2X" = winner/runner-up of group X. "3:ABCDF" = a best
   third-placed team from one of the allowed groups.                 */
const R32 = {
  73: ["2A", "2B"],
  74: ["1E", "3:ABCDF"],
  75: ["1F", "2C"],
  76: ["1C", "2F"],
  77: ["1I", "3:CDFGH"],
  78: ["2E", "2I"],
  79: ["1A", "3:CEFHI"],
  80: ["1L", "3:EHIJK"],
  81: ["1D", "3:BEFIJ"],
  82: ["1G", "3:AEHIJ"],
  83: ["2K", "2L"],
  84: ["1H", "2J"],
  85: ["1B", "3:EFGIJ"],
  86: ["1J", "2H"],
  87: ["1K", "3:DEIJL"],
  88: ["2D", "2G"],
};

/* Winners of these matches feed forward (official bracket tree). */
const LATER = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  104: [101, 102], // Final
};

/* Display order (top→bottom) so columns line up as a bracket. */
const ROUND_ORDER = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
};

/* Third-place allocation slots: each R32 third-slot allows certain groups. */
const THIRD_SLOTS = [
  { m: 74, allow: "ABCDF" },
  { m: 77, allow: "CDFGH" },
  { m: 79, allow: "CEFHI" },
  { m: 80, allow: "EHIJK" },
  { m: 81, allow: "BEFIJ" },
  { m: 82, allow: "AEHIJ" },
  { m: 85, allow: "EFGIJ" },
  { m: 87, allow: "DEIJL" },
];

const ROUND_NAME = {
  R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals",
  SF: "Semi-finals", F: "Final", TP: "Third place",
};

/* Build the full bracket structure. */
const BRACKET = {};
for (const [id, pair] of Object.entries(R32)) {
  BRACKET[id] = { round: "R32", home: pair[0], away: pair[1] };
}
for (const [id, kids] of Object.entries(LATER)) {
  let round = "R16";
  const n = +id;
  if (n >= 97 && n <= 100) round = "QF";
  else if (n >= 101 && n <= 102) round = "SF";
  else if (n === 104) round = "F";
  BRACKET[id] = { round, home: { from: kids[0] }, away: { from: kids[1] } };
}
BRACKET[103] = { round: "TP", home: { loser: 101 }, away: { loser: 102 } };

/* ---- Application state ---- */
let state = { names: {}, scores: {}, bracket: {}, bracket2: {}, mode: "score" };

/* ================= Persistence ================= */
function loadState() {
  const fresh = { names: {}, scores: {}, bracket: {}, bracket2: {}, mode: "score" };
  for (const g of GROUP_LETTERS) {
    fresh.names[g] = DEFAULT_GROUPS[g].map((t) => t[0]);
    fresh.scores[g] = FIXTURES.map(() => [null, null]);
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      for (const g of GROUP_LETTERS) {
        if (saved.names && Array.isArray(saved.names[g]) && saved.names[g].length === 4) {
          fresh.names[g] = saved.names[g].map(String);
        }
        if (saved.scores && Array.isArray(saved.scores[g]) && saved.scores[g].length === 6) {
          fresh.scores[g] = saved.scores[g].map((m) => [normScore(m && m[0]), normScore(m && m[1])]);
        }
      }
      if (saved.bracket && typeof saved.bracket === "object") fresh.bracket = saved.bracket;
      if (saved.bracket2 && typeof saved.bracket2 === "object") fresh.bracket2 = saved.bracket2;
      if (saved.mode === "score" || saved.mode === "result") fresh.mode = saved.mode;
    }
  } catch (e) {
    /* ignore malformed storage */
  }
  state = fresh;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage may be unavailable — ignore */
  }
}

function normScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ================= Helpers ================= */
/* Map an internal code to a flagcdn slug (subdivisions handled). */
function flagSlug(code) {
  if (code === "ENG") return "gb-eng";
  if (code === "SCT") return "gb-sct";
  if (!code || code.length !== 2) return null;
  return code.toLowerCase();
}

/* Crisp SVG flag (flagcdn). Falls back to a ball if the code is unknown. */
function flagHtml(code) {
  const slug = flagSlug(code);
  if (!slug) return '<span class="flag-fallback">\u{26BD}</span>';
  return `<img class="flag-img" src="https://flagcdn.com/${slug}.svg" alt="" loading="lazy" decoding="async" />`;
}

function codeFor(group, idx) {
  return DEFAULT_GROUPS[group][idx][1];
}

function flagFor(name) {
  const c = NAME_CODE[name];
  return c ? flagHtml(c) : "";
}

function blankStat(name) {
  return { name, pld: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

function groupComplete(g) {
  return effScores(g).every((m) => m[0] !== null && m[0] !== undefined && m[1] !== null && m[1] !== undefined);
}

function allGroupsComplete() {
  return GROUP_LETTERS.every(groupComplete);
}

const cmpStats = GSB.cmpStats;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ================= Standings (pure logic in lib/engine.js) ================= */
/* Effective scores: official result for played matches, else the in-play live
   scoreline for a match that has kicked off, else your prediction — so
   standings + the bracket reflect real results (including a match being played
   right now) plus your remaining picks. Without the in-play fallback, a group
   containing a kicked-off-but-unfinished match (which can no longer be
   predicted) would never count as complete, leaving even its winner (e.g. 1B)
   unresolved while Switzerland–Bosnia is still on the pitch. */
/* Real (official) results only — unplayed matches stay blank. Used for the
   official bracket/standings and clinch math, so nothing leaks the viewer's
   own predictions into "official" views. */
function realScores(group) {
  const arr = (liveResults()[group] || []);
  return FIXTURES.map((_, i) => {
    const a = arr[i];
    return (a && a[0] != null && a[1] != null) ? a : [null, null];
  });
}

/* When set, every standings path below (rankGroup, groupComplete, resolveR32…)
   uses real results only. Toggled around the official renders. */
let useRealStandings = false;

function effScores(group) {
  if (useRealStandings) return realScores(group);
  const live = liveResults();
  const names = state.names[group] || [];
  return state.scores[group].map((pred, i) => {
    const a = (live[group] || [])[i];
    if (a && a[0] != null && a[1] != null) return a;
    const fx = FIXTURES[i];
    const lv = liveScoreFor(names[fx[0]], names[fx[1]]);
    if (lv && lv.hg != null && lv.ag != null) return [lv.hg, lv.ag];
    return pred;
  });
}
function rankGroup(group) {
  return GSB.rankGroup(state.names[group], effScores(group));
}
/* Run fn() with official (real-results-only) standings in effect. */
function withRealStandings(fn) {
  const prev = useRealStandings;
  useRealStandings = true;
  try { return fn(); } finally { useRealStandings = prev; }
}

/* Clinch math (real results only): brute-force the remaining matches' W/D/L and
   decide, conservatively (points only — ties count against the team, so we
   never over-claim), whether each team has locked 1st (`x`) or exactly 2nd
   (`y`). Returns flags by team index + which finishing positions are locked. */
function clinchInfo(group) {
  const names = state.names[group];
  const base = realScores(group);
  const rem = [];
  base.forEach((s, i) => { if (s[0] == null) rem.push(i); });
  const out = { x: {}, y: {}, posClinched: { 1: false, 2: false }, elim: {} };
  if (rem.length === 0) {
    // Group finished — 1st and 2nd are final, mark them directly (handles
    // positions decided on GD/GF tiebreakers, which the points-only path can't).
    const r = GSB.rankGroup(names, base);
    if (r[0]) { out.x[r[0].idx] = true; out.posClinched[1] = true; }
    if (r[1]) { out.y[r[1].idx] = true; out.posClinched[2] = true; }
    if (r[3]) out.elim[r[3].idx] = true; // 4th is out (3rd handled with the thirds table)
    return out;
  }
  if (rem.length > 4) return out; // too early — nothing clinched or eliminated yet

  // Mathematical elimination: a team is out only when it's guaranteed to finish
  // 4th — i.e. three group-mates already have more points than this team's
  // maximum possible (current + 3 per remaining game). Conservative, so a team
  // that has only played once can never be flagged.
  const cur = GSB.computeStats(names, base);
  names.forEach((_, i) => {
    const remGames = rem.filter((m) => FIXTURES[m].includes(i)).length;
    const maxP = cur[i].pts + 3 * remGames;
    const above = cur.filter((o) => o.idx !== i && o.pts > maxP).length;
    if (above >= 3) out.elim[i] = true;
  });

  const WDL = [[1, 0], [0, 0], [0, 1]];
  // For each team: worst case = max number of other teams that reach/exceed its
  // points across all remaining-result scenarios.
  const worstAhead = names.map(() => 0);
  const scenario = base.map((s) => s.slice());
  (function rec(k) {
    if (k === rem.length) {
      const st = GSB.computeStats(names, scenario);
      st.forEach((t) => {
        const ahead = st.filter((o) => o.idx !== t.idx && o.pts >= t.pts).length;
        if (ahead > worstAhead[t.idx]) worstAhead[t.idx] = ahead;
      });
      return;
    }
    for (const o of WDL) { scenario[rem[k]] = o; rec(k + 1); }
  })(0);

  let firstIdx = null;
  names.forEach((_, i) => { if (worstAhead[i] === 0) { out.x[i] = true; firstIdx = i; } });
  // y = clinched exactly 2nd: locked into top-2 AND 1st already taken by another.
  if (firstIdx !== null) {
    names.forEach((_, i) => { if (i !== firstIdx && worstAhead[i] <= 1) out.y[i] = true; });
  }
  out.posClinched[1] = firstIdx !== null;
  out.posClinched[2] = Object.keys(out.y).length > 0;
  return out;
}

/* Genuinely-missing entries: matches with no official result, no in-play live
   score, and no (complete) prediction — the ones that silently block a group
   from resolving, leaving its 1st/2nd qualifiers and every 3rd-place slot
   unseeded. A half-typed score (one box blank) counts as missing too. `scores`
   defaults to the live editor; pass a submission's scores to audit a saved
   bracket in the leaderboard "View". */
function missingMatchesIn(group, scores) {
  const live = liveResults();
  const names = state.names[group] || [];
  const arr = (scores && scores[group]) || state.scores[group] || [];
  const out = [];
  for (let i = 0; i < FIXTURES.length; i++) {
    const a = (live[group] || [])[i];
    if (a && a[0] != null && a[1] != null) continue;          // official result
    const fx = FIXTURES[i];
    const lv = liveScoreFor(names[fx[0]], names[fx[1]]);
    if (lv && lv.hg != null && lv.ag != null) continue;       // in-play right now
    const pred = arr[i];
    if (pred && pred[0] != null && pred[1] != null) continue; // fully predicted
    out.push(i);
  }
  return out;
}
function incompleteGroups(scores) {
  return GROUP_LETTERS
    .map((g) => ({ group: g, missing: missingMatchesIn(g, scores) }))
    .filter((x) => x.missing.length);
}
/* True once a group has at least one scored match — enough to seed a
   provisional ordering even before every match is in. */
function groupHasScore(g) {
  return effScores(g).some((m) => m && m[0] != null && m[1] != null);
}
function matchLabel(group, i) {
  const [hi, ai] = FIXTURES[i];
  const nm = state.names[group] || [];
  return `${nm[hi]} v ${nm[ai]}`;
}

/* Ranked list of all 12 third-placed teams (top 8 advance). */
function rankedThirds() {
  return GROUP_LETTERS
    .map((g) => ({ group: g, ...rankGroup(g)[2] }))
    .sort(cmpStats);
}

/* Assign the 8 qualifying third-placed groups to compatible R32 slots
   via bipartite matching (each slot only permits certain groups).    */
function thirdAssignments() {
  const qualGroups = rankedThirds().slice(0, 8).map((t) => t.group);
  const slotTaken = new Array(THIRD_SLOTS.length).fill(null);
  function tryAssign(group, seen) {
    for (let si = 0; si < THIRD_SLOTS.length; si++) {
      if (!THIRD_SLOTS[si].allow.includes(group) || seen.has(si)) continue;
      seen.add(si);
      if (slotTaken[si] === null || tryAssign(slotTaken[si], seen)) {
        slotTaken[si] = group;
        return true;
      }
    }
    return false;
  }
  qualGroups.forEach((g) => tryAssign(g, new Set()));
  const out = {};
  THIRD_SLOTS.forEach((s, si) => { if (slotTaken[si]) out[s.m] = slotTaken[si]; });
  return out;
}

/* ================= Group rendering ================= */
const groupsEl = document.getElementById("groups");

/* Column layout: distribute group cards across columns in strict A→L order so
   they always read left-to-right, top-to-bottom (A,B,C across the top row,
   D,E,F next, …) regardless of card height. */
let groupCardOrder = null;
function layoutGroups() {
  if (!groupsEl) return;
  if (!groupCardOrder) {
    groupCardOrder = GROUP_LETTERS.map((g) => groupsEl.querySelector(`.group-card[data-group="${g}"]`)).filter(Boolean);
  }
  if (!groupCardOrder.length) return;
  const width = groupsEl.clientWidth || window.innerWidth;
  const cols = Math.max(1, Math.min(3, Math.floor(width / 360)));
  groupsEl.querySelectorAll(".groups-col").forEach((c) => c.remove());
  const colEls = [];
  for (let i = 0; i < cols; i++) {
    const d = document.createElement("div");
    d.className = "groups-col";
    groupsEl.appendChild(d);
    colEls.push(d);
  }
  // Round-robin by index keeps alphabetical reading order across the row.
  groupCardOrder.forEach((card, i) => colEls[i % cols].appendChild(card));
}

function buildGroups() {
  groupsEl.innerHTML = "";
  for (const g of GROUP_LETTERS) {
    const card = document.createElement("section");
    card.className = "group-card";
    card.dataset.group = g;
    card.innerHTML = `<div class="group-head"><span class="group-tag">Group ${g}</span></div>`;

    const matches = document.createElement("div");
    matches.className = "matches";
    FIXTURES.forEach((fx, m) => {
      const [hi, ai] = fx;
      const row = document.createElement("div");
      row.className = "match";
      row.dataset.group = g;
      row.dataset.match = m;
      row.innerHTML = `
        <span class="match-grade" aria-hidden="true"></span>
        <span class="team home">
          <span class="flag">${flagHtml(codeFor(g, hi))}</span>
          <span class="tname" data-group="${g}" data-idx="${hi}"></span>
        </span>
        <span class="mid">
          <span class="score">
            <input class="goal" type="number" min="0" max="99" inputmode="numeric" data-group="${g}" data-match="${m}" data-side="0" aria-label="${g} match ${m + 1} home goals" />
            <span class="dash">–</span>
            <input class="goal" type="number" min="0" max="99" inputmode="numeric" data-group="${g}" data-match="${m}" data-side="1" aria-label="${g} match ${m + 1} away goals" />
          </span>
          <span class="result" role="group" aria-label="${g} match ${m + 1} result">
            <button class="res-btn" data-res="home" type="button" title="Home win" aria-label="Home win">1</button>
            <button class="res-btn" data-res="draw" type="button" title="Draw" aria-label="Draw">X</button>
            <button class="res-btn" data-res="away" type="button" title="Away win" aria-label="Away win">2</button>
          </span>
        </span>
        <span class="team away">
          <span class="tname" data-group="${g}" data-idx="${ai}"></span>
          <span class="flag">${flagHtml(codeFor(g, ai))}</span>
        </span>
        <span class="match-lock" title="Locked — the match has kicked off; this prediction can no longer be changed" aria-hidden="true">🔒</span>
        <button class="match-info" type="button" data-group="${g}" data-match="${m}" title="Lineups, head-to-head & squad stats" aria-label="Match info">ⓘ</button>
        <span class="match-actual"></span>
        <span class="match-venue"></span>`;
      matches.appendChild(row);
    });
    card.appendChild(matches);

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.innerHTML = `
      <table class="standings">
        <thead><tr>
          <th class="col-pos">#</th><th class="col-team">Team</th>
          <th>Pld</th><th>W</th><th>D</th><th>L</th>
          <th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
        </tr></thead>
        <tbody></tbody>
      </table>`;
    card.appendChild(wrap);
    groupsEl.appendChild(card);
  }
}

function syncInputs() {
  document.querySelectorAll(".tname").forEach((el) => {
    el.textContent = state.names[el.dataset.group][+el.dataset.idx];
  });
  document.querySelectorAll(".goal").forEach((el) => {
    const v = state.scores[el.dataset.group][+el.dataset.match][+el.dataset.side];
    el.value = v === null ? "" : v;
  });
}

function renderGroup(group) {
  const ranked = rankGroup(group);
  const tbody = document.querySelector(`.group-card[data-group="${group}"] tbody`);
  tbody.innerHTML = "";
  ranked.forEach((s, pos) => {
    const tr = document.createElement("tr");
    tr.className = pos < 2 ? "qualified" : pos === 2 ? "third" : "";
    tr.innerHTML = `
      <td class="col-pos">${pos + 1}</td>
      <td class="col-team"><span class="flag">${flagHtml(codeFor(group, s.idx))}</span><span>${escapeHtml(s.name)}</span></td>
      <td>${s.pld}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td>
      <td>${s.gf}</td><td>${s.ga}</td><td>${s.gd > 0 ? "+" + s.gd : s.gd}</td>
      <td class="pts">${s.pts}</td>`;
    tbody.appendChild(tr);
  });
}

function renderThirds() {
  const rows = rankedThirds();
  const tbody = document.querySelector("#thirds-table tbody");
  tbody.innerHTML = "";
  rows.forEach((s, pos) => {
    const tr = document.createElement("tr");
    tr.className = pos < 8 ? "qualified" : "eliminated";
    tr.innerHTML = `
      <td class="col-pos">${pos + 1}</td>
      <td class="col-team"><span class="flag">${flagHtml(codeFor(s.group, s.idx))}</span><span>${escapeHtml(s.name)}</span></td>
      <td>${s.group}</td><td>${s.pld}</td>
      <td>${s.gd > 0 ? "+" + s.gd : s.gd}</td><td>${s.gf}</td>
      <td class="pts">${s.pts}</td>
      <td>${pos < 8 ? "✓ Advances" : "Out"}</td>`;
    tbody.appendChild(tr);
  });
}

/* ================= Bracket ================= */
const bracketEl = document.getElementById("bracket");
let thirdMap = {};

function slotInfo(group, pos) {
  const s = rankGroup(group)[pos];
  return { name: s.name, code: codeFor(group, s.idx) };
}

/* Resolve an R32 slot spec for a given match id. A slot is `known` (final) once
   its group(s) are fully scored; otherwise, as soon as the group has any score,
   we still seed it `provisional` from the current standings so the bracket
   never shows a blank Round of 32 just because one match is unscored (e.g. a
   match that locked at kickoff before it could be predicted). */
function resolveR32(matchId, spec) {
  if (spec[0] === "1" || spec[0] === "2") {
    const g = spec[1], pos = spec[0] === "1" ? 0 : 1;
    const known = groupComplete(g);
    return { ...slotInfo(g, pos), label: spec[0] + g, known, provisional: !known && groupHasScore(g) };
  }
  // third-place slot
  const allow = spec.slice(2).split("").join("/");
  const g = thirdMap[matchId];
  const info = g ? slotInfo(g, 2) : { name: null, code: "" };
  const known = allGroupsComplete() && !!g;
  return { ...info, label: "3rd " + allow, known, provisional: !known && !!g && groupHasScore(g) };
}

/* Resolve a participant. `picks` is the winner map driving the tree:
   state.bracket (main), state.bracket2 (second-chance), or officialPicks()
   (the real results). R32 seeds always come from real/predicted standings. */
function participant(matchId, side, picks) {
  picks = picks || state.bracket;
  const m = BRACKET[matchId];
  const spec = side === "home" ? m.home : m.away;
  if (typeof spec === "string") return resolveR32(matchId, spec);
  if (spec.loser !== undefined) {
    const child = spec.loser;
    const w = picks[child];
    if (!w) return { name: null, code: "", label: "Loser " + ROUND_NAME[BRACKET[child].round], known: false };
    return participant(child, w === "home" ? "away" : "home", picks);
  }
  const child = spec.from;
  const w = picks[child];
  if (!w) return { name: null, code: "", label: "Winner " + ROUND_NAME[BRACKET[child].round], known: false };
  return participant(child, w, picks);
}

function winnerOf(matchId, picks) {
  picks = picks || state.bracket;
  const w = picks[matchId];
  return w ? participant(matchId, w, picks) : null;
}

/* True once a knockout match has kicked off OR has an official result — its
   winner pick can no longer be changed. This is what stops anyone editing
   their bracket to match real outcomes once teams start getting eliminated:
   the pick for each game freezes the instant that game begins, exactly like
   the group-stage scorelines do at kickoff. */
function koMatchLocked(id) {
  if ((KO_RESULT.byNum || {})[id]) return true;
  const ko = (KICKOFF.byNum || {})[id];
  return ko != null && Date.now() >= ko;
}

/* The knockout round has "begun" once the real group stage is fully decided
   (every group match has an OFFICIAL result, so the real Round of 32 is set).
   At that instant the main bracket freezes, the official bracket locks, and the
   second-chance round opens.

   NB: must key off real results only — NOT allGroupsComplete()/effScores, which
   falls back to the user's own predictions for unplayed games and would falsely
   "open" the knockout the moment someone fills in their group picks. */
function knockoutOpen() {
  const live = (window.WC_LIVE && window.WC_LIVE.results) || {};
  return GROUP_LETTERS.every((g) => {
    const arr = live[g] || [];
    return arr.length >= 6 && arr.every((m) => m && m[0] != null && m[1] != null);
  });
}

/* The official winner map, derived from real results: for each knockout match
   that has a final scoreline in WC_LIVE, which side won. Feeds the read-only
   "official bracket" through the same participant()/winnerOf() engine. */
function officialPicks() {
  const picks = {};
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  for (const m of sched) {
    if (m.n == null || m.hg == null || m.ag == null) continue;
    if (m.hg === m.ag) continue;            // no decisive side recorded (e.g. pre-PK)
    picks[m.n] = m.hg > m.ag ? "home" : "away";
  }
  return picks;
}

/* ---- Bracket rendering ----
   One engine renders all three trees in a two-sided West/East layout that
   meets at the Final in the centre. A `ctx` selects the winner map and
   behaviour:
     • main   → state.bracket,  interactive, frozen once knockoutOpen()
     • second → state.bracket2, interactive once knockoutOpen(), per-match lock
     • official → officialPicks() from live results, read-only            */
function bmRow(id, side, p, selected, acc, disabled, locked) {
  const known = p.known && p.name;
  const prov = !known && p.provisional && p.name;     // seeded from partial standings
  const show = known || prov;
  const label = show
    ? `<span class="bm-name${prov ? " prov" : ""}"${prov ? ' title="Provisional — from current standings; finish the group to lock it"' : ""}>${escapeHtml(p.name)}${prov ? '<span class="bm-prov">~</span>' : ""}</span>`
    : `<span class="bm-name ph">${escapeHtml(p.label || "—")}</span>`;
  const flag = show ? flagHtml(p.code) : "•";
  const mark = locked ? '<span class="bm-clinch" title="Locked — this team has clinched its group spot">✓</span>'
    : acc === "correct" ? '<span class="bm-mark ok">✓</span>'
    : acc === "wrong" ? '<span class="bm-mark no">✗</span>' : "";
  return `<button class="bm-row ${selected ? "sel" : ""} ${locked ? "clinched" : acc || ""}" data-id="${id}" data-side="${side}" type="button"${disabled ? " disabled" : ""}>
      <span class="flag">${flag}</span>${label}${mark}
    </button>`;
}

function bmCard(id, ctx, extraClass) {
  const picks = ctx.picks;
  const h = participant(id, "home", picks);
  const a = participant(id, "away", picks);
  const w = picks[id];
  const acc = w ? bracketAccuracy(id, w, picks) : "";
  const v = VENUE.byNum[id];
  const locked = ctx.lockedFn ? ctx.lockedFn(id) : false;
  const hMark = ctx.lockMark ? ctx.lockMark(id, "home") : false;
  const aMark = ctx.lockMark ? ctx.lockMark(id, "away") : false;
  const disabled = locked || !ctx.interactive;
  const lockBadge = locked
    ? '<span class="bm-lock" title="Locked — this match has kicked off; the pick can no longer be changed" aria-hidden="true">🔒</span>'
    : "";
  return `<div class="bm ${extraClass || ""}${locked ? " ko-locked" : ""}" data-id="${id}">
      ${bmRow(id, "home", h, w === "home", w === "home" ? acc : "", disabled, hMark)}
      ${bmRow(id, "away", a, w === "away", w === "away" ? acc : "", disabled, aMark)}
      ${lockBadge}
      ${v ? `<div class="bm-venue">${escapeHtml(v)}</div>` : ""}
    </div>`;
}

/* Split a round's display order into [West, East]. The first half of every
   ROUND_ORDER entry feeds Semi-final 101 (West); the rest feeds SF 102 (East). */
function halves(arr) {
  const k = arr.length / 2;
  return [arr.slice(0, k), arr.slice(k)];
}

function renderBracketInto(host, ctx) {
  if (!host) return;
  thirdMap = thirdAssignments();
  const col = (title, ids, cls) =>
    `<div class="round ${cls || ""}"><h3 class="round-title">${title}</h3>
      <div class="round-body">${ids.map((id) => bmCard(id, ctx)).join("")}</div></div>`;

  const W = {}, E = {};
  for (const r of ["R32", "R16", "QF", "SF"]) { const [w, e] = halves(ROUND_ORDER[r]); W[r] = w; E[r] = e; }

  const champ = winnerOf(104, ctx.picks);
  const champHtml = champ && champ.known && champ.name
    ? `<div class="champion"><span class="trophy">🏆</span>
         <span class="champ-flag">${flagHtml(champ.code)}</span>
         <span class="champ-name">${escapeHtml(champ.name)}</span>
         <span class="champ-label">${escapeHtml(ctx.champLabel || "Champion")}</span></div>`
    : `<div class="champion empty"><span class="trophy">🏆</span><span class="champ-label">${escapeHtml(ctx.emptyLabel || "Pick winners to crown a champion")}</span></div>`;

  const centreCol = `<div class="round final-col">
      <h3 class="round-title">Final</h3>
      <div class="round-body">
        ${bmCard(104, ctx, "is-final")}
        ${champHtml}
        <div class="tp-block">
          <h4>Third-place match</h4>
          ${bmCard(103, ctx, "is-tp")}
        </div>
      </div>
    </div>`;

  host.innerHTML =
    col("Round of 32", W.R32) + col("Round of 16", W.R16) +
    col("Quarter-finals", W.QF) + col("Semi-finals", W.SF) +
    centreCol +
    col("Semi-finals", E.SF, "east") + col("Quarter-finals", E.QF, "east") +
    col("Round of 16", E.R16, "east") + col("Round of 32", E.R32, "east");
}

/* Scale a bracket down to fit its container so the two-sided layout is fully
   visible without a horizontal scrollbar — proportions/spacing are preserved
   (CSS `zoom` shrinks the whole tree uniformly), so it still looks right. */
function fitBracket(scroll) {
  const inner = scroll.querySelector(".bracket");
  if (!inner) return;
  const avail = scroll.clientWidth;
  if (!avail) return;                 // hidden / not laid out — leave existing zoom intact
  inner.style.zoom = "";              // reset to measure the natural width
  const natural = inner.scrollWidth;
  if (!natural) return;
  const z = Math.min(1, (avail - 2) / natural);
  inner.style.zoom = z < 1 ? String(z) : "";
}
function fitBrackets() {
  document.querySelectorAll(".bracket-scroll").forEach(fitBracket);
}

/* Auto-fit each bracket whenever its container gets (or changes) a size —
   covers first paint, the title screen clearing, the second-chance view
   becoming visible, and window resizes, without fragile timing. */
let bracketRO = null;
function observeBrackets() {
  if (typeof ResizeObserver === "undefined") { fitBrackets(); return; }
  if (bracketRO) bracketRO.disconnect();
  bracketRO = new ResizeObserver((entries) => {
    for (const e of entries) fitBracket(e.target);
  });
  document.querySelectorAll(".bracket-scroll").forEach((s) => bracketRO.observe(s));
}

function mainBracketCtx() {
  return {
    picks: state.bracket,
    interactive: true,
    lockedFn: (id) => knockoutOpen() || koMatchLocked(id),
    champLabel: "Your champion",
    emptyLabel: "Pick winners to crown a champion",
  };
}

function renderBracket() {
  renderBracketInto(bracketEl, mainBracketCtx());

  const warnEl = document.getElementById("bracket-warning");
  if (!warnEl) return;
  if (knockoutOpen()) {
    warnEl.innerHTML =
      `<div class="bracket-warn locked-note" role="status">
        <span class="bw-icon">🔒</span>
        <div class="bw-text">
          <strong>Knockout round has begun</strong> — the group stage is decided, so your
          bracket is locked and can no longer be changed. Head to the
          <em>Second Chance</em> round to pick the knockouts from the real Round of 32.
        </div>
      </div>`;
    return;
  }
  const gaps = incompleteGroups(state.scores);
  const totalMissing = gaps.reduce((n, x) => n + x.missing.length, 0);
  warnEl.innerHTML = gaps.length
    ? `<div class="bracket-warn" role="status">
        <span class="bw-icon">⚠</span>
        <div class="bw-text">
          <strong>${totalMissing} unfilled match${totalMissing === 1 ? "" : "es"}</strong> —
          affected slots show a <em>provisional</em> seed (<span class="bw-tilde">~</span>)
          from current standings; fill these to lock them in:
          <span class="bw-list">${gaps.map((x) =>
            `<span class="bw-grp">Group ${x.group}: ${x.missing.map((i) => escapeHtml(matchLabel(x.group, i))).join(", ")}</span>`).join("")}</span>
        </div>
      </div>`
    : "";
}

/* Read-only official bracket, driven by real results. Provisional while the
   group stage is live; locks to the real Round of 32 once it completes. */
function renderOfficialBracket() {
  const host = document.getElementById("official-bracket");
  if (!host) return;
  const open = knockoutOpen();
  // Real standings only, and a per-group clinch map so locked R32 slots get a ✓.
  withRealStandings(() => {
    const clinch = {};
    GROUP_LETTERS.forEach((g) => { clinch[g] = clinchInfo(g); });
    renderBracketInto(host, {
      picks: officialPicks(),
      interactive: false,
      lockedFn: () => false,
      lockMark: (id, side) => {
        if (BRACKET[id].round !== "R32") return false;
        const spec = side === "home" ? BRACKET[id].home : BRACKET[id].away;
        if (typeof spec !== "string") return false;
        const g = spec[1];
        if (spec[0] === "1") return !!(clinch[g] && clinch[g].posClinched[1]);
        if (spec[0] === "2") return !!(clinch[g] && clinch[g].posClinched[2]);
        return false; // 3rd-place slots: cross-group clinch not marked
      },
      champLabel: "Champion",
      emptyLabel: open ? "To be decided" : "Group stage in progress",
    });
  });
  const pill = document.getElementById("official-status");
  if (pill) {
    pill.textContent = open ? "🔒 Official — locked" : "⏳ Provisional";
    pill.className = "official-pill " + (open ? "is-official" : "is-temp");
  }
  renderOfficialStandings();
}

/* Compact real-results group standings under the Official Bracket: flag + code,
   W-D-L · GD · Pts, with x/y clinch markers and advance(green)/out(red) rows. */
function renderOfficialStandings() {
  const host = document.getElementById("official-standings");
  if (!host) return;
  withRealStandings(() => {
    const advancing = new Set(rankedThirds().slice(0, 8).map((t) => t.group));
    host.innerHTML = GROUP_LETTERS.map((g) => {
      const ranked = rankGroup(g);
      const cl = clinchInfo(g);
      const complete = realScores(g).every((s) => s[0] != null);
      const rows = ranked.map((s, pos) => {
        // Cross-out is reserved for mathematical elimination (or a finished
        // group's non-qualifying 3rd); 1st/2nd green and advancing-3rd green are
        // live-position shading, x/y appear only once clinched.
        const struck = cl.elim[s.idx] || (complete && pos === 2 && !advancing.has(g));
        const cls = struck ? "out"
          : pos < 2 ? "qualified"
          : pos === 2 && advancing.has(g) ? "adv" : "";
        const mark = cl.x[s.idx] ? '<span class="os-x">x</span>'
          : cl.y[s.idx] ? '<span class="os-y">y</span>' : "";
        return `<tr class="${cls}">
            <td class="op">${pos + 1}</td>
            <td class="oc"><span class="flag">${flagHtml(codeFor(g, s.idx))}</span><span class="ocode">${escapeHtml(code3(s.name))}</span>${mark}</td>
            <td>${s.w}</td><td>${s.d}</td><td>${s.l}</td>
            <td>${s.gd > 0 ? "+" + s.gd : s.gd}</td>
            <td class="opts">${s.pts}</td>
          </tr>`;
      }).join("");
      return `<div class="os-group">
          <div class="os-gtitle">Group ${g}</div>
          <table class="os-table">
            <thead><tr><th></th><th></th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pt</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join("");
  });
}

/* Second-chance knockout-only bracket. Seeds resolve from the real Round of 32
   (groups are done by the time it opens); only fillable once knockoutOpen(),
   then each pick freezes at its own match kickoff. */
function renderSecondBracket() {
  const host = document.getElementById("second-bracket");
  if (!host) return;
  const open = knockoutOpen();
  renderBracketInto(host, {
    picks: state.bracket2,
    interactive: open,
    lockedFn: (id) => koMatchLocked(id),
    champLabel: "Your champion",
    emptyLabel: open ? "Pick winners to crown a champion" : "Opens when the group stage ends",
  });
  renderSecondEliminated();
}

/* The four third-placed teams that did NOT make the top 8 — shown struck-out
   at the bottom of the Second-Chance bracket (projected until the groups end,
   then official). Real standings only. */
function renderSecondEliminated() {
  const host = document.getElementById("second-eliminated");
  if (!host) return;
  withRealStandings(() => {
    const open = knockoutOpen();
    const out = rankedThirds().slice(8); // 9th–12th best thirds are eliminated
    const chips = out.map((s) =>
      `<span class="elim-chip"><span class="flag">${flagHtml(codeFor(s.group, s.idx))}</span><span class="elim-code">${escapeHtml(code3(s.name))}</span><span class="elim-grp">${s.group}</span></span>`
    ).join("");
    host.innerHTML =
      `<div class="elim-head">${open ? "Eliminated 3rd-place teams" : "Projected eliminated 3rd-place teams"}</div>
       <div class="elim-row">${chips || '<span class="elim-none">—</span>'}</div>`;
  });
}

/* ================= Result mode (Win/Draw/Loss) ================= */
/* A result pick stores a canonical scoreline so the standings and
   bracket engines stay unchanged: home win 1-0, draw 0-0, away 0-1. */
function resultOf(score) {
  if (score[0] === null || score[1] === null) return null;
  if (score[0] > score[1]) return "home";
  if (score[0] < score[1]) return "away";
  return "draw";
}

function updateResultButtons() {
  document.querySelectorAll(".match").forEach((row) => {
    const res = resultOf(state.scores[row.dataset.group][+row.dataset.match]);
    row.querySelectorAll(".res-btn").forEach((b) => {
      b.classList.toggle("sel", b.dataset.res === res);
    });
  });
}

function setMode(mode) {
  state.mode = mode === "result" ? "result" : "score";
  document.body.classList.toggle("mode-result", state.mode === "result");
  document.getElementById("mode-score").classList.toggle("active", state.mode === "score");
  document.getElementById("mode-result").classList.toggle("active", state.mode === "result");
}

/* Switch between the main predictor and the second-chance round. The
   second-chance button stays disabled until the knockout round opens. */
let currentView = "main";
function setView(view) {
  currentView = view === "second" ? "second" : "main";
  document.body.classList.toggle("view-second", currentView === "second");
  const vMain = document.getElementById("view-main");
  const vSecond = document.getElementById("view-second");
  if (vMain) vMain.classList.toggle("active", currentView === "main");
  if (vSecond) vSecond.classList.toggle("active", currentView === "second");
  if (currentView === "second") {
    renderSecondBracket();
    const sec = document.getElementById("second-section");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  fitBrackets(); // size whichever brackets just became visible
}
function refreshViewControls() {
  const open = knockoutOpen();
  const vSecond = document.getElementById("view-second");
  if (vSecond) {
    vSecond.disabled = !open;
    vSecond.title = open ? "Second-chance knockout round" : "Opens when the group stage is decided";
  }
  const copyMain = document.getElementById("copy-main-bracket");
  if (copyMain) {
    copyMain.disabled = !open;
    copyMain.title = open ? "Copy your main bracket (eliminated teams left off)" : "Opens when the group stage is decided";
  }
}

/* ================= Live (actual) results ================= */
/* Actual results are never written into your predictions — a locked match is
   either a real pick you entered before kickoff (graded) or blue (not entered
   in time). The old "Load actual results" override has been removed. */

/* ================= Leaderboard ================= */
const BOARD_KEY = "wc2026-leaderboard-v1";
const HIDDEN_USERS = new Set(["__setup_test__"]); // setup test row, hidden from the board
let board = [];

/* Shared leaderboard via Supabase when configured; else local-only. */
const SB =
  window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.supabase
    ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey)
    : null;
const SHARED = !!SB;

/* Identity for editing your single entry (one per browser). */
const MY_KEY = "wc2026-myentry-v1";
function getMine() {
  try { return JSON.parse(localStorage.getItem(MY_KEY)); } catch (e) { return null; }
}
function setMine(v) {
  try { localStorage.setItem(MY_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

/* ---- Google sign-in: one entry per person ---- */
let authUser = null;

async function initAuth() {
  if (!SHARED) { applyAuthUI(); return; }
  pendingJoin = normCode(groupParam() || "") || null; // ?group= invite link
  try {
    const { data } = await SB.auth.getSession();
    authUser = (data && data.session && data.session.user) || null;
  } catch (e) { /* ignore */ }
  // The predictor is gated behind Google sign-in: you enter only when actually
  // signed in (a valid session counts). No account → the title screen stays up.
  if (authUser) { showApp(); consumePendingJoin(); }
  SB.auth.onAuthStateChange((_event, sess) => {
    authUser = (sess && sess.user) || null;
    if (authUser) { showApp(); consumePendingJoin(); }
    else showTitle(); // signed out → back to the gate
    applyAuthUI();
    refreshBoard();
  });
  applyAuthUI();
}

function googleName() {
  const m = (authUser && authUser.user_metadata) || {};
  return m.full_name || m.name || (authUser && authUser.email) || "";
}

/* The board row that belongs to the current person. */
function myId() {
  if (SHARED && authUser) {
    const r = board.find((s) => s.user_id === authUser.id);
    return r ? r.id : null;
  }
  const m = getMine();
  return m ? m.id : null;
}

function applyAuthUI() {
  const signin = document.getElementById("signin");
  const signout = document.getElementById("signout");
  const who = document.getElementById("whoami");
  const submit = document.getElementById("submit-bracket");
  const username = document.getElementById("username");
  if (!signin || !signout || !who) return;
  if (!SHARED) { signin.style.display = "none"; signout.style.display = "none"; who.style.display = "none"; return; }
  // Submit & lock is always available — you can edit and hit it immediately;
  // if you're not signed in yet, clicking it kicks off Google sign-in.
  if (submit) submit.style.display = "";
  // "＋ Add a group" (create a pool) is admin-only.
  const addGrp = document.getElementById("add-group-btn");
  if (addGrp) addGrp.style.display = isAdmin() ? "" : "none";
  const rename = document.getElementById("rename");
  if (authUser) {
    signin.style.display = "none";
    signout.style.display = "";
    if (username && !username.value) username.value = googleName();
    if (username) username.style.display = "none"; // shown only while renaming
    who.style.display = "";
    who.textContent = "✓ " + ((username && username.value) || googleName());
    if (rename) rename.style.display = "";
  } else {
    signin.style.display = "";
    signout.style.display = "none";
    who.style.display = "none";
    if (username) username.style.display = "none";
    if (rename) rename.style.display = "none";
  }
  updateSubmitLabel();
}

async function signInWithGoogle() {
  if (!SHARED) return;
  try {
    await SB.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
  } catch (e) { alert("Sign-in failed: " + (e.message || e)); }
}

async function signOut() {
  try { await SB.auth.signOut(); } catch (e) { /* ignore */ }
  authUser = null;
  hydratedFull = false;
  resetEditor();   // don't leave your bracket on screen for the next person
  showTitle();     // back to the sign-in gate
  applyAuthUI();
  refreshBoard();
}

/* ---- Title / sign-in gate ---- */
const ENTERED_KEY = "wc2026-entered-v1";
function hasEntered() {
  try { return localStorage.getItem(ENTERED_KEY) === "1"; } catch (e) { return false; }
}
function markEntered() {
  try { localStorage.setItem(ENTERED_KEY, "1"); } catch (e) { /* ignore */ }
}
function showApp() {
  const ts = document.getElementById("title-screen");
  if (ts) ts.classList.add("hidden");
  document.body.classList.remove("title-active");
  fitBrackets(); // brackets are now measurable — size them
}
function showTitle() {
  const ts = document.getElementById("title-screen");
  if (ts) ts.classList.remove("hidden");
  document.body.classList.add("title-active");
}
function enterAsGuest() {
  const u = document.getElementById("title-username");
  const name = (u && u.value || "").trim();
  if (name) {
    const main = document.getElementById("username");
    if (main) main.value = name;
    if (!SHARED) {
      const mine = getMine() || {};
      setMine({ ...mine, username: name });
    }
  }
  markEntered();
  showApp();
}
function initTitleScreen() {
  const ts = document.getElementById("title-screen");
  if (!ts) return;
  const google = document.getElementById("title-google");
  const guest = document.getElementById("title-guest");
  const u = document.getElementById("title-username");
  const or = ts.querySelector(".title-or");

  if (SHARED) {
    // Shared leaderboard → Google sign-in is required. No guest bypass, and the
    // gate only lifts once you're actually signed in (see initAuth).
    if (guest) guest.style.display = "none";
    if (u) u.style.display = "none";
    if (or) or.style.display = "none";
    if (google) google.addEventListener("click", signInWithGoogle);
    if (authUser) { showApp(); return; }
    document.body.classList.add("title-active");
    return;
  }

  // Local-only mode (no backend): guest entry, remembered per device.
  if (google) google.style.display = "none";
  if (guest) guest.addEventListener("click", enterAsGuest);
  if (u) u.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enterAsGuest(); } });
  if (hasEntered()) { showApp(); return; }
  document.body.classList.add("title-active");
}

function loadBoard() {
  try {
    const s = JSON.parse(localStorage.getItem(BOARD_KEY));
    if (Array.isArray(s)) board = s;
  } catch (e) {
    /* ignore */
  }
}
function saveBoard() {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
  } catch (e) {
    /* ignore */
  }
}

async function loadBoardRemote() {
  try {
    const { data, error } = await SB.from("submissions")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    board = (data || []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username,
      createdAt: r.created_at,
      mode: r.mode,
      ...(r.payload || {}),
    }));
    await loadMembershipsRemote();
    renderScopeTabs();
    renderLeaderboard();
    hydrateMyGuesses();
    // Bracket-made odds derive from `board`, so refresh the schedule odds
    // boxes now that it has (re)loaded.
    if (window.WCBroadcasts) WCBroadcasts.fill(".schedule-strip .sch-watch");
  } catch (e) {
    console.warn("leaderboard load failed:", e.message || e);
  }
}

function refreshBoard() {
  if (SHARED) loadBoardRemote();
  else {
    loadBoard();
    renderLeaderboard();
    hydrateMyGuesses();
    if (window.WCBroadcasts) WCBroadcasts.fill(".schedule-strip .sch-watch");
  }
}

/* Load your own submitted entry into the editor so it's always there to edit —
   no "Edit" button needed. The FIRST time your entry is available we load it in
   full (every scoreline + the bracket), exactly like the old Edit did, so it
   looks complete (blue + gold) right away. Later background refreshes only fill
   gaps / locked matches so they never clobber edits you're making. */
/* Wipe the editor back to a blank slate (no predictions, no bracket). */
function resetEditor() {
  for (const g of GROUP_LETTERS) state.scores[g] = FIXTURES.map(() => [null, null]);
  state.bracket = {};
  state.bracket2 = {};
  editorLockedSet = new Set();
  syncInputs();
  renderAll();
  saveState();
}

let hydratedFull = false;
function hydrateMyGuesses() {
  const id = myId();
  if (!id) {
    // Signed in but no saved entry yet → start clean once, so a different/prior
    // account's locally-saved bracket never shows.
    if (SHARED && authUser && !hydratedFull) { resetEditor(); hydratedFull = true; }
    return;
  }
  const sub = board.find((s) => s.id === id);
  if (!sub || !sub.scores) return;
  setEditorLocked(sub);
  let changed = false;

  if (!hydratedFull) {
    for (const g of GROUP_LETTERS) {
      const arr = sub.scores[g] || [];
      for (let i = 0; i < 6; i++) {
        const sc = arr[i];
        state.scores[g][i] = (Array.isArray(sc) && sc[0] != null && sc[1] != null)
          ? [normScore(sc[0]), normScore(sc[1])] : [null, null];
      }
    }
    if (sub.bracket) state.bracket = JSON.parse(JSON.stringify(sub.bracket));
    if (sub.bracket2) state.bracket2 = JSON.parse(JSON.stringify(sub.bracket2));
    hydratedFull = true;
    changed = true;
  } else {
    for (const g of GROUP_LETTERS) {
      const arr = sub.scores[g] || [];
      arr.forEach((sc, i) => {
        const valid = Array.isArray(sc) && sc[0] != null && sc[1] != null;
        if (!valid) return;
        if (isLocked(g, i)) {
          state.scores[g][i] = [normScore(sc[0]), normScore(sc[1])];
          changed = true;
        } else {
          const cur = state.scores[g][i];
          if (cur[0] == null || cur[1] == null) {
            state.scores[g][i] = [normScore(sc[0]), normScore(sc[1])];
            changed = true;
          }
        }
      });
    }
  }

  if (changed) { syncInputs(); renderAll(); saveState(); }
  else markPredictionAccuracy();
}

/* ================= Pools (group leaderboards) ================= */
/* A "pool" is a shared code; the global board filtered to its members.
   Many-to-many, so you can be in several pools and still rank globally.
   Shared (Supabase) mode only — local-only mode keeps the single board. */
let myGroups = [];          // pools the signed-in user is in: [{code, name}]
let groupMembers = {};      // code -> Set(user_id), for filtering the board
let groupLocked = {};       // code -> bool (pool has a password) for the 🔒 badge
let boardScope = "global";  // "global" | a pool code
let pendingJoin = null;     // pool code from a ?group= invite, applied after sign-in

/* Only the admin can CREATE pools / set passwords (enforced server-side in the
   join_or_create_group RPC; this is only for tailoring the UI). Keep in sync
   with the admin_email in scripts/groups-setup.sql. */
const ADMIN_EMAIL = "andrewfogarty111@gmail.com";
function isAdmin() {
  return !!authUser && (authUser.email || "").toLowerCase() === ADMIN_EMAIL;
}

function normCode(c) {
  return (c || "").trim().toUpperCase().replace(/\s+/g, "-").slice(0, 32);
}

async function loadMembershipsRemote() {
  try {
    const { data, error } = await SB.from("memberships").select("user_id, group_code, group_name");
    if (error) throw error;
    groupMembers = {};
    const mine = [];
    for (const r of data || []) {
      (groupMembers[r.group_code] || (groupMembers[r.group_code] = new Set())).add(r.user_id);
      if (authUser && r.user_id === authUser.id) mine.push({ code: r.group_code, name: r.group_name || r.group_code });
    }
    myGroups = mine.sort((a, b) => a.name.localeCompare(b.name));
    // If we're viewing a pool we're no longer in, fall back to global.
    if (boardScope !== "global" && !myGroups.some((g) => g.code === boardScope)) boardScope = "global";
    // Which of my pools are password-protected (for the 🔒 badge).
    groupLocked = {};
    const codes = myGroups.map((g) => g.code);
    if (codes.length) {
      const { data: meta } = await SB.from("group_meta").select("code, locked").in("code", codes);
      for (const r of meta || []) groupLocked[r.code] = !!r.locked;
    }
  } catch (e) {
    console.warn("memberships load failed:", e.message || e);
  }
}

/* Join an existing pool (password checked server-side) or create it if the
   code is new. Returns { ok, needPassword }. */
async function joinGroup(code, password) {
  code = normCode(code);
  if (!SHARED || !code) return { ok: false };
  if (!authUser) { pendingJoin = code; signInWithGoogle(); return { ok: false }; }
  try {
    const { error } = await SB.rpc("join_or_create_group", {
      p_code: code, p_name: code, p_password: password || null,
    });
    if (error) {
      const m = (error.message || "").toLowerCase();
      if (/password/.test(m)) return { ok: false, needPassword: true };
      if (/not found/.test(m)) return { ok: false, notFound: true };
      throw error;
    }
    boardScope = code;
    await loadBoardRemote();
    return { ok: true };
  } catch (e) {
    alert("Couldn't join pool: " + (e.message || e));
    return { ok: false };
  }
}

async function leaveGroup(code) {
  if (!SHARED || !authUser) return;
  const g = myGroups.find((x) => x.code === code);
  if (!confirm(`Leave “${(g && g.name) || code}”? You can rejoin with the code.`)) return;
  try {
    const { error } = await SB.from("memberships").delete().eq("user_id", authUser.id).eq("group_code", code);
    if (error) throw error;
    boardScope = "global";
    await loadBoardRemote();
  } catch (e) {
    alert("Couldn't leave pool: " + (e.message || e));
  }
}

/* Apply a ?group= invite once the user is signed in. */
async function consumePendingJoin() {
  if (!pendingJoin || !SHARED || !authUser) return;
  const code = pendingJoin;
  pendingJoin = null;
  clearGroupParam();
  const res = await joinGroup(code);
  // Arriving via an invite link → only ask for the password (hide the code box).
  if (!res.ok && res.needPassword) openJoinPanel("password", code, "");
  else if (!res.ok && res.notFound) openJoinPanel("join", code, `No pool “${code}” yet.`);
}

/* Admin-only: set or change a pool's password (blank removes it). */
async function setPoolPassword(code) {
  if (!SHARED || !isAdmin()) return;
  const g = myGroups.find((x) => x.code === code);
  const name = (g && g.name) || code;
  const pw = prompt(`Set a password for “${name}”.\nLeave blank to remove the password (anyone can join):`, "");
  if (pw === null) return; // cancelled
  try {
    const { error } = await SB.rpc("set_group_password", { p_code: code, p_password: pw });
    if (error) throw error;
    await loadBoardRemote(); // refresh the 🔒 badge
    alert(pw ? `Password updated for “${name}”.` : `Password removed — “${name}” is now open.`);
  } catch (e) {
    alert("Couldn't update password: " + (e.message || e));
  }
}
function groupParam() {
  try { return new URLSearchParams(location.search).get("group"); } catch (e) { return null; }
}
function clearGroupParam() {
  try {
    const u = new URL(location.href);
    u.searchParams.delete("group");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  } catch (e) { /* ignore */ }
}

/* ---- Pool UI: scope tabs, join panel, invite/leave actions ---- */
function renderScopeTabs() {
  // Same pool tabs drive both the main and the second-chance leaderboards.
  renderScopeTabsInto("board-tabs");
  renderScopeTabsInto("second-board-tabs");
  renderPoolActions();
}
function renderScopeTabsInto(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!SHARED) { el.style.display = "none"; return; }
  const globalCount = board.filter((s) => !HIDDEN_USERS.has(s.username)).length;
  const tabs = [{ code: "global", label: "🌐 Global", count: globalCount }].concat(
    myGroups.map((g) => ({ code: g.code, label: (groupLocked[g.code] ? "🔒 " : "") + g.name, count: (groupMembers[g.code] || new Set()).size }))
  );
  el.innerHTML =
    tabs.map((t) =>
      `<button class="board-tab${t.code === boardScope ? " active" : ""}" data-code="${escapeHtml(t.code)}" role="tab" aria-selected="${t.code === boardScope}">${escapeHtml(t.label)} <span class="bt-count">${t.count}</span></button>`
    ).join("") +
    `<button class="board-tab join" data-code="__join__" type="button" title="Join or create a pool">＋ Pool</button>`;
}

function renderPoolActions() {
  const el = document.getElementById("pool-actions");
  if (!el) return;
  if (!SHARED || boardScope === "global") { el.innerHTML = ""; return; }
  const g = myGroups.find((x) => x.code === boardScope);
  el.innerHTML =
    `<button class="btn ghost" id="copy-invite" type="button">🔗 Copy invite link</button>` +
    (isAdmin() ? `<button class="btn ghost" id="set-pass" type="button">🔒 Set password</button>` : "") +
    `<button class="btn ghost" id="leave-pool" type="button">Leave “${escapeHtml((g && g.name) || boardScope)}”</button>`;
}

/* Open the join panel in one of three modes:
   - "join"     : just a pool-code box (no password — that's only asked for if
                  the pool turns out to be locked).
   - "create"   : admin-only — name + optional password to make a new group.
   - "password" : locked pool / invite link — code hidden, password only. */
function openJoinPanel(mode, code, msg) {
  const panel = document.getElementById("join-panel");
  if (!panel) return;
  panel.hidden = false;
  panel.dataset.mode = mode;
  const codeEl = document.getElementById("join-code");
  const passEl = document.getElementById("join-pass");
  const go = document.getElementById("join-go");
  const title = document.getElementById("join-title");
  const m = document.getElementById("join-msg");
  if (mode === "password") {
    if (codeEl) { codeEl.value = code || ""; codeEl.style.display = "none"; }
    if (passEl) { passEl.style.display = ""; passEl.placeholder = "Password"; }
    if (title) { title.textContent = `🔒 Enter the password for “${code}”`; title.style.display = ""; }
    if (go) go.textContent = "Join";
  } else if (mode === "create") {
    if (codeEl) { codeEl.style.display = ""; codeEl.value = code || ""; codeEl.placeholder = "New group name"; }
    if (passEl) { passEl.style.display = ""; passEl.placeholder = "Password (optional)"; }
    if (title) { title.textContent = "Create a group"; title.style.display = ""; }
    if (go) go.textContent = "Create";
  } else { // "join"
    if (codeEl) { codeEl.style.display = ""; codeEl.value = code || ""; codeEl.placeholder = "Pool code"; }
    if (passEl) { passEl.style.display = "none"; } // password only appears if the pool is locked
    if (title) { title.textContent = "Join a pool"; title.style.display = ""; }
    if (go) go.textContent = "Join";
  }
  if (passEl) passEl.value = "";
  if (m) m.textContent = msg || "";
  const focusEl = (mode === "password") ? passEl : codeEl;
  if (focusEl) focusEl.focus();
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}
function closeJoinPanel() {
  const panel = document.getElementById("join-panel");
  if (panel) panel.hidden = true;
}

function setupBoardUI() {
  const scope = document.getElementById("board-scope");
  const clear = document.getElementById("clear-board");
  if (SHARED) {
    if (scope) scope.textContent = "🌐 Shared leaderboard";
    if (clear) clear.style.display = "none";
    const joinBtn = document.getElementById("join-pool-btn");
    if (joinBtn) joinBtn.style.display = "";
    renderScopeTabs();
    setInterval(loadBoardRemote, 45000); // keep roughly in sync
  } else {
    if (scope) scope.textContent = "💾 This device";
    ["board-tabs", "join-panel", "pool-actions", "join-pool-btn", "add-group-btn"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.style.display = "none";
    });
  }
}

/* outcome + scoreMatch live in lib/engine.js (so they're unit-tested). */
const outcome = GSB.outcome;
const scoreMatch = GSB.scoreMatch;

/* Teams a submission predicted to reach each knockout round (snapshotted
   at submit time from the bracket picks). */
function predictedAdvancementFrom(picks) {
  const names = (ids) =>
    ids.map((id) => { const w = winnerOf(id, picks); return w && w.known ? w.name : null; }).filter(Boolean);
  const champ = winnerOf(104, picks);
  return {
    R16: names(ROUND_ORDER.R32),
    QF: names(ROUND_ORDER.R16),
    SF: names(ROUND_ORDER.QF),
    FINAL: names(ROUND_ORDER.SF),
    champion: champ && champ.known ? champ.name : null,
  };
}
function predictedAdvancement() { return predictedAdvancementFrom(state.bracket); }

/* Teams a submission predicted to reach each round. Uses the snapshot saved
   at submit time; falls back to recomputing from the stored picks for older
   entries that pre-date the snapshot. */
function subPredicted(sub) {
  if (sub.predicted) return sub.predicted;
  const savedScores = state.scores, savedBracket = state.bracket, savedThird = thirdMap;
  try {
    if (sub.scores) state.scores = sub.scores;
    if (sub.bracket) state.bracket = sub.bracket;
    thirdMap = thirdAssignments();
    return predictedAdvancement();
  } finally {
    state.scores = savedScores;
    state.bracket = savedBracket;
    thirdMap = savedThird;
  }
}

/* Reconstruct a submission's knockout bracket (R16 → Final) as match nodes so
   the leaderboard "View" can draw a mini version of the official tree. Each
   node carries both participants, which side was picked to advance, and whether
   that pick was correct (vs live results). State is swapped temporarily so the
   existing participant()/bracketAccuracy() engines work unchanged. */
function subBracketTree(sub) {
  const savedScores = state.scores, savedBracket = state.bracket, savedThird = thirdMap;
  try {
    if (sub.scores) state.scores = sub.scores;
    if (sub.bracket) state.bracket = sub.bracket;
    thirdMap = thirdAssignments();
    const node = (id) => {
      const w = state.bracket[id] || null; // "home" | "away" | null
      return {
        id,
        home: participant(id, "home"),
        away: participant(id, "away"),
        pick: w,
        acc: w ? bracketAccuracy(id, w) : "", // "correct" | "wrong" | ""
      };
    };
    const round = (ids) => ids.map(node);
    const champ = winnerOf(104);
    return {
      R32: round(ROUND_ORDER.R32),
      R16: round(ROUND_ORDER.R16),
      QF: round(ROUND_ORDER.QF),
      SF: round(ROUND_ORDER.SF),
      F: round([104]),
      champion: champ && champ.known && champ.name
        ? { name: champ.name, code: champ.code, acc: bracketAccuracy(104, state.bracket[104]) }
        : null,
    };
  } finally {
    state.scores = savedScores;
    state.bracket = savedBracket;
    thirdMap = savedThird;
  }
}

function liveResults() {
  return (window.WC_LIVE && window.WC_LIVE.results) || {};
}

function isConfirmed(g, i) {
  const live = liveResults();
  return !!(live[g] && live[g][i] && live[g][i][0] !== null && live[g][i][1] !== null);
}

/* True once the match has kicked off (scheduled start time has passed). */
function kickoffPassed(g, i) {
  const ko = (KICKOFF.byGF[g] || [])[i];
  return ko != null && Date.now() >= ko;
}

/* A match is locked for editing once it has an official result OR has kicked
   off — you can no longer add or change a prediction for it. */
function isLocked(g, i) {
  return isConfirmed(g, i) || kickoffPassed(g, i);
}

/* Matches already officially confirmed when a submission was made — these
   don't count toward the leaderboard (you can't "guess" a known result). */
function confirmedKeysNow() {
  const keys = [];
  for (const g of GROUP_LETTERS) for (let i = 0; i < 6; i++) if (isConfirmed(g, i)) keys.push(g + i);
  return keys;
}

/* Lock (🔒 + disable inputs) any group match that has kicked off or is
   officially confirmed. Re-run on a timer so matches lock live at kickoff. */
function markConfirmedMatches() {
  document.querySelectorAll(".match").forEach((row) => {
    const locked = isLocked(row.dataset.group, +row.dataset.match);
    row.classList.toggle("confirmed", locked);
    // only un-started, unconfirmed games can be changed
    row.querySelectorAll(".goal, .res-btn").forEach((el) => { el.disabled = locked; });
  });
  markBracketLocks();
}

/* Re-assert bracket locks on the existing DOM (no re-render, so scroll position
   and hover survive) — lets a bracket left open freeze live at kickoff. */
function applyLocks(sel, lockedFn, badge) {
  document.querySelectorAll(sel + " .bm").forEach((card) => {
    const id = +card.dataset.id;
    if (!id) return;
    const locked = lockedFn(id);
    const showBadge = locked && badge;
    card.classList.toggle("ko-locked", showBadge);
    card.querySelectorAll(".bm-row").forEach((b) => { b.disabled = locked; });
    const existing = card.querySelector(".bm-lock");
    if (showBadge && !existing) {
      const span = document.createElement("span");
      span.className = "bm-lock";
      span.title = "Locked — this pick can no longer be changed";
      span.setAttribute("aria-hidden", "true");
      span.textContent = "🔒";
      card.appendChild(span);
    } else if (!showBadge && existing) {
      existing.remove();
    }
  });
}

function markBracketLocks() {
  if (typeof knockoutOpen !== "function") return;
  const koOpen = knockoutOpen();
  // Main bracket: every pick freezes once the knockout round opens; before
  // that, each match still freezes individually at its own kickoff.
  applyLocks("#bracket", (id) => koOpen || koMatchLocked(id), true);
  // Second-chance bracket: not editable until the round opens, then per-match.
  applyLocks("#second-bracket", (id) => !koOpen || koMatchLocked(id), koOpen);
}

/* A match counts as "not your prediction" only if it was already finished when
   you locked your bracket (in `locked`) AND your stored value is missing or
   exactly equals the actual result — i.e. it was auto-filled, not predicted. A
   locked match whose stored guess DIFFERS from the result is a genuine pick you
   made before kickoff, so it still shows and scores. */
function effectivelyPreLocked(g, i, pred, act, lockedSet) {
  if (!lockedSet.has(g + i)) return false;
  const hasGuess = pred && pred[0] != null && pred[1] != null;
  if (!hasGuess) return true;
  if (act && act[0] != null && pred[0] === act[0] && pred[1] === act[1]) return true;
  return false;
}

function scoreSubmission(sub) {
  const live = liveResults();
  const allowExact = sub.mode !== "result";
  const lockedSet = new Set(sub.locked || []);
  let total = 0, exact = 0, outc = 0, miss = 0, scored = 0, locked = 0;
  for (const g of GROUP_LETTERS) {
    const preds = (sub.scores && sub.scores[g]) || [];
    const acts = live[g] || [];
    for (let i = 0; i < 6; i++) {
      // Auto-filled / pre-locked matches don't count; genuine picks (incl. ones
      // predicted before kickoff that later locked) do.
      if (effectivelyPreLocked(g, i, preds[i], acts[i], lockedSet)) { locked++; continue; }
      const r = scoreMatch(preds[i], acts[i], allowExact);
      if (r.kind === "exact") { total += 50; exact++; scored++; }
      else if (r.kind === "outcome") { total += 10; outc++; scored++; }
      else if (r.kind === "miss") { miss++; scored++; }
    }
  }

  // Knockout: +20 per team correctly predicted to reach a round, +100 champion.
  const { koHits, champ } = koScore(sub.predicted);
  total += koHits * 20 + champ;

  return { total, exact, outcome: outc, miss, scored, locked, koHits, champ };
}

/* Knockout points for an advancement snapshot vs. the real results:
   +20 per team correctly placed in R16/QF/SF/FINAL, +100 for the champion. */
function koScore(pred) {
  const adv = (window.WC_LIVE && window.WC_LIVE.advanced) || {};
  pred = pred || {};
  let koHits = 0, champ = 0;
  for (const r of ["R16", "QF", "SF", "FINAL"]) {
    const actual = new Set(adv[r] || []);
    for (const t of pred[r] || []) if (actual.has(t)) koHits++;
  }
  if (pred.champion && adv.champion && pred.champion === adv.champion) champ = 100;
  return { koHits, champ, total: koHits * 20 + champ };
}

/* Second-chance leaderboard score — knockout only, from the predicted2 snapshot. */
function scoreSecondChance(sub) {
  const { koHits, champ, total } = koScore(sub.predicted2);
  return { total, koHits, champ };
}

async function submitPredictions() {
  const input = document.getElementById("username");
  // `locked` = matches already finished the FIRST time you committed a bracket.
  // Preserve it across updates so editing later never excludes picks you'd made
  // before those games kicked off (only set fresh on a brand-new entry).
  const existing = SHARED && authUser
    ? board.find((s) => s.user_id === authUser.id)
    : (getMine() ? board.find((s) => s.id === getMine().id) : null);
  const payload = {
    scores: JSON.parse(JSON.stringify(state.scores)),
    bracket: JSON.parse(JSON.stringify(state.bracket)),
    locked: (existing && Array.isArray(existing.locked)) ? existing.locked : confirmedKeysNow(),
    predicted: predictedAdvancement(), // teams sent to each knockout round
  };
  // Don't clobber a second-chance bracket the player already submitted.
  if (existing && existing.bracket2) { payload.bracket2 = existing.bracket2; payload.predicted2 = existing.predicted2; }
  if (SHARED) {
    if (!authUser) { signInWithGoogle(); return; } // one entry per person → must sign in
    const name = (input.value || "").trim() || googleName();
    const btn = document.getElementById("submit-bracket");
    btn.disabled = true;
    try {
      // one row per user_id → upsert (insert or update your own entry)
      const { error } = await SB.from("submissions").upsert(
        { user_id: authUser.id, username: name, mode: state.mode, payload },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      await loadBoardRemote();
    } catch (e) {
      alert("Save failed: " + (e.message || e));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
  } else {
    const name = (input.value || "").trim();
    if (!name) { input.focus(); return; }
    const mine = getMine();
    const editKey = (mine && mine.editKey) || Math.random().toString(36).slice(2);
    payload.editKey = editKey;
    const i = mine && mine.id ? board.findIndex((s) => s.id === mine.id) : -1;
    if (i >= 0) {
      board[i] = { ...board[i], username: name, mode: state.mode, ...payload };
    } else {
      const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      board.push({ id, username: name, createdAt: new Date().toISOString(), mode: state.mode, ...payload });
      setMine({ id, editKey, username: name });
    }
    saveBoard();
    renderLeaderboard();
  }
  setSubmitted();
  document.getElementById("leaderboard-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateSubmitLabel() {
  const btn = document.getElementById("submit-bracket");
  if (btn && !btn.classList.contains("submitted")) {
    btn.textContent = "🔒 Submit & lock";
  }
}

function setSubmitted() {
  const btn = document.getElementById("submit-bracket");
  if (!btn) return;
  btn.textContent = "✓ Submitted";
  btn.classList.add("submitted");
}

/* ---- Second-chance submit (knockout-only, separate leaderboard) ---- */
function markSecondDirty() {
  const btn = document.getElementById("submit-second");
  if (btn) btn.classList.remove("submitted");
  updateSecondSubmitLabel();
}

/* Carry the main-predictor knockout picks into the Second-Chance bracket,
   keeping only teams that actually qualified (a pick whose team isn't a real
   participant of that match is simply skipped). */
function copyMainToSecond() {
  if (!knockoutOpen()) { alert("The second-chance round opens once the group stage is decided."); return; }
  const hasPicks = Object.values(state.bracket2 || {}).some(Boolean);
  if (hasPicks && !confirm("Replace your current second-chance picks with your main bracket (eliminated teams left blank)?")) return;
  const next = {};
  const ids = [].concat(ROUND_ORDER.R32, ROUND_ORDER.R16, ROUND_ORDER.QF, ROUND_ORDER.SF, [104]);
  for (const id of ids) {
    const w = winnerOf(id, state.bracket); // team I picked to win this match in the main bracket
    if (!w || !w.known || !w.name) continue;
    for (const side of ["home", "away"]) {
      const p = participant(id, side, next); // real participant given picks so far
      if (p && p.name === w.name) { next[id] = side; break; }
    }
  }
  state.bracket2 = next;
  saveState();
  renderSecondBracket();
  fitBrackets();
  markSecondDirty();
}
function updateSecondSubmitLabel() {
  const btn = document.getElementById("submit-second");
  if (btn && !btn.classList.contains("submitted")) btn.textContent = "🔒 Submit second-chance bracket";
}
function setSecondSubmitted() {
  const btn = document.getElementById("submit-second");
  if (!btn) return;
  btn.textContent = "✓ Submitted";
  btn.classList.add("submitted");
}

async function submitSecondChance() {
  if (!knockoutOpen()) { alert("The second-chance round opens once the group stage is decided."); return; }
  const existing = SHARED && authUser
    ? board.find((s) => s.user_id === authUser.id)
    : (getMine() ? board.find((s) => s.id === getMine().id) : null);
  const bracket2 = JSON.parse(JSON.stringify(state.bracket2));
  const predicted2 = predictedAdvancementFrom(state.bracket2);

  if (SHARED) {
    if (!authUser) { signInWithGoogle(); return; }
    const name = (document.getElementById("username").value || "").trim() || googleName();
    const btn = document.getElementById("submit-second");
    if (btn) btn.disabled = true;
    try {
      // Merge into the player's existing row so the main bracket is preserved.
      const payload = {
        scores: (existing && existing.scores) || JSON.parse(JSON.stringify(state.scores)),
        bracket: (existing && existing.bracket) || JSON.parse(JSON.stringify(state.bracket)),
        locked: (existing && existing.locked) || confirmedKeysNow(),
        predicted: (existing && existing.predicted) || predictedAdvancement(),
        bracket2, predicted2,
      };
      const { error } = await SB.from("submissions").upsert(
        { user_id: authUser.id, username: name, mode: (existing && existing.mode) || state.mode, payload },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      await loadBoardRemote();
    } catch (e) {
      alert("Save failed: " + (e.message || e));
      if (btn) btn.disabled = false;
      return;
    }
    if (btn) btn.disabled = false;
  } else {
    const mine = getMine();
    const i = mine && mine.id ? board.findIndex((s) => s.id === mine.id) : -1;
    if (i >= 0) board[i] = { ...board[i], bracket2, predicted2 };
    else {
      const name = (document.getElementById("username").value || "").trim();
      if (!name) { document.getElementById("username").focus(); return; }
      const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      board.push({ id, username: name, createdAt: new Date().toISOString(), mode: state.mode, bracket2, predicted2 });
      setMine({ id, editKey: Math.random().toString(36).slice(2), username: name });
    }
    saveBoard();
    renderLeaderboard();
  }
  setSecondSubmitted();
  const board2 = document.getElementById("second-leaderboard");
  if (board2) board2.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLeaderboard() {
  const tbody = document.querySelector("#leaderboard-table tbody");
  if (!tbody) return;
  let pool = board.filter((s) => !HIDDEN_USERS.has(s.username));
  const inPool = SHARED && boardScope !== "global";
  if (inPool) {
    const members = groupMembers[boardScope] || new Set();
    pool = pool.filter((s) => members.has(s.user_id));
  }
  const rows = pool
    .map((s) => ({ sub: s, sc: scoreSubmission(s) }))
    .sort((a, b) => b.sc.total - a.sc.total || a.sub.createdAt.localeCompare(b.sub.createdAt));
  if (rows.length === 0) {
    const msg = inPool
      ? "No one in this pool yet — share the invite link to fill it up."
      : "No entries yet — submit a bracket above to start the leaderboard.";
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${msg}</td></tr>`;
    return;
  }
  const mineId = myId();
  tbody.innerHTML = rows
    .map((e, i) => `
      <tr class="${i === 0 ? "leader" : ""} ${e.sub.id === mineId ? "mine" : ""}">
        <td class="col-pos">${i + 1}</td>
        <td class="col-team">${escapeHtml(e.sub.username)}${e.sub.id === mineId ? ' <span class="you">you</span>' : ""}</td>
        <td class="pts">${e.sc.total}</td>
        <td class="col-breakdown">${e.sc.exact}×50 · ${e.sc.outcome}×10${e.sc.koHits ? " · KO " + e.sc.koHits + "×20" : ""}${e.sc.champ ? " · 🏆100" : ""}</td>
        <td>${e.sub.mode === "result" ? "W/D/L" : "Score"}</td>
        <td class="lb-actions">
          <button class="lb-view" data-id="${e.sub.id}" type="button">View</button>
          ${(!SHARED || e.sub.id === mineId) ? `<button class="lb-del" data-id="${e.sub.id}" type="button" title="Delete my entry" aria-label="Delete">✕</button>` : ""}
        </td>
      </tr>`)
    .join("");

  renderSecondLeaderboard();
}

/* Separate parallel leaderboard for the second-chance round (knockout points
   only). Shares the same pool scope/tabs; lists only players who submitted a
   second-chance bracket. */
function renderSecondLeaderboard() {
  const tbody = document.querySelector("#second-leaderboard-table tbody");
  if (!tbody) return;
  let pool = board.filter((s) => !HIDDEN_USERS.has(s.username) && s.predicted2);
  const inPool = SHARED && boardScope !== "global";
  if (inPool) {
    const members = groupMembers[boardScope] || new Set();
    pool = pool.filter((s) => members.has(s.user_id));
  }
  const rows = pool
    .map((s) => ({ sub: s, sc: scoreSecondChance(s) }))
    .sort((a, b) => b.sc.total - a.sc.total || a.sub.createdAt.localeCompare(b.sub.createdAt));
  if (rows.length === 0) {
    const msg = knockoutOpen()
      ? "No second-chance brackets yet — fill yours above and submit."
      : "Opens when the group stage is decided.";
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">${msg}</td></tr>`;
    return;
  }
  const mineId = myId();
  tbody.innerHTML = rows
    .map((e, i) => `
      <tr class="${i === 0 ? "leader" : ""} ${e.sub.id === mineId ? "mine" : ""}">
        <td class="col-pos">${i + 1}</td>
        <td class="col-team">${escapeHtml(e.sub.username)}${e.sub.id === mineId ? ' <span class="you">you</span>' : ""}</td>
        <td class="pts">${e.sc.total}</td>
        <td class="col-breakdown">${e.sc.koHits ? "KO " + e.sc.koHits + "×20" : "—"}${e.sc.champ ? " · 🏆100" : ""}</td>
      </tr>`)
    .join("");
}

/* Mini knockout bracket (R16 → Final → Champion) for a leaderboard entry.
   A flex column per round + an SVG overlay of elbow connectors that link each
   picked winner to its match in the next round, mirroring the official tree. */
function renderMiniBracket(sub) {
  const tree = subBracketTree(sub);

  const teamRow = (p, picked, acc, extra) => {
    const known = p && p.known && p.name;
    const prov = p && !known && p.provisional && p.name;
    const show = known || prov;
    const cls = (picked ? "pick " + (acc || "pending") : "dim") + (prov ? " prov" : "");
    const flag = show ? flagHtml(p.code) : '<span class="mb-dot">•</span>';
    const code = show ? code3(p.name) : "—";
    const ttl = show ? p.name + (prov ? " (provisional)" : "") : (p && p.label) || "TBD";
    return `<div class="mb-team ${cls} ${extra || ""}" title="${escapeHtml(ttl)}">
        <span class="mb-flag">${flag}</span><span class="mb-code">${escapeHtml(code)}</span>
      </div>`;
  };

  const matchHtml = (m) =>
    `<div class="mb-match">
        ${teamRow(m.home, m.pick === "home", m.acc, "")}
        ${teamRow(m.away, m.pick === "away", m.acc, "")}
      </div>`;

  const roundHtml = (nodes, cls) =>
    `<div class="mb-round ${cls || ""}">${nodes.map(matchHtml).join("")}</div>`;

  // Champion column (single highlighted team).
  const ch = tree.champion;
  const champHtml = `<div class="mb-round mb-champ-col">
      <div class="mb-match">
        ${ch
          ? `<div class="mb-team pick champ ${ch.acc || "pending"}" title="${escapeHtml(ch.name)}">
               <span class="mb-flag">${flagHtml(ch.code)}</span><span class="mb-code">${escapeHtml(code3(ch.name))}</span>
             </div>`
          : `<div class="mb-team dim champ" title="No champion picked"><span class="mb-flag">🏆</span><span class="mb-code">—</span></div>`}
      </div>
    </div>`;

  // SVG elbow connectors. Geometry is deterministic for a power-of-two tree:
  // a round of n matches has vertical centres at (2i+1)/(2n). Columns are 6
  // equal slots (R32, R16, QF, SF, Final, Champion); boxes sit in the slot
  // centre so the gutter between them hosts the connector verticals.
  const NCOL = 6;
  const cy = (i, n) => (100 * (2 * i + 1)) / (2 * n);
  const slotW = 100 / NCOL;
  const hw = slotW * 0.42;              // half box width (% of viewBox)
  const xc = (c) => slotW * (c + 0.5);  // column centre x
  let d = "";
  const link = (c, n) => {              // n = match count in source round
    const x0r = xc(c) + hw, x1l = xc(c + 1) - hw, b = (xc(c) + xc(c + 1)) / 2;
    for (let j = 0; j < n / 2; j++) {
      const a = cy(2 * j, n), bb = cy(2 * j + 1, n), mid = (a + bb) / 2;
      d += `M${x0r} ${a}H${b}M${x0r} ${bb}H${b}M${b} ${a}V${bb}M${b} ${mid}H${x1l}`;
    }
  };
  link(0, 16); // R32 -> R16
  link(1, 8);  // R16 -> QF
  link(2, 4);  // QF  -> SF
  link(3, 2);  // SF  -> Final
  d += `M${xc(4) + hw} 50H${xc(5) - hw}`; // Final -> Champion
  const lines = `<svg class="mb-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;

  return `<div class="sc-ko">
      <div class="sc-ko-title">Knockout bracket</div>
      <div class="mb-wrap">
        <div class="mini-bracket has-r32">
          ${lines}
          ${roundHtml(tree.R32, "r-r32")}
          ${roundHtml(tree.R16, "r-r16")}
          ${roundHtml(tree.QF, "r-qf")}
          ${roundHtml(tree.SF, "r-sf")}
          ${roundHtml(tree.F, "r-f")}
          ${champHtml}
        </div>
      </div>
      <div class="mb-legend">
        <span class="mb-key correct">advanced</span>
        <span class="mb-key wrong">missed</span>
        <span class="mb-key pending">undecided</span>
      </div>
    </div>`;
}

/* Detailed scorecard with green/gold/red highlighting per match. */
function renderScorecard(id) {
  const host = document.getElementById("scorecard");
  const sub = board.find((s) => s.id === id);
  if (!sub) { host.innerHTML = ""; return; }
  const live = liveResults();
  const allowExact = sub.mode !== "result";
  const sc = scoreSubmission(sub);
  const lockedSet = new Set(sub.locked || []);

  const sym = (s) => {
    const o = outcome(s);
    return o === "home" ? "1" : o === "draw" ? "X" : o === "away" ? "2" : "—";
  };
  const fmt = (s) => (s && s[0] !== null ? `${s[0]}–${s[1]}` : "—");

  let html = `<div class="sc-head">
      <span class="sc-name">${escapeHtml(sub.username)}</span>
      <span class="sc-total">${sc.total} pts</span>
      <span class="sc-sub">${sc.exact} exact · ${sc.outcome} result · ${sc.miss} miss${sc.locked ? " · " + sc.locked + " pre-locked" : ""}${sc.koHits ? " · KO " + sc.koHits + "×20" : ""}${sc.champ ? " · 🏆+100" : ""}</span>
      <button class="sc-close" type="button" aria-label="Close">✕</button>
    </div>
    <div class="sc-legend">
      <span class="sc-chip exact">50</span> exact
      <span class="sc-chip outcome">10</span> result
      <span class="sc-chip miss">0</span> miss
      <span class="sc-chip pending">·</span> not played
      <span class="sc-chip none was-locked">·</span> done before you joined
      <span class="sc-chip missing">!</span> unfilled (slot seeds roughly)
    </div>`;

  // Genuinely-missing entries in this submission — the cause of an unseeded
  // knockout bracket. Flagged red below and summarised in a banner.
  const missByGroup = {};
  GROUP_LETTERS.forEach((g) => (missByGroup[g] = new Set(missingMatchesIn(g, sub.scores))));
  const gaps = GROUP_LETTERS.filter((g) => missByGroup[g].size);
  const totalMissing = gaps.reduce((n, g) => n + missByGroup[g].size, 0);
  if (gaps.length) {
    html += `<div class="sc-warn" role="status">⚠
      <strong>${totalMissing} unfilled match${totalMissing === 1 ? "" : "es"}</strong> —
      touched groups still seed the bracket <em>roughly</em>; these aren't locked
      (3rd-place teams lock once every group is done):
      ${gaps.map((g) => `Group ${g} (${[...missByGroup[g]].map((i) => escapeHtml(matchLabel(g, i))).join(", ")})`).join(" · ")}</div>`;
  }

  html += `<div class="sc-groups">`;

  for (const g of GROUP_LETTERS) {
    html += `<div class="sc-grp${missByGroup[g].size ? " has-missing" : ""}"><span class="sc-grp-tag">${g}</span><div class="sc-chips">`;
    FIXTURES.forEach((fx, i) => {
      const [hi, ai] = fx;
      const pred = (sub.scores[g] || [])[i];
      const act = (live[g] || [])[i];
      const nm = state.names[g];
      // Unfilled entry that blocks the bracket → red "!" chip (check first; a
      // missing match has no actual result so it can't be pre-locked).
      if (missByGroup[g].has(i)) {
        html += `<span class="sc-chip missing" title="${escapeHtml(`${nm[hi]} v ${nm[ai]} — no prediction; the slot still seeds roughly from this group's other picks`)}">!</span>`;
        return;
      }
      // Auto-filled / pre-locked (no pick, or stored value == actual) → grey,
      // not counted. A locked match with a differing guess is a real pick.
      if (effectivelyPreLocked(g, i, pred, act, lockedSet)) {
        html += `<span class="sc-chip none was-locked" title="${escapeHtml(`${nm[hi]} v ${nm[ai]} — ${fmt(act)} (not your pick, not counted)`)}">·</span>`;
        return;
      }
      const r = scoreMatch(pred, act, allowExact);
      const shown = sub.mode === "result" ? sym(pred) : fmt(pred);
      const ptsTitle = r.pts ? " (+" + r.pts + ")" : "";
      const title = `${nm[hi]} v ${nm[ai]} — you ${sub.mode === "result" ? sym(pred) : fmt(pred)}, actual ${fmt(act)}${ptsTitle}`;
      html += `<span class="sc-chip ${r.kind}" title="${escapeHtml(title)}">${shown === "—" ? "·" : shown}</span>`;
    });
    html += `</div></div>`;
  }
  html += `</div>`;

  // Mini version of the official bracket: tree with lines connecting each
  // picked winner forward to the next round (green = correct, red = wrong,
  // gold = your pick, undecided).
  html += renderMiniBracket(sub);

  host.innerHTML = html;
  host.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ================= Schedule strip (#3) ================= */
function fmtDate(d) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (e) { return d; }
}
function shortTime(t) {
  return (t || "").split(" ")[0];
}

/* Convert an openfootball "HH:MM UTC±O" time to US Eastern (EDT, UTC-4). */
function toEasternTime(t) {
  const m = /(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/.exec(t || "");
  if (!m) return shortTime(t);
  let h = parseInt(m[1], 10) - parseInt(m[3], 10) - 4;
  h = ((h % 24) + 24) % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m[2]} ${ampm}`;
}

/* Live in-play score for a matchup (either order) from window.WC_FOOTBALL.live. */
function liveScoreFor(home, away) {
  const list = (window.WC_FOOTBALL && window.WC_FOOTBALL.live) || [];
  for (const m of list) {
    if (m.home === home && m.away === away) return { hg: m.hg, ag: m.ag, elapsed: m.elapsed, extra: m.extra, status: m.status };
    if (m.home === away && m.away === home) return { hg: m.ag, ag: m.hg, elapsed: m.elapsed, extra: m.extra, status: m.status };
  }
  return null;
}
function liveLabel(lv) {
  const s = lv.status;
  if (s === "HT") return "HT";
  if (s === "P") return "PENS";
  if (s === "BT" || s === "ET") return "ET" + (lv.elapsed ? " " + lv.elapsed + "'" : "");
  return lv.elapsed != null ? lv.elapsed + (lv.extra ? "+" + lv.extra : "") + "'" : "LIVE";
}

/* ===== Bracket-made odds =========================================
   "Implied" odds derived from everyone's submitted brackets: for an
   upcoming group-stage match we tally how many submissions predicted a
   home win / draw / away win (and the average predicted goal difference),
   then convert each outcome's share into an American moneyline. The React
   "odds" box (assets/broadcasts.js) calls window.WCOdds.forMatch to render
   it under the Peacock/Fox/DraftKings/Polymarket row. */

/* Map a group-stage pairing to its FIXTURES index + orientation.
   Returns { fi, homeFirst } or null if both teams aren't in the group. */
function groupFixtureFor(group, home, away) {
  const teams = DEFAULT_GROUPS[group];
  if (!teams) return null;
  const names = teams.map((t) => t[0]);
  const hi = names.indexOf(home), ai = names.indexOf(away);
  if (hi < 0 || ai < 0) return null;
  for (let fi = 0; fi < FIXTURES.length; fi++) {
    const [p, q] = FIXTURES[fi];
    if (p === hi && q === ai) return { fi, homeFirst: true };
    if (p === ai && q === hi) return { fi, homeFirst: false };
  }
  return null;
}

/* Probability (0..1) -> American moneyline integer. */
function toMoneyline(p) {
  const cl = Math.min(0.99, Math.max(0.01, p));
  if (cl >= 0.5) return -Math.round((100 * cl) / (1 - cl));
  return Math.round((100 * (1 - cl)) / cl);
}
function fmtMoneyline(ml) { return (ml > 0 ? "+" : "") + ml; }

/* Short uppercase code for a team name (compact odds pill). Strips accents
   so "Côte d'Ivoire" -> "COT", "Korea Republic" -> "KOR". */
function teamCode(name) {
  const ascii = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const letters = ascii.replace(/[^A-Za-z]/g, "");
  return letters.slice(0, 3).toUpperCase() || "?";
}

window.WCOdds = {
  /* Consensus odds for a group-stage match, or null when it can't be
     computed (knockout match, unknown teams, or no brackets yet). */
  forMatch(group, home, away) {
    if (!group || group.length !== 1) return null; // group stage only
    const loc = groupFixtureFor(group, home, away);
    if (!loc) return null;
    let nH = 0, nD = 0, nA = 0, gdSum = 0, n = 0;
    for (const sub of board) {
      const arr = sub.scores && sub.scores[group];
      const sc = arr && arr[loc.fi];
      if (!Array.isArray(sc) || sc[0] == null || sc[1] == null) continue;
      let hg = +sc[0], ag = +sc[1];
      if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
      if (!loc.homeFirst) { const t = hg; hg = ag; ag = t; } // -> match-home view
      n++;
      gdSum += hg - ag;
      if (hg > ag) nH++; else if (hg === ag) nD++; else nA++;
    }
    if (!n) return null;
    const pH = nH / n, pD = nD / n, pA = nA / n;
    const ml = { home: toMoneyline(pH), draw: toMoneyline(pD), away: toMoneyline(pA) };
    // Favourite = highest-probability outcome.
    let favKey = "home", favP = pH;
    if (pD > favP) { favKey = "draw"; favP = pD; }
    if (pA > favP) { favKey = "away"; favP = pA; }
    const favCode = favKey === "draw" ? "DRAW" : teamCode(favKey === "home" ? home : away);
    return {
      n, home, away,
      p: { home: pH, draw: pD, away: pA },
      ml, gd: gdSum / n,
      favKey, favCode, favMl: fmtMoneyline(ml[favKey]),
    };
  },
};

function renderSchedule() {
  const host = document.getElementById("schedule-strip");
  if (!host) return;
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  if (!sched.length) { host.innerHTML = ""; return; }
  const today = new Date().toISOString().slice(0, 10);
  const byTime = (a, b) => (a.d + a.t).localeCompare(b.d + b.t);
  let list = sched.filter((m) => m.hg === null && m.d >= today).sort(byTime).slice(0, 12);
  if (!list.length) list = sched.filter((m) => m.hg !== null).slice(-12); // tournament over -> recent
  host.innerHTML = list
    .map((m) => {
      const played = m.hg !== null;
      const lv = !played ? liveScoreFor(m.h, m.a) : null;
      const mid = played
        ? `<span class="sch-score">${m.hg}–${m.ag}</span>`
        : lv
          ? `<span class="sch-livebox"><span class="sch-livescore">${lv.hg}–${lv.ag}</span><span class="sch-min"><span class="sch-livedot"></span>${escapeHtml(liveLabel(lv))}</span></span>`
          : `<span class="sch-v">v</span>`;
      const stage = m.s.length === 1 ? "Group " + m.s : m.s;
      const city = window.WCWeather ? WCWeather.cityFromVenue(m.v) : null;
      const wx = !played && city
        ? `<span class="sch-wx" data-city="${escapeHtml(city)}" data-date="${m.d}" data-kickoff="${escapeHtml(m.t)}" title="Live match-day forecast"></span>`
        : "";
      const watch = !played
        ? `<span class="sch-watch" data-home="${escapeHtml(m.h)}" data-away="${escapeHtml(m.a)}" data-group="${escapeHtml(m.s)}"></span>`
        : "";
      const info = !played
        ? `<button class="sch-info" type="button" data-home="${escapeHtml(m.h)}" data-away="${escapeHtml(m.a)}" title="Lineups, head-to-head & squad stats" aria-label="Match info for ${escapeHtml(m.h)} versus ${escapeHtml(m.a)}">ⓘ</button>`
        : "";
      return `<div class="sch-card${played ? " done" : lv ? " live" : ""}">
        <div class="sch-meta">${lv ? '<span class="sch-livetag">● LIVE</span> ' : ""}${fmtDate(m.d)} · ${toEasternTime(m.t)} ET · ${stage}${info}</div>
        <div class="sch-row">
          <span class="sch-team">${flagFor(m.h)}<span class="sch-name">${escapeHtml(m.h)}</span></span>
          ${mid}
          <span class="sch-team away">${flagFor(m.a)}<span class="sch-name">${escapeHtml(m.a)}</span></span>
        </div>
        ${wx}
        ${watch}
      </div>`;
    })
    .join("");

  // Populate live weather (Open-Meteo) for the upcoming-match cards.
  if (window.WCWeather) WCWeather.fill(".schedule-strip .sch-wx");
  // Mount the React "watch on" boxes (Peacock / Fox) for upcoming matches.
  if (window.WCBroadcasts) WCBroadcasts.fill(".schedule-strip .sch-watch");
}

/* Re-render the results-driven UI after a live update. If the user is mid-typing
   a score we skip rebuilding the score inputs so their cursor isn't lost. */
function rerenderAfterLiveUpdate() {
  const editing = document.activeElement && document.activeElement.classList.contains("goal");
  if (editing) {
    fillActuals();
    markPredictionAccuracy();
    renderThirds();
    renderBracket();
    markMissingEntries();
  } else {
    renderAll();
  }
  renderSchedule();
  renderHistory();
}

/* ---- Real-time live source: ESPN's free, keyless World Cup API ----
   The committed data files only change when the (throttled) GitHub Action runs,
   so scores can freeze for hours. ESPN's public scoreboard is reachable straight
   from the browser, updates minute-by-minute, and carries the same fixtures, so
   we poll it directly and overlay fresher results + in-play scores on top of the
   committed snapshot. Falls back silently to the committed data if ESPN is
   unreachable. Deep stats (lineups, ratings, H2H) still come from API-Football
   via the Action — ESPN's scoreboard doesn't carry those. */
const ESPN_NAME = {
  "South Korea": "Korea Republic", "Korea Republic": "Korea Republic",
  "Bosnia-Herzegovina": "Bosnia", "Bosnia and Herzegovina": "Bosnia",
  "Ivory Coast": "Côte d'Ivoire", "Iran": "IR Iran", "IR Iran": "IR Iran",
  "Cape Verde": "Cabo Verde", "United States": "USA", "USA": "USA",
  "Türkiye": "Turkey", "Turkiye": "Turkey", "Czech Republic": "Czechia",
  "Curacao": "Curaçao",
};
function espnName(n) { return ESPN_NAME[n] || n; }
/* Find which group + fixture index a pairing belongs to (canonical names). */
function espnLocate(t1, t2) {
  for (const g of GROUP_LETTERS) {
    const names = DEFAULT_GROUPS[g].map((x) => x[0]);
    const i1 = names.indexOf(t1), i2 = names.indexOf(t2);
    if (i1 >= 0 && i2 >= 0) {
      const fi = FIXTURES.findIndex((p) => (p[0] === i1 && p[1] === i2) || (p[0] === i2 && p[1] === i1));
      if (fi >= 0) return { g, fi, i1, i2 };
    }
  }
  return null;
}
/* Pull US national TV/streaming networks for a competition out of ESPN's
   `geoBroadcasts` (falls back to the condensed `broadcasts`). For WC2026 the
   English-language carrier is the FOX family (FOX / FS1 / FOX One) and the
   Spanish-language carrier is Telemundo ("Tele"/Universo), whose coverage
   streams on Peacock — so we surface a Fox box (with the exact channel) and a
   Peacock box. Returns null when ESPN lists no usable network yet. */
function espnBroadcasts(c) {
  const names = [];
  if (Array.isArray(c.geoBroadcasts)) {
    c.geoBroadcasts.forEach((b) => {
      const n = b && b.media && b.media.shortName;
      if (n) names.push({ name: n, lang: (b.lang || "").toLowerCase() });
    });
  }
  if (!names.length && Array.isArray(c.broadcasts)) {
    c.broadcasts.forEach((b) => (b.names || []).forEach((n) => names.push({ name: n, lang: "" })));
  }
  if (!names.length) return null;
  const fox = names.find((b) => /^fox|^fs\d/i.test(b.name));
  const peacock = names.find((b) => b.lang === "es" || /tele|universo/i.test(b.name));
  if (!fox && !peacock) return null;
  return {
    fox: fox ? { network: fox.name } : null,
    peacock: peacock ? { network: peacock.name } : null,
  };
}
let lastEspn = null;
/* Overlay an ESPN scoreboard payload onto WC_LIVE.results (finished matches) and
   WC_FOOTBALL.live (in-play). Returns true if anything changed. */
function applyEspnOverlay(j) {
  if (!j || !Array.isArray(j.events)) return false;
  if (!window.WC_LIVE) window.WC_LIVE = { results: {}, schedule: [] };
  if (!window.WC_FOOTBALL) window.WC_FOOTBALL = { teams: {}, live: [] };
  if (!window.WC_BROADCASTS) window.WC_BROADCASTS = {};
  const results = window.WC_LIVE.results || (window.WC_LIVE.results = {});
  GROUP_LETTERS.forEach((g) => { if (!Array.isArray(results[g])) results[g] = [null, null, null, null, null, null]; });
  const live = [];
  let changed = false;
  for (const e of j.events) {
    const c = e.competitions && e.competitions[0];
    if (!c || !Array.isArray(c.competitors)) continue;
    const homeC = c.competitors.find((x) => x.homeAway === "home") || c.competitors[0];
    const awayC = c.competitors.find((x) => x.homeAway === "away") || c.competitors[1];
    if (!homeC || !awayC) continue;
    const hn = espnName(homeC.team.displayName), an = espnName(awayC.team.displayName);
    const hs = parseInt(homeC.score, 10), as = parseInt(awayC.score, 10);
    const st = (e.status && e.status.type) || {};
    const loc = espnLocate(hn, an);
    // Capture where to watch this game (Peacock / Fox). Key by the canonical
    // group team names under both orientations so the schedule strip — which may
    // orient home/away differently from FIXTURES — always finds it.
    if (loc) {
      const bc = espnBroadcasts(c);
      if (bc) {
        const gn = DEFAULT_GROUPS[loc.g].map((x) => x[0]);
        const a = gn[loc.i1], b = gn[loc.i2];
        window.WC_BROADCASTS[`${a}|${b}`] = bc;
        window.WC_BROADCASTS[`${b}|${a}`] = bc;
      }
    }
    if (st.state === "post") {
      if (loc && Number.isFinite(hs) && Number.isFinite(as)) {
        const oriented = FIXTURES[loc.fi][0] === loc.i1 ? [hs, as] : [as, hs];
        const cur = results[loc.g][loc.fi];
        if (!cur || cur[0] !== oriented[0] || cur[1] !== oriented[1]) { results[loc.g][loc.fi] = oriented; changed = true; }
      }
    } else if (st.state === "in") {
      const min = parseInt((e.status.displayClock || "").replace(/[^0-9]/g, ""), 10);
      const nm = st.name || "";
      const code = /HALFTIME/.test(nm) ? "HT" : /EXTRA|OVERTIME/.test(nm) ? "ET" : /SECOND/.test(nm) ? "2H" : "1H";
      live.push({ home: hn, away: an, hg: Number.isFinite(hs) ? hs : 0, ag: Number.isFinite(as) ? as : 0, elapsed: Number.isFinite(min) ? min : null, extra: null, status: code });
    }
  }
  if (JSON.stringify(window.WC_FOOTBALL.live || []) !== JSON.stringify(live)) {
    window.WC_FOOTBALL.live = live;
    changed = true;
  }
  return changed;
}
/* ---- ESPN lineups (per-event summary endpoint) ----
   The scoreboard has scores but not XIs; each event's `summary` carries the
   confirmed rosters once announced (~1h before kickoff) and live. We fetch those
   for in-play/upcoming matches, map them into the modal's lineup shape, and merge
   onto WC_FOOTBALL.matches so the ⓘ panel shows the announced XI in real time. */
const espnLineups = {};   // eventId -> { hn, an, lineup }
const espnLineupAt = {};  // eventId -> last fetch timestamp
/* Pitch row (0 = keeper … 5 = forward) and side (-2 wide-left … +2 wide-right)
   from a player's position, so ESPN XIs lay out on the same pitch graphic as the
   API-Football lineups (which use a "row:col" grid). */
function espnRowRank(p) {
  const a = (p.pos || "").toUpperCase(), n = (p.posName || "").toLowerCase();
  if (a === "G" || a === "GK" || /goalkeep/.test(n)) return 0;
  if (/defensive mid/.test(n) || /^(DM|CDM|LDM|RDM)\b/.test(a)) return 2;
  if (/attacking mid/.test(n) || /^(AM|CAM|LAM|RAM)\b/.test(a)) return 4;
  if (/forward|striker|winger/.test(n) || /^(F|CF|ST|LF|RF|LW|RW|S)\b/.test(a)) return 5;
  if (/defender|back|sweeper/.test(n) || /^(CD|CB|LCB|RCB|LB|RB|LWB|RWB|SW|D)\b/.test(a)) return 1;
  return 3; // midfielder
}
function espnSideRank(p) {
  const a = (p.pos || "").toUpperCase();
  if (/^(LB|LWB|LW|LM|LF)\b/.test(a)) return -2;
  if (/^(RB|RWB|RW|RM|RF)\b/.test(a)) return 2;
  if (/-L$|^L/.test(a)) return -1;
  if (/-R$|^R/.test(a)) return 1;
  return 0;
}
function espnAddGrid(startXI) {
  const ranked = startXI.map((p) => ({ p, rr: espnRowRank(p), sr: espnSideRank(p) }));
  const rows = [...new Set(ranked.map((r) => r.rr))].sort((a, b) => a - b);
  rows.forEach((rv, ri) => {
    ranked.filter((r) => r.rr === rv).sort((a, b) => a.sr - b.sr || a.p.order - b.p.order)
      .forEach((r, ci) => { r.p.grid = `${ri + 1}:${ci + 1}`; });
  });
}
/* Per-player live stats from ESPN's roster stats array (no 0–10 rating — ESPN
   doesn't publish one; ratings stay a post-match API-Football figure). */
function espnPlayerPerf(rp) {
  const m = {};
  (rp.stats || []).forEach((s) => { m[s.name] = s.displayValue; });
  const num = (k) => { const v = parseInt(m[k], 10); return Number.isFinite(v) ? v : 0; };
  return { goals: num("totalGoals"), assists: num("goalAssists"), yellow: num("yellowCards"),
    red: num("redCards"), shots: num("totalShots"), shotsOn: num("shotsOnTarget"), saves: num("saves") };
}
function espnParseLineup(summary, kind) {
  const rosters = summary && summary.rosters;
  if (!Array.isArray(rosters) || rosters.length < 2) return null;
  const perf = {};
  const sideFor = (side) => {
    if (!side || !Array.isArray(side.roster)) return null;
    const players = side.roster.map((p) => {
      const a = p.athlete || {};
      const id = a.id ? +a.id : null;
      if (id != null) perf[id] = espnPlayerPerf(p);
      return {
        id,
        name: a.displayName || a.shortName || "—",
        number: p.jersey != null ? +p.jersey : null,
        pos: (p.position && p.position.abbreviation) || (a.position && a.position.abbreviation) || "",
        posName: (p.position && p.position.name) || (a.position && a.position.name) || "",
        starter: !!p.starter,
        order: p.formationPlace != null ? +p.formationPlace : 99,
        photo: a.headshot && a.headshot.href ? a.headshot.href : null,
      };
    });
    const startXI = players.filter((p) => p.starter).sort((a, b) => a.order - b.order);
    espnAddGrid(startXI); // lay the XI out on the pitch like the API-Football grid
    return { team: side.team && side.team.displayName, formation: side.formation || "", coach: null,
      startXI, subs: players.filter((p) => !p.starter) };
  };
  const home = sideFor(rosters.find((r) => r.homeAway === "home") || rosters[0]);
  const away = sideFor(rosters.find((r) => r.homeAway === "away") || rosters[1]);
  if (!home || !away || !home.startXI.length || !away.startXI.length) return null;
  return { kind, sides: { home, away }, perf };
}
/* Merge cached ESPN lineups onto WC_FOOTBALL.matches under both name orders,
   preserving any committed H2H / report already there. */
function applyEspnLineups() {
  const f = window.WC_FOOTBALL;
  if (!f) return;
  f.matches = f.matches || {};
  for (const id in espnLineups) {
    const { hn, an, lineup } = espnLineups[id];
    if (!lineup) continue;
    const base = f.matches[`${hn}|${an}`] || f.matches[`${an}|${hn}`] || {};
    const merged = { ...base, lineup };
    f.matches[`${hn}|${an}`] = merged;
    f.matches[`${an}|${hn}`] = merged;
  }
}
/* Re-render the match-info modal in place if it's open (e.g. a lineup landed). */
function refreshOpenMatchInfo() {
  const overlay = document.getElementById("match-info");
  const body = document.getElementById("mi-body");
  if (!overlay || overlay.hidden || !body || !body.dataset.home) return;
  openMatchInfo(body.dataset.home, body.dataset.away);
}
function fetchEspnLineups(events) {
  const now = Date.now();
  const sumUrl = (id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${id}`;
  events
    .filter((e) => e.id && e.status && e.status.type && e.status.type.state !== "post")
    .filter((e) => !espnLineupAt[e.id] || now - espnLineupAt[e.id] > 180000) // refetch ≤ every 3 min
    .slice(0, 10)
    .forEach((e) => {
      espnLineupAt[e.id] = now;
      const c = e.competitions && e.competitions[0];
      if (!c || !Array.isArray(c.competitors)) return;
      const homeC = c.competitors.find((x) => x.homeAway === "home") || c.competitors[0];
      const awayC = c.competitors.find((x) => x.homeAway === "away") || c.competitors[1];
      if (!homeC || !awayC) return;
      const hn = espnName(homeC.team.displayName), an = espnName(awayC.team.displayName);
      const kind = e.status.type.state === "in" ? "live" : "announced";
      fetch(sumUrl(e.id)).then((r) => (r.ok ? r.json() : null)).then((sum) => {
        const lineup = espnParseLineup(sum, kind);
        if (!lineup) return;
        espnLineups[e.id] = { hn, an, lineup };
        applyEspnLineups();
        refreshOpenMatchInfo();
      }).catch(() => {});
    });
}

function pollEspnLive() {
  const day = (off) => { const d = new Date(Date.now() + off * 864e5); return d.toISOString().slice(0, 10).replace(/-/g, ""); };
  const url = (d) => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${d}`;
  // Yesterday + today covers late finishes and the current slate across time zones.
  Promise.all([day(-1), day(0)].map((d) =>
    fetch(url(d)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  )).then((parts) => {
    const events = parts.filter(Boolean).flatMap((p) => p.events || []);
    if (!events.length) return;
    lastEspn = { events };
    const changed = applyEspnOverlay(lastEspn);
    fetchEspnLineups(events);
    if (changed) rerenderAfterLiveUpdate();
  });
}

/* Pull the freshest committed data (lineups, squad stats, Action-committed
   results) and re-render, then re-apply the latest ESPN overlay so the
   real-time scores stay authoritative. */
function pollLiveScores() {
  const bust = "?_=" + Date.now();
  Promise.all([
    fetch("data/live-data.json" + bust).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("data/football-data.json" + bust).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([live, football]) => {
    let changed = false;
    if (live && live.results && live.schedule) { window.WC_LIVE = live; changed = true; }
    if (football && football.teams) { window.WC_FOOTBALL = football; changed = true; }
    if (lastEspn) applyEspnOverlay(lastEspn); // keep ESPN's live data on top
    applyEspnLineups();                       // and ESPN's live lineups
    if (!changed) return;
    rerenderAfterLiveUpdate();
  });
}

/* ================= Match info modal (lineups · H2H · squad stats) =========
   Data comes from window.WC_FOOTBALL (API-Football, refreshed server-side by
   the Update live data Action). Everything degrades gracefully to a friendly
   notice while the feed is still empty. */
function footballData() { return window.WC_FOOTBALL || { teams: {}, matches: {} }; }
function matchInfoData(home, away) {
  const f = footballData();
  return (f.matches && f.matches[`${home}|${away}`]) || null;
}
function teamInfoData(name) {
  const f = footballData();
  return (f.teams && f.teams[name]) || null;
}

function miNotice(msg) {
  return `<div class="mi-empty">${escapeHtml(msg)}</div>`;
}

/* --- Lineups (official XI when live, otherwise the team's last game) --- */
/* A player chip: circular headshot (falls back to the shirt number), number
   badge, and name. */
function ratingClass(r) {
  if (r == null) return "";
  if (r >= 7) return "r-good"; // green
  if (r >= 6) return "r-ok";   // yellow
  return "r-bad";              // red
}
function playerChip(p, posStyle, perf) {
  const num = p.number != null ? String(p.number) : "";
  const img = p.photo
    ? `<img class="pp-photo" src="${escapeHtml(p.photo)}" alt="" loading="lazy"
         onerror="this.remove();this.parentNode.classList.add('pp-noimg');" />`
    : "";
  // Number shown beside the name (clear, never clipped); the in-circle number
  // is only a fallback for when the headshot fails to load.
  const numName = num ? `<span class="pp-no">${escapeHtml(num)}</span>` : "";
  const rating = perf && perf.rating != null
    ? `<span class="pp-rating ${ratingClass(perf.rating)}">${perf.rating.toFixed(1)}</span>` : "";
  // Live event badges (goals + cards) — shown for in-play matches (ESPN stats)
  // and finished ones alike.
  const ev = perf
    ? (perf.goals ? `<span class="pp-ev goal" title="Goals">⚽${perf.goals > 1 ? perf.goals : ""}</span>` : "") +
      (perf.red ? `<span class="pp-ev card red" title="Red card"></span>`
        : perf.yellow ? `<span class="pp-ev card yellow" title="Yellow card"></span>` : "")
    : "";
  return `<div class="pp" ${posStyle ? `style="${posStyle}"` : ""}>
      <div class="pp-shirt">${img}<span class="pp-fallnum">${escapeHtml(num)}</span>${rating}${ev}</div>
      <div class="pp-name">${numName}<span class="pp-nm">${escapeHtml(p.name || "—")}</span></div>
    </div>`;
}

/* Lay the starting XI out on a vertical pitch using the API grid ("row:col",
   row 1 = keeper at the back, col 1 = left), so wingers/full-backs sit on
   their true side. */
function renderPitch(startXI, perfMap) {
  const withGrid = (startXI || []).filter((p) => p.grid);
  if (withGrid.length < (startXI || []).length || !withGrid.length) return null;
  const rows = {};
  withGrid.forEach((p) => {
    const r = parseInt(p.grid.split(":")[0], 10);
    (rows[r] = rows[r] || []).push(p);
  });
  const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const R = rowKeys.length;
  let chips = "";
  rowKeys.forEach((rk, i) => {
    const line = rows[rk].slice().sort(
      (a, b) => (+a.grid.split(":")[1]) - (+b.grid.split(":")[1])
    );
    const C = line.length;
    const top = 100 - ((i + 0.5) / R) * 100; // keeper (i=0) near the bottom
    line.forEach((p, j) => {
      const left = ((j + 0.5) / C) * 100; // col 1 -> left of the screen
      chips += playerChip(p, `top:${top.toFixed(1)}%;left:${left.toFixed(1)}%`, perfMap && perfMap[p.id]);
    });
  });
  return `<div class="mi-pitch">${chips}</div>`;
}

function renderLineupSide(side, perfMap) {
  if (!side) return `<div class="mi-xi">${miNotice("No lineup available.")}</div>`;
  const pitch = renderPitch(side.startXI, perfMap);
  const listFallback = `<ol class="mi-players">${(side.startXI || []).map((p) =>
    `<li><span class="mi-num">${p.number != null ? p.number : "·"}</span>
       <span class="mi-pname">${escapeHtml(p.name || "—")}</span>
       <span class="mi-ppos">${escapeHtml(p.pos || "")}</span></li>`).join("")
    || miNotice("Starting XI not available.")}</ol>`;
  const subs = (side.subs || []).slice(0, 12).map((p) =>
    `<li><span class="mi-num">${p.number != null ? p.number : "·"}</span>
       <span class="mi-pname">${escapeHtml(p.name || "—")}</span>
       <span class="mi-ppos">${escapeHtml(p.pos || "")}</span></li>`).join("");
  return `<div class="mi-xi">
      <div class="mi-xi-head">
        <span class="mi-team">${escapeHtml(side.team || "")}</span>
        ${side.formation ? `<span class="mi-form">${escapeHtml(side.formation)}</span>` : ""}
      </div>
      ${side.coach ? `<div class="mi-coach">Coach: ${escapeHtml(side.coach)}</div>` : ""}
      ${pitch || listFallback}
      ${subs ? `<div class="mi-subs-h">Substitutes</div><ol class="mi-players subs">${subs}</ol>` : ""}
    </div>`;
}

/* Goals summary for a played match: ⚽ scorer (min') with 🥾 assist. */
function renderGoalsSummary(report, home, away) {
  if (!report || !report.goals || !report.goals.length) return "";
  const line = (g) => {
    const min = g.minute != null ? `${g.minute}${g.extra ? "+" + g.extra : ""}'` : "";
    const tag = g.own ? " (OG)" : g.pen ? " (pen)" : "";
    const assist = g.assist && !g.own ? ` <span class="mi-assist">🥾 ${escapeHtml(g.assist)}</span>` : "";
    return `<li><span class="mi-ball">⚽</span><span class="mi-scorer">${escapeHtml(g.player || "—")}${tag}</span>
        <span class="mi-min">${min}</span>${assist}</li>`;
  };
  const homeGoals = report.goals.filter((g) => g.side === "home").map(line).join("");
  const awayGoals = report.goals.filter((g) => g.side === "away").map(line).join("");
  return `<div class="mi-goals">
      <div class="mi-goals-col"><div class="mi-goals-team">${escapeHtml(home)}</div><ul>${homeGoals || '<li class="mi-nogoal">—</li>'}</ul></div>
      <div class="mi-goals-col"><div class="mi-goals-team">${escapeHtml(away)}</div><ul>${awayGoals || '<li class="mi-nogoal">—</li>'}</ul></div>
    </div>`;
}

function renderLineupTab(data, home, away) {
  if (!data || !data.lineup || !data.lineup.sides) {
    return miNotice("Lineups will appear here once the data feed runs (refreshes hourly).");
  }
  const { sides, kind } = data.lineup;
  const perf = data.lineup.perf || (data.report && data.report.players) || null;
  const banner = kind === "live"
    ? `<div class="mi-live"><span class="mi-dot"></span> Official lineup (live)</div>`
    : kind === "announced"
      ? `<div class="mi-live"><span class="mi-dot"></span> Confirmed starting XI</div>`
      : kind === "final"
        ? `<div class="mi-final">Final lineup &amp; player ratings from the match.</div>`
        : `<div class="mi-last">Showing each side's most recent lineup (the official XI for an upcoming match is published shortly before kickoff).</div>`;
  return `${banner}
    ${renderGoalsSummary(data.report, home, away)}
    <div class="mi-xis">
      ${renderLineupSide(sides.home, perf)}
      ${renderLineupSide(sides.away, perf)}
    </div>`;
}

/* --- Head-to-head over the last ~26 years --- */
function renderH2HTab(data, home, away) {
  if (!data || !data.h2h) {
    return miNotice("Head-to-head history will appear here once the data feed runs.");
  }
  const h = data.h2h;
  if (!h.total) {
    return miNotice(`No recorded meetings between ${home} and ${away} in the last ${h.years} years.`);
  }
  const seg = (cls, n, pct) => n ? `<span class="${cls}" style="width:${pct}%" title="${n} (${pct}%)"></span>` : "";
  return `<div class="mi-h2h">
      <p class="mi-h2h-sub">${h.total} meeting${h.total === 1 ? "" : "s"} over the last ${h.years} years</p>
      <div class="mi-h2h-bar">
        ${seg("hb-home", h.homeWins, h.homeWinPct)}
        ${seg("hb-draw", h.draws, h.drawPct)}
        ${seg("hb-away", h.awayWins, h.awayWinPct)}
      </div>
      <table class="mi-h2h-table">
        <thead><tr><th>${escapeHtml(home)} wins</th><th>Draws</th><th>${escapeHtml(away)} wins</th></tr></thead>
        <tbody><tr>
          <td><strong>${h.homeWins}</strong><span class="mi-pct">${h.homeWinPct}%</span></td>
          <td><strong>${h.draws}</strong><span class="mi-pct">${h.drawPct}%</span></td>
          <td><strong>${h.awayWins}</strong><span class="mi-pct">${h.awayWinPct}%</span></td>
        </tr></tbody>
      </table>
    </div>`;
}

/* API-Football's season feed only files players under four broad positions, so
   we shorten those to three-letter codes. (More specific roles like LW/CAM
   aren't published in this data, so they can't be shown here.) */
const POS_ABBR = { goalkeeper: "GK", defender: "DEF", midfielder: "MID", attacker: "FWD", forward: "FWD" };
function posAbbr(pos) {
  if (!pos) return "—";
  return POS_ABBR[pos.toLowerCase()] || pos.slice(0, 3).toUpperCase();
}

/* Outfield position grouping: descending sort puts FWD on top, then MID, DEF. */
const POS_RANK = { FWD: 3, MID: 2, DEF: 1, GK: 0 };

/* A sortable column heading (every column except the player name). The arrow
   span is filled in by sortMiTable once a column becomes the active sort. */
function miTh(label, title) {
  return `<th data-sortable${title ? ` title="${title}"` : ""}>${label}<span class="mi-sarr"></span></th>`;
}

/* --- Per-squad season stats with top-performer highlights. Outfield players
   and goalkeepers get separate tables (keepers carry keeping-specific stats),
   and every column heading is click-to-sort. --- */
function renderSquadTable(name) {
  const t = teamInfoData(name);
  if (!t || !t.players || !t.players.length) {
    return `<div class="mi-squad"><h4>${escapeHtml(name)}</h4>${miNotice("Squad stats will appear once the data feed runs.")}</div>`;
  }
  // Per-game stats are only meaningful for players who featured this season.
  const featured = t.players.filter((p) => p.games > 0);
  if (!featured.length) {
    return `<div class="mi-squad"><h4>${escapeHtml(name)}</h4>${miNotice("No player appearances recorded yet this season.")}</div>`;
  }
  const isKeeper = (p) => (p.pos || "").toLowerCase() === "goalkeeper";
  const outfield = featured.filter((p) => !isKeeper(p));
  const keepers = featured.filter(isKeeper).sort((a, b) => b.games - a.games);

  // Squad leader per metric (outfield only), with a minimum-appearances guard so
  // a single-cap player can't top a per-game ranking on a fluke.
  const maxG = Math.max(...outfield.map((p) => p.games), 0);
  const minG = Math.max(2, Math.ceil(maxG / 3));
  const topName = (metric) => {
    let pool = outfield.filter((p) => p.games >= minG && p[metric] > 0);
    if (!pool.length) pool = outfield.filter((p) => p[metric] > 0);
    if (!pool.length) return null;
    return pool.slice().sort((a, b) => b[metric] - a[metric])[0].name;
  };
  const L = { goals: topName("gpg"), assists: topName("apg"), fouls: topName("fpg") };
  const lead = (player, metric) => (L[metric] && player.name === L[metric]) ? " mi-top" : "";
  const photoCell = (p) =>
    `<td class="mi-pl">${p.photo ? `<img class="mi-photo" src="${escapeHtml(p.photo)}" alt="" loading="lazy" />` : ""}<span>${escapeHtml(p.name)}</span></td>`;

  // --- Outfield players ---
  const outRows = outfield.map((p) => `
    <tr>
      ${photoCell(p)}
      <td class="mi-pos" data-sort="${POS_RANK[posAbbr(p.pos)] || 0}">${escapeHtml(posAbbr(p.pos))}</td>
      <td>${p.games}</td>
      <td class="mi-wc">${p.wcGoals || 0}</td>
      <td class="mi-wc">${p.wcAssists || 0}</td>
      <td class="mi-g${lead(p, "goals")}">${p.gpg.toFixed(2)}</td>
      <td class="mi-a${lead(p, "assists")}">${p.apg.toFixed(2)}</td>
      <td data-sort="${p.mpg}">${p.mpg}'</td>
      <td class="mi-f${lead(p, "fouls")}">${p.fpg.toFixed(2)}</td>
      <td class="mi-yc">${p.yellow}</td>
      <td class="mi-rc">${p.red}</td>
    </tr>`).join("");
  const outTable = `<div class="mi-table-wrap">
        <table class="mi-stats">
          <thead><tr>
            <th class="mi-pl">Player</th>
            ${miTh("Pos", "Group by position (FWD → MID → DEF)")}
            ${miTh("GP", "Games played")}
            ${miTh("🏆G", "World Cup goals so far")}
            ${miTh("🏆A", "World Cup assists so far")}
            ${miTh("G/G", "Goals per game (all competitions, this season)")}
            ${miTh("A/G", "Assists per game (all competitions, this season)")}
            ${miTh("MIN/G", "Minutes per game")}
            ${miTh("F/G", "Fouls per game")}
            ${miTh("🟨", "Yellow cards")}
            ${miTh("🟥", "Red cards")}
          </tr></thead>
          <tbody>${outRows}</tbody>
        </table>
      </div>`;

  // --- Goalkeepers (keeping-specific columns) ---
  let gkTable = "";
  if (keepers.length) {
    const ks = wcKeeperStats();
    const gkRows = keepers.map((p) => {
      const k = ks[p.id] || { cs: 0, gc: 0 };
      const saves = p.saves == null ? "—" : p.saves;
      return `
      <tr>
        ${photoCell(p)}
        <td>${p.games}</td>
        <td data-sort="${p.mpg}">${p.mpg}'</td>
        <td class="mi-wc">${k.cs}</td>
        <td class="mi-wc">${k.gc}</td>
        <td data-sort="${p.saves == null ? -1 : p.saves}">${saves}</td>
        <td class="mi-yc">${p.yellow}</td>
        <td class="mi-rc">${p.red}</td>
      </tr>`;
    }).join("");
    gkTable = `<div class="mi-gk-head">🧤 Goalkeepers</div>
      <div class="mi-table-wrap">
        <table class="mi-stats mi-gk">
          <thead><tr>
            <th class="mi-pl">Player</th>
            ${miTh("GP", "Games played")}
            ${miTh("MIN/G", "Minutes per game")}
            ${miTh("🏆CS", "World Cup clean sheets")}
            ${miTh("🏆GC", "World Cup goals conceded")}
            ${miTh("Saves", "Saves (all competitions, this season)")}
            ${miTh("🟨", "Yellow cards")}
            ${miTh("🟥", "Red cards")}
          </tr></thead>
          <tbody>${gkRows}</tbody>
        </table>
      </div>`;
  }

  return `<div class="mi-squad">
      <h4>${escapeHtml(name)} <span class="mi-season">${t.season || ""} season</span></h4>
      ${outTable}
      ${gkTable}
    </div>`;
}

/* WC clean sheets + goals conceded per goalkeeper id, derived from finished
   match reports (scoreline rebuilt from goal events; credited to the keeper who
   started). Saves aren't in match reports, so those come from the season feed. */
function wcKeeperStats() {
  const f = window.WC_FOOTBALL;
  const map = {};
  if (!f || !f.matches) return map;
  for (const m of Object.values(f.matches)) {
    const rep = m.report;
    if (!rep || !rep.goals) continue;
    const sides = m.lineup && m.lineup.sides;
    if (!sides) continue;
    let home = 0, away = 0;
    for (const ev of rep.goals) {
      const forHome = ev.own ? ev.side === "away" : ev.side === "home";
      if (forHome) home++; else away++;
    }
    const apply = (side, conceded) => {
      const sd = sides[side];
      const gk = sd && ((sd.startXI || []).find((p) => p.pos === "G") || (sd.startXI || [])[0]);
      if (!gk || gk.id == null) return;
      const e = map[gk.id] || (map[gk.id] = { cs: 0, gc: 0 });
      e.gc += conceded;
      if (conceded === 0) e.cs++;
    };
    apply("home", away);
    apply("away", home);
  }
  return map;
}

/* Reorder a squad table's rows by the clicked column. Numeric cells sort by
   value (an explicit data-sort overrides the displayed text — e.g. position
   rank, or "53'" minutes); default direction is descending, and re-clicking the
   active column flips it. */
function sortMiTable(th) {
  const headRow = th.parentElement;
  const col = [...headRow.children].indexOf(th);
  const table = th.closest("table");
  const tbody = table && table.querySelector("tbody");
  if (!tbody) return;
  const same = table.dataset.sortCol === String(col);
  const dir = same && table.dataset.sortDir === "desc" ? "asc" : "desc";
  table.dataset.sortCol = col;
  table.dataset.sortDir = dir;
  const value = (tr) => {
    const td = tr.children[col];
    if (!td) return -Infinity;
    const raw = td.getAttribute("data-sort");
    const text = raw != null ? raw : td.textContent.trim();
    const n = parseFloat(text);
    return isNaN(n) ? text.toLowerCase() : n;
  };
  [...tbody.children]
    .sort((a, b) => {
      const va = value(a), vb = value(b);
      const cmp = (typeof va === "number" && typeof vb === "number")
        ? va - vb : String(va).localeCompare(String(vb));
      return dir === "desc" ? -cmp : cmp;
    })
    .forEach((r) => tbody.appendChild(r));
  headRow.querySelectorAll("th").forEach((h) => h.removeAttribute("data-dir"));
  th.setAttribute("data-dir", dir);
}

function renderStatsTab(home, away) {
  return `<p class="mi-note"><strong>GP</strong> = games played this season across <em>all</em>
      competitions (club + country), not just the World Cup. 🏆 columns are World-Cup-only.
      <strong>Tap any column heading to sort</strong> (high → low; tap again to reverse).</p>
    <div class="mi-legend">Highlighted = squad leader in
      <span class="mi-key g">goals/game</span>
      <span class="mi-key a">assists/game</span>
      <span class="mi-key f">fouls/game</span></div>
    <div class="mi-squads">
      ${renderSquadTable(home)}
      ${renderSquadTable(away)}
    </div>`;
}

/* --- Match performance (played matches): rating, mins, G/A, shots, passes,
   pass accuracy, tackles — per player who featured. --- */
function renderPerfTable(side, perf) {
  if (!side) return "";
  const all = [...(side.startXI || []), ...(side.subs || [])];
  const rows = all.map((p) => ({ p, s: perf[p.id] }))
    .filter((x) => x.s && (x.s.minutes > 0 || x.s.rating != null))
    .sort((a, b) => (b.s.rating || 0) - (a.s.rating || 0));
  if (!rows.length) return "";
  const body = rows.map(({ p, s }) => `
    <tr>
      <td class="mi-pl">${escapeHtml(p.name)}</td>
      <td class="mi-rt ${ratingClass(s.rating)}">${s.rating != null ? s.rating.toFixed(1) : "–"}</td>
      <td>${s.minutes}'</td>
      <td>${s.goals || 0}</td>
      <td>${s.assists || 0}</td>
      <td>${s.shots || 0}${s.shotsOn ? ` (${s.shotsOn})` : ""}</td>
      <td>${s.passes || 0}${s.passAcc != null ? ` · ${s.passAcc}%` : ""}</td>
      <td>${s.tackles || 0}</td>
    </tr>`).join("");
  return `<div class="mi-squad">
      <h4>${escapeHtml(side.team || "")}</h4>
      <div class="mi-table-wrap"><table class="mi-stats mi-perf">
        <thead><tr>
          <th class="mi-pl">Player</th><th title="Match rating (0–10)">Rtg</th><th>Min</th>
          <th title="Goals">G</th><th title="Assists">A</th>
          <th title="Shots (on target)">Sh</th><th title="Passes · accuracy">Pass</th>
          <th title="Tackles">Tkl</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </div>`;
}

function renderMatchStatsTab(data) {
  const report = data && data.report;
  const sides = data && data.lineup && data.lineup.sides;
  if (!report || !report.players || !Object.keys(report.players).length || !sides) {
    return miNotice("Player match ratings appear here once the match has been played.");
  }
  return `<div class="mi-legend">Match performance — rating (0–10), minutes, goals, assists, shots (on target), passes · accuracy, tackles.
      <span class="mi-src">via API-Football · Opta-style data</span></div>
    <div class="mi-squads">
      ${renderPerfTable(sides.home, report.players)}
      ${renderPerfTable(sides.away, report.players)}
    </div>`;
}

let miActiveTab = "lineup";
function openMatchInfo(home, away) {
  const body = document.getElementById("mi-body");
  const overlay = document.getElementById("match-info");
  if (!body || !overlay) return;
  // Match data is keyed by the official home|away order, which may differ from
  // a group fixture's order — fall back to the reverse so either side opens it.
  let data = matchInfoData(home, away);
  if (!data && matchInfoData(away, home)) { const t = home; home = away; away = t; data = matchInfoData(home, away); }
  const hasReport = !!(data && data.report && data.report.players && Object.keys(data.report.players).length);
  if (miActiveTab === "match" && !hasReport) miActiveTab = "lineup";
  const tab = (id, label) =>
    `<button class="mi-tab ${miActiveTab === id ? "active" : ""}" data-tab="${id}" type="button">${label}</button>`;
  const panel = miActiveTab === "h2h" ? renderH2HTab(data, home, away)
    : miActiveTab === "stats" ? renderStatsTab(home, away)
    : miActiveTab === "match" ? renderMatchStatsTab(data)
    : renderLineupTab(data, home, away);

  body.innerHTML = `
    <div class="mi-header" id="mi-title">
      <span class="mi-side">${flagFor(home)}<span>${escapeHtml(home)}</span></span>
      <span class="mi-v">vs</span>
      <span class="mi-side away"><span>${escapeHtml(away)}</span>${flagFor(away)}</span>
    </div>
    <div class="mi-tabs">
      ${tab("lineup", "Lineups")}
      ${hasReport ? tab("match", "Match Stats") : ""}
      ${tab("h2h", "Head-to-Head")}
      ${tab("stats", "Squad Stats")}
    </div>
    <div class="mi-panel">${panel}</div>`;

  body.dataset.home = home;
  body.dataset.away = away;
  overlay.hidden = false;
  document.body.classList.add("mi-open");
}

function closeMatchInfo() {
  const overlay = document.getElementById("match-info");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("mi-open");
}

function wireMatchInfo() {
  const strip = document.getElementById("schedule-strip");
  if (strip) {
    strip.addEventListener("click", (e) => {
      const btn = e.target.closest(".sch-info");
      if (!btn) return;
      miActiveTab = "lineup";
      openMatchInfo(btn.dataset.home, btn.dataset.away);
    });
  }
  // Info button on every group match row.
  if (groupsEl) {
    groupsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".match-info");
      if (!btn) return;
      const g = btn.dataset.group, m = +btn.dataset.match;
      const [hi, ai] = FIXTURES[m];
      miActiveTab = "lineup";
      openMatchInfo(state.names[g][hi], state.names[g][ai]);
    });
  }
  const overlay = document.getElementById("match-info");
  const close = document.getElementById("mi-close");
  if (close) close.addEventListener("click", closeMatchInfo);
  if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeMatchInfo(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMatchInfo(); });
  const body = document.getElementById("mi-body");
  if (body) body.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sortable]");
    if (th) { sortMiTable(th); return; }
    const t = e.target.closest(".mi-tab");
    if (!t) return;
    miActiveTab = t.dataset.tab;
    openMatchInfo(body.dataset.home, body.dataset.away);
  });
}

/* ================= All-time World Cup history leaderboards ================= */
/* Live 2026 World Cup tally per player id (from API-Football squad data). */
function liveWcMap() {
  const map = {};
  const f = window.WC_FOOTBALL;
  if (f && f.teams) {
    for (const [team, t] of Object.entries(f.teams)) {
      const code = NAME_CODE[team] || "";
      for (const p of t.players || []) {
        if (p.id == null) continue;
        map[p.id] = { goals: p.wcGoals || 0, assists: p.wcAssists || 0, name: p.name, code, team };
      }
    }
  }
  return map;
}

/* Top goal+assist contributors in the current tournament (fully live). */
function tournamentGARows() {
  const f = window.WC_FOOTBALL;
  const rows = [];
  if (f && f.teams) {
    for (const [team, t] of Object.entries(f.teams)) {
      const code = NAME_CODE[team] || "";
      for (const p of t.players || []) {
        const g = p.wcGoals || 0, a = p.wcAssists || 0;
        if (g + a > 0) rows.push({ name: p.name, code, displayValue: g + a, g, a, sub: `${g} G · ${a} A` });
      }
    }
  }
  rows.sort((x, y) => y.displayValue - x.displayValue || y.g - x.g);
  return rows.slice(0, 10);
}

/* Top 10 in a single live tournament metric (wcGoals / wcAssists), per player
   across every squad. */
function tournamentStatRows(metric) {
  const f = window.WC_FOOTBALL;
  const rows = [];
  if (f && f.teams) {
    for (const [team, t] of Object.entries(f.teams)) {
      const code = NAME_CODE[team] || "";
      for (const p of t.players || []) {
        const v = p[metric] || 0;
        if (v > 0) rows.push({ name: p.name, code, displayValue: v, sub: team });
      }
    }
  }
  rows.sort((x, y) => y.displayValue - x.displayValue);
  return rows.slice(0, 10);
}

/* Top 10 clean sheets, credited to the goalkeeper who started a finished match
   in which the opponent failed to score. Finished matches are the only ones
   carrying a `report`, and the scoreline is reconstructed from its goal events
   (own goals count for the other side). */
function tournamentCleanSheetRows() {
  const f = window.WC_FOOTBALL;
  if (!f || !f.matches) return [];
  const tally = {}; // goalkeeper id -> running clean-sheet row
  for (const [key, m] of Object.entries(f.matches)) {
    const rep = m.report;
    if (!rep || !rep.goals) continue;
    const sides = m.lineup && m.lineup.sides;
    let home = 0, away = 0;
    for (const ev of rep.goals) {
      const forHome = ev.own ? ev.side === "away" : ev.side === "home";
      if (forHome) home++; else away++;
    }
    const [homeName, awayName] = key.split("|");
    // The match key carries the app's own display names (which the flag map is
    // keyed on); the lineup's side.team uses API spellings, so prefer the key.
    const credit = (side, conceded, teamName) => {
      if (conceded > 0) return;            // not a clean sheet
      const sd = sides && sides[side];
      const gk = sd && ((sd.startXI || []).find((p) => p.pos === "G") || (sd.startXI || [])[0]);
      if (!gk || gk.id == null) return;    // no lineup -> can't attribute
      const e = tally[gk.id] || (tally[gk.id] = { name: gk.name, code: NAME_CODE[teamName] || "", sub: teamName, displayValue: 0 });
      e.displayValue++;
    };
    credit("home", away, homeName);        // home keeps a clean sheet if away scored 0
    credit("away", home, awayName);
  }
  return Object.values(tally).sort((x, y) => y.displayValue - x.displayValue).slice(0, 10);
}

function renderHistory() {
  const grid = document.getElementById("wch-grid");
  const data = window.WC_HISTORY;
  if (!grid || !data) return;
  const noteEl = document.querySelector(".wch-note");
  if (noteEl) noteEl.textContent = data.note || "";
  const live = liveWcMap();

  grid.innerHTML = (data.panels || []).map((p) => {
    let rows;
    if (p.live) {
      rows = p.key === "tournament_goals" ? tournamentStatRows("wcGoals")
        : p.key === "tournament_assists" ? tournamentStatRows("wcAssists")
        : p.key === "tournament_cleansheets" ? tournamentCleanSheetRows()
        : tournamentGARows();
    } else {
      rows = (p.rows || []).map((r) => {
        const L = r.id ? live[r.id] : null;
        let value, sub = r.sub, add = 0;
        if (p.key === "ga") {
          let g = r.g || 0, a = r.a || 0;
          if (L) { g += L.goals; a += L.assists; add = L.goals + L.assists; }
          value = g + a; sub = `${g} G · ${a} A`;
        } else if (p.key === "active_wins") {
          // Stage-weighted: title +6, Final 8, Semi 5, Quarter 3, R16 2.
          value = (r.t || 0) * 6 + (r.f || 0) * 8 + (r.sf || 0) * 5 + (r.qf || 0) * 3 + (r.r16 || 0) * 2;
        } else {
          value = r.value;
          if (L) {
            add = p.key === "goals" ? L.goals : p.key === "assists" ? L.assists : 0;
            value += add;
          }
        }
        return { name: r.name, code: r.code, displayValue: value, sub, add };
      });
      if (["goals", "assists", "ga", "active_wins"].includes(p.key)) {
        rows.sort((x, y) => y.displayValue - x.displayValue);
      }
      rows = rows.slice(0, 10);
    }

    const body = rows.length
      ? rows.map((r, i) => `
        <li class="wch-row${i === 0 ? " lead" : ""}">
          <span class="wch-rank">${i + 1}</span>
          <span class="wch-flag">${flagHtml(r.code)}</span>
          <span class="wch-name"><span class="wch-nm">${escapeHtml(r.name)}</span>${r.sub ? `<span class="wch-sub">${escapeHtml(r.sub)}</span>` : ""}</span>
          <span class="wch-val">${escapeHtml(String(r.displayValue))}${r.add ? `<span class="wch-live" title="+${r.add} at the 2026 World Cup">+${r.add}</span>` : ""}</span>
        </li>`).join("")
      : `<li class="wch-row"><span class="wch-empty">Nothing here yet — check back after kickoff.</span></li>`;

    const heading = p.live ? `2026 WC — ${escapeHtml(p.title)}` : `Top 10 — ${escapeHtml(p.title)}`;
    return `<div class="wch-card${p.live ? " wch-card-live" : ""}">
        <div class="wch-card-head">
          <span class="wch-icon" aria-hidden="true">${p.icon || ""}</span>
          <h3>${heading}</h3>
          ${p.live ? `<span class="wch-livebadge">LIVE</span>` : p.approx ? `<span class="wch-approx" title="Approximate — best-available historical data">≈</span>` : ""}
        </div>
        <ol class="wch-list">${body}</ol>
        ${p.note ? `<p class="wch-card-note">${escapeHtml(p.note)}</p>` : ""}
      </div>`;
  }).join("");
}

/* ================= Venues (stadium · city, country) ================= */
/* kickoffMs (date + "HH:MM UTC±O" -> UTC ms) lives in lib/engine.js. */
const kickoffMs = GSB.kickoffMs;

let VENUE = { byNum: {}, byGF: {} };
let KICKOFF = { byGF: {}, byNum: {} }; // kickoff ms — group fixtures + knockout match numbers
let KO_RESULT = { byNum: {} };         // knockout match number -> true once an official scoreline is in
function buildVenues() {
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  const byNum = {};
  const byGF = {};
  const koByGF = {};
  const koByNum = {};
  const resByNum = {};
  GROUP_LETTERS.forEach((g) => {
    byGF[g] = [null, null, null, null, null, null];
    koByGF[g] = [null, null, null, null, null, null];
  });
  for (const m of sched) {
    if (m.n != null && m.v) byNum[m.n] = m.v;
    // Knockout matches carry a numeric `n`: track kickoff + whether a result is in
    // so the corresponding bracket pick can lock the moment that game starts.
    if (m.n != null) {
      koByNum[m.n] = kickoffMs(m.d, m.t);
      resByNum[m.n] = m.hg != null && m.ag != null;
    }
    if (m.s && m.s.length === 1 && GROUP_IDX[m.s]) {
      const g = m.s;
      const i1 = GROUP_IDX[g][m.h];
      const i2 = GROUP_IDX[g][m.a];
      if (i1 != null && i2 != null) {
        const fi = FIXTURES.findIndex((p) => (p[0] === i1 && p[1] === i2) || (p[0] === i2 && p[1] === i1));
        if (fi >= 0) {
          if (m.v) byGF[g][fi] = m.v;
          koByGF[g][fi] = kickoffMs(m.d, m.t);
        }
      }
    }
  }
  VENUE = { byNum, byGF };
  KICKOFF = { byGF: koByGF, byNum: koByNum };
  KO_RESULT = { byNum: resByNum };
}

function fillGroupVenues() {
  document.querySelectorAll(".match").forEach((row) => {
    const el = row.querySelector(".match-venue");
    if (el) el.textContent = (VENUE.byGF[row.dataset.group] || [])[+row.dataset.match] || "";
  });
}

/* "Act." row under each match: the official scoreline, shown inline so you can
   see the real result against your prediction. */
function fillActuals() {
  const live = liveResults();
  document.querySelectorAll(".match .match-actual").forEach((el) => {
    const row = el.closest(".match");
    const a = (live[row.dataset.group] || [])[+row.dataset.match];
    if (a && a[0] != null && a[1] != null) {
      el.innerHTML = `<span class="act-label">Act.</span><span class="act-box">${a[0]}</span><span class="act-dash">–</span><span class="act-box">${a[1]}</span>`;
      return;
    }
    // No official result yet — fall back to an in-play scoreline if the match
    // is live right now (e.g. Switzerland 0–0 Bosnia, 46').
    const home = row.querySelector(".team.home .tname")?.textContent.trim();
    const away = row.querySelector(".team.away .tname")?.textContent.trim();
    const lv = home && away ? liveScoreFor(home, away) : null;
    el.innerHTML = (lv && lv.hg != null && lv.ag != null)
      ? `<span class="act-label act-live"><span class="sch-livedot"></span>Live</span><span class="act-box">${lv.hg}</span><span class="act-dash">–</span><span class="act-box">${lv.ag}</span><span class="act-min">${escapeHtml(liveLabel(lv))}</span>`
      : "";
  });
}

/* ================= Prediction vs actual (#2) ================= */
/* Matches that were already finished when the bracket currently shown in the
   editor was submitted. You can't meaningfully "predict" a match that was over
   before you finished your bracket, so we blank the box and leave it
   uncoloured (no gold). Populated from the loaded submission's `locked` snapshot. */
let editorLockedSet = new Set();
function setEditorLocked(sub) {
  editorLockedSet = new Set((sub && sub.locked) || []);
}

/* Colour-grade each match:
   ★ exact (gold), ✓ right outcome (green), ✗ wrong (red) for played matches you
   predicted; BLUE for any locked match (kicked off / finished) you did NOT
   predict — including ones already over before you locked your bracket. */
function markPredictionAccuracy() {
  const live = liveResults();
  const allowExact = state.mode !== "result";
  document.querySelectorAll(".match").forEach((row) => {
    const g = row.dataset.group;
    const m = +row.dataset.match;
    row.classList.remove("guess-exact", "guess-ok", "guess-miss", "guess-none", "guess-locked");
    const badge = row.querySelector(".match-grade");
    if (badge) { badge.className = "match-grade"; badge.textContent = ""; badge.title = ""; }

    const pred = state.scores[g][m];
    const actual = (live[g] || [])[m];
    const hasGuess = pred && pred[0] != null && pred[1] != null;
    // Auto-filled / pre-locked (locked + no pick, or stored value == actual) is
    // NOT your prediction: blank it and show blue. A locked match with a real
    // (differing) pick still shows graded.
    const preLocked = effectivelyPreLocked(g, m, pred, actual, editorLockedSet);

    if (preLocked || !hasGuess) {
      if (preLocked) row.querySelectorAll(".goal").forEach((el) => { el.value = ""; });
      if (isLocked(g, m)) {
        row.classList.add("guess-locked"); // locked with no pre-kickoff pick → blue
        if (badge) badge.title = "Locked — no prediction entered before kickoff";
      }
      return;
    }

    if (!actual || actual[0] == null || actual[1] == null) return; // your pick, not played yet

    let kind, sym;
    if (allowExact && pred[0] === actual[0] && pred[1] === actual[1]) { kind = "exact"; sym = "★"; }
    else if (outcome(pred) === outcome(actual)) { kind = "ok"; sym = "✓"; }
    else { kind = "miss"; sym = "✗"; }
    if (badge) {
      badge.className = "match-grade " + kind;
      badge.textContent = sym;
      badge.title = `Your pick ${pred[0]}–${pred[1]} · actual ${actual[0]}–${actual[1]}`;
    }
    row.classList.add("guess-" + kind);
  });
}

/* Was the winner picked in a bracket match the team that actually advanced? */
function bracketAccuracy(id, side, picks) {
  if (!side) return "";
  const adv = (window.WC_LIVE && window.WC_LIVE.advanced) || {};
  const round = BRACKET[id].round;
  const set =
    round === "R32" ? adv.R16 : round === "R16" ? adv.QF : round === "QF" ? adv.SF :
    round === "SF" ? adv.FINAL : round === "F" ? (adv.champion ? [adv.champion] : []) : null;
  if (!set || !set.length) return "";
  const p = participant(id, side, picks);
  if (!p || !p.known || !p.name) return "";
  return set.includes(p.name) ? "correct" : "wrong";
}

/* ================= Render all ================= */
function renderAll() {
  GROUP_LETTERS.forEach(renderGroup);
  updateResultButtons();
  markPredictionAccuracy();
  fillActuals();
  renderThirds();
  renderBracket();
  renderOfficialBracket();
  renderSecondBracket();
  refreshViewControls();  // enable Second Chance once the knockout round opens
  markConfirmedMatches(); // re-assert locks (kicked-off / confirmed) after any render
  markMissingEntries();   // flag blank/half-filled matches that block the bracket
  fitBrackets();          // keep each bracket scaled to fit (no horizontal slider)
}

/* Outline any group match that is still missing a (complete) score and is
   therefore blocking the bracket — so a forgotten or half-typed entry is
   impossible to miss. */
function markMissingEntries() {
  const sets = {};
  GROUP_LETTERS.forEach((g) => (sets[g] = new Set(missingMatchesIn(g, state.scores))));
  document.querySelectorAll(".match").forEach((row) => {
    row.classList.toggle("missing-entry", sets[row.dataset.group].has(+row.dataset.match));
  });
}

/* ================= Champion celebration ================= */
/* Cascading flags of the team you crown as champion. Fires once when a new
   champion is locked in (clears if you change/undo the pick). */
let lastChampCelebrated = null;
function maybeCelebrateChampion() {
  const champ = winnerOf(104);
  if (champ && champ.known && champ.name) {
    if (champ.name !== lastChampCelebrated) {
      lastChampCelebrated = champ.name;
      celebrateChampion(champ.code);
    }
  } else {
    lastChampCelebrated = null;
  }
}

function celebrateChampion(code) {
  const slug = flagSlug(code);
  if (!slug) return;
  let layer = document.getElementById("confetti-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "confetti-layer";
    layer.className = "confetti-layer";
    document.body.appendChild(layer);
  }
  layer.innerHTML = "";
  const N = 120;
  for (let i = 0; i < N; i++) {
    const f = document.createElement("img");
    f.className = "confetti-flag";
    f.src = `https://flagcdn.com/${slug}.svg`;
    f.alt = "";
    f.style.left = (Math.random() * 100).toFixed(2) + "vw";
    f.style.width = (15 + Math.random() * 18).toFixed(0) + "px";
    f.style.animationDelay = (Math.random() * 0.9).toFixed(2) + "s";
    f.style.animationDuration = (2.6 + Math.random() * 2).toFixed(2) + "s";
    f.style.setProperty("--rot", (Math.random() * 800 - 400).toFixed(0) + "deg");
    f.style.setProperty("--sway", (Math.random() * 60 - 30).toFixed(0) + "px");
    layer.appendChild(f);
  }
  clearTimeout(celebrateChampion._t);
  celebrateChampion._t = setTimeout(() => { if (layer) layer.innerHTML = ""; }, 5600);
}

/* ================= Events ================= */
/* Reset the green "Submitted" state when the user changes anything. */
function markDirty() {
  const btn = document.getElementById("submit-bracket");
  if (btn) btn.classList.remove("submitted");
  updateSubmitLabel();
}

function onGoalInput(e) {
  const el = e.target;
  if (!el.classList.contains("goal")) return;
  state.scores[el.dataset.group][+el.dataset.match][+el.dataset.side] = normScore(el.value);
  renderAll();
  saveState();
  markDirty();
}

function onResultClick(e) {
  const btn = e.target.closest(".res-btn");
  if (!btn) return;
  const row = btn.closest(".match");
  const g = row.dataset.group;
  const m = +row.dataset.match;
  const res = btn.dataset.res;
  const cur = resultOf(state.scores[g][m]);
  state.scores[g][m] =
    res === cur ? [null, null] : res === "home" ? [1, 0] : res === "away" ? [0, 1] : [0, 0];
  syncInputs();
  renderAll();
  saveState();
  markDirty();
}

function wireEvents() {
  groupsEl.addEventListener("input", onGoalInput);
  groupsEl.addEventListener("click", onResultClick);

  document.getElementById("mode-score").addEventListener("click", () => {
    setMode("score");
    saveState();
  });
  document.getElementById("mode-result").addEventListener("click", () => {
    setMode("result");
    saveState();
  });

  const vMain = document.getElementById("view-main");
  const vSecond = document.getElementById("view-second");
  if (vMain) vMain.addEventListener("click", () => setView("main"));
  if (vSecond) vSecond.addEventListener("click", () => setView("second"));
  const submitSecond = document.getElementById("submit-second");
  if (submitSecond) submitSecond.addEventListener("click", submitSecondChance);
  const copyMain = document.getElementById("copy-main-bracket");
  if (copyMain) copyMain.addEventListener("click", copyMainToSecond);

  bracketEl.addEventListener("click", (e) => {
    const row = e.target.closest(".bm-row");
    if (!row) return;
    const id = +row.dataset.id;
    if (knockoutOpen()) return;    // group stage decided — whole bracket frozen
    if (koMatchLocked(id)) return; // game has kicked off — pick is frozen
    const side = row.dataset.side;
    state.bracket[id] = state.bracket[id] === side ? null : side;
    renderBracket();
    saveState();
    markDirty();
    maybeCelebrateChampion();
  });

  // Second-chance bracket: only editable once the knockout round opens, then
  // each pick freezes at its own match kickoff.
  const secondBracketEl = document.getElementById("second-bracket");
  if (secondBracketEl) secondBracketEl.addEventListener("click", (e) => {
    const row = e.target.closest(".bm-row");
    if (!row) return;
    if (!knockoutOpen()) return;
    const id = +row.dataset.id;
    if (koMatchLocked(id)) return;
    const side = row.dataset.side;
    state.bracket2[id] = state.bracket2[id] === side ? null : side;
    renderSecondBracket();
    saveState();
    markSecondDirty();
  });

  document.getElementById("randomize").addEventListener("click", () => {
    for (const g of GROUP_LETTERS) {
      state.scores[g] = FIXTURES.map(() => [
        Math.floor(Math.random() * 4),
        Math.floor(Math.random() * 4),
      ]);
    }
    state.bracket = {};
    syncInputs();
    renderAll();
    saveState();
    markDirty();
  });

  // Leaderboard
  document.getElementById("submit-bracket").addEventListener("click", submitPredictions);
  document.getElementById("refresh-board").addEventListener("click", refreshBoard);
  const joinPoolBtn = document.getElementById("join-pool-btn");
  if (joinPoolBtn) joinPoolBtn.addEventListener("click", () => openJoinPanel("join"));
  document.getElementById("signin").addEventListener("click", signInWithGoogle);
  document.getElementById("signout").addEventListener("click", signOut);

  // ✏️ Rename your bracket: reveal the name field, then commit on Enter/blur.
  const renameBtn = document.getElementById("rename");
  const usernameEl = document.getElementById("username");
  const startRename = () => {
    if (!usernameEl) return;
    document.getElementById("whoami").style.display = "none";
    if (renameBtn) renameBtn.style.display = "none";
    usernameEl.style.display = "";
    usernameEl.focus();
    usernameEl.select();
  };
  const finishRename = () => {
    if (!usernameEl) return;
    const who = document.getElementById("whoami");
    const name = (usernameEl.value || "").trim() || googleName();
    usernameEl.value = name;
    if (authUser) {
      usernameEl.style.display = "none";
      who.textContent = "✓ " + name;
      who.style.display = "";
      if (renameBtn) renameBtn.style.display = "";
      markDirty(); // name changed — Submit & lock to save it
    }
  };
  if (renameBtn) renameBtn.addEventListener("click", startRename);
  if (usernameEl) {
    usernameEl.addEventListener("blur", finishRename);
    usernameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); usernameEl.blur(); }
    });
  }
  document.getElementById("clear-board").addEventListener("click", () => {
    if (!board.length) return;
    if (!confirm("Remove all leaderboard entries on this device?")) return;
    board = [];
    saveBoard();
    renderLeaderboard();
    document.getElementById("scorecard").innerHTML = "";
  });
  // Pool scope tabs + join panel + invite/leave actions (shared mode only).
  // The main and second-chance tab strips both drive the shared boardScope.
  const onScopeTabClick = (e) => {
    const tab = e.target.closest(".board-tab");
    if (!tab) return;
    const code = tab.dataset.code;
    if (code === "__join__") { openJoinPanel("join"); return; }
    boardScope = code;
    closeJoinPanel();
    renderScopeTabs();
    renderLeaderboard();
  };
  const boardTabs = document.getElementById("board-tabs");
  if (boardTabs) boardTabs.addEventListener("click", onScopeTabClick);
  const secondTabs = document.getElementById("second-board-tabs");
  if (secondTabs) secondTabs.addEventListener("click", onScopeTabClick);
  const addGroupBtn = document.getElementById("add-group-btn");
  if (addGroupBtn) addGroupBtn.addEventListener("click", () => openJoinPanel("create"));
  const joinPanel = document.getElementById("join-panel");
  if (joinPanel) joinPanel.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("join-msg");
    const mode = joinPanel.dataset.mode || "join";
    const code = document.getElementById("join-code").value;
    const pass = document.getElementById("join-pass").value;
    if (!normCode(code)) { if (msg) msg.textContent = "Enter a pool code."; return; }
    if (msg) msg.textContent = "…";
    if (mode === "join") {
      // Try to join with no password; if the pool is locked, ask for it.
      const res = await joinGroup(code, "");
      if (res.ok) { closeJoinPanel(); renderScopeTabs(); renderLeaderboard(); }
      else if (res.needPassword) openJoinPanel("password", code, "");
      else if (res.notFound && msg) msg.textContent = "No pool with that code — ask the organizer.";
      else if (msg) msg.textContent = "";
      return;
    }
    // "create" (admin sets optional password) or "password" (enter to join).
    const res = await joinGroup(code, pass);
    if (res.ok) { closeJoinPanel(); renderScopeTabs(); renderLeaderboard(); }
    else if (res.needPassword && msg) msg.textContent = "Wrong password — try again.";
    else if (res.notFound && msg) msg.textContent = "Only the organizer can create a group.";
    else if (msg) msg.textContent = "";
  });
  const joinCancel = document.getElementById("join-cancel");
  if (joinCancel) joinCancel.addEventListener("click", closeJoinPanel);
  const poolActions = document.getElementById("pool-actions");
  if (poolActions) poolActions.addEventListener("click", (e) => {
    if (e.target.closest("#copy-invite")) {
      const link = `${location.origin}${location.pathname}?group=${encodeURIComponent(boardScope)}`;
      const done = () => { const b = document.getElementById("copy-invite"); if (b) { const t = b.textContent; b.textContent = "✓ Copied"; setTimeout(() => (b.textContent = t), 1500); } };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt("Copy this invite link:", link));
      else prompt("Copy this invite link:", link);
    }
    if (e.target.closest("#set-pass")) setPoolPassword(boardScope);
    if (e.target.closest("#leave-pool")) leaveGroup(boardScope);
  });
  document.getElementById("leaderboard-table").addEventListener("click", (e) => {
    const view = e.target.closest(".lb-view");
    const del = e.target.closest(".lb-del");
    if (view) renderScorecard(view.dataset.id);
    if (del) {
      const id = del.dataset.id;
      const s = board.find((x) => x.id === id);
      if (!s || !confirm(`Delete ${s.username}'s entry? This can't be undone.`)) return;
      document.getElementById("scorecard").innerHTML = "";
      if (SHARED) {
        SB.from("submissions").delete().eq("id", id).then(({ error }) => {
          if (error) { alert("Delete failed: " + (error.message || error)); return; }
          if (myId() === null) setMine(null); // your own entry removed
          loadBoardRemote();
          updateSubmitLabel();
        });
      } else {
        board = board.filter((x) => x.id !== id);
        saveBoard();
        renderLeaderboard();
      }
    }
  });
  document.getElementById("scorecard").addEventListener("click", (e) => {
    if (e.target.closest(".sc-close")) document.getElementById("scorecard").innerHTML = "";
  });
}

/* ================= Init ================= */
loadState();
loadBoard();
buildGroups();
buildVenues();
syncInputs();
wireEvents();
setMode(state.mode);
/* ===== Header countdowns ===== */
/* First knockout (Round of 32) kickoff = earliest scheduled match carrying a
   numeric `n` (only knockout matches do). */
function firstKnockoutKickoffMs() {
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  let min = Infinity;
  for (const m of sched) {
    if (m.n == null) continue;
    const ko = kickoffMs(m.d, m.t);
    if (ko != null && ko < min) min = ko;
  }
  return min === Infinity ? null : min;
}
/* Group stage "ends" ≈ the last group match kicks off + ~2h to finish, which is
   roughly when results land and the second-chance round opens. */
function groupStageEndsMs() {
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  let max = -Infinity;
  for (const m of sched) {
    // Group matches use a single-letter stage AND carry no numeric `n`
    // (knockout matches do — note the Final's stage code is also "F").
    if (m.n != null || !(m.s && m.s.length === 1)) continue;
    const ko = kickoffMs(m.d, m.t);
    if (ko != null && ko > max) max = ko;
  }
  return max === -Infinity ? null : max + 2 * 60 * 60 * 1000;
}
function fmtCountdown(ms) {
  if (ms == null || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${Math.floor(s / 86400)}d ${p2(Math.floor((s % 86400) / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
}
let cdKnockoutAt = null, cdGroupsAt = null;
function tickCountdowns() {
  const now = Date.now();
  const kEl = document.getElementById("cd-knockout-time");
  const gEl = document.getElementById("cd-groups-time");
  if (kEl) kEl.textContent = fmtCountdown(cdKnockoutAt != null ? cdKnockoutAt - now : null) || "Underway";
  if (gEl) gEl.textContent = fmtCountdown(cdGroupsAt != null ? cdGroupsAt - now : null) || (knockoutOpen() ? "Open now!" : "Underway");
}
function initCountdowns() {
  cdKnockoutAt = firstKnockoutKickoffMs();
  cdGroupsAt = groupStageEndsMs();
  tickCountdowns();
  setInterval(tickCountdowns, 1000);
}

renderAll();
renderSchedule();
renderHistory();
wireMatchInfo();
fillGroupVenues();
setupBoardUI();
refreshBoard();
markConfirmedMatches();
layoutGroups();
initTitleScreen();
initAuth();
initCountdowns();
observeBrackets(); // keep every bracket scaled to fit its container (no sliders)

// Re-lock matches as their kickoff time passes while the page stays open.
setInterval(markConfirmedMatches, 15000);

// Keep live scores (and the 2026 board) ticking over without a full reload.
// ESPN's keyless API (every 45s) drives real-time scores; the committed feed
// (every 2 min) backfills lineups/deep stats from the GitHub Action.
pollEspnLive();
setInterval(pollEspnLive, 45000);
pollLiveScores();
setInterval(pollLiveScores, 120000);

// Re-flow the masonry columns when the viewport width changes.
let layoutTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => { layoutGroups(); fitBrackets(); }, 150);
});

(function restoreIdentity() {
  const mine = getMine();
  const input = document.getElementById("username");
  if (!SHARED && mine && mine.username && input) input.value = mine.username;
  updateSubmitLabel();
})();
