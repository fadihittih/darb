# Build plan, Claude Code prompts (in order)

Deadline **30 Sep, 22:00**. Aim to be feature-complete by **18:00**, then only test, fix and submit.
Run Claude Code from the repo root (`~/Projects/darb`). It reads `CLAUDE.md` automatically.
After **every** step: open the page, click through it, then `firebase deploy --only hosting && git add -A && git commit -m "..." && git push`.

Tip: start each prompt fresh with `/clear` if the context gets long, CLAUDE.md carries the spec.

---

### Step 1, Engine + tests (≈1.5 h) · most important
> Read CLAUDE.md sections 3, 4 and 6. Build `public/js/engine/geo.js`, `parser.js`, `rules.js`, `fixer.js`, `pass.js` as pure ES modules (no DOM, no Firebase), and `public/js/data.js` that loads places/legs/config from Firestore with a localStorage cache and a fallback to `/data/*.json`. Then build `public/tests.html` that runs the reference example from section 6 and asserts: parse = 5 days with the right placeIds; score 58; Day 3 nf; Day 4 risky; fixed score 94; Jordan Pass savings ≈ 33 JOD. Add 4 more cases (with a car → no transport issues; 2-day trip → Pass doesn't pay off; summer Dead Sea afternoon → SEASON risky; Petra only on one day with Wadi Rum → PETRA_TOO_SHORT). Show green/red results on the page. Iterate until all pass.

### Step 2, Shared UI + Landing (≈1 h)
> Build `public/css/app.css` and `public/js/ui/` (nav, stepper, status pill, day card, modal, toast, inline SVG icon set) following CLAUDE.md section 2 and `docs/design/01-landing.png`. Then build `index.html` (01 Landing) exactly like the design. The hero card on the right must run Sarah's example through the real engine. Responsive down to 375 px.

### Step 3, Input → Reality Check (≈2 h)
> Build `plan.html` (02, `docs/design/02-input.png`) and `check.html` (03, `docs/design/03-reality-check.png`) plus `public/js/store.js` (saveTrip with a 12-char random id, loadTrip, logEvent) following CLAUDE.md section 5. Flow: parse preview → Check my plan → save trip + log `check` event → check.html?t=id. Include the SVG route map (`js/map.js`), the Jordan Pass card and the Fix all card. Choosing a fix card selects it; Fix all saves a new trip with parentId and logs a `fix` event.

### Step 4, Fixed plan + Save & Share + Leg detail (≈2 h)
> Build `fixed.html` (04), the Save & Share modal (06), `leg.html` (05) and `trip.html` for `/t/<id>` following CLAUDE.md section 5 and the matching design PNGs. Include `js/ics.js` (.ics with one all-day event per day + one timed event per leg, 45-min VALARM, "If you're late" alternative), Google Calendar link, print stylesheet for Download PDF, `js/weather.js` (seasonal + Open-Meteo when startDate ≤ 7 days away), and `sw.js` for Save offline.

### Step 5, Build a plan (≈1.5 h)
> Build `build.html` (07, `docs/design/07-build-plan.png`) per CLAUDE.md section 5: interest chips, settings, place cards with Fits your trip / Needs +1 day or a car / Hidden gem, the live "Your plan so far" panel with draft score and inline warnings from the rules engine, Build my plan → save + `build` event → check.html.

### Step 6, Ministry dashboard + Admin (≈1.5 h)
> Build `dashboard.html` (08) with the Demo / Live toggle and CSV export, and `admin.html` (Firebase Auth email/password, data-owner allowlist, edit legs, write operatorUpdates) per CLAUDE.md section 5. Live mode aggregates the `events` collection and computes data freshness from legs' verifiedOn.

### Step 7, Destinations + polish (≈45 min)
> Build `destinations.html`: one card per place with verified facts only (e.g. "Amman → Petra by bus: 06:30, 4 h, 10 JOD, verified 24 Sep 2026"), each with a `FAQPage`/`TouristAttraction` JSON-LD block. Then do a polish pass on every page: meta descriptions, favicon (rose dot SVG), 404.html, focus styles, mobile layout at 375 px, no console errors.

### Step 8, Final check (≈45 min), before 20:00
> Walk every flow on the LIVE url (https://darb-pixelsdev.web.app) in a private window: landing → paste example → check (58) → fix all (94) → save & share (copy link, .ics, PDF) → open /t/<id> in another browser → build a plan → dashboard demo/live → admin login. Fix anything broken. Update README.md (live link, features, how Firebase is used, how to run). Make sure the GitHub repo is public.

### Submit (team lead only, once), before 21:30
Submission form: https://docs.google.com/forms/d/e/1FAIpQLSdMNvVWqMiKohtEyZgNJbRJCEHTbD_3wX5AwRYOGTVxnHDWjw/viewform
- GitHub: the public repo URL (team account)
- Live: https://darb-pixelsdev.web.app

---

## If time runs out, cut in this order (last = keep no matter what)
1. destinations.html → 2. admin.html (keep a screenshot + the rules) → 3. live weather (keep seasonal) → 4. Build-a-plan warnings → **never cut**: Paste → Check → Fix all → Fixed plan → Share link, and the Dashboard.

## 10-minute judging meeting, talking points
- Problem: AI/blog itineraries break on Jordan's roads (Wadi Rum not bookable on JETT; Jerash + Dead Sea in one afternoon).
- Demo: paste → 58 → Fix all → 94 → share link / calendar.
- Firebase: Hosting, Firestore (reference data, private-by-link trips, anonymous events), Auth (data owners), security rules.
- Three loops: traveler · Ministry dashboard (Tourism MIS, Strategy 2021–2025 p.19) · data owners update their own data.
- Stack changed from the Phase 1 doc (Node/Supabase) to Firebase because Phase 2 requires it, same logic, same screens.
- Honesty: verified vs est. prices, demo data labelled.
