// Darb service worker: caches the app shell, the Firebase SDK and saved trips so a plan opens with no signal.
// Bump SHELL whenever shipped assets change (firebase.json serves this file no-cache).
const SHELL = "darb-shell-v4";
const TRIPS = "darb-trips";
const VENDOR = "darb-vendor-v1";
const NET_TIMEOUT_MS = 4000;

// firebase.json has cleanUrls: Hosting 301-redirects "/x.html" → "/x", so pages are cached by their extensionless path.
const PAGES = ["/", "/plan", "/check", "/fixed", "/trip", "/leg", "/build", "/destinations", "/dashboard", "/admin"];

const SHELL_URLS = [
  ...PAGES,
  "/css/tokens.css", "/css/app.css",
  "/css/pages/plan.css", "/css/pages/check.css", "/css/pages/fixed.css", "/css/pages/leg.css",
  "/css/pages/build.css", "/css/pages/destinations.css",
  // every /js/** file the traveller pages use (admin / dashboard page code left out; test-cases.js stays:
  // landing and plan import REFERENCE_TEXT from it). Regenerate with: find public/js -name '*.js'
  /* JS-LIST-START */
  "/js/data.js",
  "/js/engine/builder.js",
  "/js/engine/fixer.js",
  "/js/engine/format.js",
  "/js/engine/geo.js",
  "/js/engine/model.js",
  "/js/engine/parser.js",
  "/js/engine/pass.js",
  "/js/engine/rules.js",
  "/js/firebase-init.js",
  "/js/ics.js",
  "/js/map.js",
  "/js/pages/build.js",
  "/js/pages/check.js",
  "/js/pages/destinations.js",
  "/js/pages/fixed.js",
  "/js/pages/landing.js",
  "/js/pages/leg.js",
  "/js/pages/plan.js",
  "/js/pages/trip.js",
  "/js/render/fixed-plan.js",
  "/js/share.js",
  "/js/store.js",
  "/js/test-cases.js",
  "/js/ui/day-card.js",
  "/js/ui/dom.js",
  "/js/ui/icons.js",
  "/js/ui/modal.js",
  "/js/ui/nav.js",
  "/js/ui/pills.js",
  "/js/ui/stepper.js",
  "/js/ui/sticky-cta.js",
  "/js/ui/toast.js",
  "/js/weather.js",
  /* JS-LIST-END */
  "/data/places.json", "/data/legs.json", "/data/jordan-pass.json",
  "/favicon.svg"
];

// Versioned, immutable Firebase SDK modules (firebase-firestore / -auth import firebase-app).
const SDK_PREFIX = "https://www.gstatic.com/firebasejs/11.0.2/";
const SDK_URLS = ["firebase-app.js", "firebase-firestore.js", "firebase-auth.js"].map((f) => SDK_PREFIX + f);

/** A redirected response can't be served to a navigation — re-wrap it as a plain response before caching. */
async function storable(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Fetch and cache each URL on its own, so a single missing file never fails the whole install. */
async function addAll(cacheName, urls, init) {
  const cache = await caches.open(cacheName);
  await Promise.all(urls.map(async (u) => {
    try {
      const res = await fetch(u, init || { cache: "reload" });
      if (res.ok) await cache.put(u, await storable(res));
    } catch { /* offline or missing — skip */ }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    addAll(SHELL, SHELL_URLS),
    addAll(VENDOR, SDK_URLS, { mode: "cors", credentials: "omit" })
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("darb-shell-") && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "cache-trip" && typeof d.id === "string" && /^[A-Za-z0-9]{1,40}$/.test(d.id)) {
    event.waitUntil(addAll(TRIPS, [`/t/${d.id}`, "/trip"]));
  }
});

const TRIP_PATH = /^\/t\/[A-Za-z0-9]{1,40}\/?$/;

/** Cache key for a page: its pathname without ?query and without ".html" ("/index.html" → "/"). */
function pageKey(pathname) {
  if (pathname === "/index.html" || pathname === "/index") return "/";
  return pathname.replace(/\.html$/, "").replace(/(.)\/$/, "$1");
}

/** Cached copy of a page: its own key, then (for /t/<id>) the trip page shell. Both key styles are tried. */
async function cachedPage(url) {
  const key = pageKey(url.pathname);
  const candidates = [key, key === "/" ? "/index.html" : key + ".html"];
  if (TRIP_PATH.test(url.pathname)) candidates.push("/trip", "/trip.html");
  for (const c of candidates) {
    const hit = await caches.match(c);
    if (hit) return hit;
  }
  return null;
}

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

/**
 * Network-first with a 4 s timeout: a successful response refreshes the cache (pages by pathname only,
 * so ?t=<id> URLs don't pile up); on failure or timeout the cached copy is served.
 */
function networkFirst(event, isNav) {
  const req = event.request;
  const url = new URL(req.url);
  const key = isNav ? pageKey(url.pathname) : req;
  const fromCache = () => (isNav ? cachedPage(url) : caches.match(req));

  const net = fetch(req).then((res) => {
    if (res.ok && (res.type === "basic" || res.type === "default")) {
      const copy = res.clone();
      event.waitUntil(storable(copy).then((r) => caches.open(SHELL).then((c) => c.put(key, r))).catch(() => {}));
    }
    return res;
  });

  return (async () => {
    const first = await Promise.race([net.catch(() => null), timeout(NET_TIMEOUT_MS)]);
    if (first) return first;
    const hit = await fromCache();
    if (hit) return hit;
    try {
      return await net; // no cached copy: keep waiting for the network
    } catch {
      if (isNav) return (await caches.match("/")) || (await caches.match("/index.html")) || Response.error();
      return Response.error();
    }
  })();
}

/** Cache-first for the immutable Firebase SDK. */
async function vendor(event) {
  const req = event.request;
  const hit = await caches.match(req.url, { cacheName: VENDOR });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    event.waitUntil(caches.open(VENDOR).then((c) => c.put(req.url, copy)).catch(() => {}));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.url.startsWith(SDK_PREFIX)) {
    event.respondWith(vendor(event));
    return;
  }
  // Other cross-origin requests (Firestore on googleapis, open-meteo, fonts) are never intercepted.
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === "navigate";
  if (isNav || /\.(js|css|json|svg)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(event, isNav));
  }
});
