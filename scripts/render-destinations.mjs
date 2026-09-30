// Dev-only: pre-renders public/destinations.html (index) and public/d/<id>.html (one guide per place)
// from public/data/*.json, real HTML + JSON-LD for SEO/GEO, no build step at deploy (commit the output).
// Usage: node scripts/render-destinations.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fmtCost, fmtDuration } from "../public/js/engine/format.js";
import { haversine } from "../public/js/engine/geo.js";
import { JORDAN_OUTLINE } from "../public/js/map.js";
import { icon, modeIcon, placeIcon } from "../public/js/ui/icons.js";
import { esc } from "../public/js/ui/dom.js";
import { STALE_DAYS, daysSince } from "../public/js/engine/model.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const placesJson = JSON.parse(readFileSync(join(root, "data/places.json"), "utf8"));
const legs = JSON.parse(readFileSync(join(root, "data/legs.json"), "utf8")).legs;
const places = placesJson.places;
const TODAY = new Date();
// Same rule as the app (model.js freshen): a verified value with no verifiedOn, or older than STALE_DAYS, is est.
const freshen = (o) => o && o.status === "verified" && daysSince(o.verifiedOn, TODAY) > STALE_DAYS ? { ...o, status: "est", stale: true } : o;
// Newest verifiedOn per place (ticket + its legs' options), from the raw data, for sitemap lastmod.
const newestVerified = (id) => {
  const ds = [places.find((p) => p.id === id)?.ticket, ...legs.filter((l) => l.from === id || l.to === id).flatMap((l) => l.options)]
    .filter((o) => o && o.status === "verified" && o.verifiedOn).map((o) => String(o.verifiedOn).slice(0, 10));
  return ds.sort().pop() || null;
};
const lastmods = Object.fromEntries(places.map((p) => [p.id, newestVerified(p.id)]));
for (const p of places) if (p.ticket) p.ticket = freshen(p.ticket);
for (const l of legs) l.options = l.options.map(freshen);
const SITE = "https://darb-pixelsdev.web.app";

const byId = Object.fromEntries([...places, ...(placesJson.airports || [])].map((p) => [p.id, p]));
const airportIds = new Set((placesJson.airports || []).map((a) => a.id));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fullDate = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const https = (u) => /^https:\/\//.test(u || "");
/** "King Hussein, Aqaba (AQJ)" → "King Hussein Airport (AQJ)". */
const nameOf = (id) => airportIds.has(id)
  ? `${byId[id].name.split(",")[0].replace(/\s*\(.*\)$/, "")} Airport (${id})`
  : byId[id]?.name.replace(/\s*\(.*\)$/, "") ?? id;
const pageUrl = (id) => `/d/${id}.html`;

/* ---------- destination photos (public/img/places/<id>.webp, 1200 px wide) ---------- */
// Intrinsic size of each photo, for width/height (no layout shift) and og:image dimensions.
const PHOTO_SIZE = {
  amman: [1200, 801], jerash: [1200, 801], ajloun: [1200, 696], "umm-qais": [1200, 900], "as-salt": [1200, 801],
  "dead-sea": [1200, 900], madaba: [1200, 900], petra: [1200, 676], "wadi-rum": [1200, 900], aqaba: [1200, 674],
  dana: [1200, 900], kerak: [1200, 1101]
};
// Per-place crop focus where the centre of a cover crop would cut the subject.
const PHOTO_POS = { "umm-qais": "50% 70%", dana: "50% 65%" };
const photoPath = (id) => `/img/places/${id}.webp`;
const photoImg = (p, cls, attrs) => {
  const [w, h] = PHOTO_SIZE[p.id] || [1200, 800];
  const pos = PHOTO_POS[p.id] ? ` style="object-position: ${PHOTO_POS[p.id]}"` : "";
  return `<img class="${cls}" src="${photoPath(p.id)}" alt="${esc(nameOf(p.id))}, Jordan" width="${w}" height="${h}" ${attrs}${pos}>`;
};

const INTERESTS = {
  history: { label: "History", icon: "landmark" },
  nature: { label: "Nature", icon: "leaf" },
  desert: { label: "Desert", icon: "tent" },
  beach: { label: "Sea & beach", icon: "waves" },
  food: { label: "Food", icon: "utensils" },
  faith: { label: "Faith", icon: "dome" }
};
const SEASONS = [
  ["winter", "Winter", "Dec–Feb"], ["spring", "Spring", "Mar–May"],
  ["summer", "Summer", "Jun–Aug"], ["autumn", "Autumn", "Sep–Nov"]
];

const tag = (i) => `<span class="dt-tag">${icon(INTERESTS[i]?.icon || "pin")}${esc(INTERESTS[i]?.label || i)}</span>`;
const gemTag = () => `<span class="dt-tag dt-gem">${icon("star")}Hidden gem</span>`;
const srcLink = (url, text = "Source") => `<a class="dt-src" href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}${icon("external")}<span class="sr-only"> (opens in a new tab)</span></a>`;

/** Ticket summary: { price, verified, note }, ✓ + date only for verified values (rule 6). */
function ticketInfo(p) {
  const t = p.ticket;
  if (t.jod == null) return { price: "Not confirmed", short: "Price not confirmed", verified: false, est: true };
  const price = t.jod === 0 ? "Free" : `${t.jod} JOD`;
  if (t.status === "verified") return { price, short: `${price} ✓`, verified: true, date: fullDate(t.verifiedOn) };
  return { price: `est. ${t.jod === 0 ? "free" : price}`, short: `est. ${t.jod === 0 ? "free" : price}`, verified: false, est: true };
}
/** Jordan Pass line: only a verified ticket says "Included" outright. */
function passInfo(p) {
  const t = p.ticket;
  if (!t.coveredByJordanPass) return { yes: false, text: "Not included", sub: "Pay at the site" };
  if (t.status === "verified") return { yes: true, text: "Included", sub: "Entry covered by the Pass" };
  return { yes: true, text: "May be included", sub: "Coverage not verified" };
}
/** Seasons whose average day temperature is 18–30 °C. */
function bestSeasons(p) {
  return SEASONS.filter(([k]) => p.climate[k][0] >= 18 && p.climate[k][0] <= 30);
}
const shortName = (id) => nameOf(id).replace(/ Biosphere Reserve| Castle| & Mount Nebo/, "");
const legsFor = (id) => legs.filter((l) => l.from === id || l.to === id);
const nearby = (p) => places.filter((q) => q.id !== p.id)
  .map((q) => ({ q, km: Math.round(haversine(p, q)) }))
  .sort((a, b) => a.km - b.km).slice(0, 3);

/* ---------- locator map (equirectangular, lng scaled by cos(lat), same frame idea as js/map.js) ---------- */
// Tight frame: the viewBox hugs the outline (plus room for the halos and the northernmost label), so the panel
// takes the map's own aspect ratio instead of a tall box with empty sand above and below.
const MAP_H = 160, MPAD = 4, LBL_H = 20, LBL_GAP = 13, LBL_CH = 7.8, LBL_PAD = 16, CITY_CH = 7;
const { MW, MH, mapProject } = (() => {
  const pts = JORDAN_OUTLINE.map(([lng, lat]) => ({ lng, lat }));
  const lats = pts.map((p) => p.lat);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...lats), Math.max(...lats)];
  const s = MAP_H / (maxY - minY);
  const raw = (p) => ({ x: (p.lng * k - minX) * s, y: (maxY - p.lat) * s });
  const rp = places.map(raw), HALO = 11;
  const top = Math.min(0, ...rp.map((r) => r.y - LBL_GAP - LBL_H)) - MPAD;
  const left = Math.min(0, ...rp.map((r) => r.x - HALO)) - MPAD;
  const bottom = Math.max(MAP_H, ...rp.map((r) => r.y + HALO)) + MPAD;
  const offX = -left, offY = -top;
  return {
    MW: Math.ceil((maxX - minX) * s + offX + MPAD), MH: Math.ceil(bottom + offY),
    mapProject: (p) => { const r = raw(p); return { x: +(offX + r.x).toFixed(1), y: +(offY + r.y).toFixed(1) }; }
  };
})();
const outline = JORDAN_OUTLINE.map(([lng, lat], i) => { const { x, y } = mapProject({ lng, lat }); return `${i ? "L" : "M"}${x} ${y}`; }).join("") + "Z";
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function locator(p) {
  const dots = places.filter((q) => q.id !== p.id).map((q) => {
    const { x, y } = mapProject(q);
    return `<circle class="lm-dot" cx="${x}" cy="${y}" r="3"/>`;
  }).join("");
  const me = mapProject(p);
  const amman = mapProject(byId.amman);
  const label = shortName(p.id);
  const w = label.length * LBL_CH + LBL_PAD;
  const lx = Math.min(Math.max(me.x - w / 2, 2), MW - w - 2);
  // The Amman name and dot stay readable: if the pill above the dot would cover them, put it below.
  const city = p.id === "amman" ? null : { x: amman.x - 4, y: amman.y - 18, w: 5 * CITY_CH + 15, h: 22 };
  const above = me.y - LBL_GAP - LBL_H, below = me.y + LBL_GAP;
  const ly = city && overlaps({ x: lx, y: above, w, h: LBL_H }, city) && below + LBL_H <= MH - 2 ? below : Math.max(above, 2);
  const ammanLabel = city ? `<text class="lm-city" x="${amman.x + 7}" y="${amman.y - 6}">Amman</text>` : "";
  return `<svg class="dp-map" viewBox="0 0 ${MW} ${MH}" role="img" aria-label="Map of Jordan showing ${esc(label)} among the 12 Darb destinations">
    <path class="lm-land" d="${outline}"/>
    ${dots}${ammanLabel}
    <circle class="lm-halo" cx="${me.x}" cy="${me.y}" r="10"/>
    <circle class="lm-me" cx="${me.x}" cy="${me.y}" r="5"/>
    <rect class="lm-label-bg" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${w.toFixed(1)}" height="${LBL_H}" rx="10"/>
    <text class="lm-label" x="${(lx + w / 2).toFixed(1)}" y="${(ly + 14).toFixed(1)}" text-anchor="middle">${esc(label)}</text>
  </svg>`;
}

/* ---------- shared head / shell ---------- */
function head({ title, description, canonical, jsonld, banner = "", image = null }) {
  const img = image || { url: `${SITE}/og.png`, w: 1200, h: 630 };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Darb">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${img.url}">
  <meta property="og:image:width" content="${img.w}">
  <meta property="og:image:height" content="${img.h}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${img.url}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#f7f2ea">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/app.css">
  <link rel="stylesheet" href="/css/pages/destinations.css">
  <script type="application/ld+json">
${JSON.stringify(jsonld, null, 2).replace(/</g, "\\u003c")}
  </script>
</head>
${banner ? `<body class="page-photo">
  <div class="photo-banner ${banner}" aria-hidden="true"></div>` : "<body>"}
  <header id="nav"></header>
`;
}
const tail = `
  <footer id="footer"></footer>
  <script type="module" src="/js/pages/destinations.js"></script>
</body>
</html>
`;
const honestNote = `<p class="dt-honest">${icon("shield")}<span>Prices marked <strong class="dt-est-word">est.</strong> are estimates; <strong class="dt-ok-word">✓</strong> values were verified on the date shown.</span></p>`;

/* ---------- index ---------- */
function indexCard(p, i) {
  const t = ticketInfo(p);
  const pass = passInfo(p);
  return `<li class="dx-item" data-interests="${esc(p.interests.join(" "))}">
  <a class="dx-card" href="${pageUrl(p.id)}">
    <div class="dx-photo">
      ${photoImg(p, "dx-img", i < 2 ? 'decoding="async"' : 'loading="lazy" decoding="async"')}
      ${p.hiddenGem ? gemTag() : ""}
    </div>
    <div class="dx-top">
      <div class="dx-title">
        <h2 class="dx-name">${esc(p.name)}</h2>
        <p class="dx-ar" lang="ar" dir="rtl">${esc(p.nameAr)}</p>
      </div>
    </div>
    <div class="dx-tags">${p.interests.map(tag).join("")}</div>
    <ul class="dx-facts">
      <li>${icon("clock")}<span>Allow ${p.minHours} h or more</span></li>
      <li>${icon("ticket")}<span class="${t.verified ? "dt-ok" : "dt-est"}">${esc(t.short)}${t.verified ? ` <span class="dt-date">${esc(t.date)}</span>` : ""}</span></li>
      ${pass.yes ? `<li>${icon("shield")}<span>Jordan Pass${pass.text === "Included" ? "" : " (not verified)"}</span></li>` : ""}
    </ul>
    <span class="dx-more">Open guide${icon("arrow-right")}</span>
  </a>
</li>`;
}

function renderIndex() {
  const verifiedTickets = places.filter((p) => p.ticket.status === "verified").length;
  const interests = Object.keys(INTERESTS).filter((i) => places.some((p) => p.interests.includes(i)));
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Jordan destinations checked by Darb",
    itemListElement: places.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/d/${p.id}`, name: p.name }))
  };
  const html = head({
    title: "Jordan destinations, verified transport & prices | Darb",
    description: "Guides to the 12 places most Jordan trips include, Amman, Petra, Wadi Rum, Jerash, the Dead Sea and more: time to allow, ticket prices in JOD, how to get there and what to pack. Every fact shows its last-verified date.",
    canonical: `${SITE}/destinations`,
    banner: "desert no-stepper",
    jsonld
  }) + `
  <main id="main">
    <section class="dx-hero">
      <div class="container">
        <p class="eyebrow">Destinations</p>
        <h1>Twelve places, <span class="dx-hl">reality-checked.</span></h1>
        <p class="dx-lead">Time to allow, ticket prices, how to get there without a car and what to pack, for the places most Jordan trips include.</p>
        <ul class="dx-stats" aria-label="What this guide covers">
          <li><strong>${places.length}</strong><span>destinations</span></li>
          <li><strong>${legs.length}</strong><span>routes with options</span></li>
          <li><strong>${verifiedTickets}</strong><span>ticket prices verified</span></li>
        </ul>
        <p class="dx-legend"><span class="dt-ok">✓ verified</span> checked on the date shown · <span class="dt-est">est.</span> an estimate</p>
      </div>
    </section>

    <section class="container dx-body" aria-labelledby="dx-list-title">
      <h2 id="dx-list-title" class="sr-only">All destinations</h2>
      <div class="dx-filters" id="dx-filters" role="group" aria-label="Filter by interest" hidden>
        <button type="button" class="chip on" data-filter="all" aria-pressed="true">All</button>
        ${interests.map((i) => `<button type="button" class="chip" data-filter="${i}" aria-pressed="false">${icon(INTERESTS[i].icon)}${esc(INTERESTS[i].label)}</button>`).join("\n        ")}
      </div>
      <p class="dx-count small muted" id="dx-count" aria-live="polite"></p>
      <ul class="plain-list dx-grid" id="cards">
${places.map((p, i) => indexCard(p, i)).join("\n")}
      </ul>

      <section class="dx-official card" aria-labelledby="official-title">
        <h2 id="official-title">Official sources</h2>
        <ul class="plain-list">
          <li><a href="https://jordanpass.jo" target="_blank" rel="noopener">Jordan Pass${icon("external")}</a><span>Visa and site tickets bundle</span></li>
          <li><a href="https://jett.com.jo/en" target="_blank" rel="noopener">JETT${icon("external")}</a><span>Intercity buses</span></li>
          <li><a href="https://visitpetra.jo/en" target="_blank" rel="noopener">Visit Petra${icon("external")}</a><span>Tickets and visitor information</span></li>
          <li><a href="https://visitjordan.com" target="_blank" rel="noopener">Visit Jordan${icon("external")}</a><span>National tourism site</span></li>
          <li><a href="https://www.rscn.org.jo" target="_blank" rel="noopener">RSCN${icon("external")}</a><span>Nature reserves such as Dana</span></li>
        </ul>
      </section>
      ${honestNote}
    </section>
  </main>
` + tail;
  writeFileSync(join(root, "destinations.html"), html);
}

/* ---------- place page ---------- */
function optionRow(o) {
  const c = fmtCost(o);
  const verified = o.status === "verified";
  const meta = [];
  if (o.durationMin) meta.push(`${icon("clock")}${verified ? "" : "~"}${esc(fmtDuration(o.durationMin))}`);
  else if (o.durationText && !/verify/i.test(o.durationText)) meta.push(`${icon("clock")}${esc(o.durationText)}`);
  if (o.departs) meta.push(`${icon("calendar")}Departs ${esc([].concat(o.departs).join(", "))}`);
  const unit = o.costUnit && o.cost ? ` <span class="dp-unit">${esc(o.costUnit)}</span>` : "";
  return `<li class="dp-opt${o.recommended ? " is-rec" : ""}">
    <span class="dt-tile dt-tile-sm">${icon(modeIcon(o.mode))}</span>
    <div class="dp-opt-main">
      <p class="dp-opt-label">${esc(o.label)}${o.recommended ? ' <span class="dp-rec">Recommended</span>' : ""}</p>
      ${meta.length ? `<p class="dp-opt-meta">${meta.map((m) => `<span>${m}</span>`).join("")}</p>` : ""}
      ${o.notes ? `<p class="dp-opt-notes">${esc(o.notes)}</p>` : ""}
      ${verified ? `<p class="dp-opt-ver">✓ verified ${esc(fullDate(o.verifiedOn))}${https(o.sourceUrl) ? ` · ${srcLink(o.sourceUrl)}` : ""}</p>` : ""}
    </div>
    <p class="dp-cost ${c.verified ? "dt-ok" : "dt-est"}">${esc(c.text)}${c.verified ? " ✓" : ""}${unit}</p>
  </li>`;
}

function legCard(leg, here) {
  const other = leg.from === here ? leg.to : leg.from;
  const otherLink = byId[other] && !airportIds.has(other) ? `<a href="${pageUrl(other)}">${esc(nameOf(other))}</a>` : esc(nameOf(other));
  const pt = { none: ["nf", "No public transport"], limited: ["risky", "Limited public transport"], scheduled: ["ok", "Scheduled bus"] }[leg.publicTransport] || ["info", "Public transport unknown"];
  const glyph = { nf: "✕", risky: "!", ok: "✓", info: "" }[pt[0]];
  const warn = leg.publicTransport === "none" && (leg.evidence || leg.warning)
    ? `<p class="dp-warn">${icon("warn")}<span>${esc(leg.evidence || leg.warning)}</span></p>`
    : leg.warning ? `<p class="dp-warn is-soft">${icon("warn")}<span>${esc(leg.warning)}</span></p>` : "";
  return `<article class="dp-leg card">
    <header class="dp-leg-head">
      <div>
        <p class="dp-leg-dir">${esc(nameOf(leg.from))} ${icon("arrow-right")} ${esc(nameOf(leg.to))}</p>
        <h3>${leg.from === here ? "To" : "From"} ${otherLink}</h3>
      </div>
      <div class="dp-leg-badges">
        <span class="pill ${pt[0]}">${glyph ? `<span class="pill-glyph" aria-hidden="true">${glyph}</span>` : ""}${pt[1]}</span>
        ${leg.driveMin ? `<span class="pill info">${icon("car")}~${esc(fmtDuration(leg.driveMin))} drive</span>` : ""}
      </div>
    </header>
    ${warn}
    ${leg.timeSensitive ? `<p class="dp-warn is-soft">${icon("sun")}<span>${esc(leg.timeSensitive)}</span></p>` : ""}
    <ul class="plain-list dp-opts">
      ${leg.options.map(optionRow).join("\n      ")}
    </ul>
  </article>`;
}

function renderPlace(p) {
  const t = ticketInfo(p);
  const pass = passInfo(p);
  const best = bestSeasons(p);
  const myLegs = legsFor(p.id);
  const near = nearby(p);
  const name = p.name;
  const bestText = best.length ? best.map(([, n]) => n).join(" & ") : "No mild season";
  const bestSub = best.length ? `${best.map(([, , m]) => m).join(", ")} · based on average temperatures` : "No season averages 18–30 °C by day";

  const description = `${name}, Jordan: allow ${p.minHours} hours or more. ${p.ticket.label}: ${t.verified ? `${t.price}, verified ${t.date}` : t.price}. ${myLegs.length ? `${myLegs.length} route${myLegs.length > 1 ? "s" : ""} with costed options` : "Transport estimated from road distance"}, seasonal weather and what to pack.`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    "@id": `${SITE}/d/${p.id}`,
    name,
    alternateName: p.nameAr,
    url: `${SITE}/d/${p.id}`,
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    containedInPlace: { "@type": "Country", name: "Jordan" },
    description,
    image: `${SITE}${photoPath(p.id)}`,
    isAccessibleForFree: p.ticket.jod === 0 && p.ticket.status === "verified" ? true : undefined,
    touristType: p.interests.map((i) => INTERESTS[i]?.label || i)
  };

  const html = head({ title: `${name}, how to get there, tickets & weather | Darb`, description, canonical: `${SITE}/d/${p.id}`, jsonld, image: { url: `${SITE}${photoPath(p.id)}`, w: (PHOTO_SIZE[p.id] || [1200])[0], h: (PHOTO_SIZE[p.id] || [0, 800])[1] } }) + `
  <main id="main" class="dp">
    <div class="container">
      <nav class="dp-crumb" aria-label="Breadcrumb"><a href="/destinations.html">${icon("arrow-left")}All destinations</a></nav>

      <header class="dp-hero card">
        <div class="dp-photo">${photoImg(p, "dp-img", 'fetchpriority="high"')}</div>
        <div class="dp-hero-text">
          <p class="eyebrow dp-eyebrow"><span class="dt-tile dt-tile-sm">${icon(placeIcon(p.id))}</span>Jordan · destination</p>
          <h1>${esc(name)}</h1>
          <p class="dp-ar" lang="ar" dir="rtl">${esc(p.nameAr)}</p>
          <div class="dx-tags">${p.hiddenGem ? gemTag() : ""}${p.interests.map(tag).join("")}</div>
          <div class="dp-hero-cta">
            <a class="btn btn-primary" href="/build.html">Build a plan with ${esc(shortName(p.id))}${icon("arrow-right")}</a>
            <a class="btn btn-secondary" href="/plan.html">Check my plan</a>
          </div>
        </div>
        <figure class="dp-hero-map">${locator(p)}<figcaption class="small muted">${esc(shortName(p.id))} among Darb's 12 destinations</figcaption></figure>
      </header>

      <section class="dp-sec" aria-labelledby="glance">
        <h2 id="glance" class="dp-h2">At a glance</h2>
        <div class="dp-glance">
          <div class="dp-tile card">
            <span class="dt-tile">${icon("clock")}</span>
            <p class="dp-k">Time to allow</p>
            <p class="dp-v">${p.minHours} h+</p>
            <p class="dp-s">${p.minHours >= 5 ? "Plan a full day" : "Half a day or more"}</p>
          </div>
          <div class="dp-tile card">
            <span class="dt-tile">${icon("ticket")}</span>
            <p class="dp-k">Entry ticket</p>
            <p class="dp-v ${t.verified ? "dt-ok" : "dt-est"}">${esc(t.price)}${t.verified ? " ✓" : ""}</p>
            <p class="dp-s">${esc(p.ticket.label)}${t.verified ? ` · verified ${esc(t.date)}${https(p.ticket.sourceUrl) ? ` · ${srcLink(p.ticket.sourceUrl)}` : ""}` : " · not verified"}</p>
          </div>
          <div class="dp-tile card">
            <span class="dt-tile">${icon("shield")}</span>
            <p class="dp-k">Jordan Pass</p>
            <p class="dp-v ${pass.yes ? (pass.text === "Included" ? "dt-ok" : "dt-est") : ""}">${esc(pass.text)}</p>
            <p class="dp-s">${esc(pass.sub)}</p>
          </div>
          <div class="dp-tile card">
            <span class="dt-tile">${icon("sun")}</span>
            <p class="dp-k">Best season</p>
            <p class="dp-v">${esc(bestText)}</p>
            <p class="dp-s">${esc(bestSub)}</p>
          </div>
        </div>
        ${p.ticket.notes ? `<p class="dp-note">${icon("ticket")}<span>${esc(p.ticket.notes)}</span></p>` : ""}
      </section>

      <section class="dp-sec" aria-labelledby="getting">
        <div class="dp-sec-head">
          <h2 id="getting" class="dp-h2">Getting there</h2>
          <a class="dp-link" href="/plan.html">Check a plan with this route${icon("arrow-right")}</a>
        </div>
        ${myLegs.length ? `<div class="dp-legs">
        ${myLegs.map((l) => legCard(l, p.id)).join("\n        ")}
        </div>` : `<div class="card dp-empty"><span class="dt-tile">${icon("route")}</span><p>No checked route to ${esc(name)} yet. When your plan includes it, Darb estimates the transfer from road distance and marks the price <span class="dt-est">est.</span></p></div>`}
      </section>

      <section class="dp-sec" aria-labelledby="weather">
        <h2 id="weather" class="dp-h2">Weather &amp; what to pack</h2>
        <div class="dp-seasons">
          ${SEASONS.map(([k, n, m]) => `<div class="dp-season card${best.some(([b]) => b === k) ? " is-best" : ""}">
            <p class="dp-season-name">${esc(n)} <span>${m}</span></p>
            <p class="dp-temp">${icon("sun")}<strong>${p.climate[k][0]}°</strong><span class="sr-only"> C by day</span></p>
            <p class="dp-temp is-night">${icon("moon")}${p.climate[k][1]}°<span class="sr-only"> C at night</span></p>
          </div>`).join("\n          ")}
        </div>
        <p class="dp-pack card">${icon("backpack")}<span><strong>Pack:</strong> ${esc(p.packing)}</span></p>
        <p class="small muted">Rough seasonal averages, not a forecast. Add a start date to your plan for a live forecast.</p>
      </section>

      <section class="dp-sec" aria-labelledby="nearby">
        <h2 id="nearby" class="dp-h2">Nearby</h2>
        <ul class="plain-list dp-near">
          ${near.map(({ q, km }) => `<li><a class="dp-near-card card" href="${pageUrl(q.id)}"><span class="dt-tile">${icon(placeIcon(q.id))}</span><span class="dp-near-name">${esc(q.name)}<span class="small muted">${km} km straight line</span></span>${icon("arrow-right")}</a></li>`).join("\n          ")}
        </ul>
      </section>

      <section class="dp-cta card-dark" aria-labelledby="cta">
        <h2 id="cta">Planning ${esc(shortName(p.id))}?</h2>
        <p>Darb checks every day of your plan against this data and fixes what breaks.</p>
        <div class="dp-hero-cta">
          <a class="btn btn-primary" href="/build.html">Build a plan with ${esc(shortName(p.id))}</a>
          <a class="btn btn-secondary" href="/plan.html">Check my plan</a>
        </div>
      </section>
      ${honestNote}
    </div>
  </main>
` + tail;
  writeFileSync(join(root, "d", `${p.id}.html`), html);
}

mkdirSync(join(root, "d"), { recursive: true });
renderIndex();
for (const p of places) renderPlace(p);

// sitemap: keep the fixed pages, (re)write the destination URLs.
const smFile = join(root, "sitemap.xml");
let sm = readFileSync(smFile, "utf8").replace(/\s*<url><loc>[^<]*\/d\/[^<]*<\/loc>.*?<\/url>/g, "");
sm = sm.replace("</urlset>", places.map((p) => `  <url><loc>${SITE}/d/${p.id}</loc>${lastmods[p.id] ? `<lastmod>${lastmods[p.id]}</lastmod>` : ""}</url>`).join("\n") + "\n</urlset>");
writeFileSync(smFile, sm);
console.log(`Rendered destinations.html + ${places.length} pages in public/d/`);
