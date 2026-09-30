# Destinations pages + richer Jordan Pass section, 30 Sep 2026, 20:25

Deadline: the site is judged after 22:00 Amman. **Implementers commit by 21:10.** Controller reviews, deploys, pushes.
Mobile first: most visitors use a phone (375 px is the main target; must also look good at 768, 1280, 1440).

## Global constraints (CLAUDE.md §0, §2, §7, breaking one disqualifies)
- HTML, CSS, plain ES modules. CDN libraries are allowed if truly useful, but no npm, no build step, no framework.
- Colours only via tokens in `public/css/tokens.css`. No emoji; icons are monochrome inline SVG (see `public/js/ui/icons.js`, add icons there only if you own it, task A may add icons to `icons.js`; task B must not edit it).
- **Honesty in data (rule 6):** only `status: "verified"` values get a ✓ and their verified date; everything else shows `est.` and a range. Never invent schedules, prices, opening hours or facts that are not in `public/data/*.json`. Descriptive copy must be generic and true (no made-up numbers).
- No university or member names. Plus Jakarta Sans. Existing nav/footer via `initPage` from `js/ui/nav.js`.
- Do not deploy, push, seed or touch Firestore. Do not edit `public/sw.js` (the controller bumps it). Commit only your own files by explicit path, plain message, no attribution lines.
- Verify with `node scripts/run-tests.mjs` + `node scripts/check-contrast.mjs`, a local server (`python3 -m http.server -d public <port>`; kill it after) and real browser screenshots at 375×812 and 1440×900 (tools via ToolSearch: mcp__plugin_playwright_playwright__* or mcp__plugin_ecc_chrome-devtools__*). No console errors, no horizontal scroll.

## Task A, Destinations: a beautiful index + one page per destination
Files you own: `scripts/render-destinations.mjs`, `public/destinations.html` (generated), new `public/d/*.html` (generated, one per place id), `public/css/pages/destinations.css`, `public/js/pages/destinations.js`, new `public/js/pages/place.js` if needed, `public/js/ui/icons.js` (add icons only), `public/sitemap.xml`, `public/llms.txt` (links only).

Data: `public/data/places.json` (12 places: name, nameAr, lat/lng, interests, minHours, hiddenGem, ticket {jod, status, verifiedOn, source, sourceUrl, coveredByJordanPass, label}, climate {winter/spring/summer/autumn: [dayC, nightC]}, packing), `public/data/legs.json` (routes between places with options: mode, cost [min,max] or null, departs, duration, status, verifiedOn, source), `public/data/jordan-pass.json`. Airports in places.json `airports`.

1. `render-destinations.mjs` pre-renders (commit the output) `destinations.html` and `d/<id>.html` from the JSON, real HTML in the file for SEO/GEO, JSON-LD kept (TouristAttraction per page), canonical `https://darb-pixelsdev.web.app/d/<id>` (Hosting has cleanUrls). Pages link CSS `/css/tokens.css`, `/css/app.css`, `/css/pages/destinations.css` and a small module for the nav/footer (reuse `pages/destinations.js`).
2. **Index (`destinations.html`)**: a mobile-first grid of destination cards (name + Arabic name, interest tags with icons, time needed, ticket line with ✓/est., "Jordan Pass" badge when covered, "Hidden gem" tag), each card links to `/d/<id>.html`. A filter row of interest chips (client-side, progressive: all cards visible without JS). Hero with a short intro.
3. **Place page (`d/<id>.html`)**, sections with icons, card layout, very readable on a phone:
   - Header: name, Arabic name, interest tags, hidden-gem tag, a small SVG locator map of Jordan with this place highlighted among the 12 (project lat/lng like `js/map.js` does, reuse its projection helper if exported, else a simple equirectangular box).
   - "At a glance" tiles: time to allow (minHours), entry ticket (✓ verified + date + source link, or est./unknown), covered by Jordan Pass yes/no, best season (derived honestly from climate: the season(s) with day temperature 18–30 °C; say "based on average temperatures").
   - "Getting there": every leg in legs.json that touches this place (either direction): from/to, each option with mode icon, duration, departure times if present, cost with ✓/est. exactly as the rest of the site formats it (`js/engine/format.js`), and a link "Check a plan with this route" → `/plan.html`.
   - "Weather & what to pack": four season tiles with day/night °C + the packing tip.
   - "Nearby": the 3 closest other places with straight-line km (haversine from `js/engine/geo.js`), linking to their pages.
   - CTA card: "Build a plan with <name>" → `/build.html`, and "Check my plan" → `/plan.html`.
   - Footer note: "Prices marked est. are estimates; ✓ values were verified on the date shown."
4. Add the 12 place URLs to `sitemap.xml`.

## Task B, Jordan Pass section on the landing page (`#pass`), rich and useful
Files you own: `public/index.html` (only inside `<section id="pass">`), `public/css/pages/landing.css` (append a `#pass` block; do not change other rules), `public/js/pages/landing.js` (only the pass rendering, `renderDemo` already writes `#pass-line`; add a separate function), `public/css/tokens.css` (new tokens only), `scripts/check-contrast.mjs` (new pairs only).

Today the section is one green card with two sentences. Make it a full-screen, mobile-first section that explains the Pass with real data (`jordan-pass.json`, `places.json` tickets, and the live `result.pass` from Sarah's plan that `renderDemo` already has, read `public/js/engine/pass.js` for its shape):
1. Headline + one-line explainer: "One ticket for your visa and the big sites, worth it if you stay 2+ nights."
2. **The three tiers** as cards (Wanderer 70 / Explorer 75 / Expert 80 JOD) with what differs: Petra days (1/2/3). Highlight the tier Sarah's plan needs (from `result.pass.tier`).
3. **What's included**: the covered sites from places.json (`ticket.coveredByJordanPass`) with their separate ticket price (✓ verified + date, or est.) plus the visa 40 JOD.
4. **Sarah's example, computed live**: a small receipt, each "bought separately" line item from `result.pass` → total vs the tier price → "Save ~41 JOD" (never hard-code the numbers; render from the engine; skeleton while loading, the static text if the engine fails).
5. **The rules, as 3 icon rows**: stay at least 2 nights (3 days) for the visa waiver; buy it online before you arrive; Petra days count by the tier. Source line: jordanpass.jo, verified date from `jordan-pass.json._meta`.
6. CTA: "Check if it pays off for your trip" → `/plan.html`.
Keep ids `#pass` and `#pass-line` (or keep `#pass-line` as the live sentence). Sand background (option B palette), white/glass cards consistent with the page. Must fit the "each section fills the screen" rule on desktop (min-height 100svh; content may be taller on phones).

## Task C (21:50), visual bridge between the landing page and the tool pages
The landing page is cinematic (video, full-bleed photos fading night → sand, floating transparent header); the tool
pages are the flat Figma look. Bridge them lightly, **do not redesign the tool screens** (rule 4: screens 02–08 must
keep their structure and content).

Pages: `plan.html` (02), `check.html` (03), `fixed.html` (04), `build.html` (07), and the destinations index
(`scripts/render-destinations.mjs` → `public/destinations.html`). Not: dashboard, admin, leg, trip, tests, 404, place pages.

1. A slim photo banner at the top of each of those pages, full-bleed, behind the header, the stepper (02/03/04) and the
   page title block, fading into `--sand` at its bottom with the same mask/gradient technique as the landing
   (`public/css/pages/landing.css`, sections `.demo-section` / `.pass-section`). Ink scrim at the top so the header reads.
   Photos (already in `public/img/landing/`): pick per page from petra-night-1320, wadi-rum-caravan-1600/2400,
   dead-sea-1320, aqaba-marina-1320, hero-poster, e.g. plan → Wadi Rum, check → Petra, fixed → Dead Sea, build → Aqaba,
   destinations → hero-poster (your call; they must suit the page and keep text readable).
   Height: modest, about 240–320 px on desktop, ~200–260 px on phones, so the tool content (textarea, day cards,
   score) still starts near the top of the first screen. Text over the photo is white on the scrim (≥4.5:1), or keep
   the title on the sand below the fade if that reads better, decide per page by screenshot.
2. On those pages the header floats transparent over the banner with white brand/links (reuse the landing's
   `.page-landing header#nav` rules by generalising them to a shared class, e.g. `body.page-photo`, in `app.css`), and
   the stepper pills stay legible on the photo.
3. Everything below the banner stays exactly as it is: cards, numbers, tables, forms, sidebars, sticky CTA, print.
   `@media print` hides the banner. Reduced motion: nothing animates anyway.

Files: `public/css/app.css` (shared banner + header rules, scoped to the new body class only), the four HTML pages
(body class + one banner element each; no other markup change), `public/css/pages/landing.css` (only to switch
`.page-landing header#nav` to the shared rules without changing its look), `scripts/render-destinations.mjs` +
regenerated `public/destinations.html` (banner on the index only; place pages unchanged), `public/css/tokens.css` (new
tokens only). Do not touch JS unless a page's JS replaces the markup you need (check `js/pages/*.js` and
`js/ui/stepper.js`); do not edit `public/sw.js`; do not deploy or push.
