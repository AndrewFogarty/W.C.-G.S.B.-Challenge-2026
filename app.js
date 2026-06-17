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
/* Effective scores: actual result for played matches, else your prediction —
   so standings + the bracket reflect real results plus your remaining picks. */
function effScores(group) {
  const live = liveResults();
  return state.scores[group].map((pred, i) => {
    const a = (live[group] || [])[i];
    return a && a[0] != null && a[1] != null ? a : pred;
  });
}
function rankGroup(group) {
  return GSB.rankGroup(state.names[group], effScores(group));
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
        <span class="match-lock" title="Officially confirmed result — predictions for this match don't score on the leaderboard" aria-hidden="true">🔒</span>
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

/* Resolve an R32 slot spec for a given match id. */
function resolveR32(matchId, spec) {
  if (spec[0] === "1") return { ...slotInfo(spec[1], 0), label: "1" + spec[1], known: groupComplete(spec[1]) };
  if (spec[0] === "2") return { ...slotInfo(spec[1], 1), label: "2" + spec[1], known: groupComplete(spec[1]) };
  // third-place slot
  const allow = spec.slice(2).split("").join("/");
  const g = thirdMap[matchId];
  const info = g ? slotInfo(g, 2) : { name: null, code: "" };
  return { ...info, label: "3rd " + allow, known: allGroupsComplete() && !!g };
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
  const label = known
    ? `<span class="bm-name">${escapeHtml(p.name)}</span>`
    : `<span class="bm-name ph">${escapeHtml(p.label || "—")}</span>`;
  const flag = known ? flagHtml(p.code) : "•";
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
function countLiveResults() {
  const r = (window.WC_LIVE && window.WC_LIVE.results) || {};
  let n = 0;
  for (const g of GROUP_LETTERS) (r[g] || []).forEach((x) => { if (x) n++; });
  return n;
}

function loadActualResults() {
  const live = window.WC_LIVE && window.WC_LIVE.results;
  if (!live) return;
  const n = countLiveResults();
  if (!confirm(`Fill in the ${n} actual result(s) played so far? This overwrites the score for those matches.`)) return;
  for (const g of GROUP_LETTERS) {
    (live[g] || []).forEach((sc, i) => {
      if (Array.isArray(sc) && sc.length === 2) {
        state.scores[g][i] = [normScore(sc[0]), normScore(sc[1])];
      }
    });
  }
  syncInputs();
  renderAll();
  saveState();
}

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

/* Fill any empty boxes from your own submitted entry, so your guesses (incl.
   already-played matches) show and get colour-graded without re-clicking Edit. */
function hydrateMyGuesses() {
  const mine = getMine();
  if (!mine || !mine.id) return;
  const sub = board.find((s) => s.id === mine.id);
  if (!sub || !sub.scores) return;
  let changed = false;
  for (const g of GROUP_LETTERS) {
    const arr = sub.scores[g] || [];
    arr.forEach((sc, i) => {
      const cur = state.scores[g][i];
      if ((cur[0] == null || cur[1] == null) && Array.isArray(sc) && sc[0] != null && sc[1] != null) {
        state.scores[g][i] = [normScore(sc[0]), normScore(sc[1])];
        changed = true;
      }
    });
  }
  if (changed) { syncInputs(); renderAll(); saveState(); }
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

function liveResults() {
  return (window.WC_LIVE && window.WC_LIVE.results) || {};
}

function isConfirmed(g, i) {
  const live = liveResults();
  return !!(live[g] && live[g][i] && live[g][i][0] !== null && live[g][i][1] !== null);
}

/* Matches already officially confirmed when a submission was made — these
   don't count toward the leaderboard (you can't "guess" a known result). */
function confirmedKeysNow() {
  const keys = [];
  for (const g of GROUP_LETTERS) for (let i = 0; i < 6; i++) if (isConfirmed(g, i)) keys.push(g + i);
  return keys;
}

/* Add a 🔒 to group matches whose result is already official. */
function markConfirmedMatches() {
  document.querySelectorAll(".match").forEach((row) => {
    const conf = isConfirmed(row.dataset.group, +row.dataset.match);
    row.classList.toggle("confirmed", conf);
    // only non-locked games can be changed
    row.querySelectorAll(".goal, .res-btn").forEach((el) => { el.disabled = conf; });
  });
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
      if (lockedSet.has(g + i)) { locked++; continue; } // pre-confirmed — excluded
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
  const name = (input.value || "").trim();
  if (!name) { input.focus(); return; }
  const mine = getMine();
  const editKey = (mine && mine.editKey) || Math.random().toString(36).slice(2);
  const payload = {
    scores: JSON.parse(JSON.stringify(state.scores)),
    bracket: JSON.parse(JSON.stringify(state.bracket)),
    locked: confirmedKeysNow(), // matches already official at submit time → excluded
    predicted: predictedAdvancement(), // teams sent to each knockout round
    editKey,
  };
  if (SHARED) {
    const btn = document.getElementById("submit-bracket");
    btn.disabled = true;
    try {
      if (mine && mine.id) {
        const { error } = await SB.from("submissions")
          .update({ username: name, mode: state.mode, payload }).eq("id", mine.id);
        if (error) throw error;
        setMine({ id: mine.id, editKey, username: name });
      } else {
        const { data, error } = await SB.from("submissions")
          .insert({ username: name, mode: state.mode, payload }).select().single();
        if (error) throw error;
        setMine({ id: data.id, editKey, username: name });
      }
      await loadBoardRemote();
    } catch (e) {
      alert("Save failed: " + (e.message || e));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
  } else {
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
  updateSubmitLabel();
  document.getElementById("leaderboard-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateSubmitLabel() {
  const btn = document.getElementById("submit-bracket");
  if (btn) btn.textContent = getMine() ? "✏️ Update my entry" : "🔒 Submit & lock";
}

/* Load a submission's predictions back into the editor (group scores +
   bracket). Already-played (locked) matches are left untouched. */
function loadSubmissionIntoEditor(id) {
  const sub = board.find((s) => s.id === id);
  if (!sub) return;
  if (!confirm(`Load ${sub.username}'s predictions into the editor? (Played matches stay locked — read-only.)`)) return;
  for (const g of GROUP_LETTERS) {
    const arr = (sub.scores && sub.scores[g]) || [];
    arr.forEach((sc, i) => {
      // load every guess (locked ones display read-only so you can compare)
      state.scores[g][i] = Array.isArray(sc) && sc.length === 2 ? [normScore(sc[0]), normScore(sc[1])] : [null, null];
    });
  }
  if (sub.bracket) state.bracket = JSON.parse(JSON.stringify(sub.bracket));
  syncInputs();
  renderAll();
  saveState();
  const g = document.getElementById("groups");
  if (g) g.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const mineId = (getMine() || {}).id;
  tbody.innerHTML = rows
    .map((e, i) => `
      <tr class="${i === 0 ? "leader" : ""} ${e.sub.id === mineId ? "mine" : ""}">
        <td class="col-pos">${i + 1}</td>
        <td class="col-team">${escapeHtml(e.sub.username)}${e.sub.id === mineId ? ' <span class="you">you</span>' : ""}</td>
        <td class="pts">${e.sc.total}</td>
        <td class="col-breakdown">${e.sc.exact}×50 · ${e.sc.outcome}×10${e.sc.koHits ? " · KO " + e.sc.koHits + "×20" : ""}${e.sc.champ ? " · 🏆100" : ""}</td>
        <td>${e.sub.mode === "result" ? "W/D/L" : "Score"}</td>
        <td class="lb-actions">
          <button class="lb-edit" data-id="${e.sub.id}" type="button" title="Load these picks into the editor">Edit</button>
          <button class="lb-view" data-id="${e.sub.id}" type="button">View</button>
          ${SHARED ? "" : `<button class="lb-del" data-id="${e.sub.id}" type="button" title="Remove entry" aria-label="Remove">✕</button>`}
        </td>
      </tr>`)
    .join("");
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
      <span class="sc-sub">${sc.exact} exact · ${sc.outcome} result · ${sc.miss} miss · ${sc.locked} 🔒${sc.koHits ? " · KO " + sc.koHits + "×20" : ""}${sc.champ ? " · 🏆+100" : ""}</span>
      <button class="sc-close" type="button" aria-label="Close">✕</button>
    </div>
    <div class="sc-legend">
      <span class="sc-chip exact">50</span> exact
      <span class="sc-chip outcome">10</span> result
      <span class="sc-chip miss">0</span> miss
      <span class="sc-chip pending">·</span> not played
      <span class="sc-chip locked">🔒</span> already confirmed (no points)
    </div>
    <div class="sc-groups">`;

  for (const g of GROUP_LETTERS) {
    html += `<div class="sc-grp"><span class="sc-grp-tag">${g}</span><div class="sc-chips">`;
    FIXTURES.forEach((fx, i) => {
      const [hi, ai] = fx;
      const pred = (sub.scores[g] || [])[i];
      const act = (live[g] || [])[i];
      const nm = state.names[g];
      if (lockedSet.has(g + i)) {
        const t = `${nm[hi]} v ${nm[ai]} — already confirmed at submit time (no points)`;
        html += `<span class="sc-chip locked" title="${escapeHtml(t)}">🔒</span>`;
        return;
      }
      const r = scoreMatch(pred, act, allowExact);
      const shown = sub.mode === "result" ? sym(pred) : fmt(pred);
      const title = `${nm[hi]} v ${nm[ai]} — you ${sub.mode === "result" ? sym(pred) : fmt(pred)}, actual ${fmt(act)}${r.pts ? " (+" + r.pts + ")" : ""}`;
      html += `<span class="sc-chip ${r.kind}" title="${escapeHtml(title)}">${shown === "—" ? "·" : shown}</span>`;
    });
    html += `</div></div>`;
  }
  html += `</div>`;
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
      const mid = played ? `<span class="sch-score">${m.hg}–${m.ag}</span>` : `<span class="sch-v">v</span>`;
      const stage = m.s.length === 1 ? "Group " + m.s : m.s;
      return `<div class="sch-card${played ? " done" : ""}">
        <div class="sch-meta">${fmtDate(m.d)} · ${toEasternTime(m.t)} ET · ${stage}</div>
        <div class="sch-row">
          <span class="sch-team">${flagFor(m.h)}<span class="sch-name">${escapeHtml(m.h)}</span></span>
          ${mid}
          <span class="sch-team away">${flagFor(m.a)}<span class="sch-name">${escapeHtml(m.a)}</span></span>
        </div>
      </div>`;
    })
    .join("");
}

/* ================= Venues (stadium · city, country) ================= */
let VENUE = { byNum: {}, byGF: {} };
function buildVenues() {
  const sched = (window.WC_LIVE && window.WC_LIVE.schedule) || [];
  const byNum = {};
  const byGF = {};
  GROUP_LETTERS.forEach((g) => (byGF[g] = [null, null, null, null, null, null]));
  for (const m of sched) {
    if (!m.v) continue;
    if (m.n != null) byNum[m.n] = m.v;
    if (m.s && m.s.length === 1 && GROUP_IDX[m.s]) {
      const g = m.s;
      const i1 = GROUP_IDX[g][m.h];
      const i2 = GROUP_IDX[g][m.a];
      if (i1 != null && i2 != null) {
        const fi = FIXTURES.findIndex((p) => (p[0] === i1 && p[1] === i2) || (p[0] === i2 && p[1] === i1));
        if (fi >= 0) byGF[g][fi] = m.v;
      }
    }
  }
  VENUE = { byNum, byGF };
}

function fillGroupVenues() {
  document.querySelectorAll(".match").forEach((row) => {
    const el = row.querySelector(".match-venue");
    if (el) el.textContent = (VENUE.byGF[row.dataset.group] || [])[+row.dataset.match] || "";
  });
}

/* "Act." row under each match: the official scoreline in black. */
function fillActuals() {
  const live = liveResults();
  document.querySelectorAll(".match").forEach((row) => {
    const el = row.querySelector(".match-actual");
    if (!el) return;
    const a = (live[row.dataset.group] || [])[+row.dataset.match];
    if (a && a[0] != null && a[1] != null) {
      el.innerHTML = `<span class="act-label">Act.</span><span class="act-box">${a[0]}</span><span class="act-dash">–</span><span class="act-box">${a[1]}</span>`;
    } else {
      el.innerHTML = "";
    }
  });
}

/* ================= Prediction vs actual (#2) ================= */
function markPredictionAccuracy() {
  const live = liveResults();
  document.querySelectorAll(".match").forEach((row) => {
    const g = row.dataset.group;
    const m = +row.dataset.match;
    const badge = row.querySelector(".match-grade");
    if (!badge) return;
    const actual = (live[g] || [])[m];
    const pred = state.scores[g][m];
    row.classList.remove("guess-exact", "guess-ok", "guess-miss");
    if (!actual || actual[0] === null || !pred || pred[0] === null) {
      badge.className = "match-grade";
      badge.textContent = "";
      return;
    }
    let kind, sym;
    if (pred[0] === actual[0] && pred[1] === actual[1]) { kind = "exact"; sym = "★"; }
    else if (outcome(pred) === outcome(actual)) { kind = "ok"; sym = "✓"; }
    else { kind = "miss"; sym = "✗"; }
    badge.className = "match-grade " + kind;
    badge.textContent = sym;
    badge.title = `Your pick ${pred[0]}–${pred[1]} · actual ${actual[0]}–${actual[1]}`;
    row.classList.add("guess-" + kind); // gold / green / red on the guess boxes
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
}

/* ================= Events ================= */
function onGoalInput(e) {
  const el = e.target;
  if (!el.classList.contains("goal")) return;
  state.scores[el.dataset.group][+el.dataset.match][+el.dataset.side] = normScore(el.value);
  renderAll();
  saveState();
}

function onNameEdit(e) {
  const el = e.target;
  if (!el.classList.contains("tname")) return;
  const g = el.dataset.group; const idx = +el.dataset.idx;
  state.names[g][idx] = el.textContent.trim() || DEFAULT_GROUPS[g][idx][0];
  renderAll();
  saveState();
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
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("Clear all predicted scores and bracket picks?")) return;
    for (const g of GROUP_LETTERS) state.scores[g] = FIXTURES.map(() => [null, null]);
    state.bracket = {};
    syncInputs();
    renderAll();
    saveState();
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
  });

  // "Load actual results" — only enabled when live data is present
  const la = document.getElementById("load-actual");
  if (la) {
    const n = countLiveResults();
    if (window.WC_LIVE && n > 0) {
      la.textContent = `📥 Actual results (${n})`;
      const when = (window.WC_LIVE.updated || "").slice(0, 10);
      la.title = `From ${window.WC_LIVE.source || "live data"}${when ? ", updated " + when : ""}`;
      la.addEventListener("click", loadActualResults);
    } else {
      la.style.display = "none";
    }
  }

  // Leaderboard
  document.getElementById("submit-bracket").addEventListener("click", submitPredictions);
  document.getElementById("refresh-board").addEventListener("click", refreshBoard);
  document.getElementById("username").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitPredictions(); }
  });
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
    const edit = e.target.closest(".lb-edit");
    const del = e.target.closest(".lb-del");
    if (edit) loadSubmissionIntoEditor(edit.dataset.id);
    if (view) renderScorecard(view.dataset.id);
    if (del) {
      const id = del.dataset.id;
      const s = board.find((x) => x.id === id);
      if (s && confirm(`Remove ${s.username}'s entry?`)) {
        board = board.filter((x) => x.id !== id);
        saveBoard();
        renderLeaderboard();
        document.getElementById("scorecard").innerHTML = "";
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
fillGroupVenues();
setupBoardUI();
refreshBoard();
markConfirmedMatches();

(function restoreIdentity() {
  const mine = getMine();
  const input = document.getElementById("username");
  if (mine && mine.username && input) input.value = mine.username;
  updateSubmitLabel();
})();
