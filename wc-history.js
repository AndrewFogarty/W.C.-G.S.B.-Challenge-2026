/* =====================================================================
   wc-history.js — All-time FIFA World Cup leaderboards (1930–2022) plus a
   live "this tournament" board.

   Goals and goalkeeper clean sheets are well-documented. Assists,
   goals+assists, World Cup wins, yellow and red cards are sparsely or
   inconsistently recorded historically, so those panels use best-available
   figures and are flagged `approx: true` (the UI labels them with ≈).

   Players still active at the 2026 World Cup carry an `id` (API-Football
   player id). app.js adds their live 2026 goals/assists on top of the
   historical base and re-sorts, so the boards update as the tournament runs.

   The `tournament_ga` panel is computed entirely live from window.WC_FOOTBALL.

   `code` is an ISO 3166-1 alpha-2 flag code (or "ENG"), resolved by flagHtml().
   ===================================================================== */
window.WC_HISTORY = {
  era: "1930–2022",
  note:
    "All-time FIFA World Cup records — historical base (1930–2022) plus live 2026 goals/assists. " +
    "Goals & clean sheets are official; assists, goals + assists, wins and cards are best-available (≈).",
  panels: [
    {
      key: "goals", title: "Goals", icon: "⚽",
      rows: [
        { name: "Miroslav Klose", code: "DE", value: 16 },
        { name: "Ronaldo", code: "BR", value: 15 },
        { name: "Gerd Müller", code: "DE", value: 14 },
        { name: "Just Fontaine", code: "FR", value: 13 },
        { name: "Lionel Messi", code: "AR", value: 13, id: 154 },
        { name: "Pelé", code: "BR", value: 12 },
        { name: "Kylian Mbappé", code: "FR", value: 12, id: 278 },
        { name: "Sándor Kocsis", code: "HU", value: 11 },
        { name: "Jürgen Klinsmann", code: "DE", value: 11 },
        { name: "Gabriel Batistuta", code: "AR", value: 10 },
      ],
    },
    {
      key: "assists", title: "Assists", icon: "🅰", approx: true,
      rows: [
        { name: "Pelé", code: "BR", value: 10 },
        { name: "Diego Maradona", code: "AR", value: 8 },
        { name: "Lionel Messi", code: "AR", value: 8, id: 154 },
        { name: "Grzegorz Lato", code: "PL", value: 8 },
        { name: "Pierre Littbarski", code: "DE", value: 7 },
        { name: "Thomas Müller", code: "DE", value: 6 },
        { name: "Bastian Schweinsteiger", code: "DE", value: 6 },
        { name: "Neymar", code: "BR", value: 6, id: 276 },
        { name: "Cesc Fàbregas", code: "ES", value: 5 },
        { name: "Diego Forlán", code: "UY", value: 5 },
      ],
    },
    {
      key: "ga", title: "Goals + Assists", icon: "✨", approx: true,
      rows: [
        { name: "Pelé", code: "BR", g: 12, a: 10 },
        { name: "Lionel Messi", code: "AR", g: 13, a: 8, id: 154 },
        { name: "Ronaldo", code: "BR", g: 15, a: 4 },
        { name: "Miroslav Klose", code: "DE", g: 16, a: 3 },
        { name: "Grzegorz Lato", code: "PL", g: 10, a: 8 },
        { name: "Kylian Mbappé", code: "FR", g: 12, a: 6, id: 278 },
        { name: "Diego Maradona", code: "AR", g: 8, a: 8 },
        { name: "Thomas Müller", code: "DE", g: 10, a: 6 },
        { name: "Gerd Müller", code: "DE", g: 14, a: 1 },
        { name: "Just Fontaine", code: "FR", g: 13, a: 1 },
        { name: "Neymar", code: "BR", g: 8, a: 6, id: 276 },
      ],
    },
    {
      key: "cleansheets", title: "Clean Sheets", icon: "🧤", approx: true,
      rows: [
        { name: "Peter Shilton", code: "ENG", value: 10 },
        { name: "Fabien Barthez", code: "FR", value: 10 },
        { name: "Sepp Maier", code: "DE", value: 7 },
        { name: "Gianluigi Buffon", code: "IT", value: 7 },
        { name: "Iker Casillas", code: "ES", value: 6 },
        { name: "Hugo Lloris", code: "FR", value: 6 },
        { name: "Cláudio Taffarel", code: "BR", value: 6 },
        { name: "Gordon Banks", code: "ENG", value: 6 },
        { name: "Dino Zoff", code: "IT", value: 5 },
        { name: "Emiliano Martínez", code: "AR", value: 5 },
      ],
    },
    {
      key: "wcwins", title: "Match Wins", icon: "🥇", approx: true,
      note: "Most World Cup matches won (career).",
      rows: [
        { name: "Miroslav Klose", code: "DE", value: 17 },
        { name: "Cafú", code: "BR", value: 16 },
        { name: "Philipp Lahm", code: "DE", value: 14 },
        { name: "Bastian Schweinsteiger", code: "DE", value: 13 },
        { name: "Thomas Müller", code: "DE", value: 13 },
        { name: "Lúcio", code: "BR", value: 13 },
        { name: "Lothar Matthäus", code: "DE", value: 13 },
        { name: "Lionel Messi", code: "AR", value: 12 },
        { name: "Paolo Maldini", code: "IT", value: 12 },
        { name: "Diego Maradona", code: "AR", value: 11 },
      ],
    },
    {
      key: "titles", title: "World Cups Won", icon: "🏆",
      note: "Most World Cup titles won as a player (Pelé is the only 3-time winner; only Brazil & Italy have multiple 2-time winners).",
      rows: [
        { name: "Pelé", code: "BR", value: 3 },
        { name: "Cafú", code: "BR", value: 2 },
        { name: "Giuseppe Meazza", code: "IT", value: 2 },
        { name: "Giovanni Ferrari", code: "IT", value: 2 },
        { name: "Eraldo Monzeglio", code: "IT", value: 2 },
        { name: "Garrincha", code: "BR", value: 2 },
        { name: "Didi", code: "BR", value: 2 },
        { name: "Djalma Santos", code: "BR", value: 2 },
        { name: "Nílton Santos", code: "BR", value: 2 },
        { name: "Vavá", code: "BR", value: 2 },
      ],
    },
    {
      // Active players only, scored by a stage-weighted sum of their career
      // World Cup knockout wins plus a title bonus. app.js computes `value`
      // from the per-round win counts below (t=titles, f/sf/qf/r16 = wins won
      // at Final/Semi/Quarter/Round-of-16; shoot-out advances count as wins)
      // and sorts descending. Best-available historical figures → flagged ≈.
      key: "active_wins", title: "Active Players — Weighted WC Wins", icon: "🔥", approx: true,
      note: "Active players only. Stage-weighted: title +6, Final win 8, Semi 5, Quarter 3, R16 2.",
      rows: [
        { name: "Lionel Messi", code: "AR", t: 1, f: 1, sf: 2, qf: 2, r16: 2, sub: "🏆 2022 · runner-up 2014" },
        { name: "Kylian Mbappé", code: "FR", t: 1, f: 1, sf: 2, qf: 2, r16: 2, sub: "🏆 2018 · runner-up 2022" },
        { name: "Nicolás Otamendi", code: "AR", t: 1, f: 1, sf: 2, qf: 2, r16: 2, sub: "🏆 2022 · runner-up 2014" },
        { name: "Benjamin Pavard", code: "FR", t: 1, f: 1, sf: 2, qf: 2, r16: 2, sub: "🏆 2018 · runner-up 2022" },
        { name: "Lautaro Martínez", code: "AR", t: 1, f: 1, sf: 1, qf: 1, r16: 1, sub: "🏆 2022" },
        { name: "Julián Álvarez", code: "AR", t: 1, f: 1, sf: 1, qf: 1, r16: 1, sub: "🏆 2022" },
        { name: "Emiliano Martínez", code: "AR", t: 1, f: 1, sf: 1, qf: 1, r16: 1, sub: "🏆 2022 · Golden Glove" },
        { name: "Enzo Fernández", code: "AR", t: 1, f: 1, sf: 1, qf: 1, r16: 1, sub: "🏆 2022" },
        { name: "Luka Modrić", code: "HR", t: 0, f: 0, sf: 1, qf: 2, r16: 2, sub: "Runner-up 2018 · 3rd 2022" },
        { name: "Aurélien Tchouaméni", code: "FR", t: 0, f: 0, sf: 1, qf: 1, r16: 1, sub: "Runner-up 2022" },
        { name: "Jules Koundé", code: "FR", t: 0, f: 0, sf: 1, qf: 1, r16: 1, sub: "Runner-up 2022" },
        { name: "Neymar", code: "BR", t: 0, f: 0, sf: 0, qf: 0, r16: 3, sub: "R16 — 2014 · 2018 · 2022" },
        { name: "Casemiro", code: "BR", t: 0, f: 0, sf: 0, qf: 0, r16: 2, sub: "R16 — 2018 · 2022" },
        { name: "Bruno Fernandes", code: "PT", t: 0, f: 0, sf: 0, qf: 0, r16: 1, sub: "R16 — 2022" },
      ],
    },
    {
      key: "yellowcards", title: "Yellow Cards", icon: "🟨", approx: true,
      rows: [
        { name: "Javier Mascherano", code: "AR", value: 7 },
        { name: "Cafú", code: "BR", value: 6 },
        { name: "Lothar Matthäus", code: "DE", value: 6 },
        { name: "Thomas Müller", code: "DE", value: 6 },
        { name: "Philipp Lahm", code: "DE", value: 5 },
        { name: "Paolo Maldini", code: "IT", value: 5 },
        { name: "Bastian Schweinsteiger", code: "DE", value: 5 },
        { name: "Carles Puyol", code: "ES", value: 5 },
        { name: "Sergio Ramos", code: "ES", value: 5 },
        { name: "Lionel Messi", code: "AR", value: 5 },
      ],
    },
    {
      // Computed live from window.WC_FOOTBALL by app.js (top goals + assists
      // in the current tournament). Rows left empty on purpose.
      key: "tournament_ga", title: "Goals + Assists", icon: "🔥", live: true, rows: [],
    },
  ],
};
