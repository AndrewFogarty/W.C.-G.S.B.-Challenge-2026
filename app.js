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
let state = { names: {}, scores: {}, bracket: {}, mode: "score" };

/* ================= Persistence ================= */
function loadState() {
  const fresh = { names: {}, scores: {}, bracket: {}, mode: "score" };
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
function effScores(group) {
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
          <span class="tname" data-group="${g}" data-idx="${hi}" contenteditable="true" spellcheck="false"></span>
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
          <span class="tname" data-group="${g}" data-idx="${ai}" contenteditable="true" spellcheck="false"></span>
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

function participant(matchId, side) {
  const m = BRACKET[matchId];
  const spec = side === "home" ? m.home : m.away;
  if (typeof spec === "string") return resolveR32(matchId, spec);
  if (spec.loser !== undefined) {
    const child = spec.loser;
    const w = state.bracket[child];
    if (!w) return { name: null, code: "", label: "Loser " + ROUND_NAME[BRACKET[child].round], known: false };
    return participant(child, w === "home" ? "away" : "home");
  }
  const child = spec.from;
  const w = state.bracket[child];
  if (!w) return { name: null, code: "", label: "Winner " + ROUND_NAME[BRACKET[child].round], known: false };
  return participant(child, w);
}

function winnerOf(matchId) {
  const w = state.bracket[matchId];
  return w ? participant(matchId, w) : null;
}

function rowHtml(id, side, p, selected, acc) {
  const known = p.known && p.name;
  const prov = !known && p.provisional && p.name;     // seeded from partial standings
  const show = known || prov;
  const label = show
    ? `<span class="bm-name${prov ? " prov" : ""}"${prov ? ' title="Provisional — from current standings; finish the group to lock it"' : ""}>${escapeHtml(p.name)}${prov ? '<span class="bm-prov">~</span>' : ""}</span>`
    : `<span class="bm-name ph">${escapeHtml(p.label || "—")}</span>`;
  const flag = show ? flagHtml(p.code) : "•";
  const mark = acc === "correct" ? '<span class="bm-mark ok">✓</span>'
    : acc === "wrong" ? '<span class="bm-mark no">✗</span>' : "";
  return `<button class="bm-row ${selected ? "sel" : ""} ${acc || ""}" data-id="${id}" data-side="${side}" type="button">
      <span class="flag">${flag}</span>${label}${mark}
    </button>`;
}

function matchCard(id, extraClass) {
  const h = participant(id, "home");
  const a = participant(id, "away");
  const w = state.bracket[id];
  const acc = w ? bracketAccuracy(id, w) : "";
  const v = VENUE.byNum[id];
  return `<div class="bm ${extraClass || ""}" data-id="${id}">
      ${rowHtml(id, "home", h, w === "home", w === "home" ? acc : "")}
      ${rowHtml(id, "away", a, w === "away", w === "away" ? acc : "")}
      ${v ? `<div class="bm-venue">${escapeHtml(v)}</div>` : ""}
    </div>`;
}

function renderBracket() {
  thirdMap = thirdAssignments();
  const col = (title, ids, cls) =>
    `<div class="round ${cls || ""}"><h3 class="round-title">${title}</h3>
      <div class="round-body">${ids.map((id) => matchCard(id)).join("")}</div></div>`;

  const champ = winnerOf(104);
  const champHtml = champ && champ.known && champ.name
    ? `<div class="champion"><span class="trophy">🏆</span>
         <span class="champ-flag">${flagHtml(champ.code)}</span>
         <span class="champ-name">${escapeHtml(champ.name)}</span>
         <span class="champ-label">Your champion</span></div>`
    : `<div class="champion empty"><span class="trophy">🏆</span><span class="champ-label">Pick winners to crown a champion</span></div>`;

  const finalCol = `<div class="round final-col">
      <h3 class="round-title">Final</h3>
      <div class="round-body">
        ${matchCard(104, "is-final")}
        ${champHtml}
        <div class="tp-block">
          <h4>Third-place match</h4>
          ${matchCard(103, "is-tp")}
        </div>
      </div>
    </div>`;

  const warnEl = document.getElementById("bracket-warning");
  if (warnEl) {
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

  bracketEl.innerHTML =
    col("Round of 32", ROUND_ORDER.R32) +
    col("Round of 16", ROUND_ORDER.R16) +
    col("Quarter-finals", ROUND_ORDER.QF) +
    col("Semi-finals", ROUND_ORDER.SF) +
    finalCol;
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
  try {
    const { data } = await SB.auth.getSession();
    authUser = (data && data.session && data.session.user) || null;
  } catch (e) { /* ignore */ }
  // The predictor is gated behind Google sign-in: you enter only when actually
  // signed in (a valid session counts). No account → the title screen stays up.
  if (authUser) showApp();
  SB.auth.onAuthStateChange((_event, sess) => {
    authUser = (sess && sess.user) || null;
    if (authUser) showApp();
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
    renderLeaderboard();
    hydrateMyGuesses();
  } catch (e) {
    console.warn("leaderboard load failed:", e.message || e);
  }
}

function refreshBoard() {
  if (SHARED) loadBoardRemote();
  else { loadBoard(); renderLeaderboard(); hydrateMyGuesses(); }
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

function setupBoardUI() {
  const scope = document.getElementById("board-scope");
  const clear = document.getElementById("clear-board");
  if (SHARED) {
    if (scope) scope.textContent = "🌐 Shared leaderboard";
    if (clear) clear.style.display = "none";
    setInterval(loadBoardRemote, 45000); // keep roughly in sync
  } else if (scope) {
    scope.textContent = "💾 This device";
  }
}

/* outcome + scoreMatch live in lib/engine.js (so they're unit-tested). */
const outcome = GSB.outcome;
const scoreMatch = GSB.scoreMatch;

/* Teams a submission predicted to reach each knockout round (snapshotted
   at submit time from the bracket picks). */
function predictedAdvancement() {
  const names = (ids) =>
    ids.map((id) => { const w = winnerOf(id); return w && w.known ? w.name : null; }).filter(Boolean);
  const champ = winnerOf(104);
  return {
    R16: names(ROUND_ORDER.R32),
    QF: names(ROUND_ORDER.R16),
    SF: names(ROUND_ORDER.QF),
    FINAL: names(ROUND_ORDER.SF),
    champion: champ && champ.known ? champ.name : null,
  };
}

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
  const adv = (window.WC_LIVE && window.WC_LIVE.advanced) || {};
  const pred = sub.predicted || {};
  let koHits = 0, champ = 0;
  for (const r of ["R16", "QF", "SF", "FINAL"]) {
    const actual = new Set(adv[r] || []);
    for (const t of pred[r] || []) if (actual.has(t)) koHits++;
  }
  if (pred.champion && adv.champion && pred.champion === adv.champion) champ = 100;
  total += koHits * 20 + champ;

  return { total, exact, outcome: outc, miss, scored, locked, koHits, champ };
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

function renderLeaderboard() {
  const tbody = document.querySelector("#leaderboard-table tbody");
  if (!tbody) return;
  const rows = board
    .filter((s) => !HIDDEN_USERS.has(s.username))
    .map((s) => ({ sub: s, sc: scoreSubmission(s) }))
    .sort((a, b) => b.sc.total - a.sc.total || a.sub.createdAt.localeCompare(b.sub.createdAt));
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No entries yet — submit a bracket above to start the leaderboard.</td></tr>`;
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
      <span class="sc-chip missing">!</span> unfilled (blocks bracket)
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
      knockout slots can't fully seed (3rd-place needs <em>all</em> groups):
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
        html += `<span class="sc-chip missing" title="${escapeHtml(`${nm[hi]} v ${nm[ai]} — no prediction; blocks knockout seeding`)}">!</span>`;
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
        ? `<span class="sch-wx" data-city="${escapeHtml(city)}" data-date="${m.d}" title="Live match-day forecast"></span>`
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
      </div>`;
    })
    .join("");

  // Populate live weather (Open-Meteo) for the upcoming-match cards.
  if (window.WCWeather) WCWeather.fill(".schedule-strip .sch-wx");
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
let lastEspn = null;
/* Overlay an ESPN scoreboard payload onto WC_LIVE.results (finished matches) and
   WC_FOOTBALL.live (in-play). Returns true if anything changed. */
function applyEspnOverlay(j) {
  if (!j || !Array.isArray(j.events)) return false;
  if (!window.WC_LIVE) window.WC_LIVE = { results: {}, schedule: [] };
  if (!window.WC_FOOTBALL) window.WC_FOOTBALL = { teams: {}, live: [] };
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
    if (applyEspnOverlay(lastEspn)) rerenderAfterLiveUpdate();
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
  return `<div class="pp" ${posStyle ? `style="${posStyle}"` : ""}>
      <div class="pp-shirt">${img}<span class="pp-fallnum">${escapeHtml(num)}</span>${rating}</div>
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
  const perf = (data.report && data.report.players) || null;
  const banner = kind === "live"
    ? `<div class="mi-live"><span class="mi-dot"></span> Official lineup (live)</div>`
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

/* --- Per-squad season stats with top-performer highlights --- */
function renderSquadTable(name) {
  const t = teamInfoData(name);
  if (!t || !t.players || !t.players.length) {
    return `<div class="mi-squad"><h4>${escapeHtml(name)}</h4>${miNotice("Squad stats will appear once the data feed runs.")}</div>`;
  }
  // Per-game stats are only meaningful for players who featured this season.
  const squad = t.players.filter((p) => p.games > 0);
  if (!squad.length) {
    return `<div class="mi-squad"><h4>${escapeHtml(name)}</h4>${miNotice("No player appearances recorded yet this season.")}</div>`;
  }
  // Squad leader per metric, with a minimum-appearances guard so a single-cap
  // player can't top a per-game ranking on a fluke. Falls back to all if needed.
  const maxG = Math.max(...squad.map((p) => p.games));
  const minG = Math.max(2, Math.ceil(maxG / 3));
  const topName = (metric) => {
    let pool = squad.filter((p) => p.games >= minG && p[metric] > 0);
    if (!pool.length) pool = squad.filter((p) => p[metric] > 0);
    if (!pool.length) return null;
    return pool.slice().sort((a, b) => b[metric] - a[metric])[0].name;
  };
  const L = { goals: topName("gpg"), assists: topName("apg"), fouls: topName("fpg") };
  const lead = (player, metric) => (L[metric] && player.name === L[metric]) ? " mi-top" : "";
  const rows = squad.map((p) => `
    <tr>
      <td class="mi-pl">${p.photo ? `<img class="mi-photo" src="${escapeHtml(p.photo)}" alt="" loading="lazy" />` : ""}<span>${escapeHtml(p.name)}</span></td>
      <td class="mi-pos">${escapeHtml(p.pos || "—")}</td>
      <td>${p.games}</td>
      <td class="mi-wc">${p.wcGoals || 0}</td>
      <td class="mi-wc">${p.wcAssists || 0}</td>
      <td class="mi-g${lead(p, "goals")}">${p.gpg.toFixed(2)}</td>
      <td class="mi-a${lead(p, "assists")}">${p.apg.toFixed(2)}</td>
      <td>${p.mpg}</td>
      <td class="mi-f${lead(p, "fouls")}">${p.fpg.toFixed(2)}</td>
      <td class="mi-yc">${p.yellow}</td>
      <td class="mi-rc">${p.red}</td>
    </tr>`).join("");
  return `<div class="mi-squad">
      <h4>${escapeHtml(name)} <span class="mi-season">${t.season || ""} season</span></h4>
      <div class="mi-table-wrap">
        <table class="mi-stats">
          <thead><tr>
            <th class="mi-pl">Player</th><th>Pos</th><th title="Games played">GP</th>
            <th title="World Cup goals so far">🏆G</th><th title="World Cup assists so far">🏆A</th>
            <th title="Goals per game (all competitions, this season)">G/G</th><th title="Assists per game (all competitions, this season)">A/G</th>
            <th title="Minutes per game">Min</th><th title="Fouls per game">F/G</th>
            <th title="Yellow cards">🟨</th><th title="Red cards">🟥</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderStatsTab(home, away) {
  return `<div class="mi-legend">Highlighted = squad leader in
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
      rows = tournamentGARows();
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
      : `<li class="wch-row"><span class="wch-empty">No goals or assists yet — check back after kickoff.</span></li>`;

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
let KICKOFF = { byGF: {} }; // ms timestamp per group fixture
function buildVenues() {
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  const byNum = {};
  const byGF = {};
  const koByGF = {};
  GROUP_LETTERS.forEach((g) => {
    byGF[g] = [null, null, null, null, null, null];
    koByGF[g] = [null, null, null, null, null, null];
  });
  for (const m of sched) {
    if (m.n != null && m.v) byNum[m.n] = m.v;
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
  KICKOFF = { byGF: koByGF };
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
function bracketAccuracy(id, side) {
  if (!side) return "";
  const adv = (window.WC_LIVE && window.WC_LIVE.advanced) || {};
  const round = BRACKET[id].round;
  const set =
    round === "R32" ? adv.R16 : round === "R16" ? adv.QF : round === "QF" ? adv.SF :
    round === "SF" ? adv.FINAL : round === "F" ? (adv.champion ? [adv.champion] : []) : null;
  if (!set || !set.length) return "";
  const p = participant(id, side);
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
  markConfirmedMatches(); // re-assert locks (kicked-off / confirmed) after any render
  markMissingEntries();   // flag blank/half-filled matches that block the bracket
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

function onNameEdit(e) {
  const el = e.target;
  if (!el.classList.contains("tname")) return;
  const g = el.dataset.group; const idx = +el.dataset.idx;
  state.names[g][idx] = el.textContent.trim() || DEFAULT_GROUPS[g][idx][0];
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
  groupsEl.addEventListener("blur", onNameEdit, true);

  document.getElementById("mode-score").addEventListener("click", () => {
    setMode("score");
    saveState();
  });
  document.getElementById("mode-result").addEventListener("click", () => {
    setMode("result");
    saveState();
  });

  groupsEl.addEventListener("keydown", (e) => {
    if (e.target.classList.contains("tname") && e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  });

  bracketEl.addEventListener("click", (e) => {
    const row = e.target.closest(".bm-row");
    if (!row) return;
    const id = +row.dataset.id;
    const side = row.dataset.side;
    state.bracket[id] = state.bracket[id] === side ? null : side;
    renderBracket();
    saveState();
    markDirty();
    maybeCelebrateChampion();
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Clear all predicted scores and bracket picks?")) return;
    for (const g of GROUP_LETTERS) state.scores[g] = FIXTURES.map(() => [null, null]);
    state.bracket = {};
    syncInputs();
    renderAll();
    saveState();
    markDirty();
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
  layoutTimer = setTimeout(layoutGroups, 150);
});

(function restoreIdentity() {
  const mine = getMine();
  const input = document.getElementById("username");
  if (!SHARED && mine && mine.username && input) input.value = mine.username;
  updateSubmitLabel();
})();
