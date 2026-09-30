# Darb — Jordan trips, reality-checked

**Live:** https://darb-pixelsdev.web.app · Team **PixelsDev** · PixelSite 2.0 — *Reimagining Jordanian Tourism*

Paste any Jordan itinerary — from ChatGPT, a blog or a travel agent. Darb checks every day against real buses, travel times, visit time budgets and prices, gives it a **Reality Score**, and fixes what won't work on the ground — with every transport leg costed in JOD.

## Features
- **Reality Check** — the pasted plan is split into days, you confirm the places found, and each day is flagged OK / Risky / Not feasible with the reason and a fix.
- **Fix all** — a corrected plan: every leg has a chosen option, a cost and (when verified) a last-verified date; "What changed" lists every fix.
- **Transport leg detail** — all options for one leg (bus, transfer, taxi / driver), the recommended one highlighted.
- **Jordan Pass calculator** — shows whether the Pass saves money for this exact trip.
- **Build a plan** — pick interests, days, airport, car and month; Darb suggests only places you can actually reach, including lesser-visited sites.
- **Destinations** — one card per place with verified facts only (tickets, how to get there), plus structured data for search.
- **Save & share** — private link (`/t/<id>`), PDF (print), calendar export (.ics in the Asia/Amman time zone, or Google Calendar).
- **Offline mode** — a service worker caches the app shell, the Firebase SDK and every trip you opened, so a saved plan opens with no signal.
- **Post-trip confirmation** — on a shared trip, travellers answer "Was this transport there?" for each leg; answers are stored anonymously so the data team knows which legs to re-verify.
- **Ministry dashboard** — where tourism gets stuck: blocked legs, demand for lesser-visited sites, data freshness. *Demo* mode uses illustrative data and says so; *Live* mode reads real anonymous events.
- **Data owners panel** (`/admin`) — signed-in data owners update schedules and prices; every edit is logged as an operator update.
- **Engine tests** — `/tests.html` runs the reference example and the edge cases in the browser.

## Phase 1 documentation vs. this build
The Phase 1 document described Node/Express + Supabase + Google Maps + an AI parsing service. Phase 2 requires Firebase, so the build changed deliberately:

| Phase 1 document | This build | Why |
|---|---|---|
| Node/Express API + Supabase | Firebase Hosting + Cloud Firestore + Firebase Authentication + security rules | Phase 2 requires Firebase; the rules engine runs in the browser, so no server is needed. |
| AI parsing service | Rule-based parser (English and Arabic day markers, place-name matching); **the user confirms the parsed days** before the check | AI parsing is deferred. The engine never guesses: an unknown place is shown, not invented. |
| Google Maps distances / times | Stored, verified transport legs + a road-factor fallback (straight-line km × road factor) for legs we have not verified, always shown as an estimate | No API key or billing in the product; Google Maps is used only as a "Compare on map" link. |
| Jordan Pass card in the design: Wanderer 70 / bought separately 103 | **Explorer 75 / bought separately 116** | The reference trip visits Petra on two days, so the correct tier is Explorer (Petra 2-day ticket 55). A deliberate correction. With the ticket prices officially verified on 30 Sep 2026 (MoTA fee table, visitpetra.jo), Wadi Rum 5 and Madaba Archaeological Park 3 now count too, so the saving is ~41 JOD. |

## How Firebase is used
- **Hosting** — the live site, clean URLs, and a rewrite of `/t/<id>` to the shared-trip page. HTML/JS/CSS/JSON are served `no-cache` so a new deploy is picked up immediately.
- **Cloud Firestore** — collections:
  - `places`, `legs`, `config` — verified reference data (places, transport options, Jordan Pass tiers, demo stats). Public read, data owners write.
  - `trips` — saved plans, private-by-link: anyone with the random id can open one, nobody can list them, and they are immutable (a fixed plan is a new doc pointing to its source via `parentId`).
  - `events` — anonymous usage events (score, blocked legs, places) that feed the dashboard. No personal data.
  - `confirmations` — post-trip "Was this transport there?" answers. No personal data.
  - `operatorUpdates` — the change log of every data-owner edit.
  - `admins` — the allowlist of data-owner emails, written only by the seed script.
- **Authentication** — email/password sign-in for data owners on `/admin`.
- **Security rules** — `firestore.rules`: field allowlists and size limits on every client write, admin-only writes to reference data, no updates or deletes of trips, events or confirmations.

The rules engine (`public/js/engine/`) runs in the browser and makes every decision; nothing is guessed by AI.

## Tech
HTML · CSS · JavaScript (ES modules, no framework, no build step, no npm packages) · Firebase (Hosting, Firestore, Auth). `scripts/*.mjs` are dev-only Node helpers and are not shipped.

## Run locally
```bash
python3 -m http.server -d public 8080   # quick preview → http://localhost:8080
firebase serve --only hosting           # preview WITH clean URLs and the /t/<id> rewrite → http://localhost:5000
```
Deploy: `firebase deploy --only hosting` (site) · `firebase deploy --only firestore:rules` (rules) · Seed reference data: `node scripts/seed.mjs`

## Run the tests
All engine logic is covered by the reference example and edge cases in `public/js/test-cases.js`.

From the repo root (Node 18+):
```bash
node -e "import('./public/js/test-cases.js').then(async m=>{const f=p=>JSON.parse(require('fs').readFileSync('public/data/'+p));const {places,airports}=f('places.json');for(const r of m.runCases({places,airports,legs:f('legs.json').legs,pass:f('jordan-pass.json')}))console.log(r.ok?'PASS':'FAIL',r.name)})"
```
Or open `/tests.html` on either local server (or the live site) and read the pass / fail list.

## Data owners
1. In the Firebase console, enable **Authentication → Email/Password** and create a user for the data owner.
2. Add that email to the allowlist: `node scripts/seed.mjs admin owner@example.com` (uses your `firebase login` token).
3. The data owner signs in at `/admin`, edits a leg's times or prices, and the change is written to `legs` and logged in `operatorUpdates` (shown on the Live dashboard).
4. How values become "verified" (source + date + method, 90-day re-checks, no scraping): see [docs/DATA_VERIFICATION.md](docs/DATA_VERIFICATION.md); the evidence for each value is in [docs/data/verification-log.md](docs/data/verification-log.md).

## Data honesty
Only values marked *verified* show a ✓ and a date (e.g. JETT Abdali → Petra, 06:30, 4 h, 10 JOD — verified 24 Sep 2026). Everything else is shown as an "est." range. Darb never invents a timetable: calendar events for legs without a published departure say "Suggested time — not a timetable." Dashboard figures in *Demo* mode are illustrative.
