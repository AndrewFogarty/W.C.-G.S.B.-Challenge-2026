/* =====================================================================
   fetch-live-data.js — runs in GitHub Actions (Node 20) to refresh
   actual match results from openfootball/worldcup.json (no API key).

   Writes:
     - data/live-data.json  (machine-readable snapshot)
     - live-data.js         (browser-loadable: sets window.WC_LIVE)

   Group results are mapped into our group/fixture layout (the same
   ordering app.js uses), so the app's "Load actual results" button can
   apply them directly.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const WC = require("../data.js");

const SRC_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/* openfootball team name -> our display name, where they differ. */
const NAME_MAP = {
  "Bosnia & Herzegovina": "Bosnia",
  "Cape Verde": "Cabo Verde",
  "Czech Republic": "Czechia",
  "Iran": "IR Iran",
  "Ivory Coast": "Côte d'Ivoire",
  "South Korea": "Korea Republic",
};

/* Must match FIXTURES in app.js. */
const FIX = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

function build(src) {
  const groups = {};
  const idx = {};
  const results = {};
  for (const g of Object.keys(WC.groups)) {
    groups[g] = WC.groups[g].map((t) => t[0]);
    idx[g] = {};
    groups[g].forEach((n, i) => (idx[g][n] = i));
    results[g] = [null, null, null, null, null, null];
  }
  let filled = 0;
  for (const m of src.matches || []) {
    const grp = String(m.group || "");
    if (!grp.startsWith("Group")) continue;
    const g = grp.split(" ").pop();
    if (!groups[g]) continue;
    const t1 = NAME_MAP[m.team1] || m.team1;
    const t2 = NAME_MAP[m.team2] || m.team2;
    if (!(t1 in idx[g]) || !(t2 in idx[g])) {
      console.warn("unmapped team:", g, m.team1, "/", m.team2);
      continue;
    }
    const ft = m.score && m.score.ft;
    if (!ft) continue;
    const i1 = idx[g][t1];
    const i2 = idx[g][t2];
    const fi = FIX.findIndex(
      (p) => (p[0] === i1 && p[1] === i2) || (p[0] === i2 && p[1] === i1)
    );
    results[g][fi] =
      FIX[fi][0] === i1 && FIX[fi][1] === i2 ? [ft[0], ft[1]] : [ft[1], ft[0]];
    filled++;
  }
  return { results, filled };
}

async function main() {
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const src = await res.json();
  const { results, filled } = build(src);

  const root = path.join(__dirname, "..");
  const jsonPath = path.join(root, "data", "live-data.json");

  // Only rewrite when the results actually change, so the timestamp alone
  // doesn't produce a commit on every scheduled run.
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (e) {
    /* no previous snapshot */
  }
  if (prev && JSON.stringify(prev.results) === JSON.stringify(results)) {
    console.log(`No change (${filled} group results) — nothing to write.`);
    return;
  }

  const out = {
    source: "openfootball/worldcup.json (2026)",
    updated: new Date().toISOString(),
    results,
  };
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(root, "live-data.js"),
    "/* generated from openfootball/worldcup.json — refreshed by the Update live data Action */\n" +
      "window.WC_LIVE = " + JSON.stringify(out) + ";\n"
  );
  console.log(`Filled ${filled} group results from openfootball (files updated).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
