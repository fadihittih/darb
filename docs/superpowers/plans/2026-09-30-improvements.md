# Darb Improvements (post-audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the four 30 Sep audits found (parser misreads, missing departure airport, fixer reshuffles, honesty gaps, mobile CTAs, CLS, contrast, SEO/PWA) without changing Darb's flow, and ship before the 18:00 code freeze (submission 22:00 Amman).

**Architecture:** Darb is plain ES modules served from `public/` on Firebase Hosting. The engine (`public/js/engine/*.js`) is pure and tested in Node through `public/js/test-cases.js` (`runCases`). Engine tasks are TDD: new cases are appended at the end of `runCases`, run with the CLAUDE.md §8 one-liner, then the code changes. UI tasks change one page module + its HTML/CSS and are verified in a real browser (Playwright MCP or chrome-devtools MCP) against `python3 -m http.server -d public 8100`.

**Tech Stack:** HTML, CSS, JavaScript (ES modules, no build), Firebase Hosting + Firestore + Auth (SDK 11.0.2 from gstatic), Open-Meteo (no key), Frankfurter (no key), Node 20 for tests only.

**Spec:** `<repo>/CLAUDE.md` (auto-loaded). Audit sources: `.superpowers/sdd/BUILD_PLAN/reports/audit-engine.md`, `audit-ux.md`, `audit-perf-a11y-seo.md`, `audit-services.md`.

## Global Constraints

Copied verbatim from CLAUDE.md §0, every task implicitly includes these:

1. **Only HTML, CSS, JavaScript and Firebase.** No React/Vue/Svelte, no TypeScript, no Node server, no Supabase, no bundler/build step, no npm dependencies in the shipped site. Plain ES modules loaded from `<script type="module">`. Firebase SDK comes from the gstatic CDN (`https://www.gstatic.com/firebasejs/11.0.2/...`). Google Fonts is fine.
2. **Firebase must be used for real**: Hosting (live URL), Firestore (reference data, saved trips, analytics events), Auth (data-owner admin panel). Deploy with `firebase deploy`. Never rely on localhost.
3. The live site and the GitHub repo must both work when judged. After every milestone: `firebase deploy` and `git push`.
4. **Documentation ↔ design ↔ project must match.** Keep the 8 Figma screens, their flow and concepts (Reality Score, colored days, Jordan Pass card, Leg detail, Save & Share, Build a plan, Ministry dashboard). Improving is allowed; removing a core part is not.
5. No university name and no member names anywhere in the site or repo. Team name "PixelsDev" is allowed.
6. **Honesty in data:** only values with `status: "verified"` get a ✓ and a verified date. Everything else shows `est.` and a range. Dashboard demo numbers must always carry a visible "demo data" label. Never invent schedules.

Plus the controller's rules for every UI task: no framework, no build step, no npm in `public/`, Firebase SDK only from gstatic 11.0.2, no emoji in the UI, colors only via `tokens.css` variables (hex only inside `tokens.css`, `manifest.json` and the Node contrast script), no university/member names, verified ✓ only on `status: "verified"`.

The reference example (CLAUDE.md §6) is sacred: **58 → Fix all → 94, 6 est legs, save ~33 JOD**. Every task ends with the full test run green.

**Who runs what:** the implementer never runs `node scripts/seed.mjs`, `firebase deploy` or `git push`. Those steps are marked **CONTROLLER** and live in the Deploy checkpoint tasks.

**Test command (used in every task, "the test run"):**

```bash
cd <repo> && node -e "import('./public/js/test-cases.js').then(async m=>{const f=p=>JSON.parse(require('fs').readFileSync('public/data/'+p));const {places,airports}=f('places.json');for(const r of m.runCases({places,airports,legs:f('legs.json').legs,pass:f('jordan-pass.json')}))console.log(r.ok?'PASS':'FAIL',r.name)})"
```

Today it prints 17 `PASS` lines. A `FAIL` line is followed in the console by `Assertion failed: <case>, <label>: expected …, got …`.

**Local server (used in UI tasks):** `python3 -m http.server -d <repo>/public 8100` (run in the background). Link pages as `/plan.html`, `/check.html?t=…` (clean URLs and `/t/<id>` only work on Hosting or `firebase serve`).

**Local data gotcha:** pages load places/legs from **Firestore** (cached in `localStorage`), not from `public/data/*.json`. Until the controller re-seeds (Deploy checkpoint A), a local browser sees the old keywords and legs. To try new data locally, run this once in the page's devtools console, then reload:

```js
const { loadSeed } = await import("/js/data.js"); localStorage.setItem("darb:data:v2", JSON.stringify({ at: Date.now(), raw: await loadSeed() })); localStorage.setItem("darb:data:v1", JSON.stringify({ at: Date.now(), raw: await loadSeed() }));
```

## Review Focus

1. **Returning visitors with cached reference data** (`localStorage["darb:data:v1"]`, 6 h TTL) would keep the old keywords (`desert` → Wadi Rum) and miss the new legs after deploy; expected: new data on first visit after deploy. Pinned by Task A8 Step 6 (cache key bumped to `darb:data:v2`) and its browser check.
2. **Trips saved before this release** have no `settings.departAirport` and no `days[].notCovered`; expected: they open on check/fixed/trip exactly as before (departure = arrival airport, no "Not covered" line). Pinned by the `departAirportOf` fallback expectations in Task A2 Step 1.
3. **Markdown + range combinations and number-like prose** (`**Days 1–2: Amman**`, `Day 1 - 2 hours in Amman`); expected: the range expands only when the second number is followed by `:`/`–`/end of line. Pinned by the extra expectations in Task A1 Step 1 ("range edge cases").
4. **Range expansion past 21 days** (`Days 1-7 … Days 22-28`); expected: capped at 21 days, which is what `firestore.rules` allows, so saving never fails. Pinned in Task A1 Step 1.
5. **Third-party APIs blocked or returning junk** (Open-Meteo sunset, Frankfurter); expected: silent fallback (static sunset table, no currency line), never an error or a fake number. Pinned by the malformed-response expectations in Task B2 Step 1 and Task B3 Step 1.

## Task order

A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → **A8b** (edits `legs.json`/`places.json` after A8's new legs, so it must run after A8 and before A9) → A9 → Deploy A → B1 … B8 → **B9** (needs `scripts/run-tests.mjs` from B7 and the `sourceUrl` values logged in A8b) → Deploy B → **E1 … E7** (design pass; after Deploy A, before group C; E8 is a gate step inside every UI task) → C1 … C7 → Deploy C → **D1** → Deploy D. Groups B and E can interleave; E never starts before Deploy A is live.

| Task | Minutes |
|---|---|
| A1 Parser robustness | 45 |
| A2 Departure airport | 30 |
| A3 Arrival-day budget, edge-day guard, honest swap text | 25 |
| A4 "More relaxed" card | 15 |
| A5 Sticky mobile action bar | 30 |
| A6 CLS | 25 |
| A7 Contrast tokens | 20 |
| A8 New est. legs, one-way JETT | 30 |
| A8b Official-source verification pass (web only) | 50 |
| A9 Honesty copy, car hire | 20 |
| A-deploy (controller: seed, deploy, push) | 10 |
| B1–B8 SEO, sunset, currency, share, PWA, links, CI, fonts | 175 |
| B9 Evidence link on every verified value + `check-data.mjs` | 35 |
| B-deploy (controller: seed, deploy, push) | 10 |
| C1–C7 optional polish | 110 |
| C-deploy | 10 |
| D1 Data verification process doc + admin `method` field | 35 |
| D-deploy | 10 |
| E1 Critique → backlog | 20 |
| E2 Polish | 30 |
| E3 Clarify (UX copy) | 20 |
| E4 Harden (edge states) | 25 |
| E5 Adapt (responsive) | 20 |
| E6 Audit follow-ups | 20 |
| E7 Micro-interactions | 25 |
| E8 Impeccable gate (≈ 2 min inside each of 13 UI tasks) | 26 |

Totals: **A ≈ 300 min** (incl. deploy) · **B ≈ 220 min** · **C ≈ 120 min** · **D ≈ 45 min** · **E ≈ 160 min** (E1–E7 160; the E8 gate adds ≈ 26 min spread across A/B/C).

---

## File map

| File | Tasks | Responsibility after this plan |
|---|---|---|
| `public/js/engine/parser.js` | A1, A2, C1 | markers (markdown, emoji, ranges, Arabic-Indic digits), normalisation, not-covered list, origin dropping, airport hints, `departAirportFrom`, `firstSentence` |
| `public/js/engine/rules.js` | A2, A3, A4 | `departAirportOf`, arrival-day hours, "More relaxed" fix copy |
| `public/js/engine/fixer.js` | A2, A3, A9 | depart airport ordering, no full-day place onto edge days, honest swap text, car hire |
| `public/js/engine/model.js` | A8 | one-way-verified legs reversed as est. |
| `public/js/engine/builder.js` | A2 | carries `departAirport` |
| `public/js/engine/format.js` | C4 | `tripEnded` |
| `public/data/places.json` / `legs.json` | A1 / A8 | keywords / 6 new legs + one-way JETT |
| `public/js/test-cases.js` | all engine tasks | test cases |
| `public/js/pages/{plan,check,fixed,build,leg,trip,landing}.js` | A2, A4, A5, A9, B2, B3, B6, C1–C6 | page behaviour |
| `public/js/ui/sticky-cta.js` (new) | A5 | mobile sticky action bar |
| `public/js/ui/nav.js` | C3, C5 | mobile menu, skip link |
| `public/js/weather.js` | B2 | sunset |
| `public/js/fx.js` (new) | B3 | JOD → EUR/USD hint |
| `public/js/share.js` | B4, C2 | Web Share, WhatsApp, start date |
| `public/js/render/fixed-plan.js` | A9, B3 | cost card (car hire, fx slot) |
| `public/css/tokens.css`, `app.css`, `pages/*.css` | A5, A6, A7, B8, C3, C5, C7 | styles |
| `public/*.html` | A2, A6, B1, B5, B8 | heads, skeletons, selects |
| `public/robots.txt`, `sitemap.xml`, `llms.txt`, `og.html`, `og.png`, `manifest.json`, `icon.html`, `icons/*.png` (new) | B1, B5 | SEO / PWA |
| `public/sw.js` | A5, B5, deploy tasks | shell list + version |
| `scripts/render-destinations.mjs`, `public/destinations.html` | A8, B6 | re-rendered cards, official links |
| `scripts/check-contrast.mjs`, `scripts/run-tests.mjs`, `.github/workflows/tests.yml` (new) | A7, B7 | dev-only tooling |
| `CLAUDE.md` | A1, A2, A4, A9 | spec kept in sync with behaviour |
| `docs/data/verification-log.md` (new) | A8b, B9 | one row per checked value: source URL, verbatim quote, date, method |
| `public/data/places.json`, `legs.json`, `jordan-pass.json` | A8b, B9 | confirmed values get `status: "verified"`, `verifiedOn`, `source`, `sourceUrl`, `method` |
| `scripts/check-data.mjs` (new) | B9 | fails when a verified value has no `sourceUrl` or is older than 90 days |
| `public/js/pages/leg.js`, `scripts/render-destinations.mjs` | B9 | "Source ↗" link next to verified values |
| `public/js/pages/admin.js` | B9, D1 | "Source URL" and "Method" fields per option |
| `docs/DATA_VERIFICATION.md` (new), `README.md` | D1 | the verification process |
| `docs/design/critique-2026-09-30.md` (new) | E1–E8 | design critique backlog with accept / reject (rule 4) decisions |

---

# GROUP A, must ship before 18:00, in this order

### Task A1: Parser robustness

Estimated: 45 min.

**Files:**
- Modify: `public/js/engine/parser.js` (whole file replaced)
- Modify: `public/data/places.json` (the `keywords` line of 10 places)
- Modify: `public/js/test-cases.js` (imports, one new exported constant, 9 new cases at the end of `runCases`)
- Modify: `public/js/pages/plan.js:8,104-113` (unusable branch mentions not-covered places)
- Modify: `public/js/pages/check.js:119-158,312` (muted "Not covered yet" line; keep `notCovered` when saving the fixed plan)
- Modify: `public/css/pages/check.css` (one rule)
- Modify: `CLAUDE.md` §3 and §4.1

**Interfaces:**
- Consumes: `shortName(place)` from `engine/model.js`; `model.places[].keywords`.
- Produces (later tasks rely on these exact names):
  - `parse(text, model) → [{ n, title, text, placeIds, notCovered: string[], hints: { mode, times, arrive, depart } }]`
  - `normalize(s) → string`, `findPlaces(chunk, places) → string[]`, `splitDays(text) → string[]`
  - `NOT_COVERED: [{ name, keywords }]`, `notCoveredNames(days) → string[]`
  - `departAirportFrom(days) → "AQJ" | "AMM" | null` (used by Task A2)
  - `previewText(days) → string` (now ends with `· Not covered yet: X, Y.` when relevant)
  - `AUDIT_MARKDOWN` exported from `test-cases.js`

**Why the origin rule is narrower than "any `to` before the second place":** the reference Day 3 is "Morning at Petra, then head **to** Wadi Rum" and yesterday ended in Petra. The literal rule would drop Petra from Day 3 and break 58 → 94. The implemented rule drops yesterday's place only when (a) it is the first place and the text between it and the next place is a bare connector (`to`, `to the`, `→`, `->`, `–`, `–`), or (b) it is preceded by `from` / `depart` / `leave`. That covers every heading form in the audit (`Amman to Petra`, `Wadi Rum to the Dead Sea`, `Amman → Petra`, `from Petra … back to Amman`, `Depart Amman … to Petra`) and keeps the reference intact. When the place is named again later in the chunk (`Amman → Jerash → Amman`) it is moved to the end instead of dropped.

- [ ] **Step 1: Write the failing tests**

In `public/js/test-cases.js`, replace the two import lines

```js
import { parse, isUsable } from "./engine/parser.js";
import { check } from "./engine/rules.js";
```

with

```js
import { parse, isUsable, previewText, findPlaces } from "./engine/parser.js";
import { check } from "./engine/rules.js";
```

Directly above `export const REFERENCE_SETTINGS = …` add (keep the text byte-for-byte; it is audit case 01, ChatGPT's default format):

````js
/** ChatGPT's default markdown format (engine audit, case 01). */
export const AUDIT_MARKDOWN = `# 5-Day Jordan Itinerary

### Day 1: Amman
- **9:00 AM** – Arrive at Queen Alia Airport (AMM) and transfer to your hotel
- **1:00 PM** – Lunch at Hashem Restaurant in Downtown
- **3:00 PM** – Visit the **Amman Citadel** and the **Roman Theatre**
- **7:00 PM** – Dinner on Rainbow Street

### Day 2: Amman to Petra
- **6:30 AM** – Take the JETT bus to Wadi Musa
- **11:00 AM** – Check in at your hotel
- **2:00 PM** – Explore **Petra** – the Siq and the Treasury
- **Evening** – Petra by Night (optional)

### Day 3: Petra to Wadi Rum
- **8:00 AM** – Hike to the **Monastery**
- **2:00 PM** – Transfer to **Wadi Rum**
- **5:00 PM** – Sunset jeep tour
- **Overnight** – Bedouin camp

### Day 4: Wadi Rum to the Dead Sea
- **9:00 AM** – Drive to the **Dead Sea**
- **3:00 PM** – Float in the Dead Sea

### Day 5: Departure
- **10:00 AM** – Visit **Madaba** and **Mount Nebo**
- **6:00 PM** – Depart from Queen Alia Airport`;
````

At the end of `runCases`, directly above `  return results;`, add:

```js
  // ---------- A1 parser robustness (texts from the engine audit) ----------
  const ids = (text) => parse(text, model).map((d) => d.placeIds);

  test("Parser: ChatGPT markdown headings (### Day N: A to B), origin is not a visit", (expect) => {
    const days = parse(AUDIT_MARKDOWN, model);
    expect("5 days, title line ignored", days.length, 5);
    expect("placeIds", days.map((d) => d.placeIds), [["amman"], ["petra"], ["wadi-rum"], ["dead-sea"], ["madaba"]]);
    expect("day 5 depart", days[4].hints.depart, true);
  });

  test("Parser: bold, bullet and emoji day markers", (expect) => {
    expect("bold", ids("**Day 1 – Amman**\nCitadel\n**Day 2 – Petra**\nSiq"), [["amman"], ["petra"]]);
    expect("emoji", ids("📍 Day 1: Amman\n📍 Day 2: Petra"), [["amman"], ["petra"]]);
    expect("bullet", ids("- Day 1: Amman\n- Day 2: Petra"), [["amman"], ["petra"]]);
  });

  test("Parser: day ranges expand (Day 1-2, Days 3–4)", (expect) => {
    expect("Day 1-2", ids("Day 1-2: Amman and Jerash\nDay 3-4: Petra\nDay 5: Wadi Rum"),
      [["amman", "jerash"], ["amman", "jerash"], ["petra"], ["petra"], ["wadi-rum"]]);
    const days = parse("Days 1–2: Amman (Citadel, Downtown), Jerash\nDays 3–4: Petra\nDay 5: Fly home", model);
    expect("Days 1–2 → 5 days", days.map((d) => d.placeIds), [["amman", "jerash"], ["amman", "jerash"], ["petra"], ["petra"], []]);
    expect("last day departs", days[4].hints.depart, true);
    // range edge cases (Review Focus 3 and 4)
    expect("bold range", ids("**Days 1–2: Amman**\n**Day 3: Petra**"), [["amman"], ["amman"], ["petra"]]);
    expect("'Day 1 - 2 hours' is not a range", ids("Day 1 - 2 hours in Amman\nDay 2: Petra"), [["amman"], ["petra"]]);
    expect("capped at 21 days", parse("Days 1-7: Amman\nDays 8-14: Petra\nDays 15-21: Wadi Rum\nDays 22-28: Aqaba", model).length, 21);
  });

  test("Parser: 'A to B' / 'A → B' headings drop yesterday's place", (expect) => {
    const t = trip("Day 1: Arrive in Amman\n- Citadel\nDay 2: Amman to Petra\n- JETT bus 6:30 AM, explore Petra\nDay 3: Petra to Wadi Rum\n- transfer, jeep, camp\nDay 4: Wadi Rum to Dead Sea\n- drive\nDay 5: Dead Sea to Amman\n- fly home");
    expect("placeIds", t.days.map((d) => d.placeIds), [["amman"], ["petra"], ["wadi-rum"], ["dead-sea"], ["amman"]]);
    expect("no ONE_DEPARTURE / PETRA_TOO_SHORT", check(t, model).days.flatMap(codes).filter((c) => ["ONE_DEPARTURE", "PETRA_TOO_SHORT"].includes(c)), []);
    expect("arrows + day trip", ids("Day 1: Amman\nDay 2: Amman → Jerash → Amman\nDay 3: Amman → Petra\nDay 4: Petra → Amman"),
      [["amman"], ["jerash", "amman"], ["petra"], ["amman"]]);
    expect("from Petra … back to Amman", ids("Day 1: Arrive AMM\nDay 2: Take the JETT bus at 6:30 to Petra\nDay 3: JETT bus from Petra at 7:00 AM back to Amman, Citadel\nDay 4: Fly home"),
      [[], ["petra"], ["amman"], []]);
  });

  test("Parser: mid-trip 'depart' / 'arrive' are not airport days", (expect) => {
    const dep = parse("Day 1: Amman\nDay 2: Depart Amman 6:30 on the JETT bus to Petra\nDay 3: Wadi Rum\nDay 4: Fly home", model);
    expect("day 2 not a depart day", dep[1].hints.depart, false);
    expect("day 2 = Petra", dep[1].placeIds, ["petra"]);
    const arr = parse("Day 1: Amman\nDay 2: JETT to Petra\nDay 3: Arrive in Wadi Rum by 11am for a jeep tour and camp\nDay 4: Fly home", model);
    expect("day 3 not an arrival day", arr[2].hints.arrive, false);
    expect("a real mid-trip flight still departs", parse("Day 1: Amman\nDay 2: Depart from Queen Alia airport\nDay 3: Petra", model)[1].hints.depart, true);
  });

  test("Parser: Arabic spellings (البتراء, وادي رام, و prefix, Arabic-Indic digits)", (expect) => {
    expect("06a", ids("اليوم 1: عمّان - القلعة والمدرج الروماني\nاليوم 2: البتراء\nاليوم 3: وادي رم\nاليوم 4: البحر الميت\nاليوم 5: جرش"),
      [["amman"], ["petra"], ["wadi-rum"], ["dead-sea"], ["jerash"]]);
    expect("06b", ids("اليوم 1: عمان\nاليوم 2: البترا\nاليوم 3: وادي رام والعقبة\nاليوم 4: مأدبا وجبل نبو\nاليوم 5: ضانا والكرك"),
      [["amman"], ["petra"], ["wadi-rum", "aqaba"], ["madaba"], ["dana", "kerak"]]);
    expect("06c", ids("اليوم ١: عمان\nاليوم ٢: البتراء"), [["amman"], ["petra"]]);
  });

  test("Parser: typos, hyphens and accents", (expect) => {
    expect("16a", ids("Day 1: Amman\nDay 2: Petr\nDay 3: Jarash and Dead see\nDay 4: Wadi Ram"),
      [["amman"], ["petra"], ["jerash", "dead-sea"], ["wadi-rum"]]);
    expect("16b", ids("Day 1: Amman\nDay 2: Madeba and Nebo\nDay 3: Kerek Castle\nDay 4: Um Qais and Ajlun\nDay 5: Al Salt"),
      [["amman"], ["madaba"], ["kerak"], ["umm-qais", "ajloun"], ["as-salt"]]);
    expect("Dead-Sea / Wadi-Rum / Ammān / Pétra", ["Dead-Sea", "Wadi-Rum", "Ammān", "Pétra"].map((w) => findPlaces(w, model.places)),
      [["dead-sea"], ["wadi-rum"], ["amman"], ["petra"]]);
  });

  test("Parser: generic words no longer map to places", (expect) => {
    const probe = ["Desert Castles tour", "desert safari", "base camp", "rum punch", "Jeep", "Monastery of Saint George", "the Siq", "Treasury", "float", "Mosaic map", "Dead Sea salt scrub"];
    expect("probes", probe.map((w) => findPlaces(w, model.places)), [[], [], [], [], [], [], [], [], [], [], ["dead-sea"]]);
    expect("case 22", ids("Day 1: Amman\nDay 2: Visit the Dead Sea and buy Dead Sea salt scrub; rum punch at a bar; camp out\nDay 3: Fly home"),
      [["amman"], ["dead-sea"], []]);
  });

  test("Parser: places we don't cover are listed, never guessed", (expect) => {
    const days = parse("Day 1: Arrive Amman\nDay 2: Desert Castles - Qasr Amra, Qasr Kharana and Azraq\nDay 3: Wadi Mujib canyon and Little Petra\nDay 4: Feynan Ecolodge and Shobak Castle\nDay 5: Baptism Site (Bethany) then Irbid, fly home", model);
    expect("placeIds", days.map((d) => d.placeIds), [["amman"], [], [], [], []]);
    expect("notCovered", days.map((d) => d.notCovered), [[], ["Desert Castles", "Azraq"], ["Wadi Mujib", "Little Petra"], ["Feynan", "Shobak"], ["Baptism Site", "Irbid"]]);
    expect("preview", previewText(days).endsWith("Not covered yet: Desert Castles, Azraq, Wadi Mujib, Little Petra, Feynan, Shobak, Baptism Site, Irbid."), true);
    expect("only unsupported places → not usable", isUsable(parse("Day 1: Wadi Mujib\nDay 2: Azraq Wetland\nDay 3: Irbid", model)), false);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: the test run (command in the header).
Expected: the 17 old cases print `PASS`; all 9 new `Parser: …` cases print `FAIL` (e.g. `Parser: ChatGPT markdown headings …, 5 days, title line ignored: expected 5, got 6`).

- [ ] **Step 3: Replace `public/js/engine/parser.js` with this file**

```js
// Rule-based itinerary parser: free text → days[]. Unknown words are ignored, never guessed.
import { shortName } from "./model.js";

const TIMES = ["morning", "afternoon", "sunset", "evening", "night"];
const MODE_WORDS = [
  ["bus", /\b(bus|buses|jett|coach)\b/],
  ["car", /\b(drive|driving|rent|rental|car)\b/],
  ["taxi", /\b(taxi|driver|transfer|uber|careem)\b/]
];
const AIRPORT_WORDS = /\b(airport|amm|qaia|queen alia|king hussein|aqj|fly|flight)\b/;
const ARRIVE = /\b(arrive|arriving|arrival|land|landing)\b/;
const DEPART = /\b(depart|departure|departing)\b/;
const FLY_HOME = /\b(fly|flight|flying) (home|back|out)\b/;
const AQJ_OUT = /\b(aqj|king hussein)\b|\baqaba (international )?airport\b|\b(fly|flight|flying)( home| out| back)? from aqaba\b/;
const AMM_OUT = /\b(qaia|queen alia)\b|\bamm\b|\bamman (international )?airport\b|\b(fly|flight|flying)( home| out| back)? from amman\b/;
const MAX_DAYS = 21;
const MAX_RANGE = 7;

// "Day 1", "### Day 1:", "**Day 1 – Amman**", "- Day 2", "📍 Day 3", "Days 3–4", "Day 1-2", "اليوم ١".
// A range only counts when the second number ends the marker ("Day 1 - 2 hours" is Day 1).
const PREFIX = "[ \\t#>*_•·\\-––\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}]*";
const NUM = "([\\d٠-٩]{1,2})";
const MARKER = new RegExp(
  `(?:^|\\n)${PREFIX}(?:days?|اليوم)[ \\t]*${NUM}(?:[ \\t]*(?:-|–|–|to|&|and)[ \\t]*${NUM}(?=[ \\t*_]*(?:[-––:.)]|\\n|$)))?[ \\t*_]*[-––:.)]?`,
  "giu"
);

/**
 * Known places Darb does not cover yet. They are listed per day ("Not covered yet: …") and masked
 * before place matching, so "Little Petra" never reads as Petra and "Feynan" never reads as Dana.
 */
export const NOT_COVERED = [
  { name: "Desert Castles", keywords: ["desert castles", "desert castle", "qasr amra", "qusayr amra", "qasr kharana", "qasr al kharanah"] },
  { name: "Azraq", keywords: ["azraq", "الازرق"] },
  { name: "Wadi Mujib", keywords: ["wadi mujib", "mujib", "الموجب"] },
  { name: "Little Petra", keywords: ["little petra", "siq al barid", "البترا الصغيره"] },
  { name: "Feynan", keywords: ["feynan", "فينان"] },
  { name: "Shobak", keywords: ["shobak", "shoubak", "montreal castle", "الشوبك"] },
  { name: "Baptism Site", keywords: ["baptism site", "bethany", "al maghtas", "المغطس"] },
  { name: "Irbid", keywords: ["irbid", "اربد"] },
  { name: "Ma'in", keywords: ["ma'in", "hammamat"] },
  { name: "Aqaba Marine Park", keywords: ["aqaba marine park", "marine park"] }
];

const toInt = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660));

/**
 * Lower-case; strip Latin accents (Ammān → amman), Arabic diacritics and tatweel; fold ء/آ/أ/إ → ا,
 * ة → ه, ى → ي; "->"/"=>" → "→"; hyphens, underscores, apostrophes and dots → space; collapse spaces.
 * Keywords go through the same function, so "Dead-Sea" matches "dead sea" and "البتراء" matches itself.
 */
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ً-ٰٕـ]/g, "")
    .replace(/[ءآأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/->|=>/g, " → ")
    .replace(/[-_'’.]/g, " ")
    .replace(/[ \t]+/g, " ");
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Optional Arabic "و" (and) prefix: "والعقبة" = "and Aqaba".
const kwRegex = (kw) => new RegExp(`(^|[^\\p{L}\\p{N}])(و?)(${esc(normalize(kw))})(?=$|[^\\p{L}\\p{N}])`, "u");

/** First match of any keyword in a normalized string → { start, end } or null. */
function firstMatch(n, keywords) {
  let best = null;
  for (const kw of keywords) {
    const m = kwRegex(kw).exec(n);
    if (!m) continue;
    const start = m.index + m[1].length + m[2].length;
    if (!best || start < best.start) best = { start, end: start + m[3].length };
  }
  return best;
}

/** Split raw text into day chunks. A range marker ("Days 3–4") repeats its chunk once per day. */
export function splitDays(text) {
  const t = String(text || "").replace(/\r/g, "").trim();
  if (!t) return [];
  const marks = [...t.matchAll(MARKER)];
  if (marks.length) {
    return marks.flatMap((m, i) => {
      const chunk = t.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : t.length).trim();
      const a = toInt(m[1]);
      const b = m[2] ? toInt(m[2]) : a;
      const count = b > a ? Math.min(MAX_RANGE, b - a + 1) : 1;
      return Array.from({ length: count }, () => chunk);
    });
  }
  const blocks = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  return t.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Not-covered place names in a normalized chunk + the chunk with those names blanked out. */
function maskNotCovered(n) {
  const names = [];
  let masked = n;
  for (const nc of NOT_COVERED) {
    let hit = false;
    for (const kw of nc.keywords) {
      const re = new RegExp(kwRegex(kw).source, "gu");
      masked = masked.replace(re, (all, pre, wa, word) => { hit = true; return pre + " ".repeat(wa.length + word.length); });
    }
    if (hit) names.push(nc.name);
  }
  return { names, masked };
}

/** [{ id, start, end }] for each place mentioned in a normalized chunk, by first appearance. */
function placeHits(n, places) {
  const hits = [];
  for (const p of places) {
    const m = firstMatch(n, p.keywords);
    if (m) hits.push({ id: p.id, ...m });
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Place ids mentioned in a chunk, in order of first appearance (not-covered names are ignored). */
export function findPlaces(chunk, places) {
  return placeHits(maskNotCovered(normalize(chunk)).masked, places).map((h) => h.id);
}

// "Amman to Petra", "Amman → Petra", "Wadi Rum to the Dead Sea", "Petra – Wadi Rum".
const CONNECTOR = /^[\s*_:,]*(to|→|–|–)(\s+the)?[\s*_]*$/u;
// "from Amman", "depart Amman", "leave Petra" just before the place name.
const ORIGIN_WORD = /\b(from|depart|departing|leave|leaving)\s*$/;

/**
 * The place yesterday ended in, named as today's starting point, is not a visit: "Amman to Petra",
 * "Amman → Petra", "from Petra back to Amman", "Depart Amman on the JETT bus to Petra". It is dropped,
 * or moved to the end when the chunk names it again later ("Amman → Jerash → Amman" ends back in Amman).
 * "Morning at Petra, then head to Wadi Rum" keeps Petra: the words between the two places are not a bare
 * connector, and nothing like "from" comes before Petra.
 */
function dropOrigin(hits, n, prevLast, places) {
  if (hits.length < 2 || !prevLast) return hits;
  const k = hits.findIndex((h) => h.id === prevLast);
  if (k < 0) return hits;
  const h = hits[k];
  const arrow = k === 0 && CONNECTOR.test(n.slice(h.end, hits[1].start));
  const origin = ORIGIN_WORD.test(n.slice(Math.max(0, h.start - 12), h.start));
  if (!arrow && !origin) return hits;
  const rest = hits.filter((_, j) => j !== k);
  const after = k === 0 ? hits[1].end : h.end;
  const place = places.find((p) => p.id === h.id);
  return firstMatch(n.slice(after), place.keywords) ? [...rest, h] : rest;
}

/** "A" happens and airport words follow it later in the same chunk. */
const followedBy = (n, a, b) => {
  const m = a.exec(n);
  return !!m && b.test(n.slice(m.index));
};

function hintsFor(n, i, total) {
  let mode = null;
  let at = Infinity;
  for (const [m, re] of MODE_WORDS) {
    const hit = re.exec(n);
    if (hit && hit.index < at) { at = hit.index; mode = m; }
  }
  return {
    mode,
    times: TIMES.filter((w) => new RegExp(`\\b${w}\\b`).test(n)),
    // Mid-trip "arrive in Petra" / "depart Amman on the JETT" are not airport arrivals / departures.
    arrive: i === 0 || followedBy(n, ARRIVE, AIRPORT_WORDS),
    depart: i === total - 1 || FLY_HOME.test(n) || followedBy(n, DEPART, AIRPORT_WORDS)
  };
}

export function dayTitle(placeIds, model) {
  return placeIds.map((id) => shortName(model.byId[id])).join(" + ") || "Free day";
}

/** text → [{ n, title, text, placeIds, notCovered, hints }] */
export function parse(text, model) {
  const chunks = splitDays(text || "").slice(0, MAX_DAYS);
  let prevLast = null;
  return chunks.map((chunk, i) => {
    const n = normalize(chunk);
    const { names, masked } = maskNotCovered(n);
    const placeIds = dropOrigin(placeHits(masked, model.places), masked, prevLast, model.places).map((h) => h.id);
    if (placeIds.length) prevLast = placeIds.at(-1);
    return {
      n: i + 1, title: dayTitle(placeIds, model), text: chunk.slice(0, 300), placeIds,
      notCovered: names, hints: hintsFor(n, i, chunks.length)
    };
  });
}

/** Airport named on the last day ("fly home from AQJ", "King Hussein airport") → "AQJ" | "AMM" | null. */
export function departAirportFrom(days) {
  const last = days?.at(-1);
  if (!last) return null;
  const n = normalize(last.text || "");
  if (AQJ_OUT.test(n)) return "AQJ";
  if (AMM_OUT.test(n)) return "AMM";
  return null;
}

/** True when the text gave us something we can check (at least one known place). */
export const isUsable = (days) => days.length > 0 && days.some((d) => d.placeIds.length > 0);

/** Distinct not-covered names across the trip, in order. */
export const notCoveredNames = (days) => [...new Set(days.flatMap((d) => d.notCovered || []))];

function previewDay(d) {
  if (d.placeIds.length) return d.title;
  if (d.notCovered?.length) return `${d.notCovered.join(" + ")} (not covered yet)`;
  return d.hints?.depart ? "Fly home" : "Free day";
}

/** "We read 5 days: Day 1 Amman · Day 2 Petra … · Not covered yet: Azraq, Wadi Mujib." */
export function previewText(days) {
  if (!isUsable(days)) return "";
  const names = notCoveredNames(days);
  return `We read ${days.length} day${days.length > 1 ? "s" : ""}: ` + days.map((d) => `Day ${d.n} ${previewDay(d)}`).join(" · ") +
    (names.length ? ` · Not covered yet: ${names.join(", ")}.` : "");
}
```

- [ ] **Step 4: Update the keywords in `public/data/places.json`**

Each place has its `keywords` on one line. Replace each of these 10 lines exactly (use the Edit tool, old line → new line). This removes the generic words `desert, camp, jeep, rum, siq, treasury, monastery, salt, float, mosaic` and also `downtown` (flagged by both the engine and UX audits) and `feynan` (now a not-covered place), and adds spellings and typos. Normalisation already folds hyphens and accents, so `Dead-Sea`, `Wadi-Rum`, `Ammān`, `Pétra` need no extra entries; they are listed where the controller asked for them.

| place | new `keywords` line |
|---|---|
| amman | `"keywords": ["amman", "ammān", "citadel", "roman theatre", "roman theater", "rainbow street", "abdali", "عمان", "القلعة", "المدرج"],` |
| jerash | `"keywords": ["jerash", "jarash", "jerrash", "gerash", "gerasa", "جرش"],` |
| umm-qais | `"keywords": ["umm qais", "umm qays", "um qais", "um qays", "umm qeis", "um qeis", "gadara", "ام قيس", "أم قيس"],` |
| as-salt | `"keywords": ["as-salt", "as salt", "al salt", "al-salt", "السلط"],` |
| dead-sea | `"keywords": ["dead sea", "dead-sea", "deadsea", "dead see", "البحر الميت"],` |
| madaba | `"keywords": ["madaba", "madeba", "mount nebo", "nebo", "مادبا", "نيبو"],` |
| petra | `"keywords": ["petra", "petr", "wadi musa", "البترا", "البتراء", "بترا", "وادي موسى"],` |
| wadi-rum | `"keywords": ["wadi rum", "wadi-rum", "wadi ram", "wadi rumm", "wadirum", "وادي رم", "وادي رام"],` |
| dana | `"keywords": ["dana", "ضانا"],` |
| kerak | `"keywords": ["kerak", "karak", "kerek", "الكرك"],` |

Leave ajloun and aqaba unchanged. Verify the JSON still parses: `node -e "JSON.parse(require('fs').readFileSync('<repo>/public/data/places.json'))" && echo ok` → `ok`.

- [ ] **Step 5: Run the tests to verify everything passes**

Run: the test run.
Expected: 26 lines, all `PASS` (17 old + 9 new). The four `Reference: …` cases must stay `PASS` (58, 94, 6 est legs, save 33).

- [ ] **Step 6: Show not-covered places on plan.html and check.html**

In `public/js/pages/plan.js` change the parser import (line 8) to

```js
import { parse, isUsable, previewText, notCoveredNames } from "../engine/parser.js";
```

and replace the `else` branch in `update()`

```js
  } else {
    preview.innerHTML = html`We couldn’t find any Jordan places in this text, try ‘Day 1 – Amman…’ or <a href="/build.html">build a plan instead</a>.`;
  }
```

with

```js
  } else {
    const nc = notCoveredNames(days);
    preview.innerHTML = nc.length
      ? html`We don’t cover ${nc.join(", ")} yet, and found no other Jordan places we check, try ‘Day 1 – Amman…’ or <a href="/build.html">build a plan instead</a>.`
      : html`We couldn’t find any Jordan places in this text, try ‘Day 1 – Amman…’ or <a href="/build.html">build a plan instead</a>.`;
  }
```

In `public/js/pages/check.js`, inside `renderDay(day, i)`, replace

```js
  const infoHtml = info.map((it) => html`<p class="ck-info">${raw(icon("warn"))}<span>${it.reason}</span></p>`).join("");
```

with

```js
  const notCovered = (d.notCovered || []).length
    ? html`<p class="ck-not-covered">Not covered yet: ${d.notCovered.join(", ")}, Darb doesn’t check this part of the day.</p>`
    : "";
  const infoHtml = notCovered + info.map((it) => html`<p class="ck-info">${raw(icon("warn"))}<span>${it.reason}</span></p>`).join("");
```

In `onFixAll`, replace

```js
  const days = res.days.map(({ n, title, text, placeIds, hints }) => ({ n, title, text, placeIds, hints }));
```

with

```js
  const days = res.days.map(({ n, title, text, placeIds, notCovered, hints }) => ({ n, title, text, placeIds, notCovered: notCovered || [], hints }));
```

Append to `public/css/pages/check.css` (after the `.ck-info .icon` rule):

```css
.ck-not-covered { font-size: 13px; color: var(--muted); font-style: italic; }
```

- [ ] **Step 7: Update CLAUDE.md**

In §3 trip shape, replace `days: [ { n: 1, title: "Amman, Citadel & Roman Theatre", placeIds: ["amman"],` with `days: [ { n: 1, title: "Amman, Citadel & Roman Theatre", placeIds: ["amman"], notCovered: [],`.
In §4.1 replace the first bullet with:

```markdown
- Split on `Day N` / `Days N–M` (repeated once per day) / `اليوم N` (Arabic-Indic digits too), with markdown, bullets or emoji before "Day"; else blank lines; else one line = one day. Max 21 days.
```

and add a bullet after the keyword bullet:

```markdown
- Yesterday's last place named as today's start ("Amman to Petra", "Amman → Petra", "from Petra") is not a visit. Known places Darb doesn't cover (Desert Castles, Wadi Mujib, Little Petra, Feynan, Azraq, Shobak, Baptism Site, Irbid, Ma'in, Aqaba Marine Park) go in `day.notCovered` and the preview says "Not covered yet: …". `arrive`/`depart` mid-trip only with airport words.
```

- [ ] **Step 8: Browser check**

Start the server (`python3 -m http.server -d <repo>/public 8100`, background). With Playwright MCP: open `http://localhost:8100/plan.html`, run the "Local data gotcha" snippet in the console (`browser_evaluate`), reload, paste the audit case 07 text (`Day 1: Arrive Amman` … `fly home`, from the "places we don't cover" test) into `#plan-text`.
Expected: `#plan-preview` text ends with `Not covered yet: Desert Castles, Azraq, Wadi Mujib, Little Petra, Feynan, Shobak, Baptism Site, Irbid.` Paste `Day 1: Wadi Mujib\nDay 2: Azraq Wetland\nDay 3: Irbid` → preview starts `We don’t cover Wadi Mujib, Azraq, Irbid yet`. No console errors.

- [ ] **Step 9: Commit**

```bash
cd <repo> && git add public/js/engine/parser.js public/data/places.json public/js/test-cases.js public/js/pages/plan.js public/js/pages/check.js public/css/pages/check.css CLAUDE.md && git commit -m "Parser: markdown/emoji/range markers, A-to-B origins, Arabic and typo spellings, no generic keywords, not-covered places"
```

---

### Task A2: Departure airport ("Fly home from")

Estimated: 30 min.

**Files:**
- Modify: `public/js/engine/rules.js:14,33-49` (new `departAirportOf`, last day uses it)
- Modify: `public/js/engine/fixer.js:2,25-42` (ordering uses the day's real last stop)
- Modify: `public/js/engine/builder.js:4,126-144,194-204` (`tripSettings` carries `departAirport`, pair ordering uses it)
- Modify: `public/js/test-cases.js` (imports + 1 case)
- Modify: `public/plan.html`, `public/js/pages/plan.js` (select + auto-fill from text)
- Modify: `public/build.html`, `public/js/pages/build.js` (select)
- Modify: `public/js/pages/check.js:19,228-231` (meta line)
- Modify: `CLAUDE.md` §3

**Interfaces:**
- Consumes: `departAirportFrom(days)` from Task A1.
- Produces: `departAirportOf(settings, model) → "AMM" | "AQJ"` exported from `rules.js` (falls back to the arrival airport for old trips and unknown values); `settings.departAirport: "AMM" | "AQJ"` in every newly saved trip; `tripSettings(s)` returns `departAirport`.

- [ ] **Step 1: Write the failing test**

In `public/js/test-cases.js` change the imports to

```js
import { parse, isUsable, previewText, findPlaces, departAirportFrom } from "./engine/parser.js";
import { check, dayRoute, departAirportOf } from "./engine/rules.js";
```

Append above `  return results;`:

```js
  // ---------- A2 departure airport ----------
  test("Departure airport: read from the last day, used for the last leg", (expect) => {
    const kh = "Day 1: Arrive Amman\nDay 2: Madaba and Mount Nebo, then Kerak Castle\nDay 3: Dana\nDay 4: Petra\nDay 5: Wadi Rum\nDay 6: Aqaba, fly home from AQJ";
    expect("AQJ from text", departAirportFrom(parse(kh, model)), "AQJ");
    expect("Aqaba airport", departAirportFrom(parse("Day 1: Amman\nDay 2: Petra\nDay 3: Wadi Rum\nDay 4: Aqaba - fly out from Aqaba airport", model)), "AQJ");
    expect("Amman", departAirportFrom(parse("Day 1: Land in Aqaba, snorkel\nDay 2: Fly home from Amman", model)), "AMM");
    expect("reference: none", departAirportFrom(ref.days), null);
    // old trips (no departAirport) and junk values fall back to the arrival airport (Review Focus 2)
    expect("fallbacks", [departAirportOf({ airport: "AQJ" }, model), departAirportOf({ airport: "AMM", departAirport: "XYZ" }, model), departAirportOf({ airport: "AMM", departAirport: "amman" }, model)], ["AQJ", "AMM", "AMM"]);
    const t = trip(kh, { departAirport: "AQJ" });
    const last = dayRoute(t.days, 5, t.settings, model);
    expect("last stop AQJ", last.stops.at(-1), "AQJ");
    expect("no phantom leg to Amman airport", last.legs.some((l) => l.to === "AMM"), false);
    expect("day 6 ok", check(t, model).days[5].status, "ok");
    const t2 = trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Dana\nDay 5: Amman, fly home", { airport: "AQJ", departAirport: "AMM" });
    expect("AQJ in, AMM out: day 5 ok", check(t2, model).days[4].status, "ok");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: the test run. Expected: 26 `PASS`, then `FAIL Departure airport: …` (first failure: `departAirportOf is not a function` → the case is recorded as `threw: …`).

- [ ] **Step 3: Implement in `rules.js`**

After the `airportOf` line add:

```js
/** Airport the trip flies home from: settings.departAirport when it is a known airport, else the arrival airport. */
export const departAirportOf = (settings, model) =>
  (model.airports.some((a) => a.id === settings?.departAirport) ? settings.departAirport : airportOf(settings, model));
```

In `dayRoute`, replace `  if (d.hints?.depart) seq.push(ap);` with

```js
  if (d.hints?.depart) seq.push(i === days.length - 1 ? departAirportOf(settings, model) : ap);
```

- [ ] **Step 4: Implement in `fixer.js`**

Change line 2 to drop `airportOf` (no longer used in fixer.js):

```js
import { check, dayRoute, dayIssues, usableOptions, solves, chosenKey } from "./rules.js";
```

In `orderAll`, replace

```js
  const ap = airportOf(trip.settings, model);
  const { days } = trip;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.placeIds.length < 2 || d.placeIds.length > 6) continue;
    const base = dayRoute(days, i, trip.settings, model).base;
    const next = d.hints?.depart ? ap : days.slice(i + 1).find((x) => x.placeIds.length)?.placeIds[0];
```

with

```js
  const { days } = trip;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.placeIds.length < 2 || d.placeIds.length > 6) continue;
    const route = dayRoute(days, i, trip.settings, model);
    const base = route.base;
    // On a depart day the route ends at the right airport (departAirportOf on the last day).
    const next = d.hints?.depart ? route.stops.at(-1) : days.slice(i + 1).find((x) => x.placeIds.length)?.placeIds[0];
```

- [ ] **Step 5: Implement in `builder.js`**

Line 4: `import { check, dayIssues, airportOf, departAirportOf, usableOptions } from "./rules.js";`
In `orderPairs`, replace `    const next = d.hints.depart ? ap : days.slice(i + 1).find((x) => x.placeIds.length)?.placeIds[0];` with

```js
    const next = d.hints.depart ? (i === days.length - 1 ? departAirportOf(settings, model) : ap) : days.slice(i + 1).find((x) => x.placeIds.length)?.placeIds[0];
```

In `tripSettings`, replace the `airport:` line with two lines:

```js
    airport: s.airport === "AQJ" ? "AQJ" : "AMM",
    departAirport: ["AMM", "AQJ"].includes(s.departAirport) ? s.departAirport : (s.airport === "AQJ" ? "AQJ" : "AMM"),
```

- [ ] **Step 6: Run the tests**

Run: the test run. Expected: 27 lines, all `PASS`.

- [ ] **Step 7: plan.html select + plan.js wiring**

In `public/plan.html`, after the closing `</div>` of the `f-airport` field, add:

```html
            <div class="field">
              <label for="f-depart">Fly home from</label>
              <select class="select" id="f-depart" name="departAirport">
                <option value="AMM">Queen Alia (AMM)</option>
                <option value="AQJ">King Hussein, Aqaba (AQJ)</option>
              </select>
            </div>
```

In `public/js/pages/plan.js`:
- import line 8 becomes `import { parse, isUsable, previewText, notCoveredNames, departAirportFrom } from "../engine/parser.js";`
- in the `f` object add `depart: qs("#f-depart"),` after `airport: qs("#f-airport"),`
- below `let car = false;` add `let departTouched = false; // the user picked "Fly home from" themselves`
- in `settings()` add after the `airport:` line: `    departAirport: f.depart.value === "AQJ" ? "AQJ" : "AMM",`
- in `restoreDraft()` after the airport line add:

```js
  if (["AMM", "AQJ"].includes(s.departAirport)) f.depart.value = s.departAirport;
  departTouched = !!s.departAirport && s.departAirport !== s.airport;
```

- in `update()` directly after `days = parse(value, model);` add:

```js
  if (!departTouched) f.depart.value = departAirportFrom(days) || f.airport.value;
```

- in the `?demo=1` block after `f.airport.value = s.airport;` add `f.depart.value = s.airport; departTouched = false;`
- after the `#car-toggle` listener add:

```js
f.depart.addEventListener("change", () => { departTouched = true; saveDraft(); });
f.airport.addEventListener("change", () => {
  if (!departTouched) f.depart.value = departAirportFrom(days) || f.airport.value;
  saveDraft();
});
```

- [ ] **Step 8: build.html select + build.js wiring**

In `public/build.html`, after the `f-airport` field's closing `</div>` add:

```html
            <div class="field field-wide">
              <label for="f-depart">Fly home from</label>
              <select class="select" id="f-depart">
                <option value="AMM">Queen Alia (AMM)</option>
                <option value="AQJ">King Hussein, Aqaba (AQJ)</option>
              </select>
            </div>
```

In `public/js/pages/build.js`:
- `DEFAULTS` gains `departAirport: "AMM",` after `airport: "AMM",`
- in `loadState()` return object add after the `airport:` line: `      departAirport: s.departAirport === "AQJ" ? "AQJ" : s.departAirport === "AMM" ? "AMM" : (s.airport === "AQJ" ? "AQJ" : "AMM"),`
- `settings()` becomes

```js
const settings = () => ({ airport: state.airport, departAirport: state.departAirport, month: state.month, travelers: 1, budget: "mid", car: state.car, startDate: null, pace: state.pace, days: state.days });
```

- in `renderForm()` after `qs("#f-airport").value = state.airport;` add `qs("#f-depart").value = state.departAirport;`
- replace the `#f-airport` listener with:

```js
qs("#f-airport").addEventListener("change", (e) => update(() => {
  // Default "fly home from" follows the arrival airport until the user changes it.
  if (state.departAirport === state.airport) state.departAirport = e.target.value;
  state.airport = e.target.value;
}));
qs("#f-depart").addEventListener("change", (e) => update(() => { state.departAirport = e.target.value; }));
```

- [ ] **Step 9: check.js meta line**

In `public/js/pages/check.js`, `DEFAULT_SETTINGS` gets `departAirport: null,` (after `airport: "AMM",`). In `render()` replace the `meta` line with:

```js
  const home = s.departAirport && s.departAirport !== s.airport ? `home from ${model.byId[s.departAirport]?.name || s.departAirport}` : "";
  const meta = [trip.title || `Your ${trip.days.length}-day plan`, airport, home, monthName(Number(s.month)) || "", s.car ? "with a car" : "no car"].filter(Boolean).join(" · ");
```

- [ ] **Step 10: CLAUDE.md §3**

In the `settings:` line of the trip shape add `departAirport: "AMM",` after `airport: "AMM",`, and in §4.2 replace `(+ airport on the last day if \`depart\`)` with `(+ on the last day the \`settings.departAirport\` airport, default the arrival airport; the parser pre-fills it from "fly home from AQJ / King Hussein / Aqaba airport")`.

- [ ] **Step 11: Browser check**

Server running; Playwright: `/plan.html` (after the data snippet), paste `Day 1: Arrive Amman\nDay 2: Madaba and Mount Nebo, then Kerak Castle\nDay 3: Dana\nDay 4: Petra\nDay 5: Wadi Rum\nDay 6: Aqaba, fly home from AQJ`.
Expected: `#f-depart` shows `King Hussein, Aqaba (AQJ)`. Click **Check my plan** → check page meta contains `home from King Hussein, Aqaba (AQJ)` and Day 6 is OK (no "Queen Alia" leg link on Day 6). `/build.html` shows the "Fly home from" select; changing Arrival to AQJ also switches it to AQJ.

- [ ] **Step 12: Run the tests, commit**

Run: the test run → 27 `PASS`.

```bash
cd <repo> && git add public/js/engine/rules.js public/js/engine/fixer.js public/js/engine/builder.js public/js/test-cases.js public/plan.html public/js/pages/plan.js public/build.html public/js/pages/build.js public/js/pages/check.js CLAUDE.md && git commit -m "Departure airport: 'Fly home from' select, parsed from the last day, used for the last leg"
```

---

### Task A3: Arrival-day budget, no full-day place onto edge days, honest swap text

Estimated: 25 min.

**Files:**
- Modify: `public/js/engine/rules.js:61-66,121` (`dayHours` gets the day index)
- Modify: `public/js/engine/fixer.js` (constants, 3 helpers, swap/move guards, swap text)
- Modify: `public/js/test-cases.js` (1 case)

**Interfaces:**
- Consumes: `bearing`, `bearingDiff` from `engine/geo.js`; `kmBetween`, `shortName` from `engine/model.js`.
- Produces: `dayHours(d, i, prevPlaces, route, model) → number` (exported from rules.js); fixer change texts `"Pair X with Y (same direction) …"`, `"Pair X with Y (nearer to X than Z) …"`, `"Visit Y on this day instead and visit Z on Day N."`, `"Swap Z and Y: Y on this day …"`.

- [ ] **Step 1: Write the failing test**

Append above `  return results;`:

```js
  // ---------- A3 arrival-day budget, no full-day place onto arrive/depart days, honest swap text ----------
  test("Arrival day counts the airport transfer; fixer keeps full-day places off arrive/depart days", (expect) => {
    const land = check(trip("Day 1: Land at the airport and go straight to Petra\nDay 2: Petra\nDay 3: Amman, fly home"), model);
    expect("Petra on arrival day overloads", codes(land.days[0]).includes("DAY_OVERLOAD"), true);
    // audit R2: "Day 1: Amman / Day 2: Petra" used to become Day 1 = Petra, "Ready to travel 97/98"
    const two = fix(trip("Day 1: Amman\nDay 2: Petra"), model);
    expect("Amman stays on Day 1", two.days[0].placeIds, ["amman"]);
    expect("not 'Ready to travel'", two.fixed.score < 85, true);
    const three = fix(trip("Day one: Amman\nDay two: Petra\nDay three: Wadi Rum"), model);
    expect("Wadi Rum never moves to Day 1", three.days[0].placeIds, ["amman"]);
    expect("reference keeps 'same direction'", refFix.fixed.changes.some((c) => c.day === 4 && c.text.includes("(same direction)")), true);
    const zig = fix(trip("Day 1: Arrive Amman\nDay 2: Jerash and Ajloun\nDay 3: Umm Qais and Dead Sea\nDay 4: Fly home"), model);
    expect("Umm Qais + Amman never 'same direction'", zig.fixed.changes.some((c) => c.text.includes("(same direction)")), false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: the test run. Expected: `FAIL Arrival day counts the airport transfer; …` (e.g. `Petra on arrival day overloads: expected true, got false`); the other 27 `PASS`.

- [ ] **Step 3: `rules.js`, arrival day counts the airport leg**

Replace the whole `dayHours` function with:

```js
/**
 * Visit hours (halved for a place also on the previous day) + drive hours between today's stops.
 * The morning transfer from the previous base is not counted (LONG_TRANSFER covers it), except on the
 * arrival day, where the airport → first place drive is part of the short 6 h day.
 */
export function dayHours(d, i, prevPlaces, route, model) {
  let h = 0;
  for (const id of d.placeIds) h += model.byId[id].minHours * (prevPlaces.includes(id) ? 0.5 : 1);
  const arrival = i === 0 && !!d.hints?.arrive;
  for (const leg of route.legs) if (!leg.isTransfer || arrival) h += leg.driveMin / 60;
  return h;
}
```

and in `dayIssues` change `const hours = dayHours(d, prev, route, model);` to `const hours = dayHours(d, i, prev, route, model);`.

(Reference Day 1: 45 min airport taxi + 3 h Amman = 3.75 h ≤ 6 h, so 58 is unchanged.)

- [ ] **Step 4: `fixer.js`, guards and honest text**

Add after line 3 (`import { kmBetween, shortName } from "./model.js";`):

```js
import { bearing, bearingDiff } from "./geo.js";
```

Replace

```js
const STRUCTURAL = ["ZIGZAG", "DAY_OVERLOAD", "PETRA_TOO_SHORT"];
const PUBLIC_MODES = ["bus", "minibus"];
```

with

```js
const STRUCTURAL = ["ZIGZAG", "DAY_OVERLOAD", "PETRA_TOO_SHORT"];
const PUBLIC_MODES = ["bus", "minibus"];
const HUB = "amman";
const SAME_DIRECTION_DEG = 60;
const HEAVY_HOURS = 5;
```

After `const withTrip = (trip, days) => ({ ...trip, days });` add:

```js

/** A full-day place (Petra 6 h, Wadi Rum 5 h, Dana 5 h) never moves onto the short arrival / departure day. */
const heavy = (model, id) => (model.byId[id]?.minHours ?? 0) >= HEAVY_HOURS;
const edgeDay = (day) => !!(day.hints?.arrive || day.hints?.depart);
const blockedMove = (model, id, day) => heavy(model, id) && edgeDay(day);

/** Both places lie in the same direction from Amman (bearing difference < 60°); Amman itself has no direction. */
function sameDirection(model, a, b) {
  if (a === HUB || b === HUB) return false;
  const hub = model.byId[HUB];
  return bearingDiff(bearing(hub, model.byId[a]), bearing(hub, model.byId[b])) < SAME_DIRECTION_DEG;
}

/** "What changed" line for a swap: Q joins day d (where stayIds remain), P moves to day e. */
function swapText(model, stayIds, Q, P, e, lastDay) {
  const tail = ` and visit ${name(model, P)} on Day ${e + 1}${lastDay ? " before your flight" : ""}.`;
  if (!stayIds.length) return `Visit ${name(model, Q)} on this day instead${tail}`;
  const stay = stayIds.map((x) => name(model, x)).join(" & ");
  if (stayIds.every((x) => sameDirection(model, x, Q))) return `Pair ${stay} with ${name(model, Q)} (same direction)${tail}`;
  const nearer = stayIds.every((x) => kmBetween(model, x, Q) < kmBetween(model, x, P));
  if (nearer) return `Pair ${stay} with ${name(model, Q)} (nearer to ${stay} than ${name(model, P)})${tail}`;
  return `Swap ${name(model, P)} and ${name(model, Q)}: ${name(model, Q)} on this day${tail}`;
}
```

In `reorder`, after the line `            if (P === Q || t.days[d].placeIds.includes(Q) || t.days[e].placeIds.includes(P)) continue;` add:

```js
            if (blockedMove(model, Q, t.days[d]) || blockedMove(model, P, t.days[e])) continue;
```

Replace

```js
      const stay = t.days[best.d].placeIds.filter((x) => x !== best.Q).map((x) => name(model, x));
      const lastDay = best.e === t.days.length - 1 && t.days[best.e].hints?.depart;
      changes.push({
        day: best.d + 1,
        text: `Pair ${stay.join(" & ") || "this day"} with ${name(model, best.Q)} (same direction) and visit ${name(model, best.P)} on Day ${best.e + 1}${lastDay ? " before your flight" : ""}.`
      });
```

with

```js
      const stayIds = t.days[best.d].placeIds.filter((x) => x !== best.Q);
      const lastDay = best.e === t.days.length - 1 && t.days[best.e].hints?.depart;
      changes.push({ day: best.d + 1, text: swapText(model, stayIds, best.Q, best.P, best.e, lastDay) });
```

In the "No clean swap" loop, directly after `        for (const e of order) {` add:

```js
          if (blockedMove(model, P, t.days[e])) continue;
```

- [ ] **Step 5: Run the tests**

Run: the test run. Expected: 28 `PASS`; `Reference: Fix all → 94 …` still `PASS`.

- [ ] **Step 6: Commit**

```bash
cd <repo> && git add public/js/engine/rules.js public/js/engine/fixer.js public/js/test-cases.js && git commit -m "Arrival day counts the airport leg; fixer never moves Petra/Wadi Rum/Dana onto arrive/depart days; 'same direction' only when true"
```

---

### Task A4: "More relaxed" fix card

Estimated: 15 min.

**Files:**
- Modify: `public/js/engine/rules.js:97` (addNight sub)
- Modify: `public/js/pages/check.js:78,132,216-226`
- Modify: `public/js/test-cases.js` (1 case)
- Modify: `CLAUDE.md` §4.4, §5

**Interfaces:**
- Consumes: `fix(trip, model, { choices, addNights })` (unchanged).
- Produces: addNight fix `{ kind: "addNight", label: "Full day in A, B next morning", sub: "Adds one night · same transfer, no rush" }`; check page tag "More relaxed"; Fix-all card shows the recomputed score and day count of the chosen fixes.

Note: on the reference trip the extra-night plan also scores 94 (6 est legs, 6 days). The button number is recomputed on every card click (it already was); what changes is that the card now says which fixes it applies and how many days the plan becomes, so the user sees their choice took effect.

- [ ] **Step 1: Write the failing test**

Append above `  return results;`:

```js
  // ---------- A4 "More relaxed" fix card ----------
  test("More relaxed fix: one extra night, same transfer", (expect) => {
    const it = refCheck.days[2].issues.find((i) => i.code === "NO_PUBLIC_TRANSPORT");
    const extra = it.fixes.find((f) => f.kind === "addNight");
    expect("sub", extra.sub, "Adds one night · same transfer, no rush");
    const f = fix(ref, model, { addNights: ["3|petra~wadi-rum"] });
    expect("6 days, clean", [f.days.length, f.check.counts.nf + f.check.counts.risky], [6, 0]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: the test run. Expected: `FAIL More relaxed fix: …` (`sub: expected "Adds one night · same transfer, no rush", got "Adds one night in Petra · moves the following days by one"`).

- [ ] **Step 3: Implement**

`rules.js`: in the `addNight` push replace ``sub: `Adds one night in ${A} · moves the following days by one` `` with `sub: "Adds one night · same transfer, no rush"`.

`check.js`:
- comment on line 78: `// One transport option (the recommended one) + the "More relaxed" extra night; other options live on leg.html.`
- line 132: `      tag: f.kind === "addNight" ? "More relaxed" : f.recommended ? "Recommended" : "",`
- replace `renderFixAll` with:

```js
function renderFixAll(res) {
  const after = res.fixed.score;
  const clean = result.counts.nf + result.counts.risky === 0;
  const custom = addNights.length > 0 || Object.keys(choices).length > 0;
  const days = res.days.length;
  const text = clean
    ? `Every day already works. See the plan with every transport leg costed, Reality Score ${after}/100.`
    : `Reality Score goes from ${result.score} to ${after}${days !== trip.days.length ? ` · ${days} days` : ""}. You can review every change before saving.`;
  const title = clean ? "See your costed plan" : custom ? "Apply your fixes" : "Apply recommended fixes";
  return html`
    <h2 class="ck-card-title">${title}</h2>
    <p class="muted small">${text}</p>
    <button type="button" class="btn btn-primary btn-block" id="fix-all">${clean ? "Cost every leg" : "Fix all"} → ${after}/100</button>`;
}
```

`CLAUDE.md`: §4.4 `("Cheaper" card in 03)` → `("More relaxed" card in 03: "Adds one night · same transfer, no rush")`; §5 03 `(Recommended / Cheaper cards; choosing one marks it)` → `(Recommended / More relaxed cards; choosing one marks it and the Fix-all card shows the resulting score and day count)`.

- [ ] **Step 4: Run the tests**, Expected: 29 `PASS`.

- [ ] **Step 5: Browser check**

Playwright: `/plan.html?demo=1` → **Check my plan** → on Day 3 click the card tagged `More relaxed`.
Expected: `#ck-fix h2` = `Apply your fixes`, its paragraph contains `58 to 94 · 6 days`, button `Fix all → 94/100`. Click `Recommended` again → heading stays `Apply your fixes` (a choice was made) and the paragraph no longer says `6 days`.

- [ ] **Step 6: Commit**

```bash
cd <repo> && git add public/js/engine/rules.js public/js/pages/check.js public/js/test-cases.js CLAUDE.md && git commit -m "Fix card 'Cheaper' → 'More relaxed'; Fix-all card reflects chosen fixes and day count"
```

---

### Task A5: Sticky bottom action bar on mobile

Estimated: 30 min.

**Files:**
- Create: `public/js/ui/sticky-cta.js`
- Modify: `public/css/app.css` (new block before `/* ---------- Print ---------- */`)
- Modify: `public/js/pages/check.js`, `public/js/pages/fixed.js`, `public/js/pages/build.js`
- Modify: `public/sw.js` (add the new module to the JS list)

**Interfaces:**
- Produces: `mountStickyCta(targetSelector, { label }?) → { sync() }`. The bar is a proxy: clicking it clicks the page's real button (so every existing handler runs unchanged); `sync()` copies the label and `disabled` state. Shown only below 900 px, hidden in print.

- [ ] **Step 1: Create `public/js/ui/sticky-cta.js`**

```js
// Mobile sticky action bar (< 900 px): a proxy button that clicks the page's real primary button.
import { qs } from "./dom.js";

/**
 * mountStickyCta("#fix-all", { label?: () => string }) → { sync }
 * The real button stays where it is (desktop layout, keyboard order); on phones the bar repeats it at the bottom.
 * Call sync() whenever the real button's text or disabled state changes.
 */
export function mountStickyCta(targetSelector, { label } = {}) {
  let bar = qs(".sticky-cta");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "sticky-cta no-print";
    bar.innerHTML = '<button type="button" class="btn btn-primary btn-block"></button>';
    document.body.append(bar);
  }
  document.body.classList.add("has-sticky-cta");
  const btn = bar.querySelector("button");
  btn.addEventListener("click", () => qs(targetSelector)?.click());
  const sync = () => {
    const target = qs(targetSelector);
    btn.textContent = (label && label()) || target?.textContent.replace(/\s+/g, " ").trim() || "";
    btn.disabled = !target || target.disabled;
  };
  sync();
  return { sync };
}
```

- [ ] **Step 2: CSS in `public/css/app.css`** (insert before `/* ---------- Print ---------- */`)

```css
/* ---------- Sticky action bar (phones) ---------- */
.sticky-cta { display: none; }
@media (max-width: 899px) {
  .sticky-cta { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: var(--white); border-top: 1px solid var(--line); box-shadow: var(--shadow); }
  body.has-sticky-cta { padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
  body.has-sticky-cta .toast { bottom: calc(92px + env(safe-area-inset-bottom)); }
}
```

and inside the existing `@media print { … }` block add the line `  .sticky-cta { display: none !important; }` and `  body.has-sticky-cta { padding-bottom: 0; }`.

- [ ] **Step 3: check.js**

Add import `import { mountStickyCta } from "../ui/sticky-cta.js";`. Below `let busy = false;` add `let sticky = null;`.
At the end of `render()` (after `root.setAttribute("aria-busy", "false");`) add:

```js
  sticky ||= mountStickyCta("#fix-all");
  sticky.sync();
```

In `onFixCard`, after `qs("#ck-fix").innerHTML = renderFixAll(runFix());` add `sticky?.sync();`.
In `onFixAll`, after `btn.textContent = "Fixing your plan…";` add `sticky?.sync();`.
In the `pageshow` listener, after `qs("#ck-fix").innerHTML = renderFixAll(runFix());` add `sticky?.sync();`.

- [ ] **Step 4: fixed.js**

Add `import { mountStickyCta } from "../ui/sticky-cta.js";` and after `qs("#actions").hidden = false;` add `mountStickyCta("#btn-share");`.

- [ ] **Step 5: build.js**

Add `import { mountStickyCta } from "../ui/sticky-cta.js";`. As the first line under `/* ---------- Boot ---------- */` (it must come after `let draft = null;` and before the first `render()` call) add:

```js
const sticky = mountStickyCta("#build-btn", {
  label: () => (qs("#build-btn").getAttribute("aria-busy") === "true" ? "Saving your plan…" : draft?.score != null ? `Build my plan · draft ${draft.score}` : "Build my plan")
});
```

At the end of `renderPlan()`, both the early-return branch (before its `return;`) and the end of the function, add `sticky.sync();`. In the `#build-btn` click handler after `btn.firstChild.textContent = "Saving your plan… ";` add `sticky.sync();`; in the `pageshow` handler after `btn.disabled = !draft;` add `sticky.sync();`.

- [ ] **Step 6: sw.js**, in the JS list add `"/js/ui/sticky-cta.js",` after `"/js/ui/stepper.js",`.

- [ ] **Step 7: Browser check (Playwright, 375×812)**

`browser_resize` 375×812. `/plan.html?demo=1` → Check → on /check a bar is fixed at the bottom reading `Fix all → 94/100`; clicking it navigates to /fixed (same as the sidebar button). On /fixed the bar reads `Save & share plan` and opens the modal. On `/build.html` add two places → bar reads `Build my plan · draft NN`; with no places it is disabled. Resize to 1280×800 → no bar visible anywhere. `browser_evaluate` `() => document.documentElement.scrollWidth` → `375` on all three pages (no horizontal scroll). Print emulation (`browser_emulate_media` print) → bar hidden.

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings (A7 must be done first; before A7 low-contrast hits are expected).

- [ ] **Step 8: Run the tests, commit**

Run: the test run → 29 `PASS`.

```bash
cd <repo> && git add public/js/ui/sticky-cta.js public/css/app.css public/js/pages/check.js public/js/pages/fixed.js public/js/pages/build.js public/sw.js && git commit -m "Mobile sticky action bar for Fix all / Save & share / Build my plan"
```

---

### Task A6: CLS, reserve space for injected nav, footer and content

Estimated: 25 min.

**Files:**
- Modify: `public/css/app.css` (base block)
- Modify: `public/fixed.html` (score card + cost skeletons), `public/build.html` (place-card skeletons)

**Interfaces:** none (CSS/HTML only). `.skel`, `.skel-row`, `.skel-line` already exist in `app.css`.

- [ ] **Step 1: Measure before** (chrome-devtools MCP, both viewports)

Get a fixed-plan URL: Playwright `/plan.html?demo=1` → Check → Fix all → copy the `/fixed.html?t=<id>` URL. Then for each of `/fixed.html?t=<id>`, `/build.html`, `/plan.html`, `/check.html?t=<parentId>`:

1. `mcp__plugin_ecc_chrome-devtools__resize_page` 375×812 (then repeat at 1280×800)
2. `mcp__plugin_ecc_chrome-devtools__navigate_page` to `http://localhost:8100/<page>`
3. `mcp__plugin_ecc_chrome-devtools__evaluate_script` with:

```js
() => new Promise((res) => {
  let cls = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value; })
    .observe({ type: "layout-shift", buffered: true });
  setTimeout(() => res(Number(cls.toFixed(3))), 3000);
})
```

Record the numbers in the commit message body (audit baseline: /fixed 1.0 mobile / 0.778 desktop, /build 0.507, /plan 0.261).

- [ ] **Step 2: Reserve space in `public/css/app.css`**

Replace `main { flex: 1 0 auto; }` with:

```css
main { flex: 1 0 auto; min-height: 100vh; }
/* nav / footer are filled by JS (ui/nav.js): reserve their height so nothing jumps (.nav = 18 px padding × 2 + 38 px button). */
header#nav { min-height: 74px; }
footer#footer { min-height: 120px; }
```

- [ ] **Step 3: Skeletons in `public/fixed.html`**

Replace `<div class="card score-card no-print" id="score-card" hidden></div>` with

```html
          <div class="card score-card no-print" id="score-card"><span class="skel skel-row" style="width:260px;max-width:100%;height:84px"></span></div>
```

and `<div id="cost"></div>` with

```html
            <div id="cost"><span class="skel skel-row" style="height:260px"></span></div>
```

(`fixed.js` already sets `hidden = false` and replaces both innerHTMLs.)

- [ ] **Step 4: Skeletons in `public/build.html`**

Replace `<ul class="plain-list place-grid" id="places" aria-busy="true"></ul>` with

```html
          <ul class="plain-list place-grid" id="places" aria-busy="true">
            <li class="skel skel-row" style="height:150px"></li><li class="skel skel-row" style="height:150px"></li>
            <li class="skel skel-row" style="height:150px"></li><li class="skel skel-row" style="height:150px"></li>
          </ul>
```

- [ ] **Step 5: Measure after**

Repeat Step 1. Expected: `header#nav` height (`() => document.querySelector("#nav").getBoundingClientRect().height`) is exactly 74 at both widths, if it is not, set `header#nav { min-height }` to the measured value. CLS < 0.1 on /fixed, /build, /plan, /check at both widths. If /fixed is still ≥ 0.1, run `mcp__plugin_ecc_chrome-devtools__performance_start_trace` (reload: true) / `performance_stop_trace` and use `performance_analyze_insight` "CLSCulprits" to find the element, then give it a skeleton of its final height.

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings (A7 must be done first; before A7 low-contrast hits are expected).

- [ ] **Step 6: Run the tests, commit**

Run: the test run → 29 `PASS`.

```bash
cd <repo> && git add public/css/app.css public/fixed.html public/build.html && git commit -m "CLS: reserve nav/footer/main height, skeletons for score card, cost card and place cards" -m "CLS before → after (375 / 1280): fixed …, build …, plan …, check …"
```

---

### Task A7: Contrast tokens for text on soft backgrounds

Estimated: 20 min.

**Files:**
- Modify: `public/css/tokens.css`, `public/css/app.css`, `public/css/pages/*.css`
- Create: `scripts/check-contrast.mjs` (dev-only)

**Interfaces:** new tokens `--amber-text: #8f5c0f; --green-text: #256a4b; --rose-text: #a6472e; --red-text: #a02f22;`. Brand tokens (`--amber`, `--green`, `--rose`, `--red`) stay for borders, fills, rings and CTA backgrounds.

- [ ] **Step 1: Write the checker `scripts/check-contrast.mjs`**

```js
// Dev-only: WCAG contrast of text tokens on the backgrounds they sit on. Reads public/css/tokens.css.
// Usage: node scripts/check-contrast.mjs   (exit 1 when any pair is below 4.5:1)
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/css/tokens.css", import.meta.url), "utf8");
const T = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex) => {
  const c = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const PAIRS = [
  ["amber-text", "sand"], ["amber-text", "white"], ["amber-text", "amber-soft"], ["amber-text", "rose-soft"],
  ["green-text", "green-soft"], ["green-text", "sand"], ["green-text", "white"],
  ["rose-text", "rose-soft"], ["rose-text", "sand"], ["rose-text", "white"],
  ["red-text", "rose-soft"], ["red-text", "white"],
  ["muted", "sand"], ["muted", "white"], ["muted", "sand-2"]
];
let bad = 0;
for (const [fg, bg] of PAIRS) {
  if (!T[fg] || !T[bg]) { console.log(`MISSING --${fg} or --${bg}`); bad++; continue; }
  const r = ratio(T[fg], T[bg]);
  if (r < 4.5) bad++;
  console.log(`${r >= 4.5 ? "PASS" : "FAIL"} --${fg} on --${bg}: ${r.toFixed(2)}:1`);
}
process.exit(bad ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**, `node scripts/check-contrast.mjs` → `MISSING --amber-text or --sand` lines, exit code 1.

- [ ] **Step 3: Add the tokens** in `public/css/tokens.css` after `--green-soft: …;`:

```css
  /* Text on soft backgrounds (WCAG AA ≥ 4.5:1, see scripts/check-contrast.mjs). Brand hues above stay for borders/fills. */
  --amber-text: #8f5c0f;
  --green-text: #256a4b;
  --rose-text: #a6472e;
  --red-text: #a02f22;
```

- [ ] **Step 4: Run the checker**, Expected: 15 `PASS` lines (amber-text on sand 5.09, amber-text on rose-soft 4.60, green-text on green-soft 5.60, rose-text on rose-soft 4.78, red-text on rose-soft 5.83, muted on sand-2 4.82 …), exit 0.

- [ ] **Step 5: Point every text colour at the text tokens**

```bash
cd <repo>/public/css && sed -i '' -E 's/([{; ])color: var\(--(amber|green|rose|red)\)/\1color: var(--\2-text)/g' app.css pages/*.css
```

(`border-color`, `background` and `border` are untouched because the character before `color` there is `-` or the property is different.) Then replace in `public/css/pages/plan.css` `.optional { font-weight: 500; opacity: .8; }` with `.optional { font-weight: 500; color: var(--muted); }`.

Verify nothing is left: `grep -nE '[{; ]color: var\(--(amber|green|rose|red)\)' <repo>/public/css/app.css <repo>/public/css/pages/*.css` → no output. `grep -c -- '-text)' <repo>/public/css/app.css` → 20 or more.

- [ ] **Step 6: Lighthouse check**, chrome-devtools `lighthouse_audit` (mobile, accessibility) on `/check.html?t=<id>` and `/fixed.html?t=<id>` → no `color-contrast` failures (audit baseline had ~35 elements).

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 7: Run the tests, commit**

Run: the test run → 29 `PASS`.

```bash
cd <repo> && git add public/css scripts/check-contrast.mjs && git commit -m "Contrast: text tokens for amber/green/rose/red on soft backgrounds (all ≥ 4.5:1), checker script"
```

---

### Task A8: Data, six new est. legs, one-way-verified JETT

Estimated: 30 min.

**Files:**
- Modify: `public/data/legs.json` (amman-petra gets `oneWayVerified` + `returnLabel`; 6 legs appended; `_meta.note` "10 seed" → "16 seed")
- Modify: `public/js/engine/model.js:37-64` (`reverseOption`, reversed legs)
- Modify: `public/js/data.js:5` (cache key)
- Modify: `public/js/test-cases.js` (imports + 1 case)
- Regenerate: `public/destinations.html` via `node scripts/render-destinations.mjs`

**Interfaces:**
- Consumes: `buildModel`, `resolveLeg(model, from, to)`.
- Produces: `resolveLeg(...)` returns `reversed: boolean`; when a leg with `oneWayVerified: true` is used backwards, every option that has `departs` comes back as `{ …, label: returnLabel || label, departs: null, arrives: null, status: "est", verifiedOn: null, notes: "Return schedule to verify." }`. Leg ids: `amman-aqaba`, `petra-aqaba`, `wadi-rum-aqaba`, `amman-kerak`, `dana-petra`, `AQJ-aqaba`.

All new values are team estimates: `status: "est"`, no `departs`, source `"team estimate, to verify"`. **Never add departure times.**

- [ ] **Step 1: Write the failing test**

Add `import { resolveLeg } from "./engine/model.js";` next to the `buildModel` import (merge: `import { buildModel, resolveLeg } from "./engine/model.js";`). Append above `  return results;`:

```js
  // ---------- A8 data: new legs, one-way verified JETT ----------
  test("Legs: new est. legs, and the JETT timetable is only verified Amman → Petra", (expect) => {
    const back = resolveLeg(model, "petra", "amman").options[0];
    expect("reverse JETT", [back.label, back.status, back.departs, back.notes], ["JETT bus Wadi Musa → Abdali", "est", null, "Return schedule to verify."]);
    const fwd = resolveLeg(model, "amman", "petra").options[0];
    expect("forward JETT still verified", [fwd.status, fwd.departs], ["verified", "06:30"]);
    const added = [["amman", "aqaba"], ["petra", "aqaba"], ["wadi-rum", "aqaba"], ["amman", "kerak"], ["dana", "petra"], ["AQJ", "aqaba"]];
    expect("seeded both ways", added.map(([a, b]) => [resolveLeg(model, a, b).fallback, resolveLeg(model, b, a).fallback]).flat().every((x) => x === false), true);
    expect("all est., no times", added.flatMap(([a, b]) => resolveLeg(model, a, b).options).every((o) => o.status === "est" && !o.departs), true);
    expect("AQJ → Aqaba taxi", resolveLeg(model, "AQJ", "aqaba").options[0].cost, [8, 12]);
    const back4 = fix(trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Amman\nDay 5: Fly home from Amman", { airport: "AQJ", departAirport: "AMM" }), model);
    const leg = back4.fixed.days.flatMap((d) => d.items).find((i) => i.kind === "leg" && i.legKey === "petra~amman");
    expect("Petra → Amman shows no ✓", leg?.verified, false);
    const t3 = trip("Day 1: Arrive Aqaba\nDay 2: Wadi Rum\nDay 3: Petra\nDay 4: Aqaba, fly home", { airport: "AQJ" });
    expect("AQJ in and out: last legs", dayRoute(t3.days, 3, t3.settings, model).legs.map((l) => l.key), ["petra~aqaba", "aqaba~AQJ"]);
    expect("AQJ in and out, Aqaba at the end: all ok", check(t3, model).days.map((d) => d.status), ["ok", "ok", "ok", "ok"]);
  });
```

- [ ] **Step 2: Run to verify it fails**, `FAIL Legs: …` (`reverse JETT: expected ["JETT bus Wadi Musa → Abdali","est",null,…], got ["JETT bus Abdali → Wadi Musa","verified","06:30",…]`).

- [ ] **Step 3: `model.js`**

After `const round5 = (x) => Math.round(x / 5) * 5;` add:

```js

/** The return trip of a one-way-verified scheduled option: no departure time, no ✓, est. price. */
function reverseOption(o) {
  if (!o.departs) return o;
  return {
    ...o, label: o.returnLabel || o.label, departs: null, arrives: null,
    status: "est", verifiedOn: null, stale: false, notes: "Return schedule to verify."
  };
}
```

In `resolveLeg`, replace the `if (seed) { return { … options: seed.options, fallback: false }; }` block with:

```js
  if (seed) {
    // A timetable was checked in one direction only: used backwards, a scheduled option loses its times and ✓.
    const reversed = seed.from !== from;
    const options = reversed && seed.oneWayVerified ? seed.options.map(reverseOption) : seed.options;
    return {
      key: legKey(from, to), id: seed.id, from, to, km,
      driveMin: seed.driveMin, publicTransport: seed.publicTransport,
      timeSensitive: seed.timeSensitive || null, evidence: seed.evidence || null, warning: seed.warning || null,
      options, fallback: false, reversed
    };
  }
```

- [ ] **Step 4: `legs.json`**

In the `amman-petra` leg add `"oneWayVerified": true,` after `"publicTransport": "scheduled",`, and in its JETT option add `"returnLabel": "JETT bus Wadi Musa → Abdali",` after the `"label"`. In `_meta.note` change `10 seed transport legs` to `16 seed transport legs` and append ` 'oneWayVerified': the timetable was checked in the from→to direction only; reversed, options with departure times are shown as est. with no times.`

Append these six objects to the `legs` array (after `amman-dana`, mind the comma):

```json
    {
      "id": "amman-aqaba", "from": "amman", "to": "aqaba", "driveMin": 240, "publicTransport": "scheduled",
      "options": [
        { "mode": "bus", "operator": "JETT", "label": "JETT bus Amman → Aqaba", "durationMin": 270, "cost": [10, 12], "status": "est", "source": "team estimate, to verify", "recommended": true, "notes": "Departure times to verify on jett.com.jo, Darb shows no times until checked." },
        { "mode": "driver", "label": "Private driver day", "durationMin": 240, "cost": [90, 120], "status": "est", "source": "team estimate, to verify" }
      ]
    },
    {
      "id": "petra-aqaba", "from": "petra", "to": "aqaba", "driveMin": 120, "publicTransport": "limited",
      "options": [
        { "mode": "driver", "label": "Private driver", "durationMin": 120, "cost": [45, 60], "status": "est", "source": "team estimate, to verify", "recommended": true }
      ]
    },
    {
      "id": "wadi-rum-aqaba", "from": "wadi-rum", "to": "aqaba", "driveMin": 60, "publicTransport": "limited",
      "options": [
        { "mode": "driver", "label": "Taxi / driver", "durationMin": 60, "cost": [25, 35], "status": "est", "source": "team estimate, to verify", "recommended": true }
      ]
    },
    {
      "id": "amman-kerak", "from": "amman", "to": "kerak", "driveMin": 120, "publicTransport": "limited",
      "options": [
        { "mode": "minibus", "label": "Minibus from South station", "durationMin": null, "durationText": "To verify", "cost": null, "status": "est", "source": "team estimate, to verify", "notes": "Times and fare to verify." },
        { "mode": "driver", "label": "Private driver", "durationMin": 120, "cost": [40, 55], "status": "est", "source": "team estimate, to verify", "recommended": true }
      ]
    },
    {
      "id": "dana-petra", "from": "dana", "to": "petra", "driveMin": 105, "publicTransport": "none",
      "options": [
        { "mode": "driver", "label": "Private driver", "durationMin": 105, "cost": [40, 55], "status": "est", "source": "team estimate, to verify", "recommended": true }
      ]
    },
    {
      "id": "AQJ-aqaba", "from": "AQJ", "to": "aqaba", "driveMin": 15, "publicTransport": "limited",
      "options": [
        { "mode": "taxi", "label": "Airport taxi", "durationMin": 15, "cost": [8, 12], "status": "est", "source": "team estimate, to verify", "recommended": true }
      ]
    }
```

Verify: `node -e "const l=require('<repo>/public/data/legs.json').legs;console.log(l.length, l.filter(x=>x.options.some(o=>o.status==='verified')).map(x=>x.id))"` → `16 [ 'amman-petra' ]`.

- [ ] **Step 5: Run the tests**, Expected: 30 `PASS`; the four `Reference` cases still `PASS`.

- [ ] **Step 6: Bust the client cache**, in `public/js/data.js` change `const CACHE_KEY = "darb:data:v1";` to `const CACHE_KEY = "darb:data:v2";` (Review Focus 1: returning visitors re-read Firestore after deploy).

- [ ] **Step 7: Re-render destinations**

Run: `cd <repo> && node scripts/render-destinations.mjs`
Expected: `Rendered 12 cards, 16 Q/A into destinations.html`. `grep -c "No verified route yet" public/destinations.html` → `0` (Aqaba, Kerak now have Q/A). `grep -n "Wadi Musa → Abdali\|returnLabel" public/destinations.html` → nothing (forward direction only is rendered).

- [ ] **Step 8: Seed, CONTROLLER, not the implementer**

Tell the controller: "legs.json and places.json changed (A1 + A8): run `node scripts/seed.mjs` before deploying (it overwrites whole places/legs docs, admin edits since the last seed are lost)." This is done in Deploy checkpoint A.

- [ ] **Step 9: Commit**

```bash
cd <repo> && git add public/data/legs.json public/js/engine/model.js public/js/data.js public/js/test-cases.js public/destinations.html && git commit -m "Data: est. legs Amman/Petra/Wadi Rum/AQJ–Aqaba, Amman–Kerak, Dana–Petra; JETT verified one way only; data cache v2"
```

---

### Task A8b: Official-source verification pass (web only)

Estimated: 50 min. **Runs after A8 (which adds legs to `legs.json`) and before A9.**

The answer to "how do we make the data real?" is evidence, not more estimates. This task checks each value against the official page and records where it was confirmed. A value becomes `verified` only when an official page states it and the log holds a verbatim quote. Everything else stays `est`.

**Safety rules (binding):**
- Use the **WebFetch** tool only: one read of each listed URL, plus at most one link followed from that page to the price or timetable page. No loops, no crawling, no headless browser, no form filling.
- **Never automate the JETT booking flow.** If jett.com.jo only shows a price or time after interaction, log `not confirmed, needs manual check with screenshot` and leave the value `est`.
- Never add a departure time or price the page does not state word for word.
- If a page is unreachable, blocked (403/404/timeout) or does not state the value, the item stays `est`. The log then says `not confirmed, <reason>`.

**Files:**
- Create: `docs/data/verification-log.md`
- Modify: `public/data/places.json` (tickets), `public/data/legs.json` (options), `public/data/jordan-pass.json` (`_meta`), confirmed values only
- Regenerate: `public/destinations.html`

**Interfaces:**
- Produces the verified-value shape that Tasks B9 and D1 rely on. It is the same for a leg option and a place ticket:

```json
{ "status": "verified", "verifiedOn": "2026-09-30", "source": "<domain>, <page title>", "sourceUrl": "<https URL of the page that states the value>", "method": "web" }
```

  The keys are merged into the existing option or ticket object; `jod`, `cost`, `departs` and `label` keep their names.
- Consumes: `buildModel` (90-day staleness is unchanged: `verifiedOn` 2026-09-30 turns into est. on 2026-12-29, which is why every row's `nextCheck` is 2026-12-29).

**Items that touch the reference result (Sarah's 58 → 94, save 33).** The Jordan Pass sum only includes **verified** covered tickets. The reference trip visits Amman, Petra, Wadi Rum, Jerash, the Dead Sea and Madaba. Therefore:
- Flipping the **Wadi Rum** ticket (5 JOD, covered by the Pass) to verified changes "Bought separately" from 108 to 113 and the saving from 33 to 38.
- Giving **Madaba** a confirmed price has the same effect.

For these two, and for any confirmed value that differs from the current JSON on a reference place (Amman 3, Jerash 10, Petra 50/55/60, the tiers 70/75/80, visa 40, JETT 10), do **not** edit the JSON. Log the finding with `decision: controller` and report it; the controller decides whether to change the documented reference numbers. Ajloun, Umm Qais, Kerak, Dana, Aqaba, the Dead Sea (not covered by the Pass) and all legs except `amman-petra` can be updated directly.

- [ ] **Step 1: Create `docs/data/verification-log.md`**

```markdown
# Data verification log

One row per value checked against an official source. Only rows with a verbatim quote may set `status: "verified"`
in `public/data/*.json`. `nextCheck` = verifiedOn + 90 days (the engine shows older values as est.).
Method: web | phone | field | whatsapp | operator (see docs/DATA_VERIFICATION.md).

| id | field | value | method | sourceUrl | quote (≤ 200 chars, verbatim) | verifiedOn | nextCheck | result |
|---|---|---|---|---|---|---|---|---|
| places/petra.ticket | jod (1/2/3 days) | 50 / 55 / 60 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/petra.ticket | notes (same-day, no overnight) | 90 | web | | | 2026-09-30 | 2026-12-29 | pending |
| config/jordanPass | tiers | 70 / 75 / 80 | web | | | 2026-09-30 | 2026-12-29 | pending |
| config/jordanPass | visa waiver rule | 40 JOD waived, ≥ 3 nights, bought before arrival | web | | | 2026-09-30 | 2026-12-29 | pending |
| config/jordanPass | covered sites | list | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/jerash.ticket | jod | 10 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/ajloun.ticket | jod | 3 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/umm-qais.ticket | jod | 5 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/kerak.ticket | jod | 2 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/amman.ticket | jod (Citadel) | 3 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/wadi-rum.ticket | jod (protected area) | 5 | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/dana.ticket | jod | null | web | | | 2026-09-30 | 2026-12-29 | pending |
| places/dead-sea.ticket | jod (Amman Beach day) | null | web | | | 2026-09-30 | 2026-12-29 | pending |
| legs/amman-petra.options[0] | departs / cost | 06:30 / 10 | web | | | 2026-09-30 | 2026-12-29 | pending |
| legs/amman-aqaba.options[0] | departs / cost |, / 10–12 | web | | | 2026-09-30 | 2026-12-29 | pending |
| legs/AMM-amman.options[1] | Airport Express schedule / fare |, / null | web | | | 2026-09-30 | 2026-12-29 | pending |
| legs/AMM-amman.options[0] | airport taxi fixed fare | 20–25 | web | | | 2026-09-30 | 2026-12-29 | pending |
```

- [ ] **Step 2: Fetch each official page (WebFetch, one read each)**

For each row, call WebFetch with the URL and this prompt, filling in the value: *"Quote verbatim (max 200 characters) the sentence on this page that states <the value>, and give the page title. If the page does not state it, answer exactly: NOT STATED."* Try the URLs in order and stop at the first one that states the value. The paths marked *candidate* are unverified guesses. If one 404s, log that and move to the next URL. Do not guess further paths.

| row | URLs to try (in order) |
|---|---|
| Petra 50/55/60 and the 90 JOD same-day rule | `https://visitpetra.jo/en` → the "Tickets"/"Entrance fees" link on that page (one hop) · *candidate* `https://visitpetra.jo/en/page/tickets` |
| Jordan Pass tiers, visa rule, covered sites | `https://jordanpass.jo` → its "Prices" or "FAQ" link (one hop) · *candidate* `https://www.jordanpass.jo/Contents/Prices.aspx` |
| Jerash 10 / Ajloun 3 / Umm Qais 5 / Kerak 2 / Citadel 3 | `https://jordanpass.jo` → the "Sites included"/"Attractions" link (one hop) · `https://www.mota.gov.jo` → its "Tourist sites entrance fees" link (one hop) |
| Wadi Rum protected-area fee 5 | `https://www.wadirum.jo` · `https://aseza.jo` → its Wadi Rum or fees link (one hop) |
| Dana entry | `https://www.rscn.org.jo` · `https://wildjordan.com` → the Dana page (one hop) |
| Amman Beach (Dead Sea) day price | *candidate* `https://ammanbeach.com`, if there is no official site, log `not confirmed, no official page` (it goes on the phone list) |
| JETT Amman–Petra 06:30 / 10 JOD, Amman–Aqaba | `https://jett.com.jo/en` (one read; do not open the booking form). If times or fares only appear after choosing a route, log `not confirmed, needs manual check with screenshot`. The Amman–Petra row keeps its existing `verified 2026-09-24` from the team's booking-system check either way. |
| Airport Express bus (Sariyah) | *candidate* `https://www.sariyah.com` · `https://www.qaiairport.com` → its "Transportation"/"To and from the airport" link (one hop) |
| Airport fixed-fare taxi tariff | `https://www.qaiairport.com` → the same transportation page (one hop) |

Fill each row: `sourceUrl` (the page that stated it), the verbatim `quote`, and `result` = `confirmed`, `confirmed, differs: page says X`, or `not confirmed, <reason>` (404, 403, timeout, not stated, needs interaction). Add a `decision: controller` note to any reference item as described above.

- [ ] **Step 3: Update the JSON, confirmed rows only**

Merge the verified-value keys into the matching object. Example for a confirmed Jerash row (a reference place with an unchanged value, so it is allowed):

```json
"ticket": { "jod": 10, "status": "verified", "verifiedOn": "2026-09-30", "coveredByJordanPass": true, "label": "Jerash",
            "source": "jordanpass.jo, <page title from the log>", "sourceUrl": "<sourceUrl from the log>", "method": "web" },
```

- For a leg option, add the same five keys. Keep the existing `departs` only if the page states the same time; never add a `departs` that the quote does not contain.
- For `jordan-pass.json`, set `_meta.verifiedOn`, `_meta.source`, `_meta.sourceUrl`, `_meta.method` when all three Pass rows are confirmed.
- Rows that are `not confirmed` stay unchanged.
- Rows whose confirmed value differs on a non-reference item: update the value and put the old value in the log's `result`.

Cross-check that the log and the JSON agree:

```bash
cd <repo> && node -e '
const fs=require("fs"); const log=fs.readFileSync("docs/data/verification-log.md","utf8");
const P=JSON.parse(fs.readFileSync("public/data/places.json")).places, L=JSON.parse(fs.readFileSync("public/data/legs.json")).legs;
const items=[...P.map(p=>[`places/${p.id}.ticket`,p.ticket]),...L.flatMap(l=>l.options.map((o,i)=>[`legs/${l.id}.options[${i}]`,o]))];
let bad=0; for (const [id,o] of items) if (o&&o.verifiedOn==="2026-09-30") { const row=log.split("\n").find(r=>r.startsWith(`| ${id} `)&&/\| confirmed/.test(r)); if(!row||!o.sourceUrl){console.log("NO EVIDENCE",id);bad++} }
console.log(bad?`${bad} problem(s)`:"log and JSON agree"); process.exit(bad?1:0)'
```

Expected: `log and JSON agree`.

- [ ] **Step 4: Re-render and run the tests**

```bash
cd <repo> && node scripts/render-destinations.mjs && node -e "import('./public/js/test-cases.js').then(async m=>{const f=p=>JSON.parse(require('fs').readFileSync('public/data/'+p));const {places,airports}=f('places.json');for(const r of m.runCases({places,airports,legs:f('legs.json').legs,pass:f('jordan-pass.json')}))console.log(r.ok?'PASS':'FAIL',r.name)})"
```

Expected: `Rendered 12 cards, 16 Q/A into destinations.html`, then 30 `PASS` lines, including `Reference: Jordan Pass, Explorer 75 vs 108 → save 33 JOD`. If a reference case fails, a reference value was changed by mistake: revert that JSON edit, mark the row `decision: controller`, and report it. **Do not edit the expected values in `test-cases.js`.**

- [ ] **Step 5: Commit**

```bash
cd <repo> && git add docs/data/verification-log.md public/data/places.json public/data/legs.json public/data/jordan-pass.json public/destinations.html && git commit -m "Data: official-source verification pass (web), evidence log with URLs and quotes"
```

(The controller's seed in Deploy checkpoint A pushes these values to Firestore.)

**Phone / field checklist for the team tomorrow morning** (these cannot be confirmed from the web; each answer goes into the log with `method` = phone / whatsapp / field and the date):

| # | Who | Exact question to ask | JSON field it fills |
|---|---|---|---|
| 1 | Wadi Rum camp A (from its booking page) | "What do you charge for a private car from Wadi Musa (Petra) to your camp, arriving before 16:00, per car, for 1–3 people?" | `legs.json` → `petra-wadi-rum.options[0].cost` (min of the quotes) |
| 2 | Wadi Rum camp B | same question | same field (max of the quotes) → `status: "verified"`, `method: "whatsapp"`, `verifiedOn` |
| 3 | Private driver A (licensed, via hotel) | "Your full-day rate with car, 10 hours, Amman–Dead Sea–Madaba–Amman? And a one-way Amman → Dead Sea (Amman Beach) drop?" | fallback "Private driver day" range in the log → `legs.json` `amman-dead-sea.options[0].cost` |
| 4 | Private driver B | same questions | same fields (min/max of both drivers) |
| 5 | Amman Beach (Dead Sea) front desk | "What is today's day-use entry price per adult, and does it include towel/pool?" | `places.json` → `dead-sea.ticket.jod`, `label` "Amman Beach day use" |
| 6 | Tabarbour (North) station, Jerash minibus | "What time does the first and the last minibus leave for Jerash, and the fare?" (in person, photo of the sign) | `legs.json` → `amman-jerash.options[0]` `cost`, `notes`; add `departs` **only** if there is a fixed timetable (most leave when full → notes "leaves when full, first ~HH:MM, last ~HH:MM", no `departs`) |
| 7 | South station (Mujamma al-Janoubi), Madaba minibus | same questions for Madaba | `legs.json` → `amman-madaba.options[0]` `cost`, `notes` |

---

### Task A9: Honesty copy, fallback banner, car hire, trip total in the spec

Estimated: 20 min.

**Files:**
- Modify: `public/js/engine/fixer.js` (car hire in `cost`)
- Modify: `public/js/render/fixed-plan.js:108-136` (`renderCostCard`)
- Modify: `public/js/pages/leg.js:107-109` (banner text)
- Modify: `public/js/test-cases.js` (1 case)
- Modify: `CLAUDE.md` §4.6

**Interfaces:**
- Produces: `fixed.cost.carHire: [min, max] | null` (est., 25–30 JOD per day × days; included in `total`); `CAR_HIRE_PER_DAY = [25, 30]` exported from fixer.js.

- [ ] **Step 1: Write the failing test**

Append above `  return results;`:

```js
  // ---------- A9 car hire in the trip cost ----------
  test("Car trips: rental est. 25–30 JOD per day is in the total", (expect) => {
    const car = fix(trip(REFERENCE_TEXT, { car: true }), model).fixed.cost;
    expect("carHire", car.carHire, [125, 150]);
    expect("total = pass + car hire", car.total, [car.passJod + 125, car.passJod + 150]);
    expect("no car → no car hire", refFix.fixed.cost.carHire, null);
    expect("reference total", refFix.fixed.cost.total, [305, 385]);
  });
```

- [ ] **Step 2: Run to verify it fails**, `FAIL Car trips: …` (`carHire: expected [125,150], got undefined`).

- [ ] **Step 3: fixer.js**

Below `const HEAVY_HOURS = 5;` add `export const CAR_HIRE_PER_DAY = [25, 30];`. Replace the `const cost = { … };` block with:

```js
  // Own car: the legs cost fuel only, so the rental itself goes on the bill (est., per day, fuel not included).
  const carHire = t.settings.car ? CAR_HIRE_PER_DAY.map((x) => x * t.days.length) : null;
  const cost = {
    pass: passLine, passJod: passLine.jod, busJod: fixedJod, transfers: range, unknownLegs: unknown, carHire,
    total: [0, 1].map((k) => passLine.jod + fixedJod + range[k] + (carHire ? carHire[k] : 0)),
    savings: pass.paysOff ? pass.savings : 0
  };
```

- [ ] **Step 4: Run the tests**, Expected: 31 `PASS`.

- [ ] **Step 5: Cost card**, in `public/js/render/fixed-plan.js` `renderCostCard`, after the `unknownLegs` row block add:

```js
  if (cost.carHire) {
    rows.push(html`<div class="cost-row"><span>Car hire (fuel not included)</span><span class="cost-est">est. ${fmtRange(cost.carHire)}</span></div>`);
  }
```

and replace the `<p class="side-note">…</p>` line with:

```js
      <p class="side-note">Excludes camp, meals and small site fees. Estimates show ranges until verified; every price shows its last-verified date.${cost.carHire ? " With your own car, long drives are on you, Darb doesn’t limit driving hours." : ""}</p>
```

- [ ] **Step 6: Leg banner**, in `public/js/pages/leg.js` replace

```js
  const banner = leg.publicTransport === "none"
    ? html`<div class="leg-banner" role="note">${raw(icon("x"))}<p>${leg.evidence || "No scheduled public transport on this leg, the public bus option your plan assumed isn’t available."}</p></div>`
    : "";
```

with

```js
  // Only say "the bus your plan assumed" when the plan really said bus; fallback legs are road-distance estimates.
  const plannedMode = trip?.days?.find((d) => d.n === dayN)?.hints?.mode || null;
  const noPublic = plannedMode === "bus"
    ? "No scheduled public transport on this leg, the public bus option your plan assumed isn’t available."
    : leg.fallback
      ? "No scheduled public transport on this route in our data, time and price are estimated from road distance."
      : "No scheduled public transport on this route, plan a taxi or driver.";
  const banner = leg.publicTransport === "none"
    ? html`<div class="leg-banner" role="note">${raw(icon("x"))}<p>${leg.evidence || noPublic}</p></div>`
    : "";
```

- [ ] **Step 7: CLAUDE.md §4.6**, replace `→ "Estimated total 255–300 JOD" as a range.` with `→ "Estimated total 305–385 JOD" for the reference trip (Explorer 75 + JETT 10 ✓ + transfers est. 220–300) as a range. With a car: + "Car hire (fuel not included) est. 25–30 JOD × days".`

- [ ] **Step 8: Browser check**, `/plan.html?demo=1`, choose **Yes, renting a car**, Check → Fix all → Trip cost shows `Car hire (fuel not included) est. 125–150 JOD` and the long-drives sentence. Open a Wadi Rum → Dead Sea leg link from a no-car reference check: banner reads `No scheduled public transport on this route in our data, time and price are estimated from road distance.`

- [ ] **Step 9: Commit**

```bash
cd <repo> && git add public/js/engine/fixer.js public/js/render/fixed-plan.js public/js/pages/leg.js public/js/test-cases.js CLAUDE.md && git commit -m "Honesty: car hire in trip cost, fallback leg banner only blames a bus the plan named, spec total 305–385"
```

---

### Task A-deploy: Deploy checkpoint A, CONTROLLER

Estimated: 10 min.

- [ ] **Step 1 (implementer):** run the test run → 31 `PASS`; `node scripts/check-contrast.mjs` → exit 0. In `public/sw.js` change `const SHELL = "darb-shell-v3";` to `const SHELL = "darb-shell-v4";` and commit: `git add public/sw.js && git commit -m "SW shell v4"`.
- [ ] **Step 2 (CONTROLLER):** `cd <repo> && node scripts/seed.mjs` → places, legs and config written.
- [ ] **Step 3 (CONTROLLER):** `firebase deploy --only hosting && git push`.
- [ ] **Step 4 (CONTROLLER):** smoke test on https://darb-pixelsdev.web.app in a fresh profile: `/plan?demo=1` → Check = 58 → Fix all = 94; paste the AUDIT_MARKDOWN text → preview `We read 5 days: Day 1 Amman · Day 2 Petra · Day 3 Wadi Rum · Day 4 Dead Sea · Day 5 Madaba`; `/tests` shows `31 / 31 passed`.

---

# GROUP B, after A, before 18:00

### Task B1: SEO pack, robots, sitemap, llms.txt, Open Graph, noindex

Estimated: 35 min.

**Files:**
- Create: `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `public/og.html`, `public/og.png` (screenshot)
- Modify: heads of `public/index.html`, `plan.html`, `build.html`, `destinations.html`, `dashboard.html`, `trip.html` (OG/Twitter + canonical), `check.html`, `fixed.html`, `leg.html` (noindex)

**Interfaces:** none (static files).

- [ ] **Step 1: `public/robots.txt`**

```text
User-agent: *
Allow: /
Disallow: /admin
Disallow: /check
Disallow: /fixed
Disallow: /trip
Disallow: /leg
Disallow: /tests
Disallow: /og.html
Disallow: /icon.html

Sitemap: https://darb-pixelsdev.web.app/sitemap.xml
```

(`/t/<id>` share links stay crawlable so WhatsApp/X can fetch the preview; `trip.html` already has `noindex`.)

- [ ] **Step 2: `public/sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://darb-pixelsdev.web.app/</loc><lastmod>2026-09-30</lastmod></url>
  <url><loc>https://darb-pixelsdev.web.app/plan</loc><lastmod>2026-09-30</lastmod></url>
  <url><loc>https://darb-pixelsdev.web.app/build</loc><lastmod>2026-09-30</lastmod></url>
  <url><loc>https://darb-pixelsdev.web.app/destinations</loc><lastmod>2026-09-30</lastmod></url>
  <url><loc>https://darb-pixelsdev.web.app/dashboard</loc><lastmod>2026-09-30</lastmod></url>
</urlset>
```

- [ ] **Step 3: `public/llms.txt`**

```text
# Darb (درب), Jordan trips, reality-checked

> Darb checks a Jordan itinerary day by day against local transport data and fixes it: paste a plan (or build one), get a Reality Score out of 100, each day marked OK / Risky / Not feasible with the reason, a fix and the cost in JOD, then a corrected plan with every transport leg costed. Rule-based (no AI), built by team PixelsDev on Firebase.

Honesty rule: only values marked "verified" carry a check mark and a verified date; everything else is an estimate ("est.") shown as a range. Verified values older than 90 days are shown as estimates.

## Pages
- [Check my plan](https://darb-pixelsdev.web.app/plan): paste an itinerary, choose airports, month, car.
- [Build a plan](https://darb-pixelsdev.web.app/build): pick interests; only reachable places are suggested.
- [Destinations](https://darb-pixelsdev.web.app/destinations): the 12 covered places with transport answers and prices.
- [Dashboard](https://darb-pixelsdev.web.app/dashboard): anonymous aggregate of checked plans (demo figures are labelled demo data).

## Verified facts (checked 24 Sep 2026)
- JETT bus Abdali (Amman) → Wadi Musa (Petra): departs 06:30, 10 JOD. The return timetable is not verified.
- Petra entry: 50 JOD (1 day), 55 JOD (2 days), 60 JOD (3 days).
- Jerash entry 10 JOD; Amman Citadel 3 JOD.
- Jordan Pass: Wanderer 70, Explorer 75, Expert 80 JOD (by Petra days); the 40 JOD visa fee is waived only if the Pass is bought before arrival and the stay is at least 3 nights.
- Wadi Rum is not bookable in JETT's booking system; there is no scheduled public bus from Petra that reaches Wadi Rum in time for a sunset tour.

## Covered places
Amman, Jerash, Ajloun, Umm Qais, As-Salt, Dead Sea, Madaba & Mount Nebo, Petra, Wadi Rum, Aqaba, Dana, Kerak. Not covered yet: Desert Castles, Azraq, Wadi Mujib, Little Petra, Feynan, Shobak, Baptism Site, Irbid, Ma'in.
```

- [ ] **Step 4: `public/og.html`** (the 1200×630 share image source)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>Darb share image</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/css/tokens.css">
  <style>
    html, body { width: 1200px; height: 630px; overflow: hidden; }
    body { background: var(--sand); display: flex; flex-direction: column; justify-content: space-between; padding: 72px 80px; box-sizing: border-box; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 40px; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); }
    .dot { width: 22px; height: 22px; border-radius: 50%; background: var(--rose); }
    h1 { font-size: 84px; font-weight: 800; line-height: 1.02; letter-spacing: -0.04em; color: var(--ink); max-width: 980px; }
    .row { display: flex; gap: 20px; align-items: center; font-size: 30px; font-weight: 700; color: var(--muted); }
    .score { padding: 10px 22px; border-radius: 16px; background: var(--amber-soft); color: var(--amber-text); }
    .score.good { background: var(--green-soft); color: var(--green-text); }
  </style>
</head>
<body>
  <div class="brand"><span class="dot"></span>darb</div>
  <h1>Your Jordan plan, reality-checked.</h1>
  <div class="row"><span class="score">58</span><span>→ Fix all →</span><span class="score good">94</span><span>· every leg costed in JOD</span></div>
</body>
</html>
```

- [ ] **Step 5: Screenshot it to `public/og.png` (Playwright MCP)**

Server running. `browser_resize` width 1200 height 630 → `browser_navigate` `http://localhost:8100/og.html` → wait 1 s for the font → `browser_take_screenshot` with `filename: "og.png"` (viewport, not fullPage, type png). The MCP saves under `<repo>/.playwright-mcp/`; then:

```bash
cp <repo>/.playwright-mcp/og.png <repo>/public/og.png && file <repo>/public/og.png
```

Expected: `PNG image data, 1200 x 630, …`. If the Retina scale gave 2400 × 1260, re-take with `browser_run_code_unsafe`: `await page.setViewportSize({width:1200,height:630}); await page.screenshot({path:'<repo>/public/og.png', scale:'css'})`.

- [ ] **Step 6: Head tags**

For each public page insert this block right after its `<meta name="description" …>` line, with `PATH`, `TITLE` and `DESC` from the table (TITLE/DESC reuse the page's existing `<title>` and description text; HTML-escape `&` as `&amp;`):

```html
  <link rel="canonical" href="https://darb-pixelsdev.web.app/PATH">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Darb">
  <meta property="og:url" content="https://darb-pixelsdev.web.app/PATH">
  <meta property="og:title" content="TITLE">
  <meta property="og:description" content="DESC">
  <meta property="og:image" content="https://darb-pixelsdev.web.app/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="TITLE">
  <meta name="twitter:description" content="DESC">
  <meta name="twitter:image" content="https://darb-pixelsdev.web.app/og.png">
```

| file | PATH | TITLE |
|---|---|---|
| index.html | *(empty, `…web.app/`)* | Darb, Your Jordan plan, reality-checked |
| plan.html | `plan` | Check your Jordan plan, Darb |
| build.html | `build` | Build a Jordan plan that actually works, Darb |
| destinations.html | `destinations` | Jordan destinations, verified transport &amp; prices, Darb |
| dashboard.html | `dashboard` | Where tourism gets stuck, Darb |
| trip.html | *(omit the two canonical/og:url lines, the URL is per trip)* | A reality-checked Jordan plan, Darb |

`destinations.html` already has a canonical line, do not add a second one. Then add `<meta name="robots" content="noindex">` after the description in `check.html`, `fixed.html` and `leg.html`.

Verify: `grep -c 'og:image"' <repo>/public/{index,plan,build,destinations,dashboard,trip}.html` → each `1`; `grep -L 'name="robots"' <repo>/public/{check,fixed,leg,trip,admin,tests,404}.html` → no output; `grep -c 'rel="canonical"' <repo>/public/destinations.html` → `1`.

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 7: Run the tests, commit**

Run: the test run → 31 `PASS`.

```bash
cd <repo> && git add public/robots.txt public/sitemap.xml public/llms.txt public/og.html public/og.png public/*.html && git commit -m "SEO: robots, sitemap, llms.txt, Open Graph/Twitter cards + og.png, noindex on token pages"
```

---

### Task B2: Wadi Rum sunset on the leg page

Estimated: 30 min.

**Data correction (read this):** the controller's table (Oct 17:25 …) is one hour early: Jordan has stayed on UTC+3 all year since October 2022. The table below is Open-Meteo's `daily=sunset` for Wadi Rum (29.575 N, 35.42 E) on the 15th of each month of 2025, `timezone=Asia/Amman` (archive-api.open-meteo.com, fetched 30 Sep 2026). A live call for 2 Oct 2026 returned 18:22, consistent with it. Step 2 re-verifies it with curl.

**Files:**
- Modify: `public/js/weather.js` (exports `WADI_RUM_SUNSET`, `staticSunset`, `tripDayIso`, `sunsetLine`, `sunsetFor`)
- Modify: `public/js/pages/leg.js`, `public/css/pages/leg.css`
- Modify: `public/js/test-cases.js` (import + 1 case)

**Interfaces:**
- Produces: `staticSunset(placeId, month) → "HH:MM" | null` (Wadi Rum only); `tripDayIso(startDate, n) → "YYYY-MM-DD" | null`; `sunsetLine({ time, live, date }, month, timeSensitive) → string`; `sunsetFor(place, dateIso, month, today?) → Promise<{ time, live, date } | null>` (never throws).

- [ ] **Step 1: Write the failing test**

Add `import { staticSunset, tripDayIso, sunsetLine } from "./weather.js";` to test-cases.js and append above `  return results;`:

```js
  // ---------- B2 sunset ----------
  test("Sunset: static Wadi Rum table and the leg banner line", (expect) => {
    expect("October", staticSunset("wadi-rum", 10), "18:07");
    expect("June", staticSunset("wadi-rum", 6), "19:39");
    expect("only Wadi Rum has a table", [staticSunset("petra", 10), staticSunset("wadi-rum", 13)], [null, null]);
    expect("trip day 3", tripDayIso("2026-10-12", 3), "2026-10-14");
    expect("no start date", tripDayIso(null, 3), null);
    const ts = "Sunset jeep tours need arrival before ~16:00.";
    expect("static line", sunsetLine({ time: "18:07", live: false, date: null }, 10, ts), "Sunset ≈ 18:07 in October, arrive by 16:00");
    expect("live line", sunsetLine({ time: "18:22", live: true, date: "2026-10-02" }, 10, ts), "Sunset 18:22 on 2 Oct (Open-Meteo forecast), arrive by 16:00");
  });
```

- [ ] **Step 2: Verify the API shape and the table, then run to see it fail**

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=29.575&longitude=35.42&daily=sunset&timezone=Asia%2FAmman&start_date=2026-10-02&end_date=2026-10-02"
```

Expected: JSON with `"daily":{"time":["2026-10-02"],"sunset":["2026-10-02T18:2…"]}`, sunset is a local ISO string; `slice(11, 16)` gives `HH:MM`.

```bash
curl -s "https://archive-api.open-meteo.com/v1/archive?latitude=29.575&longitude=35.42&daily=sunset&timezone=Asia%2FAmman&start_date=2025-01-01&end_date=2025-12-31" | python3 -c "import json,sys;d=json.load(sys.stdin)['daily'];print([s[11:16] for t,s in zip(d['time'],d['sunset']) if t.endswith('-15')])"
```

Expected: `['18:01', '18:27', '18:46', '19:05', '19:23', '19:39', '19:39', '19:18', '18:43', '18:07', '17:43', '17:41']`. If it differs, use the printed values in Step 3 and in the test.

Run the test run → `FAIL Sunset: …` (`staticSunset is not a function` → `threw`).

- [ ] **Step 3: Implement in `public/js/weather.js`**

Add at the top `import { fmtDate, monthName } from "./engine/format.js";` and append:

```js
/** Wadi Rum sunset (local time, Asia/Amman = UTC+3 all year) on the 15th of each month, Open-Meteo archive 2025. */
export const WADI_RUM_SUNSET = ["18:01", "18:27", "18:46", "19:05", "19:23", "19:39", "19:39", "19:18", "18:43", "18:07", "17:43", "17:41"];

/** Static sunset "HH:MM" for a month 1..12; only Wadi Rum (the time-sensitive leg) has a table. */
export const staticSunset = (placeId, month) =>
  (placeId === "wadi-rum" && month >= 1 && month <= 12 ? WADI_RUM_SUNSET[month - 1] : null);

/** ISO date of trip day n (1-based) from settings.startDate, or null without a start date. */
export function tripDayIso(startDate, n) {
  const d = utcDay(startDate);
  if (!d || !(n >= 1)) return null;
  return isoDay(new Date(d.getTime() + (n - 1) * DAY_MS));
}

/** "Sunset ≈ 18:07 in October, arrive by 16:00" (static) / "Sunset 18:22 on 2 Oct (Open-Meteo forecast), arrive by 16:00" (live). */
export function sunsetLine(s, month, timeSensitive = "") {
  const by = /before ~?(\d{1,2}:\d{2})/.exec(timeSensitive || "")?.[1];
  const tail = by ? `, arrive by ${by}` : "";
  return s.live ? `Sunset ${s.time} on ${fmtDate(s.date)} (Open-Meteo forecast)${tail}` : `Sunset ≈ ${s.time} in ${monthName(month)}${tail}`;
}

/**
 * sunsetFor(place, dateIso, month) → { time, live, date } | null. Live from Open-Meteo `daily=sunset` when the
 * date is within the 16-day forecast (cached 6 h); otherwise, or on any failure, the static table. Never throws.
 */
export async function sunsetFor(place, dateIso, month, today = new Date()) {
  const fallback = () => {
    const time = staticSunset(place?.id, Number(month));
    return time ? { time, live: false, date: null } : null;
  };
  try {
    const d = utcDay(dateIso);
    if (!d || !place || !Number.isFinite(place.lat)) return fallback();
    const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const ahead = (d - t0) / DAY_MS;
    if (ahead < 0 || ahead > FORECAST_DAYS - 1) return fallback();
    const iso = isoDay(d);
    const key = `darb:sunset:${place.id}:${iso}`;
    let time = readCache(key);
    if (!time) {
      const j = await fetchJson(`${API}?latitude=${place.lat}&longitude=${place.lng}&daily=sunset&timezone=Asia%2FAmman&start_date=${iso}&end_date=${iso}`);
      const s = j?.daily?.sunset?.[0];
      if (typeof s !== "string" || !/T\d{2}:\d{2}/.test(s)) return fallback();
      time = s.slice(11, 16);
      writeCache(key, time);
    }
    return { time, live: true, date: iso };
  } catch (e) {
    console.warn("Darb: live sunset unavailable, using the monthly table.", e);
    return fallback();
  }
}
```

- [ ] **Step 4: Run the tests**, Expected: 32 `PASS`.

- [ ] **Step 5: Leg page**, in `public/js/pages/leg.js` add `import { sunsetFor, sunsetLine, tripDayIso } from "../weather.js";`. In the template, after `<p class="leg-context">…</p>` add `<p class="leg-sunset" id="leg-sunset" aria-live="polite"></p>`. After `root.setAttribute("aria-busy", "false");` add:

```js
  if (leg.timeSensitive && /sunset/i.test(leg.timeSensitive) && model.byId[to]) {
    const date = tripDayIso(trip?.settings?.startDate, dayN);
    const month = date ? Number(date.slice(5, 7)) : Number(trip?.settings?.month) || new Date().getMonth() + 1;
    sunsetFor(model.byId[to], date, month).then((s) => {
      if (s) qs("#leg-sunset").textContent = sunsetLine(s, month, leg.timeSensitive);
    });
  }
```

Append to `public/css/pages/leg.css`: `.leg-sunset { margin-top: 6px; font-size: 14px; font-weight: 600; color: var(--amber-text); min-height: 1.5em; }`

- [ ] **Step 6: Browser check**, `/plan.html?demo=1` (month October) → Check → Day 3 "Petra → Wadi Rum" leg link → the leg page shows `Sunset ≈ 18:07 in October, arrive by 16:00`. With a start date 3 days from today on plan.html, the same line reads `Sunset HH:MM on D Mon (Open-Meteo forecast), arrive by 16:00`. In devtools block `api.open-meteo.com` → the static line still appears, no uncaught error.

- [ ] **Step 7: Commit**

```bash
cd <repo> && git add public/js/weather.js public/js/pages/leg.js public/css/pages/leg.css public/js/test-cases.js && git commit -m "Wadi Rum sunset on the leg page: Open-Meteo daily=sunset, monthly table fallback (UTC+3)"
```

---

### Task B3: Currency hint under the JOD total

Estimated: 25 min.

**Files:**
- Create: `public/js/fx.js`
- Modify: `public/js/render/fixed-plan.js` (`renderCostCard` slot), `public/js/pages/fixed.js`, `public/js/pages/trip.js`, `public/css/pages/fixed.css`
- Modify: `public/js/test-cases.js` (import + 1 case), `public/sw.js` (JS list)

**Interfaces:**
- Produces: `parseRates(json) → { EUR, USD, date } | null`; `fxLine([minJod, maxJod], rates) → string` (`""` when rates is null); `jodRates() → Promise<rates | null>` (24 h localStorage cache, never throws).

- [ ] **Step 1: Verify the response shape**

```bash
curl -s "https://api.frankfurter.dev/v2/rates?base=JOD&quotes=EUR,USD"
```

Expected (numbers vary): `[{"date":"2026-09-29","base":"JOD","quote":"EUR","rate":1.2404},{"date":"2026-09-29","base":"JOD","quote":"USD","rate":1.4104}]`, an array, one object per quote. If the shape differs, adapt `parseRates` and the test sample to it.

- [ ] **Step 2: Write the failing test**

Add `import { parseRates, fxLine } from "./fx.js";` and append above `  return results;`:

```js
  // ---------- B3 currency hint ----------
  test("Currency hint: Frankfurter rates → est. EUR/USD line, silent on junk", (expect) => {
    const r = parseRates([{ date: "2026-09-29", base: "JOD", quote: "EUR", rate: 1.2404 }, { date: "2026-09-29", base: "JOD", quote: "USD", rate: 1.4104 }]);
    expect("parsed", r, { EUR: 1.2404, USD: 1.4104, date: "2026-09-29" });
    expect("line", fxLine([305, 385], r), "≈ 380–480 EUR · 430–545 USD (est., rate of 29 Sep)");
    expect("junk → null", [parseRates(null), parseRates({ error: "x" }), parseRates([{ quote: "EUR", rate: "n/a" }])], [null, null, null]);
    expect("no rates → empty", fxLine([305, 385], null), "");
  });
```

- [ ] **Step 3: Run to verify it fails**, module `./fx.js` not found: the whole run throws `ERR_MODULE_NOT_FOUND`. That is the expected failure.

- [ ] **Step 4: Create `public/js/fx.js`**

```js
// JOD → EUR / USD hint for the trip total (Frankfurter, no key). Indicative only: always shown as "est.".
import { fmtDate } from "./engine/format.js";

const URL_FX = "https://api.frankfurter.dev/v2/rates?base=JOD&quotes=EUR,USD";
const KEY = "darb:fx:v1";
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

const round5 = (x) => Math.round(x / 5) * 5;

/** Frankfurter v2 array → { EUR, USD, date } or null when anything is missing. */
export function parseRates(json) {
  if (!Array.isArray(json)) return null;
  const by = Object.fromEntries(json.filter((x) => x && typeof x.rate === "number" && x.rate > 0).map((x) => [x.quote, x]));
  if (!by.EUR || !by.USD) return null;
  return { EUR: by.EUR.rate, USD: by.USD.rate, date: by.EUR.date || null };
}

/** "≈ 380–480 EUR · 430–545 USD (est., rate of 29 Sep)"; "" without rates. */
export function fxLine([a, b], rates) {
  if (!rates) return "";
  const r = (cur) => `${round5(a * rates[cur])}–${round5(b * rates[cur])} ${cur}`;
  return `≈ ${r("EUR")} · ${r("USD")} (est.${rates.date ? `, rate of ${fmtDate(rates.date)}` : ""})`;
}

/** Cached 24 h in localStorage; null on any failure (the page just shows no line). */
export async function jodRates() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c && Date.now() - c.at < TTL_MS && c.rates) return c.rates;
  } catch { /* storage blocked */ }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch(URL_FX, { signal: ctl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const rates = parseRates(await res.json());
    if (rates) { try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates })); } catch { /* full */ } }
    return rates;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests**, Expected: 33 `PASS`.

- [ ] **Step 6: Wire it**, in `renderCostCard` (fixed-plan.js), right after the closing `</div>` of `.cost-total`, add `<p class="cost-fx" id="cost-fx"></p>`. In `public/js/pages/fixed.js` add `import { jodRates, fxLine } from "../fx.js";` and after `qs("#cost").innerHTML = renderCostCard(fixed.cost);` add:

```js
  jodRates().then((r) => { const el = qs("#cost-fx"); if (el && r) el.textContent = fxLine(fixed.cost.total, r); });
```

Do the same in `public/js/pages/trip.js` after its `renderCostCard` line (add the same import; `qs` is already imported there). Append to `public/css/pages/fixed.css` (near the cost rules): `.cost-fx { min-height: 1.4em; margin-top: 4px; font-size: 12px; color: var(--muted); text-align: right; }`. In `public/sw.js` add `"/js/fx.js",` to the JS list after `"/js/firebase-init.js",`.

- [ ] **Step 7: Browser check**, `/fixed.html?t=<id>` shows `≈ 380–480 EUR · 430–545 USD (est., rate of …)` under `305–385 JOD`. Block `api.frankfurter.dev` in devtools + clear `darb:fx:v1` → no line, no console error.

- [ ] **Step 8: Commit**

```bash
cd <repo> && git add public/js/fx.js public/js/render/fixed-plan.js public/js/pages/fixed.js public/js/pages/trip.js public/css/pages/fixed.css public/js/test-cases.js public/sw.js && git commit -m "Trip cost: est. EUR/USD hint from Frankfurter, cached 24 h, silent on failure"
```

---

### Task B4: Web Share + WhatsApp in the share modal

Estimated: 15 min.

**Files:** Modify `public/js/share.js`.

**Interfaces:** none new; two tiles in the Save & Share modal (`data-act="native"`, `data-act="whatsapp"`).

- [ ] **Step 1: Tiles**, in `openShareModal`, after `const mail = …;` add:

```js
  const shareText = `My Jordan plan, reality-checked by Darb: ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const canShare = !!link && typeof navigator.share === "function";
```

Inside the `link ? html\`…\`` tiles block, after the Email tile's closing `</a>`, add:

```html
      <a class="share-tile" href="${wa}" target="_blank" rel="noopener" data-act="whatsapp">
        ${raw(icon("link"))}<span class="share-tile-t">WhatsApp</span><span class="share-tile-s">Send the link to your travel group</span>
      </a>
      ${raw(canShare ? html`<button type="button" class="share-tile" data-act="native">${raw(icon("link"))}<span class="share-tile-t">Share…</span><span class="share-tile-s">Messages, Mail and other apps on this device</span></button>` : "")}
```

- [ ] **Step 2: Handler**, in the `switch`, before `case "ics":` add:

```js
      case "native":
        try { await navigator.share({ title: trip.title || "My Jordan plan", text: "My Jordan plan, reality-checked by Darb", url: link }); } catch { /* cancelled */ }
        break;
```

- [ ] **Step 3: Browser check**, `/fixed.html?t=<id>` → Save & share → a WhatsApp tile whose `href` starts `https://wa.me/?text=My%20Jordan%20plan`; on desktop Chrome/Playwright (`navigator.share` usually undefined) no "Share…" tile; `browser_evaluate` `() => document.querySelectorAll('.share-tile').length` → 4 or 5. No emoji in the modal.

- [ ] **Step 4: Run the tests, commit**, 33 `PASS`.

```bash
cd <repo> && git add public/js/share.js && git commit -m "Share modal: WhatsApp link and native Share sheet when available"
```

---

### Task B5: PWA manifest, icons, theme colour

Estimated: 25 min.

**Files:**
- Create: `public/manifest.json`, `public/icon.html`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Modify: every `public/*.html` head (12 pages: index, plan, check, fixed, leg, build, dashboard, trip, destinations, admin, tests, 404), `public/sw.js`

- [ ] **Step 1: `public/icon.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>Darb icon</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <style>
    html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
    body { background: var(--sand); display: grid; place-items: center; }
    .dot { width: 46vmin; height: 46vmin; border-radius: 50%; background: var(--rose); }
  </style>
</head>
<body><span class="dot"></span></body>
</html>
```

(The rose dot on sand, well inside the 80 % maskable safe zone.)

- [ ] **Step 2: Screenshot the icons**, Playwright: `browser_resize` 512×512 → navigate `http://localhost:8100/icon.html` → `browser_take_screenshot` `filename: "icon-512.png"`; `browser_resize` 192×192 → reload → `filename: "icon-192.png"`. Then:

```bash
mkdir -p <repo>/public/icons && cp <repo>/.playwright-mcp/icon-512.png <repo>/.playwright-mcp/icon-192.png <repo>/public/icons/ && file <repo>/public/icons/*.png
```

Expected: `512 x 512` and `192 x 192` (if doubled, use the `scale:'css'` fallback from Task B1 Step 5).

- [ ] **Step 3: `public/manifest.json`**

```json
{
  "name": "Darb, Jordan trips, reality-checked",
  "short_name": "Darb",
  "description": "Check a Jordan itinerary against local transport data and fix it.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f7f2ea",
  "theme_color": "#f7f2ea",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Head tags in all 12 pages**, run once:

```bash
cd <repo>/public && node -e '
const fs=require("fs");
const tag=`  <link rel="manifest" href="/manifest.json">\n  <meta name="theme-color" content="#f7f2ea">\n  <link rel="apple-touch-icon" href="/icons/icon-192.png">\n`;
for (const f of ["index","plan","check","fixed","leg","build","dashboard","trip","destinations","admin","tests","404"]) {
  const p=f+".html"; let s=fs.readFileSync(p,"utf8");
  if (s.includes("rel=\"manifest\"")) continue;
  s=s.replace("  <link rel=\"stylesheet\" href=\"/css/tokens.css\">", tag+"  <link rel=\"stylesheet\" href=\"/css/tokens.css\">");
  fs.writeFileSync(p,s); console.log("ok",p);
}'
```

Expected: 12 `ok` lines. `grep -L 'rel="manifest"' <repo>/public/*.html` → only `icon.html` and `og.html`.

- [ ] **Step 5: sw.js**, in `SHELL_URLS` after `"/favicon.svg"` add `, "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"`; change the fetch filter regex `/\.(js|css|json|svg)$/i` to `/\.(js|css|json|svg|png)$/i`; increment `SHELL` by one (`darb-shell-v4` → `darb-shell-v5`).

- [ ] **Step 6: Check installability**, chrome-devtools `lighthouse_audit` or Application panel equivalent: `evaluate_script` `async () => (await (await fetch('/manifest.json')).json()).icons.length` → `3`; Playwright on `/` → `browser_console_messages` shows no manifest errors.

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 7: Run the tests, commit**, 33 `PASS`.

```bash
cd <repo> && git add public/manifest.json public/icon.html public/icons public/*.html public/sw.js && git commit -m "PWA: manifest, 192/512 icons, theme-color, apple-touch-icon; SW shell v5"
```

---

### Task B6: Official links (destinations + Jordan Pass card)

Estimated: 15 min.

**Files:** Modify `public/destinations.html` (static intro section, outside the generated markers), `public/css/pages/destinations.css`, `public/js/pages/check.js` (`renderPass`).

Root URLs only (checked 30 Sep 2026 in the services audit; deep links 404 or are bot-blocked).

- [ ] **Step 1: destinations.html**, inside `<section class="section dest-intro"><div class="container">`, after the `<p class="small muted">Only values marked …</p>` line, add:

```html
        <section class="dest-official" aria-labelledby="official-title">
          <h2 id="official-title" class="dest-official-title">Official sources</h2>
          <ul class="plain-list dest-official-list">
            <li><a href="https://jordanpass.jo" target="_blank" rel="noopener">Jordan Pass</a>, visa and site tickets bundle (official site)</li>
            <li><a href="https://jett.com.jo/en" target="_blank" rel="noopener">JETT</a>, intercity buses (official site)</li>
            <li><a href="https://visitpetra.jo/en" target="_blank" rel="noopener">Visit Petra</a>, tickets and visitor information (official site)</li>
            <li><a href="https://visitjordan.com" target="_blank" rel="noopener">Visit Jordan</a>, national tourism site</li>
            <li><a href="https://www.rscn.org.jo" target="_blank" rel="noopener">RSCN</a>, nature reserves such as Dana</li>
          </ul>
        </section>
```

Append to `destinations.css`:

```css
.dest-official { margin-top: 20px; }
.dest-official-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 6px; }
.dest-official-list { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 14px; color: var(--muted); }
.dest-official-list a { color: var(--ink); font-weight: 600; }
```

- [ ] **Step 2: Jordan Pass card**, in `check.js` `renderPass()`, after the `smallFees` line inside the section add:

```js
      <p class="ck-note">Buy it before you fly on <a href="https://jordanpass.jo" target="_blank" rel="noopener">jordanpass.jo</a> (official site).</p>
```

- [ ] **Step 3: Check**, `node scripts/render-destinations.mjs` still prints `Rendered 12 cards, 16 Q/A` and `grep -c "Official sources" public/destinations.html` → `1` (the block survives re-rendering because it is outside the markers). `/check.html?t=<id>` Pass card shows the link.

- [ ] **Step 4: Commit**, `git add public/destinations.html public/css/pages/destinations.css public/js/pages/check.js && git commit -m "Official source links on destinations and the Jordan Pass card (root URLs only)"`

---

### Task B7: GitHub Actions, engine tests on push (dev-only)

Estimated: 10 min.

**Files:** Create `scripts/run-tests.mjs`, `.github/workflows/tests.yml`.

- [ ] **Step 1: `scripts/run-tests.mjs`**

```js
// Dev-only: run the engine test cases in Node (same cases as /tests.html). Exit 1 on any failure.
import { readFileSync } from "node:fs";
import { runCases } from "../public/js/test-cases.js";

const f = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const { places, airports } = f("places.json");
const results = runCases({ places, airports, legs: f("legs.json").legs, pass: f("jordan-pass.json") });
for (const r of results) console.log(r.ok ? "PASS" : "FAIL", r.name);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} / ${results.length} passed`);
process.exit(failed ? 1 : 0);
```

Run: `cd <repo> && node scripts/run-tests.mjs; echo "exit $?"` → last lines `33 / 33 passed` and `exit 0`.

- [ ] **Step 2: `.github/workflows/tests.yml`**

```yaml
name: Engine tests
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Engine test cases (reference 58 → 94, save 33)
        run: node scripts/run-tests.mjs
      - name: Contrast of text tokens
        run: node scripts/check-contrast.mjs
```

No `npm install`: nothing outside `public/` is shipped, and no packages are used.

- [ ] **Step 3: Commit**, `git add scripts/run-tests.mjs .github/workflows/tests.yml && git commit -m "CI: run engine tests and contrast check on push"` (the controller's `git push` in Deploy checkpoint B triggers the first run; check the Actions tab is green).

---

### Task B8: Font loading and module preloads

Estimated: 20 min.

**Files:** Modify `public/css/tokens.css` (drop `@import`); the 12 page files `index, plan, check, fixed, leg, build, dashboard, trip, destinations, admin, tests, 404` (font links; `og.html` already has its own, `icon.html` draws no text); `plan.html`, `check.html`, `fixed.html` also get modulepreload.

- [ ] **Step 1: Remove the `@import`**, delete line 2 of `public/css/tokens.css` (`@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");`).

- [ ] **Step 2: Font links in the 12 pages**

```bash
cd <repo>/public && node -e '
const fs=require("fs");
const tag=`  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">\n`;
for (const f of ["index","plan","check","fixed","leg","build","dashboard","trip","destinations","admin","tests","404"]) {
  const p=f+".html"; let s=fs.readFileSync(p,"utf8");
  if (s.includes("fonts.gstatic.com")) continue;
  s=s.replace("  <link rel=\"stylesheet\" href=\"/css/tokens.css\">", tag+"  <link rel=\"stylesheet\" href=\"/css/tokens.css\">");
  fs.writeFileSync(p,s); console.log("ok",p);
}'
```

Expected: 12 `ok`. `grep -L "fonts.gstatic.com" <repo>/public/*.html` → only `icon.html` (it draws no text).

- [ ] **Step 3: modulepreload**, add before `<link rel="stylesheet" href="/css/tokens.css">` in `plan.html`, `check.html` and `fixed.html`:

```html
  <link rel="modulepreload" href="/js/engine/geo.js">
  <link rel="modulepreload" href="/js/engine/format.js">
  <link rel="modulepreload" href="/js/engine/model.js">
  <link rel="modulepreload" href="/js/engine/pass.js">
  <link rel="modulepreload" href="/js/engine/parser.js">
  <link rel="modulepreload" href="/js/engine/rules.js">
  <link rel="modulepreload" href="/js/engine/fixer.js">
  <link rel="modulepreload" href="/js/data.js">
  <link rel="modulepreload" href="/js/store.js">
```

- [ ] **Step 4: Check**, Playwright on `/plan.html`, `/check.html?t=<id>`, `/fixed.html?t=<id>`: `browser_network_requests` shows `css2?family=Plus+Jakarta+Sans` requested from the HTML (initiator = document, not tokens.css) and the engine modules requested before `pages/*.js` finishes; computed `font-family` of `h1` starts with `"Plus Jakarta Sans"`; no console errors. Re-run the Task A6 CLS script on /fixed → still < 0.1.

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 5: Run the tests, commit**, 33 `PASS`.

```bash
cd <repo> && git add public/css/tokens.css public/*.html && git commit -m "Perf: Google Fonts via <link> + preconnect on every page, modulepreload engine on plan/check/fixed"
```

---

### Task B9: Evidence link on every verified value

Estimated: 35 min. **Needs B7** (`scripts/run-tests.mjs`) and **A8b** (the `sourceUrl` values in the log).

**Files:**
- Create: `scripts/check-data.mjs`
- Modify: `scripts/run-tests.mjs` (also runs the data check)
- Modify: `public/data/places.json`, `public/data/legs.json` (backfill `sourceUrl` on the values that were already verified on 24 Sep)
- Modify: `public/js/pages/leg.js` (`costCell`), `scripts/render-destinations.mjs` (answer + ticket lines), `public/css/pages/destinations.css`
- Modify: `public/js/pages/admin.js` ("Source URL" column)

**Interfaces:**
- Data: any leg option or place ticket may carry `sourceUrl: string` (an https URL). `status: "verified"` now **requires** `sourceUrl` and a `verifiedOn` no older than 90 days.
- Produces: `checkData(today?) → string[]` (the problems; empty = ok), exported from `scripts/check-data.mjs`.
- Note: screenshots and other evidence files (Firebase Storage) are **not** part of this task. D1 describes them as the next step.

- [ ] **Step 1: Write the check `scripts/check-data.mjs`**

```js
// Dev-only: every "verified" value in the seed data must carry evidence, a sourceUrl and a verifiedOn
// no older than 90 days (the engine shows older ones as est.). Usage: node scripts/check-data.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_AGE_DAYS = 90;
const METHODS = ["web", "phone", "field", "whatsapp", "operator"];
const read = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));

/** → list of problems (strings); empty when every verified value has evidence. */
export function checkData(today = new Date()) {
  const problems = [];
  const item = (where, o) => {
    if (!o || o.status !== "verified") return;
    if (!/^https:\/\/\S+$/.test(o.sourceUrl || "")) problems.push(`${where}: verified without a sourceUrl`);
    const age = Math.floor((new Date(today) - new Date(o.verifiedOn)) / 86400000);
    if (!o.verifiedOn || !(age >= 0 && age <= MAX_AGE_DAYS)) problems.push(`${where}: verifiedOn ${o.verifiedOn || "missing"} is not within ${MAX_AGE_DAYS} days`);
    if (o.method != null && !METHODS.includes(o.method)) problems.push(`${where}: unknown method "${o.method}"`);
  };
  for (const p of read("places.json").places) item(`places/${p.id}.ticket`, p.ticket);
  for (const l of read("legs.json").legs) (l.options || []).forEach((o, i) => item(`legs/${l.id}.options[${i}] (${o.label})`, o));
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkData(process.env.DARB_TODAY || new Date());
  for (const p of problems) console.log("FAIL", p);
  console.log(problems.length ? `${problems.length} verified value(s) without evidence` : "data check: every verified value has a source and a fresh date");
  process.exit(problems.length ? 1 : 0);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd <repo> && node scripts/check-data.mjs; echo "exit $?"`
Expected: `FAIL` lines for the values verified on 24 Sep that have `source` but no `sourceUrl`: `legs/amman-petra.options[0] (JETT bus Abdali → Wadi Musa)` and the `amman`, `jerash`, `petra` tickets. Unless A8b already added a `sourceUrl`, then `exit 1`.

- [ ] **Step 3: Backfill `sourceUrl`, never downgrade**

For each FAIL line, take the URL from `docs/data/verification-log.md`:
- JETT: the team's 24 Sep check was the JETT booking system, so use `"sourceUrl": "https://jett.com.jo/en"` with `"method": "web"`.
- Tickets: use the page A8b confirmed. If A8b did not confirm the Amman, Jerash or Petra ticket, **stop and ask the controller** for the source the team used on 24 Sep.

Do **not** turn these into `est`. They feed the Jordan Pass sum, and downgrading them would change the reference 108 / save 33. Re-run `node scripts/check-data.mjs` → `data check: every verified value has a source and a fresh date`, exit 0.

- [ ] **Step 4: Wire it into `scripts/run-tests.mjs`**

Add `import { checkData } from "./check-data.mjs";` at the top. Replace the last two lines with:

```js
const dataProblems = checkData(process.env.DARB_TODAY || new Date());
for (const p of dataProblems) console.log("FAIL data:", p);
console.log(`${results.length - failed} / ${results.length} passed${dataProblems.length ? ` · ${dataProblems.length} data problem(s)` : " · data check ok"}`);
process.exit(failed || dataProblems.length ? 1 : 0);
```

Run: `node scripts/run-tests.mjs; echo "exit $?"` → last line `33 / 33 passed · data check ok`, `exit 0`.

Proof that CI catches an unverified ✓: temporarily remove the `sourceUrl` from the JETT option, run again → `FAIL data: legs/amman-petra.options[0] …` and `exit 1`. Restore it. From 2026-12-23 the 24 Sep values expire and CI turns red until someone re-verifies them; that is intended.

- [ ] **Step 5: "Source ↗" on the leg page**

In `public/js/pages/leg.js` `costCell(o)`, replace the `sub` line and the return with:

```js
  const sub = [o.costUnit, c.verified && o.verifiedOn ? `verified ${fmtDate(o.verifiedOn)}` : ""].filter(Boolean).join(" · ");
  const src = c.verified && o.sourceUrl
    ? html` · <a class="leg-src" href="${o.sourceUrl}" target="_blank" rel="noopener">Source ↗<span class="sr-only"> (opens in a new tab)</span></a>`
    : "";
  const cls = c.verified ? "cost-verified" : o.cost ? "cost-est" : "";
  return html`
    <span class="${cls}">${c.text}${c.verified ? raw(' <span aria-hidden="true">✓</span><span class="sr-only">(verified)</span>') : ""}</span>
    ${sub || src ? raw(html`<span class="leg-cell-sub">${sub}${raw(src)}</span>`) : ""}`;
```

- [ ] **Step 6: Source links on destination cards**

In `scripts/render-destinations.mjs`:
- In `legAnswer(leg)`, return `sourceUrl: o.status === "verified" ? o.sourceUrl || null : null` along with `text` and `verified`.
- In the `qa.set(...)` call, store `sourceUrl` too.
- In `card(p)`:
  - Replace `<p class="${x.verified ? "ans-verified" : "ans-est"}">${esc(x.a)}</p>` with ``<p class="${x.verified ? "ans-verified" : "ans-est"}">${esc(x.a)}${x.sourceUrl ? ` <a class="dest-src" href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ""}</p>``.
  - Replace `<p class="dest-ticket">${esc(ticketLine(p))}</p>` with ``<p class="dest-ticket">${esc(ticketLine(p))}${p.ticket.status === "verified" && p.ticket.sourceUrl ? ` <a class="dest-src" href="${esc(p.ticket.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a>` : ""}</p>``.

The JSON-LD text is unchanged. Append to `public/css/pages/destinations.css`: `.dest-src { font-weight: 600; white-space: nowrap; }`.

Run: `node scripts/render-destinations.mjs` → `Rendered 12 cards, 16 Q/A`. Check the result:
- `grep -c 'class="dest-src"' public/destinations.html` must equal the number of verified values shown on the cards.
- `grep -c 'dest-src' public/destinations.html` must be greater than 0.
- `grep 'Source ↗' public/destinations.html | grep -vc 'rel="noopener"'` → `0`.

- [ ] **Step 7: "Source URL" in admin.html**

In `public/js/pages/admin.js`:
- In `optionRow`, add a cell after the Notes cell:

```js
      <td><input class="input opt-src" type="url" maxlength="300" placeholder="https://…" aria-label="${`${o.label}: source URL`}" ${raw(k)} data-f="sourceUrl" value="${o.sourceUrl || ""}"${raw(dis)}></td>
```

- In `legCard`, add `<th scope="col">Source URL</th>` after the Notes header.
- In `collect`, after the notes lines, add:

```js
    const src = v("sourceUrl");
    if (src && !/^https:\/\/\S+$/.test(src)) return { error: `${label}: the source URL must start with https://` };
    if (o.status === "verified" && !src) return { error: `${label}: “verified” needs a Source URL (the page or document that shows the value).` };
    if (src) o.sourceUrl = src; else delete o.sourceUrl;
```

- Change the change-tracking list to `for (const f of ["cost", "departs", "status", "verifiedOn", "notes", "sourceUrl"]) {`. This writes `operatorUpdates` like the other fields.

- [ ] **Step 8: Browser check**, `/leg.html?t=<id>&day=2&leg=amman~petra` (a reference trip): the JETT row cost cell reads `10 JOD ✓`, `verified 24 Sep · Source ↗`, and the link opens `https://jett.com.jo/en` in a new tab. `/admin.html?debug=1` (read-only preview of the seed legs) shows the Source URL column. Saving "verified" with an empty Source URL shows the error line. No console errors.

- [ ] **Step 9: Tests, commit**, `node scripts/run-tests.mjs` → `33 / 33 passed · data check ok`.

```bash
cd <repo> && git add scripts/check-data.mjs scripts/run-tests.mjs public/data/places.json public/data/legs.json public/js/pages/leg.js scripts/render-destinations.mjs public/destinations.html public/css/pages/destinations.css public/js/pages/admin.js && git commit -m "Evidence: sourceUrl on every verified value, Source links on leg/destinations, admin Source URL, CI data check"
```

Tell the controller: `places.json`/`legs.json` changed, so re-seed in Deploy checkpoint B (`node scripts/seed.mjs`, CONTROLLER) before deploying.

---

### Task B-deploy: Deploy checkpoint B, CONTROLLER

Estimated: 10 min.

- [ ] **Step 1 (implementer):** `node scripts/run-tests.mjs` → `33 / 33 passed · data check ok`. If any shipped asset changed after Task B5, increment `SHELL` in `public/sw.js` once more and commit.
- [ ] **Step 2 (CONTROLLER):** `node scripts/seed.mjs` (B9 backfilled `sourceUrl` in places/legs), then `firebase deploy --only hosting && git push`.
- [ ] **Step 3 (CONTROLLER):** `curl -sI https://darb-pixelsdev.web.app/robots.txt | head -1` → `HTTP/2 200`; same for `/sitemap.xml`, `/llms.txt`, `/manifest.json`, `/og.png`. GitHub Actions run is green.

---

# GROUP C, only if time remains (each independent; stop at 18:00)

### Task C1: Day cards show the traveller's own words

Estimated: 20 min.

**Files:** `public/js/engine/parser.js` (new `firstSentence`, `modePhrase`), `public/js/pages/check.js` (renderDay), `public/css/pages/check.css`, `public/js/test-cases.js`.

**Interfaces:** `firstSentence(text) → string` (≤ 90 chars, markdown and times stripped); `modePhrase(text, mode) → string | null` (the sentence that names the transport, ≤ 60 chars).

- [ ] **Step 1: Failing test**, add `firstSentence, modePhrase` to the parser import and append:

```js
  // ---------- C1 traveller's own words ----------
  test("Day text: first sentence and the planned transport phrase", (expect) => {
    expect("first sentence", firstSentence(ref.days[1].text), "Drive or take a bus to Petra");
    expect("markdown stripped", firstSentence("- **9:00 AM** – Arrive at Queen Alia Airport (AMM)\n- lunch"), "Arrive at Queen Alia Airport (AMM)");
    expect("mode phrase", modePhrase(ref.days[1].text, "car"), "Drive or take a bus to Petra");
    expect("no mode", modePhrase("Madaba mosaics", null), null);
  });
```

Run → `threw: firstSentence is not a function`.

- [ ] **Step 2: Implement**, append to `parser.js`:

```js
const MODE_RE = Object.fromEntries(MODE_WORDS);
const cleanLine = (s) => s.replace(/[*_#>`]/g, "").replace(/^[\s\-––•·]*(\d{1,2}(:\d{2})?\s*(am|pm)?\s*[––-]\s*)?/i, "").trim();

/** The traveller's first sentence of a day, without markdown or a leading clock time (≤ 90 chars). */
export function firstSentence(text) {
  const s = String(text || "").split(/[.!?\n]/).map(cleanLine).find(Boolean) || "";
  return s.length > 90 ? s.slice(0, 89) + "…" : s;
}

/** The sentence that names the planned transport ("Drive or take a bus to Petra"), or null. */
export function modePhrase(text, mode) {
  if (!mode || !MODE_RE[mode]) return null;
  const s = String(text || "").split(/[.!?\n]/).map(cleanLine).find((x) => MODE_RE[mode].test(normalize(x)));
  return s ? (s.length > 60 ? s.slice(0, 59) + "…" : s) : null;
}
```

Run → 34 `PASS`.

- [ ] **Step 3: check.js**, add `firstSentence, modePhrase` import from `../engine/parser.js`; in `renderDay` before `const infoHtml` add:

```js
  const quote = firstSentence(d.text);
  const planned = modePhrase(d.text, d.hints?.mode);
  const wordsHtml = quote
    ? html`<p class="ck-quote">“${quote}”${planned && planned !== quote ? raw(html` <span class="ck-planned">Planned: ‘${planned}’</span>`) : ""}</p>`
    : "";
```

and change the `infoHtml` assignment to start with `wordsHtml + notCovered + …`. Append to check.css: `.ck-quote { font-size: 13px; color: var(--muted); } .ck-planned { display: inline-block; margin-left: 6px; font-weight: 600; color: var(--ink); }`

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 4: Browser check**, reference check: Day 2 shows `“Drive or take a bus to Petra”`; Day 3 `“Morning at Petra, then head to Wadi Rum for a sunset jeep tour and desert camp”`. Commit: `git add public/js/engine/parser.js public/js/pages/check.js public/css/pages/check.css public/js/test-cases.js && git commit -m "Check: day cards quote the traveller's words and planned transport"`

---

### Task C2: Start date in the share modal (calendar)

Estimated: 20 min.

**Files:** `public/js/share.js`, `public/css/pages/fixed.css`.

- [ ] **Step 1:** In `openShareModal` replace `const gcal = googleCalendarUrl(trip, fixed, model, link ? { link } : {});` with

```js
  let startDate = trip.settings?.startDate || "";
  const calTrip = () => ({ ...trip, settings: { ...trip.settings, startDate: startDate || null } });
  const gcal = googleCalendarUrl(calTrip(), fixed, model, link ? { link } : {});
```

In the `share-cal` block, directly after `<p class="share-cal-s">…</p>` add:

```html
        <label class="share-start">First day <input type="date" class="input" id="share-start" value="${startDate}"></label>
        ${raw(startDate ? "" : '<span class="small muted">No date yet, the calendar starts on the 1st of your travel month.</span>')}
```

After `modal.classList.add("share-modal");` add:

```js
  qs("#share-start", modal).addEventListener("change", (e) => {
    startDate = e.target.value || "";
    qs('[data-act="google"]', modal).href = googleCalendarUrl(calTrip(), fixed, model, link ? { link } : {});
  });
```

and change `downloadIcs(trip, fixed, model);` to `downloadIcs(calTrip(), fixed, model);`.

- [ ] **Step 2:** fixed.css: `.share-start { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; font-weight: 600; color: var(--muted); } .share-start .input { width: auto; min-height: 40px; }`

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 3: Check**, set 2026-10-12 in the modal → Google link `dates=20261012/20261017` (5-day plan); downloaded .ics first `DTSTART;VALUE=DATE:20261012`. Tests 34 `PASS`. Commit: `git add public/js/share.js public/css/pages/fixed.css && git commit -m "Share modal: pick the first day for Google/.ics calendar export"`

---

### Task C3: Mobile nav disclosure menu

> May already be done by GROUP E (E2 polish / E5 adapt / E6 audit touch the mobile menu). Check the current code first and skip steps that are already in place.

Estimated: 20 min.

**Files:** `public/js/ui/nav.js`, `public/css/app.css`.

- [ ] **Step 1:** In `mountNav`, change the `el.innerHTML` template to add, after the `<nav class="nav-links" …>…</nav>` line:

```js
      <details class="nav-menu">
        <summary>Menu</summary>
        <nav class="nav-menu-links" aria-label="Main (mobile)">${links}</nav>
      </details>
```

- [ ] **Step 2:** app.css (Nav section):

```css
.nav-menu { display: none; position: relative; }
.nav-menu summary { list-style: none; cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--white); font-weight: 600; font-size: 14px; }
.nav-menu summary::-webkit-details-marker { display: none; }
.nav-menu-links { position: absolute; right: 0; top: calc(100% + 8px); z-index: 45; display: flex; flex-direction: column; min-width: 200px; padding: 8px; background: var(--white); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow); }
.nav-menu-links a { display: flex; align-items: center; min-height: 44px; padding: 0 10px; color: var(--ink); text-decoration: none; font-weight: 600; }
@media (max-width: 719px) { .nav-menu { display: block; margin-left: auto; } .nav-menu + .nav-right { margin-left: 8px !important; } }
```

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 3: Check**, 375 px: "Menu" opens Destinations / Jordan Pass links; 1280 px: menu hidden, desktop links shown; `header#nav` height still 74 (Task A6). Commit: `git add public/js/ui/nav.js public/css/app.css && git commit -m "Nav: mobile Menu disclosure (no JS)"`

---

### Task C4: Post-trip confirmation only after the trip

Estimated: 15 min.

**Files:** `public/js/engine/format.js` (`tripEnded`), `public/js/pages/trip.js`, `public/js/test-cases.js`.

- [ ] **Step 1: Failing test**, `import { tripEnded } from "./engine/format.js";` and append:

```js
  test("Trip ended: confirmations only after the last day", (expect) => {
    expect("past", tripEnded("2026-09-01", 5, "2026-09-30"), true);
    expect("last day is today", tripEnded("2026-09-26", 5, "2026-09-30"), false);
    expect("future", tripEnded("2026-10-12", 5, "2026-09-30"), false);
    expect("no date", tripEnded(null, 5, "2026-09-30"), null);
  });
```

- [ ] **Step 2: Implement** (format.js):

```js
/** true when startDate + days is before today, false when not, null without a start date. */
export function tripEnded(startDate, days, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate || "");
  if (!m) return null;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Math.max(1, days));
  const t = new Date(today);
  return end <= Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}
```

Run → 35 `PASS` (with C1 done; 34 otherwise).

- [ ] **Step 3: trip.js**, import `tripEnded` from `../engine/format.js`; replace the `renderFixedDays(... confirm: !!id, answered)` line with:

```js
  const ended = tripEnded(trip.settings?.startDate, fixed.days.length);
  const confirmNow = !!id && ended === true;
  qs("#days").innerHTML = renderFixedDays(fixed, model, { editable: false, confirm: confirmNow, answered }) +
    (id && ended === false ? `<p class="small muted">Come back after your trip to tell us which transport was there.</p>` : "") +
    (id && ended === null ? `<details class="confirm-later"><summary>Back from your trip? Tell us which transport was there</summary>${renderFixedDays(fixed, model, { editable: false, confirm: true, answered })}</details>` : "");
```

(No start date keeps the documentation's "Was this transport there?" loop reachable, collapsed.) If the collapsed copy duplicates the day list visually, render only the `.confirm-row`s inside it, acceptable either way for this optional task.

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 4: Check + commit**, a trip with a past start date shows Yes/No rows; future date shows the "Come back" line. `git add public/js/engine/format.js public/js/pages/trip.js public/js/test-cases.js && git commit -m "Shared trip: ask 'Was this transport there?' only after the trip"`

---

### Task C5: Tap targets ≥ 44 px and a skip link

> May already be done by GROUP E (E2 polish / E5 adapt / E6 audit touch the tap targets / skip link). Check the current code first and skip steps that are already in place.

Estimated: 15 min.

**Files:** `public/js/ui/nav.js`, `public/css/app.css`, `public/css/pages/check.css`.

- [ ] **Step 1:** In `mountNav`, before `return el;` add:

```js
  if (!document.querySelector(".skip-link") && document.getElementById("main")) {
    document.body.insertAdjacentHTML("afterbegin", '<a class="skip-link" href="#main">Skip to content</a>');
  }
```

- [ ] **Step 2:** app.css:

```css
.skip-link { position: absolute; left: 8px; top: -60px; z-index: 70; padding: 10px 14px; border-radius: var(--radius-sm); background: var(--ink); color: var(--white); font-weight: 600; text-decoration: none; }
.skip-link:focus { top: 8px; }
.footer-links a, .nav-cta, .tab { display: inline-flex; align-items: center; min-height: 44px; }
```

check.css: `.leg-link, .back-link { display: inline-flex; align-items: center; min-height: 44px; }`. Add `<main id="main">`-less check: `tests.html` has no `#main`, so no skip link there (by design of the guard).

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 3: Check**, Tab once on any page → "Skip to content" appears; Enter moves focus into `main`. `browser_evaluate` on /check at 375 px: `() => [...document.querySelectorAll('a.leg-link, a.back-link, .footer-links a')].every(a => a.getBoundingClientRect().height >= 44)` → `true`. Re-check nav height 74 (Task A6). Commit: `git add public/js/ui/nav.js public/css/app.css public/css/pages/check.css && git commit -m "A11y: skip link, 44 px tap targets for leg/back/footer links"`

---

### Task C6: Landing "Fix all → 94" opens the fixed plan

Estimated: 15 min.

**Files:** `public/js/pages/landing.js`.

- [ ] **Step 1:** Add `import { saveTrip } from "../store.js";`. In `renderDemo`, replace the `<a class="btn btn-primary btn-block" href="/plan.html?demo=1">Fix all → ${fixed.score}/100</a>` with `<button type="button" class="btn btn-primary btn-block" id="demo-fix">Fix all → ${fixed.score}/100</button>` and pass `res` (the full `fix()` result) into `renderDemo`: change the boot to `const res = fix(trip, model); renderDemo({ trip, result, fixed: res.fixed, res, model });` and the signature to `function renderDemo({ trip, result, fixed, res, model })`. At the end of `renderDemo` add:

```js
  qs("#demo-fix").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Opening the fixed plan…";
    const doc = {
      title: "Sarah’s 5-day plan", source: "paste", rawText: REFERENCE_TEXT, settings: trip.settings,
      days: res.days.map(({ n, title, text, placeIds, notCovered, hints }) => ({ n, title, text, placeIds, notCovered: notCovered || [], hints })),
      check: res.check, fixed: res.fixed, score: res.fixed.score, lang: "en"
    };
    try {
      const id = await saveTrip(doc);
      location.href = `/fixed.html?t=${encodeURIComponent(id)}`;
    } catch {
      try { sessionStorage.setItem("darb:pending", JSON.stringify(doc)); } catch { /* blocked */ }
      location.href = "/fixed.html?local=1";
    }
  });
```

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 2: Check**, `/` → click the demo card button → lands on `/fixed.html?t=…` showing 94 and Trip cost 305–385 JOD. Commit: `git add public/js/pages/landing.js && git commit -m "Landing: demo Fix all opens Sarah's fixed plan"`

---

### Task C7: Dashboard badge styled as a label

> May already be done by GROUP E (E2 polish / E5 adapt / E6 audit touch the dashboard badge). Check the current code first and skip steps that are already in place.

Estimated: 5 min.

- [ ] **Step 1:** In `public/css/app.css` replace `.nav-dash-pill { … background: var(--ink); color: var(--white); … }` with:

```css
.nav-dash-pill { display: inline-block; padding: 8px 14px; border-radius: 999px; background: var(--sand-2); color: var(--ink); border: 1px solid var(--line); font-size: 13px; font-weight: 600; cursor: default; }
```

- [ ] **Step G: Impeccable gate (E8)**, `~/.claude/skills/impeccable/scripts/impeccable detect --json <html/css files changed in this task>` → only the accepted `overused-font` (Plus Jakarta Sans, Figma-mandated) warning; zero `low-contrast` findings.

- [ ] **Step 2: Check + commit**, `/dashboard.html` pill is light, not button-like. `git add public/css/app.css && git commit -m "Dashboard: 'Insights (demo)' is a label, not a button"`

---

### Task C-deploy: Deploy checkpoint C, CONTROLLER

- [ ] **Step 1 (implementer):** `node scripts/run-tests.mjs` → all pass; increment `SHELL` in `public/sw.js`; commit.
- [ ] **Step 2 (CONTROLLER):** `firebase deploy --only hosting && git push`; smoke test `/`, `/plan?demo=1` (58 → 94), `/destinations`, `/tests`.

---

# GROUP D, Data process

### Task D1: Data verification process doc + admin `method` field

Estimated: 35 min.

**Files:**
- Create: `docs/DATA_VERIFICATION.md`
- Modify: `public/js/pages/admin.js` ("Method" column per option)
- Modify: `README.md` (link to the doc in "Data owners")

**Interfaces:**
- Data: leg options and place tickets may carry `method: "web" | "phone" | "field" | "whatsapp" | "operator"`. The name and values match A8b and `scripts/check-data.mjs` (B9), which already rejects any other value.
- Admin edits options only. Ticket `method` is set in `places.json` by the team, as in A8b.

- [ ] **Step 1: Write `docs/DATA_VERIFICATION.md`**

```markdown
# How Darb verifies data

**Principle: verified = source + date + method.** A price or schedule gets a ✓ only when we can say *where* it was confirmed
(`sourceUrl` or a named contact), *when* (`verifiedOn`) and *how* (`method`). Everything else is shown as `est.` with a range.
A verified value older than 90 days is shown as `est.` automatically (engine + dashboard freshness), and CI fails
(`scripts/check-data.mjs`) when a verified value has no source or is older than 90 days.

## Methods
| method | meaning | evidence we keep |
|---|---|---|
| `web` | read on the operator's or authority's official page | URL + verbatim quote in `docs/data/verification-log.md` (screenshot later, see below) |
| `phone` | called the operator | who, number called, date, answer in the log |
| `field` | seen on site (station sign, ticket office) | photo, date, place in the log |
| `whatsapp` | written quote | screenshot of the quote; ranges = min/max of at least 3 quotes |
| `operator` | the data owner changed it in `/admin` | `operatorUpdates` entry (who, when, from → to) |

## Sources per data type
| data | source | method |
|---|---|---|
| JETT buses (Amman–Petra, Amman–Aqaba) | JETT booking system at jett.com.jo, a manual, dated check with a screenshot | web |
| Petra tickets (1/2/3 days, same-day 90 JOD) | visitpetra.jo | web |
| Jordan Pass tiers, visa waiver, covered sites | jordanpass.jo | web |
| Wadi Rum protected-area fee | ASEZA / Wadi Rum visitor centre (wadirum.jo, aseza.jo) | web / phone |
| Dana and other reserves | RSCN (rscn.org.jo, wildjordan.com) | web / phone |
| Dead Sea day use | Amman Beach front desk | phone |
| Airport taxi | fixed-fare tariff board at Queen Alia arrivals, photo | field |
| Airport Express bus | Sariyah (operator site or counter) | web / field |
| Minibuses (Tabarbour → Jerash, South station → Madaba) | at the station only, times vary, most leave when full | field |
| Transfers and private drivers | 3 WhatsApp quotes from licensed drivers or camps → `cost: [min, max]` | whatsapp |
| Drive times | Google Maps, departure 08:00 on a weekday, recorded by hand (no API) | web |

**No scraping.** We never scrape or automate jett.com.jo or any booking system. Every check is a manual, dated read
by a team member, logged with evidence.

## Cadence
- Every verified value is re-checked within **90 days** (`nextCheck` column of the log). The CI data check turns red
  when one expires, which is the reminder.
- **Monthly review** (first Monday): go through the log, re-check anything with `nextCheck` in the next 30 days,
  and compare with traveller confirmations (below).

## Data owners (admin.html)
Operators (JETT, PDTRA, reserves) sign in at `/admin` and edit their own legs: cost, departure time, status,
verified-on date, notes, **Source URL** and **Method**. "Verified" cannot be saved without a date and a source URL.
Every change is written to `operatorUpdates` (who, when, from → to) and shown on the dashboard. Accounts are added with
`node scripts/seed.mjs admin <email>`.

## Traveller confirmations
After a trip, the shared plan asks "Was this transport there? Yes / No" per leg (`confirmations` collection).
Answers do not change prices. A leg with repeated "No" answers is re-checked first at the monthly review. A leg with
recent "Yes" answers is a signal, never a substitute for a source.

## Next step (not implemented): evidence files in Firebase Storage
Screenshots and photos will be uploaded by data owners to Firebase Storage under `evidence/<legId|placeId>/<date>.png`
and linked from the value as `evidenceUrl`. Sketch of the rules (admins write, public read):

    rules_version = '2';
    service firebase.storage {
      match /b/{bucket}/o {
        match /evidence/{item}/{file} {
          allow read: if true;
          allow write: if request.auth != null
            && firestore.exists(/databases/(default)/documents/admins/$(request.auth.token.email))
            && request.resource.size < 2 * 1024 * 1024
            && request.resource.contentType.matches('image/.*');
        }
      }
    }
```

- [ ] **Step 2: "Method" column in admin.html**

In `public/js/pages/admin.js`:
- Below `const costText = …` add:

```js
const METHODS = ["web", "phone", "field", "whatsapp", "operator"];
```

- In `optionRow`, after the Source URL cell from B9, add:

```js
      <td><select class="select" aria-label="${`${o.label}: method`}" ${raw(k)} data-f="method"${raw(dis)}>
        <option value=""${o.method ? "" : " selected"}>–</option>
        ${raw(METHODS.map((m) => `<option value="${m}"${o.method === m ? " selected" : ""}>${m}</option>`).join(""))}</select></td>
```

- In `legCard`, add `<th scope="col">Method</th>` after `<th scope="col">Source URL</th>`.
- In `collect`, after the sourceUrl lines, add:

```js
    const method = v("method");
    if (method && !METHODS.includes(method)) return { error: `${label}: unknown method.` };
    if (o.status === "verified" && !method) return { error: `${label}: “verified” needs a method (web, phone, field, whatsapp or operator).` };
    if (method) o.method = method; else delete o.method;
```

- Extend the change-tracking list to `["cost", "departs", "status", "verifiedOn", "notes", "sourceUrl", "method"]`.

- [ ] **Step 3: README**, in `README.md` under `## Data owners`, add a fourth item:

```markdown
4. How values become "verified" (source + date + method, 90-day re-checks, no scraping): see [docs/DATA_VERIFICATION.md](docs/DATA_VERIFICATION.md); the evidence for each value is in [docs/data/verification-log.md](docs/data/verification-log.md).
```

- [ ] **Step 4: Check**

- `/admin.html?debug=1` shows the Method column with the five values; the JETT option shows `web` when A8b/B9 set it.
- `node scripts/run-tests.mjs` → `… passed · data check ok`.
- `grep -n "university\|member" docs/DATA_VERIFICATION.md` → no output (Global Constraint 5).

- [ ] **Step 5: Commit**

```bash
cd <repo> && git add docs/DATA_VERIFICATION.md public/js/pages/admin.js README.md && git commit -m "Data process: verification doc (source + date + method), admin Method field, README link"
```

### Task D-deploy: Deploy checkpoint D, CONTROLLER

- [ ] **Step 1 (implementer):** `node scripts/run-tests.mjs` → all pass with `data check ok`; increment `SHELL` in `public/sw.js` (admin.js changed); commit.
- [ ] **Step 2 (CONTROLLER):** `firebase deploy --only hosting && git push`.

---

# GROUP E, Design pass with the installed design skills

Runs **after Deploy checkpoint A and before GROUP C**. Group C items that these commands also touch (C3 mobile menu, C5 tap targets, C7 dashboard badge) stay in C; check whether E already did them before starting a C task.

**Hard constraint on every E task: refinement only.** The Figma screens in `docs/design/*.png`, the font (Plus Jakarta Sans), the tokens in `public/css/tokens.css` and every flow are fixed by CLAUDE.md rule 4. No redesign, no new font, no palette change, no removed component. Skill output that breaks this is rejected, even when the skill rates it as important.

**Who runs it:** the controller or the user, in the Claude Code session, by typing the skill commands. These are not subagent briefs. Every E task ends with the full test run (`node scripts/run-tests.mjs` → all pass) and the **impeccable gate** (E8).

**Not used, and why:** `design-taste-frontend`, `high-end-visual-design`, `redesign-existing-projects`, `minimalist-ui`, `gpt-taste`, `image-to-code`, `brandkit`, and the impeccable `overdrive` / `bolder` / `colorize` / `typeset` commands. Each one replaces the visual world (type, palette, composition), which rule 4 forbids.

### Task E1: Critique → backlog

Estimated: 20 min.

- [ ] **Step 1:** `impeccable context` was already run in this session; do not run it again. If a fresh session has no context, type `/impeccable context` once and accept the project summary.
- [ ] **Step 2:** Type `/impeccable critique public/check.html`, then `/impeccable critique public/index.html`.
- [ ] **Step 3:** Save both outputs (heuristic scores + findings) as `docs/design/critique-2026-09-30.md` under two headings, `## check.html` and `## index.html`. Add a `Decision` column to each finding:
  - **accept**, only P0/P1 items that keep the layout structure (spacing, states, copy, focus, contrast).
  - **reject (rule 4)**, anything that moves, removes or restyles a Figma component, or changes font, palette or grid.
  - **done in A/B**, items already covered (e.g. contrast → A7, CLS → A6, sticky CTA → A5, nav menu → C3).
- [ ] **Step 4: Verify**, every row has a decision, and no accepted row mentions font, colour palette, layout grid or removing a section.
- [ ] **Step 5: Commit**, `git add docs/design/critique-2026-09-30.md && git commit -m "Design: critique backlog for check and landing (refinement only)"`

### Task E2: Polish

Estimated: 30 min.

- [ ] **Step 1:** Type `/impeccable polish public/check.html public/fixed.html public/index.html`. In the prompt, point it at the accepted rows of `docs/design/critique-2026-09-30.md`.
- [ ] **Step 2: Accept** spacing rhythm on the existing scale, alignment, hover/focus/disabled/loading states, and empty/error copy. **Reject** new sections, reordered cards, changed sidebar composition, new colours (only `tokens.css` variables), new fonts, and removed pills, rings or icons.
- [ ] **Step 3: Verify**, Playwright screenshots at 1280 and 375 of `/check.html?t=<id>`, `/fixed.html?t=<id>` and `/` look like `docs/design/03-*.png`, `04-*.png` and `01-*.png` (same blocks, same order). The test run passes. Run the E8 gate.
- [ ] **Step 4: Commit**, `git add public && git commit -m "Design polish: states, spacing and alignment on check, fixed and landing (no layout change)"`

### Task E3: Clarify (UX copy)

Estimated: 20 min.

- [ ] **Step 1:** Type `/impeccable clarify public/plan.html public/check.html public/leg.html`. The copy also lives in `public/js/pages/{plan,check,leg}.js`, `public/js/ui/day-card.js` and `public/js/engine/rules.js` (issue reasons); include them when it asks.
- [ ] **Step 2: Accept** clearer labels, error messages (keep the meaning of "We couldn't find any Jordan places…" plus the Build-a-plan link, required by CLAUDE.md §6b), why-box sentences, fix-card copy and button labels.
  - **Keep verbatim:** `est.`, `verified`, `demo data`, `Not feasible`, `Risky`, `OK`, `Fix all → NN/100`, `Reality Score`, `More relaxed`, `Recommended`.
  - **Reject** any wording that claims more certainty than the data (for example dropping "est." or "about").
- [ ] **Step 3: Verify**, the test run passes. Tests compare issue codes and statuses, not reason text; if a changed `rules.js` sentence breaks a test, revert that sentence. Then `grep -rn "est\.\|verified" public/js/pages/check.js public/js/pages/leg.js | wc -l` is not lower than before the task. Run the E8 gate.
- [ ] **Step 4: Commit**, `git add public && git commit -m "Copy: clearer labels, errors and fix cards (honesty vocabulary unchanged)"`

### Task E4: Harden (edge states)

Estimated: 25 min.

- [ ] **Step 1:** Type `/impeccable harden public/plan.html public/check.html public/fixed.html`. Name these states: Firestore down (`loadModel` falls back to the seed), model load failure, a 21-day plan, very long day titles, a trip without `fixed` (fixed.js recomputes it), and offline.
- [ ] **Step 2: Accept** overflow handling (long titles wrap or ellipsis), visible error and retry states, and disabled buttons while loading. **Reject** anything that duplicates work already in the plan: A1 (not-covered and 21-day cap), A2 (departure airport), A5 (sticky bar), A6 (skeletons), B2/B3 (silent fallbacks).
- [ ] **Step 3: Verify**, in Playwright:
  - Devtools offline, then reload `/check.html?t=<id>` → the cached trip still renders.
  - Paste the 28-day text from Task A1's range test → the preview says `We read 21 days`.
  - A title of 120 characters (`Day 1: ` + 120 × `a` + ` Amman`) → no horizontal scroll at 375 px (`scrollWidth === 375`).
  - The test run passes. Run the E8 gate.
- [ ] **Step 4: Commit**, `git add public && git commit -m "Harden: long titles, load/offline error states on plan, check, fixed"`

### Task E5: Adapt (responsive)

Estimated: 20 min.

- [ ] **Step 1:** Type `/impeccable adapt public/check.html public/fixed.html public/build.html`. Name the widths 375, 390 and 768, the sticky CTA from A5, and the Days/Map tabs on check (CLAUDE.md §6b: the map is its own tab on mobile).
- [ ] **Step 2: Accept** fixes for overflow, cramped spacing, tap-target size and sticky-bar overlap. **Reject** removing the Days/Map tabs, moving the map beside the days on phones, or hiding content.
- [ ] **Step 3: Verify**, Playwright `browser_resize` 375×812 and 768×1024. `browser_take_screenshot` of the three pages at both widths, saved under `.playwright-mcp/e5/`. `() => document.documentElement.scrollWidth === innerWidth` → `true` on each. The sticky bar never covers the last card. Run the E8 gate.
- [ ] **Step 4: Commit**, `git add public && git commit -m "Responsive: 375/390/768 fixes on check, fixed, build"`

### Task E6: Audit (a11y / perf / responsive)

Estimated: 20 min.

- [ ] **Step 1:** Type `/impeccable audit public`.
- [ ] **Step 2:** Compare with `.superpowers/sdd/BUILD_PLAN/reports/audit-perf-a11y-seo.md`. Fix only regressions (new since that report) and leftovers the plan didn't cover. Anything already assigned to a task (A6 CLS, A7 contrast, B1 SEO, B5 PWA, B8 fonts, C5 tap targets) is skipped.
- [ ] **Step 3: Verify**, chrome-devtools `lighthouse_audit` mobile on `/`, `/plan.html`, `/check.html?t=<id>`, `/fixed.html?t=<id>`: accessibility ≥ the audit's numbers (95–96) with no `color-contrast` failures; SEO 100. Run the E8 gate.
- [ ] **Step 4: Commit**, `git add public && git commit -m "Audit follow-ups: a11y and responsive leftovers"`

### Task E7: Micro-interactions

Estimated: 25 min.

- [ ] **Step 1:** Invoke the skill `ecc:make-interfaces-feel-better` on the check → fixed flow (`public/js/pages/check.js`, `public/js/pages/fixed.js`, `public/css/app.css`, `public/css/pages/check.css`).
- [ ] **Step 2: Accept only:**
  - button press feedback (`:active` scale ≤ 0.98),
  - a score-ring count-up on /check and /fixed (text only, ≤ 600 ms, final number in the DOM from the start for screen readers and `aria-label`),
  - a fix-card selection transition,
  - the toast enter/exit.

  Every animation or transition must sit inside `@media (prefers-reduced-motion: no-preference)` or be disabled under `@media (prefers-reduced-motion: reduce)`. **Reject** layout motion (height or position animations of cards), parallax and scroll-jacking.
- [ ] **Step 3: Verify**, chrome-devtools `emulate` with reduced motion → no animation runs, and the score shows its final value immediately. The CLS script from A6 on /fixed stays < 0.1. The test run passes. Run the E8 gate.
- [ ] **Step 4: Commit**, `git add public && git commit -m "Micro-interactions on check → fixed (reduced-motion safe)"`

### Task E8: Impeccable gate (added as a step to every UI task)

Estimated: 2 min per UI task (included in each task's time).

This is not a separate task. The step below is added to A5, A6, A7, B1, B5, B8, C1–C7, and ends every E task:

```bash
~/.claude/skills/impeccable/scripts/impeccable detect --json <the html/css files changed in this task>
```

Expected output: only `"antipattern": "overused-font"` with `"snippet": "Primary font: plus jakarta sans"`. That warning is accepted: the font is mandated by the Figma screens and CLAUDE.md §2. **Zero** `low-contrast` findings from Task A7 on. Any other finding: fix it if it is a refinement, or note it as `reject (rule 4)` in `docs/design/critique-2026-09-30.md`.

---

## Deliberately left out (from the audits)

- **Lazy Firebase Auth / third-party cookies (perf H3), versioned immutable caching (perf M3):** touch `firebase-init.js`/`firebase.json` on every page; high regression risk on deadline day for a Best-Practices score.
- **Firebase Analytics, App Check, Remote Config, OSRM, Nominatim, Wikipedia, Leaflet, QR, Arabic UI (services tier B/after):** new dependencies or console steps; App Check enforcement can take the site down.
- **`travelers` and `budget` not used in costs (engine F2), SEASON fix + clock-time buckets (P9/R5), `LONG_DRIVE` for car trips (R6), trailing-prose cut (P7), inline `Day 1: … Day 2:` (P8), `Day one` words (P6), "Bus back to Amman" returns (P12), per-day DAY_OVERLOAD text (F2/R7), fallback 150-min driver label (F5):** real, but each changes engine output broadly; the controller's A-list covers the high-severity parser/rule items first.
- **Build-a-plan geographic ordering (UX #4) and "Fix all makes it costlier" guardrail (UX 04):** larger builder/fixer redesigns; A2 + A3 remove the main causes (phantom depart leg, full-day places on day 1).
- **Nav active state/scroll-spy, CSV filename, admin reset-password, static nav/footer HTML, JSON-LD upgrades, print footer, reduced-motion global rule:** low severity.
