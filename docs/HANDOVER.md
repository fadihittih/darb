# Darb — handover

State at handover: 30 Sep 2026, `main` after the admin sprint (last code commit `00faeaa`; earlier state `1b3e884`),
service worker `darb-shell-v13`, reference-data cache `darb:data:v3`, 70 / 70 engine tests passing (`node scripts/run-tests.mjs`
also runs the 20 seed-helper tests in `scripts/test-seed.mjs` and prints a suffix only if they fail), data check green.
Firestore composite indexes for `operatorUpdates` were deployed on 30 Sep 2026.
The admin (data-owner) panel was reworked in that sprint (backlog #1–#8). **Its signed-in save paths have not been run
against the live project** (see the [admin section](#admin-panel--current-state-and-backlog), which is the most detailed part
of this document).

Binding rules for every change are in [CLAUDE.md](../CLAUDE.md) §0. The ones people break most often:

- Only HTML, CSS, JavaScript and Firebase. No framework, no bundler, no npm packages in `public/`.
- Rule 5: no institution names and no member names anywhere in the site or repo. Write `<repo>` for local paths.
- A ✓ appears only on `status: "verified"`. Everything else shows `est.` and a range.

Contents

1. [What Darb is and where it runs](#what-darb-is-and-where-it-runs)
2. [Architecture in one page](#architecture-in-one-page)
3. [Runbook](#runbook)
4. [Data model and data process](#data-model-and-data-process)
5. [Decisions made on 29–30 Sep 2026](#decisions-made-on-2930-sep-2026)
6. [Known limitations and deferred items](#known-limitations-and-deferred-items)
7. [Admin panel — current state and backlog](#admin-panel--current-state-and-backlog)
8. [Judging talking points](#judging-talking-points)

---

## What Darb is and where it runs

Darb reality-checks a Jordan itinerary against verified local data and fixes it:

1. The traveller pastes a plan (or builds one).
2. Darb gives it a Reality Score out of 100.
3. Each day is marked OK, Risky or Not feasible, with a reason, a fix and a cost in JOD.
4. **Fix all** produces a corrected plan with every transport leg costed.
5. The plan can be saved as a private link, a PDF or a calendar.

Every decision comes from a rules engine in the browser. No AI is involved.

| Item | Value |
|---|---|
| Live URL | https://darb-pixelsdev.web.app |
| Repository | the team's public GitHub repository (the `origin` remote, see `git remote -v`); branch `main` |
| Firebase project id | `darb-pixelsdev` |
| Firestore | `(default)` database, location `eur3` |
| Firebase services used | Hosting, Cloud Firestore, Authentication (email/password). **Not** used: Storage, Functions, Analytics, App Check. |
| Hosting root | `public/` (`firebase.json`) |
| Clean URLs | `cleanUrls: true`, so `/plan.html` is served as `/plan` (a 301 from the `.html` form) |
| Rewrite | `/t/**` → `/trip.html` (the shared read-only plan) |
| Cache headers | `sw.js` and every `**/*.@(js\|css\|html\|json)` are sent with `Cache-Control: no-cache` (ETag revalidation), so a deploy is picked up on the next load |
| Build step | none. The files in `public/` are the shipped files. `scripts/*.mjs` are dev-only Node helpers and are never served. |
| Firebase SDK | 11.0.2 from `https://www.gstatic.com/firebasejs/11.0.2/…` (app, firestore, auth) |
| Third-party calls (no keys) | Open-Meteo (forecast, sunset), Frankfurter (EUR/USD hint), key-less Google Maps `<iframe>` embeds, Google Fonts |

---

## Architecture in one page

```
pages (public/*.html)            page modules (js/pages/*.js)           engine (js/engine/*.js, pure, no DOM)
index.html   01 Landing    ──►   landing.js ─┐                          parser.js   text → days[]
plan.html    02 Input      ──►   plan.js     │                          rules.js    check(trip, model) → score, days, issues, pass
check.html   03 Check      ──►   check.js    │  ui/*.js (nav, pills,    fixer.js    fix(trip, model) → fixed plan
fixed.html   04 Fixed + 06 ──►   fixed.js    ├─ day-card, modal, toast,  pass.js     Jordan Pass calculator
leg.html     05 Leg detail ──►   leg.js      │  sticky-cta, icons, dom)  builder.js  Build-a-plan ranking, layout, draft score
build.html   07 Build      ──►   build.js    │  render/fixed-plan.js    model.js    buildModel(raw, today), resolveLeg, 90-day staleness
dashboard.html 08          ──►   dashboard.js│  share.js ics.js map.js  geo.js      haversine, road factor, bearings
trip.html    /t/<id>       ──►   trip.js     │  weather.js fx.js        format.js   JOD, durations, dates, tripEnded
destinations.html          ──►   destinations.js (static, pre-rendered by scripts/render-destinations.mjs)
admin.html   data owners   ──►   admin.js ───┘
                                      │
                    data.js (places / legs / config)      store.js (trips / events / confirmations)
                                      │                                  │
                 Firestore → localStorage cache → /data/*.json    Firestore (create-only)
```

**The honesty rule is enforced in one place.** `model.js` `freshen()` turns any `verified` value whose `verifiedOn` is
missing or older than 90 days (`STALE_DAYS`) into `est` with `stale: true`. Every renderer then shows a ✓ plus the date
only for `status === "verified"`. Everything else shows `est. a–b JOD` (amber). `cost: null` means "price unknown", and
every sum skips it. The same 90-day cut-off feeds the dashboard freshness buckets (< 30 d, 30–90 d, > 90 d, unverified)
and `scripts/check-data.mjs` in CI.

### How a pasted trip flows

1. **plan.html**
   - `parse(text, model)` builds the live preview ("We read 5 days: …", plus "Not covered yet: …"). Nothing is guessed:
     unknown words are ignored.
   - **Check my plan** runs `check()`, then `saveTrip({source: "paste", …})` (a new `trips/{12-char id}` doc), then
     `logEvent("check")`, then opens `check.html?t=<id>`.
   - Save times out after 10 s. If it fails, the trip goes to `sessionStorage["darb:pending"]` and the page opens with
     `?local=1`.
2. **check.html**
   - `loadTrip(id)` returns the cached `localStorage["darb:trip:<id>"]` first; trips are immutable, so the cache is
     always correct.
   - `loadTrip` returns `null` when the trip is not found and `undefined` on a network error. The page shows "not found"
     for `null` and a Try-again card for `undefined`.
   - The check is re-run with the current model. Fix cards (Recommended / More relaxed) change `chosen`.
   - **Fix all** runs `fix()`, saves a **new** trip with `parentId`, calls `logEvent("fix")`, then opens
     `fixed.html?t=<newId>`.
3. **fixed.html** renders through `render/fixed-plan.js`:
   - day items, a cost card (Pass, verified fares, est. ranges, car hire, and an FX hint from `fx.js`), and a weather
     card (`weather.js`),
   - the Save & Share modal (`share.js`): copy the link `/t/<id>`, print to PDF, Save offline (posts `cache-trip` to
     the service worker), email, WhatsApp / Web Share, Google Calendar, and `.ics` (`ics.js`, `TZID=Asia/Amman`,
     45-min VALARM).
4. **/t/<id> → trip.html** uses the same renderer, read-only.
   - After the trip has ended (`tripEnded`, Amman date) it asks "Was this transport there?" per leg and writes to
     `confirmations`.
   - `localStorage["darb:confirm:…"]` remembers which answers were already given.
5. **leg.html** (`?t=&day=&leg=`) shows every option for one leg and a Google directions embed.
   - "Use recommended option" re-opens the Reality Check with that choice selected. On a fixed plan it opens the check
     the plan was fixed from (`parentId`); on a built plan with no parent it is hidden.

**Build path (build.html, `engine/builder.js`).**
- Interests, days, airport, month, car and pace feed `rankPlaces` → `fitInfo` ("Fits your trip" / "Needs +1 day or a car",
  "Hidden gem") → `greedyOrder` → `layoutDays` → `draftPlan` (live draft score).
- The state is kept in `localStorage["darb:build:v1"]`.
- **Build my plan** runs `fix()`, then logs `build`:
  - if the fixed plan is issue-free, Darb saves a trip with both `check` and `fixed` and opens **fixed.html** (score 90+);
  - otherwise it saves a plain check and opens check.html. See the rulings below.

**Landing demo.** The hero card runs the reference plan through the real engine. Its "Fix all → 94" button writes the
parent trip, then the fixed trip and a `fix` event, and opens the fixed plan.

**Dashboard (dashboard.html).**
- **Demo** reads `config/demoStats` (with `/data/demo-stats.json` as fallback) and is always labelled "demo data".
- **Live** aggregates `events` (`orderBy createdAt desc, limit 2000`; if that query fails it falls back to reading all
  events):
  - plans = `check` + `build` events;
  - "% with an infeasible day" = events with `blockedLegs.length > 0`;
  - top blocked leg = the mode of `blockedLegs`;
  - lesser-visited = `hiddenGem` place ids found in any event;
  - freshness comes from the model;
  - operator updates are grouped by the `operatorUpdates.operator` field.
- CSV export is a client-side Blob with a formula-injection guard.

**Offline (`public/sw.js`).**
- **Pages:** network-first with a 4 s timeout. Pages are cached by extensionless path, because cleanUrls 301s the
  `.html` form.
- **Assets:** `js`, `css`, `json`, `svg` and `png` are network-first too.
- **Firebase SDK:** cache-first in a separate vendor cache.
- **Saved trips:** `/t/<id>` goes to `darb-trips` when the traveller taps Save offline.
- **Not intercepted:** Firestore, Open-Meteo, fonts and Google Maps.
- **Not precached, on purpose:** admin and dashboard page code.

### Caches and version keys — when to bump each

| Key | Where | What it holds | Bump when |
|---|---|---|---|
| `darb-shell-vN` (now v13) | `public/sw.js` `SHELL` | app shell: pages, CSS, `/js/**` (the `JS-LIST` block), `/data/*.json`, icons | **any** shipped file in `public/` changes. When a JS file is added, renamed or removed, also regenerate the `JS-LIST` (`find public/js -name '*.js'`, minus admin / dashboard). `admin-validate.js` **is** in the list, because `test-cases.js` (which the landing and plan pages import) imports it; `pages/admin*.js` are not. `activate` deletes older `darb-shell-*` caches. |
| `darb:data:vN` (now v3) | `public/js/data.js` `CACHE_KEY` (localStorage, 6 h TTL) | the reference data (places, legs, airports, Jordan Pass) as last read from Firestore | the **shape or meaning** of reference data changes (new legs, new keywords, new fields the engine reads), or a re-seed must reach returning visitors at once. Otherwise edits arrive within 6 h anyway. |
| `darb:fx:v1` | `public/js/fx.js` (localStorage, 24 h TTL) | the Frankfurter EUR/USD rates | only if the cached shape changes (`validRates`). |
| `darb-vendor-v1` | `public/sw.js` `VENDOR` | Firebase SDK modules from gstatic, cache-first | the SDK version changes. Change every `11.0.2` URL in the repo and `SDK_PREFIX` together. Note that `activate` only deletes old `darb-shell-*` caches, so add a cleanup for old vendor caches at that point. |
| `darb-trips` | `public/sw.js` `TRIPS`, `public/js/share.js` | pages of trips saved offline (`/t/<id>` + `/trip`) | normally never (trips are immutable). Rename it and add a cleanup only if `trip.html` changes incompatibly. |
| `darb:trip:<id>` | `store.js` (localStorage) | trip docs already loaded | never (immutable) |
| `darb:build:v1` | `pages/build.js` | the Build-a-plan state | the stored state shape changes |
| `darb:wx:<…>` | `weather.js` (6 h TTL) | Open-Meteo responses | the cached shape changes |
| `darb:pending` (sessionStorage), `darb:plan-draft`, `darb:dashboard:mode`, `darb:confirm:<…>` | page modules | a local trip that has not been saved, the textarea draft, the Demo/Live toggle, answered confirmations | — |

---

## Runbook

### Run locally

```bash
python3 -m http.server -d public 8080   # quick preview → http://localhost:8080
firebase serve --only hosting           # WITH cleanUrls and the /t/<id> rewrite → http://localhost:5000
```

Things to know about local runs:

- **`python3 -m http.server`** ignores `firebase.json`, so `/plan` and `/t/<id>` return 404 there. Link pages as
  `plan.html` and `check.html?t=…`.
- Python's simple server has also been seen to drop parallel ES-module requests: the page stays blank or an import
  hangs. Reload, or use `firebase serve`.
- Use `firebase serve` for anything that involves the share link, cleanUrls or the service worker's offline fallbacks.
- **Local pages read Firestore**, not `public/data/*.json`, and cache the result in localStorage for 6 h. To try
  JSON edits locally before seeding, run this once in the page's devtools console, then reload:

  ```js
  const { loadSeed } = await import("/js/data.js");
  localStorage.setItem("darb:data:v3", JSON.stringify({ at: Date.now(), raw: await loadSeed() }));
  ```

  Use the current `CACHE_KEY` from `data.js` if it has been bumped since.
- A service worker from an earlier visit can serve old files. In devtools, use Application → Service workers →
  "Update on reload", or unregister it.

### Tests and checks

| Command | What it does |
|---|---|
| `node scripts/run-tests.mjs` | all engine cases from `public/js/test-cases.js` (including the admin validator, freshness and history cases) + the data check + the seed-helper tests; exit 1 on any failure. Prints `70 / 70 passed · data check ok`; the seed helpers are silent unless they fail (then it appends `· seed helper tests FAILED`). Set `DARB_TODAY=YYYY-MM-DD` to run the data check as of another date. |
| `node scripts/test-seed.mjs` | the 20 unit tests of the pure helpers in `scripts/seed-lib.mjs` (value conversion, diff, owner fields, merge mask, argument parsing). Prints `seed helpers: 20 / 20 passed`. Needs no login and no network. |
| the Node one-liner in [CLAUDE.md](../CLAUDE.md) §8 | the same cases without the data check |
| `/tests.html` (local or live) | the same cases in the browser, with a pass / fail list and console asserts |
| `node scripts/check-data.mjs` | every `verified` value in `places.json` and `legs.json` has an `https://` `sourceUrl`, a `verifiedOn` within 90 days (−1 day tolerated for UTC runners) and a known `method` (`web`, `web-est`, `phone`, `field`, `whatsapp`, `operator`). Set `DARB_DATA_DIR` to check another folder. |
| `node scripts/check-contrast.mjs` | WCAG contrast of the text tokens in `public/css/tokens.css` on their backgrounds (all pairs ≥ 4.5:1) |

The engine tests pin today to `2026-09-29`, so they do not age. The data check does.

### Seed, deploy, push

```bash
node scripts/run-tests.mjs                 # must be green
node scripts/seed.mjs diff                 # read-only: what differs between public/data and the live project (needs no login)
node scripts/seed.mjs pull                 # only if diff shows owner edits: copy live legs / places into legs.json / places.json
node scripts/render-destinations.mjs       # only if places.json / legs.json changed (rewrites public/destinations.html)
# bump SHELL in public/sw.js (any shipped file changed); bump CACHE_KEY in public/js/data.js if the data shape changed
node scripts/seed.mjs                      # only if public/data/*.json changed; refuses if it would overwrite owner edits
firebase deploy --only hosting             # site
firebase deploy --only firestore:rules     # only if firestore.rules changed
firebase deploy --only firestore:indexes   # only if firestore.indexes.json changed
git push                                   # CI runs on push
```

Recommended order after data owners have used `/admin`: `diff` → `pull` (or `--merge`) → `render-destinations.mjs` →
`run-tests.mjs` → review the git diff and commit → deploy → `git push`.

Seed script commands (`scripts/seed.mjs`, helpers in `scripts/seed-lib.mjs`):

| Command | What it does |
|---|---|
| `node scripts/seed.mjs diff` | Read-only. Lists every seed doc that differs from the live one (per field path), marks docs with owner edits, and lists live-only `legs` / `places` docs. Reads the public collections over REST, so it needs no login. |
| `node scripts/seed.mjs pull` | Writes the live `legs` and `places` back into `public/data/legs.json` and `places.json` (keeping their formatting), including live-only docs. Then run `render-destinations.mjs` and the tests, review the diff and commit. It never writes to Firestore. |
| `node scripts/seed.mjs` | Seeds `places`, `legs` and `config/{airports,jordanPass,demoStats}`. **Refuses** (exit 1) if a live doc has a field that a data owner edited in `/admin` and that differs from the JSON, and prints the fields and the three ways out. |
| `node scripts/seed.mjs --merge` | Seeds everything, but for a doc with owner edits it writes only the fields that are not owner-edited (an `updateMask`), so the live `options` (legs) or `ticket` (places) stay as they are. A doc where every field is owner-edited is skipped. |
| `node scripts/seed.mjs --force` | Seeds and **overwrites whole docs**, including owner edits (it prints them first). |
| `node scripts/seed.mjs admin owner@example.com` | Adds a data owner to `admins`. |
| `--dry-run` | Added to any writing form (or to `pull`): prints what would be written and commits nothing. |

Arguments are parsed strictly: an unknown command or option, `--merge` with `--force`, or `--merge` / `--force` with
`diff`, `pull` or `admin` exits with code 2 and the usage line.

- **How "owner-edited" is decided.** The script reads `operatorUpdates` and takes the top-level field of each logged
  `field` (for example `options[2].cost` → `options`, `ticket.jod` → `ticket`) for the doc named by `legId` or `placeId`.
  A field counts only if a logged update touched it. Anything an owner changed without a log entry (for example in the
  console) is not protected. Entries with a malformed `field` are skipped with a warning.
- **`--force` still overwrites**, and the script **never deletes** docs that were removed from the JSON.
- The seed script uses your `firebase login` token, read from `~/.config/configstore/firebase-tools.json`, for writes.
  Owner rights bypass the security rules. `DARB_DATA_DIR` points it at another data folder.
- **Re-render destinations:** `node scripts/render-destinations.mjs` pre-renders the 12 cards and the JSON-LD into
  `public/destinations.html` from the **JSON files, not Firestore**. Commit the output and bump the SW shell. Owner edits
  therefore reach `/destinations`, `public/data/*.json` and the offline fallback only after `seed.mjs pull` +
  `render-destinations.mjs` have been run and committed.
- The two composite indexes (`firestore.indexes.json`) were deployed on 30 Sep 2026. A new project needs
  `firebase deploy --only firestore:indexes` once, or the History disclosure in `/admin` uses its slower client-side
  fallback.

### CI

`.github/workflows/tests.yml` runs on every push and pull request. It uses Node 20 and runs
`node scripts/run-tests.mjs` (engine cases + data check) and `node scripts/check-contrast.mjs`.

**CI will turn red on 2026-12-23** and stay red until the values are re-verified or downgraded:

- JETT Amman → Petra was verified on 24 Sep 2026 and passes 90 days on 23 Dec.
- Every value verified on 30 Sep 2026 expires on 29 Dec.

The same dates change the live site, because the engine downgrades stale values. A probe with the current data gives:

| As of | Reference check | Fixed score | Jordan Pass saving |
|---|---|---|---|
| 1 Oct 2026 | 58 | 94 | 41 |
| 24 Dec 2026 | 58 | **93** (JETT becomes est.) | 41 |
| 30 Dec 2026 | 58 | 93 | **20** (ticket prices become est. and leave the "bought separately" sum) |

To re-verify, follow [DATA_VERIFICATION.md](DATA_VERIFICATION.md) and log each value in
[data/verification-log.md](data/verification-log.md).

### Add a data owner

1. In the Firebase console, add a user under Authentication → Users with email and password. Email/password sign-in was
   enabled by hand in the console; it cannot be enabled from the CLI on this plan.
2. Run `node scripts/seed.mjs admin owner@example.com`. This writes `admins/<lower-cased email>`, which is the allowlist.
3. The owner signs in at `/admin` (the footer link "For data owners").

A demo data-owner account `jett@darb.demo` exists and is on the allowlist. Its password is not in the repo; ask the team.
To check the editor without signing in, open `/admin?debug=1`: it shows a read-only preview of `public/data/legs.json`
and never writes.

---

## Data model and data process

### Collections

| Collection | Written by | Rules (see [firestore.rules](../firestore.rules)) |
|---|---|---|
| `places/{id}` (12) | `seed.mjs`; `/admin` (the `ticket` object only) | public read; write if `isAdmin()` (no field validation in the rules) |
| `legs/{id}` (16) | `seed.mjs`, `/admin` | public read; write if `isAdmin()` (no field validation in the rules) |
| `config/airports`, `config/jordanPass`, `config/demoStats` | `seed.mjs` | public read; write if `isAdmin()` |
| `operatorUpdates/{auto}` | `/admin` | public read; create if `isAdmin()` (no key validation); no update or delete rule, so both are denied |
| `admins/{email}` | `seed.mjs admin` only | read only by the signed-in user whose token email equals the doc id; client writes denied |
| `trips/{12-char id}` | client (create-only) | `get` public, `list` denied. Keys ⊂ `title, source, rawText, settings, days, check, fixed, score, createdAt, parentId, lang`; `days` ≤ 21; `rawText` ≤ 8000; no update or delete |
| `events/{auto}` | client (create-only) | keys ⊂ `type, score, scoreAfter, days, car, month, blockedLegs, riskyLegs, places, createdAt`; `type` ∈ check, fix, build |
| `confirmations/{auto}` | client (create-only) | keys ⊂ `tripId, legId, answer, createdAt`; `answer` ∈ yes, no; `legId` ≤ 80 chars |

**`operatorUpdates` doc.** Written by `/admin`, one per changed field, in the same transaction as the edit:
`operator`, `legId`, `field`, `from`, `to`, `fromValue`, `toValue`, `by` (email), `at` (server time). Ticket edits also carry
`placeId` and `legId: ""`.

- `field` is `options[i].<name>` for a transport option or `ticket.<name>` for a site ticket.
- `from` and `to` are display strings (a cost reads `20–25`, an empty value is `""`).
- `fromValue` and `toValue` are the JSON values: a cost is `[min, max]` or `null`, a ticket price a number or `null`, every
  other field a string or `null`. History's Revert reads them. Rows written before this sprint have none, so they cannot
  be reverted.
- Two composite indexes (`firestore.indexes.json`): `legId` ascending + `at` descending, and `placeId` ascending + `at`
  descending. They serve the per-leg and per-ticket History.

`isAdmin()` is `request.auth.token.email` existing as a doc id in `admins`. `store.js` picks only the allowed keys and
strips `undefined` and `NaN` before every write.

**Leg doc.** Fields: `id` (`<from>-<to>`), `from`, `to`, `driveMin`, `publicTransport`, `options[]`. Optional fields:
`oneWayVerified`, `timeSensitive`, `evidence`, `warning`.

- `publicTransport` is `scheduled`, `limited` or `none`.
- Legs are symmetric: `model.js` indexes both directions. When a leg has `oneWayVerified`, the reversed scheduled option
  loses its departure time and its ✓.

**Option.** Fields: `mode`, `label`, `cost` (`[min, max]` or `null`), `status` (`verified` or `est`), `durationMin`.
Optional fields:

- schedule: `departs`, `arrives`, `returnLabel`;
- display: `costUnit`, `costText`, `durationText`, `notes`;
- engine flags: `recommended`, `arrivesOk`, `requiresCar`;
- evidence: `verifiedOn`, `source` (text, owner-editable in `/admin`, max 200 characters), `sourceUrl`, `method`;
- `operator` (today only on the JETT options).

**Place doc.** Fields: `id`, `name`, `nameAr`, `lat`, `lng`, `keywords[]`, `interests[]`, `minHours`, `hiddenGem`,
`climate`, `packing`, and `ticket`. The `ticket` object holds `jod`, `status`, `verifiedOn`, `source`, `sourceUrl`,
`method`, `coveredByJordanPass`, `label` and `notes`. `/admin` edits `jod`, `status`, `verifiedOn`, `notes`, `source`,
`sourceUrl` and `method`; `label` and `coveredByJordanPass` are shown read-only.

**`config/jordanPass`** (from `jordan-pass.json`) holds `visaJod` 40, `minNightsForVisaWaiver` 2, `tiers`
(Wanderer 70 / Explorer 75 / Expert 80), `petraSeparateJod` (1/2/3 days 50/55/60, `sameDayNoOvernight` 90) and `_meta`.

### Verified vs est. — the process

The full process is in [DATA_VERIFICATION.md](DATA_VERIFICATION.md).

- **verified = source + date + method.** A value needs a `sourceUrl` (https), a `verifiedOn` date and a `method` from
  web, phone, field or operator. `whatsapp` quotes and `web-est` (one operator's own page, not an official tariff) stay
  `est`.
- The verbatim quote for every value is in [data/verification-log.md](data/verification-log.md), and the proposed patches
  are in `docs/data/verified-patch*.json`.
- There is no scraping. Every check is a manual, dated read.

**Sources used (pass of 30 Sep 2026):**

- Ministry of Tourism fee table (mota.gov.jo, page dated 29 Sep 2026): site entry fees.
- visitpetra.jo: Petra 50 / 55 / 60, same-day 90, opening hours.
- jordanpass.jo (Prices, FAQs, Included Attractions): tiers, the visa-waiver rule, covered sites.
- The Land Transport Regulatory Commission's licensed-line fare list (ltrc.gov.jo PDF): minibus and bus fares.
  **It gives fares only, never timetables.**
- sariyahexpress.com: the Airport Express fare and timetable, kept in the notes.
- The JETT booking system: one manual check with a screenshot on 24 Sep 2026. The public site shows times and fares only
  inside the booking form.

**Verified today:**

- **Leg options (6):**
  - JETT Abdali → Wadi Musa 06:30, 10 JOD (24 Sep);
  - Airport Express 3.4 JOD;
  - LTRC minibus fares: Amman → Jerash 1.10, Amman → Madaba 0.60, Amman → Kerak 2.30, Amman → Dead Sea rest house 0.95.
- **Tickets (9):** Amman Citadel 3, Jerash 10, Ajloun 3, Umm Qais 5, Madaba Archaeological Park 3, Petra 50 (55 / 60 for
  2 / 3 days), Wadi Rum protected area 5, Dana 8 (+16 % tax in notes), Kerak 2.
- **Jordan Pass tiers, visa and nights rule:** confirmed on jordanpass.jo on 30 Sep. These live in config and are not
  freshened by the engine.

**Still `est.`, and why:**

| Value | Why it is still est. |
|---|---|
| Transfers, private drivers and taxis (Petra → Wadi Rum, Wadi Rum → Aqaba, Amman → Dead Sea, …) | No official tariff exists. Ranges come from operators' own pages or guides (`web-est`), or are the team's estimates. |
| Every §4.2 fallback leg (e.g. Wadi Rum → Dead Sea) | Priced by formula: 0.30–0.40 JOD per km, minimum 15 / 20. |
| Airport taxi at QAIA | qaiairport.com returned 403; no official fare page was found. |
| JETT Amman → Aqaba (8–12) | The fare is shown only inside the booking form. |
| Rum Bus shuttle (10 JOD) | One operator's own site. |
| Dead Sea (Amman Beach) day use, St George's Church fee, Aqaba beaches, As-Salt | No official page. |
| Minibus times and durations | No published timetable ("leaves when full"). Darb never invents a `departs`. |
| Rental car (25–30 per day + fuel) | Estimate. |

The phone and field checklist for these values is at the end of the verification log.

### The Jordan Pass numbers (reference trip)

Petra is on 2 days, so the correct tier is **Explorer 75**. Bought separately:

| Item | JOD |
|---|---|
| Visa | 40 |
| Amman Citadel | 3 |
| Petra, 2 days | 55 |
| Wadi Rum protected area | 5 |
| Jerash | 10 |
| Madaba Archaeological Park | 3 |
| **Total** | **116** |

116 − 75 = **save ~41 JOD**. Only verified ticket prices enter the sum.

- **Sources:** the MoTA fee table, visitpetra.jo Petra Fees, and jordanpass.jo Prices and FAQ.
- **The 2-night rule:** jordanpass.jo says "stay a minimum of two nights (3 days)", so `minNightsForVisaWaiver: 2`.
  Below 2 nights the visa is not waived, and the card usually says the Pass doesn't pay off.
- **The Figma difference:** the Figma shows Wanderer 70 / 103. That is a deliberate correction ([CLAUDE.md](../CLAUDE.md) §4.5).

---

## Decisions made on 29–30 Sep 2026

These rulings were recorded in the build ledgers. They are paraphrased below with the reason each was made.

**Process**
- Work directly on `main` and deploy and push after every milestone, because rule 3 wants the live site and the repo
  current. A worktree would have delayed deploys.
- Pages were built in parallel by several agents. Each agent owned its own files, and shared files (`app.css`, `ui/*`,
  `store.js`) were changed only by the controller, to avoid merge conflicts.
- Implementers never ran `firebase deploy`, `seed.mjs` or `git push`. The controller did, at checkpoints.
- The research pass (A8b) wrote only the log and a patch file, and the patch was applied later in a separate step, so
  two agents never edited `places.json` or `legs.json` at once. For the same reason the CSS-only tasks ran alongside the
  engine chain, while tasks that touched the same page JS or `test-cases.js` ran in sequence.
- B1 (SEO), B5 (PWA) and B8 (fonts) were done by one implementer as a "head pack", because all three edit every HTML
  `<head>`.
- The design pass (group E) was delegated to one agent to save controller context. Its rejections are logged in
  [design/critique-2026-09-30.md](design/critique-2026-09-30.md) as "reject (rule 4)".
- A one-character desktop-nav hotfix (`+` → `~` in `app.css`) was applied directly by the controller, because a new
  sibling element had broken the selector on every page.

**Firebase and infrastructure**
- Firebase Auth could not be enabled from the CLI or REST without billing, so Email/Password was enabled by hand in the
  console and a demo data owner was added.
- The service worker caches the gstatic Firebase SDK cache-first in its own vendor cache. `store.js` and
  `firebase-init.js` were left unchanged, so saved trips open offline. The cost is about 1 MB of cache.
- The git author and GitHub account name were not rewritten. They are account metadata rather than site or repo
  content, and rewriting pushed history on deadline day was too risky. This was left to the team.

**Build a plan**
- Build my plan saves a fixed trip and opens the Fixed plan directly. The Phase 1 documentation says a built plan
  "starts at 90+ and continues to the same Fixed Plan screens"; opening check.html would have shown about 72.
- A plan that still has Not-feasible or Risky days after fixing is saved as a plain check and opens check.html.
- "Fits your trip" is false without a car when the leg from the nearest chosen stop has no public transport and takes
  more than 60 min, or takes more than 240 min. This matches Figma 07, where Wadi Rum after Petra is "Needs +1 day or a
  car".
- The builder produces structurally clean days: no pairing on arrive or depart days, and pairs that would overload or
  zigzag are skipped. That way `fix()` keeps the greedy order.

**Engine and parser**
- In the parser, a hyphen drops the first place only when it equals yesterday's last place ("Jerash-Ajloun" keeps both).
  "to" and arrows always drop the origin.
- Day titles that use the traveller's own words were done as task C1.
- The risky-only headline is "Almost there".
- An SEO score of 63 on the noindex trip pages is expected, because they are private links.

**Data (the honesty rule over matching the design)**
- Verified fees that enter the Jordan Pass sum are adopted even though they move the reference numbers away from the
  design. The user approved this at 01:15 on 30 Sep.
- The official visa-waiver rule of 2 nights is adopted (jordanpass.jo Prices and FAQ).
- Wadi Rum 5 and Madaba Archaeological Park 3 are adopted as verified. This moves the reference trip to 108 → 116 and
  save 33 → 41. The tests and CLAUDE.md were updated to match.
- Dana is stored as 8 JOD with "+16 % sales tax" in the notes. A derived 9.3 would be less faithful to the official
  table. The Ministry's 8 is kept over the tourism board's 10, and the note mentions both.
- The second research pass was applied. `amman-dead-sea` became `publicTransport: "limited"` with a verified LTRC
  minibus option (no timetable, not recommended), because real data beats the old "none". A plan that says "bus to the
  Dead Sea" is therefore no longer Not feasible.
- The Rum Bus shuttle was added as an `est` (`web-est`) option on Petra → Wadi Rum, not recommended, because it comes
  from one operator's own site. Keeping it on a `publicTransport: "none"` leg is consistent: it is a private shuttle,
  not scheduled public transport.
- The JETT `sourceUrl` stays `jett.com.jo`, the booking entry point, and the `source` text states the 24 Sep
  booking-form screenshot check.

**Maps**
- Key-less Google Maps `<iframe>` embeds were added on the leg page and, on demand, for the whole route on check.
  Mobile gets a third "Google" tab. The Maps JavaScript API is not used, so there is no key and no billing, and the
  engine never uses Google's times.

---

## Known limitations and deferred items

Every item below was recorded as deferred in a ledger or review and is still open after the admin sprint, unless it is marked
otherwise. The plan's own "Deliberately left out" list is at the end of
[superpowers/plans/2026-09-30-improvements.md](superpowers/plans/2026-09-30-improvements.md).

### Engine

| Item | File | Fix idea |
|---|---|---|
| The fixer looks up `choices` by the original day numbers. After an added night or a reorder, a chosen fix can be dropped. | `js/engine/fixer.js` | Key choices by leg id (from~to) instead of day number. |
| Build → fix can choose a long detour. For Amman, Petra, Wadi Rum, Jerash and Dead Sea, the fixed plan runs Jerash → Wadi Rum (about 5 h 50, est. 125–165) and back north. The rules hold (94, 0 issues). | `js/engine/builder.js`, `fixer.js` | Add a km tie-break to `greedyOrder` and to the swap search. |
| `greedyOrder` is not biased toward the departure airport. | `js/engine/builder.js` | Add a penalty for the distance to `departAirport` on the last day. |
| The "+1 day" message is followed by an option-change line, and there is a soft preference for Amman on Day 1. | `js/engine/fixer.js` | Order the change messages and drop the redundant line. |
| Trailing prose after the last day ("Tips: bring cash for the Dead Sea and Jerash") is read as part of that day. | `js/engine/parser.js` | Stop the last chunk at a `Tips:` / `Notes:` / `---` heading. |
| A range longer than 7 days is cut silently ("Days 1-10" gives 7). | `parser.js` `MAX_RANGE` | Show the cut in the preview. |
| URLs and hashtags can match place keywords. | `parser.js` | Strip URLs and `#tags` in `normalize`. |
| Deliberately left out of the improvements plan: `travelers` and `budget` do not affect costs; no clock-time buckets for SEASON; no `LONG_DRIVE` rule for car trips; "Day one" written as words; "Bus back to Amman" returns; per-day DAY_OVERLOAD text; the 150-min label on fallback drivers. | rules, fixer, parser | Each one changes engine output broadly. Add tests first. |
| Petra opening hours (winter hours from 2 Oct 2026) are verified in the log but no rule uses them. | `rules.js` | A late-arrival rule for Petra. |
| The Petra card reads "Needs 5 h from Umm Qais" in one builder case because of the greedy order. | `builder.js` / `pages/build.js` | Word it relative to the chosen day. |

### UI

| Item | File | Fix idea |
|---|---|---|
| The hostels "Get in touch" link mails `hello@darb.app`, a domain the team does not own. | `public/index.html` | Use a team address, or a mailto without a recipient. |
| A verified ✓ sits next to durations that are not sourced (e.g. minibus "1 h 15 min, 0.95 JOD ✓", Airport Express "1 h"). | `pages/leg.js`, `scripts/render-destinations.mjs` | Put the ✓ right after the fare, or drop the duration from verified lines. |
| On the Petra → Wadi Rum leg, the prefix "No public transport" is arguable now that the Rum Bus option exists. | `legs.json` `evidence`, `rules.js` copy | Say "No scheduled public transport". |
| Dashboard Live counts lesser-visited sites from `fix` events too (double count). "% with an infeasible day" uses `blockedLegs`, so it misses a Not-feasible DAY_OVERLOAD day. "This month" headings are not actually filtered by month. | `pages/dashboard.js` | Count only check and build; add an `nfDays` field or use `score`; filter by `createdAt` or rename the headings. |
| Dashboard: dead freshness branches, and a small race between the sub line and the Demo/Live toggle. | `pages/dashboard.js` | Remove the dead branches; token-guard the sub line. |
| Retry is a full page reload (Try again). | `check.js`, `fixed.js`, `landing.js` | Re-run the load in place. |
| Modal uses `100vh` (should be `dvh`), has no drag-to-close, and does not set the background `inert`. The toast has no live region. `body { overflow-x: hidden }` can hide overflow bugs. | `public/css/app.css`, `ui/modal.js`, `ui/toast.js` | Low severity a11y and CSS clean-up. |
| No nav active state or scroll-spy; no print footer; static nav/footer HTML; JSON-LD upgrades; CSV file name. | various | Low severity (plan "Deliberately left out"). |
| WhatsApp share uses a generic icon; share errors other than Abort are silent. | `js/share.js` | Add a toast on error. |
| `.demo-score.good` has no CSS; `#stepper` / `#interests` min-heights can leave gaps at 400–600 px; cold-font CLS on build is about 0.2. | CSS | Polish. |
| No scroll padding for the sticky bar, and the bar has no region label. | `ui/sticky-cta.js`, `app.css` | Add `scroll-padding-bottom` and `aria-label`. |
| 404 styles live in `destinations.css`; the render script imports `public/js` modules. | `scripts/render-destinations.mjs` | Cosmetic. |

### Data

| Item | File | Fix idea |
|---|---|---|
| The values in "Still est." above: airport taxi, transfers, drivers, Amman Beach, St George's, minibus times. | `public/data/*.json`, verification log | Phone, WhatsApp and field checks (checklist in the log). Record them as `method: phone / whatsapp / field`. |
| Madaba's sum excludes Mount Nebo (3 JOD, not in the Pass). This is disclosed. | `places.json` | Keep as is, or add a separate Nebo line. |
| Airport Express `durationMin` is not taken from the quote; the Kerak minibus has no duration (`durationText` "To verify"). | `legs.json` | Field check. |
| `petraSeparateJod.sameDayNoOvernight: 90` is verified but not used by the spec. | `pass.js` | Use it for trips with 0 nights. |
| Every verified value expires between 23 and 29 Dec 2026 (see CI above). | data, CI | A re-verification pass before 23 Dec. |

### Ops

| Item | Fix idea |
|---|---|
| **The git author and the GitHub account name are a personal name**, which conflicts with rule 5 in spirit. This was left to the team. | `git config user.name "PixelsDev"` for future commits; move the repository to a team account or organisation. Rewriting pushed history is optional and risky. |
| **Live dashboard counts are inflated by test trips.** Testing created many trips and events (for example repeated Petra → Wadi Rum blocks), and each landing "Fix all" click writes 2 trips + 1 event. The collections are create-only, so the client cannot delete them. | Tell judges that Live includes test traffic. Delete test docs in the console (owner rights) if needed, or add a `test: true` flag in a future events schema. |
| **The key-less Google Maps embeds are unofficial.** `maps.google.com/maps?saddr=…&daddr=…&output=embed` is not a documented API and could stop working. | If it breaks, keep the "Compare on map" link, which always works, or move to the Maps Embed API with a restricted key. |
| **Firebase Storage evidence upload is not implemented.** Evidence screenshots exist only as notes in the log; the rules sketch is in DATA_VERIFICATION.md. | See the admin backlog below. |
| **Auth had to be enabled by hand** in the console, and a new project needs the same step. | Document it in the setup (done above). |
| `operatorUpdates` is **empty** on the live project (checked through the public REST read), so no data-owner edit has been saved in production yet. The signed-in save paths of `/admin` (leg save, ticket save, History with real rows, Revert, the refresh after a save) have **not been run against the live project**: nobody with data-owner credentials was available during the sprint. They are covered by unit tests of the pure logic and by code review only. | Sign in with a real data-owner account and run the checklist under "Suggested next sprint" below. |
| Deliberately left out: lazy Firebase Auth / third-party cookies, versioned immutable caching, Firebase Analytics, App Check, Remote Config, OSRM, Nominatim, Leaflet, QR codes, Arabic UI. | Post-competition; App Check enforcement can take the site down if it is misconfigured. |
| The SW swallows a late `waitUntil` after the timeout, and asset fallbacks don't strip `?query`. | Minor `sw.js` hardening. |
| A trip saved locally in `darb:pending` can be overwritten by the next local trip (only when Firestore saves fail). | Key by a temporary id. |

---

## Admin panel — current state and backlog

### What `/admin` does today

Files:

- `public/admin.html`: the shell (title "Data owners"; sections `#auth`, `#gate`, `#legs`, `#tickets`);
- `public/js/pages/admin.js`: sign-in, allowlist check, the transport-leg editor, freshness header and sort;
- `public/js/pages/admin-common.js`: shared pieces: `TODAY` (Amman date), `CHANGED`, `freshBadge`, `freshSummary`, and
  `saveWithLog` (the guarded transaction);
- `public/js/pages/admin-tickets.js`: the "Site tickets" section;
- `public/js/pages/admin-history.js`: the History disclosure and Revert;
- `public/js/admin-validate.js`: the pure rules (no DOM, no Firebase), unit-tested in `test-cases.js`. Exports
  `validateOption`, `validateTicket`, `freshness`, `sameData`, `parseUpdateField`, `revertInputs`, `updateWhat`,
  `METHODS`, `VERIFIED_METHODS`;
- `public/css/pages/admin.css`.

The page is linked only from the footer ("For data owners") and is `Disallow`ed in `robots.txt`.

1. **Sign-in.**
   - An email/password form (`signInWithEmailAndPassword`), driven by `onAuthStateChanged`. The signed-in view shows the
     email and a Sign out button.
   - Auth error codes map to plain messages. For example `auth/configuration-not-found` shows "Sign-in isn't switched on
     for this project yet".
   - The Firebase Auth and Firestore SDKs are imported lazily from gstatic 11.0.2.
2. **Allowlist check.**
   - `getDoc(admins/<email lower-cased>)`. If the doc is missing, or the read is denied, the page shows "Your account isn't
     a data owner yet." with "Ask the Darb team to add <email>".
   - Other errors show "Couldn't load your data".
3. **`?debug=1`.**
   - Skips sign-in and renders `public/data/legs.json` and the tickets from `public/data/places.json` (the seed, not
     Firestore) read-only: inputs, Save and Revert are disabled.
   - Nothing is written. The History disclosures still read the live public `operatorUpdates`.
4. **Transport legs.**
   - `getDocs(legs)`, sorted by id. One collapsible card per leg, with the summary "From → To · publicTransport". Place
     names come from `loadModel()`; the page falls back to ids.
   - A table row per option, with these fields:

   | Field | Input | Stored as |
   |---|---|---|
   | Cost min, Cost max | `type=number`, `min=0`, `step="any"` (decimals such as 0.95 and 1.10 are valid) | `cost: [min, max]`, or `null` when both are empty |
   | Departs | text `HH:MM` | `departs` (deleted when empty) |
   | Status | select verified / est. | `status: "verified" \| "est"` |
   | Verified on | `type=date` | `verifiedOn` (deleted when empty) |
   | Notes | text, max 300 | `notes` |
   | Source | text, max 200 | `source` (deleted when empty) |
   | Source URL | `type=url`, max 300 | `sourceUrl` |
   | Method | select —, web, phone, field, whatsapp, operator, web-est | `method` |

5. **Site tickets** (`#tickets`, below the legs).
   - One collapsible card per place (12), sorted by name, editing `places/<id>.ticket`. Fields: Price (JOD), Status,
     Verified on, Method, Source, Source URL, Notes. `label` and "covered by the Jordan Pass" are shown read-only. An
     empty price is stored as `null` (price unknown).
   - A note says that ticket prices feed the Jordan Pass card and that a change reaches travellers within 6 hours.
   - The same rules, warnings, freshness badges, guarded transaction and History as the legs (below).
6. **Validation** (`validateOption` / `validateTicket` in `admin-validate.js`; the first error per card is shown under
   its Save button, prefixed with the option or ticket label):
   - A number input that is not a valid number is rejected (`badInput`, checked in the page).
   - Options: both costs or neither; costs finite and ≥ 0, min ≤ max. Tickets: a price of 0 or more, or empty.
   - `departs` must match `^([01]\d|2[0-3]):[0-5]\d$`.
   - `status` must be `verified` or `est`. `verifiedOn` must be a real `YYYY-MM-DD` date (2026-02-31 is rejected).
   - `verified` requires a Verified-on date **that is not in the future** (Amman date), an `https://` Source URL, and a
     method from **web, phone, field or operator**. `whatsapp` and `web-est` can only be saved as est.
   - Source URL, if present, must be `https://…`. Method must be in `METHODS`, the same list as
     `scripts/check-data.mjs`. The Source text is at most 200 characters (checked only when the text changed, so a longer
     legacy text cannot block an unrelated edit).
   - **Warnings** never block a save. They are shown under Save, prefixed "Check:":
     - a verified date older than 90 days ("travellers will see it as est. until it is re-checked");
     - Verified-on or Source URL changed while the Source text is non-empty and unchanged ("update it so it matches the
       new date or URL").
7. **Freshness.**
   - A badge under each Verified-on input: `✓ verified 75 d ago · expires in 15 d` (fresh), `!` (expires within 30 days),
     `✕ stale — shown as est.` (older than 90 days or no date), `✕ date is in the future`, or `est.`. The mark is not the
     only signal: the text says the same.
   - A header line above the legs, and one above the tickets: "N values expire in the next 30 days · N stale · N dated
     in the future", or "Every verified value is good for more than 30 days."
   - A Sort select on the legs: Route (A–Z) or Soonest expiry (stale and undated first). It reorders the existing cards,
     so unsaved input survives.
   - Badges and header reflect the stored data and refresh after a save, not live form input.
8. **Save** (`saveWithLog` in `admin-common.js`; the same for legs and tickets).
   - The form is compared with the loaded doc field by field. If nothing changed, the page shows "No changes to save".
   - Otherwise it runs **one `runTransaction`**: it re-reads the doc, and refuses if the live `options` (leg) or `ticket`
     (place) no longer equal the snapshot the form was built from (`sameData`, key order ignored). The message is "This
     leg changed since you opened it — reload the page to see the latest, then redo your edit." (or "This ticket …").
     If they match, it writes `update(<doc>, { options })` or `update(<doc>, { ticket })` (the whole array or object) and
     one `operatorUpdates` doc per changed field, all or nothing.
   - The log entry is `{ operator, legId, field, from, to, fromValue, toValue, by, at: serverTimestamp() }`, plus
     `placeId` for a ticket (with `legId: ""`, so the dashboard grouping still works). `operator` is the option's
     `operator` field (only the JETT options have one) or, failing that, the domain of the signed-in email (for example
     `darb.demo`); for tickets it is the email domain.
   - On success the page shows "Saved · shown on the dashboard" (legs) or "Saved · travellers see it within 6 hours"
     (tickets). `permission-denied` shows "Your account isn't allowed to change this data." Any other failure shows "Couldn't
     save. Check your connection and try again."
9. **History and Revert** (`admin-history.js`; one disclosure at the bottom of every leg and ticket card).
   - Opening it loads the last 50 `operatorUpdates` of that leg (`where legId == id`) or ticket (`where placeId == id`),
     newest first (`orderBy at desc`), shown as date and time (Amman), who, what, and from → to (an empty value reads
     *empty*). If the composite index is missing (`failed-precondition`), it falls back to an equality-only query sorted in
     the browser, so it still works. Empty state: "No changes recorded yet." Error state: "Couldn't load the history."
   - **Revert** appears on a row only if it has `fromValue` (rows written before this sprint have none). It **only refills
     the form** with the earlier value, scrolls to it and shows a toast; nothing is saved until the owner reviews and presses
     Save. It is disabled in `?debug=1`. If the option no longer exists, the toast says so.
   - A successful save dispatches a `darb:saved` event on the card, which reloads an open History (a closed one reloads
     on its next open).
10. **Where an edit shows up:**
    - Traveller pages read Firestore through `data.js`. A returning visitor keeps their localStorage copy for **up to
      6 h** (`darb:data:v3`), so an edit reaches them within 6 h, and new visitors at once. A ticket edit changes the
      Jordan Pass card the same way.
    - The dashboard's Live operator-updates card shows the edit.
    - **An edit does not reach** `/destinations` (static HTML rendered from the JSON), the offline fallback
      `public/data/*.json`, or the SW-cached `/data/*.json`, until `node scripts/seed.mjs pull` +
      `node scripts/render-destinations.mjs` are run and the result is committed and deployed. The default seed now
      **refuses** rather than erasing an owner edit (see "Seed, deploy, push").

**Verification status.** The rules (`admin-validate.js`), the seed helpers and the pure history helpers are unit-tested
(`run-tests.mjs`). The read-only `?debug=1` view was checked in a browser (badges, header, sort, 12 ticket cards, History
fallback query against the live public collection, layout at narrow width). The **signed-in save paths** (leg save, ticket
save, the transaction and its guard, History with real rows, Revert, the refresh after a save) were **not run against the live
project**; they are covered by tests of the pure logic and by code review only.

### What it cannot do

- It cannot edit **Jordan Pass config** (tiers, visa, the nights rule, the Petra multi-day prices) or **airports**.
- It cannot **add or remove legs or options**, or edit `label`, `mode`, `durationMin` / `durationText`, `arrives`,
  `costUnit`, `publicTransport`, `evidence`, `timeSensitive`, `recommended`, `arrivesOk` or `requiresCar`. Tickets: not
  `label` or `coveredByJordanPass`.
- It cannot **upload evidence** (screenshots or photos). Firebase Storage is not set up.
- It does not **show traveller confirmations** ("Was this transport there?") for a leg.
- It has **no roles**. Every allowlisted account can edit every leg and ticket; a JETT account can change a reserve's prices.
- The concurrency guard covers only the doc's own field (`options` or `ticket`). It does not cover a change to another
  field of the same doc made outside `/admin`.
- It has **no password reset**, and `onUser` has no supersede token: a slow load for one user can render after a
  sign-out. Writes would still be denied by the rules.
- Revert is form-only and per field. There is no "undo this save" that writes in one click.
- History reads only the last 50 changes of one leg or ticket, and it does not show changes made outside `/admin`.
- The rules do no schema validation (below), so the client validator is the only guard.
- The signed-in paths are untested against the live project (see "Verification status" above).

### Rules that constrain it

- `legs`, `places` and `config`: `allow write: if isAdmin()`, with **no schema or field validation**. `admin-validate.js`
  is the only guard. A signed-in admin using the SDK directly could write any shape, including one that breaks the engine.
- `operatorUpdates`: `allow create: if isAdmin()`, with no key validation (so `placeId`, `fromValue` and `toValue` are
  accepted, and so is any other key or a wrong `by`); update and delete are denied (append-only log); read is public.
- `admins/{email}`: readable only by that user; not writable from the client (`seed.mjs admin` uses owner credentials).
  The doc id must equal the Auth token email exactly. `seed.mjs` lower-cases it, and Firebase Auth normally does too.
- `firestore.indexes.json` holds the two `operatorUpdates` indexes for History (deployed on 30 Sep 2026).
- There is no `storage.rules` file and no `storage` block in `firebase.json`.

### Prioritised backlog

Effort is S (≤ 2 h), M (half a day) or L (1–2 days). Every item must keep the hard rules: plain ES modules, SDK only from
gstatic 11.0.2, tokens only in the CSS, and no emoji. Every item also needs a `darb-shell` bump if it changes a shipped
file (admin page code is not precached, but `admin.html` and the CSS are). Add Node tests for any pure logic you extract.

**P0 — protect owner edits and data integrity**

| # | Item | Effort | Files | Notes |
|---|---|---|---|---|
| 1 | **Seed-vs-live diff and merge**, so `seed.mjs` stops overwriting owner edits | M | `scripts/seed.mjs` | **Done.** `diff`, `pull`, `--merge`, `--force`, `--dry-run`, a refusing default and strict arguments in `scripts/seed.mjs`; helpers in `scripts/seed-lib.mjs`, 20 tests in `scripts/test-seed.mjs`. Verified by unit tests only for the writing forms; no writing seed was run in the sprint. Original brief: Add `node scripts/seed.mjs diff` (reads the live docs over REST and prints the fields that differ from the JSON), `--merge` (for docs that have `operatorUpdates` newer than the JSON, skip or merge them using an `updateMask` that leaves owner-edited fields alone) and `pull` (writes live `legs` back into `public/data/legs.json`, so the repo, `/destinations` and the offline fallback catch up; then run `render-destinations.mjs`). Keep `seed.mjs` dev-only. |
| 2 | **Extract validation into a pure module and test it** | S | new `public/js/admin-validate.js` (or `engine/`-style pure file), `pages/admin.js`, `test-cases.js`, SW `JS-LIST` if the module is shared | **Done.** `public/js/admin-validate.js` (`validateOption`, `validateTicket`), tested in `test-cases.js`; it is in the SW `JS-LIST`. Verified by tests. Original brief: `collect()` mixes DOM reads with rules. Move the rules (cost pair, HH:MM, verified needs date + https + method, allowed methods) into `validateOption(old, input) → {option, changes} \| {error}` and add cases. |
| 3 | **Freshness warnings for owners** | S | `pages/admin.js`, `css/pages/admin.css`, reuse `daysSince` / `STALE_DAYS` from `engine/model.js` | **Done.** Badges, header summary and Soonest-expiry sort (checked in the `?debug=1` view); a future date is an error for verified values and a date older than 90 days is a warning. Original brief: A per-option badge ("verified 12 d ago · expires in 78 d", "stale — shown as est."). Warn on a future date or one older than 90 days (the deferred B9 item). Offer a leg sort by soonest expiry, and a header count "3 values expire in the next 30 days". |
| 4 | **Concurrency guard** | S | `pages/admin.js` | **Done, by code review only.** `saveWithLog` uses `runTransaction` with a guard; the pure comparison (`sameData`) is tested, the transaction itself was not run against the live project. Original brief: Use `runTransaction`: re-read `legs/<id>`, compare it with the snapshot the form was built from, and refuse with "This leg changed since you opened it — reload" if it differs. The batch semantics stay the same. |
| 5 | **Decimal fares and machine-readable log values** | S | `pages/admin.js`, `pages/dashboard.js` (reader) | **Done.** `step="any"`; `operatorUpdates` now carry `fromValue` / `toValue` next to `from` / `to`. The dashboard still reads the display strings. Verified by tests of the pure change list; the write was not run live. Original brief: Use `step="any"` on the cost inputs. Store `from` and `to` as JSON-safe values: keep the display string and add `fromValue` / `toValue`, or write `"20-25"`. The rules allow any keys on `operatorUpdates` today. |
| 6 | **`source` text follows `sourceUrl` and date** | S | `pages/admin.js` | **Done.** The Source text is editable, with a non-blocking warning when the date or URL changes and the text does not. Verified by tests. Original brief: Make `source` editable, or clear it (with a warning) when `sourceUrl` or `verifiedOn` changes, so a stale sentence can never sit next to a new date. |

**P1 — the edits owners actually need**

| # | Item | Effort | Files | Notes |
|---|---|---|---|---|
| 7 | **Ticket editing for places** | M | `pages/admin.js` (new "Site tickets" section), `admin.css`, `firestore.rules` (optional field validation) | **Done; the save is verified by tests and review only.** "Site tickets" section in `pages/admin-tickets.js` with `validateTicket`; logs `placeId`, `legId: ""`, `field: "ticket.<name>"`. The optional rules validation was not done (see #11). The read-only view was checked in a browser; a ticket save was not run live. Original brief: Edit `places/{id}.ticket` fields `jod`, `status`, `verifiedOn`, `sourceUrl`, `method`, `notes` (`label` read-only). Apply the same validation and the same `writeBatch`, and log `operatorUpdates` with `placeId` (plus `legId: ""` so the dashboard grouping still works). The rules already allow admin writes to `places`. Warn that these prices change the Jordan Pass card. |
| 8 | **Change history per leg or place, with revert** | S–M | `pages/admin.js`, `firestore.indexes.json` | **Done; real rows are verified by tests and review only.** `pages/admin-history.js`, form-only Revert, two indexes in `firestore.indexes.json` (deployed 30 Sep 2026), client-side fallback if the index is missing. The fallback path ran against the live empty collection; the ordered query, a real Revert click and the refresh after a save were not run live. Original brief: A "History" disclosure listing `operatorUpdates where legId == id orderBy at desc limit 50`. This needs a composite index (`legId` asc, `at` desc) in `firestore.indexes.json`, deployed with `firebase deploy --only firestore:indexes`. "Revert" pre-fills the form from `from` (needs #5). |
| 9 | **Role per operator** (JETT sees only its legs) | M | `scripts/seed.mjs` (`admin <email> --operator JETT --role owner\|team`), `firestore.rules`, `legs.json` (`owners: ["JETT"]` per leg), `pages/admin.js` | Rules sketch: `let a = get(/databases/$(database)/documents/admins/$(request.auth.token.email)).data; allow update: if a.role == 'team' \|\| (a.operator in resource.data.owners && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['options']));`. The client filters legs by `owners`. Places get `owners` too, for reserves (RSCN, PDTRA). |
| 10 | **Traveller confirmations per leg** | S | `pages/admin.js` | `confirmations` is publicly readable. Show yes / no counts from the last 90 days per leg, so owners and the team know what to re-check first (DATA_VERIFICATION.md "Traveller confirmations"). |
| 11 | **Schema validation in the rules** | S–M | `firestore.rules` | For `legs` updates: `affectedKeys().hasOnly(['options'])`, `options is list`, `options.size() <= 10`. For `operatorUpdates` creates: `keys().hasOnly([...])`, `by == request.auth.token.email`, `at == request.time`. Per-option deep checks are limited in rules (there are no loops), so the client validation (#2) stays the main guard. |
| 12 | **Audit CSV export** | S | `pages/admin.js` (or `dashboard.js`), a shared CSV helper | Export `operatorUpdates`. Reuse the dashboard's formula-injection guard (move it to a small `js/csv.js`, and add it to the SW list if a traveller page imports it). |
| 13 | **Password reset and session polish** | S | `pages/admin.js` | Add a "Forgot password?" link that calls `sendPasswordResetEmail`, and a supersede token in `onUser`. Show the owner's operator and role once #9 exists. |

**P2 — bigger features**

| # | Item | Effort | Files | Notes |
|---|---|---|---|---|
| 14 | **Evidence upload to Firebase Storage** | L | `firebase.json` (`"storage": {"rules": "storage.rules"}`), new `storage.rules`, `pages/admin.js`, `pages/leg.js`, `scripts/render-destinations.mjs`, SW vendor list (`firebase-storage.js`, only if a traveller page needs it) | First, enable Storage in the console, and check the plan: new default buckets may require the Blaze plan. Upload to `evidence/<legId\|placeId>/<YYYY-MM-DD>-<i>.<ext>` with the SDK from gstatic 11.0.2. Save `evidenceUrl` on the option or ticket, and show "Evidence ↗" next to "Source ↗". Rules, from DATA_VERIFICATION.md: public read; write only if `request.auth != null && firestore.exists(/databases/(default)/documents/admins/$(request.auth.token.email)) && request.resource.size < 2 * 1024 * 1024 && request.resource.contentType.matches('image/.*')`. Add PDF if needed. |
| 15 | **Add and remove options; edit the remaining option fields** | M–L | `pages/admin.js`, validator (#2), `firestore.rules` (#11) | Fields: label, mode (bus / minibus / taxi / driver / car / shuttle), durationMin, durationText, arrives, costUnit, recommended, arrivesOk, requiresCar. Validate that each leg keeps exactly one `recommended` option, that `mode: car` implies `requiresCar`, and that there is no `departs` without a verified source. Changing `recommended`, `arrivesOk` or `requiresCar` changes rule outcomes, so warn on the reference-trip legs (`AMM-amman`, `amman-petra`, `petra-wadi-rum`) that 58 → 94 may move. |
| 16 | **Add and remove legs** | L | `pages/admin.js`, validator, `firestore.rules` | Pick `from` and `to` from places + airports, with id `<from>-<to>`. Refuse a duplicate in either direction, because legs are symmetric. Fields: `driveMin`, `publicTransport` (enum), `evidence`, `timeSensitive`, `oneWayVerified`. Deleting a leg sends that pair back to the §4.2 fallback. Require `seed pull` (#1) afterwards, so the repo, tests and `/destinations` follow. |
| 17 | **Jordan Pass config and airports editing** (team role only) | S–M | `pages/admin.js`, `firestore.rules` (#9 role) | `config/jordanPass`: tiers, `visaJod`, `minNightsForVisaWaiver`, `petraSeparateJod`, each with a source URL and date. High impact: the Pass card and the reference 116 / 41. Ask for confirmation, and show the reference saving before and after. |
| 18 | **Make edits reach the static surfaces** | M | `scripts/render-destinations.mjs`, or `pages/destinations.js` | Either run `seed pull` + re-render after owner edits (a monthly-review step), or have `destinations.js` refresh the verified lines from `loadModel()` after load. The pre-rendered HTML stays for SEO. |

Items #1–#8 were done in the admin sprint of 30 Sep 2026 (plan: [superpowers/plans/2026-09-30-admin-sprint.md](superpowers/plans/2026-09-30-admin-sprint.md)).
Items #9–#18 are untouched.

Suggested next sprint:

1. **Exercise the signed-in paths end to end with a real data-owner account.** On the live site, sign in at `/admin`, then:
   save one leg edit and one ticket edit; confirm the doc and the `operatorUpdates` rows (with `fromValue` / `toValue`,
   and `placeId` for the ticket) appear; open History and click Revert on a real row; edit the same leg in two tabs and
   confirm the second save is refused; confirm the Live dashboard shows the update; then run `node scripts/seed.mjs diff`
   and `pull` and check they see the edits. Fix whatever breaks. Nothing in the panel's write path has been run live yet.
2. #11 schema validation in the rules (the client validator is the only guard today).
3. #10 traveller confirmations per leg.
4. #12 audit CSV export.
5. #13 password reset and session polish.
6. #9 roles per operator (the largest of these; it needs #11's rules work).

---

## Judging talking points

- **Problem.** AI and blog itineraries break on Jordan's roads. Wadi Rum can't be reached by JETT from Petra for a sunset
  tour, and Jerash plus the Dead Sea in one day zigzags across the country.
- **Demo.** Paste Sarah's 5-day plan and get **58**:
  - Day 3 is Not feasible: no public transport Petra → Wadi Rum, plus a sunset.
  - Day 4 is Risky: a zigzag and a long transfer.
  - **Fix all → 94**: a pre-arranged transfer on Day 3; Day 4 becomes Wadi Rum → Dead Sea → Madaba; Jerash moves to
    Day 5 before the flight. The score is 94 because 6 legs remain est. and one point is taken off for each.
  - Trip cost **305–385 JOD**. **Jordan Pass: Explorer 75 vs 116 bought separately → save ~41 JOD.**
  - Then the share link `/t/<id>`, the calendar (.ics in Asia/Amman) and the PDF.
- **Honesty.**
  - Only values with a source, a date and a method get a ✓: 6 transport options and 9 site tickets, all checked against
    official pages (Ministry fee table, visitpetra.jo, jordanpass.jo, the LTRC fare list, JETT's booking system).
  - Everything else is "est." with a range, and no timetable is ever invented.
  - Verified values expire after 90 days, and CI fails when one does.
  - Dashboard demo figures are labelled "demo data" everywhere.
- **Deliberate correction of the design.** The Figma shows Wanderer 70 / 103. Darb shows Explorer 75 / 116 because Petra
  is on two days, and the ticket prices were verified on 30 Sep 2026. The 2-night visa waiver comes from jordanpass.jo.
- **Three loops.**
  1. The traveller: check, fix, share, then confirm after the trip ("Was this transport there?").
  2. The Ministry dashboard: blocked legs, demand for lesser-visited sites, data freshness, CSV export for the Tourism
     MIS called for in the National Tourism Strategy 2021–2025 (p.19).
  3. Data owners update their own legs and site tickets in `/admin`, with freshness warnings, a change history and a
     save that refuses stale edits. Every change is logged to `operatorUpdates` and shown on the dashboard, and the seed
     script refuses to overwrite owner edits. The signed-in save path has not yet been run on the live project.
- **Firebase used for real.**
  - Hosting (clean URLs, the `/t/<id>` rewrite).
  - Firestore: reference data; private-by-link immutable trips; anonymous events and confirmations; the audit log.
  - Auth for data owners.
  - Security rules with key allowlists and size limits.
  - The rules engine runs in the browser, so there is no server.
- **The stack changed from the Phase 1 document** (Node/Express + Supabase + Google Maps + AI parsing) to Firebase plus a
  rule-based parser that the user confirms, because Phase 2 requires Firebase. The logic and the screens are the same,
  and AI parsing is deferred: the parser never guesses.
- **The Google Maps decision.** Darb's own SVG map shows each day's status. Key-less Google embeds show real directions
  for context, with no API key and no billing. The engine never uses Google's drive times; it uses stored legs and a
  disclosed road-factor fallback.
- **Quality.**
  - 70 engine tests in Node, the browser and CI, plus 20 seed-helper tests in Node and CI.
  - Works offline (service worker), installable (PWA manifest), SEO basics (robots, sitemap, llms.txt, JSON-LD on
    destinations).
  - Accessible: skip link, 44 px touch targets, contrast-checked tokens, and colour never the only signal.
- **Be ready for these questions.**
  - Live dashboard numbers include the team's test traffic.
  - The `operatorUpdates` log is empty until a data owner saves an edit, and the signed-in save paths of `/admin` are covered by tests and code review, not by a live run.
  - The git author and account name are personal; the team is PixelsDev.
