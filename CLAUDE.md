# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Darb (درب) — PixelSite 2.0, Phase 2 build

Darb reality-checks a Jordan itinerary against verified local data and fixes it.
Paste a plan (or build one) → Reality Score /100 → each day flagged OK / Risky / Not feasible with reason + fix + cost in JOD → **Fix all** → corrected plan, every transport leg costed → save as private link / PDF / calendar.

**Deadline: 30 Sep 2026, 22:00 (Amman). Nothing is accepted after that.** Prefer a smaller thing that works over a bigger thing that breaks.

---

## 0. Hard rules (disqualification if broken)

1. **Only HTML, CSS, JavaScript and Firebase.** No React/Vue/Svelte, no TypeScript, no Node server, no Supabase, no bundler/build step, no npm dependencies in the shipped site. Plain ES modules loaded from `<script type="module">`. Firebase SDK comes from the gstatic CDN (`https://www.gstatic.com/firebasejs/11.0.2/...`). Google Fonts is fine.
2. **Firebase must be used for real**: Hosting (live URL), Firestore (reference data, saved trips, analytics events), Auth (data-owner admin panel). Deploy with `firebase deploy`. Never rely on localhost.
3. The live site and the GitHub repo must both work when judged. After every milestone: `firebase deploy` and `git push`.
4. **Documentation ↔ design ↔ project must match.** Keep the 8 Figma screens, their flow and concepts (Reality Score, colored days, Jordan Pass card, Leg detail, Save & Share, Build a plan, Ministry dashboard). Improving is allowed; removing a core part is not.
5. No university name and no member names anywhere in the site or repo. Team name "PixelsDev" is allowed.
6. **Honesty in data:** only values with `status: "verified"` get a ✓ and a verified date. Everything else shows `est.` and a range. Dashboard demo numbers must always carry a visible "demo data" label. Never invent schedules.

## 1. Stack & layout

```
public/                  ← Firebase Hosting root (everything shipped lives here)
  index.html             01 Landing
  plan.html              02 Input (tab "Paste your plan"; tab "Build with questions" → build.html)
  check.html             03 Reality Check        ?t=<tripId>
  fixed.html             04 Fixed plan + 06 Save & Share modal   ?t=<tripId>
  leg.html               05 Leg detail           ?t=<tripId>&day=<n>&leg=<legKey>
  build.html             07 Build a plan
  dashboard.html         08 Ministry dashboard
  trip.html              shared read-only plan, served at /t/<tripId> (rewrite in firebase.json)
  destinations.html      the 12 destinations as public "verified answer" cards (SEO/GEO)
  admin.html             data owners (JETT, PDTRA, reserves) update legs and site tickets — Firebase Auth (a console: `js/pages/admin.js` auth/boot, `admin-console.js` tabs + hash, `admin-overview.js` stat tiles + freshness bar, `admin-master.js` list + detail, `admin-legs.js` / `admin-tickets.js` detail + save, `admin-form.js` fields + save bar, `admin-history.js` timeline + Revert, `admin-activity.js` recent changes, `admin-map.js` header map, `admin-common.js` shared helpers + `saveWithLog`)
  js/admin-validate.js   pure rules for /admin (option + ticket validation, freshness, change guard, revert); unit-tested, in the SW JS-LIST
  css/tokens.css         design tokens (done)   css/app.css  components
  js/firebase-init.js    (done) exports app, db, auth
  js/data.js             load places/legs/config from Firestore; cache in localStorage; fallback to /data/*.json
  js/engine/geo.js       haversine, road-km factor, bearings
  js/engine/model.js     buildModel(raw, today) (90-day staleness), resolveLeg (seed or §4.2 fallback), shortName
  js/engine/format.js    JOD / duration / date strings
  js/test-cases.js       runCases(raw) — shared by tests.html and Node (see §8)
  js/engine/parser.js    free text → days[] (rule-based)
  js/engine/rules.js     check(trip, data) → { score, days[], issues[], pass }
  js/engine/fixer.js     fix(trip, check, data) → fixed trip (every leg with a chosen option + cost)
  js/engine/pass.js      Jordan Pass value calculator
  js/store.js            saveTrip / loadTrip / logEvent (Firestore)
  js/ui/*.js             nav, stepper, pills, day-card, modal, toast, icons, dom (html``/esc helpers)
  js/ui/sticky-cta.js    mobile (< 900 px) sticky action bar that proxies the page's primary button
  js/render/fixed-plan.js  renderers shared by 04 fixed.html and trip.html (days, score, cost, weather, error cards)
  js/engine/builder.js   07 Build a plan: rank places, fits / needs +1 day, greedy layout, draft score (pure)
  js/share.js            06 Save & Share modal (link, PDF, offline, email, WhatsApp / Web Share, calendars, start date)
  js/fx.js               JOD → EUR/USD hint under the trip total (Frankfurter, 24 h cache, silent on failure)
  js/pages/*.js          one module per page
  js/ics.js              .ics + Google Calendar link
  js/weather.js          seasonal climate + Open-Meteo 7-day forecast when start date ≤ 7 days away; Wadi Rum sunset time
  js/map.js              SVG route map (project lat/lng into the box; lines coloured by status) + googleDirectionsUrl (key-less embed)
  sw.js                  service worker: cache app shell + visited trips ("works offline")
  data/*.json            seed data (source of truth for scripts/seed.mjs, and offline fallback)
  robots.txt, sitemap.xml, llms.txt   SEO / GEO (private and dev pages disallowed)
  manifest.json, icons/  PWA manifest + 192/512 icons (icon.html renders them)
  og.png                 Open Graph image 1200×630 (og.html renders it)
  tests.html             engine cases in the browser (same runCases as Node)
scripts/seed.mjs         `diff` / `pull` (read live data, no login), plain seed (refuses to overwrite owner edits; `--merge` keeps them, `--force` overwrites, `--dry-run`), `admin <email>` adds a data owner
scripts/seed-lib.mjs     pure helpers of seed.mjs (diff, owner fields, merge mask, argument parsing)
scripts/test-seed.mjs    unit tests of seed-lib.mjs (run by run-tests.mjs)
scripts/run-tests.mjs    engine cases + data check in Node, exit 1 on failure (CI)
scripts/check-data.mjs   every verified value has an https sourceUrl, a verifiedOn ≤ 90 days old and a known method
scripts/check-contrast.mjs  WCAG contrast of the text tokens in css/tokens.css (≥ 4.5:1)
scripts/render-destinations.mjs  pre-renders public/destinations.html (cards + JSON-LD) from data/*.json — commit the output
.github/workflows/tests.yml  CI: run-tests.mjs + check-contrast.mjs on every push
docs/design/*.png        the 8 Figma screens — match them
docs/DATA_VERIFICATION.md  how a value becomes verified (source + date + method); evidence in docs/data/verification-log.md
docs/HANDOVER.md         handover: architecture, caches, runbook, decisions, deferred items, admin backlog
```

Firebase project: `darb-pixelsdev` (Firestore in `eur3`). Web config is already in `js/firebase-init.js`.

## 2. Design (match `docs/design/*.png`)

- Font **Plus Jakarta Sans**; headings 700–800, tight letter-spacing. Tokens in `public/css/tokens.css` — use the variables, never hard-code colors.
- Page bg `--sand`; white cards, 16px radius, 1px `--line` border, soft shadow. Container max 1200px, desktop two-column (main ~65% / sidebar ~35%), stacks on mobile (<900px). Must work at 375px wide.
- Nav on every page: `● darb` (rose dot) · How it works · Jordan Pass · Destinations · For hostels · dark button **Check my plan** → plan.html. Dashboard shows the pill "Ministry of Tourism · Insights (demo)" instead of the button.
- Stepper pills on 02/03/04: `1 Your plan — 2 Reality Check — 3 Fixed plan` (done = rose-soft with ✓, current = ink, future = white).
- Status pills: OK = green on `--green-soft`; Risky = amber on `--amber-soft` with "!"; Not feasible = red on `--rose-soft` with "✕". A risky/NF day card gets a 1.5px border in that color and an inner "Why it breaks / Why it's risky" box.
- Icons: monochrome inline SVG in `--ink` (bus, car, landmark, mountain, tent, waves, pin, calendar, sun, moon). **No emoji.**
- Primary CTA rose (`Check my plan →`, `Fix all → 94/100`, `Save & share plan`); secondary = white with border.

## 3. Data model (Firestore)

| Collection | Doc | Written by | Notes |
|---|---|---|---|
| `places/{id}` | 12 destinations | seed / admins | see `public/data/places.json` |
| `legs/{id}` | 16 routes with options | seed / admins | see `public/data/legs.json`; symmetric |
| `config/jordanPass`, `config/airports`, `config/demoStats` | | seed | |
| `admins/{email}` | allowlist | seed only (`node scripts/seed.mjs admin x@y.com`) | |
| `operatorUpdates/{auto}` | `{operator, legId, placeId?, field, from, to, fromValue, toValue, by, at}` (`from`/`to` display strings, `fromValue`/`toValue` JSON values; tickets: `placeId`, `legId:""`, `field:"ticket.<name>"`) | admin.html | shown on dashboard; History + Revert in /admin (composite indexes in `firestore.indexes.json`) |
| `trips/{randomId}` | a checked or fixed plan | client (create-only) | ids: 12 random chars, e.g. `k7Q9mX2p4Rz8`; fixed plan = new doc with `parentId` |
| `confirmations/{auto}` | `{tripId, legId, answer:'yes'|'no', createdAt}` | client (create-only) | post-trip "Was this transport there?" on trip.html (documentation loop 3) |
| `events/{auto}` | `{type:'check'|'fix'|'build', score, scoreAfter, days, car, month, blockedLegs[], riskyLegs[], places[], createdAt}` | client (create-only) | no personal data; feeds dashboard "Live" |

Rules are in `firestore.rules` (already written) — respect their allowed keys when writing docs. Trip doc keys allowed: `title, source, rawText, settings, days, check, fixed, score, createdAt, parentId, lang`.

Trip shape:
```js
{
  title: "Your 5-day plan", source: "paste" | "build", rawText: "...",
  settings: { airport: "AMM", departAirport: "AMM", month: 10, travelers: 1, budget: "mid", car: false, startDate: null, pace: "balanced" },
  days: [ { n: 1, title: "Amman — Citadel & Roman Theatre", placeIds: ["amman"], notCovered: [],
            hints: { mode: "bus"|"car"|"taxi"|null, times: ["morning","afternoon","sunset","evening"], arrive: true, depart: false } } ],
  check: { score: 58, counts: {ok:3, risky:1, nf:1}, days: [ { n, status: "ok"|"risky"|"nf", issues: [ Issue ] } ], pass: PassResult },
  fixed: { score: 94, fixesApplied: 2, days: [ { n, title, items: [ { kind:"leg"|"visit", legId?, option?, placeId?, label, sub, costText, verified } ] } ], cost: { passJod, busJod, transfers:[min,max], total:[min,max] } }
}
```

## 4. Engine (the product — everything is decided by rules, never by AI)

### 4.1 Parser (`parser.js`)
- Split on `Day N` / `Days N–M` (repeated once per day) / `اليوم N` (Arabic-Indic digits too), with markdown, bullets or emoji before "Day"; else blank lines; else one line = one day. Max 21 days.
- For each day, find place keywords (`places[].keywords`, case-insensitive, Arabic too) in the order they appear → `placeIds`.
- Yesterday's last place named as today's start ("Amman to Petra", "Amman → Petra", "from Petra") is not a visit. Known places Darb doesn't cover (Desert Castles, Wadi Mujib, Little Petra, Feynan, Azraq, Shobak, Baptism Site, Irbid, Ma'in, Aqaba Marine Park) go in `day.notCovered` and the preview says "Not covered yet: …". `arrive`/`depart` mid-trip only with airport words.
- Hints: `bus|jett` → mode bus; `drive|rent|car` → car; `taxi|driver|transfer` → taxi; time words morning/afternoon/sunset/evening/night; `arrive|land` → arrive; `fly home|back|out` → depart, and `arrive`/`depart` count only when airport words follow them in the same day. Day 1 is `arrive` and last day is `depart` by default.
- Show a live preview under the textarea ("We read 5 days: Day 1 Amman · Day 2 Petra …") so the user confirms before checking. Unknown words are ignored, never guessed.

### 4.2 Legs between consecutive stops
Stops for a day = [previous day's last place (or airport on day 1)] + today's placeIds (+ on the last day the `settings.departAirport` airport — default the arrival airport; the parser pre-fills it from "fly home from AQJ / King Hussein / Aqaba airport").
Find the leg in `legs` (either direction). If none: **fallback** — km = haversine × 1.35, drive = km / 70 km/h, `publicTransport: "none"`, one option "Taxi / driver" cost = [max(15, km×0.30), max(20, km×0.40)] rounded, status `est`.

### 4.3 Rules → issues (each issue: `{code, severity: "risky"|"nf", legId?, placeId?, reason, fixes: [Fix]}`)
| Code | Condition | Severity |
|---|---|---|
| `NO_PUBLIC_TRANSPORT` | no car AND leg.publicTransport = none AND (day hints mode = bus OR leg has `timeSensitive` and day has "sunset") | nf |
| `NO_PUBLIC_TRANSPORT_SOFT` | no car AND publicTransport = none, otherwise | **info** (no penalty — the fixer just costs a taxi/driver; long legs are caught by LONG_TRANSFER). Matches Figma 03 where Day 5 Dead Sea → Madaba by taxi is OK |
| `ONE_DEPARTURE` | chosen option has a single `departs` time and the day also needs a morning visit elsewhere | risky |
| `LONG_TRANSFER` | the first leg of the day (from the previous day's base) is > 4 h without a car | risky |
| `DAY_OVERLOAD` | Σ(place.minHours — **halved for a place that was also on the previous day**, e.g. "Morning at Petra" on Day 3) + Σ(drive/60 of the legs *between today's places*, and to the airport on a depart day) > budget (10 h normal, 6 h arrive/depart day; pace relaxed −2 / packed +2). The morning transfer from the previous base is NOT counted here (LONG_TRANSFER covers it) — except on the arrival day, where the airport → first place drive counts. Over by > 2 h → nf, else risky | risky/nf |
| `ZIGZAG` | two places the same day that are > 60 km apart **and** in opposite directions from the Amman hub (bearing difference > 100°) — e.g. Jerash (north) + Dead Sea (south-west) | risky |
| `PETRA_TOO_SHORT` | Petra appears on only one day of the trip AND shares that day with another destination | risky |
| `SEASON` | summer (Jun–Aug) and Dead Sea / Wadi Rum / Aqaba planned for "afternoon" → risky "extreme midday heat"; winter + Wadi Rum overnight → info tip only (no penalty) | risky |

Day status = worst severity of its issues (none → ok).
**Score** = 100 − 28 × (nf days) − 14 × (risky days), min 5. The Figma example (1 nf + 1 risky) gives exactly **58**.

### 4.4 Fixes (`fixer.js`) — "Fix all" applies the recommended fix for every issue
- Transport issue → pick the leg's `recommended` option that works without a car (`requiresCar` excluded when car = false; `arrivesOk !== false`). Alternative fix: add a night and move the time-sensitive part to next morning ("More relaxed" card in 03: "Adds one night · same transfer, no rush").
- `ZIGZAG`/`DAY_OVERLOAD` → **swap search**: try swapping each place of the bad day with each place of every other day; keep the swap that leaves both days issue-free and has the lowest total km. If no swap works, move the place to the nearest day that still has budget; else suggest +1 day. (Reference case: Jerash ↔ Madaba, so Day 4 = Dead Sea + Madaba, Day 5 = Jerash then airport.)
- The swap search and the move fallback never put a place with minHours ≥ 5 (Petra, Wadi Rum, Dana) onto the arrive or depart day; if no clean swap exists the plan gets the '+1 day' message.
- Within a day, order places nearest-neighbour from the previous base.
- `PETRA_TOO_SHORT` → give Petra its own day (move the other place).
- `LONG_TRANSFER` → choose the leg's private driver / transfer option (fallback legs: "Private driver day"). A transport issue is **resolved** once its leg has a fixer-chosen option that doesn't need public transport and `arrivesOk !== false`.
- After fixing, re-run the check on the fixed days. Every leg in the fixed plan gets an `option` with cost. **Fixed score** = 100 − 1 × (number of legs whose chosen option is `est`, i.e. price not yet verified), min 80, while issues = 0 (reference case: 6 est legs → 94). If issues remain, use the normal score formula.

### 4.5 Jordan Pass (`pass.js`)
nights = days − 1. Separate cost = visa 40 + Σ tickets of covered places in the trip (Petra priced by number of days containing Petra: 50/55/60). Pass tier by Petra days (Wanderer 70 / Explorer 75 / Expert 80). If nights ≥ 2 (`minNightsForVisaWaiver`; jordanpass.jo: "stay a minimum of two nights (3 days)"): savings = separate − tier (visa waived; must buy before arrival). If nights < 2: the visa is not waived → compare tier + 40 vs separate; usually "The Pass doesn't pay off for this trip". Only **verified** ticket prices go into the "Bought separately" sum; `est` and unknown (null) prices are skipped and listed as "small entry fees" (honest headline). Card in 03 lists line items like the Figma (reference trip: Visa 40 · Amman Citadel 3 · Petra (2 days) 55 · Wadi Rum protected area 5 · Jerash 10 · Madaba Archaeological Park 3 — all verified 30 Sep 2026 against mota.gov.jo / visitpetra.jo). **Decision:** the Figma shows Wanderer 70 / Petra (1 day) 50 / 103, but Sarah visits Petra on 2 days, so Darb shows the correct Explorer 75 / Petra (2 days) 55 / 116 → Save ~41 JOD (a deliberate correction of the design, mention it to judges; 116 includes Wadi Rum 5 and Madaba 3, officially verified on 30 Sep 2026).

### 4.6 Trip cost (04 sidebar)
Pass price + verified fixed fares (JETT 10) + Σ ranges of est options → "Estimated total 305–385 JOD" for the reference trip (Explorer 75 + JETT 10 ✓ + transfers est. 220–300) as a range. With a car: + "Car hire (fuel not included) est. 25–30 JOD × days". Note: "Excludes camp, meals and small site fees."

## 5. Screens — behaviour

**01 Landing (index.html)** — hero ("Your Jordan plan, reality-checked."), CTA *Paste your plan* → plan.html, *Build a plan* → build.html; full-bleed background video; live demo card = Sarah's 5-day plan run through the real engine (not a picture), in its own section over Petra by Night directly below the hero. Sections: How it works (3 steps over Wadi Rum with sand dust, id `how`), Jordan Pass (id `pass`, over the Dead Sea: tiers, included sites, Sarah's live receipt, rules), (the Figma's "Why plans break" cards were removed by the owner on 30 Sep 2026 in the design review), For hostels (id `hostels`, over the Aqaba marina: compact card "Check a guest’s plan at the front desk", desk licence 25 JOD/month planned for a later phase as in the documentation, prefilled contact mailto), footer "Every price and schedule shows its last-verified date."

**02 Input (plan.html)** — tabs Paste / Build with questions (link to build.html). Textarea pre-filled with Sarah's example (placeholder button "Use example"). Selects: arrival airport, month, travelers, budget, optional start date; car toggle. Live parse preview. **Check my plan →**: parse → check → save trip (`source:"paste"`) → log `check` event → go to `check.html?t=<id>`. Right dark panel "What we check for every day" (5 rows).

**03 Reality Check (check.html)** — load trip by `?t=`. Title, meta line, counts pills. Score ring (colored by score: <60 amber-red, 60–84 amber, ≥85 green) with headline ("This plan won't work as written" / "Almost there" / "Ready to travel"). Day cards; nf/risky cards expand with Why + "Choose a fix" (Recommended / More relaxed cards; choosing one marks it and the Fix-all card shows the resulting score and day count). Sidebar: Your route SVG map, Jordan Pass card, dark "Apply recommended fixes" card with **Fix all → {newScore}/100** → run fixer, save new trip with `parentId`, log `fix` event, go to fixed.html. A transport issue links to leg.html.

**04 Fixed plan (fixed.html)** — day cards with items (icon, label, sub, right-side cost; verified shows green "10 JOD ✓", est in amber "est. 35–45 JOD"). Sidebar: score 94 "Ready to travel", Trip cost, Weather & what to pack (per place in the trip: seasonal day/night temp + packing tip; if startDate within 7 days fetch Open-Meteo daily max/min for those places and label "Live forecast"), buttons Save & share (opens 06 modal), Add to calendar, Download PDF (`window.print()` with a print stylesheet), Back to Reality Check.

**05 Leg detail (leg.html)** — "← Back to Day N", eyebrow "DAY 3 · TRANSPORT LEG", title From → To, context line, red banner if no public transport (use leg.evidence), options table (Option / Time / Cost / Arrives / Notes), recommended row highlighted, "Use recommended option" (returns to check.html with that fix selected), "Compare on map" (opens Google Maps directions URL in new tab — just a link, no API key), plus an "On Google Maps" card with a key-less Google Maps `<iframe>` embed of the directions (`maps.google.com/maps?…&output=embed`; no Maps JavaScript API — an iframe is plain HTML like Google Fonts). check.html has the same embed for the whole route behind a "Show Google Maps" button (third "Google" tab on mobile). Footnote about est. prices.

**06 Save & Share modal (in fixed.html)** — link `https://<host>/t/<id>` + Copy link; Download PDF; Save offline (service worker caches this trip + shell, show "Saved — opens with no signal"); Email to me (`mailto:` with link); Calendar: Google (calendar.google.com/calendar/render?action=TEMPLATE… for the whole trip), Apple / .ics (download: one all-day event per day + one timed event per transport leg with departure time, 45-min VALARM, "If you're late:" alternative option in DESCRIPTION). Trip Pass 3.5 JOD → "Unlock" shows a toast "Payments open after launch — everything is free during the competition." Done closes.

**07 Build a plan (build.html)** — interest chips, days, arrival, month, car, pace. "Places that fit your trip" cards from the 12 places ranked by interest match + reachability; label **Fits your trip** (reachable within day budget by public transport/transfer from previous stop) or **Needs +1 day or a car**; "Hidden gem" tag for `hiddenGem`. Add/Remove. Right dark panel "Your plan so far": greedy order from airport (nearest-next), 1 place per day (Petra/Wadi Rum/Dana can take a full day), warnings from the rules engine inline (amber), live draft score. **Build my plan →** saves trip (`source:"build"`) → check.html.

**08 Ministry dashboard (dashboard.html)** — toggle **Demo data / Live data**. Demo = `config/demoStats` (label "All figures on this screen are illustrative demo data."). Live = aggregate `events` from Firestore: plans checked, % with an nf day, top blocked leg, lesser-visited places added (hiddenGem), bar list of blocked legs, table of lesser-visited demand, data freshness computed from legs' `verifiedOn` (<30 d / 30–90 / >90 / unverified), operator updates from `operatorUpdates`. Export CSV button (client-side Blob). Card "Export for MoTA Tourism MIS — feeds the Tourism MIS/Dashboard called for in the National Tourism Strategy 2021–2025 (p.19)".

**admin.html (data owners loop)** — email/password sign-in (Firebase Auth). If `admins/{email}` exists, the console shows an overview strip (stat tiles + freshness bar) and three tabs (Transport legs, Site tickets, Recent changes), each leg/ticket list being a master–detail (search, filter chips, sort, one card per option, sticky save bar, `#leg=<id>` / `#ticket=<id>` hash; list → detail → back on mobile): edit option cost/departs/status/verifiedOn/notes/source/sourceUrl/method (validated by `js/admin-validate.js`, freshness badges, sort by soonest expiry) and, in "Site tickets", `places/{id}.ticket` → save with one guarded `runTransaction` (refused if the doc changed since it was opened) to `legs/{id}` or `places/{id}` + create `operatorUpdates` docs; a History timeline per leg/ticket with a form-only Revert. Otherwise "Your account isn't a data owner yet." Not linked in the main nav (footer link "For data owners").

**trip.html (/t/<id>)** — read-only fixed plan (same renderer as 04 without edit buttons) + "Check your own plan" CTA.

## 6. Reference example (must reproduce)
```
Day 1 – Arrive in Amman. Visit the Citadel and the Roman Theatre.
Day 2 – Drive or take a bus to Petra. Explore the Siq and the Treasury.
Day 3 – Morning at Petra, then head to Wadi Rum for a sunset jeep tour and desert camp.
Day 4 – Visit Jerash in the morning and float in the Dead Sea in the afternoon.
Day 5 – Madaba mosaics and Mount Nebo, then fly home.
```
Settings: AMM, October, 1 adult, mid-range, no car → Day 3 **nf** (Petra→Wadi Rum, no public transport, sunset), Day 4 **risky** (Jerash + Dead Sea zigzag), others OK → **58**. Day 4 is risky twice over (ZIGZAG + LONG_TRANSFER from Wadi Rum) — still one risky day. Fix all → transfer on Day 3; Day 4 = private driver Wadi Rum → Dead Sea → Madaba; Jerash moved to Day 5 before the flight → 6 est legs → **94**. Jordan Pass: Petra on 2 days → Explorer 75 vs 116 bought separately (visa 40 + Petra 2-day 55 + Jerash 10 + Citadel 3 + Wadi Rum 5 + Madaba Archaeological Park 3) → **save ~41 JOD**.
Add `tests.html` (open in browser) that runs this and a few more cases with `console.assert` and shows pass/fail.

## 6b. Requirements from the Phase 1 documentation (`docs/PixelsDev_Darb_Documentation_EN.pdf`)
The documentation is judged against the product — these must hold:
- A `verified` value whose `verifiedOn` is older than **90 days** is shown as `est.` (engine downgrades it; dashboard freshness uses the same cut-offs).
- `.ics` events use `TZID=Asia/Amman`; one event per day + one per leg; 45-min VALARM; "If you're late:" alternative in DESCRIPTION.
- Empty or non-travel text → clear message ("We couldn't find any Jordan places…") + link to Build a plan; never a fake result.
- Build a plan output scores **90+** (test it).
- Post-trip leg confirmation on trip.html ("Was this transport there? yes / no" → `confirmations`).
- On mobile the route map is its own tab/section, not squeezed beside the days.
- Stack differences vs the documentation (Node/Supabase/Google Maps/AI parsing → Firebase + rule-based parser with user confirmation) are required by Phase 2; say so in README and to the judges. AI parsing is deferred; the parser never guesses.

## 7. Conventions
- ES modules, no globals, small pure functions in `engine/` (no DOM there) so they're testable.
- All Firestore reads go through `data.js` / `store.js`.
- Money always "JOD", ranges as `est. 35–45 JOD`. Dates "24 Sep".
- Every page: `<meta name="description">`, real headings, `lang="en"`.
- Accessibility: buttons are `<button>`, focus styles visible, color is never the only signal (pills have ✓ ! ✕).

## 8. Commands
```bash
firebase deploy --only hosting            # site
firebase deploy --only firestore:rules    # rules
firebase deploy --only firestore:indexes  # composite indexes (operatorUpdates History)
node scripts/seed.mjs diff                # read-only: JSON vs live (owner edits marked)
node scripts/seed.mjs pull                # live legs/places -> public/data/*.json (then render-destinations + tests + commit)
node scripts/seed.mjs                     # (re)seed reference data; refuses if it would overwrite owner edits
node scripts/seed.mjs --merge             # seed but keep owner-edited fields (options / ticket) live
node scripts/seed.mjs --force             # seed and overwrite owner edits
node scripts/seed.mjs admin someone@x.com # add a data owner
python3 -m http.server -d public 8080     # quick local preview (deploy is what counts)
firebase serve --only hosting             # local preview WITH cleanUrls + /t/<id> rewrite (port 5000)
```
Live URL: https://darb-pixelsdev.web.app

Tests (all engine logic): `node -e "import('./public/js/test-cases.js').then(async m=>{const f=p=>JSON.parse(require('fs').readFileSync('public/data/'+p));const {places,airports}=f('places.json');for(const r of m.runCases({places,airports,legs:f('legs.json').legs,pass:f('jordan-pass.json')}))console.log(r.ok?'PASS':'FAIL',r.name)})"`. Otherwise there is no test runner — open `/tests.html` in a browser (either server above) and read the pass/fail list plus the console. Engine modules are pure, so a single function can also be tried from the browser console (`await import('/js/engine/rules.js')`).

## 9. Gotchas
- `python3 -m http.server` ignores `firebase.json`: `/plan` (no `.html`) and `/t/<id>` 404 there. Link pages as `plan.html` / `check.html?t=…`, and use `firebase serve` to test the share link.
- `scripts/seed.mjs` is dev-only Node (not shipped). It reads the access token from `~/.config/configstore/firebase-tools.json` (needs `firebase login`) and writes whole docs to `places`, `legs`, `config/*`. The default seed **refuses** if a live doc has an owner-edited field (`options` / `ticket`, from `operatorUpdates`) that differs from the JSON; use `diff` / `pull` to bring the edits into git, `--merge` to keep them live, or `--force` to overwrite them. It never deletes docs removed from the JSON.
- Airports (`AMM`, `AQJ`) live in `places.json` under `airports` but are seeded to `config/airports`, not `places`. Leg `AMM-amman` connects the airport.
- Leg options may have `cost: null` (price unknown) — handle it everywhere costs are summed or displayed.
- Only 16 legs exist; most pairs (e.g. Wadi Rum → Dead Sea in the reference case) go through the §4.2 fallback, so the fallback is on the critical path for the 58 → 94 result.
- Jordan Pass: see the decision in §4.5 (Explorer 75 / 116, not the Figma's Wanderer). `jordan-pass.json` also has `petraSeparateJod.sameDayNoOvernight: 90`, not yet used by the spec.
- `sw.js` is served `no-cache` (firebase.json); bump the cache name in it whenever shipped assets change, or users keep the old shell.
- Cache bumps: `SHELL` (`darb-shell-vN`) in `sw.js` for any shipped file change (and regenerate its `JS-LIST` when a JS file is added or removed); `CACHE_KEY` (`darb:data:vN`, 6 h TTL) in `js/data.js` when the reference-data shape changes or a re-seed must reach returning visitors at once. Details in `docs/HANDOVER.md`.
- Admin edits live only in Firestore until `node scripts/seed.mjs pull` copies them into `public/data/*.json` and `node scripts/render-destinations.mjs` re-renders `destinations.html` (rendered from the JSON); commit the result. Run `seed.mjs diff` before any seed.
- CI turns red from 2026-12-23: verified values older than 90 days fail `check-data.mjs` (JETT 24 Sep, the rest 30 Sep). Re-verify per `docs/DATA_VERIFICATION.md`.
