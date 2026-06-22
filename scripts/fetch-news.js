/* =====================================================================
   fetch-news.js — runs in GitHub Actions (Node 20) to scan ESPN for
   World Cup news and surface it in the app.

   Sources (both free, no API key):
     1. ESPN's FIFA World Cup news feed — team & match stories:
          .../soccer/fifa.world/news
     2. ESPN's per-athlete news feed — player-specific injury / transfer
        / off-field stories, for the players who show up in (1):
          .../soccer/all/news?athlete=<id>

   For every article we figure out:
     - which 2026 teams it's about (from ESPN's "team" categories plus a
       name scan of the headline/description),
     - which players it's about (from ESPN's "athlete" categories), and
     - a "kind": injury · offfield · celebration · preview · news,
       so the app can group/filter (injuries, off-the-field issues,
       celebrations, upcoming matches).

   Writes:
     - data/news-data.json  (machine-readable snapshot)
     - news-data.js         (browser-loadable: sets window.WC_NEWS)

   Like fetch-live-data.js, it only rewrites the files when the set of
   articles actually changes, so a scheduled run doesn't churn a commit
   just because the timestamp moved.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const WC = require("../data.js");

const TEAM_NEWS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=50";
const athleteNewsUrl = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/all/news?athlete=${id}&limit=8`;

const KEEP = 48; // most recent N articles we surface
const MAX_ATHLETES = 14; // cap per-player fetches so the Action stays quick
const UA = "wc2026-predictor/news (+github actions)";

/* ------------------------------------------------------------------ */
/* Team matching                                                       */
/* ------------------------------------------------------------------ */

/* Our display names, from data.js. */
const TEAMS = Object.values(WC.groups).flat().map(([name]) => name);

/* Extra spellings ESPN (or a writer) might use, mapped to our name.
   Auto-aliases (the display name itself, lower-cased) are added below. */
const ALIASES = {
  "USA": ["united states", "usmnt", "u.s.", "u.s.a"],
  "IR Iran": ["iran"],
  "Korea Republic": ["south korea", "korea"],
  "Czechia": ["czech republic"],
  "Côte d'Ivoire": ["ivory coast", "cote d'ivoire"],
  "Cabo Verde": ["cape verde"],
  "Bosnia": ["bosnia and herzegovina", "bosnia & herzegovina"],
  "DR Congo": ["dr congo", "democratic republic of congo", "congo dr"],
};

/* Build display-name -> [regex, ...] so we can scan free text safely
   (word boundaries avoid matching "Iran" inside "Tirana", etc.). */
const TEAM_MATCHERS = TEAMS.map((name) => {
  const terms = new Set([name.toLowerCase(), ...(ALIASES[name] || [])]);
  const res = [...terms].map((t) => {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, "i");
  });
  return { name, res };
});

function matchTeamCat(desc) {
  const cl = desc.toLowerCase();
  const hit = TEAM_MATCHERS.find(
    (m) => m.name.toLowerCase() === cl || (ALIASES[m.name] || []).includes(cl)
  );
  return hit ? hit.name : null;
}

function teamsIn(text, espnTeamCats, hintTeam) {
  const hay = " " + (text || "").toLowerCase() + " ";
  const found = new Set();
  if (hintTeam) found.add(hintTeam);

  // 1) ESPN's own "team" category descriptions.
  for (const c of espnTeamCats) {
    const m = matchTeamCat(c);
    if (m) found.add(m);
  }

  // 2) Name scan of the headline + description.
  for (const m of TEAM_MATCHERS) {
    if (found.has(m.name)) continue;
    if (m.res.some((re) => re.test(hay))) found.add(m.name);
  }

  return [...found];
}

/* ------------------------------------------------------------------ */
/* Kind classification                                                 */
/* ------------------------------------------------------------------ */

/* Order matters — first match wins. */
const KINDS = [
  {
    kind: "injury",
    label: "Injury",
    re: /\b(injur(y|ed|ies)|ruled out|out (for|of)|sidelined|fitness|doubt(ful)?|knock|hamstring|groin|ankle|calf|thigh|strain|surgery|setback|recover(y|ing))\b/i,
  },
  {
    kind: "offfield",
    label: "Off the field",
    re: /\b(suspend(ed|sion)?|ban(ned|s)?|red card|sent off|arrest(ed)?|charged|investigat(ion|ed)|controvers(y|ial)|fined?|misconduct|racism|racist|protest|dispute|row|sacked|resign(ed|s)?|transfer|signs?|signing|loan|deal|contract|move to|join(s|ed)?)\b/i,
  },
  {
    kind: "preview",
    label: "Match preview",
    re: /\b(preview|prediction|how to watch|team news|line ?ups?|probable|kick ?off|what time|head[- ]to[- ]head|build[- ]up|ahead of|face|clash|take on|square off|round of 32|knockout|last 16)\b/i,
  },
  {
    kind: "celebration",
    label: "Celebration",
    re: /\b(celebrat(e|ion|ions)|party|dance|wild scenes|go(es)? wild|viral|fans? (erupt|celebrate|go|party)|emotional|tears of joy|fairytale|history|record[- ]break)\b/i,
  },
];

function kindOf(text) {
  for (const k of KINDS) if (k.re.test(text)) return k;
  return { kind: "news", label: "News" };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

function pickImage(a) {
  const img = (a.images || []).find((i) => i && i.url);
  return img ? img.url : null;
}

function athletesOf(a) {
  return (a.categories || [])
    .filter((c) => c.type === "athlete" && c.description)
    .map((c) => ({ id: c.athleteId || (c.athlete && c.athlete.id) || null, name: c.description }));
}

/* Turn one ESPN article into our card shape, or null to skip it.
   `hint` = { team, player } when the article came from a player feed. */
function toItem(a, hint) {
  if (!a || !a.headline) return null;
  const href = a.links && a.links.web && a.links.web.href;
  if (!href) return null;

  const teamCats = (a.categories || [])
    .filter((c) => c.type === "team" && c.description)
    .map((c) => c.description);

  const athletes = athletesOf(a);
  const players = new Set(athletes.map((p) => p.name));
  if (hint && hint.player) players.add(hint.player);

  const text = `${a.headline} ${a.description || ""}`;
  const { kind, label } = kindOf(text);

  return {
    id: String(a.id || href),
    headline: a.headline.trim(),
    description: (a.description || "").trim(),
    published: a.published || a.lastModified || null,
    url: href,
    image: pickImage(a),
    byline: (a.byline || "").trim() || null,
    kind,
    kindLabel: label,
    teams: teamsIn(text, teamCats, hint && hint.team),
    players: [...players],
  };
}

/* Importance score — drives the "top stories" the app highlights.
   Blends recency, ESPN's editorial order (lead stories first), the kind
   of story, and how richly it's tagged. */
const KIND_WEIGHT = { injury: 14, offfield: 12, preview: 9, celebration: 7, news: 0 };
function scoreItem(a) {
  const hrs = a.published ? (Date.now() - Date.parse(a.published)) / 3.6e6 : 72;
  let s = Math.max(0, 120 - hrs * 1.5); // recency, decays over ~3 days
  if (a.editorialRank != null && a.editorialRank < 8) s += (8 - a.editorialRank) * 10;
  s += KIND_WEIGHT[a.kind] || 0;
  if (a.image) s += 6;
  if ((a.teams || []).length) s += 4;
  if ((a.players || []).length) s += 3;
  return Math.round(s);
}

/* Signature used to decide whether anything actually changed. */
function signature(items) {
  return JSON.stringify(
    items.map((a) => [a.id, a.headline, a.kind, (a.teams || []).join(","), (a.players || []).join(",")])
  );
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`);
  return res.json();
}

async function main() {
  /* 1) Team & match stories from the World Cup feed. */
  const teamFeed = await fetchJson(TEAM_NEWS_URL);
  const byId = new Map();
  const add = (item) => {
    if (item && !byId.has(item.id)) byId.set(item.id, item);
  };

  /* While walking the team feed, learn which players appear and which
     WC team each one is tied to (the team tagged on the same article). */
  const playerHint = new Map(); // athleteId -> { id, name, team }
  (teamFeed.articles || []).forEach((a, idx) => {
    const item = toItem(a, null);
    if (item) item.editorialRank = idx; // ESPN's lead-story ordering
    add(item);
    if (!item) return;
    const team = item.teams[0] || null;
    for (const p of athletesOf(a)) {
      if (!p.id) continue;
      const prev = playerHint.get(p.id);
      if (!prev) playerHint.set(p.id, { id: p.id, name: p.name, team });
      else if (!prev.team && team) prev.team = team;
    }
  });

  /* 2) Per-player feeds for the most-mentioned WC players — this is
        where ESPN files individual injury / transfer / off-field news. */
  const ranked = [...playerHint.values()]
    .filter((p) => p.team) // only players we can tie to a WC team
    .slice(0, MAX_ATHLETES);

  const playerResults = await Promise.allSettled(
    ranked.map((p) => fetchJson(athleteNewsUrl(p.id)))
  );
  playerResults.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const p = ranked[i];
    for (const a of r.value.articles || []) {
      add(toItem(a, { team: p.team, player: p.name }));
    }
  });

  /* 3) Score, rank by importance, cap. The app highlights the top few
        and lets you sort by "newest" client-side via `published`. */
  const items = [...byId.values()]
    .map((a) => ({ ...a, score: scoreItem(a) }))
    .sort((x, y) => y.score - x.score || String(y.published).localeCompare(String(x.published)))
    .slice(0, KEEP)
    .map(({ editorialRank, ...rest }) => rest); // internal-only, drop from output

  if (!items.length) {
    console.log("No articles returned — leaving existing news untouched.");
    return;
  }

  const root = path.join(__dirname, "..");
  const jsonPath = path.join(root, "data", "news-data.json");

  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (e) {
    /* no previous snapshot */
  }
  if (prev && signature(prev.items || []) === signature(items)) {
    console.log(`No change (${items.length} articles) — nothing to write.`);
    return;
  }

  const counts = items.reduce((m, a) => ((m[a.kind] = (m[a.kind] || 0) + 1), m), {});
  const out = {
    source: "ESPN FIFA World Cup + per-player news feeds",
    updated: new Date().toISOString(),
    counts,
    items,
  };

  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(root, "news-data.js"),
    "/* generated from ESPN news feeds — refreshed by the Update live data Action */\n" +
      "window.WC_NEWS = " + JSON.stringify(out) + ";\n"
  );
  console.log(
    `Wrote ${items.length} articles from ${ranked.length} player feeds (` +
      Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" ") +
      ") — files updated."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
