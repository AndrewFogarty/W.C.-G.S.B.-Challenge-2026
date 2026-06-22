/* Service worker — offline support + fast loads.
   Strategy:
   - HTML/CSS/JS/live data: network-first (always fresh online, cached offline)
   - images/fonts: cache-first (rarely change)
   Bump CACHE on meaningful releases to evict old caches.                     */
const CACHE = "gsb-v19";
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./lib/engine.js",
  "./weather.js",
  "./app.js",
  "./supabase-config.js",
  "./live-data.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return /\.(png|jpg|jpeg|svg|webp|gif|woff2?|ttf)$/i.test(url.pathname) || url.host.includes("flagcdn.com");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Don't touch Supabase or weather API calls — always go to network.
  if (url.host.includes("supabase.co") || url.host.includes("open-meteo.com")) return;

  if (isAsset(url)) {
    // cache-first for static assets
    e.respondWith(
      caches.match(req).then((hit) => hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => hit))
    );
    return;
  }

  // network-first for app shell + live data
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
