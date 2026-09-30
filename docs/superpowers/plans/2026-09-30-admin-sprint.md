# Darb admin sprint (data-owner panel) — implementation plan

**Goal:** ship the first admin sprint from `docs/HANDOVER.md` ("Admin panel — current state and backlog"): backlog items
#2, #3, #5, #4, #1, #7, #8 (plus #6, see Rulings), without touching the traveller flow, before the 22:00 (Amman)
submission on 30 Sep 2026. A smaller thing that works beats a bigger thing that breaks.

**Spec:** `<repo>/CLAUDE.md` (hard rules §0, conventions §7) and `docs/HANDOVER.md` lines 502–644 (what `/admin` does
today, what it cannot do, the rules that constrain it, the backlog rows). Read those HANDOVER lines before coding.

**Architecture:** plain ES modules served from `public/`, no build step. `/admin` = `public/admin.html` +
`public/js/pages/admin.js` + `public/css/pages/admin.css`. Firebase SDK is imported lazily from
`https://www.gstatic.com/firebasejs/11.0.2/…`. Engine-style pure logic is tested in Node through
`public/js/test-cases.js` (`runCases`), which `scripts/run-tests.mjs` and `/tests.html` both run.

## Global Constraints

1. Only HTML, CSS, JavaScript and Firebase. No framework, no TypeScript, no bundler, no npm package in `public/`.
   Firebase SDK only from gstatic 11.0.2. `scripts/*.mjs` are dev-only Node (built-in modules only).
2. No institution name and no member names anywhere in the site or repo (code, comments, docs, commit messages).
   Commit messages carry no attribution or co-author lines.
3. Honesty in data: a ✓ / "verified" only for `status: "verified"` with a source, a date and a method. Never invent a
   schedule, a price or a source.
4. UI: colours only through `public/css/tokens.css` variables (no hex outside tokens), no emoji, buttons are
   `<button>`, visible focus, colour is never the only signal, works at 375 px wide. Match the comment density and idiom
   of the file you are in.
5. The reference example is sacred: 58 → Fix all → 94, Jordan Pass Explorer 75 vs 116 → save ~41. Every task ends with
   `node scripts/run-tests.mjs` green (it prints `N / N passed · data check ok`).
6. **Who runs what:** implementers never run `firebase deploy`, `git push`, or a writing seed (`node scripts/seed.mjs`
   with no args, `--merge`, `--force`, `admin …`). Those are CONTROLLER steps. Implementers never write to the live
   Firestore project in any way.
7. **File ownership:** touch only the files your task lists. `public/sw.js`, `docs/HANDOVER.md`, `CLAUDE.md` and
   `README.md` belong to the controller. Commit only your own files, by explicit path
   (`git add <paths> && git commit -m "…" -- <paths>`); another agent may be committing in the same tree, so never
   `git add -A`, never stash, never reset, and retry once if `index.lock` is busy.
8. `/admin?debug=1` must keep working without sign-in: it renders the seed JSON read-only and never writes. Every new
   admin feature must render sensibly there (inputs and Save disabled), because that is how reviewers see the panel.

## Rulings made before dispatch

- Work happens on `main` (the project's recorded process: deploy and push after each milestone).
- Tasks 1 and 2 run in parallel: they share no file. Tasks 3 and 4 run after Task 1, in sequence (all edit `admin.js`).
- Backlog #6 (`source` text follows `sourceUrl` and date) is folded into Task 1: once owners refresh dates (#3), a stale
  "checked 24 Sep 2026" sentence beside a new date would break the honesty rule.
- `operatorUpdates.from` / `to` stay human-readable strings (unchanged, so the dashboard keeps working); the
  machine-readable values are added as `fromValue` / `toValue`.
- A Verified-on date in the future is an **error** for `status: "verified"`; a date older than 90 days is a
  non-blocking **warning** ("travellers will see est.").
- History uses a composite index, with a client-side fallback when the index is not ready.

---

## Task 1: Admin core — pure validator with tests (#2), decimal fares + machine-readable log (#5), source text (#6), freshness (#3), concurrency guard (#4)

**Files you own:** `public/js/admin-validate.js` (new), `public/js/pages/admin.js`, `public/css/pages/admin.css`,
`public/js/test-cases.js` (append cases at the end of `runCases`, before `return results`).
`public/js/pages/dashboard.js` reads only `operator` and `at` from `operatorUpdates` — do not change it.

### 1a. `public/js/admin-validate.js` (pure: no DOM, no Firebase; may import from `./engine/model.js`)

Exports:

- `METHODS` = `["web","phone","field","whatsapp","operator","web-est"]`, `VERIFIED_METHODS` = `["web","phone","field","operator"]`
  (move them out of `admin.js`; same lists as `scripts/check-data.mjs`).
- `validateOption(old, input, today)`.
  - `old` = the stored option object. `input` = trimmed strings
    `{ costMin, costMax, departs, status, verifiedOn, notes, source, sourceUrl, method }`. `today` = `"YYYY-MM-DD"`.
  - Returns `{ error }` (one sentence, prefixed with `old.label + ": "`, same wording as today's `collect()`), or
    `{ option, changes, warnings }`.
  - Rules (keep every rule `collect()` has today): both costs or neither; finite, ≥ 0, min ≤ max; empty pair →
    `cost: null`; decimals such as `0.95` and `1.10` are valid; `departs` matches `^([01]\d|2[0-3]):[0-5]\d$`;
    `status` is `verified` or `est`; `verified` needs a Verified-on date, an `https://` source URL and a method in
    `VERIFIED_METHODS`; a source URL, if present, must be `https://…`; method, if present, must be in `METHODS`;
    empty optional fields are deleted from the option (not stored as `""`).
  - New: `verifiedOn` must be a real `YYYY-MM-DD` date; with `status: "verified"` a date after `today` is an error
    ("… Verified-on can’t be in the future.").
  - New: `source` (free text, max 200 chars) is editable and stored like `notes`.
  - `warnings` (array of sentences, non-blocking):
    - `verified` and the date is more than `STALE_DAYS` (90) days before `today` → "… was verified more than 90 days
      ago — travellers will see it as est. until it is re-checked."
    - `verifiedOn` or `sourceUrl` changed while a non-empty `source` text stayed the same → "… the Source text still
      reads “<source>” — update it so it matches the new date or URL."
  - `changes` = one entry per changed field among `cost, departs, status, verifiedOn, notes, source, sourceUrl, method`:
    `{ field, from, to, fromValue, toValue }`. `from` / `to` are the display strings used today (cost as `"20–25"` with
    an en dash, empty as `""`). `fromValue` / `toValue` are JSON-safe: cost is `[min, max]` or `null`; every other field
    is the string or `null` when absent.
- `freshness(o, today)` → `{ state, days, left, text }` for an option or a ticket:
  - `state: "est"` when `status !== "verified"` (text `"est."`);
  - `"future"` when the date is after `today` (text `"date is in the future"`);
  - `"stale"` when older than 90 days or the date is missing (text `"stale — shown as est."`);
  - `"expiring"` when ≤ 30 days are left (text `"verified 75 d ago · expires in 15 d"`);
  - `"fresh"` otherwise (same text pattern). `days` = age in days, `left` = `90 − days`.
  - Reuse `daysSince` / `STALE_DAYS` from `engine/model.js`; do not duplicate the 90.
- `sameData(a, b)` → deep equality that ignores object key order (Firestore does not keep map key order). Used by the
  concurrency guard.

### 1b. Tests (append to `runCases`; they must run in Node and in `/tests.html`)

At least these cases, each with several `expect`s: a valid edit (cost change gives `from "10–10"`-style strings and
`fromValue`/`toValue` arrays); decimal fares `0.95` and `1.10` accepted; one cost without the other; min > max; bad
`departs`; `verified` without date / without https URL / with `whatsapp`; future date rejected; stale date gives a
warning but no error; source-text warning; unchanged input gives `changes: []`; empty optional fields are removed from
the option; `freshness` for each state; `sameData` with reordered keys and with a real difference.
Write the tests first, watch them fail, then implement.

### 1c. `admin.js`

- `collect(leg)` keeps only the DOM reading (`badInput` check included) and calls `validateOption` per option; it
  returns `{ options, changes, warnings }` or `{ error }`. Each change keeps `operator` and
  `field: "options[i].<field>"` as today.
- Cost inputs: `step="any"` (0.95 and 1.10 must not be flagged invalid by the browser).
- New column **Source** (text input, `maxlength="200"`, `data-f="source"`) next to Source URL.
- Freshness: a badge per option (`freshness().text`) near Verified on, with a class per state and a text prefix so
  colour is not the only signal; a header line above the leg cards, e.g. "3 values expire in the next 30 days · 1 stale";
  a "Sort" select: `Route (A–Z)` / `Soonest expiry` (legs with the soonest-expiring verified option first; legs with no
  verified option last). Re-sorting must not lose unsaved input silently: either keep the DOM nodes and reorder them, or
  disable the sort while a form is dirty.
- Warnings from `collect()` are shown in a `role="status"` paragraph under the Save button (not the error paragraph)
  and do not block the save.
- "Today" for the page is the current date in `Asia/Amman` (`YYYY-MM-DD`); look in `engine/format.js` for an existing
  helper before writing one.
- Save with a concurrency guard: replace the `writeBatch` with `runTransaction`: read `legs/<id>`; if it is missing or
  `!sameData(live.options, leg.options)` (the snapshot the form was built from), abort and show
  "This leg changed since you opened it — reload the page to see the latest, then redo your edit." Otherwise
  `tx.update(legs/<id>, { options })` and `tx.set(operatorUpdates/<auto>, { operator, legId, field, from, to, fromValue,
  toValue, by, at: serverTimestamp() })` per change — still atomic. After success update the cached snapshot and the
  freshness badges / header.
- Keep the structure easy to extend: Task 3 adds a "Site tickets" section and Task 4 a History disclosure per card.
  Put the save-with-log transaction in one function that takes the doc ref, a guard and the list of log entries, so
  Task 3 can reuse it.

### 1d. Verify

`node scripts/run-tests.mjs` green. Then in a real browser (Playwright or chrome-devtools MCP; serve with
`python3 -m http.server -d public 8101`, stop it when done): open `http://localhost:8101/admin.html?debug=1`, confirm
the leg cards render with badges, header count and sort, no console errors, and the layout holds at 375 px. The
signed-in save path cannot be exercised (no credentials): read that code twice instead and say so in the report.

---

## Task 2: `scripts/seed.mjs` — diff, pull, merge (#1)

**Files you own:** `scripts/seed.mjs`, `scripts/seed-lib.mjs` (new, pure helpers), `scripts/test-seed.mjs` (new),
`scripts/run-tests.mjs` (only to call the new test file so CI runs it).

Today `node scripts/seed.mjs` overwrites whole docs in `places`, `legs`, `config/{airports,jordanPass,demoStats}` and
erases data-owner edits made in `/admin` (`legs/<id>.options` today; `places/<id>.ticket` after Task 3). Owner edits
are logged in `operatorUpdates` docs: `{ operator, legId, placeId?, field, from, to, by, at }` where `field` looks like
`options[0].cost` (legs) or `ticket.jod` (places, `legId: ""`, `placeId` set).

### 2a. `scripts/seed-lib.mjs` (pure, no network, no fs)

- `toValue(v)` (moved from `seed.mjs`) and `fromValue(v)` (its inverse for the Firestore REST encoding: `nullValue`,
  `booleanValue`, `integerValue` (string → Number), `doubleValue`, `stringValue`, `timestampValue` (keep the ISO
  string), `arrayValue` (missing `values` → `[]`), `mapValue` (missing `fields` → `{}`)).
- `diffDoc(json, live)` → list of `{ path, json, live }` for every leaf that differs (`options[0].cost[1]`,
  `ticket.jod`, a key present on one side only). Key order never counts; `10` equals `10.0`.
- `ownerFields(updates)` → `Map<"legs/<id>" | "places/<id>", Set<topLevelField>>` from `operatorUpdates` docs
  (`options[…]…` → `options`, `ticket.…` → `ticket`).
- `mergeInto(jsonDoc, liveDoc)` for `pull`: the live doc's values, written with the JSON doc's key order first and any
  new keys after, recursively, so the git diff of the JSON stays small.

### 2b. Commands

- `node scripts/seed.mjs diff` — read-only. Reads the live docs the seed would write, plus `operatorUpdates`, and
  prints every differing path per doc, docs missing live, live `legs` / `places` docs that are not in the JSON, and
  which differing docs have owner edits. Ends with a one-line summary. `places`, `legs`, `config` and
  `operatorUpdates` are publicly readable, so `diff` and `pull` use unauthenticated REST `GET`s (paginate with
  `pageToken`) and must work without `firebase login`.
- `node scripts/seed.mjs pull` — writes live `legs` into `legs.json` and live `places` into `places.json` (only the
  `legs` / `places` arrays; every other top-level key of the files stays untouched; array order follows the JSON, new
  live docs are appended; 2-space indentation and a trailing newline, matching the current files — check how the
  existing files format short arrays such as `"cost": [10, 10]` and keep the diff minimal). The data directory is
  `public/data`, or `DARB_DATA_DIR` when set (the same variable `scripts/check-data.mjs` uses). Prints the follow-up:
  run `node scripts/render-destinations.mjs` and `node scripts/run-tests.mjs`, then commit.
- `node scripts/seed.mjs` (no args) — now **refuses** (exit 1, nothing written) when a live doc has owner-edited
  fields that differ from the JSON; it lists them and names the three ways out (`pull`, `--merge`, `--force`).
  With no such doc it writes everything as before.
- `node scripts/seed.mjs --merge` — writes everything, but for a doc with owner-edited fields it sends an
  `updateMask` listing every top-level JSON field **except** the owner-edited ones (`options`, `ticket`), so those stay
  as the owner left them. Prints what was kept.
- `node scripts/seed.mjs --force` — the old behaviour, after printing which owner edits it is about to overwrite.
- `--dry-run` with any writing form: print the writes (doc path + mask) and commit nothing.
- `admin <email>` stays as it is. Fetch the CLI token only for commands that write.
- Never delete a document. Update the usage comment at the top of the file.

### 2c. Tests and verification

- `scripts/test-seed.mjs`: `toValue` / `fromValue` round-trip (nested maps, arrays, null, integers, decimals such as
  1.1 and 0.95), `diffDoc` (equal docs with different key order → `[]`; a changed cost; a missing key), `ownerFields`,
  `mergeInto` key order. Plain `node:assert`, exit 1 on failure, one summary line. Hook it into `scripts/run-tests.mjs`
  so the existing summary line and exit code still work.
- Allowed against the live project: `node scripts/seed.mjs diff`; `pull` with `DARB_DATA_DIR` pointing at a temporary
  copy of `public/data` (then `diff` the copy against the original — on an un-edited project the files must come back
  byte-identical, or explain every difference); `--dry-run`.
- **Forbidden:** any command that writes to Firestore (no-arg seed, `--merge`, `--force`, `admin`) and any `pull`
  that writes into `public/data`.

---

## Task 3: Site ticket editing (#7)

**Depends on Task 1.** **Files you own:** `public/js/pages/admin-tickets.js` (new), `public/js/pages/admin.js`,
`public/js/admin-validate.js`, `public/admin.html`, `public/css/pages/admin.css`, `public/js/test-cases.js` (append).

- New section "Site tickets" on `/admin` below the legs (`<section id="tickets" class="stack">`, its own `h2`; give the
  legs section an `h2` "Transport legs" too). One card per place (12), sorted by name, with the fields of
  `places/<id>.ticket`: `label` (read-only text), `jod` (number, `step="any"`, empty = `null` = price unknown),
  `status` (verified / est.), `verifiedOn`, `source`, `sourceUrl`, `method`, `notes`. Show `coveredByJordanPass` as
  read-only text ("Covered by the Jordan Pass" / "Not covered").
- `validateTicket(old, input, today)` in `admin-validate.js`, same contract as `validateOption`
  (`{ ticket, changes, warnings } | { error }`), same verified rules, same warnings, same freshness badge. `jod` must be
  a finite number ≥ 0 or empty. Changes carry `field` names (`jod`, `status`, …) and `fromValue` / `toValue`. Tests for
  it in `test-cases.js`.
- Save through the Task 1 transaction helper: guard on `sameData(live.ticket, snapshot.ticket)`; `update(places/<id>,
  { ticket })`; one `operatorUpdates` doc per change:
  `{ operator, legId: "", placeId, field: "ticket.<field>", from, to, fromValue, toValue, by, at }` (`operator` = the
  signed-in email's domain, as the legs editor does when an option has no `operator`).
- A visible note at the top of the section: ticket prices feed the Jordan Pass card ("Bought separately") — a change
  here changes what travellers see within 6 hours.
- The header freshness count from Task 1 should cover tickets too (one combined line, or one line per section).
- `?debug=1`: render the section from `/data/places.json`, read-only.
- The rules already allow admin writes to `places`. Do not change `firestore.rules`.
- Verify like Task 1d, on port 8103.

---

## Task 4: Change history per leg / place, with revert (#8)

**Depends on Tasks 1 and 3.** **Files you own:** `public/js/pages/admin-history.js` (new), `public/js/pages/admin.js`,
`public/js/pages/admin-tickets.js`, `public/js/admin-validate.js`, `public/css/pages/admin.css`,
`public/js/test-cases.js` (append), `firestore.indexes.json`.

- A "History" `<details>` inside every leg card and every ticket card, loaded lazily on first open:
  `query(collection(db, "operatorUpdates"), where("legId", "==", id), orderBy("at", "desc"), limit(50))`
  (`where("placeId", "==", id)` for places).
- `firestore.indexes.json`: two composite indexes on collection `operatorUpdates`, query scope `COLLECTION`:
  (`legId` ASCENDING, `at` DESCENDING) and (`placeId` ASCENDING, `at` DESCENDING). The controller deploys them.
- If the ordered query fails with `failed-precondition` (index still building or not deployed), fall back to the
  equality-only query, sort by `at` descending in the client and keep 50.
- Each row: date (`fmtDate`-style "30 Sep" plus the time), who (`by`), what (a readable label: option label + field for
  legs, field for tickets), `from → to`. Empty state "No changes recorded yet." Error state "Couldn’t load the history."
- **Revert** button on rows that carry `fromValue` (rows written before Task 1 have none — no button). It only
  pre-fills the matching form input(s) with `fromValue` (cost → both inputs; `null` → empty), marks nothing as saved,
  scrolls the field into view and shows the toast "Form filled with the earlier value — review it and press Save".
  The normal Save then validates and logs the revert like any other edit.
- Pure helpers in `admin-validate.js`, with tests: `parseUpdateField("options[2].cost")` →
  `{ kind: "option", index: 2, field: "cost" }`, `"ticket.jod"` → `{ kind: "ticket", field: "jod" }`, anything else →
  `null`; `revertInputs(update)` → the `{ inputName: string }` map to put into the form (e.g.
  `{ costMin: "20", costMax: "25" }`, `{ departs: "" }`), or `null` when the row cannot be reverted.
- After a successful Save, refresh an open History for that card.
- `?debug=1`: `operatorUpdates` is publicly readable, so History loads there too; Revert is disabled.
- Verify like Task 1d, on port 8104.

---

## Task 5: CONTROLLER — ship

- `public/sw.js`: bump `SHELL`, add `/js/admin-validate.js` to the `JS-LIST` (it is imported by `test-cases.js`).
- Docs: `docs/HANDOVER.md` (state line, admin section, backlog status, test count), `CLAUDE.md` file list.
- `node scripts/run-tests.mjs`, `node scripts/check-contrast.mjs`, browser check of `/admin?debug=1`.
- `firebase deploy --only hosting`, `firebase deploy --only firestore:indexes`, `git push`.

---

## Task 6: Redesign `/admin` as a data-owner console (master–detail, overview visuals)

**Why.** The owner rejected the current page: after sign-in it is one long column of 28 collapsed cards (16 legs,
12 tickets) stacked on top of each other, each opening into a ten-column table that scrolls sideways. Nothing tells a
data owner what needs attention, there is no overview and no visual. It reads like a raw list, not a professional tool.
Every behaviour below the surface is fine and stays: this task changes presentation and navigation only.

**Files you own:** `public/admin.html`, `public/css/pages/admin.css`, `public/js/pages/admin.js`,
`public/js/pages/admin-common.js`, `public/js/pages/admin-tickets.js`, `public/js/pages/admin-history.js`, and new
modules under `public/js/pages/admin-*.js` if they keep files focused (for example `admin-overview.js`,
`admin-activity.js`). You may **import** (not edit) `public/js/ui/icons.js` (`icon`, `modeIcon`, `placeIcon`),
`public/js/map.js` (`JORDAN_OUTLINE`, and read how `routeMap` projects lat/lng), `public/js/engine/format.js`,
`public/js/engine/model.js`, `public/js/data.js`. Do not edit `public/css/app.css`, `public/css/tokens.css`,
`public/js/admin-validate.js` (unless a pure helper is genuinely needed — then add a test), `public/sw.js`, any other
page, the engine, or docs.

### Must not change (behaviour contract)

- Validation through `validateOption` / `validateTicket`; errors shown next to Save, warnings non-blocking ("Check: …").
- Save through `saveWithLog` (transaction + guard + one `operatorUpdates` doc per changed field, same fields as today);
  the "changed since you opened it" message; "No changes to save"; success toasts; the `darb:saved` event.
- Freshness states and texts from `freshness()`; History per leg / ticket with the ordered query, the fallback, the
  empty and error states; Revert fills the form only and never saves.
- Every editable field that exists today stays editable (options: cost min / max, departs, status, verified on, notes,
  source, source URL, method; tickets: price, status, verified on, method, source, source URL, notes). Read-only facts
  stay visible (option label and operator, ticket label, Jordan Pass coverage, the Petra line, the tickets note).
- `?debug=1`: no sign-in, seed JSON, every input and Save disabled, nothing written; History readable; Revert disabled.
- Sign-in card, gate ("Your account isn’t a data owner yet."), sign-out, auth error messages.
- Signed-out visitors see only the title, one line of explanation and the sign-in card — no data.

### The new information architecture

1. **Overview strip** (top, once data is loaded): four stat tiles in the style of the Ministry dashboard KPIs
   (`public/css/pages/dashboard.css` — copy the visual language into `admin.css`, do not import that file):
   "Values you maintain" (options + tickets), "Verified" (count and share), "Expiring within 30 days",
   "Stale or undated". Under or beside them one **freshness bar**: a single stacked horizontal bar
   (fresh / expiring / stale / est.) with a legend that carries the numbers as text, so colour is not the only signal.
   Tiles and bar update after a save.
2. **Section switch**: a segmented control — `Transport legs (16)` · `Site tickets (12)` · `Recent changes` — built as
   real tabs (`role="tablist"`, arrow keys, `aria-selected`). One section visible at a time.
3. **Master–detail** for legs and for tickets (desktop ≥ 900 px: list about 36 %, detail about 64 %, both inside the
   1200 px container; the list column scrolls on its own and stays in view while the detail scrolls):
   - **List**: a search input ("Search a route or a site"), filter chips (`All`, `Verified`, `Expiring`, `Stale`,
     `Estimates only`) with counts, and the existing sort (Route A–Z / Soonest expiry). Each row is a button:
     mode or place icon, title ("Amman → Petra"), one line of meta ("scheduled · 3 options · 1 verified"), and on the
     right a status pill for the row's worst state (✓ verified / ! expiring / ✕ stale / est.) plus a thin 90-day
     meter for the soonest-expiring verified value. The selected row is clearly marked (not by colour alone). A row
     with unsaved input shows an "Edited" marker. An empty search result shows a short message and a Clear button.
   - **Detail**: header with the title, a small **route map** (inline SVG: the Jordan outline from `JORDAN_OUTLINE`
     with the leg's two places joined by a line, or the site's pin for a ticket; decorative, `aria-hidden`, with the
     places named in text next to it), public-transport badge and drive time for legs, Jordan Pass coverage for
     tickets. Then **one card per option** instead of the wide table: card head = mode icon, option label, operator
     chip, freshness badge with a 90-day progress meter; body = a labelled field grid in three groups, "Price",
     "Schedule" (legs only), "Evidence" (status, verified on, method, source, source URL) and "Notes". No horizontal
     scrolling at any width. Then a **save bar** for the item (primary "Save changes", the error and warning lines, an
     "Unsaved changes" hint when the form differs from the stored data) that stays reachable without scrolling back up
     (sticky at the bottom of the detail column on desktop; normal flow on mobile). Then **History** as a vertical
     timeline (date, who, what, from → to, Revert).
   - Selecting another row must not lose unsaved input: build an item's detail once and keep it in the DOM (hidden)
     when another item is selected.
   - The first item is selected by default on desktop. The selection is reflected in the URL hash
     (`#leg=amman-petra`, `#ticket=petra`) and restored on load.
   - **Mobile (< 900 px)**: the list fills the width; choosing a row shows the detail in its place with a
     "← All routes" / "← All sites" button on top; the overview strip becomes a 2 × 2 grid. Must work at 375 px.
4. **Recent changes**: the latest 30 `operatorUpdates` across everything
   (`query(collection(db, "operatorUpdates"), orderBy("at", "desc"), limit(30))`, a single-field order that needs no
   composite index) as a timeline grouped by day: time, who, the leg or site name, the field, from → to. Clicking an
   entry opens that leg or ticket. Empty state: "No changes recorded yet — every saved edit appears here and on the
   Ministry dashboard." It is public data, so it also loads in `?debug=1`.

### Visual and quality bar

- Darb's design system only: Plus Jakarta Sans, tokens from `public/css/tokens.css` (no hex values, no new fonts),
  white cards with the 16 px radius, 1 px `--line` border and soft shadow on the `--sand` page, status colours with
  their ✓ ! ✕ glyphs, monochrome inline SVG icons in `--ink`, no emoji, rose only for the primary action.
  It must look like the same product as `dashboard.html`, `check.html` and `leg.html` — open them for reference.
- Clear hierarchy: one `h1`, section headings in order, generous spacing, no wall of inputs. Labels above inputs,
  help text where a field is not obvious (for example "Verified on — the day someone checked the source").
- Accessibility: every input labelled, visible focus, tabs and list operable by keyboard, status changes announced
  (`role="status"` regions that exist before their text changes), 44 px touch targets on mobile, contrast through the
  text tokens (`--amber-text`, `--green-text`, `--rose-text`, `--red-text`).
- No layout shift when switching items; no console errors; nothing scrolls sideways at 375, 768 or 1280 px.

### Verify

- `node scripts/run-tests.mjs` green.
- Real browser (chrome-devtools MCP, isolated context, `python3 -m http.server -d public 8106`,
  `http://localhost:8106/admin.html?debug=1`): every section, selection, search, each filter, the sort, hash restore,
  History, the mobile list → detail → back flow, keyboard navigation of the tabs. Save screenshots (PNG) to
  `/private/tmp/claude-502/-Users-fadi-dev-darb/03b2543a-804f-4701-b84a-f4d9d16179bd/scratchpad/admin-shots/`:
  `desktop-legs.png`, `desktop-tickets.png`, `desktop-changes.png` at 1280 px wide, `mobile-list.png` and
  `mobile-detail.png` at 375 px. Look at them yourself and fix what looks off before reporting.
- Also load `http://localhost:8106/admin.html` (signed out) and confirm only the sign-in card shows. Do not sign in:
  the controller tests the signed-in flow with a test account after your report, so the signed-in render path must be
  the same code as the debug path apart from the disabled state.
