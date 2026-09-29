// Darb service worker: caches the app shell and saved trips so a plan opens with no signal.
// Bump SHELL whenever shipped assets change (firebase.json serves this file no-cache).
const SHELL = "darb-shell-v1";
const TRIPS = "darb-trips";

const SHELL_URLS = [
  "/", "/index.html", "/plan.html", "/check.html", "/fixed.html", "/trip.html", "/leg.html",
  "/build.html", "/destinations.html",
  "/css/tokens.css", "/css/app.css",
  "/css/pages/plan.css", "/css/pages/check.css", "/css/pages/fixed.css", "/css/pages/leg.css",
  "/css/pages/build.css", "/css/pages/destinations.css",
  // every /js/** file at commit time
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
  "/js/pages/admin.js",
  "/js/pages/build.js",
  "/js/pages/check.js",
  "/js/pages/dashboard.js",
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
  "/js/ui/toast.js",
  "/js/weather.js",
  /* JS-LIST-END */
  "/data/places.json", "/data/legs.json", "/data/jordan-pass.json",
  "/favicon.svg"
];

/** Add URLs one by one so a single missing file never fails the whole install. */
async function addAll(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(urls.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(addAll(SHELL, SHELL_URLS).then(() => self.skipWaiting()));
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
    event.waitUntil(addAll(TRIPS, [`/t/${d.id}`, "/trip.html"]));
  }
});

const TRIP_PATH = /^\/t\/[A-Za-z0-9]{1,40}\/?$/;

/** Cache fallback for a navigation: exact URL, then the same path ignoring ?query, then "<path>.html" (cleanUrls), then trip.html for /t/<id>. */
async function navFallback(req) {
  const url = new URL(req.url);
  const hit = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
  if (hit) return hit;
  if (TRIP_PATH.test(url.pathname)) {
    const t = await caches.match("/trip.html");
    if (t) return t;
  }
  if (!/\.[a-z0-9]+$/i.test(url.pathname) && url.pathname !== "/") {
    const clean = await caches.match(url.pathname.replace(/\/$/, "") + ".html");
    if (clean) return clean;
  }
  return (await caches.match("/index.html")) || Response.error();
}

async function networkFirst(req, isNav) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (e) {
    if (isNav) return navFallback(req);
    const hit = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Same-origin only: gstatic (Firebase SDK), googleapis (Firestore) and open-meteo are never intercepted.
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === "navigate";
  if (isNav || /\.(js|css|json|svg)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(req, isNav));
  }
});
