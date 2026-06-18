/* =====================================================================
   wc-history.js — All-time FIFA World Cup leaderboards (1930–2022).

   Goals and goalkeeper clean sheets are well-documented. Assists,
   goals+assists, and red cards are sparsely/inconsistently recorded
   across World Cup history, so those panels use the best-available
   figures and are flagged `approx: true` (the UI labels them).

   `code` is an ISO 3166-1 alpha-2 flag code (or "ENG" for England),
   resolved by flagHtml() in app.js. Edit here to keep it current.
   ===================================================================== */
window.WC_HISTORY = {
  era: "1930–2022",
  note:
    "All-time FIFA World Cup records (1930–2022). Goals & clean sheets are official FIFA records; " +
    "assists, goals + assists, yellow cards and red cards use best-available historical data and are approximate (≈).",
  panels: [
    {
      key: "goals", title: "Goals", icon: "⚽",
      rows: [
        { name: "Miroslav Klose", code: "DE", value: 16 },
        { name: "Ronaldo", code: "BR", value: 15 },
        { name: "Gerd Müller", code: "DE", value: 14 },
        { name: "Just Fontaine", code: "FR", value: 13 },
        { name: "Lionel Messi", code: "AR", value: 13 },
        { name: "Pelé", code: "BR", value: 12 },
        { name: "Kylian Mbappé", code: "FR", value: 12 },
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
        { name: "Lionel Messi", code: "AR", value: 8 },
        { name: "Grzegorz Lato", code: "PL", value: 8 },
        { name: "Pierre Littbarski", code: "DE", value: 7 },
        { name: "Thomas Müller", code: "DE", value: 6 },
        { name: "Bastian Schweinsteiger", code: "DE", value: 6 },
        { name: "Neymar", code: "BR", value: 6 },
        { name: "Cesc Fàbregas", code: "ES", value: 5 },
        { name: "Diego Forlán", code: "UY", value: 5 },
      ],
    },
    {
      key: "ga", title: "Goals + Assists", icon: "✨", approx: true,
      rows: [
        { name: "Pelé", code: "BR", value: 22, sub: "12 G · 10 A" },
        { name: "Lionel Messi", code: "AR", value: 21, sub: "13 G · 8 A" },
        { name: "Ronaldo", code: "BR", value: 19, sub: "15 G · 4 A" },
        { name: "Miroslav Klose", code: "DE", value: 19, sub: "16 G · 3 A" },
        { name: "Grzegorz Lato", code: "PL", value: 18, sub: "10 G · 8 A" },
        { name: "Kylian Mbappé", code: "FR", value: 18, sub: "12 G · 6 A" },
        { name: "Diego Maradona", code: "AR", value: 16, sub: "8 G · 8 A" },
        { name: "Thomas Müller", code: "DE", value: 16, sub: "10 G · 6 A" },
        { name: "Gerd Müller", code: "DE", value: 15, sub: "14 G · 1 A" },
        { name: "Just Fontaine", code: "FR", value: 14, sub: "13 G · 1 A" },
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
      key: "redcards", title: "Red Cards", icon: "🟥", approx: true,
      note: "Only Zidane & Song have 2; the rest are among the most memorable single dismissals.",
      rows: [
        { name: "Rigobert Song", code: "CM", value: 2 },
        { name: "Zinedine Zidane", code: "FR", value: 2 },
        { name: "Wayne Rooney", code: "ENG", value: 1 },
        { name: "David Beckham", code: "ENG", value: 1 },
        { name: "Luis Suárez", code: "UY", value: 1 },
        { name: "Frank Rijkaard", code: "NL", value: 1 },
        { name: "Pepe", code: "PT", value: 1 },
        { name: "Kaká", code: "BR", value: 1 },
        { name: "Felipe Melo", code: "BR", value: 1 },
        { name: "John Heitinga", code: "NL", value: 1 },
      ],
    },
  ],
};
